[CmdletBinding()]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ResourceGroupName = "NSO-Audit",

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $StorageAccountName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $KeyVaultName,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ManagedIdentityName,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
}

$context = Get-AzContext
if (-not $context) {
    throw "No Azure context is available. Open an authenticated Azure Cloud Shell session."
}

Write-Host "Azure context" -ForegroundColor Cyan
[pscustomobject]@{
    SubscriptionName = $context.Subscription.Name
    SubscriptionId   = $context.Subscription.Id
    TenantId         = $context.Tenant.Id
} | Format-Table

Write-Host "Resource group" -ForegroundColor Cyan
$resourceGroup = Get-AzResourceGroup -Name $ResourceGroupName
$resourceGroup | Select-Object ResourceGroupName, Location | Format-Table

Write-Host "Resources" -ForegroundColor Cyan
Get-AzResource -ResourceGroupName $ResourceGroupName |
    Select-Object Name, ResourceType, Location |
    Sort-Object ResourceType, Name |
    Format-Table

Write-Host "Managed identity" -ForegroundColor Cyan
$identity = Get-AzUserAssignedIdentity `
    -ResourceGroupName $ResourceGroupName `
    -Name $ManagedIdentityName
$identity | Select-Object Name, ClientId, PrincipalId, Location | Format-Table

Write-Host "Storage account" -ForegroundColor Cyan
$storage = Get-AzStorageAccount `
    -ResourceGroupName $ResourceGroupName `
    -Name $StorageAccountName
$storage |
    Select-Object StorageAccountName, Location, Kind, EnableHttpsTrafficOnly, MinimumTlsVersion |
    Format-List

Write-Host "Key Vault" -ForegroundColor Cyan
$vault = Get-AzKeyVault `
    -ResourceGroupName $ResourceGroupName `
    -VaultName $KeyVaultName
$vault | Select-Object VaultName, Location, EnableRbacAuthorization | Format-Table

Write-Host "App registration" -ForegroundColor Cyan
$application = Get-AzADApplication -ApplicationId $ApplicationClientId
$application | Select-Object DisplayName, AppId, SignInAudience | Format-Table

if ($application.SignInAudience -ne "AzureADMultipleOrgs") {
    Write-Warning "The application is not configured for multiple Entra organizations."
}

Write-Host "Storage role assignments" -ForegroundColor Cyan
Get-AzRoleAssignment -ObjectId $identity.PrincipalId -Scope $storage.Id |
    Select-Object RoleDefinitionName, Scope |
    Format-Table

Write-Host "Key Vault role assignments" -ForegroundColor Cyan
Get-AzRoleAssignment -ObjectId $identity.PrincipalId -Scope $vault.ResourceId |
    Select-Object RoleDefinitionName, Scope |
    Format-Table

