[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$SqlServerName,
    [Parameter(Mandatory)][string]$ManifestFile,
    [ValidateSet('Remove','Restore')][string]$Action='Remove',
    [string]$FunctionAppName,
    [string]$SqlNetworkRuleName,
    [switch]$Apply
)
$ErrorActionPreference='Stop'
$rules=Get-Content -Raw -LiteralPath $ManifestFile | ConvertFrom-Json
foreach($rule in $rules){
    $address=$null
    if(-not [Net.IPAddress]::TryParse($rule.startIpAddress,[ref]$address) -or
       $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
       $rule.startIpAddress -eq '0.0.0.0' -or $rule.startIpAddress -ne $rule.endIpAddress -or
       $rule.name -ne ('allowed-'+$rule.startIpAddress.Replace('.','-'))){throw 'Manifest must contain exact legacy IPv4 rules only.'}
}
$target=@('--subscription',$SubscriptionId,'--resource-group',$ResourceGroupName,'--server',$SqlServerName)
$current=& az sql server firewall-rule list @target -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Cannot inspect current SQL firewall.'}
foreach($rule in $rules){
    $existing=$current | Where-Object name -eq $rule.name
    if($existing -and ($existing.startIpAddress -ne $rule.startIpAddress -or $existing.endIpAddress -ne $rule.endIpAddress)){throw "Rule changed since snapshot: $($rule.name)"}
}
if($Action -eq 'Remove'){
    if(-not $FunctionAppName -or -not $SqlNetworkRuleName){throw 'Removal requires the candidate API and SQL network-rule names.'}
    $resource=& az resource show --subscription $SubscriptionId -g $ResourceGroupName -n $FunctionAppName --resource-type Microsoft.Web/sites --api-version 2024-04-01 -o json | ConvertFrom-Json
    $app=$resource.properties
    if($LASTEXITCODE -ne 0){throw 'Cannot inspect candidate API.'}
    $network=& az sql server vnet-rule show @target --name $SqlNetworkRuleName -o json | ConvertFrom-Json
    if($LASTEXITCODE -ne 0 -or -not $app.virtualNetworkSubnetId -or $network.virtualNetworkSubnetId -ne $app.virtualNetworkSubnetId -or $network.state -ne 'Ready'){throw 'API subnet and Ready SQL network rule must match.'}
    $health=Invoke-RestMethod -Uri ('https://'+$app.defaultHostName+'/api/health') -TimeoutSec 90
    if($health.status -ne 'ok' -and $health.status -ne 'healthy'){throw 'Candidate database health is not ready.'}
}
foreach($rule in $rules){
    Write-Host "$Action $($rule.name) ($($rule.startIpAddress))"
    if(-not $Apply){continue}
    if($Action -eq 'Remove'){
        if($current | Where-Object name -eq $rule.name){& az sql server firewall-rule delete @target --name $rule.name}
    }else{
        & az sql server firewall-rule create @target --name $rule.name --start-ip-address $rule.startIpAddress --end-ip-address $rule.endIpAddress --output none
    }
    if($LASTEXITCODE -ne 0){throw "Firewall $Action failed: $($rule.name)"}
}
