[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId,

    [Parameter(Mandatory)]
    [ValidatePattern('^https://[^\s]+$')]
    [string] $RedirectUri
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI could not select subscription '$SubscriptionId'."
    }
}

az account show --output none
if ($LASTEXITCODE -ne 0) { throw "Sign in with Azure CLI before configuring redirects." }

$applicationJson = az ad app show --id $ApplicationClientId --output json
if ($LASTEXITCODE -ne 0 -or -not $applicationJson) {
    throw "App Registration '$ApplicationClientId' was not found or cannot be read."
}

$application = $applicationJson | ConvertFrom-Json
$currentRedirects = @($application.spa.redirectUris | Where-Object { $_ })

if ($currentRedirects -contains $RedirectUri) {
    Write-Host "SPA redirect URI already configured: $RedirectUri" -ForegroundColor Yellow
    return
}

$updatedRedirects = @($currentRedirects + $RedirectUri | Sort-Object -Unique)
$payload = @{
    spa = @{
        redirectUris = $updatedRedirects
    }
} | ConvertTo-Json -Depth 4 -Compress

if (-not $PSCmdlet.ShouldProcess(
    $application.displayName,
    "Add SPA redirect URI $RedirectUri"
)) {
    return
}

$payloadPath = [System.IO.Path]::GetTempFileName()
try {
$payload | Set-Content -LiteralPath $payloadPath -Encoding utf8
az rest `
    --method patch `
    --url "https://graph.microsoft.com/v1.0/applications/$($application.id)" `
    --headers "Content-Type=application/json" `
    --body "@$payloadPath" `
    --output none

if ($LASTEXITCODE -ne 0) {
    throw "App Registration redirect URI update failed."
}
} finally {
    Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Added SPA redirect URI: $RedirectUri" -ForegroundColor Green
Write-Host "Existing SPA redirect URIs were preserved." -ForegroundColor Cyan

