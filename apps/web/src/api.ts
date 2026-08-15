import type { AccountInfo } from "@azure/msal-browser";
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

export async function loadTenantBootstrap(account: AccountInfo): Promise<TenantBootstrap> {
  if (!appConfig.apiBaseUrl) {
    throw new Error("The NSO Audit API URL is not configured.");
  }

  const accessToken = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/bootstrap`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

export async function checkTenantAccess(account: AccountInfo, subscriptionId: string): Promise<AccessCheckResult> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const accessToken = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/access-check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  });
  const body = await response.json() as AccessCheckResult & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Access check failed (HTTP ${response.status}).`);
  return body;
}

export interface StarterScan { scanId: string; score: number; subscriptionId?: string; findings: Array<{ checkId: string; title: string; status: string; detail: string }> }
export interface ScanHistoryItem { scanId: string; status: string; createdAt: string; completedAt?: string; score?: number }

export async function startStarterScan(account: AccountInfo, subscriptionId: string): Promise<StarterScan> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId }) });
  const body = await response.json() as StarterScan & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The starter audit failed.");
  return body;
}

export async function loadStarterScan(account: AccountInfo, scanId: string): Promise<StarterScan> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans/${encodeURIComponent(scanId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("The scan report could not be loaded.");
  return await response.json() as StarterScan;
}

export async function loadScanHistory(account: AccountInfo): Promise<ScanHistoryItem[]> {
  if (!appConfig.apiBaseUrl) throw new Error("The NSO Audit API URL is not configured.");
  const token = await getApiAccessToken(account);
  const response = await fetch(`${appConfig.apiBaseUrl}/me/scans`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Scan history could not be loaded.");
  return ((await response.json()) as { scans: ScanHistoryItem[] }).scans;
}
