[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId = "f293a122-bf49-44a7-bfc9-48cfae6f8376",

    [Parameter()]
    [switch] $IncludeAzureResourceReader,

    [Parameter()]
    [switch] $IncludeDefenderForCloud,

    [Parameter()]
    [ValidateScript({ $_ -match '^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.OperationalInsights/workspaces/[^/]+$' })]
    [string[]] $LogAnalyticsWorkspaceResourceId = @(),

    [Parameter()]
    [ValidateScript({ $_ -match '^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.OperationalInsights/workspaces/[^/]+$' })]
    [string[]] $SentinelWorkspaceResourceId = @(),

    [Parameter()]
    [ValidateScript({ $_ -match '^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.RecoveryServices/vaults/[^/]+$' })]
    [string[]] $RecoveryServicesVaultResourceId = @()
)

$ErrorActionPreference = "Stop"

Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
$context = Get-AzContext
if (-not $context -or $context.Subscription.Id -ne $SubscriptionId) {
    throw "Azure subscription '$SubscriptionId' could not be selected."
}

$servicePrincipal = Get-AzADServicePrincipal -ApplicationId $ApplicationClientId -ErrorAction Stop
if (-not $servicePrincipal) {
    throw "The NSO Audit Enterprise Application was not found. Complete Microsoft tenant admin consent first."
}

$subscriptionScope = "/subscriptions/$SubscriptionId"
$assignments = @()
if ($IncludeAzureResourceReader) {
    $assignments += @{ Role = "Reader"; Scope = $subscriptionScope }
}
if ($IncludeDefenderForCloud) {
    $assignments += @{ Role = "Security Reader"; Scope = $subscriptionScope }
}
foreach ($workspaceId in $LogAnalyticsWorkspaceResourceId) {
    $assignments += @{ Role = "Log Analytics Reader"; Scope = $workspaceId }
}
foreach ($workspaceId in $SentinelWorkspaceResourceId) {
    $assignments += @{ Role = "Microsoft Sentinel Reader"; Scope = $workspaceId }
}
foreach ($vaultId in $RecoveryServicesVaultResourceId) {
    $assignments += @{ Role = "Backup Reader"; Scope = $vaultId }
}
if ($assignments.Count -eq 0) {
    throw "No roles were selected. Use an Include switch or provide explicit workspace/vault resource IDs."
}

Write-Host "NSO Audit Enterprise Application: $($servicePrincipal.DisplayName)" -ForegroundColor Cyan
Write-Host "Proposed read-only assignments:" -ForegroundColor Cyan
$assignments | ForEach-Object { Write-Host "  $($_.Role) at $($_.Scope)" }

foreach ($assignment in $assignments) {
    $existing = Get-AzRoleAssignment `
        -ObjectId $servicePrincipal.Id `
        -RoleDefinitionName $assignment.Role `
        -Scope $assignment.Scope `
        -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "Already assigned: $($assignment.Role) at $($assignment.Scope)" -ForegroundColor Yellow
        continue
    }

    if ($PSCmdlet.ShouldProcess(
        "$($servicePrincipal.DisplayName) at $($assignment.Scope)",
        "Assign $($assignment.Role)"
    )) {
        New-AzRoleAssignment `
            -ObjectId $servicePrincipal.Id `
            -RoleDefinitionName $assignment.Role `
            -Scope $assignment.Scope | Out-Null
        Write-Host "Assigned: $($assignment.Role) at $($assignment.Scope)" -ForegroundColor Green
    }
}

Write-Host "Azure RBAC processing complete. Propagation can take several minutes." -ForegroundColor Cyan
