# Deploy NSO Audit from scratch

This runbook is the source of truth for rebuilding NSO Audit without relying on shell history or
the original development tenant. All names and identifiers shown as parameters must be supplied
for the target environment; credentials and deployment tokens must never be committed.

## Current automation status

| Area | Repository coverage | Remaining work |
| --- | --- | --- |
| Resource group, Storage, tables, managed identity, Key Vault, Function and Static Web App | Initial Bicep exists under `infra/` | Reconcile the template with the proven live configuration and current Functions hosting guidance before using it for a clean deployment |
| App Registration permissions | `Set-NsoAuditApiPermissions.ps1` | App Registration creation, verified publisher, ownership and production naming still require automation/review |
| Protected API scope | `Set-NsoAuditApiScope.ps1` | None after the App Registration exists |
| SPA redirect | `Set-NsoAuditAppRedirect.ps1` | Supply the new Static Web App hostname |
| Workload federation | `Set-NsoAuditWorkloadFederation.ps1` | Supply the new managed identity and App Registration IDs |
| Function runtime and CORS | `Set-NsoAuditApiRuntime.ps1` | Supply the new Function and Static Web App hostnames |
| Function deployment | `Publish-NsoAuditApi.ps1` | Run after infrastructure and identity configuration |
| Web deployment | `.github/workflows/deploy-web.yml` | GitHub environment and Static Web App deployment token are still created manually |
| Customer consent and Azure roles | Portal consent plus downloadable `Set-NsoAuditCustomerReaderRoles.ps1` | Must be completed independently in every customer tenant |

The current Bicep is **not yet certified as a clean-deployment template**. In particular, its
Functions plan, diagnostics cost profile, storage-key settings, app settings, and outputs must be
tested against a disposable environment. Use the scripts and live configuration as evidence when
reconciling it; do not deploy the template blindly into production.

## Required deployment order

1. Choose the subscription, region, environment name, globally unique resource suffix, and
   `NSO-Audit` resource-group name.
2. Run an infrastructure `what-if`; review every resource and role assignment before applying.
3. Create the vendor-owned multitenant App Registration and record its public client ID.
4. Apply the exact allowlisted API permissions with `Set-NsoAuditApiPermissions.ps1`.
5. Expose `api://{clientId}/access_as_user` with `Set-NsoAuditApiScope.ps1`.
6. Add the Static Web App callback with `Set-NsoAuditAppRedirect.ps1`.
7. Configure the managed-identity federated credential with
   `Set-NsoAuditWorkloadFederation.ps1`.
8. Configure Function settings and exact CORS origin with `Set-NsoAuditApiRuntime.ps1`.
9. Verify managed-identity Storage and Key Vault roles with `Test-NsoAuditResources.ps1`.
10. Publish the API with `Publish-NsoAuditApi.ps1` and test `/api/health`.
11. Configure the GitHub `AZURE_STATIC_WEB_APPS_API_TOKEN` secret and environment-specific Vite
    public identifiers, then run the web deployment workflow.
12. Complete a disposable customer-tenant test: sign in, grant admin consent, assign customer
    reader roles, run **Check access**, run an audit, reopen its report, and run it again.

## Acceptance checks for a rebuild

- No subscription ID, tenant ID, access token, storage key, deployment token, secret, or private
  certificate is committed.
- The Function uses only its user-assigned managed identity for platform Storage and workload
  federation.
- `tenants`, `scans`, and `findings` tables exist and reject anonymous access.
- The API rejects a Subscription ID whose owning tenant differs from the signed token tenant.
- A user from one tenant cannot retrieve another tenant's scan, even with a known scan ID.
- Repeated audits create new scan rows and preserve previous reports.
- Deleting customer role assignments or consent causes **Check access** to fail safely.
- Infrastructure and application deployment can be repeated without creating duplicate role
  assignments or corrupting existing tenant data.

## Next automation milestone

Create one environment bootstrap command that deploys the reconciled Bicep, applies the Entra
configuration, publishes the API, and prints the GitHub values that still require an authorized
human action. Keep customer-tenant onboarding separate from vendor-platform deployment.
