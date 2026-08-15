import type { AccountInfo } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { loadStarterScan, type StarterScan, type TenantBootstrap } from "../api";

interface ReportPageProps {
  account: AccountInfo;
  bootstrap: TenantBootstrap;
  onSignOut: () => void;
}

export function ReportPage({ account, bootstrap, onSignOut }: ReportPageProps) {
  const [scan, setScan] = useState<StarterScan>();
  useEffect(() => { if (bootstrap.latestScan) void loadStarterScan(account, bootstrap.latestScan.scanId).then(setScan); }, [account, bootstrap.latestScan]);
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
          <span>Starter check score</span>
          <strong>{bootstrap.latestScan?.score ?? "—"}</strong>
          <p>Scan {bootstrap.latestScan?.scanId}</p>
        </div>
        <div className="starter-findings">
          {scan?.findings.map((finding) => <article key={finding.checkId} className={finding.status === "pass" ? "finding-pass" : "finding-warning"}><span>{finding.status}</span><h2>{finding.title}</h2><p>{finding.detail}</p></article>)}
        </div>
      </section>
    </main>
  );
}
