import type { AccountInfo } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { loadScanHistory, loadStarterScan, startStarterScan, type ScanHistoryItem, type StarterScan, type TenantBootstrap } from "../api";

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

function categoryScores(evidence: Record<string, unknown> | undefined): CategoryScore[] {
  if (!Array.isArray(evidence?.categories)) return [];
  return evidence.categories.filter((item): item is CategoryScore => {
    if (typeof item !== "object" || item === null) return false;
    const value = item as Record<string, unknown>;
    return typeof value.name === "string" && typeof value.earned === "number" && typeof value.available === "number" && (typeof value.percentage === "number" || value.percentage === null);
  });
}

export function ReportPage({ account, bootstrap, scanId, onSignOut }: ReportPageProps) {
  const [scan, setScan] = useState<StarterScan>();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const m365Score = scoreEvidence(scan, "m365.secure-score");
  const defenderScore = scoreEvidence(scan, "defender.secure-score");
  const m365Categories = categoryScores(m365Score);
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
  return (
    <main className="report-page">
      <nav className="nav" aria-label="Report navigation">
        <a className="brand" href="/" aria-label="NSO Audit home">
          <img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40" />
          <span className="brand-name">NSO Audit</span>
        </a>
        <button className="text-button" type="button" onClick={onSignOut}>Sign out</button>
      </nav>
      <section className="report-shell">
        <p className="eyebrow">Tenant scorecard</p>
        <h1>{account.name ?? account.username}</h1>
        <p>Tenant ID: {bootstrap.tenantId}</p>
        <div className="score-grid" aria-label="Security scores">
          <div className="report-score score-primary">
            <span>NSO Assessment Score</span>
            <strong>{scan?.score ?? "—"}<small>/100</small></strong>
            <p>Preview scoring model</p>
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
          {scan?.findings.map((finding) => (
            <article key={finding.checkId} className={finding.status === "pass" ? "finding-pass" : "finding-warning"}>
              <span>{finding.status}</span>
              <h2>{finding.title}</h2>
              <p>{finding.detail}</p>
              {finding.evidence !== undefined ? (
                <details className="finding-evidence">
                  <summary>View details</summary>
                  <pre><code>{JSON.stringify(finding.evidence, null, 2)}</code></pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
        <div className="report-actions">
          <button className="step-action" type="button" onClick={runAgain} disabled={!scan?.subscriptionId || running}>{running ? "Running audit…" : "Run audit again"}</button>
          {runError ? <p className="auth-error" role="alert">{runError}</p> : null}
        </div>
        <section className="scan-history" aria-labelledby="history-title">
          <p className="eyebrow">History</p>
          <h2 id="history-title">Previous scans</h2>
          <div>{history.map((item) => <a href={`/reports/${encodeURIComponent(item.scanId)}`} key={item.scanId}><span>{new Date(item.createdAt).toLocaleString()}</span><strong>{item.score ?? "—"}</strong><small>{item.status}</small></a>)}</div>
        </section>
      </section>
    </main>
  );
}
