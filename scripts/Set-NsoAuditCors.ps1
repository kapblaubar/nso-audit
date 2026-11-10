[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$SubscriptionId,
  [Parameter(Mandatory)][string]$ResourceGroupName,
  [Parameter(Mandatory)][string]$FunctionAppName,
  [Parameter(Mandatory)][ValidatePattern('^https://[^/\s]+$')][string]$FrontendOrigin
)
$ErrorActionPreference='Stop'
$originUri=[Uri]$FrontendOrigin
if($originUri.UserInfo -or $originUri.Query -or $originUri.Fragment -or $FrontendOrigin.Contains('*')){throw 'An exact HTTPS origin is required.'}
$target=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--name',$FunctionAppName)
$current=& az functionapp cors show @target -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Could not read API CORS configuration.'}
if(@($current.allowedOrigins) -contains $FrontendOrigin){Write-Host 'The exact origin is already allowed.';return}
if($PSCmdlet.ShouldProcess($FunctionAppName,"Add CORS origin $FrontendOrigin, preserving existing origins and credential policy")){
  & az functionapp cors add @target --allowed-origins $FrontendOrigin --output none
  if($LASTEXITCODE -ne 0){throw 'Could not add API CORS origin.'}
  $verified=& az functionapp cors show @target -o json | ConvertFrom-Json
  if($LASTEXITCODE -ne 0){throw 'Could not verify API CORS configuration.'}
  if(@($verified.allowedOrigins) -notcontains $FrontendOrigin){throw 'New CORS origin was not persisted.'}
  foreach($existing in @($current.allowedOrigins)){if(@($verified.allowedOrigins) -notcontains $existing){throw 'An existing origin was lost.'}}
  if($verified.supportCredentials -ne $current.supportCredentials){throw 'CORS credential policy changed unexpectedly.'}
  Write-Host "Verified CORS origin: $FrontendOrigin"
}
