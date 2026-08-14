interface LandingPageProps {
  authReady: boolean;
  authError?: string;
  onSignIn: () => void;
}

export function LandingPage({ authReady, authError, onSignIn }: LandingPageProps) {
  return (
    <main className="landing-page">
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="NSO Audit home">
          <img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40" />
          <span className="brand-name">NSO Audit</span>
        </a>
        <div className="nav-actions">
          <a className="nav-link" href="#how-it-works">How it works</a>
          <a className="nav-link" href="#trust">Security & privacy</a>
          <button className="nav-sign-in" type="button" onClick={onSignIn} disabled={!authReady}>
            {authReady ? "Sign in" : "Loading…"}
          </button>
        </div>
      </nav>

      <section className="landing-hero" id="top">
        <p className="eyebrow">Read-only Microsoft cloud assessment</p>
        <h1>See the security posture your tenant is actually running.</h1>
        <p>
          NSO Audit turns Microsoft 365 and Azure configuration, policy, resilience, logging,
          and secure-score signals into one understandable client scorecard.
        </p>
        <button type="button" onClick={onSignIn} disabled={!authReady}>Sign in with Microsoft</button>
        {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
      </section>

      <section className="landing-summary" id="how-it-works" aria-labelledby="landing-summary-title">
        <p className="eyebrow">How it works</p>
        <h2 id="landing-summary-title">Consent. Collect. Understand.</h2>
        <div>
          <article><span>01</span><h3>Connect read-only</h3><p>Review the full permission catalog before an authorized administrator approves the single Enterprise Application.</p></article>
          <article><span>02</span><h3>Collect securely</h3><p>Run tenant-scoped checks without sharing passwords or granting remediation access.</p></article>
          <article><span>03</span><h3>Prioritize action</h3><p>Review scores, collection coverage, and the most important recommendations from each available source.</p></article>
        </div>
      </section>

      <section className="screenshot-preview" aria-labelledby="preview-title">
        <div><p className="eyebrow">Product preview</p><h2 id="preview-title">Your scorecard, without the noise.</h2><p>Dashboard screenshots and sample findings will appear here as the reporting experience is completed.</p></div>
        <div className="screenshot-placeholder"><span>Report preview</span><strong>Screenshot coming soon</strong></div>
      </section>

      <section className="landing-trust" id="trust">
        <p className="eyebrow">Designed for trust</p>
        <h2>Read-only access. Tenant-isolated results.</h2>
        <p>Data is encrypted in Azure Storage under the validated Tenant ID and returned only through the protected API to authorized users from that tenant.</p>
      </section>
    </main>
  );
}

