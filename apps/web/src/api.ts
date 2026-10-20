import type { AuditAccount } from "./auth";
import { getApiAccessToken } from "./auth";
import { appConfig } from "./config";

export interface TenantBootstrap {
  tenantId: string;
  registered: boolean;
  consentStatus: "notConfigured" | "pending" | "granted" | "error";
  azureRbacStatus: "notConfigured" | "partial" | "configured";
  latestScan: {
    scanId: string;
    tenantId: string;
    status: "queued" | "running" | "complete" | "partial" | "failed";
    createdAt: string;
    completedAt?: string;
    score?: number;
  } | null;
  destination: "onboarding" | "scan" | "report";
}

export async function loadTenantBootstrap(account: AuditAccount): Promise<TenantBootstrap> {
  if (!appConfig.apiBaseUrl) {
    throw new Error("The NSO Audit API URL is not configured.");
  }

  const accessToken = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/bootstrap`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...workspaceHeader(account),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Tenant setup could not be loaded (HTTP ${response.status}).`);
  }

  return await response.json() as TenantBootstrap;
}

export interface AccessCheckResult {
  tenantAccess: { ok: boolean; message: string };
  resourceReader: { ok: boolean; message: string };
  securityReader: { ok: boolean; message: string };
  ready: boolean;
}

export async function checkTenantAccess(account: AuditAccount, subscriptionId: string): Promise<AccessCheckResult> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const accessToken = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/access-check`, {
    method: "POST",
    headers: { ...workspaceHeader(account), Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  });
  const body = await response.json() as AccessCheckResult & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Access check failed (HTTP ${response.status}).`);
  return body;
}

export interface BaselineControlResult {
  controlId: string;
  title: string;
  category: "identity" | "devices" | "azure" | "coverage";
  status: "pass" | "partial" | "fail" | "informational" | "unsupported";
  weight: number;
  earnedWeight: number;
  detail: string;
  source: string;
}

export interface BaselineResult {
  baselineId: string;
  score: number | null;
  coverage: number;
  assessedWeight: number;
  applicableWeight: number;
  controls: BaselineControlResult[];
}

export interface StarterScan { scanId: string; score?: number; subscriptionId?: string; baseline?: BaselineResult; findings: Array<{ checkId: string; title: string; status: string; detail: string; evidence?: unknown }> }
export interface ScanHistoryItem { scanId: string; status: string; createdAt: string; completedAt?: string; score?: number }

export async function startStarterScan(account: AuditAccount, subscriptionId: string): Promise<StarterScan> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans`, { method: "POST", headers: { ...workspaceHeader(account), Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId }) });
  const body = await response.json() as StarterScan & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The starter audit failed.");
  return body;
}

export async function loadStarterScan(account: AuditAccount, scanId: string): Promise<StarterScan> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans/${encodeURIComponent(scanId)}`, { headers: { ...workspaceHeader(account), Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("The scan report could not be loaded.");
  return await response.json() as StarterScan;
}

export async function loadScanHistory(account: AuditAccount): Promise<ScanHistoryItem[]> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans`, { headers: { ...workspaceHeader(account), Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Scan history could not be loaded.");
  return ((await response.json()) as { scans: ScanHistoryItem[] }).scans;
}

function workspaceHeader(account:AuditAccount):Record<string,string>{
  return 'kind' in account&&account.kind==='email'?{'X-Nso-Organization-Id':account.organizationId}:{};
}
