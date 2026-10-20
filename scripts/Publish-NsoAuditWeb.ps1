[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $StaticWebAppName,
    [Parameter(Mandatory)][string] $PublicConfigurationFile
)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$previousToken=[Environment]::GetEnvironmentVariable('SWA_CLI_DEPLOYMENT_TOKEN','Process')
$publicConfiguration=Get-Content -Raw -LiteralPath $PublicConfigurationFile | ConvertFrom-Json
$previousPublic=@{}
foreach($key in @('VITE_ENTRA_CLIENT_ID','VITE_AUTH_REDIRECT_URI','VITE_API_BASE_URL','VITE_API_SCOPE')){
    $value=[string]$publicConfiguration.$key
    if(-not $value -or $value -match '[\r\n]'){throw "Invalid public setting $key"}
    $previousPublic[$key]=[Environment]::GetEnvironmentVariable($key,'Process')
}
$api=[string]$publicConfiguration.VITE_API_BASE_URL
if($api -ne '/api' -and ([Uri]$api).Scheme -ne 'https'){throw 'Use HTTPS API or same-origin /api.'}
if(([Uri]$publicConfiguration.VITE_AUTH_REDIRECT_URI).Scheme -ne 'https'){throw 'Use HTTPS callback.'}
Push-Location $repoRoot
try{
    foreach($key in $previousPublic.Keys){[Environment]::SetEnvironmentVariable($key,[string]$publicConfiguration.$key,'Process')}
    & npm run build --workspace '@nso-audit/web'
    if($LASTEXITCODE -ne 0){throw 'Frontend build failed.'}
    $deploymentToken=& az staticwebapp secrets list --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $StaticWebAppName --query properties.apiKey -o tsv
    if($LASTEXITCODE -ne 0 -or -not $deploymentToken){throw 'Unable to obtain deployment authorization.'}
    $env:SWA_CLI_DEPLOYMENT_TOKEN=$deploymentToken
    $deploymentToken=$null
    # "production" selects the primary slot of this explicit resource. NSO-Audit remains Dev.
    & npx --yes '@azure/static-web-apps-cli@2.0.10' deploy (Join-Path $repoRoot 'apps/web/dist') --env production
    if($LASTEXITCODE -ne 0){throw 'Static Web App deployment failed.'}
}finally{
    foreach($key in $previousPublic.Keys){[Environment]::SetEnvironmentVariable($key,$previousPublic[$key],'Process')}
    [Environment]::SetEnvironmentVariable('SWA_CLI_DEPLOYMENT_TOKEN',$previousToken,'Process')
    $deploymentToken=$null
    Pop-Location
}
