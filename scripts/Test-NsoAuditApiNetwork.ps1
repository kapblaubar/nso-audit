[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$SqlServerName,
    [Parameter(Mandatory)][string]$SqlDatabaseName,
    [Parameter(Mandatory)][string]$ApiBaseUrl,
    [Parameter(Mandatory)][string]$OperatorIpv4Address,
    [ValidateSet('Accounts','Invitations','All')][string]$Suite='Accounts'
)
$ErrorActionPreference='Stop'
$address=$null
if(-not [Net.IPAddress]::TryParse($OperatorIpv4Address,[ref]$address) -or
   $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $OperatorIpv4Address -eq '0.0.0.0'){throw 'Exact operator IPv4 required.'}
if($ResourceGroupName -ne 'NSO-Audit' -or $SqlServerName -ne 'nso-audit-dev-257f10d8' -or $SqlDatabaseName -ne 'nso-audit-dev' -or $ApiBaseUrl -ne 'https://nso-audit-dev-api-flex.azurewebsites.net/api'){throw 'This integration wrapper is restricted to the approved Dev targets.'}
$rule='operator-test-'+[Guid]::NewGuid().ToString('N')
$keys=@('SQL_SERVER','SQL_DATABASE','ACCOUNT_TEST_API_BASE_URL','CONFIRM_DEV_WRITE_TEST','INVITATION_TEST_API_BASE_URL')
$previous=@{}
foreach($key in $keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
$target=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--server',$SqlServerName)
$created=$false
try{
    & az sql server firewall-rule create @target --name $rule --start-ip-address $OperatorIpv4Address --end-ip-address $OperatorIpv4Address --output none
    if($LASTEXITCODE -ne 0){throw 'Temporary operator access failed.'}
    $created=$true
    $env:SQL_SERVER="$SqlServerName.database.windows.net"
    $env:SQL_DATABASE=$SqlDatabaseName
    $env:ACCOUNT_TEST_API_BASE_URL=$ApiBaseUrl
    $env:CONFIRM_DEV_WRITE_TEST='yes'
    if($Suite -ne 'Invitations'){
        & node (Join-Path $PSScriptRoot 'verify-customer-account-api.mjs')
        if($LASTEXITCODE -ne 0){throw 'Live Dev API integration failed.'}
    }
    if($Suite -ne 'Accounts'){
        $env:INVITATION_TEST_API_BASE_URL=$ApiBaseUrl
        & node (Join-Path $PSScriptRoot 'verify-workspace-invitations.mjs')
        if($LASTEXITCODE -ne 0){throw 'Live Dev invitation integration failed.'}
    }
}finally{
    foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
    if($created){
        & az sql server firewall-rule delete @target --name $rule
        if($LASTEXITCODE -ne 0){throw "Remove temporary SQL rule manually: $rule"}
        Write-Host 'Temporary operator SQL access removed.'
    }
}
