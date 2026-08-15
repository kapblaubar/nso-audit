import { ClientAssertionCredential, ManagedIdentityCredential } from "@azure/identity";

export interface AccessCheckResult {
  tenantAccess: { ok: boolean; message: string };
  resourceReader: { ok: boolean; message: string };
  securityReader: { ok: boolean; message: string };
  ready: boolean;
}

export interface StarterFinding { checkId: string; title: string; status: "pass" | "warning"; detail: string; evidence?: unknown }

function customerCredential(tenantId: string): ClientAssertionCredential {
  const appClientId = process.env.ENTRA_CLIENT_ID;
  const managedIdentityClientId = process.env.AZURE_CLIENT_ID;
  if (!appClientId || !managedIdentityClientId) throw new Error("Workload identity is not configured.");
  const managedIdentity = new ManagedIdentityCredential({ clientId: managedIdentityClientId });
  return new ClientAssertionCredential(tenantId, appClientId, async () => {
    const assertion = await managedIdentity.getToken("api://AzureADTokenExchange/.default");
    if (!assertion) throw new Error("Managed identity assertion was unavailable.");
    return assertion.token;
  });
}

async function call(url: string, token: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  return { ok: response.ok, status: response.status };
}

export async function checkCustomerAccess(tenantId: string, subscriptionId: string): Promise<AccessCheckResult> {
  const credential = customerCredential(tenantId);

  let graph = { ok: false, status: 0 };
  let resources = { ok: false, status: 0 };
  let security = { ok: false, status: 0 };
  try {
    const graphToken = await credential.getToken("https://graph.microsoft.com/.default");
    graph = await call("https://graph.microsoft.com/v1.0/policies/authorizationPolicy?$select=id", graphToken.token);
  } catch { /* returned as a safe failed check */ }
  try {
    const armToken = await credential.getToken("https://management.azure.com/.default");
    resources = await call(`https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01&$top=1`, armToken.token);
    security = await call(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/secureScoreControlDefinitions?api-version=2020-01-01`, armToken.token);
  } catch { /* returned as safe failed checks */ }

  const result = {
    tenantAccess: { ok: graph.ok, message: graph.ok ? "Microsoft tenant access confirmed" : `Tenant API access unavailable${graph.status ? ` (HTTP ${graph.status})` : ""}` },
    resourceReader: { ok: resources.ok, message: resources.ok ? "Azure Reader access confirmed" : `Azure Reader access unavailable${resources.status ? ` (HTTP ${resources.status})` : ""}` },
    securityReader: { ok: security.ok, message: security.ok ? "Security Reader access confirmed" : `Security Reader access unavailable${security.status ? ` (HTTP ${security.status})` : ""}` },
    ready: graph.ok && resources.ok && security.ok,
  };
  return result;
}

async function getJson(url: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Collection request failed with HTTP ${response.status}.`);
  return await response.json() as Record<string, unknown>;
}

async function optionalJson(url: string, token: string): Promise<Record<string, unknown> | null> {
  try { return await getJson(url, token); } catch { return null; }
}

export async function runStarterCollection(tenantId: string, subscriptionId: string): Promise<StarterFinding[]> {
  const credential = customerCredential(tenantId);
  const graphToken = await credential.getToken("https://graph.microsoft.com/.default");
  const armToken = await credential.getToken("https://management.azure.com/.default");
  const subscription = await getJson(`https://management.azure.com/subscriptions/${subscriptionId}?api-version=2022-12-01`, armToken.token);
  if (String(subscription.tenantId ?? "").toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error("The Azure subscription belongs to a different Microsoft Entra tenant.");
  }

  const [policy, groups, azureScores, conditionalAccess, namedLocations, roleDefinitions, registrations, m365Scores, compliancePolicies, deviceConfigurations, appPolicies, controlProfiles] = await Promise.all([
    getJson("https://graph.microsoft.com/v1.0/policies/authorizationPolicy", graphToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`, armToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/secureScores?api-version=2020-01-01`, armToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions?$filter=displayName%20eq%20'Global%20Administrator'", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/security/secureScores?$top=10", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/deviceAppManagement/managedAppPolicies", graphToken.token),
    optionalJson("https://graph.microsoft.com/v1.0/security/secureScoreControlProfiles?$top=200", graphToken.token),
  ]);
  const groupCount = Array.isArray(groups.value) ? groups.value.length : 0;
  const scoreCount = Array.isArray(azureScores.value) ? azureScores.value.length : 0;
  const azureScoreRows = scoreCount ? azureScores.value as Array<Record<string, unknown>> : [];
  const azureScoreRow = azureScoreRows.find((item) => item.name === "ascScore") ?? azureScoreRows[0];
  const azureScoreProperties = azureScoreRow?.properties as Record<string, unknown> | undefined;
  const azureScoreValues = azureScoreProperties?.score as Record<string, unknown> | undefined;
  const azureScoreCurrent = Number(azureScoreValues?.current ?? 0);
  const azureScoreMaximum = Number(azureScoreValues?.max ?? 0);
  const azureScorePercentage = azureScoreMaximum ? Math.round(Number(azureScoreValues?.percentage ?? azureScoreCurrent / azureScoreMaximum) * 100) : 0;
  const findings: StarterFinding[] = [
    { checkId: "entra.authorization-policy", title: "Entra authorization policy", status: "pass", detail: `Policy ${String(policy.id ?? "default")} was read successfully.` },
    { checkId: "azure.resource-groups", title: "Azure resource inventory", status: "pass", detail: `${groupCount} resource group${groupCount === 1 ? "" : "s"} discovered.` },
    { checkId: "defender.secure-score", title: "Defender for Cloud secure score", status: azureScoreMaximum && azureScorePercentage >= 60 ? "pass" : "warning", detail: azureScoreMaximum ? `${azureScoreCurrent} of ${azureScoreMaximum} points (${azureScorePercentage}%).` : "No secure-score record is currently available for this subscription.", evidence: azureScoreMaximum ? { current: azureScoreCurrent, maximum: azureScoreMaximum, percentage: azureScorePercentage, initiatives: azureScoreRows } : undefined },
  ];

  const caPolicies = conditionalAccess && Array.isArray(conditionalAccess.value) ? conditionalAccess.value as Array<Record<string, unknown>> : [];
  const enabledPolicies = caPolicies.filter((item) => item.state === "enabled");
  const mfaPolicies = enabledPolicies.filter((item) => {
    const grant = item.grantControls as { builtInControls?: unknown } | undefined;
    return Array.isArray(grant?.builtInControls) && grant.builtInControls.includes("mfa");
  });
  const locations = namedLocations && Array.isArray(namedLocations.value) ? namedLocations.value : [];
  findings.push({ checkId: "entra.conditional-access", title: "Conditional Access coverage", status: mfaPolicies.length ? "pass" : "warning", detail: conditionalAccess ? `${enabledPolicies.length} enabled policies; ${mfaPolicies.length} explicitly require MFA; ${locations.length} named locations.` : "Conditional Access data is unavailable or not licensed.", evidence: conditionalAccess ? { policies: caPolicies, namedLocations: locations } : undefined });

  const definitions = roleDefinitions && Array.isArray(roleDefinitions.value) ? roleDefinitions.value as Array<Record<string, unknown>> : [];
  if (definitions[0]?.id) {
    const assignments = await optionalJson(`https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$filter=roleDefinitionId%20eq%20'${String(definitions[0].id)}'&$expand=principal`, graphToken.token);
    if (assignments && Array.isArray(assignments.value)) {
      const administrators = (assignments.value as Array<Record<string, unknown>>).map((item) => {
        const principal = item.principal as Record<string, unknown> | undefined;
        return { id: item.principalId, displayName: principal?.displayName, userPrincipalName: principal?.userPrincipalName, principalType: principal?.["@odata.type"] };
      });
      const administratorCount = administrators.length;
      findings.push({ checkId: "entra.global-admins", title: "Global Administrator assignments", status: administratorCount <= 5 ? "pass" : "warning", detail: `${administratorCount} active Global Administrator assignment${administratorCount === 1 ? "" : "s"} found; review necessity and emergency access coverage.`, evidence: { administrators } });
    }
  }
  if (!findings.some((finding) => finding.checkId === "entra.global-admins")) findings.push({ checkId: "entra.global-admins", title: "Global Administrator assignments", status: "warning", detail: "Privileged-role assignments are unavailable." });

  const users = registrations && Array.isArray(registrations.value) ? registrations.value as Array<Record<string, unknown>> : [];
  const mfaUsers = users.filter((item) => item.isMfaRegistered === true).length;
  const mfaPercent = users.length ? Math.round(mfaUsers / users.length * 100) : 0;
  findings.push({ checkId: "entra.mfa-registration", title: "MFA registration", status: users.length > 0 && mfaPercent >= 95 ? "pass" : "warning", detail: registrations ? `${mfaUsers} of ${users.length} reported users are MFA registered (${mfaPercent}%).` : "Authentication-method registration data is unavailable." });

  const scoreRows = m365Scores && Array.isArray(m365Scores.value) ? m365Scores.value as Array<Record<string, unknown>> : [];
  scoreRows.sort((a, b) => String(b.createdDateTime ?? "").localeCompare(String(a.createdDateTime ?? "")));
  const latest = scoreRows[0];
  const current = Number(latest?.currentScore ?? 0);
  const maximum = Number(latest?.maxScore ?? 0);
  const percentage = maximum ? Math.round(current / maximum * 100) : 0;
  findings.push({ checkId: "m365.secure-score", title: "Microsoft 365 Secure Score", status: maximum && percentage >= 60 ? "pass" : "warning", detail: maximum ? `${current} of ${maximum} points (${percentage}%) on ${String(latest?.createdDateTime ?? "the latest record")}.` : "Microsoft 365 Secure Score data is unavailable.", evidence: maximum ? { current, maximum, percentage, createdDateTime: latest?.createdDateTime, activeUserCount: latest?.activeUserCount, licensedUserCount: latest?.licensedUserCount } : undefined });

  const complianceCount = compliancePolicies && Array.isArray(compliancePolicies.value) ? compliancePolicies.value.length : null;
  const configurationCount = deviceConfigurations && Array.isArray(deviceConfigurations.value) ? deviceConfigurations.value.length : null;
  findings.push({
    checkId: "intune.device-policies",
    title: "Intune device policy inventory",
    status: complianceCount !== null && configurationCount !== null && complianceCount > 0 ? "pass" : "warning",
    detail: complianceCount === null || configurationCount === null
      ? "Intune device policy data is unavailable or Intune is not licensed."
      : `${complianceCount} compliance policies and ${configurationCount} device configuration profiles discovered.`,
    evidence: complianceCount !== null && configurationCount !== null ? { compliancePolicies: compliancePolicies?.value, deviceConfigurations: deviceConfigurations?.value } : undefined,
  });

  const appPolicyCount = appPolicies && Array.isArray(appPolicies.value) ? appPolicies.value.length : null;
  findings.push({
    checkId: "intune.app-protection",
    title: "Intune app-protection policies",
    status: appPolicyCount !== null && appPolicyCount > 0 ? "pass" : "warning",
    detail: appPolicyCount === null ? "Intune app-protection policy data is unavailable or Intune is not licensed." : `${appPolicyCount} managed app polic${appPolicyCount === 1 ? "y" : "ies"} discovered.`,
    evidence: appPolicyCount !== null ? { managedAppPolicies: appPolicies?.value } : undefined,
  });

  const profiles = controlProfiles && Array.isArray(controlProfiles.value) ? controlProfiles.value as Array<Record<string, unknown>> : [];
  const profileById = new Map(profiles.filter((item) => item.deprecated !== true).map((item) => [String(item.id ?? ""), item]));
  const controlScores = latest && Array.isArray(latest.controlScores) ? latest.controlScores as Array<Record<string, unknown>> : [];
  const opportunities = controlScores
    .map((item) => {
      const id = String(item.controlName ?? "");
      const profile = profileById.get(id);
      const percentage = Number(item.scoreInPercentage ?? 100);
      return { id, title: String(profile?.title ?? id), gapPoints: Number(profile?.maxScore ?? 0) * (100 - percentage) / 100 };
    })
    .filter((item) => item.id && item.gapPoints > 0)
    .sort((a, b) => b.gapPoints - a.gapPoints)
    .slice(0, 3)
    .map((item) => item.title);
  findings.push({
    checkId: "m365.priority-recommendations",
    title: "Priority Microsoft 365 improvements",
    status: opportunities.length ? "warning" : "pass",
    detail: opportunities.length ? `Highest remaining opportunities: ${opportunities.join("; ")}.` : controlProfiles ? "No incomplete Secure Score controls were returned." : "Secure Score recommendation details are unavailable.",
  });
  return findings;
}
