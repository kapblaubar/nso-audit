# Azure setup scripts

These PowerShell scripts are designed for Azure Cloud Shell and contain no subscription IDs,
tenant IDs, credentials, or private keys.

## Order of use

1. `Test-NsoAuditResources.ps1` — read-only resource and application verification.
2. `Set-NsoAuditDataRoles.ps1` — assigns the managed identity's required data-plane roles.
3. `Test-NsoAuditFunctionName.ps1` — read-only Function App name availability check.
4. `New-NsoAuditFunctionApp.ps1` — creates the low-cost development Function App, assigns the
   existing user-managed identity, and sets non-secret configuration.
5. `Publish-NsoAuditApi.ps1` — builds a clean API ZIP with production dependencies and publishes
   it to an existing Function App. Temporary deployment files are deleted afterward.
6. `New-NsoAuditStaticWebApp.ps1` — creates a Free Static Web App without connecting GitHub or
   retrieving a deployment token. It is idempotent within the selected resource group.
7. `Set-NsoAuditAppRedirect.ps1` — adds an HTTPS SPA callback to an App Registration while
   preserving existing SPA redirect URIs.
8. `Set-NsoAuditPhase1GraphPermissions.ps1` — replaces the dedicated App Registration's API
   permissions with the reviewed Phase 1 Microsoft Graph allowlist. It does not grant consent.
9. `Set-NsoAuditApiPermissions.ps1` — replaces the dedicated App Registration's requested API
   permissions with the core allowlist plus explicitly selected Intune and Defender scorecard
   modules. It does not grant consent or Azure RBAC. This supersedes the Phase 1-only script for
   future configuration changes.
10. `Set-NsoAuditCustomerReaderRoles.ps1` — customer-side, opt-in assignment of Azure `Reader`,
    `Security Reader`, `Backup Reader`, `Log Analytics Reader`, and `Microsoft Sentinel Reader`
    at explicit subscription, workspace, and vault scopes. It assigns nothing without selected
    switches/resource IDs and supports `-WhatIf`.
11. `Set-NsoAuditApiScope.ps1` — exposes the delegated `access_as_user` scope used by the SPA to
    call the protected NSO Audit API. It preserves existing API scopes.
12. `Set-NsoAuditApiRuntime.ps1` — sets the Function App's public Entra client ID and allows the
    exact Static Web App origin through CORS. It stores no credentials.

Azure-facing scripts accept `SubscriptionId`; resource-scoped scripts also accept
`ResourceGroupName`. If `SubscriptionId` is omitted, the current Cloud Shell subscription is
used. Scripts confirm the active subscription before continuing and never store credentials.

Example:

```powershell
./scripts/Test-NsoAuditResources.ps1 `
    -ResourceGroupName "NSO-Audit" `
    -StorageAccountName "nsoauditdev" `
    -KeyVaultName "nso-audit-dev-kv" `
    -ManagedIdentityName "nso-audit-dev-identity" `
    -ApplicationClientId "00000000-0000-0000-0000-000000000000"
```

The application client ID is a public identifier. Never add secrets, access tokens, storage
keys, certificate private keys, or passwords to these files.
