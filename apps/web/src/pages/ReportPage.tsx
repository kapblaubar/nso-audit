import type { AccountInfo } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { loadScanHistory, loadStarterScan, startStarterScan, type ScanHistoryItem, type StarterScan, type TenantBootstrap } from "../api";
import { FindingDetailsModal } from "../components/FindingDetailsModal";
import { ThemeToggle } from "../components/ThemeToggle";

interface ReportPageProps {
  account: AccountInfo;
  bootstrap: TenantBootstrap;
  scanId: string;
  onSignOut: () => void;
}

function scoreEvidence(scan: StarterScan | undefined, checkId: string): Record<string, unknown> | undefined {
  const evidence = scan?.findings.find((finding) => finding.checkId === checkId)?.evidence;
  return typeof evidence === "object" && evidence !== null ? evidence as Record<string, unknown> : undefined;
}

interface CategoryScore { name: string; earned: number; available: number; percentage: number | null }

function reviewEvidence(finding: StarterScan["findings"][number]): Record<string, unknown> | undefined {
  const evidence = typeof finding.evidence === "object" && finding.evidence !== null
    ? finding.evidence as Record<string, unknown>
    : undefined;
  if (!evidence) return undefined;

  if (finding.checkId === "m365.secure-score") {
    return {
      current: evidence.current,
      maximum: evidence.maximum,
      percentage: evidence.percentage,
      categories: evidence.categories,
      createdDateTime: evidence.createdDateTime,
      activeUserCount: evidence.activeUserCount,
      licensedUserCount: evidence.licensedUserCount,
    };
  }
  if (finding.checkId === "defender.secure-score") {
    return { current: evidence.current, maximum: evidence.maximum, percentage: evidence.percentage };
  }
  if (finding.checkId === "entra.global-admins") {
    return { administratorCount: Array.isArray(evidence.administrators) ? evidence.administrators.length : 0 };
  }
  if (finding.checkId === "entra.conditional-access") {
    const policies = Array.isArray(evidence.policies) ? evidence.policies as Array<Record<string, unknown>> : [];
    return {
      policyCount: policies.length,
      enabledPolicyCount: policies.filter((policy) => policy.state === "enabled").length,
      namedLocationCount: Array.isArray(evidence.namedLocations) ? evidence.namedLocations.length : 0,
    };
  }
  if (finding.checkId === "intune.device-policies") {
    return {
      compliancePolicyCount: Array.isArray(evidence.compliancePolicies) ? evidence.compliancePolicies.length : 0,
      deviceConfigurationCount: Array.isArray(evidence.deviceConfigurations) ? evidence.deviceConfigurations.length : 0,
    };
  }
  if (finding.checkId === "intune.app-protection") {
    return { managedAppPolicyCount: Array.isArray(evidence.managedAppPolicies) ? evidence.managedAppPolicies.length : 0 };
  }
  if (finding.checkId.startsWith("m365.recommendations.")) {
    const recommendations = Array.isArray(evidence.recommendations)
      ? evidence.recommendations as Array<Record<string, unknown>>
      : [];
    return {
      category: evidence.category,
      recommendationCount: recommendations.length,
      recommendations: recommendations.map((item) => ({
        title: item.title,
        currentPoints: item.currentPoints,
        maximumPoints: item.maximumPoints,
        potentialGain: item.potentialGain,
        scorePercentage: item.scorePercentage,
        service: item.service,
        implementationCost: item.implementationCost,
        userImpact: item.userImpact,
      })),
    };
  }
  if (finding.checkId === "defender.recommendations") {
    if (evidence.unavailable === true) return { unavailable: true, error: evidence.error };
    const recommendations = Array.isArray(evidence.recommendations)
      ? evidence.recommendations as Array<Record<string, unknown>>
      : [];
    return {
      recommendationCount: recommendations.length,
      recommendations: recommendations.map((item) => ({
        title: item.title,
        severity: item.severity,
        status: item.status,
        affectedResourceCount: item.affectedResourceCount,
      })),
    };
  }
  return undefined;
}

function categoryScores(evidence: Record<string, unknown> | undefined): CategoryScore[] {
  if (!Array.isArray(evidence?.categories)) return [];
  return evidence.categories.filter((item): item is CategoryScore => {
    if (typeof item !== "object" || item === null) return false;
    const value = item as Record<string, unknown>;
    return typeof value.name === "string" && typeof value.earned === "number" && typeof value.available === "number" && (typeof value.percentage === "number" || value.percentage === null);
  }).filter((category) => category.available > 0 && category.earned <= category.available && category.percentage !== null && category.percentage <= 100);
}

const baselineCategoryNames = { identity: "Identity", azure: "Azure security", devices: "Device management", coverage: "Microsoft source scores" } as const;

export function ReportPage({ account, bootstrap, scanId, onSignOut }: ReportPageProps) {
  const [scan, setScan] = useState<StarterScan>();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [selectedFinding, setSelectedFinding] = useState<StarterScan["findings"][number]>();
  const m365Score = scoreEvidence(scan, "m365.secure-score");
  const defenderScore = scoreEvidence(scan, "defender.secure-score");
  const m365Categories = categoryScores(m365Score);
  const recommendationFindings = scan?.findings.filter((finding) => finding.checkId.startsWith("m365.recommendations.") || finding.checkId === "defender.recommendations") ?? [];
  const postureFindings = scan?.findings.filter((finding) => !finding.checkId.startsWith("m365.recommendations.") && finding.checkId !== "defender.recommendations") ?? [];
  const baselineSections = scan?.baseline
    ? (Object.keys(baselineCategoryNames) as Array<keyof typeof baselineCategoryNames>).map((category) => {
        const controls = scan.baseline?.controls.filter((control) => control.category === category) ?? [];
        const weighted = controls.filter((control) => control.weight > 0);
        const assessed = weighted.filter((control) => control.status !== "unsupported");
        const assessedWeight = assessed.reduce((sum, control) => sum + control.weight, 0);
        const earnedWeight = assessed.reduce((sum, control) => sum + control.earnedWeight, 0);
        const applicableWeight = weighted.reduce((sum, control) => sum + control.weight, 0);
        return { category, title: baselineCategoryNames[category], controls, assessedWeight, earnedWeight, applicableWeight, score: assessedWeight ? Math.round(earnedWeight / assessedWeight * 100) : null };
      }).filter((section) => section.controls.length > 0)
    : [];
  useEffect(() => {
    void loadStarterScan(account, scanId).then(setScan);
    void loadScanHistory(account).then(setHistory);
  }, [account, scanId]);
  const runAgain = async () => {
    if (!scan?.subscriptionId) return;
    setRunning(true);
    setRunError(undefined);
    try {
      const next = await startStarterScan(account, scan.subscriptionId);
      window.location.assign(`/reports/${encodeURIComponent(next.scanId)}`);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The audit could not be started.");
      setRunning(false);
    }
  };
  const downloadScoreReview = () => {
    if (!scan) return;
    const report = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      purpose: "NSO Audit scoring review",
      redaction: "Tenant, subscription, administrator, policy, and resource identifiers are excluded.",
      scan: { score: scan.score, findingCount: scan.findings.length },
      baseline: scan.baseline,
      findings: scan.findings.map((finding) => ({
        checkId: finding.checkId,
        title: finding.title,
        status: finding.status,
        detail: finding.detail,
        ...(reviewEvidence(finding) ? { evidence: reviewEvidence(finding) } : {}),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nso-audit-score-review-${scanId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="report-page">
      <nav className="nav" aria-label="Report navigation">
        <a className="brand" href="/" aria-label="NSO Audit home">
          <img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40" />
          <span className="brand-name">NSO Audit</span>
        </a>
        <div className="nav-actions"><ThemeToggle /><button className="text-button" type="button" onClick={onSignOut}>Sign out</button></div>
      </nav>
      <section className="report-shell">
        <p className="eyebrow">Tenant scorecard</p>
        <h1>{account.name ?? account.username}</h1>
        <p>Tenant ID: {bootstrap.tenantId}</p>
        <div className="score-grid" aria-label="Security scores">
          <div className="report-score score-primary score-hero">
            <span>{scan?.baseline ? "NSO Foundation Score" : "Legacy NSO Assessment Score"}</span>
            <strong>{scan?.score ?? "—"}<small>/100</small></strong>
            <p>{scan?.baseline?.baselineId ?? "Legacy preview scoring model"}</p>
          </div>
          <div className="report-score">
            <span>Assessment Coverage</span>
            <strong>{scan?.baseline?.coverage ?? "—"}<small>%</small></strong>
            <p>{scan?.baseline ? `${scan.baseline.assessedWeight} of ${scan.baseline.applicableWeight} baseline weight assessed` : "Available on the next scan"}</p>
          </div>
          <div className="report-score">
            <span>Microsoft 365 Secure Score</span>
            <strong>{String(m365Score?.percentage ?? "—")}<small>%</small></strong>
            <p>{m365Score ? `${String(m365Score.current)} of ${String(m365Score.maximum)} points` : "Not available in this scan"}</p>
          </div>
          <div className="report-score">
            <span>Defender for Cloud Secure Score</span>
            <strong>{String(defenderScore?.percentage ?? "—")}<small>%</small></strong>
            <p>{defenderScore ? `${String(defenderScore.current)} of ${String(defenderScore.maximum)} points` : "Not available in this scan"}</p>
          </div>
        </div>
        {scan?.baseline ? (
          <section className="recommendation-section" aria-labelledby="baseline-controls-title">
            <p className="eyebrow">{scan.baseline.baselineId}</p>
            <h2 id="baseline-controls-title">Baseline controls</h2>
            <p>Only weighted controls affect the NSO Foundation Score. Informational controls retain useful Microsoft and inventory signals without changing the score.</p>
            <div className="baseline-outline">
              {baselineSections.map((section) => (
                <section className="baseline-group" key={section.category}>
                  <header>
                    <div><span>{section.category}</span><h3>{section.title}</h3></div>
                    <div className="baseline-group-score">
                      <strong>{section.score ?? "—"}<small>{section.score === null ? "" : "/100"}</small></strong>
                      <span>{section.applicableWeight ? `${section.assessedWeight} of ${section.applicableWeight} weight assessed` : "Informational"}</span>
                    </div>
                  </header>
                  <div className="baseline-control-list">
                    {section.controls.map((control) => (
                      <details className={`baseline-control status-${control.status}`} key={control.controlId}>
                        <summary>
                          <span className="control-status">{control.status}</span>
                          <strong>{control.title}</strong>
                          <span className="control-points">{control.status === "unsupported" ? `Not scored · ${control.weight}-point control unavailable` : control.weight ? `${control.earnedWeight} / ${control.weight} points` : "Informational"}</span>
                          <span className="control-expand-label">View details</span>
                        </summary>
                        <div><p>{control.detail}</p><small>Evidence source: {control.source}</small></div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : null}
        {m365Categories.length ? (
          <section className="m365-categories" aria-labelledby="m365-categories-title">
            <div><span>Microsoft 365 breakdown</span><strong id="m365-categories-title">Secure Score categories</strong></div>
            <div className="category-score-grid">
              {m365Categories.map((category) => (
                <div key={category.name}>
                  <span>{category.name}</span>
                  <strong>{category.percentage ?? "—"}<small>{category.percentage === null ? "" : "%"}</small></strong>
                  <p>{category.available ? `${category.earned} of ${category.available} points` : "No scored controls available"}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <p className="scan-reference">Scan {scanId}</p>
        <div className="starter-findings">
          {postureFindings.map((finding) => (
            <article key={finding.checkId} className={finding.status === "pass" ? "finding-pass" : "finding-warning"}>
              <span>{finding.status}</span>
              <h2>{finding.title}</h2>
              <p>{finding.detail}</p>
              {finding.evidence !== undefined ? <button className="detail-button" type="button" onClick={() => setSelectedFinding(finding)}>View details</button> : null}
            </article>
          ))}
        </div>
        {recommendationFindings.length ? <section className="recommendation-section" aria-labelledby="recommendations-title"><p className="eyebrow">Prioritized actions</p><h2 id="recommendations-title">Recommendations</h2><p>Up to 25 of the most important available recommendations are retained for each area.</p><div className="recommendation-card-grid">{recommendationFindings.map((finding) => <article key={finding.checkId}><span>{finding.checkId === "defender.recommendations" ? "Azure" : "Microsoft 365"}</span><h3>{finding.title}</h3><p>{finding.detail}</p>{finding.evidence !== undefined ? <button className="detail-button" type="button" onClick={() => setSelectedFinding(finding)}>View recommendations</button> : null}</article>)}</div></section> : null}
        <div className="report-actions">
          <button className="step-action" type="button" onClick={runAgain} disabled={!scan?.subscriptionId || running}>{running ? "Running audit…" : "Run audit again"}</button>
          <button className="detail-button" type="button" onClick={downloadScoreReview} disabled={!scan}>Download score-review report</button>
          {runError ? <p className="auth-error" role="alert">{runError}</p> : null}
        </div>
        <section className="scan-history" aria-labelledby="history-title">
          <p className="eyebrow">History</p>
          <h2 id="history-title">Previous scans</h2>
          <div>{history.map((item) => <a href={`/reports/${encodeURIComponent(item.scanId)}`} key={item.scanId}><span>{new Date(item.createdAt).toLocaleString()}</span><strong>{item.score ?? "—"}</strong><small>{item.status}</small></a>)}</div>
        </section>
      </section>
      {selectedFinding ? <FindingDetailsModal finding={selectedFinding} onClose={() => setSelectedFinding(undefined)} /> : null}
    </main>
  );
}
