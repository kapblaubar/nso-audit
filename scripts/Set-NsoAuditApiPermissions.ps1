[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId,

    [Parameter()]
    [switch] $IncludeIntuneConfiguration,

    [Parameter()]
    [switch] $IncludeIntuneAppPolicies,

    [Parameter()]
    [switch] $IncludeDefenderVulnerabilityManagement
)

$ErrorActionPreference = "Stop"
$microsoftGraphApplicationId = "00000003-0000-0000-c000-000000000000"
$windowsDefenderAtpApplicationId = "fc780465-2017-40d4-a0c5-307022471b92"

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

if ($IncludeIntuneAppPolicies -and -not $IncludeIntuneConfiguration) {
    Write-Warning "Intune app-policy checks are enabled without the general Intune configuration module."
}

$applicationJson = az ad app show --id $ApplicationClientId --output json
if ($LASTEXITCODE -ne 0 -or -not $applicationJson) {
    throw "App Registration '$ApplicationClientId' was not found or cannot be read."
}
$application = $applicationJson | ConvertFrom-Json

function Get-ApiServicePrincipal {
    param(
        [Parameter(Mandatory)]
        [string] $ApiApplicationId,

        [Parameter(Mandatory)]
        [string] $ApiName
    )

    $servicePrincipalJson = az ad sp show --id $ApiApplicationId --output json
    if ($LASTEXITCODE -ne 0 -or -not $servicePrincipalJson) {
        throw "$ApiName service principal '$ApiApplicationId' could not be read in this tenant."
    }

    return $servicePrincipalJson | ConvertFrom-Json
}

function New-ResourceAccessEntry {
    param(
        [Parameter(Mandatory)]
        [object] $ServicePrincipal,

        [Parameter(Mandatory)]
        [string] $PermissionName,

        [Parameter(Mandatory)]
        [ValidateSet("Role", "Scope")]
        [string] $PermissionType
    )

    if ($PermissionType -eq "Role") {
        $permission = $ServicePrincipal.appRoles | Where-Object {
            $_.value -eq $PermissionName -and $_.allowedMemberTypes -contains "Application"
        }
    }
    else {
        $permission = $ServicePrincipal.oauth2PermissionScopes | Where-Object {
            $_.value -eq $PermissionName -and $_.isEnabled
        }
    }

    if (-not $permission) {
        throw "Permission '$PermissionName' ($PermissionType) was not found on API '$($ServicePrincipal.displayName)'."
    }

    return @{
        id   = $permission.id
        type = $PermissionType
    }
}

$graphApplicationPermissions = @(
    "AuditLog.Read.All",
    "Policy.Read.All",
    "RoleManagement.Read.Directory",
    "SecurityEvents.Read.All",
    "User.ReadBasic.All"
)

if ($IncludeIntuneConfiguration) {
    $graphApplicationPermissions += "DeviceManagementConfiguration.Read.All"
}
if ($IncludeIntuneAppPolicies) {
    $graphApplicationPermissions += "DeviceManagementApps.Read.All"
}

$graph = Get-ApiServicePrincipal `
    -ApiApplicationId $microsoftGraphApplicationId `
    -ApiName "Microsoft Graph"

$graphResourceAccess = @()
foreach ($permissionName in $graphApplicationPermissions) {
    $graphResourceAccess += New-ResourceAccessEntry `
        -ServicePrincipal $graph `
        -PermissionName $permissionName `
        -PermissionType "Role"
}
$graphResourceAccess += New-ResourceAccessEntry `
    -ServicePrincipal $graph `
    -PermissionName "User.Read" `
    -PermissionType "Scope"

$requiredResourceAccess = @(
    @{
        resourceAppId  = $microsoftGraphApplicationId
        resourceAccess = $graphResourceAccess
    }
)

$defenderPermissions = @()
if ($IncludeDefenderVulnerabilityManagement) {
    $defenderPermissions = @("Score.Read.All", "SecurityRecommendation.Read.All")
    $defender = Get-ApiServicePrincipal `
        -ApiApplicationId $windowsDefenderAtpApplicationId `
        -ApiName "WindowsDefenderATP"

    $defenderResourceAccess = @()
    foreach ($permissionName in $defenderPermissions) {
        $defenderResourceAccess += New-ResourceAccessEntry `
            -ServicePrincipal $defender `
            -PermissionName $permissionName `
            -PermissionType "Role"
    }

    $requiredResourceAccess += @{
        resourceAppId  = $windowsDefenderAtpApplicationId
        resourceAccess = $defenderResourceAccess
    }
}

$payload = @{
    requiredResourceAccess = $requiredResourceAccess
} | ConvertTo-Json -Depth 8 -Compress

Write-Host "Exact requested API permission manifest:" -ForegroundColor Cyan
$graphApplicationPermissions | Sort-Object | ForEach-Object {
    Write-Host "  Microsoft Graph application: $_"
}
Write-Host "  Microsoft Graph delegated:   User.Read"
$defenderPermissions | Sort-Object | ForEach-Object {
    Write-Host "  WindowsDefenderATP application: $_"
}
Write-Warning "Applying this manifest replaces every requested API permission on this dedicated App Registration. It does not grant tenant admin consent or Azure RBAC."

if (-not $PSCmdlet.ShouldProcess(
    $application.displayName,
    "Replace requested API permissions with the selected staged allowlist"
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
    throw "The API permission manifest update failed."
}

Write-Host "Requested API permission manifest configured. Tenant admin consent has not been granted." -ForegroundColor Green
