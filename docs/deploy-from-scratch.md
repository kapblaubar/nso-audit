# Deploy NSO Audit from scratch

This runbook is the source of truth for rebuilding NSO Audit without relying on shell history or
the original development tenant. All names and identifiers shown as parameters must be supplied
for the target environment; credentials and deployment tokens must never be committed.

## Current automation status

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
| Function runtime and CORS | `Set-NsoAuditApiRuntime.ps1` | Supply the new Function and Static Web App hostnames |
| Function deployment | `.github/workflows/deploy-api.yml` or `Publish-NsoAuditApi.ps1` | Add the `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` GitHub environment secret; prefer workload-identity deployment before production |
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

## Customer management deployment

Apply versioned SQL migrations through `006_customer_management.sql` before deploying the
management API. See `database/customer-management.md`. Register the environment's exact
`https://<portal-host>/clientmanagement` SPA redirect for management logout, alongside its existing
`/auth/callback`, using `scripts/Set-NsoAuditAppRedirect.ps1` (Azure CLI authentication).
Preserve existing redirects, including `/management` for older releases. Register the new
`/clientmanagement` logout redirect before publishing the web update. The old `/management`
page remains a compatibility redirect to `/clientmanagement`. Staff must also have an active SQL management-role assignment.

Publish API with `scripts/Publish-NsoAuditApi.ps1`, then web via the workflow or
`scripts/Publish-NsoAuditWeb.ps1 -SubscriptionId <id> -ResourceGroupName <rg> -StaticWebAppName <name>`.
The latter keeps the SWA deployment token in process memory/environment and clears it afterward.
Its `production` slot means the primary slot of the selected resource; target the Dev resource
for Dev and a separate resource for future Prod. Validate `/api/health`, unauthenticated
management rejection, and the `/clientmanagement` sign-in page after deployment. Pending contacts
do not establish client login accounts or Microsoft connector permissions.

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
