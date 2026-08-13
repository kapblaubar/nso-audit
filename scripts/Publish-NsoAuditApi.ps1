[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ResourceGroupName = "NSO-Audit",

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9-]{2,60}$')]
    [string] $FunctionAppName
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

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$apiPath = Join-Path $repositoryRoot "apps/api"
$packagePath = Join-Path ([System.IO.Path]::GetTempPath()) "nso-audit-api-package"
$zipPath = Join-Path ([System.IO.Path]::GetTempPath()) "nso-audit-api.zip"

if (-not (Test-Path (Join-Path $apiPath "host.json"))) {
    throw "API project was not found at '$apiPath'. Run this script from a cloned NSO Audit repository."
}

$functionApp = Get-AzWebApp `
    -ResourceGroupName $ResourceGroupName `
    -Name $FunctionAppName `
    -ErrorAction Stop

Write-Host "Building API workspace" -ForegroundColor Cyan
Push-Location $repositoryRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

    npm run build --workspace '@nso-audit/api'
    if ($LASTEXITCODE -ne 0) { throw "API build failed." }
}
finally {
    Pop-Location
}

if (Test-Path $packagePath) {
    Remove-Item $packagePath -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $packagePath | Out-Null
Copy-Item (Join-Path $apiPath "host.json") $packagePath
Copy-Item (Join-Path $apiPath "package.json") $packagePath
Copy-Item (Join-Path $apiPath "dist") $packagePath -Recurse

Write-Host "Installing production API dependencies" -ForegroundColor Cyan
Push-Location $packagePath
try {
    npm install --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "Production dependency installation failed." }
}
finally {
    Pop-Location
}

Compress-Archive -Path (Join-Path $packagePath "*") -DestinationPath $zipPath

if ($PSCmdlet.ShouldProcess(
    "$($functionApp.Name) in $ResourceGroupName",
    "Publish API ZIP package"
)) {
    az functionapp deployment source config-zip `
        --resource-group $ResourceGroupName `
        --name $FunctionAppName `
        --src $zipPath `
        --output none

    if ($LASTEXITCODE -ne 0) {
        throw "Function App ZIP deployment failed."
    }

    Write-Host "Published API to $FunctionAppName" -ForegroundColor Green
}

Remove-Item $packagePath -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host "Deployment package removed from temporary storage." -ForegroundColor Cyan

