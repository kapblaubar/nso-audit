[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId
)

$ErrorActionPreference = "Stop"
$graphApplicationId = "00000003-0000-0000-c000-000000000000"
$requiredApplicationPermissions = @(
    "AuditLog.Read.All",
    "Policy.Read.All",
    "RoleManagement.Read.Directory",
    "SecurityEvents.Read.All",
    "User.ReadBasic.All"
)
$requiredDelegatedPermissions = @("User.Read")

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

$applicationJson = az ad app show --id $ApplicationClientId --output json
if ($LASTEXITCODE -ne 0 -or -not $applicationJson) {
    throw "App Registration '$ApplicationClientId' was not found or cannot be read."
}
$application = $applicationJson | ConvertFrom-Json

$graphJson = az ad sp show --id $graphApplicationId --output json
if ($LASTEXITCODE -ne 0 -or -not $graphJson) {
    throw "The Microsoft Graph service principal could not be read."
}
$graph = $graphJson | ConvertFrom-Json

$resourceAccess = @()
foreach ($permissionName in $requiredApplicationPermissions) {
    $role = $graph.appRoles | Where-Object {
        $_.value -eq $permissionName -and $_.allowedMemberTypes -contains "Application"
    }
    if (-not $role) {
        throw "Microsoft Graph application permission '$permissionName' was not found."
    }
    $resourceAccess += @{
        id   = $role.id
        type = "Role"
    }
}

foreach ($permissionName in $requiredDelegatedPermissions) {
    $scope = $graph.oauth2PermissionScopes | Where-Object {
        $_.value -eq $permissionName -and $_.isEnabled
    }
    if (-not $scope) {
        throw "Microsoft Graph delegated permission '$permissionName' was not found."
    }
    $resourceAccess += @{
        id   = $scope.id
        type = "Scope"
    }
}

$payload = @{
    requiredResourceAccess = @(
        @{
            resourceAppId  = $graphApplicationId
            resourceAccess = $resourceAccess
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

Write-Host "Exact Microsoft Graph permission manifest:" -ForegroundColor Cyan
$requiredApplicationPermissions | ForEach-Object {
    Write-Host "  Application: $_"
}
$requiredDelegatedPermissions | ForEach-Object {
    Write-Host "  Delegated:   $_"
}
Write-Warning "Applying this manifest replaces other requested API permissions on this dedicated App Registration. It does not grant tenant admin consent."

if (-not $PSCmdlet.ShouldProcess(
    $application.displayName,
    "Replace requested API permissions with the reviewed Phase 1 allowlist"
)) {
    return
}

az rest `
    --method patch `
    --url "https://graph.microsoft.com/v1.0/applications/$($application.id)" `
    --headers "Content-Type=application/json" `
    --body $payload `
    --output none

if ($LASTEXITCODE -ne 0) {
    throw "The Microsoft Graph permission manifest update failed."
}

Write-Host "Phase 1 permission manifest configured. Admin consent has not been granted." -ForegroundColor Green
