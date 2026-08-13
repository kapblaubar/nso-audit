[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
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
    [string] $ManagedIdentityName
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
}

$context = Get-AzContext
if (-not $context) {
    throw "No Azure context is available. Open an authenticated Azure Cloud Shell session."
}

$identity = Get-AzUserAssignedIdentity `
    -ResourceGroupName $ResourceGroupName `
    -Name $ManagedIdentityName
$storage = Get-AzStorageAccount `
    -ResourceGroupName $ResourceGroupName `
    -Name $StorageAccountName
$vault = Get-AzKeyVault `
    -ResourceGroupName $ResourceGroupName `
    -VaultName $KeyVaultName

$assignments = @(
    @{ Role = "Storage Blob Data Contributor"; Scope = $storage.Id },
    @{ Role = "Storage Queue Data Contributor"; Scope = $storage.Id },
    @{ Role = "Storage Table Data Contributor"; Scope = $storage.Id },
    @{ Role = "Key Vault Secrets User"; Scope = $vault.ResourceId }
)

foreach ($assignment in $assignments) {
    $existing = Get-AzRoleAssignment `
        -ObjectId $identity.PrincipalId `
        -Scope $assignment.Scope `
        -RoleDefinitionName $assignment.Role `
        -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "Already assigned: $($assignment.Role)" -ForegroundColor Yellow
        continue
    }

    $target = "$($identity.Name) at $($assignment.Scope)"
    if ($PSCmdlet.ShouldProcess($target, "Assign $($assignment.Role)")) {
        New-AzRoleAssignment `
            -ObjectId $identity.PrincipalId `
            -Scope $assignment.Scope `
            -RoleDefinitionName $assignment.Role | Out-Null
        Write-Host "Assigned: $($assignment.Role)" -ForegroundColor Green
    }
}

Write-Host "Role assignment processing complete. Azure RBAC propagation can take several minutes." -ForegroundColor Cyan

