# Deploy NSO Audit from scratch

This runbook is the source of truth for rebuilding NSO Audit without relying on shell history or
the original development tenant. All names and identifiers shown as parameters must be supplied
for the target environment; credentials and deployment tokens must never be committed.

## Current automation status

Key Vault, VNet and NSG snapshots require migration 029 before API/web deployment. The new collectors use existing subscription Reader access, including Azure Monitor diagnostic settings read access. Take two fresh, complete snapshots in a disposable subscription containing a test vault and network. Compare the saved evidence with Azure and confirm a reversible change is visible. For rollback, allow new collection jobs to reach a terminal state, retain the additive schema, and restore the prior API and web releases.

SQL and Blob protection snapshots require migration 028 before API/web deployment. The existing scoped Azure Reader role supplies the management-plane reads. Run a fresh audit with a SQL logical server and a Blob-capable Storage account, then compare the saved evidence with Azure. Run a second audit after an approved test-resource setting change and validate the before/after view. Rollback retains the additive tables. Let new collector jobs reach a terminal state before restoring the previous API and web versions.

### Separate-tenant release verification

Provision a disposable environment in the intended hosting topology before declaring Prod rebuildable. Supply target environment values through the shared Bicep and its parameter files, verify the target tenant and subscription, validate templates and review what-if, then provision the network, SQL, Key Vault and app identities. Use fresh deployment and workload identities, app registrations, secrets and SQL data. Independently configure the customer service principal through admin consent and subscription Reader access in each audited tenant.

Apply the versioned SQL migrations through 029 against the new database and verify that rerunning the migration runner reports the same checksums. Deploy API and web, check the API-to-SQL VNet path, and verify the SQL, Storage, Key Vault, VNet and NSG datasets on a fresh audit and a second comparable scan. Repeat onboarding in an independent customer tenant and verify that users scoped to one customer workspace cannot retrieve the other customer's audit evidence. Capture deployment results, what-if output and audit IDs. Until these checks pass, this is a deployment procedure and Prod remains unverified.

Azure role snapshots require migration 027 before API/web deployment. Use existing subscription Reader access for role assignments and definitions. Run two fresh audits around an authorized test-scope role change and confirm the per-resource and per-resource-group views show direct and inherited grants and the expected change. For rollback, keep the additive migration and redeploy the prior API/web versions together.

Azure Storage and SQL server configuration snapshots require migration 026 before API/web deployment. Use the existing subscription Reader role. Run a fresh audit in a test subscription with a Storage account and SQL logical server and compare saved settings against Azure. Check that both datasets finish and omitted fields are shown as unavailable. Configuration is captured on new scans. To roll back, retain the additive tables and redeploy the prior API/web versions.

Azure resource inventory requires migration 025 before API/web deployment. Validate with a new audit using subscription-scoped Reader access. Compare inventory against the same subscription in Azure and confirm collection completes across all pages. Older audits have no resource inventory snapshot. For application rollback, retain the additive migration and redeploy the prior API/web versions.

Recovery Services backup snapshots require migrations 023–024 before API/web deployment. Validate a fresh audit using [the Recovery Services backup runbook](recovery-services-backups.md).

Directory access snapshots require migrations 021–022 before API/web deployment. Configure tenant consent and verify a fresh audit using [the directory access runbook](directory-role-evidence.md).

Defender Exposure Score and Secure Score for Devices require migration 020 before API/web
deployment. Follow [Endpoint score deployment and recovery](../database/endpoint-scores.md).
This implementation requires separate SQL migration and live collection validation.

Intune settings/assignments require migration 019 before API deployment. Follow
[Intune detail deployment and recovery](../database/intune-policy-details.md) for the
seven linked datasets, direct Dev migration verification, source limitations and deployment order.
Existing Graph read permission and API-to-SQL VNet configuration are reused.
Actual Dev deployment and collection results are in the
[November 10 Intune deployment record](intune-data-dev-deployment-2026-11-10.md).

The Dev custom-domain transition to `auditdev.newsommer.com` is tracked in
[the cutover record](dev-custom-domain-cutover.md). Both CORS origins are configured through
the versioned CORS script and Dev parameters; check that record before changing callbacks
or email-link origins. Dev portalOrigin now uses the custom domain; the versioned
`Set-NsoAuditPortalOrigin.ps1` applies and verifies that setting independently of CORS.
The API's account/questionnaire origin check permits only this configured host.
See the cutover record for validation, remaining callback work and rollback.

The frontend audit explorer, license navigation and readable Conditional Access/location views use the existing
SQL evidence APIs. See [audit pages and license navigation](audit-pages-and-license-navigation.md)
for routes and checks. This UI change requires no new schema, permissions or infrastructure.

Unified tenant data collection requires migration 018, then API/web deployment and explicit
DATA_AUDITS_ENABLED activation. See [tenant audit data deployment](../database/tenant-audit-data.md).
Normal audit evidence uses SQL only; legacy Azure Tables are no longer a runtime backend. Keep
the storage account for Functions host coordination and other uses. The user authorized direct
Dev database migration for this work. New environments still require their own validation and
isolated parameters/identities; this change does not establish a proven Prod rebuild.

Database-backed license collection requires migration 017 and explicit activation after SQL
validation and customer permission/consent checks. Follow [license audit deployment and recovery](../database/audit-licensing.md).
It adds a timer worker using existing host storage and a SQL dispatch queue. It is disabled by
default; API/web deployment alone does not enable or prove working collection. Preserve the
existing API-to-SQL subnet path and use disposable validation before applying to Dev.

The full client questionnaire requires migrations through 014 before API/web deployment. Follow
[the client-assessment runbook](../database/client-assessments.md) for the Markdown/catalog build,
disposable validation, deployment order, live checks and recovery. The deployment wrapper now
validates the 013 baseline plus candidate 014; earlier backup-only data is preserved.
See the [full questionnaire Dev deployment record](client-questionnaire-deployment-2026-10-21.md)
for the applied migration and successful live API/browser checks.

For the backup questionnaire feature, apply versioned migration 013 before deploying API code,
then deploy the web application. The existing deployment workflows do not run SQL migrations.
Follow [questionnaire deployment and validation](../database/questionnaires.md#deployment-validation-and-recovery)
for candidate validation, isolation checks, smoke tests and recovery. No permanent Azure
resources or manual runtime grants are needed; SQL permissions are delivered by migration 013.
Preserve the approved API-to-SQL VNet path.
The [2026-10-21 Dev deployment record](questionnaire-deployment-2026-10-21.md) records the applied
migration and successful live API/browser verification for this feature.

The existing `NSO-Audit` resource group is **Dev**. Future Prod must use the same maintained
infrastructure modules with isolated environment parameters, identities, credentials and data.
Every infrastructure-dependent feature must update its infrastructure code, versioned database
migrations and this runbook as applicable. See `AGENTS.md` and
`docs/product-direction-v2.md` for the project requirements. Current Bicep-generated resource
names differ from live Dev; reconcile them before applying templates to the existing group.

| Area | Repository coverage | Remaining work |
| --- | --- | --- |
| Resource group, Storage, tables, managed identity, Key Vault, Function and Static Web App | Initial Bicep exists under `infra/` | Reconcile the template with the proven live configuration and current Functions hosting guidance before using it for a clean deployment |
| SQL and scan storage | `infra/sql.bicep`, Dev parameters, migrations, copy/reconciliation and cutover scripts; Dev API uses SQL | Client auth/workspaces, stable Prod networking and disposable clean-rebuild validation remain; see `database/scan-cutover.md` |
| App Registration permissions | `Set-NsoAuditApiPermissions.ps1` | App Registration creation, verified publisher, ownership and production naming still require automation/review |
| Protected API scope | `Set-NsoAuditApiScope.ps1` | None after the App Registration exists |
| SPA redirect | `Set-NsoAuditAppRedirect.ps1` | Supply the new Static Web App hostname |
| Key Vault workload credentials | `Set-NsoAuditWorkloadCredentials.ps1` checks and creates the Graph secret and optional DLP certificate | Add secure import, end-to-end token validation, expiry alerts, and tested rotation cleanup |
| Flex API networking/runtime/CORS | `infra/api-network.bicep`, Dev parameters and deployment wrapper | Separate Prod parameterization and disposable full rebuild rehearsal |
| Function deployment | `.github/workflows/deploy-api.yml` or `Publish-NsoAuditApi.ps1` | Provision the app-scoped federated deployment identity and public GitHub environment variables using the versioned template/script |
| Web deployment | `.github/workflows/deploy-web.yml` | GitHub environment and Static Web App deployment token are still created manually |
| Customer consent and Azure roles | Portal consent plus downloadable `Set-NsoAuditCustomerReaderRoles.ps1` | Must be completed independently in every customer tenant |

The current Bicep is **not yet certified as a clean-deployment template**. In particular, its
Functions plan, diagnostics cost profile, storage-key settings, app settings, and outputs must be
tested against a disposable environment. Use the scripts and live configuration as evidence when
reconciling it; do not deploy the template blindly into production.

## Required deployment order

For the additive SQL foundation on existing Dev, follow `database/README.md` and use
`infra/sql.bicep` with `infra/sql.dev.bicepparam`, `scripts/Deploy-NsoAuditSql.ps1`, and
`scripts/database.mjs`. Provisioning alone does not migrate or delete existing Table-backed scans.
For the subsequent data migration and application switch, follow `database/scan-cutover.md`.
Initial Dev customer-owner nomination is recorded separately in `database/workspace-ownership.md`;
it is pending verified client onboarding and must not be seeded automatically into Prod.
Run the SQL isolation verification against Dev after applying schema migrations. Configure
runtime metadata using `scripts/Set-NsoAuditSqlRuntime.ps1`. Never apply the unreconciled full
platform template to existing Dev as a shortcut to adding SQL.

1. Choose the subscription, region, environment name, globally unique resource suffix, and
   `NSO-Audit` resource-group name.
2. Run an infrastructure `what-if`; review every resource and role assignment before applying.
3. Create the vendor-owned multitenant App Registration and record its public client ID.
4. Apply the exact allowlisted API permissions with `Set-NsoAuditApiPermissions.ps1`.
5. Expose `api://{clientId}/access_as_user` with `Set-NsoAuditApiScope.ps1`.
6. Add the Static Web App callback with `Set-NsoAuditAppRedirect.ps1`.
7. Run `Set-NsoAuditWorkloadCredentials.ps1`. It checks Entra and Key Vault, creates the Graph
   secret, and creates the DLP certificate only when that module is selected. Credential values
   are never printed or persisted outside Key Vault. Secure import is a documented fallback but
   is not implemented in the current script.
8. Configure the Function's secret-name setting and exact CORS origin with
   `Set-NsoAuditApiRuntime.ps1`.
9. Verify managed-identity Storage and Key Vault roles with `Test-NsoAuditResources.ps1`.
10. Publish the API with `Publish-NsoAuditApi.ps1` and test `/api/health`.
11. Configure the GitHub `AZURE_STATIC_WEB_APPS_API_TOKEN` secret and environment-specific Vite
    public identifiers, then run the web deployment workflow.
12. Complete a disposable customer-tenant test: sign in, grant admin consent, assign customer
    reader roles, run **Check access**, run an audit, reopen its report, and run it again.

## Stable API-to-SQL networking

The approved requirements are in `docs/networking-requirements.md`. The additive
`infra/api-network.bicep` and `infra/api-network.dev.bicepparam` describe the planned Dev
migration from `nso-audit-dev-api` to `nso-audit-dev-api-flex`; SQL, storage, vault, identity and
SWA names are preserved. Do not use the legacy full `infra/main.bicep` for this migration.

For a fresh environment, first create its isolated foundation and SQL using explicit operator
access with `Deploy-NsoAuditSql.ps1 -BootstrapBeforeApiNetwork`; this leaves the subnet parameter
empty until the VNet exists. Apply schema migrations through `012_workspace_invitations.sql`
and the existing restricted runtime-identity SQL grant. Provision storage/Key Vault roles and
email configuration as documented below. Then:

1. Supply separate names, CIDRs, origins, identity IDs and endpoints for the environment in a
   parameter file. Run `Deploy-NsoAuditApiNetwork.ps1 -SubscriptionId <id> -ResourceGroupName <rg>
   -ParametersFile <file>` to compile and preview. Register Microsoft.App when required. Inspect
   what-if before adding `-Apply`. Only the dedicated VNet/subnet, plan, API, deployment container
   and SQL virtual network rule should be added in the existing Dev migration.
2. Publish code using `Publish-NsoAuditApi.ps1 -SubscriptionId <id> -ResourceGroupName <rg>
   -FunctionAppName <candidate>`. Confirm `/api/health` reports healthy SQL and that the API's
   integrated subnet matches the Ready SQL virtual network rule. No SQL password or db_owner
   permission is needed. The existing Dev runtime identity is reused only within Dev.
3. Validate reads AND writes with `scripts/verify-customer-account-api.mjs`, using explicit Dev
   SQL/API targets and `CONFIRM_DEV_WRITE_TEST=yes`. Its disposable fixtures are cleaned in finally;
   no real customer or email-delivery operation is performed. Any exact operator-IP SQL access
   used to prepare fixtures must be removed after the test, including on failure. The versioned
   `Test-NsoAuditApiNetwork.ps1` wrapper takes an explicit operator IPv4, restricts targets to Dev,
   creates a unique exact-IP rule and removes it in finally.
4. Set the public frontend configuration in `config/environments/dev.public.json`, then deploy
   via `Publish-NsoAuditWeb.ps1` with its mandatory `-PublicConfigurationFile` or the web workflow.
   The process restores previous environment values and never writes deployment tokens to disk.
   Future Front Door can use `/api` instead of a Function hostname; register its exact external
   Entra callbacks/origins first. API CORS must match that public origin.
5. Preview `Set-NsoAuditLegacySqlFirewall.ps1` with explicit subscription, resource group, server,
   `-ManifestFile infra/legacy-sql-firewall.dev.json -Action Remove -FunctionAppName
   nso-audit-dev-api-flex -SqlNetworkRuleName nso-audit-dev-api-subnet`; then add `-Apply` after
   inspecting the named rules. It checks subnet/rule health and refuses changed manifest entries.
   Incremental Bicep does NOT remove omitted firewall rules, so this step is mandatory. Final
   `infra/sql.dev.bicepparam` has no permanent public IPv4 rules and preserves the subnet rule.
6. Repeat SQL-backed API read/write checks after worker-IP rules are removed, restart the candidate
   and repeat health and writes again. Remove temporary operator access. Validate staff sign-in,
   customer save and existing audit access in the browser. Record checks actually completed.

Rollback: retain the old API and package, restore only the recorded legacy rules using the same
firewall script with `-Action Restore -Apply`, change the public API URL back and redeploy the
web. Inspect the restore preview first. This restores the previous unstable worker-IP behavior
and is temporary; do not drop databases, revoke customer access or reverse schema migrations.
Code-only rollback on Flex should republish a retained known-good package instead.

The API workflow targets Flex and authenticates with OIDC through the dedicated deployment
identity. Provision it with `infra/github-api-deployment.bicep` and environment parameters using
`Set-NsoAuditGitHubApiDeployment.ps1` (preview first, then `-Apply`). Its Website Contributor
role is scoped only to the selected API app; it has no SQL or customer data roles. Federation
is restricted to the exact repository and GitHub environment. The script sets only public
`AZURE_API_DEPLOY_CLIENT_ID`, `AZURE_API_DEPLOY_TENANT_ID`, and
`AZURE_API_DEPLOY_SUBSCRIPTION_ID` GitHub environment variables. No publish profile is needed.
Dev and Prod must have separate identities, trust subjects and deployment targets. The shared
web public configuration prevents a later GitHub build from restoring the old API endpoint.

Optional `restrictToFrontDoor` + `frontDoorId` implement a service-tag AND exact-FDID inbound
gate. Leave disabled until edge routes/probes and origin protection are validated. This work
creates no Front Door resource. SQL uses a service endpoint, not Private Link; SQL's public
endpoint is enabled but subnet restricted. A clean full-platform rebuild and Prod restore test
remain outstanding; this additive Dev deployment does not certify the legacy foundation.

## Customer management deployment

Apply versioned SQL migrations through `012_workspace_invitations.sql` before deploying the
current management and invitation API. See `database/customer-management.md`. Register the environment's exact
`https://<portal-host>/clientmanagement` SPA redirect for management logout, alongside its existing
`/auth/callback`, using `scripts/Set-NsoAuditAppRedirect.ps1` (Azure CLI authentication).
Preserve existing redirects, including `/management` for older releases. Register the new
`/clientmanagement` logout redirect before publishing the web update. The old `/management`
page remains a compatibility redirect to `/clientmanagement`. Staff must also have an active SQL management-role assignment.

Publish API with `scripts/Publish-NsoAuditApi.ps1`, then web via the workflow or
`scripts/Publish-NsoAuditWeb.ps1 -SubscriptionId <id> -ResourceGroupName <rg> -StaticWebAppName <name> -PublicConfigurationFile config/environments/dev.public.json`.
The latter keeps the SWA deployment token in process memory/environment and clears it afterward.
Its `production` slot means the primary slot of the selected resource; target the Dev resource
for Dev and a separate resource for future Prod. Validate `/api/health`, unauthenticated
management rejection, and the `/clientmanagement` sign-in page after deployment. Pending contacts
do not establish client login accounts or Microsoft connector permissions.

Dev migration validation is recorded in `docs/dev-network-migration-2026-10-20.md`.

## Acceptance checks for a rebuild

- No subscription ID, tenant ID, access token, storage key, deployment token, secret, or private
  certificate is committed.
- The Function uses its user-assigned managed identity for platform Storage and to retrieve the
  App Registration secret and optional DLP certificate from the hosting Key Vault.
- No customer-specific application credential exists. The App Registration secret and optional
  DLP certificate are stored in the hosting Key Vault, retrieved through managed identity,
  rotated with overlap, monitored before expiry, and never copied into Function settings or
  deployment output. Only the DLP certificate's public key exists in Entra.
- `tenants`, `scans`, and `findings` tables exist and reject anonymous access.
- The API rejects a Subscription ID whose owning tenant differs from the signed token tenant.
- A user from one tenant cannot retrieve another tenant's scan, even with a known scan ID.
- Repeated audits create new scan rows and preserve previous reports.
- Deleting customer role assignments or consent causes **Check access** to fail safely.
- Infrastructure and application deployment can be repeated without creating duplicate role
  assignments or corrupting existing tenant data.

## Next automation milestone

Create one environment bootstrap command that deploys the reconciled Bicep, applies the Entra
configuration, reconciles workload credentials, publishes the API, and prints only the safe
GitHub values that still require an authorized human action. Keep customer-tenant onboarding
separate from vendor-platform deployment.

## Customer sign-in and email delivery

The public home page has one **Sign in** button leading to `/signin`, with Microsoft and
email/password choices. Staff use the unlisted `/clientmanagement` URL. Both an active SQL
management role and the exact configured Entra tenant/object ID are required for staff access.

1. Compile `infra/account-email.bicep` and its environment parameter file. Inspect resource-group
   what-if before deployment. The additive email template creates an Email Service, an Azure-managed
   sender domain, a Communication Service and a resource-scoped sender role for the environment's
   API identity. It does not redeploy the unreconciled platform. Dev parameters are in
   `infra/account-email.dev.bicepparam`; future Prod needs separate resources, identity and parameters.
   ACS Email is pay as you go, with no fixed-capacity email tier selected.
2. Validate migrations 007 through 009 in a transaction on the chosen Dev database using
   `CONFIRM_DEV_WRITE_TEST=yes node scripts/verify-customer-accounts.mjs --validate-migration`
   **before** applying them to a database that is still at 006. On an already migrated database,
   run the script without that flag. Apply migrations with `node scripts/database.mjs migrate`
   and repeat to verify checksums/idempotence. These migrations add auth procedures and persistent
   rate limits; existing customer data is preserved. See `database/customer-accounts.md`.
3. Deploy the email template using `az deployment group create` with the inspected environment
   parameter file. Its `endpoint` and `senderAddress` outputs are public configuration. Run
   `scripts/Set-NsoAuditAccountRuntime.ps1` with the explicit subscription, resource group, Function,
   portal origin, these outputs and the approved staff object's ID. Allow RBAC propagation.
   The runtime uses managed identity; do not obtain or store ACS access keys.
4. Ensure the API's CORS allowlist includes only the intended portal origins. Register both
   `/auth/callback` and `/clientmanagement` SPA redirects through the versioned redirect script.
   Publish API first using `Publish-NsoAuditApi.ps1`, then web with `Publish-NsoAuditWeb.ps1` or CI.
5. Check `/api/health`, confirm unauthenticated `/api/account/session` returns 401 and staff endpoints
   reject customer session tokens. Use `/signin` to create a disposable account and check actual
   inbox receipt, verify the address, sign in, reset the password, and confirm prior sessions stop
   working. In staff management, save a contact matching that verified address and explicitly
   **Activate access**. Customer registration and Microsoft metadata alone must not grant membership.
   Confirm a different account cannot open that workspace and a viewer cannot start an audit.
6. Remove temporary operator SQL firewall access. Record the release checks and outstanding manual
   identity-provider/inbox checks; local tests and compilation do not establish a clean Prod rebuild.

Recovery: roll back the API/web releases together; retain additive schema and migration ledger.
To invalidate email sessions during recovery, revoke `identitydata.Sessions` through an authorized
SQL operator. Reverting the app does not remove users or customer data. Do not reverse migrations
or delete the email domain as a routine application rollback. A disposable full rebuild and SQL
restore rehearsal are still required before claiming Prod reproducibility.

## Dev test-account cleanup

Migration `010_dev_account_cleanup.sql` adds role-checked account listing/deletion procedures
and makes answer attribution nullable so shared assessment content can survive account deletion.
Validate the candidate transactionally using `CONFIRM_DEV_WRITE_TEST=yes node
scripts/verify-account-cleanup.mjs --validate-migration` before applying it. Run the migration
runner, repeat for checksum/idempotence, then publish API before web using the existing scripts.
No infrastructure changes are required for this feature. The API returns 404 outside Dev and
requires the exact approved Microsoft staff identity in Dev.

In `/clientmanagement`, expand **Test accounts**, choose an email account and type that exact
email to confirm deletion. This removes the account, sessions, account tokens, registration
requests, memberships and matching roster entries. Shared customer workspaces, profile data,
scans and answers remain; answer author references are cleared. Company profile fields and
pending ownership nominations may still contain that email as company metadata. This is a
login/account reset, not a complete customer-workspace purge or backup erasure. The registered
email can be reused afterward. Existing Microsoft/Entra identities are unaffected.

Validate only disposable fixture accounts with the versioned verifier. Do not delete a real
account merely to verify deployment. Roll back API/web first on release failure; retain migration
010 and nullable answer attribution. Actual deletions require database backup/restore recovery
into a separate database, not an inverse migration; do not promise an undo button.

## Staff access diagnostics

Staff endpoints distinguish invalid Microsoft sessions (401), unauthorized staff identity/role
(403), and unavailable configuration/database (503). Database failures must not be presented as
proof that a user lacks a role. Dev may return the observed blocked worker IP in a diagnostic field
without exposing tokens or raw SQL errors. A signed-in staff user can use **Retry access** without
starting another Microsoft login. Publish the API before web for this message/retry update.
No schema or infrastructure change is required; current Linux Consumption SQL networking remains
unresolved. A healthy public health request does not verify the user's authenticated staff request.

Customer save tokens require `011_customer_version_encoding.sql` before management validation.
See `database/customer-management.md` for validation and recovery; the regression test must
pass returned SQL versions through the same input validation used by HTTP saves.

## Workspace invitation deployment

Follow `docs/customer-invitations.md`. Apply migrations through 012 (including the version-token
repair in 011), compile and inspect `infra/api-network.bicep` with environment parameters, then
publish API and web in that order. The existing ACS sender/role is reused; the per-environment
`invitationLifetimeHours` parameter defaults to 72 and sets `ACCOUNT_INVITATION_HOURS`.
No real invitations are sent by migration or deployment. The staff Send invitation action
replaces separate registration/verification/activation for the recipient. Validate using
`verify-workspace-invitations.mjs` and the invitation/browser regressions; preserve accepted
memberships during code rollback and use forward schema repairs.

## Simplified questionnaire entry

For the 2026-10-23 answer-entry update, publish API before web. No database or infrastructure
change is required. See [client assessment deployment and validation](../database/client-assessments.md#simplified-answer-entry-2026-10-23)
for compatibility, validation and rollback.

## GitHub API federation subject repair (2026-10-23)

If Azure login fails with AADSTS700213, compare the subject in the failed run with the
`githubSubject` environment parameter. Dev now records the immutable owner/repository IDs
observed in run 40016490811. Preserve the existing deployment identity and app-scoped role.
Compile the Bicep and parameters, run `Set-NsoAuditGitHubApiDeployment.ps1` without `-Apply`,
and inspect what-if before applying. The expected material change is the existing
`github-environment` federated credential subject. Investigate unrelated resource changes.
Apply using the same script with `-Apply`, then rerun the failed Deploy API job and verify
Azure login, deployment and health succeed. Verify authenticated questionnaire save/reopen
separately; health alone does not validate SQL access. No SQL or app migration is required.
Future Prod must use its own identity and exact environment subject. To recover an erroneous
trust change, restore the previously verified subject through parameters and preview/apply
again; do not introduce secrets or broaden the repository/environment trust.

## Guided questionnaire intake deployment

Apply additive `015_guided_questionnaire.sql` before publishing API, then publish web.
Pushing to GitHub does not run migrations. Use the existing disposable-first questionnaire
wrapper and follow [guided questionnaire validation and recovery](../database/guided-questionnaires.md).
New assessments use client-v2; original client-v1 drafts remain available with a guided-copy
option. No database rebuild or persistent infrastructure change is required.

The 2026-10-23 live federation and migration repair, including the successful API rerun
and authenticated validation, is recorded in [the deployment repair record](deployment-repair-2026-10-23.md).

## Technology register questionnaire (client-v3)

The optional technology-specific assessment requires additive migration 016 before API/web
publication. Existing v1/v2 assessments are unchanged. See
[technology register deployment and recovery](technology-register.md) for validation order,
disposable-first requirements, release limits and rollback. The additive release was
[deployed and verified in Dev on 2026-10-28](technology-questionnaire-deployment-2026-10-28.md).
This validates the questionnaire catalog and feature release, not a complete clean platform
deployment or a Prod rebuild.

Directory role evidence collection and application-only deployment/recovery: [directory-role-evidence.md](directory-role-evidence.md).

## Partner audit workspace access

Apply migrations 031 and 032 after migration 030 and before publishing the API
and Audit Compare Function packages. These migrations add a directory and assignments
for verified Entra principals, grants both runtimes execution of the authorization
procedure, and adds optional tenant selection to the existing email audit procedure.
Existing memberships and saved evidence require no data migration.

Verify the staff Entra tenant and object ID against the nominated account and confirm the
target client organization and its connected tenant. Set `MANAGEMENT_TENANT_ID`,
`MANAGEMENT_OBJECT_ID` and `PARTNER_CLIENT_ORGANIZATION_ID` and run
`node scripts/database.mjs bootstrap-partner-admin` using temporary exact-IP operator access.
Use explicit identities and client assignments in each environment. The bootstrap adds
one verified staff principal and one existing client organization per invocation.
For a Partner User, provision both the client assignment and specific tenant
assignments under that client. Client assignment alone gives a Partner User no tenant access.

Publish both APIs before publishing the web portal. Verify that an authenticated partner
sees only assigned clients and their connected tenants, can read their saved audits
and Compare results, and receives a denial for an unassigned tenant or a write request.
Check email client sign-in and legacy Microsoft access as part of the release.

To withdraw a grant, set `RevokedAt` on its assignment. To disable the entire partner
principal, set `DisabledAt` and retain the principal row so it cannot fall through to
legacy Microsoft access. Keep migrations 031 and 032 applied when restoring a prior frontend.
Earlier API packages predate partner authorization. Leave the partner API unavailable
during rollback or use a package that retains the scoped authorization checks.

## Windows Purview collector

Use `infra/purview-collector.bicep` and environment parameters to create the Windows
PowerShell collector. For Dev, run a resource-group what-if with
`infra/purview-collector.dev.bicepparam` in `NSO-Audit`, then apply the template in
incremental mode and publish using `scripts/Publish-NsoAuditPurview.ps1`.
The Dev parameters reuse the existing NSO Audit registration and the
`nso-audit-dlp-certificate` in `nso-audit-dev-kv`. Prod requires its own vault,
certificate key material, collector identity, authorized caller and verified tenant list.
The collector reads the backing PFX secret through its scoped managed identity grant.

The HTTP package exposes `GET /api/health` and `POST /api/dlp`. The latter requires
an Entra app token for the configured audience and the main API's configured
managed identity. Its JSON body contains `tenantId` and `scanId`. The server maps
the tenant GUID to a configured, verified domain. Each enabled tenant needs Security
& Compliance PowerShell app consent and roles permitting both DLP read commands.
Check health, an unsigned POST returning 401, and a signed test collection before
enabling the collector from the main audit workflow. Keep SQL writes in the main API.

For GitHub deployment, preview and provision the dedicated Purview deployment
identity using `scripts/Set-NsoAuditGitHubApiDeployment.ps1 -Workload Purview`
with `infra/github-purview-deployment.dev.bicepparam`, the Dev subscription,
resource group, repository and GitHub environment. Run it without `-Apply` to
review what-if, then run it with `-Apply` to provision app-scoped deployment
access and set the public GitHub OIDC variables. The workflow publishes the
DLP collector package and checks its health endpoint.

For recovery, disable the calling workflow and redeploy the prior collector package,
or stop the new Dev worker. Revoke its certificate secret role if retiring it.
The collector itself has no SQL access. Before enabling the main API integration,
apply migration 033, deploy the Compare and main API packages, and run
`scripts/Set-NsoAuditPurviewCaller.ps1` with the environment's API parameters.
This updates the two Purview settings without redeploying the full Dev network
template. The settings enable configured tenants only. The main audit worker
sends one request per DLP dataset and saves the validated results in SQL. No
historical backfill is required.

The NewSommer trial loaded the Key Vault certificate and obtained an Entra token
for Microsoft Exchange Online Protection. Security & Compliance PowerShell
returned Unauthorized at connection. Keep automatic DLP collection disabled
until an authorized Purview administrator verifies the service principal's
effective read roles. Validate `View-Only DLP Compliance Management` in a custom
Purview role group for the existing enterprise application. Enable the verified
tenant in the Dev parameters and reapply the caller settings for a signed test.

During a test, filter the main API and collector function logs for `Purview DLP`
and the same `scanId`. The API logs the attempt, collector HTTP status and saved
record count. The collector logs its progress and the failure stage, including
certificate loading, token acquisition, session connection and policy or rule reads.

In Dev, `scripts/verify-purview-dev.mjs` creates an identifiable DLP-only audit,
using temporary exact-IP operator SQL access. It leaves the latest-audit pointer
and the source tenant configuration intact. Verify both collections finish and
that Compare can read their saved records. For rollback, clear the configured
tenant list, then roll back the application packages if needed. Retain the
additive SQL tables and saved audit history.

## Audit Compare

Audit Compare runs in a dedicated Flex Consumption Function App with its own
plan, deployment storage and read-only SQL managed identity. Compare uses the
environment's approved Functions
integration subnet and the existing SQL virtual network rule. The web app calls
the separate Compare endpoint with its current portal session or Entra token.

1. Confirm that the target environment's SQL VNet rule is Ready and points to
   the same integration subnet as the Compare parameters. For Dev, compile and
   preview the additive deployment with the following commands. Inspect what-if
   for changes to existing resources before replacing `what-if` with `create`.

   ```powershell
   az bicep build-params --file infra/audit-compare.dev.bicepparam --stdout
   az deployment group what-if --resource-group NSO-Audit --parameters infra/audit-compare.dev.bicepparam --name nso-audit-compare-dev
   ```

2. Connect as a SQL operator through the approved path or a temporary exact-IP
   rule. Set `SQL_SERVER` and `SQL_DATABASE` for that environment. Apply
   `node scripts/database.mjs migrate --through=030_audit_compare_reader.sql`.
   Set `SQL_COMPARE_CLIENT_ID` to the Bicep `identityClientId` output and run
   `node scripts/database.mjs bootstrap-compare`. It checks the identity,
   read-only grants and default-deny organization context. Remove any temporary
   operator firewall rule in a finally block. Migration 030 adds database permissions.

3. Publish the dedicated package with
   `scripts/Publish-NsoAuditApi.ps1 -Compare -SubscriptionId <id> -ResourceGroupName NSO-Audit -FunctionAppName nso-audit-dev-compare`.
   For GitHub Actions, provision the app-scoped deployment identity using
   `infra/github-compare-deployment.dev.bicepparam`, set the development environment
   variable `AZURE_COMPARE_DEPLOY_CLIENT_ID` to that deployment's `clientId`, and
   dispatch **Deploy Audit Compare**. The original API workflow publishes only
   the pull application.

4. Check that `<apiBaseUrl>/health` returns `service: audit-compare` and `status: ok`,
   and unauthenticated Compare history returns HTTP 401. Set
   `VITE_COMPARE_API_BASE_URL` in the environment's public web configuration to
   the Bicep `apiBaseUrl` output, then publish the web app. Verify **Audit Compare**
   with two authorized finished audits and confirm **Difference Only** and
   incomplete dataset handling. For Dev, `CONFIRM_DEV_WRITE_TEST=yes` with the
   explicit Dev SQL targets enables `node scripts/verify-audit-compare-dev.mjs`
   after the API build. It uses disposable evidence and verifies that a
   different workspace's IDs are rejected. Front Door deployments must route Compare
   to its own origin and provide the exact public origin in the CORS parameters.

For recovery, republish the previous web release and, if needed, the previous
Compare package. For a full access rollback, remove `nso_compare_runtime` from
`nso_compare_reader` as a SQL operator. Migration 030 is additive and saved audit
rows are preserved. Validate the full rebuild separately in a disposable
environment before proposing a production release.
