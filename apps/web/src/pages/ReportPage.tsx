import type { AccountInfo } from "@azure/msal-browser";
import type { TenantBootstrap } from "../api";

interface ReportPageProps {
  account: AccountInfo;
  bootstrap: TenantBootstrap;
  onSignOut: () => void;
}

export function ReportPage({ account, bootstrap, onSignOut }: ReportPageProps) {
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
          <span>Latest score</span>
          <strong>{bootstrap.latestScan?.score ?? "—"}</strong>
          <p>Scan {bootstrap.latestScan?.scanId}</p>
        </div>
        <div className="screenshot-placeholder"><span>Detailed report</span><strong>Category scores and findings are the next implementation step</strong></div>
      </section>
    </main>
  );
}
