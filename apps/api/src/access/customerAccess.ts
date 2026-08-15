import { ClientAssertionCredential, ManagedIdentityCredential } from "@azure/identity";

export interface AccessCheckResult {
  tenantAccess: { ok: boolean; message: string };
  resourceReader: { ok: boolean; message: string };
  securityReader: { ok: boolean; message: string };
  ready: boolean;
}

export interface StarterFinding { checkId: string; title: string; status: "pass" | "warning"; detail: string }

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

export async function runStarterCollection(tenantId: string, subscriptionId: string): Promise<StarterFinding[]> {
  const credential = customerCredential(tenantId);
  const graphToken = await credential.getToken("https://graph.microsoft.com/.default");
  const armToken = await credential.getToken("https://management.azure.com/.default");
  const [policy, groups, scores] = await Promise.all([
    getJson("https://graph.microsoft.com/v1.0/policies/authorizationPolicy", graphToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`, armToken.token),
    getJson(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/secureScores?api-version=2020-01-01`, armToken.token),
  ]);
  const groupCount = Array.isArray(groups.value) ? groups.value.length : 0;
  const scoreCount = Array.isArray(scores.value) ? scores.value.length : 0;
  return [
    { checkId: "entra.authorization-policy", title: "Entra authorization policy", status: "pass", detail: `Policy ${String(policy.id ?? "default")} was read successfully.` },
    { checkId: "azure.resource-groups", title: "Azure resource inventory", status: "pass", detail: `${groupCount} resource group${groupCount === 1 ? "" : "s"} discovered.` },
    { checkId: "defender.secure-score", title: "Defender for Cloud secure score", status: scoreCount ? "pass" : "warning", detail: scoreCount ? `${scoreCount} secure-score record${scoreCount === 1 ? "" : "s"} available.` : "No secure-score record is currently available for this subscription." },
  ];
}
