[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string] $SubscriptionId,
  [Parameter(Mandatory)][string] $ResourceGroupName,
  [Parameter(Mandatory)][string] $FunctionAppName,
  [Parameter(Mandatory)][ValidatePattern('^https://[^/]+$')][string] $PortalOrigin,
  [Parameter(Mandatory)][ValidatePattern('^https://[^/]+/?$')][string] $EmailEndpoint,
  [Parameter(Mandatory)][string] $EmailSender,
  [Parameter(Mandatory)][Guid] $ManagementObjectId
)
$ErrorActionPreference='Stop'
if($PSCmdlet.ShouldProcess($FunctionAppName,'Configure customer accounts and exact staff identity')) {
  az functionapp config appsettings set --subscription $SubscriptionId --resource-group $ResourceGroupName --name $FunctionAppName --settings "PORTAL_ORIGIN=$PortalOrigin" "ACCOUNT_EMAIL_ENDPOINT=$EmailEndpoint" "ACCOUNT_EMAIL_SENDER=$EmailSender" "ENTRA_MANAGEMENT_OBJECT_ID=$ManagementObjectId" --output none
  if($LASTEXITCODE -ne 0){throw 'Account runtime configuration failed.'}
}
