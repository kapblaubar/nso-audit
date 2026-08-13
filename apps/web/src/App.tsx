const checks = [
  { number: "01", title: "Connect securely", text: "Sign in with Microsoft and review every read-only permission before consent." },
  { number: "02", title: "Run the assessment", text: "We inspect identity controls and Microsoft Secure Score without changing your tenant." },
  { number: "03", title: "Act on findings", text: "Receive prioritized findings with evidence and practical remediation guidance." },
];

export function App() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="NSO Audit home">
          <span className="brand-mark">N</span>
          <span>NSO Audit</span>
        </a>
        <a className="nav-link" href="#trust">Security & privacy</a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Microsoft tenant security, made visible</p>
          <h1>Know where your tenant stands before risk finds the gaps.</h1>
          <p className="lede">
            A focused, read-only assessment of your Microsoft 365 and Azure security posture,
            translated into findings your team can act on.
          </p>
          <div className="actions">
            <button type="button" disabled title="Microsoft sign-in will be enabled after app registration">
              Run my free tenant check
            </button>
            <span>Phase 1 setup in progress</span>
          </div>
        </div>
        <div className="score-card" aria-label="Example security score card">
          <div className="score-heading"><span>Tenant posture</span><span className="live-dot">Read-only</span></div>
          <div className="score"><strong>74</strong><span>/ 100</span></div>
          <div className="meter"><span /></div>
          <dl>
            <div><dt>Identity</dt><dd>Needs attention</dd></div>
            <div><dt>Secure Score</dt><dd>Connected</dd></div>
            <div><dt>Changes made</dt><dd>None</dd></div>
          </dl>
        </div>
      </section>

      <section className="process" aria-labelledby="process-title">
        <p className="eyebrow">How it works</p>
        <h2 id="process-title">Clear at every step.</h2>
        <div className="steps">
          {checks.map((check) => (
            <article key={check.number}>
              <span>{check.number}</span>
              <h3>{check.title}</h3>
              <p>{check.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust" id="trust">
        <p className="eyebrow">Designed for trust</p>
        <h2>Your credentials stay yours.</h2>
        <p>
          NSO Audit never asks for an administrator password and never writes to your tenant.
          Access is explicit, reviewable, and removable from Microsoft Entra at any time.
        </p>
      </section>
    </main>
  );
}

