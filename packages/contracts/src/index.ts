export type ScanStatus =
  | "queued"
  | "running"
  | "complete"
  | "partial"
  | "failed";

export type FindingSeverity = "high" | "medium" | "low" | "info";
export type FindingStatus = "pass" | "fail" | "warning" | "notApplicable";
export type FindingCategory = "identity" | "devices" | "data" | "detection";

export interface Finding {
  scanId: string;
  tenantId: string;
  category: FindingCategory;
  sourceSystem: string;
  checkId: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  details: Record<string, unknown>;
  remediationGuidance: string;
  rawRef?: string;
}

export interface ScanSummary {
  scanId: string;
  tenantId: string;
  status: ScanStatus;
  createdAt: string;
  completedAt?: string;
  score?: number;
}

