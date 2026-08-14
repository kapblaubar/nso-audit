[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId
)

$ErrorActionPreference = "Stop"
$scopeValue = "access_as_user"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI could not select subscription '$SubscriptionId'." }
}

$applicationJson = az ad app show --id $ApplicationClientId --output json
if ($LASTEXITCODE -ne 0 -or -not $applicationJson) {
    throw "App Registration '$ApplicationClientId' was not found or cannot be read."
}
$application = $applicationJson | ConvertFrom-Json

$existingScopes = @($application.api.oauth2PermissionScopes | Where-Object { $_ })
$existingScope = $existingScopes | Where-Object { $_.value -eq $scopeValue }
if ($existingScope -and $existingScope.isEnabled) {
    Write-Host "API scope already configured: api://$ApplicationClientId/$scopeValue" -ForegroundColor Yellow
    return
}

$scopeId = if ($existingScope) { $existingScope.id } else { [guid]::NewGuid().Guid }
$newScope = @{
    id                          = $scopeId
    value                       = $scopeValue
    type                        = "User"
    isEnabled                   = $true
    adminConsentDisplayName     = "Access NSO Audit as the signed-in user"
    adminConsentDescription     = "Allows the NSO Audit portal to access its protected API for the signed-in tenant."
    userConsentDisplayName      = "Access your NSO Audit tenant workspace"
    userConsentDescription      = "Allows the NSO Audit portal to load setup status and reports for your signed-in tenant."
}

$updatedScopes = @($existingScopes | Where-Object { $_.value -ne $scopeValue }) + $newScope
$identifierUris = @($application.identifierUris | Where-Object { $_ })
$apiIdentifier = "api://$ApplicationClientId"
if ($identifierUris -notcontains $apiIdentifier) {
    $identifierUris += $apiIdentifier
}

$payload = @{
    identifierUris = $identifierUris
    api = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes       = $updatedScopes
        preAuthorizedApplications   = @($application.api.preAuthorizedApplications | Where-Object { $_ })
        knownClientApplications     = @($application.api.knownClientApplications | Where-Object { $_ })
    }
} | ConvertTo-Json -Depth 10 -Compress

if (-not $PSCmdlet.ShouldProcess(
    $application.displayName,
    "Expose delegated API scope $apiIdentifier/$scopeValue"
)) { return }

az rest `
    --method patch `
    --url "https://graph.microsoft.com/v1.0/applications/$($application.id)" `
    --headers "Content-Type=application/json" `
    --body $payload `
    --output none

if ($LASTEXITCODE -ne 0) { throw "API scope configuration failed." }
Write-Host "Exposed API scope: $apiIdentifier/$scopeValue" -ForegroundColor Green

