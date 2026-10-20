[CmdletBinding()]
param(
  [Parameter(Mandatory)][string] $SubscriptionId,
  [Parameter(Mandatory)][string] $ResourceGroupName,
  [Parameter(Mandatory)][string] $ParametersFile,
  [string] $DeploymentName='nso-audit-api-network',
  [switch] $Apply
)
$ErrorActionPreference='Stop'
$template=Join-Path $PSScriptRoot '../infra/api-network.bicep'
$parametersPath=(Resolve-Path -LiteralPath $ParametersFile).Path
$state=az provider show --subscription $SubscriptionId --namespace Microsoft.App --query registrationState -o tsv
if($LASTEXITCODE -ne 0){throw 'Could not inspect Microsoft.App registration.'}
if($state -ne 'Registered'){
  if(-not $Apply){throw 'Microsoft.App must be registered before validating Flex VNet integration. Run this wrapper with -Apply to register and inspect deployment.'}
  az provider register --subscription $SubscriptionId --namespace Microsoft.App --wait -o none
  if($LASTEXITCODE -ne 0){throw 'Microsoft.App provider registration failed.'}
}
az bicep build --file $template --stdout | Out-Null
if($LASTEXITCODE -ne 0){throw 'API network template failed compilation.'}
$arguments=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--template-file',$template,'--parameters',$parametersPath,'--mode','Incremental')
az deployment group what-if @arguments
if($LASTEXITCODE -ne 0){throw 'API network what-if failed.'}
if($Apply){
  az deployment group create @arguments --name $DeploymentName --query '{state:properties.provisioningState,outputs:properties.outputs}' -o json
  if($LASTEXITCODE -ne 0){throw 'API network deployment failed.'}
}
