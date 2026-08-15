import { useMemo, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import type { TenantBootstrap } from "../api";
import { appConfig } from "../config";

interface OnboardingPageProps {
  account: AccountInfo;
  bootstrap?: TenantBootstrap;
  bootstrapError?: string;
  onSignOut: () => void;
}

const graphPermissions = [
  ["Policy.Read.All", "Conditional Access policies"],
  ["AuditLog.Read.All", "Authentication registration reporting"],
  ["RoleManagement.Read.Directory", "Entra roles and assignments"],
  ["SecurityEvents.Read.All", "Microsoft 365 Secure Score and recommendations"],
  ["DeviceManagementConfiguration.Read.All", "Intune policies and configuration"],
  ["DeviceManagementApps.Read.All", "Intune app protection policies"],
];

export function OnboardingPage({ account, bootstrap, bootstrapError, onSignOut }: OnboardingPageProps) {
  const [copied, setCopied] = useState(false);
  const tenantId = bootstrap?.tenantId ?? account.tenantId;
  const consentGranted = bootstrap?.consentStatus === "granted";
  const rbacConfigured = bootstrap?.azureRbacStatus === "configured";
  const currentStep = !consentGranted ? 2 : !rbacConfigured ? 3 : 4;

  const consentUrl = useMemo(() => {
    const redirectUri = appConfig.authRedirectUri ?? `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({
      client_id: appConfig.entraClientId,
      redirect_uri: redirectUri,
      scope: ".default",
    });
    return `https://login.microsoftonline.com/${tenantId}/v2.0/adminconsent?${params}`;
  }, [tenantId]);

  const copyConsentLink = async () => {
    await navigator.clipboard.writeText(consentUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const stepClass = (step: number) => step < currentStep
    ? "setup-step is-complete"
    : step === currentStep
      ? "setup-step is-current"
      : "setup-step is-locked";

  return (
    <main className="onboarding-page compact-onboarding">
      <nav className="nav" aria-label="Onboarding navigation">
        <a className="brand" href="/" aria-label="NSO Audit home">
          <img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40" />
          <span className="brand-name">NSO Audit</span>
        </a>
        <div className="account-menu">
          <div className="account-details">
            <strong>{account.name ?? "Microsoft user"}</strong>
            <span>{account.username}</span>
            <span>Tenant ID: {tenantId}</span>
          </div>
          <button className="text-button" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <section className="setup-header">
        <div>
          <p className="eyebrow">Tenant setup</p>
          <h1>Connect your tenant.</h1>
          <p>Complete the steps below to create your first read-only security scorecard.</p>
        </div>
        <div className="setup-progress" aria-label={`Setup step ${currentStep} of 4`}>
          <strong>{currentStep}<span>/4</span></strong>
          <div><i style={{ width: `${currentStep * 25}%` }} /></div>
          <span>Current setup step</span>
        </div>
      </section>

      {bootstrapError ? (
        <div className="bootstrap-notice" role="status">
          <strong>Setup status could not be refreshed.</strong>
          <span>{bootstrapError}</span>
        </div>
      ) : null}

      <section className="setup-wizard" aria-label="Tenant onboarding steps">
        <article className={stepClass(1)}>
          <span className="setup-number">1</span>
          <div className="setup-copy">
            <p className="step-state">Review access</p>
            <h2>Confirm what NSO Audit can read</h2>
            <p>One Enterprise Application reads only the policy, security, Intune, and recommendation signals needed for the scorecard. It receives no remediation or mail access.</p>
            <details className="setup-details">
              <summary>View the full permission list</summary>
              <div className="permission-groups">
                <div>
                  <h3>Microsoft Graph — application</h3>
                  {graphPermissions.map(([permission, purpose]) => <p key={permission}><code>{permission}</code><span>{purpose}</span></p>)}
                </div>
                <div>
                  <h3>Defender API — application</h3>
                  <p><code>Score.Read.All</code><span>Vulnerability Management score</span></p>
                  <p><code>SecurityRecommendation.Read.All</code><span>Critical recommendations</span></p>
                  <h3>Portal sign-in — delegated</h3>
                  <p><code>User.Read</code><span>Basic signed-in user profile and tenant context</span></p>
                  <p><code>access_as_user</code><span>Access the protected NSO Audit API for the signed-in tenant</span></p>
                  <h3>Azure roles — assigned later</h3>
                  <p><code>Reader · Security Reader · Backup Reader</code><span>Plus Log Analytics and Sentinel Reader at selected scopes</span></p>
                </div>
              </div>
              <div className="permission-exclusions"><strong>Never requested</strong><span>Write access, mail, passwords, group management, or automated remediation.</span></div>
            </details>
          </div>
        </article>

        <article className={stepClass(2)}>
          <span className="setup-number">2</span>
          <div className="setup-copy">
            <p className="step-state">Administrator approval</p>
            <h2>Grant Microsoft tenant consent</h2>
            <p>Copy the link and open it in a private/incognito window. Sign in there with an administrator authorized to grant tenant-wide consent, review Microsoft’s permission screen, and approve on behalf of the organization.</p>
            <div className="setup-actions">
              <button className="step-action" type="button" onClick={copyConsentLink}>{copied ? "Consent link copied" : "Copy administrator-consent link"}</button>
              <a href={consentUrl} target="_blank" rel="noreferrer">Open consent page</a>
            </div>
            <p className="pending-note">NSO Audit never receives or stores the administrator’s password.</p>
          </div>
        </article>

        <article className={stepClass(3)}>
          <span className="setup-number">3</span>
          <div className="setup-copy">
            <p className="step-state">Azure resource access</p>
            <h2>Assign reader roles</h2>
            <p>Choose the subscriptions and resources to assess, then run a generated PowerShell script. Every role and scope will be shown before anything is applied.</p>
            <button className="step-action" type="button" disabled>Scope selector coming next</button>
          </div>
        </article>

        <article className={stepClass(4)}>
          <span className="setup-number">4</span>
          <div className="setup-copy">
            <p className="step-state">Assessment</p>
            <h2>Run the audit</h2>
            <p>Collect the configured signals, monitor progress, and open the scorecard when the first scan finishes.</p>
            <button className="step-action" type="button" disabled>Run audit after setup</button>
          </div>
        </article>
      </section>

      <details className="disconnect-details">
        <summary>How to disconnect and remove NSO Audit</summary>
        <ol>
          <li>Delete your tenant data from NSO Audit.</li>
          <li>Remove NSO Audit role assignments from each selected Azure scope.</li>
          <li>Delete NSO Audit under Microsoft Entra ID → Enterprise applications.</li>
        </ol>
      </details>
    </main>
  );
}
