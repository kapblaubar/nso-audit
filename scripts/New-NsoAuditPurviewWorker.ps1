[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ResourceGroupName = 'NSO-Audit',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Location = 'westus2',

    [Parameter()]
    [ValidatePattern('^[a-zA-Z0-9-]{2,60}$')]
    [string] $FunctionAppName = 'nso-audit-dev-purview',

    [Parameter()]
    [ValidatePattern('^[a-z0-9]{3,24}$')]
    [string] $HostStorageAccountName = 'nsoauditdevpurview',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $AuditStorageAccountName = 'nsoauditdev',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $KeyVaultName = 'nso-audit-dev-kv',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ManagedIdentityName = 'nso-audit-dev-purview-identity',

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $CertificateName = 'nso-audit-dlp-certificate'
)

$ErrorActionPreference = 'Stop'

function Invoke-AzCli {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]] $Arguments)

    & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }
}

function Ensure-RoleAssignment {
    param(
        [Parameter(Mandatory)][string] $PrincipalObjectId,
        [Parameter(Mandatory)][string] $RoleName,
        [Parameter(Mandatory)][string] $Scope
    )

    $existing = az role assignment list `
        --assignee-object-id $PrincipalObjectId `
        --scope $Scope `
        --role $RoleName `
        --query '[0].id' `
        --output tsv
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect '$RoleName' at '$Scope'." }

    if ($existing) {
        Write-Host "Role already assigned: $RoleName" -ForegroundColor Yellow
        return
    }

    if ($PSCmdlet.ShouldProcess($Scope, "Assign $RoleName to $PrincipalObjectId")) {
        Invoke-AzCli @('role', 'assignment', 'create',
            '--assignee-object-id', $PrincipalObjectId,
            '--assignee-principal-type', 'ServicePrincipal',
            '--role', $RoleName,
            '--scope', $Scope,
            '--output', 'none')
        Write-Host "Assigned role: $RoleName" -ForegroundColor Green
    }
}

if ($SubscriptionId) {
    Invoke-AzCli @('account', 'set', '--subscription', $SubscriptionId)
}

$subscription = az account show --query id --output tsv
if ($LASTEXITCODE -ne 0 -or -not $subscription) {
    throw 'No Azure CLI subscription is selected. Open an authenticated Azure Cloud Shell session.'
}

$resourceGroupId = az group show `
    --name $ResourceGroupName `
    --query id `
    --output tsv
if ($LASTEXITCODE -ne 0 -or -not $resourceGroupId) {
    throw "Resource group '$ResourceGroupName' was not found."
}

$auditStorageId = az storage account show `
    --resource-group $ResourceGroupName `
    --name $AuditStorageAccountName `
    --query id `
    --output tsv
if ($LASTEXITCODE -ne 0 -or -not $auditStorageId) {
    throw "Audit storage account '$AuditStorageAccountName' was not found."
}

$vault = az keyvault show `
    --resource-group $ResourceGroupName `
    --name $KeyVaultName `
    --query '{id:id,uri:properties.vaultUri}' `
    --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $vault.id) {
    throw "Key Vault '$KeyVaultName' was not found."
}

$certificateId = az keyvault certificate show `
    --vault-name $KeyVaultName `
    --name $CertificateName `
    --query id `
    --output tsv
if ($LASTEXITCODE -ne 0 -or -not $certificateId) {
    throw "Certificate '$CertificateName' was not found in Key Vault '$KeyVaultName'."
}

$identity = az identity show `
    --resource-group $ResourceGroupName `
    --name $ManagedIdentityName `
    --query '{id:id,clientId:clientId,principalId:principalId}' `
    --output json 2>$null | ConvertFrom-Json

if (-not $identity) {
    if (-not $PSCmdlet.ShouldProcess($ManagedIdentityName, 'Create Purview worker managed identity')) {
        Write-Host 'Managed identity creation skipped.' -ForegroundColor Cyan
        return
    }
    $identity = az identity create `
        --resource-group $ResourceGroupName `
        --name $ManagedIdentityName `
        --location $Location `
        --query '{id:id,clientId:clientId,principalId:principalId}' `
        --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Managed identity creation failed.' }
    Write-Host "Created managed identity: $ManagedIdentityName" -ForegroundColor Green
}
else {
    Write-Host "Managed identity already exists: $ManagedIdentityName" -ForegroundColor Yellow
}

foreach ($queueName in @('purview-scan-jobs', 'purview-scan-results')) {
    $queueResourceId = "$auditStorageId/queueServices/default/queues/$queueName"
    $exists = az resource show --ids $queueResourceId --api-version 2023-05-01 --query id --output tsv 2>$null
    if (-not $exists -and $PSCmdlet.ShouldProcess($queueName, 'Create audit storage queue')) {
        Invoke-AzCli @('resource', 'create',
            '--id', $queueResourceId,
            '--api-version', '2023-05-01',
            '--properties', '{}',
            '--output', 'none')
        Write-Host "Created queue: $queueName" -ForegroundColor Green
    }
}

$hostStorage = az storage account show `
    --resource-group $ResourceGroupName `
    --name $HostStorageAccountName `
    --query id `
    --output tsv 2>$null
if (-not $hostStorage -and $PSCmdlet.ShouldProcess($HostStorageAccountName, 'Create dedicated Windows Function host storage')) {
    Invoke-AzCli @('storage', 'account', 'create',
        '--resource-group', $ResourceGroupName,
        '--name', $HostStorageAccountName,
        '--location', $Location,
        '--sku', 'Standard_LRS',
        '--kind', 'StorageV2',
        '--https-only', 'true',
        '--min-tls-version', 'TLS1_2',
        '--allow-blob-public-access', 'false',
        '--output', 'none')
    Write-Host "Created host storage: $HostStorageAccountName" -ForegroundColor Green
}

$hostStorage = az storage account show `
    --resource-group $ResourceGroupName `
    --name $HostStorageAccountName `
    --query id `
    --output tsv 2>$null
if (-not $hostStorage) {
    Write-Host 'Host storage creation was skipped; dependent Function App steps were not run.' -ForegroundColor Cyan
    return
}

$functionId = az functionapp show `
    --resource-group $ResourceGroupName `
    --name $FunctionAppName `
    --query id `
    --output tsv 2>$null
if (-not $functionId -and $PSCmdlet.ShouldProcess($FunctionAppName, 'Create Windows PowerShell 7.4 Consumption Function App')) {
    Invoke-AzCli @('functionapp', 'create',
        '--resource-group', $ResourceGroupName,
        '--name', $FunctionAppName,
        '--consumption-plan-location', $Location,
        '--storage-account', $HostStorageAccountName,
        '--functions-version', '4',
        '--runtime', 'powershell',
        '--runtime-version', '7.4',
        '--os-type', 'Windows',
        '--https-only', 'true',
        '--disable-app-insights', 'true',
        '--output', 'none')
    Write-Host "Created Function App: $FunctionAppName" -ForegroundColor Green
}

$functionId = az functionapp show `
    --resource-group $ResourceGroupName `
    --name $FunctionAppName `
    --query id `
    --output tsv 2>$null
if (-not $functionId) {
    Write-Host 'Function App creation was skipped; dependent configuration steps were not run.' -ForegroundColor Cyan
    return
}

if ($PSCmdlet.ShouldProcess($FunctionAppName, "Assign managed identity $ManagedIdentityName")) {
    Invoke-AzCli @('functionapp', 'identity', 'assign',
        '--resource-group', $ResourceGroupName,
        '--name', $FunctionAppName,
        '--identities', $identity.id,
        '--output', 'none')
}

Ensure-RoleAssignment `
    -PrincipalObjectId $identity.principalId `
    -RoleName 'Storage Queue Data Contributor' `
    -Scope $auditStorageId
Ensure-RoleAssignment `
    -PrincipalObjectId $identity.principalId `
    -RoleName 'Key Vault Secrets User' `
    -Scope $vault.id

if ($PSCmdlet.ShouldProcess($FunctionAppName, 'Set non-secret Purview worker configuration')) {
    Invoke-AzCli @('functionapp', 'config', 'appsettings', 'set',
        '--resource-group', $ResourceGroupName,
        '--name', $FunctionAppName,
        '--settings',
        "ENTRA_CLIENT_ID=$ApplicationClientId",
        "ENTRA_CLIENT_CERTIFICATE_NAME=$CertificateName",
        "KEY_VAULT_URI=$($vault.uri)",
        "AZURE_CLIENT_ID=$($identity.clientId)",
        "AuditStorage__accountName=$AuditStorageAccountName",
        'AuditStorage__credential=managedidentity',
        "AuditStorage__clientId=$($identity.clientId)",
        '--output', 'none')
}

Write-Host ''
Write-Host 'Purview worker infrastructure is ready.' -ForegroundColor Green
Write-Host "Function App: $FunctionAppName"
Write-Host "Managed identity: $ManagedIdentityName"
Write-Host 'Next: add AZURE_PURVIEW_FUNCTIONAPP_PUBLISH_PROFILE to the GitHub development environment and run Deploy Purview worker.'
Write-Host 'The worker does not grant Purview roles and does not score evidence; those remain explicit onboarding and Linux API responsibilities.'
