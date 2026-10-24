[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Open','Close')][string]$Action,
    [Parameter(Mandatory)][string]$OperatorIpv4Address,
    [switch]$Apply
)
$ErrorActionPreference='Stop'
$address=$null
if(-not [Net.IPAddress]::TryParse($OperatorIpv4Address,[ref]$address) -or $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $OperatorIpv4Address -eq '0.0.0.0'){throw 'An exact public operator IPv4 is required.'}
$target=@('--subscription','257f10d8-cb7f-400c-8e29-7f1fc5318247','--resource-group','NSO-Audit','--server','nso-audit-dev-257f10d8')
$rule='operator-ssms-chris'
$rules=& az sql server firewall-rule list @target -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Unable to inspect SQL firewall rules.'}
$existing=$rules | Where-Object name -eq $rule
if($existing -and ($existing.startIpAddress -ne $OperatorIpv4Address -or $existing.endIpAddress -ne $OperatorIpv4Address)){throw 'Existing rule has a different address; inspect and close it explicitly first.'}
Write-Host "$Action temporary Dev SSMS rule $rule for $OperatorIpv4Address only. Remove it after the SSMS session."
if(-not $Apply){return}
if($Action -eq 'Open'){
    & az sql server firewall-rule create @target --name $rule --start-ip-address $OperatorIpv4Address --end-ip-address $OperatorIpv4Address --output none
}else{
    if(-not $existing){return}
    & az sql server firewall-rule delete @target --name $rule --output none
}
if($LASTEXITCODE -ne 0){throw 'SSMS firewall operation failed.'}
