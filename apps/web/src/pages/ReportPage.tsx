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

interface CategoryScore { name: string; earned: number; available: number; percentage: number | null; valid: boolean }

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
  const expected = ["Identity", "Data", "Device", "Apps", "Infrastructure"];
  const source = Array.isArray(evidence?.categories) ? evidence.categories : [];
  return expected.map((name) => {
    const value = source.find((item) => typeof item === "object" && item !== null && String((item as Record<string, unknown>).name).toLowerCase() === name.toLowerCase()) as Record<string, unknown> | undefined;
    const earned = typeof value?.earned === "number" ? value.earned : 0;
    const available = typeof value?.available === "number" ? value.available : 0;
    const percentage = typeof value?.percentage === "number" ? value.percentage : null;
    const valid = Boolean(value) && available > 0 && earned <= available && percentage !== null && percentage >= 0 && percentage <= 100;
    return { name, earned, available, percentage, valid };
  });
}

function BaselineControls({ controls }: { controls: NonNullable<StarterScan["baseline"]>["controls"] }) {
  if (!controls.length) return <p className="assessment-empty">No NSO controls are implemented for this area yet.</p>;
  return <div className="baseline-control-list">{controls.map((control) => (
    <details className={`baseline-control status-${control.status}`} key={control.controlId}>
      <summary>
        <span className="control-status">{control.status}</span>
        <strong>{control.title}</strong>
        <span className="control-points">{control.status === "unsupported" ? `Not scored · ${control.weight}-point control unavailable` : control.weight ? `${control.earnedWeight} / ${control.weight} points` : "Informational"}</span>
        <span className="control-expand-label">View details</span>
      </summary>
      <div><p>{control.detail}</p><small>Evidence source: {control.source}</small></div>
    </details>
  ))}</div>;
}

function PlannedSignal({ title, detail }: { title: string; detail: string }) {
  return <div className="planned-signal"><span>Not collected</span><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

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
  const controlsFor = (category: "identity" | "devices" | "azure") => scan?.baseline?.controls.filter((control) => control.category === category) ?? [];
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
      assessmentFamilies: [
        {
          name: "Microsoft 365",
          sourceScore: m365Score,
          categories: m365Categories,
          placement: {
            identity: ["Conditional Access", "MFA registration", "Administrator roles"],
            data: ["DLP and Purview (not collected)"],
            device: ["Intune configuration"],
            apps: [],
            infrastructure: [],
          },
        },
        { name: "Azure", sourceScore: defenderScore, areas: ["Defender for Cloud posture"] },
        {
          name: "Detection & Response",
          status: "notEnabled",
          areas: ["Defender alerts and incidents", "Alert settings", "Microsoft Sentinel data connectors"],
        },
      ],
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
        </div>
        <section className="assessment-family" aria-labelledby="m365-family-title">
          <header className="family-header"><div><p className="eyebrow">Assessment family</p><h2 id="m365-family-title">Microsoft 365</h2><p>Identity, data, device, apps, and infrastructure remain together as Microsoft defines them.</p></div><div className="family-source-score"><span>Microsoft Secure Score</span><strong>{String(m365Score?.percentage ?? "—")}<small>%</small></strong></div></header>
          <div className="family-categories">
            {m365Categories.map((category) => {
              const controls = category.name === "Identity" ? controlsFor("identity") : category.name === "Device" ? controlsFor("devices") : [];
              return <section className="assessment-category" key={category.name}>
                <header><div><span>Microsoft 365</span><h3>{category.name === "Data" ? "Data protection" : category.name}</h3></div><div className={`source-category-score${category.valid ? "" : " is-unavailable"}`}><strong>{category.valid ? category.percentage : "—"}<small>{category.valid ? "%" : ""}</small></strong><span>{category.valid ? `${category.earned} of ${category.available} Microsoft points` : category.available || category.earned ? `Source values require review (${category.earned} of ${category.available})` : "Microsoft category score unavailable"}</span></div></header>
                <BaselineControls controls={controls} />
                {category.name === "Data" ? <PlannedSignal title="DLP and Purview controls" detail="The scanner does not yet have an approved unattended DLP API. This area is unscored and does not reduce coverage." /> : null}
              </section>;
            })}
          </div>
        </section>
        <section className="assessment-family" aria-labelledby="azure-family-title">
          <header className="family-header"><div><p className="eyebrow">Assessment family</p><h2 id="azure-family-title">Azure</h2><p>Cloud security configuration and Defender for Cloud posture.</p></div><div className="family-source-score"><span>Defender for Cloud</span><strong>{String(defenderScore?.percentage ?? "—")}<small>%</small></strong></div></header>
          <section className="assessment-category"><header><div><span>Azure</span><h3>Cloud security</h3></div></header><BaselineControls controls={controlsFor("azure")} /></section>
        </section>
        <section className="assessment-family" aria-labelledby="detection-family-title">
          <header className="family-header"><div><p className="eyebrow">Assessment family</p><h2 id="detection-family-title">Detection &amp; Response</h2><p>Operational signals and detection configuration are reported separately from posture scoring.</p></div><div className="family-status"><span>Coverage</span><strong>Not enabled</strong></div></header>
          <section className="assessment-category"><header><div><span>Detection</span><h3>Alerting</h3></div></header><PlannedSignal title="Defender alerts and incidents" detail="Alert collection is not implemented. Future reports will show severity, status, ownership, and age without scoring raw alert volume." /><PlannedSignal title="Alert settings" detail="Notification routing, severity thresholds, suppression, and forwarding settings are not currently collected." /></section>
          <section className="assessment-category"><header><div><span>Detection</span><h3>Microsoft Sentinel</h3></div></header><PlannedSignal title="Sentinel data connectors" detail="Connector inventory and configuration are not currently collected. Data freshness will remain a separate optional Log Analytics check." /></section>
        </section>
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
