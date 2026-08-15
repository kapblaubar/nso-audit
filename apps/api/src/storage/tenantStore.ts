import { TableClient, type TableEntityResult } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

type ConsentStatus = "notConfigured" | "pending" | "granted" | "error";
type AzureRbacStatus = "notConfigured" | "partial" | "configured";
type ScanStatus = "queued" | "running" | "complete" | "partial" | "failed";

interface TenantEntity {
  partitionKey: string;
  rowKey: string;
  consentStatus?: ConsentStatus;
  azureRbacStatus?: AzureRbacStatus;
  lastScanId?: string;
}

interface ScanEntity {
  partitionKey: string;
  rowKey: string;
  status: ScanStatus;
  createdAt: string;
  completedAt?: string;
  score?: number;
}

export interface TenantBootstrapRecord {
  tenantId: string;
  registered: boolean;
  consentStatus: ConsentStatus;
  azureRbacStatus: AzureRbacStatus;
  latestScan: {
    scanId: string;
    tenantId: string;
    status: ScanStatus;
    createdAt: string;
    completedAt?: string;
    score?: number;
  } | null;
  destination: "onboarding" | "scan" | "report";
}

let tenantsClient: TableClient | undefined;
let scansClient: TableClient | undefined;

function getTableClient(tableName: string): TableClient {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error("The storage account name is not configured.");
  }

  return new TableClient(
    `https://${accountName}.table.core.windows.net`,
    tableName,
    new DefaultAzureCredential(),
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

async function getOptionalEntity<T extends object>(
  client: TableClient,
  partitionKey: string,
  rowKey: string,
): Promise<TableEntityResult<T> | null> {
  try {
    return await client.getEntity<T>(partitionKey, rowKey);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getTenantBootstrap(tenantId: string): Promise<TenantBootstrapRecord> {
  tenantsClient ??= getTableClient("tenants");
  scansClient ??= getTableClient("scans");

  const tenant = await getOptionalEntity<TenantEntity>(tenantsClient, tenantId, "registration");
  if (!tenant) {
    return {
      tenantId,
      registered: false,
      consentStatus: "notConfigured",
      azureRbacStatus: "notConfigured",
      latestScan: null,
      destination: "onboarding",
    };
  }

  let latestScan: TenantBootstrapRecord["latestScan"] = null;
  if (tenant.lastScanId) {
    const scan = await getOptionalEntity<ScanEntity>(scansClient, tenantId, tenant.lastScanId);
    if (scan) {
      latestScan = {
        scanId: scan.rowKey,
        tenantId,
        status: scan.status,
        createdAt: scan.createdAt,
        ...(scan.completedAt ? { completedAt: scan.completedAt } : {}),
        ...(typeof scan.score === "number" ? { score: scan.score } : {}),
      };
    }
  }

  const destination = latestScan?.status === "complete" || latestScan?.status === "partial"
    ? "report"
    : latestScan?.status === "queued" || latestScan?.status === "running"
      ? "scan"
      : "onboarding";

  return {
    tenantId,
    registered: true,
    consentStatus: tenant.consentStatus ?? "notConfigured",
    azureRbacStatus: tenant.azureRbacStatus ?? "notConfigured",
    latestScan,
    destination,
  };
}

export async function saveAccessCheck(
  tenantId: string,
  subscriptionId: string,
  consentGranted: boolean,
  azureRbacConfigured: boolean,
): Promise<void> {
  tenantsClient ??= getTableClient("tenants");
  await tenantsClient.upsertEntity({
    partitionKey: tenantId,
    rowKey: "registration",
    subscriptionId,
    consentStatus: consentGranted ? "granted" : "error",
    azureRbacStatus: azureRbacConfigured ? "configured" : "partial",
    accessCheckedAt: new Date().toISOString(),
  }, "Merge");
}
