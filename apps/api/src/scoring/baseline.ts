export const baselineId = "nso-foundation-v1";

export type BaselineControlStatus = "pass" | "partial" | "fail" | "informational" | "unsupported";

export interface BaselineControlResult {
  controlId: string;
  title: string;
  category: "identity" | "devices" | "azure" | "coverage";
  status: BaselineControlStatus;
  weight: number;
  earnedWeight: number;
  detail: string;
  source: string;
}

export interface BaselineResult {
  baselineId: typeof baselineId;
  score: number | null;
  coverage: number;
  assessedWeight: number;
  applicableWeight: number;
  controls: BaselineControlResult[];
}

interface CollectedFinding {
  checkId: string;
  title?: string;
  detail: string;
  evidence?: unknown;
}

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
const records = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];

function findingEvidence(findings: CollectedFinding[], checkId: string): JsonRecord | undefined {
  return asRecord(findings.find((finding) => finding.checkId === checkId)?.evidence);
}

function unsupported(controlId: string, title: string, category: BaselineControlResult["category"], weight: number, source: string): BaselineControlResult {
  return { controlId, title, category, status: "unsupported", weight, earnedWeight: 0, detail: "Required evidence was not available in this scan.", source };
}

function evaluateMfaRegistration(findings: CollectedFinding[]): BaselineControlResult {
  const base = { controlId: "identity.mfa-registration", title: "Users registered for MFA", category: "identity" as const, weight: 20, source: "Microsoft Graph authentication-method registration report" };
  const evidence = findingEvidence(findings, "entra.mfa-registration");
  const total = Number(evidence?.totalUsers);
  const registered = Number(evidence?.registeredUsers);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(registered)) return unsupported(base.controlId, base.title, base.category, base.weight, base.source);
  const percentage = Math.max(0, Math.min(100, registered / total * 100));
  return {
    ...base,
    status: percentage >= 95 ? "pass" : percentage >= 80 ? "partial" : "fail",
    earnedWeight: Math.round(base.weight * percentage) / 100,
    detail: `${registered} of ${total} users are registered (${Math.round(percentage)}%); the baseline target is at least 95%.`,
  };
}

function enabledPolicies(findings: CollectedFinding[]): JsonRecord[] | undefined {
  const evidence = findingEvidence(findings, "entra.conditional-access");
  if (!evidence || !Array.isArray(evidence.policies)) return undefined;
  return records(evidence.policies).filter((policy) => policy.state === "enabled");
}

function evaluateAllUserMfa(findings: CollectedFinding[]): BaselineControlResult {
  const base = { controlId: "identity.ca-all-user-mfa", title: "Conditional Access requires MFA for all users and resources", category: "identity" as const, weight: 20, source: "Microsoft Graph Conditional Access policies" };
  const policies = enabledPolicies(findings);
  if (!policies) return unsupported(base.controlId, base.title, base.category, base.weight, base.source);
  const matches = policies.filter((policy) => {
    const conditions = asRecord(policy.conditions);
    const users = asRecord(conditions?.users);
    const applications = asRecord(conditions?.applications);
    const grant = asRecord(policy.grantControls);
    return Array.isArray(users?.includeUsers) && users.includeUsers.includes("All")
      && Array.isArray(applications?.includeApplications) && applications.includeApplications.includes("All")
      && Array.isArray(grant?.builtInControls) && grant.builtInControls.includes("mfa");
  });
  if (!matches.length) return { ...base, status: "fail", earnedWeight: 0, detail: "No enabled policy was found that requires MFA for all users across all resources." };
  const hasExclusions = matches.some((policy) => {
    const users = asRecord(asRecord(policy.conditions)?.users);
    return [users?.excludeUsers, users?.excludeGroups, users?.excludeRoles].some((value) => Array.isArray(value) && value.length > 0);
  });
  return hasExclusions
    ? { ...base, status: "partial", earnedWeight: 10, detail: "A broad MFA policy exists, but its exclusions require review." }
    : { ...base, status: "pass", earnedWeight: 20, detail: "An enabled policy requires MFA for all users across all resources with no detected identity exclusions." };
}

function evaluateLegacyAuthentication(findings: CollectedFinding[]): BaselineControlResult {
  const base = { controlId: "identity.ca-block-legacy-auth", title: "Conditional Access blocks legacy authentication", category: "identity" as const, weight: 15, source: "Microsoft Graph Conditional Access policies" };
  const policies = enabledPolicies(findings);
  if (!policies) return unsupported(base.controlId, base.title, base.category, base.weight, base.source);
  const match = policies.some((policy) => {
    const conditions = asRecord(policy.conditions);
    const users = asRecord(conditions?.users);
    const applications = asRecord(conditions?.applications);
    const grant = asRecord(policy.grantControls);
    const clients = Array.isArray(conditions?.clientAppTypes) ? conditions.clientAppTypes : [];
    return Array.isArray(users?.includeUsers) && users.includeUsers.includes("All")
      && Array.isArray(applications?.includeApplications) && applications.includeApplications.includes("All")
      && clients.includes("exchangeActiveSync") && clients.includes("other")
      && Array.isArray(grant?.builtInControls) && grant.builtInControls.includes("block");
  });
  return match
    ? { ...base, status: "pass", earnedWeight: 15, detail: "An enabled all-user policy blocks the detected legacy client types across all resources." }
    : { ...base, status: "fail", earnedWeight: 0, detail: "No complete enabled policy was found that blocks legacy authentication for all users and resources." };
}

function evaluateGlobalAdministrators(findings: CollectedFinding[]): BaselineControlResult {
  const base = { controlId: "identity.global-admin-count", title: "Global Administrator assignments are limited", category: "identity" as const, weight: 15, source: "Microsoft Graph directory role assignments" };
  const evidence = findingEvidence(findings, "entra.global-admins");
  if (!evidence || !Array.isArray(evidence.administrators)) return unsupported(base.controlId, base.title, base.category, base.weight, base.source);
  const count = evidence.administrators.length;
  if (count >= 2 && count <= 5) return { ...base, status: "pass", earnedWeight: 15, detail: `${count} active assignments were found; the Baseline v1 target range is 2–5.` };
  if (count === 1 || (count >= 6 && count <= 8)) return { ...base, status: "partial", earnedWeight: 7.5, detail: `${count} active assignments were found; review against the Baseline v1 target range of 2–5.` };
  return { ...base, status: "fail", earnedWeight: 0, detail: `${count} active assignments were found; the Baseline v1 target range is 2–5.` };
}

function evaluateDefenderRecommendations(findings: CollectedFinding[]): BaselineControlResult {
  const base = { controlId: "azure.defender-high-severity", title: "Defender recommendation posture", category: "azure" as const, weight: 0, source: "Microsoft Defender for Cloud assessments" };
  const evidence = findingEvidence(findings, "defender.recommendations");
  if (!evidence || !Array.isArray(evidence.recommendations)) return { ...base, status: "informational", earnedWeight: 0, detail: "Defender recommendation evidence was unavailable; refer to Assessment Coverage and the collection warning." };
  const recommendations = records(evidence.recommendations);
  const high = recommendations.filter((item) => String(item.severity ?? "").toLowerCase() === "high").length;
  const medium = recommendations.filter((item) => String(item.severity ?? "").toLowerCase() === "medium").length;
  return { ...base, status: "informational", earnedWeight: 0, detail: `${high} high- and ${medium} medium-severity recommendations remain in the retained result set; these are prioritized findings but are not an NSO Baseline v1 score component.` };
}

function informationalControls(findings: CollectedFinding[]): BaselineControlResult[] {
  const controls: BaselineControlResult[] = [];
  for (const [checkId, controlId, title, category] of [
    ["intune.device-policies", "devices.intune-policy-inventory", "Intune device policy inventory", "devices"],
    ["intune.app-protection", "devices.intune-app-protection-inventory", "Intune app-protection inventory", "devices"],
    ["m365.secure-score", "coverage.microsoft-secure-score", "Microsoft 365 Secure Score", "coverage"],
    ["defender.secure-score", "coverage.defender-secure-score", "Defender for Cloud Secure Score", "coverage"],
  ] as const) {
    const finding = findings.find((item) => item.checkId === checkId);
    controls.push({ controlId, title, category, status: "informational", weight: 0, earnedWeight: 0, detail: finding?.detail ?? "Source data was unavailable.", source: finding?.title ?? checkId });
  }
  return controls;
}

export function evaluateBaseline(findings: CollectedFinding[]): BaselineResult {
  const scoredControls = [
    evaluateMfaRegistration(findings),
    evaluateAllUserMfa(findings),
    evaluateLegacyAuthentication(findings),
    evaluateGlobalAdministrators(findings),
  ];
  const applicableWeight = scoredControls.reduce((sum, control) => sum + control.weight, 0);
  const assessed = scoredControls.filter((control) => control.status !== "unsupported");
  const assessedWeight = assessed.reduce((sum, control) => sum + control.weight, 0);
  const earnedWeight = assessed.reduce((sum, control) => sum + control.earnedWeight, 0);
  return {
    baselineId,
    score: assessedWeight ? Math.round(earnedWeight / assessedWeight * 100) : null,
    coverage: applicableWeight ? Math.round(assessedWeight / applicableWeight * 100) : 0,
    assessedWeight,
    applicableWeight,
    controls: [...scoredControls, evaluateDefenderRecommendations(findings), ...informationalControls(findings)],
  };
}
