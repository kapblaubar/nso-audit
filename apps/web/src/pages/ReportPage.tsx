import type { AccountInfo } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { loadScanHistory, loadStarterScan, startStarterScan, type ScanHistoryItem, type StarterScan, type TenantBootstrap } from "../api";

interface ReportPageProps {
  account: AccountInfo;
  bootstrap: TenantBootstrap;
  scanId: string;
  onSignOut: () => void;
}

export function ReportPage({ account, bootstrap, scanId, onSignOut }: ReportPageProps) {
  const [scan, setScan] = useState<StarterScan>();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
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
        <div className="report-score">
          <span>Assessment score (preview)</span>
          <strong>{scan?.score ?? "—"}</strong>
          <p>Scan {scanId}</p>
        </div>
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
