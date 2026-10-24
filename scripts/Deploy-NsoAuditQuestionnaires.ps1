[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SubscriptionId,
  [Parameter(Mandatory)][string]$OperatorIpv4Address,
  [Parameter(Mandatory)][ValidatePattern('^nso-audit-validation-[a-f0-9]{8}$')][string]$ValidationDatabaseName,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f-]{36}$')][string]$RuntimeClientId,
  [switch]$Apply,
  [switch]$DatabaseOnly
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$group='NSO-Audit'
$server='nso-audit-dev-257f10d8'
$database='nso-audit-dev'
$rule='operator-'+$ValidationDatabaseName
$address=$null
if(-not [Net.IPAddress]::TryParse($OperatorIpv4Address,[ref]$address) -or $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $OperatorIpv4Address -eq '0.0.0.0'){throw 'Exact operator IPv4 required.'}
$active=& az account show --query id -o tsv
if($LASTEXITCODE -ne 0 -or $active -ne $SubscriptionId){throw 'Active CLI subscription must match the explicit Dev target.'}
$target=@('--subscription',$SubscriptionId,'--resource-group',$group,'--server',$server)
$existing=@(& az sql db list @target --query '[].name' -o tsv)
if($LASTEXITCODE -ne 0 -or $existing -contains $ValidationDatabaseName){throw 'Validation target must be a new, disposable database.'}
$arguments=@('--subscription',$SubscriptionId,'--resource-group',$group,'--template-file',(Join-Path $root 'infra/sql-validation.bicep'),
  '--parameters',"sqlServerName=$server","databaseName=$ValidationDatabaseName",'location=westus2',"operatorIpv4Address=$OperatorIpv4Address","operatorRuleName=$rule",'--mode','Incremental')
& az deployment group what-if @arguments
if($LASTEXITCODE -ne 0){throw 'Validation infrastructure what-if failed.'}
if(-not $Apply){Write-Host 'Plan only. Inspect what-if before repeating with -Apply.';return}
$keys=@('SQL_SERVER','SQL_DATABASE','SQL_RUNTIME_CLIENT_ID','CONFIRM_DEV_WRITE_TEST','QUESTIONNAIRE_TEST_API_BASE_URL','QUESTIONNAIRE_TEST_PORTAL_URL')
$previous=@{}
foreach($key in $keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
function Invoke-CheckedNode([string]$Script,[string[]]$NodeArguments=@()){
  & node (Join-Path $root $Script) @NodeArguments
  if($LASTEXITCODE -ne 0){throw "Failed: $Script $NodeArguments"}
}
$attempted=$false
Push-Location $root
try{
  $attempted=$true
  & az deployment group create @arguments --name $ValidationDatabaseName --query properties.provisioningState -o tsv
  if($LASTEXITCODE -ne 0){throw 'Disposable validation resources failed to provision.'}
  $env:SQL_SERVER="$server.database.windows.net"
  $env:SQL_DATABASE=$ValidationDatabaseName
  $env:SQL_RUNTIME_CLIENT_ID=$RuntimeClientId
  $env:CONFIRM_DEV_WRITE_TEST='yes'
  Invoke-CheckedNode 'scripts/build-client-questionnaire.mjs' @('--check')
  Invoke-CheckedNode 'scripts/build-guided-questionnaire.mjs' @('--check')
  Invoke-CheckedNode 'scripts/database.mjs' @('migrate','--through=013_questionnaires.sql')
  Invoke-CheckedNode 'scripts/database.mjs' @('bootstrap')
  Invoke-CheckedNode 'scripts/verify-client-assessments.mjs' @('--validate-migration')
  Invoke-CheckedNode 'scripts/database.mjs' @('migrate','--through=014_client_assessment.sql')
  Invoke-CheckedNode 'scripts/verify-guided-questionnaire.mjs' @('--validate-migration')
  Invoke-CheckedNode 'scripts/database.mjs' @('migrate')
  Invoke-CheckedNode 'scripts/verify-guided-questionnaire.mjs'
  Invoke-CheckedNode 'scripts/verify-questionnaires.mjs'
  Invoke-CheckedNode 'scripts/verify-client-assessments.mjs'
  Invoke-CheckedNode 'scripts/verify-account-cleanup.mjs'
  Write-Host 'Disposable migration and runtime validation passed. Applying additive Dev migration.'
  $env:SQL_DATABASE=$database
  Invoke-CheckedNode 'scripts/database.mjs' @('migrate')
  Invoke-CheckedNode 'scripts/database.mjs' @('migrate')
  Invoke-CheckedNode 'scripts/verify-guided-questionnaire.mjs'
  Invoke-CheckedNode 'scripts/verify-questionnaires.mjs'
  Invoke-CheckedNode 'scripts/verify-client-assessments.mjs'
  Invoke-CheckedNode 'scripts/verify-account-cleanup.mjs'
  if($DatabaseOnly){Write-Host 'Dev database migration and validation complete. Publish API before web using the deployment workflows.';return}
  & (Join-Path $PSScriptRoot 'Publish-NsoAuditApi.ps1') -SubscriptionId $SubscriptionId -ResourceGroupName $group -FunctionAppName 'nso-audit-dev-api-flex'
  $health=Invoke-RestMethod -Uri 'https://nso-audit-dev-api-flex.azurewebsites.net/api/health'
  Write-Host 'Published API health responded.'
  & (Join-Path $PSScriptRoot 'Publish-NsoAuditWeb.ps1') -SubscriptionId $SubscriptionId -ResourceGroupName $group -StaticWebAppName 'nso-audit-dev-web' -PublicConfigurationFile (Join-Path $root 'config/environments/dev.public.json')
  $env:QUESTIONNAIRE_TEST_API_BASE_URL='https://nso-audit-dev-api-flex.azurewebsites.net/api'
  $env:QUESTIONNAIRE_TEST_PORTAL_URL='https://blue-mushroom-0b2666c1e.7.azurestaticapps.net'
  Invoke-CheckedNode 'scripts/verify-client-assessment-api.mjs'
  Write-Host 'Dev questionnaire deployment and live API/browser validation passed.'
}finally{
  foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
  Pop-Location
  if($attempted){
    # Exact generated names and purpose tag protect existing databases during cleanup.
    $purpose=& az sql db show @target --name $ValidationDatabaseName --query tags.purpose -o tsv 2>$null
    if($LASTEXITCODE -eq 0){
      if($purpose -ne 'disposable-questionnaire-validation'){throw 'Disposable database cleanup refused: unexpected purpose tag.'}
      & az sql db delete @target --name $ValidationDatabaseName --yes --output none
      if($LASTEXITCODE -ne 0){Write-Warning "Remove disposable database: $ValidationDatabaseName"}
    }
    $operatorRule=& az sql server firewall-rule list @target --query "[?name=='$rule']" -o json | ConvertFrom-Json
    if($LASTEXITCODE -ne 0){throw 'Unable to inspect temporary operator rule for cleanup.'}
    if($operatorRule){
      if($operatorRule.startIpAddress -ne $OperatorIpv4Address -or $operatorRule.endIpAddress -ne $OperatorIpv4Address){throw 'Operator rule cleanup refused: unexpected addresses.'}
      & az sql server firewall-rule delete @target --name $rule --output none
      if($LASTEXITCODE -ne 0){throw "Remove temporary operator rule: $rule"}
      Write-Host 'Temporary operator SQL access removed.'
    }
  }
}
