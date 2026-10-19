[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $StaticWebAppName
)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$previousToken=[Environment]::GetEnvironmentVariable('SWA_CLI_DEPLOYMENT_TOKEN','Process')
Push-Location $repoRoot
try{
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
    [Environment]::SetEnvironmentVariable('SWA_CLI_DEPLOYMENT_TOKEN',$previousToken,'Process')
    $deploymentToken=$null
    Pop-Location
}
