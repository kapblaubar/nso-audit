const checks = [
  { number: "01", title: "Connect securely", text: "Sign in with Microsoft and review every read-only permission before consent." },
  { number: "02", title: "Run the assessment", text: "We inspect identity controls and Microsoft Secure Score without changing your tenant." },
  { number: "03", title: "Act on findings", text: "Receive prioritized findings with evidence and practical remediation guidance." },
];

export function App() {
  const [account, setAccount] = useState<AccountInfo>();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string>();

  useEffect(() => {
    void initializeAuth().then((state) => {
      setAccount(state.account);
      setAuthError(state.error);
      setAuthReady(true);
    });
  }, []);

  const beginSignIn = () => {
    setAuthError(undefined);
    void signIn().catch((error: unknown) => {
      setAuthError(error instanceof Error ? error.message : "Microsoft sign-in failed.");
    });
  };

  const beginSignOut = () => {
    void signOut().catch((error: unknown) => {
      setAuthError(error instanceof Error ? error.message : "Microsoft sign-out failed.");
    });
  };

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="NSO Audit home">
          <img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40" />
          <span className="brand-name">NSO Audit</span>
        </a>
        <div className="nav-actions">
          <a className="nav-link" href="#trust">Security & privacy</a>
          {account ? <button className="text-button" type="button" onClick={beginSignOut}>Sign out</button> : null}
        </div>
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
            {account ? (
              <div className="signed-in" aria-live="polite">
                <strong>Signed in as {account.name ?? account.username}</strong>
                <span>Tenant verified. Admin consent is the next step.</span>
              </div>
            ) : (
              <button type="button" onClick={beginSignIn} disabled={!authReady}>
                {authReady ? "Sign in with Microsoft" : "Preparing secure sign-in…"}
              </button>
            )}
          </div>
          {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
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

      <section className="brand-story" aria-labelledby="brand-story-title">
        <img
          src="/images/nso-cover.png"
          alt="Mountain landscape representing NewSommer's technology and cloud services"
          loading="lazy"
          decoding="async"
        />
        <div className="brand-story-overlay">
          <p className="eyebrow">Built by NewSommer</p>
          <h2 id="brand-story-title">A clearer route to stronger security.</h2>
          <p>
            Purpose-built cloud engineering turns a complex Microsoft tenant into a focused,
            understandable path forward.
          </p>
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

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <p className="footer-label">A NewSommer product</p>
            <img
              src="/brand/newsommer.png"
              alt="NewSommer"
              width="220"
              height="110"
              loading="lazy"
              decoding="async"
            />
          </div>
          <p>Read-only by design. Built for Microsoft cloud environments.</p>
        </div>
      </footer>
    </main>
  );
}
import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { initializeAuth, signIn, signOut } from "./auth";
