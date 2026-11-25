param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $ParametersFile
)
$ErrorActionPreference = 'Stop'
# Update only the Purview settings while the main API's full template is reconciled.
$compiled = az bicep build-params --file $ParametersFile --stdout
if ($LASTEXITCODE -ne 0) { throw 'Could not compile API parameters.' }
$parameters = (($compiled | ConvertFrom-Json).parametersJson | ConvertFrom-Json).parameters
$endpoint = [uri]$parameters.purviewCollectorUrl.value
if ($endpoint.Scheme -ne 'https' -or $endpoint.AbsolutePath -ne '/api/dlp') {
    throw 'Purview collector URL must be an HTTPS /api/dlp endpoint.'
}
$tenants = $parameters.purviewTenantIds.value -join ','
$settings = @("PURVIEW_COLLECTOR_URL=$endpoint")
if ($tenants) { $settings += "PURVIEW_TENANT_IDS=$tenants" }
az functionapp config appsettings set --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name $parameters.functionAppName.value --settings $settings -o none
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the Purview caller.' }
if (-not $tenants) {
    az functionapp config appsettings delete --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $parameters.functionAppName.value --setting-names PURVIEW_TENANT_IDS -o none
    if ($LASTEXITCODE -ne 0) { throw 'Could not disable Purview collection.' }
}
