[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$ParametersFile,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][string]$GitHubEnvironment,
    [ValidateSet('Api','Purview')][string]$Workload = 'Api',
    [switch]$Apply
)
$ErrorActionPreference='Stop'
$template=Join-Path $PSScriptRoot '../infra/github-api-deployment.bicep'
$parameterPath=(Resolve-Path -LiteralPath $ParametersFile).Path
$compiled=& az bicep build-params --file $parameterPath --stdout | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Deployment identity parameter compilation failed.'}
$parameters=($compiled.parametersJson | ConvertFrom-Json).parameters
if($parameters.githubRepository.value -ne $Repository -or $parameters.githubEnvironment.value -ne $GitHubEnvironment){throw 'GitHub targets must match the federated trust parameters.'}
$arguments=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--template-file',$template,'--parameters',$parameterPath,'--mode','Incremental')
& az deployment group what-if @arguments
if($LASTEXITCODE -ne 0){throw 'Deployment identity what-if failed.'}
if($Apply){
    $result=& az deployment group create @arguments --name "nso-audit-$($Workload.ToLowerInvariant())-deployment-identity" --query properties.outputs -o json | ConvertFrom-Json
    if($LASTEXITCODE -ne 0){throw 'Deployment identity provisioning failed.'}
    $prefix="AZURE_$($Workload.ToUpperInvariant())_DEPLOY"
    $mapping=@{"${prefix}_CLIENT_ID"=$result.clientId.value;"${prefix}_TENANT_ID"=$result.tenantId.value;"${prefix}_SUBSCRIPTION_ID"=$result.subscriptionId.value}
    foreach($key in $mapping.Keys){
        & gh variable set $key --body $mapping[$key] --repo $Repository --env $GitHubEnvironment
        if($LASTEXITCODE -ne 0){throw "GitHub public variable configuration failed: $key"}
    }
    Write-Host "Secretless $Workload deployment identity and public GitHub variables configured."
}
