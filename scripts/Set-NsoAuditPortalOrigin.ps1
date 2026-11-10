[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$SubscriptionId,
  [Parameter(Mandatory)][string]$ResourceGroupName,
  [Parameter(Mandatory)][string]$FunctionAppName,
  [Parameter(Mandatory)][ValidatePattern('^https://[^/\s]+$')][string]$PortalOrigin
)
$ErrorActionPreference='Stop'
$originUri=[Uri]$PortalOrigin
if($originUri.UserInfo -or $originUri.Query -or $originUri.Fragment -or $PortalOrigin.Contains('*')){throw 'An exact HTTPS origin is required.'}
$target=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--name',$FunctionAppName)
$query="[?name=='PORTAL_ORIGIN'].value | [0]"
$current=& az functionapp config appsettings list @target --query $query -o tsv
if($LASTEXITCODE -ne 0){throw 'Could not read portal origin.'}
Write-Host "Portal origin: $current -> $PortalOrigin"
if($current -ceq $PortalOrigin){return}
if($PSCmdlet.ShouldProcess($FunctionAppName,"Set PORTAL_ORIGIN to $PortalOrigin")){
  & az functionapp config appsettings set @target --settings "PORTAL_ORIGIN=$PortalOrigin" --output none
  if($LASTEXITCODE -ne 0){throw 'Could not update portal origin.'}
  $verified=& az functionapp config appsettings list @target --query $query -o tsv
  if($LASTEXITCODE -ne 0 -or $verified -cne $PortalOrigin){throw 'Portal origin verification failed.'}
  Write-Host "Verified portal origin: $verified"
}
