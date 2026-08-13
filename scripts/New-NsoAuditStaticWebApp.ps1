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
    [string] $StaticWebAppName
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
if ($resourceGroup.Location -ne $Location) {
    Write-Warning "Resource group location is '$($resourceGroup.Location)'; Static Web App location will be '$Location'."
}

$existingJson = az staticwebapp show `
    --name $StaticWebAppName `
    --resource-group $ResourceGroupName `
    --output json 2>$null

if ($LASTEXITCODE -eq 0 -and $existingJson) {
    $existing = $existingJson | ConvertFrom-Json
    Write-Host "Static Web App already exists: $StaticWebAppName" -ForegroundColor Yellow
    [pscustomobject]@{
        Name            = $existing.name
        DefaultHostname = $existing.defaultHostname
        Sku             = $existing.sku.name
    } | Format-Table -AutoSize
    return
}

if (-not $PSCmdlet.ShouldProcess(
    "$StaticWebAppName in $ResourceGroupName",
    "Create Free Azure Static Web App without a deployment source"
)) {
    return
}

$resourceBody = @{
    location   = $Location
    sku        = @{
        name = "Free"
        tier = "Free"
    }
    properties = @{
        allowConfigFileUpdates = $true
    }
    tags       = @{
        application = "nso-audit"
        environment = "dev"
        costProfile = "low"
        managedBy   = "powershell"
    }
} | ConvertTo-Json -Depth 5 -Compress

$createResponse = Invoke-AzRestMethod `
    -Method PUT `
    -Path "/subscriptions/$($context.Subscription.Id)/resourceGroups/$ResourceGroupName/providers/Microsoft.Web/staticSites/$StaticWebAppName`?api-version=2023-12-01" `
    -Payload $resourceBody

if ($createResponse.StatusCode -notin 200, 201, 202) {
    throw "Static Web App creation failed with HTTP status $($createResponse.StatusCode)."
}

Write-Host "Static Web App creation submitted: $StaticWebAppName" -ForegroundColor Green

$site = $null
for ($attempt = 1; $attempt -le 12; $attempt++) {
    Start-Sleep -Seconds 5
    $siteJson = az staticwebapp show `
        --name $StaticWebAppName `
        --resource-group $ResourceGroupName `
        --output json 2>$null

    if ($LASTEXITCODE -eq 0 -and $siteJson) {
        $site = $siteJson | ConvertFrom-Json
        if ($site.defaultHostname) { break }
    }
}

if (-not $site -or -not $site.defaultHostname) {
    Write-Warning "Creation was submitted, but the hostname is not available yet. Check the Azure portal shortly."
    return
}

[pscustomobject]@{
    Name            = $site.name
    DefaultHostname = $site.defaultHostname
    Sku             = $site.sku.name
} | Format-Table -AutoSize

Write-Host "No GitHub connection or deployment token was created by this script." -ForegroundColor Cyan
