import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

export interface AccessCheckResult {
  tenantAccess: { ok: boolean; message: string };
  resourceReader: { ok: boolean; message: string };
  securityReader: { ok: boolean; message: string };
  ready: boolean;
}

export interface StarterFinding { checkId: string; title: string; status: "pass" | "warning"; detail: string; evidence?: unknown }

const secretCacheLifetimeMs = 5 * 60 * 1000;
let cachedClientSecret: { value: string; loadedAt: number } | undefined;
let pendingClientSecret: Promise<string> | undefined;

async function getApplicationClientSecret(): Promise<string> {
  if (cachedClientSecret && Date.now() - cachedClientSecret.loadedAt < secretCacheLifetimeMs) {
    return cachedClientSecret.value;
  }

  pendingClientSecret ??= (async () => {
    const vaultUrl = process.env.KEY_VAULT_URI;
    const secretName = process.env.ENTRA_CLIENT_SECRET_NAME;
    const managedIdentityClientId = process.env.AZURE_CLIENT_ID;
    if (!vaultUrl || !secretName || !managedIdentityClientId) {
      throw new Error("Key Vault workload authentication is not configured.");
    }

    const managedIdentity = new ManagedIdentityCredential({ clientId: managedIdentityClientId });
    const secret = await new SecretClient(vaultUrl, managedIdentity).getSecret(secretName);
    if (!secret.value) throw new Error(`Key Vault secret '${secretName}' has no value.`);
    cachedClientSecret = { value: secret.value, loadedAt: Date.now() };
    return secret.value;
  })();

  try {
    return await pendingClientSecret;
  } finally {
    pendingClientSecret = undefined;
  }
}

async function customerCredential(tenantId: string): Promise<ClientSecretCredential> {
  const appClientId = process.env.ENTRA_CLIENT_ID;
  if (!appClientId) throw new Error("The App Registration client ID is not configured.");
  return new ClientSecretCredential(tenantId, appClientId, await getApplicationClientSecret());
}

async function call(url: string, token: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  return { ok: response.ok, status: response.status };
}

export async function checkCustomerAccess(tenantId: string, subscriptionId: string): Promise<AccessCheckResult> {
  const credential = await customerCredential(tenantId);

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

class CollectionRequestError extends Error {
  constructor(readonly status: number) {
    super(`Collection request failed with HTTP ${status}.`);
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson(url: string, token: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (response.ok) return await response.json() as Record<string, unknown>;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) throw new CollectionRequestError(response.status);
    const retryAfter = Number(response.headers.get("retry-after"));
    await delay(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 500 * 2 ** attempt);
  }
  throw new Error("Collection retry loop ended unexpectedly.");
}

async function optionalJson(url: string, token: string): Promise<Record<string, unknown> | null> {
  try { return await getJson(url, token); } catch { return null; }
}

async function optionalJsonWithStatus(url: string, token: string): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  try {
    return { data: await getJson(url, token) };
  } catch (error) {
    return { data: null, error: error instanceof CollectionRequestError ? `HTTP ${error.status}` : "request failed" };
  }
}

function compactText(value: unknown, maximumLength = 1000): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 1)}…`;
}

export async function runStarterCollection(tenantId: string, subscriptionId: string): Promise<StarterFinding[]> {
  const credential = await customerCredential(tenantId);
  const graphToken = await credential.getToken("https://graph.microsoft.com/.default");
  const armToken = await credential.getToken("https://management.azure.com/.default");
  const subscription = await getJson(`https://management.azure.com/subscriptions/${subscriptionId}?api-version=2022-12-01`, armToken.token);
  if (String(subscription.tenantId ?? "").toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error("The Azure subscription belongs to a different Microsoft Entra tenant.");
  }

  const [policy, groups, azureScores, azureAssessmentsResult, azureAssessmentMetadata, conditionalAccess, namedLocations, roleDefinitions, registrations, m365Scores, compliancePolicies, deviceConfigurations, appPolicies, controlProfiles] = await Promise.all([
    getJson("https://graph.microsoft.com/v1.0/policies/authorizationPolicy", graphToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`, armToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/secureScores?api-version=2020-01-01`, armToken.token),
    optionalJsonWithStatus(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/assessments?api-version=2021-06-01`, armToken.token),
    optionalJson(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/assessmentMetadata?api-version=2021-06-01`, armToken.token),
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
  const azureAssessments = azureAssessmentsResult.data;
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

  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const assessmentRows = azureAssessments && Array.isArray(azureAssessments.value) ? azureAssessments.value as Array<Record<string, unknown>> : [];
  const metadataRows = azureAssessmentMetadata && Array.isArray(azureAssessmentMetadata.value) ? azureAssessmentMetadata.value as Array<Record<string, unknown>> : [];
  const metadataByKey = new Map(metadataRows.map((row) => [String(row.name ?? "").toLowerCase(), row.properties as Record<string, unknown> | undefined]));
  const groupedAssessments = new Map<string, {
    id: string; title: string; severity: string; status: string; causes: Set<string>;
    remediation: string | undefined; description: string | undefined; affectedResources: Set<string>;
  }>();
  for (const assessment of assessmentRows) {
      const properties = assessment.properties as Record<string, unknown> | undefined;
      const status = properties?.status as Record<string, unknown> | undefined;
      if (String(status?.code ?? "").toLowerCase() !== "unhealthy") continue;
      const assessmentKey = String(assessment.name ?? "");
      const inlineMetadata = properties?.metadata as Record<string, unknown> | undefined;
      const metadata = metadataByKey.get(assessmentKey.toLowerCase()) ?? inlineMetadata;
      const resource = properties?.resourceDetails as Record<string, unknown> | undefined;
      const assessmentResourceId = String(assessment.id ?? "");
      const parentResourceId = assessmentResourceId.split(/\/providers\/Microsoft\.Security\/assessments\//i)[0] ?? assessmentResourceId;
      const resourceId = String(resource?.id ?? resource?.resourceId ?? parentResourceId);
      const existing = groupedAssessments.get(assessmentKey.toLowerCase()) ?? {
        id: assessmentKey,
        title: String((metadata?.displayName ?? assessmentKey) || "Defender recommendation"),
        severity: String(metadata?.severity ?? "Unknown"),
        status: "Unhealthy",
        causes: new Set<string>(),
        remediation: compactText(metadata?.remediationDescription),
        description: compactText(metadata?.description, 600),
        affectedResources: new Set<string>(),
      };
      const cause = compactText(status?.cause, 300);
      if (cause) existing.causes.add(cause);
      if (resourceId) existing.affectedResources.add(resourceId);
      groupedAssessments.set(assessmentKey.toLowerCase(), existing);
  }
  const defenderRecommendations = Array.from(groupedAssessments.values())
    .map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      status: item.status,
      causes: Array.from(item.causes),
      remediation: item.remediation,
      description: item.description,
      affectedResourceCount: item.affectedResources.size,
      affectedResources: Array.from(item.affectedResources).slice(0, 10),
    }))
    .sort((a, b) => (severityRank[b.severity.toLowerCase()] ?? 0) - (severityRank[a.severity.toLowerCase()] ?? 0) || b.affectedResourceCount - a.affectedResourceCount)
    .slice(0, 25);
  findings.push({
    checkId: "defender.recommendations",
    title: "Defender for Cloud recommendations",
    status: !azureAssessments || defenderRecommendations.length ? "warning" : "pass",
    detail: azureAssessments ? `${defenderRecommendations.length} highest-priority recommendation${defenderRecommendations.length === 1 ? "" : "s"} grouped across affected resources (maximum 25).` : `Defender for Cloud recommendations are unavailable (${azureAssessmentsResult.error ?? "unknown collection error"}).`,
    evidence: azureAssessments ? { recommendations: defenderRecommendations, limit: 25 } : { unavailable: true, error: azureAssessmentsResult.error ?? "unknown collection error" },
  });

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
        return {
          id: item.principalId,
          displayName: principal?.displayName,
          email: principal?.mail ?? principal?.userPrincipalName,
          userPrincipalName: principal?.userPrincipalName,
          principalType: principal?.["@odata.type"],
        };
      });
      const administratorCount = administrators.length;
      findings.push({ checkId: "entra.global-admins", title: "Global Administrator assignments", status: administratorCount <= 5 ? "pass" : "warning", detail: `${administratorCount} active Global Administrator assignment${administratorCount === 1 ? "" : "s"} found; review necessity and emergency access coverage.`, evidence: { administrators } });
    }
  }
  if (!findings.some((finding) => finding.checkId === "entra.global-admins")) findings.push({ checkId: "entra.global-admins", title: "Global Administrator assignments", status: "warning", detail: "Privileged-role assignments are unavailable." });

  const users = registrations && Array.isArray(registrations.value) ? registrations.value as Array<Record<string, unknown>> : [];
  const mfaUsers = users.filter((item) => item.isMfaRegistered === true).length;
  const mfaPercent = users.length ? Math.round(mfaUsers / users.length * 100) : 0;
  findings.push({ checkId: "entra.mfa-registration", title: "MFA registration", status: users.length > 0 && mfaPercent >= 95 ? "pass" : "warning", detail: registrations ? `${mfaUsers} of ${users.length} reported users are MFA registered (${mfaPercent}%).` : "Authentication-method registration data is unavailable.", evidence: registrations ? { registeredUsers: mfaUsers, totalUsers: users.length, percentage: mfaPercent } : undefined });

  const scoreRows = m365Scores && Array.isArray(m365Scores.value) ? m365Scores.value as Array<Record<string, unknown>> : [];
  scoreRows.sort((a, b) => String(b.createdDateTime ?? "").localeCompare(String(a.createdDateTime ?? "")));
  const latest = scoreRows[0];
  const current = Number(latest?.currentScore ?? 0);
  const maximum = Number(latest?.maxScore ?? 0);
  const percentage = maximum ? Math.round(current / maximum * 100) : 0;
  const profiles = controlProfiles && Array.isArray(controlProfiles.value) ? controlProfiles.value as Array<Record<string, unknown>> : [];
  const profileById = new Map(profiles.filter((item) => item.deprecated !== true).map((item) => [String(item.id ?? ""), item]));
  const controlScores = latest && Array.isArray(latest.controlScores) ? latest.controlScores as Array<Record<string, unknown>> : [];
  const categoryNames = ["Identity", "Data", "Device", "Apps", "Infrastructure"];
  const categories = categoryNames.map((name) => {
    const controls = controlScores.filter((item) => String(item.controlCategory ?? "").toLowerCase() === name.toLowerCase());
    const earned = controls.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
    const available = controls.reduce((sum, item) => sum + Number(profileById.get(String(item.controlName ?? ""))?.maxScore ?? 0), 0);
    return { name, earned: Math.round(earned * 100) / 100, available: Math.round(available * 100) / 100, percentage: available ? Math.round(earned / available * 100) : null };
  });
  findings.push({ checkId: "m365.secure-score", title: "Microsoft 365 Secure Score", status: maximum && percentage >= 60 ? "pass" : "warning", detail: maximum ? `${current} of ${maximum} points (${percentage}%) on ${String(latest?.createdDateTime ?? "the latest record")}.` : "Microsoft 365 Secure Score data is unavailable.", evidence: maximum ? { current, maximum, percentage, categories, createdDateTime: latest?.createdDateTime, activeUserCount: latest?.activeUserCount, licensedUserCount: latest?.licensedUserCount } : undefined });

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

  for (const categoryName of categoryNames) {
    const recommendations = controlScores
      .map((item) => {
        const id = String(item.controlName ?? "");
        const profile = profileById.get(id);
        const category = String(item.controlCategory ?? profile?.controlCategory ?? "");
        const scorePercentage = Number(item.scoreInPercentage ?? 100);
        const maximumPoints = Number(profile?.maxScore ?? 0);
        return {
          id,
          category,
          title: String(profile?.title ?? id),
          currentPoints: Number(item.score ?? 0),
          maximumPoints,
          potentialGain: Math.round(maximumPoints * (100 - scorePercentage)) / 100,
          scorePercentage,
          service: profile?.service,
          implementationCost: profile?.implementationCost,
          userImpact: profile?.userImpact,
          threats: profile?.threats,
          remediation: compactText(profile?.remediation),
          actionUrl: profile?.actionUrl,
        };
      })
      .filter((item) => item.id && item.category.toLowerCase() === categoryName.toLowerCase() && item.potentialGain > 0)
      .sort((a, b) => b.potentialGain - a.potentialGain)
      .slice(0, 25);
    findings.push({
      checkId: `m365.recommendations.${categoryName.toLowerCase()}`,
      title: `${categoryName} recommendations`,
      status: recommendations.length ? "warning" : "pass",
      detail: controlProfiles ? `${recommendations.length} highest-impact improvement${recommendations.length === 1 ? "" : "s"} shown (maximum 25).` : "Secure Score recommendation details are unavailable.",
      evidence: controlProfiles ? { category: categoryName, recommendations, limit: 25 } : undefined,
    });
  }
  return findings;
}
