import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { initializeAuth, signIn, signOut } from "./auth";

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
          {account ? (
            <div className="account-menu">
              <span>{account.name ?? account.username}</span>
              <button className="text-button" type="button" onClick={beginSignOut}>Sign out</button>
            </div>
          ) : (
            <button className="nav-sign-in" type="button" onClick={beginSignIn} disabled={!authReady}>
              {authReady ? "Sign in" : "Loading…"}
            </button>
          )}
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
                <span>Organization identified. Read-only audit consent is the next step.</span>
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

      <section className="process" id="onboarding" aria-labelledby="process-title">
        <div className="process-heading">
          <div>
            <p className="eyebrow">Connect your organization</p>
            <h2 id="process-title">Three deliberate steps. No hidden access.</h2>
          </div>
          <p>
            Website authentication and audit authorization are separate. You can review the
            complete permission list before granting the Enterprise Application any access.
          </p>
        </div>

        <div className="onboarding-steps">
          <article className={account ? "onboarding-step is-complete" : "onboarding-step is-current"}>
            <div className="step-rail"><span>1</span><i /></div>
            <div className="step-content">
              <p className="step-state">{account ? "Complete" : "Start here"}</p>
              <h3>Sign in to identify your organization</h3>
              <p>
                Use a Microsoft organizational account. Because tenant-wide consent is required
                later, using an authorized administrator account now avoids switching accounts.
              </p>
              <p className="admin-note">
                Global Administrator can complete the full flow. Other Entra roles may be able
                to grant consent depending on the final permissions and tenant policy.
              </p>
              {!account ? (
                <button className="step-action" type="button" onClick={beginSignIn} disabled={!authReady}>
                  Sign in with Microsoft
                </button>
              ) : (
                <div className="step-confirmation">Signed in as {account.username}</div>
              )}
            </div>
          </article>

          <article className={`onboarding-step ${account ? "is-current" : "is-locked"}`}>
            <div className="step-rail"><span>2</span><i /></div>
            <div className="step-content">
              <p className="step-state">Understand the connection</p>
              <h3>Why an Enterprise Application?</h3>
              <p>
                Admin consent creates an Enterprise Application—a service principal—in your
                tenant. It is the tenant-local record of NSO Audit and shows exactly which
                read-only Microsoft Graph permissions your administrator approved.
              </p>
              <ul className="permission-facts">
                <li>No administrator password is shared with NSO Audit.</li>
                <li>Access is visible and revocable in Microsoft Entra.</li>
                <li>The assessment receives no write or remediation permissions.</li>
              </ul>
            </div>
          </article>

          <article className="onboarding-step is-locked">
            <div className="step-rail"><span>3</span></div>
            <div className="step-content">
              <p className="step-state">Administrator approval</p>
              <h3>Grant read-only audit access</h3>
              <p>
                Follow the Microsoft consent link and authenticate with an account authorized to
                grant tenant-wide admin consent. Microsoft will display every requested
                permission before anything is approved.
              </p>
              <button className="step-action" type="button" disabled>
                Consent link available after permission review
              </button>
              <p className="pending-note">
                We are intentionally keeping this disabled until the Phase 1 Graph permission
                manifest is finalized and configured.
              </p>
            </div>
          </article>
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
