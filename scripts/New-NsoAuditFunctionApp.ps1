[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ResourceGroupName = "NSO-Audit",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Location = "westus2",

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9-]{2,60}$')]
    [string] $FunctionAppName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $StorageAccountName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $KeyVaultName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ManagedIdentityName,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ApplicationClientSecretName = "nso-audit-app-client-secret",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ApplicationClientCertificateName = "nso-audit-dlp-certificate"
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI could not select subscription '$SubscriptionId'."
    }
}

$context = Get-AzContext
if (-not $context) {
    throw "No Azure context is available. Open an authenticated Azure Cloud Shell session."
}

$resourceGroup = Get-AzResourceGroup -Name $ResourceGroupName
$storage = Get-AzStorageAccount `
    -ResourceGroupName $ResourceGroupName `
    -Name $StorageAccountName
$vault = Get-AzKeyVault `
    -ResourceGroupName $ResourceGroupName `
    -VaultName $KeyVaultName
$identity = Get-AzUserAssignedIdentity `
    -ResourceGroupName $ResourceGroupName `
    -Name $ManagedIdentityName

if ($resourceGroup.Location -ne $Location) {
    Write-Warning "Resource group location is '$($resourceGroup.Location)'; Function App location will be '$Location'."
}

$existing = Get-AzWebApp `
    -ResourceGroupName $ResourceGroupName `
    -Name $FunctionAppName `
    -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host "Function App already exists: $FunctionAppName" -ForegroundColor Yellow
}
elseif ($PSCmdlet.ShouldProcess(
    "$FunctionAppName in $ResourceGroupName",
    "Create Linux Azure Functions Consumption app"
)) {
    az functionapp create `
        --name $FunctionAppName `
        --resource-group $ResourceGroupName `
        --consumption-plan-location $Location `
        --storage-account $storage.StorageAccountName `
        --functions-version 4 `
        --runtime node `
        --runtime-version 22 `
        --os-type Linux `
        --disable-app-insights true `
        --https-only true `
        --output none

    if ($LASTEXITCODE -ne 0) {
        throw "Function App creation failed."
    }

    Write-Host "Created Function App: $FunctionAppName" -ForegroundColor Green
}
else {
    Write-Host "Creation was skipped; dependent identity and configuration steps were not evaluated." -ForegroundColor Cyan
    return
}

$currentIdentity = az functionapp identity show `
    --name $FunctionAppName `
    --resource-group $ResourceGroupName `
    --query "userAssignedIdentities" `
    --output json 2>$null | ConvertFrom-Json

$hasIdentity = $currentIdentity -and `
    $currentIdentity.PSObject.Properties.Name -contains $identity.Id

if ($hasIdentity) {
    Write-Host "Managed identity already assigned: $ManagedIdentityName" -ForegroundColor Yellow
}
elseif ($PSCmdlet.ShouldProcess($FunctionAppName, "Assign managed identity $ManagedIdentityName")) {
    az functionapp identity assign `
        --name $FunctionAppName `
        --resource-group $ResourceGroupName `
        --identities $identity.Id `
        --output none

    if ($LASTEXITCODE -ne 0) {
        throw "Managed identity assignment failed."
    }

    Write-Host "Assigned managed identity: $ManagedIdentityName" -ForegroundColor Green
}

if ($PSCmdlet.ShouldProcess($FunctionAppName, "Set non-secret application configuration")) {
    az functionapp config appsettings set `
        --name $FunctionAppName `
        --resource-group $ResourceGroupName `
        --settings `
            "KEY_VAULT_URI=$($vault.VaultUri)" `
            "STORAGE_ACCOUNT_NAME=$($storage.StorageAccountName)" `
            "AZURE_CLIENT_ID=$($identity.ClientId)" `
            "ENTRA_CLIENT_SECRET_NAME=$ApplicationClientSecretName" `
            "ENTRA_CLIENT_CERTIFICATE_NAME=$ApplicationClientCertificateName" `
        --output none

    if ($LASTEXITCODE -ne 0) {
        throw "Function App configuration failed."
    }
}

Write-Host "Function App setup complete." -ForegroundColor Cyan
Write-Host "Application Insights is intentionally disabled for the low-cost development environment." -ForegroundColor Cyan
