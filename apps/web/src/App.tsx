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
                Use your normal Microsoft organizational account to identify your home tenant
                and access its dashboard. This sign-in does not grant the scanner access.
              </p>
              <p className="admin-note">
                Do not use a privileged administrator account for routine NSO Audit access. A
                separate authorized administrator can approve access later on Microsoft's page.
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
              <p className="step-state">Review requested access</p>
              <h3>Enterprise Application permissions</h3>
              <p>
                Approval creates an Enterprise Application—a service principal—in your tenant.
                It is visible and revocable in Microsoft Entra. The core assessment requests
                only these read permissions:
              </p>
              <div className="permission-list" role="list" aria-label="Core Enterprise Application permissions">
                <div role="listitem"><code>Policy.Read.All</code><span>Conditional Access policies</span></div>
                <div role="listitem"><code>AuditLog.Read.All</code><span>Authentication registration reporting</span></div>
                <div role="listitem"><code>RoleManagement.Read.Directory</code><span>Entra roles and assignments</span></div>
                <div role="listitem"><code>SecurityEvents.Read.All</code><span>Microsoft 365 Secure Score and recommendations</span></div>
              </div>
              <details className="optional-permissions">
                <summary>Permissions added only when optional scorecard modules are enabled</summary>
                <div className="permission-list compact" role="list">
                  <div role="listitem"><code>DeviceManagementConfiguration.Read.All</code><span>Intune compliance, configuration, and security policies</span></div>
                  <div role="listitem"><code>DeviceManagementApps.Read.All</code><span>Intune app configuration and app-protection policies</span></div>
                  <div role="listitem"><code>Score.Read.All</code><span>Defender Vulnerability Management score</span></div>
                  <div role="listitem"><code>SecurityRecommendation.Read.All</code><span>Defender vulnerability recommendations</span></div>
                </div>
              </details>
              <div className="permission-exclusions">
                <strong>Explicitly excluded</strong>
                <span>No write access, mail, passwords, group management, or remediation permissions.</span>
              </div>
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
                permission before anything is approved. This administrator may be different from
                the dashboard user and authenticates directly with Microsoft.
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
        <aside className="azure-access-note">
          <div>
            <p className="step-state">Separate optional setup</p>
            <h3>Azure subscription roles are not Graph permissions</h3>
          </div>
          <p>
            Azure resource, Defender for Cloud, Recovery Services, Log Analytics, and Sentinel
            checks use separately scoped Azure roles. Customers assign only the selected roles
            later, manually or with an inspectable PowerShell script. They are not required for
            the core Graph assessment.
          </p>
        </aside>
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
