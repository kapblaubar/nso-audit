# Azure setup scripts

These PowerShell scripts are designed for Azure Cloud Shell and contain no subscription IDs,
tenant IDs, credentials, or private keys.

## Order of use

1. `Test-NsoAuditResources.ps1` — read-only resource and application verification.
2. `Set-NsoAuditDataRoles.ps1` — assigns the managed identity's required data-plane roles.
3. `Test-NsoAuditFunctionName.ps1` — read-only Function App name availability check.

Every script accepts `SubscriptionId` and `ResourceGroupName` as parameters. If
`SubscriptionId` is omitted, the current Cloud Shell subscription is used. Scripts confirm
the active subscription before continuing and never store credentials.

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

