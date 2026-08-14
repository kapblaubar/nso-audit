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
              <div className="account-details" aria-label="Signed-in account details">
                <strong>{account.name ?? "Microsoft user"}</strong>
                <span>{account.username}</span>
                <span>Tenant ID: {account.tenantId}</span>
              </div>
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
          <p className="eyebrow">Read-only Microsoft cloud assessment</p>
          <h1>One clear view of your tenant's security posture.</h1>
          <p className="lede">
            NSO Audit collects configuration, policy, score, resilience, and logging signals
            from one consented Enterprise Application—then turns them into a tenant-scoped
            scorecard and prioritized recommendations.
          </p>
          {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
        </div>
        <div className="score-card score-pending" aria-label="Security score status">
          <div className="score-heading"><span>Tenant scorecard</span><span className="live-dot">Read-only</span></div>
          <div className="pending-score-mark" aria-hidden="true">—</div>
          <strong>Score available after registration</strong>
          <p>Connect the Enterprise Application and complete the first assessment to see verified results here.</p>
        </div>
      </section>

      <section className="app-overview" aria-labelledby="overview-title">
        <p className="eyebrow">What the Enterprise Application does</p>
        <h2 id="overview-title">Collect only what the scorecard needs.</h2>
        <div className="overview-grid">
          <article>
            <span>01</span>
            <h3>Reads posture signals</h3>
            <p>Retrieves selected tenant configuration, policy settings, secure scores, recommendations, backup posture, and logging coverage.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Never changes the tenant</h3>
            <p>Receives read permissions and scoped reader roles only. It cannot remediate, edit policies, manage groups, or read mail.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Protects tenant results</h3>
            <p>Stores findings encrypted in Azure Storage under the validated tenant ID. The API returns them only to authorized users from that tenant.</p>
          </article>
        </div>

        <div className="full-permissions" aria-labelledby="permissions-title">
          <div className="permission-intro">
            <div>
              <p className="step-state">Complete authorization catalog</p>
              <h3 id="permissions-title">One Enterprise Application</h3>
            </div>
            <p>
              The same service principal receives the API permissions and customer-selected
              Azure reader roles below. There is no second customer Enterprise Application.
            </p>
          </div>
          <div className="permission-columns">
            <div>
              <h4>Microsoft Graph — application</h4>
              <div className="permission-list" role="list">
                <div role="listitem"><code>Policy.Read.All</code><span>Conditional Access policies</span></div>
                <div role="listitem"><code>AuditLog.Read.All</code><span>Authentication registration reporting</span></div>
                <div role="listitem"><code>RoleManagement.Read.Directory</code><span>Entra roles and assignments</span></div>
                <div role="listitem"><code>SecurityEvents.Read.All</code><span>Microsoft 365 Secure Score and recommendations</span></div>
                <div role="listitem"><code>DeviceManagementConfiguration.Read.All</code><span>Intune compliance, configuration, and security policies</span></div>
                <div role="listitem"><code>DeviceManagementApps.Read.All</code><span>Intune app configuration and protection policies</span></div>
              </div>
            </div>
            <div>
              <h4>Defender API — application</h4>
              <div className="permission-list" role="list">
                <div role="listitem"><code>Score.Read.All</code><span>Defender Vulnerability Management score</span></div>
                <div role="listitem"><code>SecurityRecommendation.Read.All</code><span>Critical vulnerability recommendations</span></div>
              </div>
              <h4>Dashboard sign-in — delegated</h4>
              <div className="permission-list" role="list">
                <div role="listitem"><code>User.Read</code><span>Basic signed-in user profile and tenant context</span></div>
              </div>
            </div>
          </div>
          <div className="azure-role-list">
            <h4>Azure RBAC — assigned later at customer-selected scopes</h4>
            <div><code>Reader</code><code>Security Reader</code><code>Backup Reader</code><code>Log Analytics Reader</code><code>Microsoft Sentinel Reader</code></div>
          </div>
          <div className="permission-exclusions">
            <strong>Not requested</strong>
            <span>No write access, mail, passwords, group management, remediation, or broad Defender machine inventory. Purview DLP uses a customer-reviewed export until a narrow unattended API is approved.</span>
          </div>
        </div>
      </section>

      <section className="process" id="onboarding" aria-labelledby="process-title">
        <div className="process-heading">
          <div>
            <p className="eyebrow">Registration and assessment</p>
            <h2 id="process-title">Four steps to your scorecard.</h2>
          </div>
          <p>
            Sign in normally to view reports. A separate administrator approves the Enterprise
            Application directly on Microsoft's consent page.
          </p>
        </div>

        <div className="onboarding-steps">
          <article className={account ? "onboarding-step is-complete" : "onboarding-step is-current"}>
            <div className="step-rail"><span>1</span><i /></div>
            <div className="step-content">
              <p className="step-state">{account ? "Dashboard sign-in complete" : "Start here"}</p>
              <h3>Open the Microsoft administrator-consent link</h3>
              <p>
                First sign in to NSO Audit with your normal Microsoft organizational account.
                NSO Audit derives your Tenant ID from Microsoft's validated token—there is no
                need to type it into a form. Then copy the consent link into a private/incognito
                browser window and sign in there with an authorized administrator account.
              </p>
              <p className="admin-note">
                Browsers do not allow a website to force an incognito window. The administrator
                should open the link privately or use a separate browser profile.
              </p>
              {!account ? (
                <button className="step-action" type="button" onClick={beginSignIn} disabled={!authReady}>
                  Sign in with Microsoft
                </button>
              ) : (
                <div className="step-confirmation">
                  <strong>{account.name ?? "Microsoft user"}</strong>
                  <span>{account.username}</span>
                  <span>Tenant ID: {account.tenantId}</span>
                </div>
              )}
            </div>
          </article>

          <article className={`onboarding-step ${account ? "is-current" : "is-locked"}`}>
            <div className="step-rail"><span>2</span><i /></div>
            <div className="step-content">
              <p className="step-state">Microsoft consent screen</p>
              <h3>Approve on behalf of the organization</h3>
              <p>
                Microsoft displays the application name and requested permissions. The
                administrator reviews them, selects <strong>Consent on behalf of your organization</strong>,
                and accepts. A walkthrough image will be added here before launch.
              </p>
              <div className="screenshot-placeholder" role="img" aria-label="Microsoft admin consent walkthrough image coming soon">
                <span>Consent-screen walkthrough</span>
                <strong>Screenshot coming soon</strong>
              </div>
            </div>
          </article>

          <article className="onboarding-step is-locked">
            <div className="step-rail"><span>3</span><i /></div>
            <div className="step-content">
              <p className="step-state">Azure resource access</p>
              <h3>Assign selected subscription reader roles</h3>
              <p>
                Graph consent does not grant Azure subscription access. Select the subscriptions,
                workspaces, vaults, and Sentinel instances to assess, then review and run the
                generated PowerShell script with <code>-WhatIf</code> before applying it.
              </p>
              <button className="step-action" type="button" disabled>
                Azure scope selection coming next
              </button>
              <p className="pending-note">
                This space will hold the scope selector, exact role assignments, downloadable
                script, checksum, and validation result.
              </p>
            </div>
          </article>

          <article className="onboarding-step is-locked">
            <div className="step-rail"><span>4</span></div>
            <div className="step-content">
              <p className="step-state">Assessment</p>
              <h3>Run the audit and review the report</h3>
              <p>
                Start the collection, watch each source complete, and open the scorecard when
                results arrive. Return at any time to review retained scans or run another
                assessment.
              </p>
              <button className="step-action" type="button" disabled>Run audit after setup</button>
            </div>
          </article>
        </div>

        <aside className="disconnect-box">
          <div>
            <p className="step-state">Disconnect at any time</p>
            <h3>Remove NSO Audit completely</h3>
          </div>
          <ol>
            <li>In NSO Audit, choose <strong>Delete my tenant data</strong> and confirm deletion.</li>
            <li>In each selected Azure scope, open <strong>Access control (IAM) → Role assignments</strong> and remove assignments for NSO Audit.</li>
            <li>Open <strong>Microsoft Entra ID → Enterprise applications → NSO Audit → Properties → Delete</strong>.</li>
          </ol>
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
