# Tenant Security Posture Check — Requirements Document

## 1. Purpose

A self-service web product that lets an authorized Microsoft 365 / Azure tenant user run a
free, read-only security posture assessment of their organization. A normal organizational
account signs in to the dashboard. A separate, Microsoft-hosted admin-consent flow lets an
authorized administrator approve the Enterprise Application without using that privileged
account as the ordinary NSO Audit dashboard session. Optional Azure RBAC read access is granted
separately and only when Azure-resource modules are enabled.

This is a **single central multi-tenant SaaS**: one App Registration, one Function App, one
storage account, serving many customer tenants. Every stored record and every dashboard query
is partitioned and scoped by `tenantId`.

## 2. Goals / Non-Goals

**Goals**
- Read-only assessment. No writes to the customer tenant at any point.
- Self-service: a normal organizational user signs in, reviews the exact requested access, an
  authorized administrator grants tenant-wide consent at Microsoft, and the user runs a scan.
- Clear, scoped permissions — request the minimum needed per data source.
- Tenant data isolation — one customer can never see another's data.
- Results are actionable (scored findings, not a raw data dump).

**Non-Goals (v1)**
- No remediation actions (no write-back, no auto-fix).
- No continuous/scheduled scanning in v1 — on-demand scan only (design should not block adding
  a schedule later).
- No per-customer infrastructure deployment (that's a "Not Now" architecture, not this one).
- No embedded browser terminal in v1. Admins run a downloadable, inspectable script locally or
  in Azure Cloud Shell; the service never proxies an interactive administrative session.
- No collection or storage of customer administrator passwords or other customer credentials.

## 3. End-to-End User Flow

1. User visits the marketing/landing page and signs in with a normal, non-privileged Microsoft
   organizational account. The backend establishes the user's home `tenantId`. The UI must
   explicitly discourage using Global Administrator for the ordinary dashboard session.
2. The onboarding page lists every requested Microsoft Graph application permission, its
   purpose, and the explicit exclusions (no write, mail, or remediation access).
3. User opens the Microsoft-hosted admin-consent URL for the Enterprise App
   (`https://login.microsoftonline.com/{tenant}/adminconsent?client_id={appId}&...`).
   An authorized administrator may authenticate with a different account on Microsoft's page;
   that privileged account is not used to establish or replace the NSO Audit dashboard session.
4. Administrator reviews the requested permissions and approves. This creates a Service
   Principal (Enterprise Application) in the customer tenant and grants the listed Graph
   application permissions.
5. Microsoft redirects to the onboarding callback. The API verifies the consent result
   independently and records consent status for the tenant.
6. For later Azure-resource modules only, the onboarding page provides a versioned,
   downloadable PowerShell script and copyable Azure Cloud Shell command. The administrator can
   inspect the script before running it. This script:
   - Confirms the Service Principal exists in the tenant.
   - Assigns the Azure RBAC roles the app needs for Log Analytics / Sentinel / subscription-level
     data (Graph admin consent alone does **not** grant ARM/subscription access — this is a
     separate consent step and must be called out explicitly to the admin).
   - Optionally scopes those roles to specific subscriptions/resource groups the admin selects.
   - Supports a validation/dry-run mode and prints every role assignment it will create.
   - Reports completion either through a short-lived, single-use callback token or through a
     confirmation value the admin pastes into the onboarding page. It never sends credentials.
7. The API independently verifies Graph consent and, when optional Azure modules are selected,
   the expected Azure RBAC assignments. The user then clicks **"Start scan."** A Phase 1
   Graph-only scan must not require Azure subscription RBAC.
8. Function App authenticates as the app (client credentials flow) against the customer's
   tenant, and pulls data from each in-scope data source (see §6).
9. Results are normalized, scored, and written to the storage account under that tenant's
   partition.
10. Dashboard polls/loads and renders the scored results per tenant, with drill-down detail.
11. Authorized users can re-run the scan on demand; each run is versioned (see §7.3).

## 4. High-Level Architecture

```
[Static Web App: Landing / Sign-in / Consent / Onboarding / Results]
                               |
                               v
                    [Admin Consent (Entra ID)]
                               |
                               v
                  [Onboarding Page + RBAC script]
                                                          |
                                                          v
                                              [Web API / App Service]
                                                (auth, tenant registry,
                                                 triggers scans)
                                                          |
                                                          v
                                                  [Function App]
                                       (per-data-source scan modules, timer
                                        or HTTP-triggered, client-credential
                                        auth into customer tenant)
                                                          |
                             +----------------------------+----------------------------+
                             v                             v                            v
                     [Microsoft Graph]           [Azure Resource Manager /       [Purview /
                (Entra ID, Intune, Secure          Log Analytics / Sentinel]     Compliance APIs]
                 Score, Conditional Access)
                                                          |
                                                          v
                                              [Storage Account]
                                     (Table Storage or Cosmos DB for scored
                                      results + metadata; Blob for raw JSON)
                                                          |
                                                          v
                                                    [Dashboard]
                                       (per-tenant scoped view, authenticated
                                        with a normal organizational account)
```

## 5. Components

### 5.1 Landing / Marketing Page
- Static page deployed with the authenticated frontend. Explains what the tool checks, what
  permissions it needs, that it's read-only, and links to a privacy policy / terms of use
  (**required** for Microsoft's admin consent screen to look trustworthy and, eventually, for
  publisher verification).
- Primary CTA: "Sign in with Microsoft" → normal organizational sign-in. Admin consent is a
  separate action shown only after the permission review.

The static frontend may be hosted on Azure Static Web Apps or equivalent static hosting, but
it must not contain confidential credentials or enforce tenant isolation by itself. All
authorization and tenant-scoped data access are server-side responsibilities of the Web API.

### 5.2 Enterprise App (Entra ID App Registration)
- One central, vendor-owned, multi-tenant App Registration is used for the SaaS. Admin consent
  creates a Service Principal (shown as an Enterprise Application) in each customer tenant;
  v1 does not create a separate customer-owned App Registration or Key Vault.
- Type: multi-tenant.
- Auth: supports both delegated (for normal user login to the site) and application permissions
  (for the Function App's unattended data pulls) — see §6 for exact scopes.
- **Publisher verification** should be completed before public launch or the consent screen will
  show an "unverified" warning that will scare off admins.
- Redirect URI(s) point back to the onboarding page on our site.

### 5.3 Web API / App Service (orchestration layer)
- Handles: organizational user login (OIDC), tenant registration record (tenantId, display name, consent
  timestamp, RBAC-onboarding status, subscription/RG scope selected), triggering scans, exposing
  scan status/results to the dashboard.
- Enforces tenant isolation: a logged-in user can only ever query data for their own
  `tenantId`.

### 5.4 Optional Azure RBAC Onboarding Script
- Not required for the Phase 1 Graph-only scan. When Azure-resource modules are enabled, an
  authorized subscription administrator runs an idempotent PowerShell (or Az CLI) script
  themselves; we never hold their credentials.
- Responsibilities:
  - Verify our Service Principal exists (from admin consent).
  - `New-AzRoleAssignment` (or `az role assignment create`) to grant our SP the roles in §6.2,
    scoped to subscriptions/RGs the admin picks.
  - Print a confirmation token/summary the admin pastes back into the onboarding page (or the
    script calls back to our API directly with a short-lived admin token) so we know onboarding
    is complete before enabling "Start scan."
  - Provide `-WhatIf` or an equivalent validation mode, explicit scope parameters, useful exit
    codes, and a summary of assignments created, already present, skipped, or failed.
  - Be downloadable from a stable, versioned URL with a published checksum. The onboarding UI
    must show the exact script version and requested roles before the admin runs it.

An embedded terminal is out of scope for v1. If reconsidered later, it requires a separate
threat model, session isolation design, credential-handling review, and audit logging design.

### 5.5 Function App
- One function/module per data source, orchestrated by a parent scan function.
- Auth: client credentials flow (app ID + certificate, not a client secret, for production —
  see §8) against the target `tenantId`.
- Each module: calls its API, normalizes response into a common finding schema (see §7.2),
  computes a sub-score, handles pagination/throttling/partial failures gracefully (one data
  source failing must not fail the whole scan).
- Output: writes normalized findings + raw response (for audit/debug) to storage.
- Language/runtime: left to implementation discretion — Python or C# both have solid Graph SDK
  support and are reasonable defaults; PowerShell is a lower-effort option given the ecosystem
  familiarity but is harder to scale/test. Recommend **Python or C# on the isolated worker
  model** unless there's a reason to prefer PowerShell.

The Function App uses its managed identity to retrieve the vendor-owned application
certificate from Key Vault. Key Vault contains no customer administrator passwords. Storage
and Key Vault access should use managed identity rather than account keys in configuration.

### 5.6 Storage Account
- Table Storage or Cosmos DB (table API) for structured, queryable findings — partition key
  `tenantId`, row key `scanId#findingId`.
- Blob Storage for raw API responses per scan run (useful for support/debugging, not shown to
  the admin directly).
- Encryption at rest (default for Azure Storage), and access restricted to the Function App /
  API via managed identity — no shared keys embedded in code.

### 5.7 Dashboard
- Shows: overall posture score, per-category scores (Identity, Devices, Data/Compliance,
  Detection & Response), individual findings with severity and remediation guidance text,
  scan history (score over time once more than one scan exists).
- Implementation left to discretion. A static web app calling the Web API is simplest and keeps
  a clean separation from the orchestration layer; a full React SPA is reasonable if richer
  interactivity (filtering, drill-downs) is wanted. Power BI embedded is viable but adds
  licensing/embedding complexity for a v1 free tool — probably overkill unless there's a reason
  to reuse existing BI infrastructure.
- Auth: same OIDC login as onboarding; dashboard queries are always scoped server-side by the
  logged-in user's `tenantId`.

## 6. Data Sources & Required Permissions

### 6.1 Microsoft Graph (application permissions, admin-consented)

#### Phase 1 permission allowlist

| Phase 1 check | Microsoft Graph application permission | Why it is required |
|---|---|---|
| Conditional Access policy coverage | `Policy.Read.All` | Read Conditional Access policies; no policy modification |
| Authentication-method registration | `AuditLog.Read.All` | Read the authentication methods user-registration report |
| Directory role assignments | `RoleManagement.Read.Directory` | Read directory RBAC assignments and definitions |
| Microsoft Secure Score | `SecurityEvents.Read.All` | Read Secure Score and control-profile data |

The frontend also uses delegated `User.Read` for basic organizational sign-in. It is not used
by the unattended scanner. Phase 1 must not request `Directory.Read.All`, mail access, group
access, Intune permissions, Defender machine/vulnerability permissions, Exchange management,
or any `ReadWrite` permission. Permissions for later modules are added only when that module is
implemented and enabled.

#### Later-phase permission candidates

These permissions are not requested in Phase 1. Each must be revalidated against the exact API
operation when its module is implemented.

| Data source | Example later signals | Candidate Graph permission(s) |
|---|---|---|
| Entra risk | Risk detections and risky sign-ins | Identity Protection read permissions, selected against the implemented endpoint |
| Intune / Devices | Device compliance state, configuration policy coverage | `DeviceManagementManagedDevices.Read.All`, `DeviceManagementConfiguration.Read.All` |
| Purview / Compliance | DLP policy coverage, sensitivity label usage, retention policies | `InformationProtectionPolicy.Read.All`, and/or Purview/Compliance-specific Graph beta endpoints — confirm current API surface at build time, this area changes |
| Defender signals (optional, stretch) | Alerts, recommendations, software, and vulnerability summaries | Select only the read permission for each implemented Microsoft Defender endpoint |

> Note: exact Purview/Compliance Graph endpoints are still evolving (some require the beta
> endpoint or the separate Microsoft Purview compliance APIs / Office 365 Management Activity
> API). Validate current availability before finalizing scope list.

### 6.2 Azure Resource Manager (RBAC role assignment, granted by the onboarding script — separate from Graph admin consent)

| Data source | Example signals pulled | Required Azure RBAC role |
|---|---|---|
| Log Analytics workspaces | Whether diagnostic logging is enabled/retained, workspace configuration | `Log Analytics Reader` |
| Microsoft Sentinel (if present) | Analytics rules enabled, data connector status | `Sentinel Reader` (or `Log Analytics Reader` if Sentinel isn't in scope for v1) |
| General resource visibility (for scoping) | Which subscriptions/RGs exist, so the customer can pick scan scope | `Reader` at subscription level |

Call out explicitly in the onboarding UI: **admin consent (step 4) only grants Graph API
access. Azure RBAC roles (step 6) are a separate, explicit grant the customer controls and scopes
themselves.** Don't blur these into one "approve everything" step — it undermines the
least-privilege story that makes this tool trustworthy.

## 7. Data Model & Scan Semantics

### 7.1 Tenant registration record
`tenantId`, `displayName`, `consentedAt`, `rbacOnboardedAt`, `scopedSubscriptionIds[]`,
`lastScanId`, `status` (not-onboarded / onboarded / scanning / scanned / error).

### 7.2 Finding schema (normalized, one shape across all data sources)
`scanId`, `tenantId`, `category` (Identity / Devices / Data / Detection), `sourceSystem`
(Graph/Intune/Purview/LogAnalytics), `checkId`, `title`, `severity` (High/Medium/Low/Info),
`status` (Pass/Fail/Warning/NotApplicable), `details` (free text or structured),
`remediationGuidance`, `rawRef` (pointer to the blob with raw API response).

### 7.3 Scan versioning
Each "Start scan" click creates a new `scanId`. Old scans are retained (retention policy TBD,
recommend 90 days default) so score-over-time trending is possible later without redesign.

## 8. Security & Compliance Requirements

- **Least privilege**: request only the scopes/roles actually used by an active module; don't
  request permissions "in case we need them later."
- **Read-only, always**: no permission in §6 should ever be a write scope. This should be an
  automated check in CI (lint the permission manifest) not just a code review convention.
- **Certificate-based auth** for the Function App's client-credential flow in production, not a
  long-lived client secret. Store the cert in Key Vault, accessed via managed identity.
- **No customer credentials ever held by us** — normal users authenticate through Microsoft,
  authorized administrators grant consent on Microsoft's page, and subscription administrators
  run any optional RBAC script in their own Azure session. Never ask for a password or
  long-lived customer credential.
- **Privileged-account separation**: do not instruct customers to use Global Administrator as
  their routine NSO Audit dashboard identity. The admin-consent action must support a different
  authorized account and must not replace the normal user's dashboard session.
- **Tenant isolation** enforced at every layer: storage partition key, API query scoping, and
  dashboard auth — not just one of these.
- **Data retention & deletion**: publish a clear retention period and an admin-triggered "delete
  my data" action (removes the tenant's stored findings and revokes the Service Principal
  guidance).
- **Transparency**: the landing page should list, in plain language, every permission requested
  and why — this is both good practice and reduces admin drop-off at the consent screen.
- **Logging**: log scan runs and API calls for support/debugging, but never log full raw
  identity data (e.g., don't log full user lists) beyond what's needed for the finding itself.

## 9. Non-Functional Requirements

- **Resilience**: a single data-source module failing (throttled, permission not yet propagated,
  API error) should produce a partial scan with that category marked "incomplete," not fail the
  whole run.
- **Throttling/backoff**: Graph and ARM both throttle — implement retry with backoff per SDK
  guidance.
- **Cost**: consumption-plan Function App is a reasonable default for on-demand, low-frequency
  scans; revisit if a scheduled/continuous model is added later.
- **Scalability**: design scan modules to be independently invocable (fan-out per data source)
  so scan latency doesn't scale linearly with the number of checks.

## 10. Suggested Phasing

1. **Phase 1 — Core loop**: static frontend, authenticated tenant context, consent flow,
   protected API, versioned onboarding script, Function App pulling Entra ID and Secure Score
   only, storage, scan status, minimal results dashboard, and tenant-data deletion. This proves
   the complete consent-to-results loop. Azure RBAC setup may be demonstrated but is not
   required to run the Graph-only scan.
2. **Phase 2 — Add data sources**: Intune, Log Analytics/Sentinel, Purview, in that rough order
   of API stability/simplicity.
3. **Phase 3 — Dashboard polish**: scoring model, remediation guidance content, scan history.
4. **Phase 4 — Hardening**: publisher verification, retention-policy automation, deletion-flow
   validation, CI permission linting, and load testing.

### 10.1 Phase 1 acceptance criteria

- A normal organizational user can sign in and establish tenant context without administrator
  privileges.
- A different authorized administrator can grant consent on Microsoft's page, return to the
  correct tenant-scoped onboarding flow, and leave the normal dashboard session unchanged.
- The application requests only the read-only Graph application permissions used by the
  Phase 1 checks.
- The onboarding page provides the versioned PowerShell script, but a Graph-only scan does not
  require unnecessary Azure subscription RBAC.
- Starting a scan creates a unique `scanId`; duplicate clicks do not create overlapping scans
  for the same tenant.
- Entra ID and Secure Score modules can succeed or fail independently, and partial results are
  clearly labeled incomplete.
- An authenticated user cannot request another tenant's scan status, findings, raw artifacts,
  or deletion operation by changing a client-supplied identifier.
- No secret, private key, storage key, or privileged token is shipped to the static frontend or
  written to application logs.
- An authorized tenant user can delete stored tenant scan data and is shown instructions for removing the
  Enterprise Application and Azure RBAC assignments.
- Automated tests cover tenant authorization, scan state transitions, permission-manifest
  validation, normalization, and representative API failure/throttling behavior.

## 11. Initial Product Decisions

- **Frontend**: static web application for landing, authentication handoff, onboarding, scan
  status, and results; all privileged operations go through the protected API.
- **Identity topology**: one vendor-owned multi-tenant App Registration and one Service
  Principal per consenting customer tenant.
- **User identity**: ordinary dashboard sign-in uses a normal organizational account; Global
  Administrator is neither requested nor recommended for routine site access.
- **Consent identity**: tenant-wide Graph consent occurs separately on Microsoft's endpoint and
  may use a different authorized administrator account.
- **Workload authentication**: certificate-based client credentials; the private key is stored
  in the vendor Key Vault and read by the Function App through managed identity.
- **Customer setup**: Azure RBAC onboarding is optional, begins after the Graph-only Phase 1
  flow, and uses downloadable PowerShell/Azure Cloud Shell rather than an embedded terminal.
- **Phase 1 sources**: Entra ID and Secure Score. Intune, Azure resource data, Sentinel, and
  Purview follow after the core flow is proven.
- **Credential boundary**: customer administrator credentials are never requested, proxied, or
  stored.

## 12. Open Questions (resolve before/while building)

- Exact current Graph/Purview API surface for compliance data (beta vs GA endpoints) — verify
  at build time since this area shifts.
- Scoring methodology: weighted average vs. Microsoft's own Secure Score reused as one input
  among several — needs a product decision, not just an engineering one.
- Which Sentinel checks should enter Phase 2 and at what Azure scope the required reader role
  should be assigned.
- Retention period for stored scan data (compliance/legal input needed, not just a technical
  default).
