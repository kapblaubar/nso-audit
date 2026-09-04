# Tenant Security Posture Check — Requirements Document

## 1. Purpose

A self-service web product that lets an authorized Microsoft 365 / Azure tenant user run a
free, read-only security posture assessment of their organization. A normal organizational
account signs in to the dashboard. A separate, Microsoft-hosted admin-consent flow lets an
authorized administrator approve the Enterprise Application without using that privileged
account as the ordinary NSO Audit dashboard session. Optional Azure RBAC read access is granted
separately and only when Azure-resource modules are enabled.

An MSP may deploy one instance in its own hosting tenant and use it to assess both that tenant
and multiple consented customer tenants. A customer may instead deploy a dedicated instance in
its own tenant. Each deployed instance has one App Registration, one Function App, and one
storage account. Every stored record and dashboard query is partitioned and scoped by the
selected audit-target `tenantId`; the signed-in operator's home tenant is not automatically the
audit target.

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

### 3.1 Deployment and operating use cases

- **MSP-hosted multi-customer**: authorized MSP operators sign in to an instance hosted in the
  MSP tenant, select a customer from a server-authorized tenant registry, and run or review that
  customer's assessments. Adding a customer requires independent admin consent in the customer
  tenant and any separately selected Azure RBAC assignments.
- **Hosting-tenant assessment**: the MSP can register its own tenant as an audit target and run
  the same consent, access verification, baseline evaluation, storage isolation, and reporting
  path used for a customer. Hosting the application does not implicitly authorize an audit.
- **Customer-hosted dedicated**: a customer deploys its own instance and ordinarily registers
  only its own tenant. The tenant selector may be hidden, but the same target-authorization
  checks remain enforced by the API.

Login proves the operator's identity; it does not grant access to every onboarded tenant. The API
maintains and enforces the mapping between an MSP organization, its authorized operators, and its
managed audit-target tenants. A browser-supplied tenant ID is never authoritative.

### 3.2 Assessment flow

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
- Auth: client credentials flow against the selected target `tenantId`. The Function App uses
  its user-assigned managed identity to retrieve the vendor-owned App Registration client secret
  from the hosting deployment's Key Vault. The App Registration and each tenant's consented
  Enterprise Application hold only the read permissions required by active scanner modules.
- Each module: calls its API, normalizes response into a common finding schema (see §7.2),
  computes a sub-score, handles pagination/throttling/partial failures gracefully (one data
  source failing must not fail the whole scan).
- Output: writes normalized findings + raw response (for audit/debug) to storage.
- Language/runtime: left to implementation discretion — Python or C# both have solid Graph SDK
  support and are reasonable defaults; PowerShell is a lower-effort option given the ecosystem
  familiarity but is harder to scale/test. Recommend **Python or C# on the isolated worker
  model** unless there's a reason to prefer PowerShell.

One App Registration client secret is created per deployed NSO Audit application and stored only
in a dedicated hosting Key Vault. The vault must contain no unrelated application secrets, and
its data-plane access is limited to the Function's managed identity and explicitly authorized
credential administrators. The secret is not copied into Function settings and is not recreated
in each customer tenant. Customer admin consent creates a Service Principal that trusts the same
application identity. The hosting tenant follows this same consent, authorization, and assessment
path when it is selected as an audit target. The secret must have automated rotation, overlap
between old and new versions, expiry monitoring, and a documented emergency-revocation process.
Key Vault contains no customer administrator passwords. Storage and Key Vault access use managed
identity rather than account keys in configuration.

### 5.6 Storage Account
- Table Storage or Cosmos DB (table API) for structured, queryable findings — partition key
  `tenantId`, row key `scanId#findingId`.
- Blob Storage for raw API responses per scan run (useful for support/debugging, not shown to
  the admin directly).
- Encryption at rest (default for Azure Storage), and access restricted to the Function App /
  API via managed identity — no shared keys embedded in code.

### 5.7 Dashboard
- Shows: the versioned NSO assessment score and coverage, source scores, assessment families,
  individual findings with severity and remediation guidance, and score history once more than
  one scan exists.
- The report hierarchy is:
  - **Microsoft 365** — Microsoft's Secure Score summary and its five Microsoft-defined
    categories (`Identity`, `Data`, `Device`, `Apps`, and `Infrastructure`) remain together.
    NSO checks are mapped beneath the relevant category; Conditional Access belongs under
    `Identity`, and DLP/Purview belongs under `Data` (displayed as **Data protection**).
  - **Azure** — Defender for Cloud score/recommendations and other Azure configuration checks.
  - **Detection & Response** — operational security signals grouped by source, including
    Microsoft Defender alerts/incidents, Defender for Cloud alerts, and Microsoft Sentinel.
    Alert settings (notification routing, severity thresholds, suppression, and forwarding)
    appear with Alerting. Sentinel data connectors appear under the Microsoft Sentinel
    configuration/coverage subsection.
  - **Resilience** — backup and recovery posture.
- Microsoft source scores and NSO baseline scores must be labeled separately. An NSO Identity
  control group must not be presented as if it were the entire Microsoft 365 Identity category.
- Alert volume is not itself a configuration score. Display counts by severity, status, source,
  and age, plus response measures such as unresolved high-severity alerts and time open. Any
  future alert-based scoring rule must be versioned, explainable, and account for tenant size and
  licensing; "more alerts means a lower posture score" is prohibited as a default rule.
- Implementation left to discretion. A static web app calling the Web API is simplest and keeps
  a clean separation from the orchestration layer; a full React SPA is reasonable if richer
  interactivity (filtering, drill-downs) is wanted. Power BI embedded is viable but adds
  licensing/embedding complexity for a v1 free tool — probably overkill unless there's a reason
  to reuse existing BI infrastructure.
- Auth: same OIDC login as onboarding; dashboard queries are always scoped server-side by the
  logged-in user's `tenantId`.

### 5.8 Frontend routes and tenant bootstrap

The product has three user-facing routes plus a technical authentication callback:

- `/` — public landing page with product overview, simple process, screenshot placeholders,
  trust/privacy summary, and sign-in.
- `/onboarding` — authenticated setup, permissions, consent, Azure RBAC, scan launch/progress,
  deletion, and disconnect guidance for tenants without a completed scan.
- `/reports/{scanId}` — authenticated scorecard and findings for a completed/partial scan.
- `/auth/callback` — technical Microsoft authentication callback, not a product page.

After sign-in, the SPA requests an `access_as_user` token for the NSO Audit API and calls
`GET /api/me/bootstrap`. The API validates the token, derives `tenantId` from the signed claim,
and queries Storage through managed identity. The browser must not supply an authoritative
tenant ID or query Storage directly.

Bootstrap routing uses the tenant registration record plus `lastScanId` and scan status:

- no registration/completed scan → onboarding;
- queued/running latest scan → scan-progress state;
- complete/partial latest scan → report.

The API returns `consentStatus`, `azureRbacStatus`, latest scan summary, and destination. It
never returns another tenant's state, even if the caller changes a URL or request parameter.

The onboarding route is a compact four-step wizard rather than a second marketing page:

1. Review the complete read-only authorization catalog in an expandable panel.
2. Copy or open a tenant-specific Microsoft administrator-consent link.
3. Select Azure scopes and assign the documented reader roles.
4. Run the assessment and follow its progress to the first report.

The current step and next action remain prominent. Removal instructions, detailed permissions,
privacy explanations, and screenshots may be collapsed so they do not obscure the setup action.

Before enabling an audit, the portal calls `POST /api/me/access-check`. The API independently
uses the Enterprise Application identity to verify a permitted Microsoft Graph read, Azure
resource enumeration, and Defender for Cloud secure-score access. It records the results under
the signed-in tenant partition. The interface shows each check separately in green or displays a
safe actionable failure; browser callback parameters alone never prove consent or RBAC.

The first vertical-slice audit may collect only three proof-of-path signals: the Entra
authorization policy, Azure resource-group inventory count, and Defender for Cloud secure-score
availability. It stores a tenant-partitioned scan and findings and displays a clearly labelled
starter-check score. This score is collection coverage for the starter checks and must not be
presented as the final tenant security score.

The next assessment increment adds Conditional Access MFA-policy coverage, active Global
Administrator assignment count, user MFA-registration coverage, and the latest Microsoft 365
Secure Score. Unavailable or unlicensed sources produce explicit warnings and do not abort other
modules. Initial pass thresholds are preview heuristics and must be reviewed before the score is
marketed as a formal security rating.

The following increment inventories Intune device compliance policies, device configuration
profiles, and managed app-protection policies using the already-approved read-only permissions.
It also correlates the latest Microsoft 365 Secure Score control results with control profiles
and reports the three largest remaining point opportunities. Missing Intune licensing or
unavailable recommendation data is reported explicitly rather than scored as a collection
failure.

Every execution creates a new immutable scan ID. The report lists the latest 25 tenant-scoped
scans, allows an authorized user to open an older snapshot, and can run the assessment again
against the stored subscription. Historical reads remain constrained by the signed token's
tenant partition. Before collection, Azure subscription metadata must confirm that its tenant ID
matches the validated signed-in tenant ID; cross-tenant/Lighthouse access is rejected for v1.

## 6. Data Sources & Required Permissions

### 6.1 Microsoft Graph (application permissions, admin-consented)

#### Core permission allowlist

| Core check | Microsoft Graph application permission | Why it is required |
|---|---|---|
| Conditional Access policy coverage | `Policy.Read.All` | Read Conditional Access policies; no policy modification |
| Authentication-method registration | `AuditLog.Read.All` | Read the authentication methods user-registration report |
| Directory role assignments | `RoleManagement.Read.Directory` | Read directory RBAC assignments and definitions |
| Privileged role assignee identity | `User.ReadBasic.All` | Resolve basic display names and email addresses for user role assignees |
| Microsoft Secure Score | `SecurityEvents.Read.All` | Read Secure Score and control-profile data |

The frontend also uses delegated `User.Read` for basic organizational sign-in. It is not used
by the unattended scanner. Permissions for scorecard modules are added only when the module is
implemented and enabled.

#### Scorecard Graph and Defender API permissions

| Scorecard capability | API | Application permission | Condition |
|---|---|---|---|
| Intune device compliance, configuration policies, and security baselines | Microsoft Graph | `DeviceManagementConfiguration.Read.All` | Add when the Intune configuration module ships |
| Intune app configuration and app-protection policies | Microsoft Graph | `DeviceManagementApps.Read.All` | Add only if app-policy checks ship |
| Defender Vulnerability Management score | WindowsDefenderATP | `Score.Read.All` | Optional; requires applicable Defender licensing |
| Defender Vulnerability Management recommendations | WindowsDefenderATP | `SecurityRecommendation.Read.All` | Optional; requires applicable Defender licensing |

Do not request `Directory.Read.All`, mail access, group access, Exchange management, Intune
managed-device inventory, Defender machine/software/vulnerability inventory, or any `ReadWrite`
permission unless an implemented check is separately reviewed and requires it. The complete
authorization catalog and staging rules are maintained in `docs/permission-matrix.md`.

#### Later-phase permission candidates

These permissions are not requested in Phase 1. Each must be revalidated against the exact API
operation when its module is implemented.

| Data source | Example later signals | Candidate Graph permission(s) |
|---|---|---|
| Entra risk | Risk detections and risky sign-ins | Identity Protection read permissions, selected against the implemented endpoint |
| Intune / Devices | Managed-device inventory or device-level compliance state | `DeviceManagementManagedDevices.Read.All`, only if a device-inventory check is implemented |
| Purview / Compliance | DLP policy coverage, sensitivity label usage, retention policies | `InformationProtectionPolicy.Read.All`, and/or Purview/Compliance-specific Graph beta endpoints — confirm current API surface at build time, this area changes |
| Microsoft Defender alerts | Alert inventory and operational risk indicators | `SecurityAlert.Read.All`, only when the alerts module ships and is explicitly enabled |
| Microsoft Defender incidents | Incident inventory and operational risk indicators | `SecurityIncident.Read.All`, only when the incidents module ships and is explicitly enabled |
| Other Defender signals (optional, stretch) | Software and vulnerability inventory beyond the approved score/recommendation checks | Select only the read permission for each implemented Microsoft Defender endpoint |

> Note: exact Purview/Compliance Graph endpoints are still evolving (some require the beta
> endpoint or the separate Microsoft Purview compliance APIs / Office 365 Management Activity
> API). Validate current availability before finalizing scope list.

### 6.2 Azure Resource Manager (RBAC role assignment, granted by the onboarding script — separate from Graph admin consent)

| Data source | Example signals pulled | Required Azure RBAC role and scope |
|---|---|---|
| General Azure resources | Resource inventory and configuration needed by implemented checks | `Reader` at selected subscription or resource-group scope |
| Defender for Cloud | Azure secure score and security recommendations | `Security Reader` at selected subscription scope |
| Recovery Services vaults | Vault settings, backup policies, protected-item posture | `Backup Reader` at each selected vault scope |
| Log Analytics workspaces | Presence/freshness of required logs through implemented KQL checks | `Log Analytics Reader` at each selected workspace scope; do not assign merely to inventory Sentinel connectors |
| Microsoft Sentinel | Data-connector inventory, configuration, and implemented Sentinel posture checks | `Microsoft Sentinel Reader` at each selected Sentinel-enabled workspace scope |

Call out explicitly in the onboarding UI: **admin consent (step 4) only grants Graph API
access. Azure RBAC roles (step 6) are a separate, explicit grant the customer controls and scopes
themselves.** Don't blur these into one "approve everything" step — it undermines the
least-privilege story that makes this tool trustworthy.

### 6.3 Purview DLP

Full DLP policy inspection is deferred from the central unattended scanner until a suitably
narrow, supported application API is approved. Do not add `Exchange.ManageAsApp` to the central
Enterprise Application merely to run Security & Compliance PowerShell; its name and effective
surface undermine the product's simple read-only consent promise and require separate service
RBAC configuration.

The interim design is a customer-run, read-only PowerShell export of selected DLP policy
metadata. The customer reviews the exported data before uploading it. DLP contributes an
`Incomplete`/customer-supplied scorecard state rather than silently receiving a zero score.

### 6.4 Recommendation sources

- Microsoft 365 recommendations come from Secure Score control profiles using
  `SecurityEvents.Read.All`.
- Azure recommendations and Azure secure score come from Defender for Cloud using the
  subscription-scoped `Security Reader` role.
- Optional Defender Vulnerability Management recommendations use
  `SecurityRecommendation.Read.All`; its score uses `Score.Read.All`.
- Azure Advisor recommendations may be read through the selected Azure `Reader` scope when an
  implemented scorecard check consumes them.
- Findings from missing permissions, licensing, unsupported APIs, or unavailable products are
  marked `Incomplete` or `NotApplicable`, never scored as security failures.

### 6.5 Detection, alert, and connector data

- Microsoft 365 Defender alerts and incidents are collected through Microsoft Graph only after
  the corresponding optional module is enabled. Reports group them by service source, severity,
  status, and age and retain the source timestamp.
- Defender for Cloud alerts are collected through Azure Resource Manager using the customer's
  selected subscription scopes and `Security Reader` role.
- Microsoft Sentinel connector inventory is read from the Azure Resource Manager
  `Microsoft.SecurityInsights/dataConnectors` resource for each customer-selected,
  Sentinel-enabled workspace. Record connector type, configuration/provisioning state, and safe
  error metadata when the API exposes them.
- Connector configuration does not prove that data is arriving. A separate, optional health
  check compares expected sources with configured connectors and queries only the required Log
  Analytics tables for last-event time, ingestion freshness, and gaps.
- `Microsoft Sentinel Reader` is required for connector/configuration inventory. The
  `Log Analytics Reader` role is required only when the enabled module runs workspace log
  queries. Onboarding shows these as separate grants and never adds Log Analytics access
  automatically.
- In MSP-hosted mode, every alert, incident, workspace, connector, and log query is scoped to the
  selected customer tenant and its explicitly selected subscriptions/workspaces. Results retain
  source tenant, subscription, resource group, and workspace identifiers; cross-customer joins
  are prohibited.
- Missing Sentinel, Defender, Purview, licensing, permissions, or expected tables produces
  `NotApplicable` or `Incomplete`, not a score of zero.
- Until their collectors ship, DLP, alerts, alert settings, and Sentinel data connectors are
  visible in the report hierarchy as `NotCollected`/`NotEnabled`; they carry no score or baseline
  weight and the UI must not imply that evidence was evaluated.

## 7. Data Model & Scan Semantics

### 7.1 Tenant registration record
`tenantId`, `displayName`, `consentedAt`, `rbacOnboardedAt`, `scopedSubscriptionIds[]`,
`lastScanId`, `status` (not-onboarded / onboarded / scanning / scanned / error).

### 7.2 Finding schema (normalized, one shape across all data sources)
`scanId`, `tenantId`, `assessmentFamily` (Microsoft365 / Azure / DetectionResponse / Resilience),
`category` (Identity / Data / Device / Apps / Infrastructure / AzureSecurity / Alerts /
Sentinel / Backup), `sourceSystem` (Graph/Intune/Purview/DefenderForCloud/Sentinel/LogAnalytics),
`checkId`, `title`, `severity` (High/Medium/Low/Info),
`status` (Pass/Fail/Warning/NotApplicable), `details` (free text or structured),
`remediationGuidance`, `rawRef` (pointer to the blob with raw API response).

Structured evidence may include Global Administrator display names/user principal names,
normalized Conditional Access policies and named locations, and normalized Intune policy
settings. This is tenant configuration evidence and can contain personal or security-sensitive
information. It is shown only on demand, remains tenant-partitioned, must never enter diagnostic
logs, and is covered by the same retention and tenant-deletion controls as findings. Table-backed
evidence is capped; larger raw artifacts must use protected Blob Storage through `rawRef`.

### 7.3 Scan versioning
Each "Start scan" click creates a new `scanId`. Old scans are retained (retention policy TBD,
recommend 90 days default) so score-over-time trending is possible later without redesign.

### 7.4 Scorecard semantics

The client scorecard contains separate source scores rather than presenting an unexplained
single number:

- Microsoft 365: Microsoft's Secure Score and control recommendations remain grouped into
  Identity, Data, Device, Apps, and Infrastructure. NSO controls map into the same report family:
  Entra roles, Conditional Access, and authentication-registration coverage map to Identity;
  DLP/Purview maps to Data; and Intune policy/configuration coverage maps to Device.
- Azure posture: Defender for Cloud secure score, security recommendations, and relevant Azure
  Advisor recommendations.
- Resilience: Recovery Services vault configuration and protection posture.
- Observability: Log Analytics configuration plus required-log presence and freshness.
- Detection & Response: source-separated Microsoft Defender, Defender for Cloud, and Sentinel
  alerts/incidents plus Sentinel data-connector and implemented detection configuration posture.
  Operational indicators remain distinct from scored configuration controls.
- Optional endpoint vulnerability posture: Defender Vulnerability Management score and critical
  recommendations when licensed and explicitly enabled.

Each category records `status` (`Complete` / `Incomplete` / `NotApplicable` / `Error`),
`score`, `maxScore`, `source`, `collectedAt`, `licenseState`, and missing-permission details.
Only `Complete` categories contribute to the combined score. The dashboard must show coverage
next to the score so a high number from a partial scan cannot be mistaken for a complete audit.

Recommendations are normalized into the finding schema and ranked using source severity,
potential score impact, affected scope, and confidence. Vendor source scores remain separately
visible; NSO Audit must not present a derived score as Microsoft's official score.

The report presents recommendation summary cards for each Microsoft 365 Secure Score category
(Identity, Data, Device, Apps, and Infrastructure) plus a separate Defender for Cloud card.
Microsoft 365 recommendations are ordered by potential score gain and limited to 25 per category.
Defender for Cloud recommendations are ordered by source severity and limited to the 25 highest
priority unhealthy recommendation groups. Resource-level assessments with the same assessment
key are joined to the Defender assessment-metadata catalog and displayed once with severity,
remediation guidance, and an affected-resource count. Selecting a card opens normalized details
rather than raw JSON.

The report header presents three separate score cards: the preview NSO Assessment Score,
Microsoft 365 Secure Score, and Defender for Cloud Secure Score. Each Microsoft card uses the
vendor-returned current, maximum, and percentage values and is labelled with its source. Vendor
scores are never blended into or relabelled as the NSO score.

Under Microsoft 365 Secure Score, the report shows Microsoft's five control-category
components: Identity, Data, Device, Apps, and Infrastructure. Earned points come from the latest
control scores and available points from the matching control profiles. A category with no
scored controls is shown as unavailable, not zero. The Identity component is the same posture
component Microsoft surfaces as Identity Secure Score.

## 8. Security & Compliance Requirements

- **Least privilege**: request only the scopes/roles actually used by an active module; don't
  request permissions "in case we need them later."
- **Read-only, always**: no permission in §6 should ever be a write scope. This should be an
  automated check in CI (lint the permission manifest) not just a code review convention.
- **Key Vault-held workload credential** for the Function App's client-credential flow. Exactly
  one App Registration secret exists per NSO Audit deployment, is stored only in the hosting Key
  Vault, and is retrieved using the Function's managed identity. Never copy it into application
  settings, source control, logs, customer tenants, or operator-visible responses. Rotation,
  expiry alerts, overlapping credential versions, revocation, and access auditing are required.
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
2. **Phase 2 — Scorecard sources**: Intune policy/configuration, Azure inventory, Defender for
   Cloud score/recommendations, Recovery Services vaults, Sentinel data-connector inventory,
   and optional Log Analytics connector-freshness checks. Connector inventory ships before log
   querying so `Log Analytics Reader` is not required unless freshness checks are enabled.
   Optional Defender Vulnerability Management score/recommendations follow when
   licensing and API access are validated. Purview DLP remains customer-supplied until a narrow
   unattended API is approved.
3. **Phase 3 — Detection & dashboard**: optional Microsoft Defender alerts/incidents and
   Defender for Cloud alerts; severity/status/age and response indicators; scoring model,
   remediation guidance content, and scan history.
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
  Principal per consenting audit-target tenant, including the hosting tenant when it is audited.
- **MSP authorization topology**: the API stores an allowlisted relationship from MSP
  organization and operator identity to each managed audit-target tenant. Tenant selection is
  resolved against that relationship on every request and never authorized from a browser value
  alone.
- **User identity**: ordinary dashboard sign-in uses a normal organizational account; Global
  Administrator is neither requested nor recommended for routine site access.
- **Consent identity**: tenant-wide Graph consent occurs separately on Microsoft's endpoint and
  may use a different authorized administrator account.
- **Workload authentication**: one client secret for the vendor-owned multitenant App
  Registration is stored in the hosting Key Vault and retrieved by the Function through managed
  identity. The same application credential is used to request tenant-specific tokens for the
  hosting tenant and every consented customer tenant; customer tenants never receive or provide
  a copy of it.
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
- Complete the Key Vault credential lifecycle: automate creation of the single App Registration
  secret, write it directly to Key Vault without exposing it in shell output, retrieve it through
  managed identity, rotate it with a safe overlap window, alert before expiry, document emergency
  revocation, and add deployment acceptance tests for both hosting-tenant and customer-tenant
  token acquisition. Do not create one credential per customer tenant.
