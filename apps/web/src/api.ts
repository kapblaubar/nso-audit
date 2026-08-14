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
