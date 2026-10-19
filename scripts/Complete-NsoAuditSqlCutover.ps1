[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $FunctionAppName,
    [Parameter(Mandatory)][string] $SqlServerFqdn,
    [Parameter(Mandatory)][string] $SqlDatabaseName,
    [Parameter(Mandatory)][string] $SourceStorageAccount,
    [Parameter(Mandatory)][string] $TenantMappingFile,
    [Parameter(Mandatory)][Guid] $ManagementTenantId,
    [ValidateSet('dev','prod')][Parameter(Mandatory)][string] $EnvironmentName
)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$healthUri="https://$FunctionAppName.azurewebsites.net/api/health"
$before=Invoke-RestMethod -Uri $healthUri
if ($before.storage -ne 'tables') { throw 'Deploy and verify the staged Tables/SQL API before cutover. SQL replay after cutover is prohibited.' }
$stopped=$false
$safeToStart=$true
$variables=@('SQL_SERVER','SQL_DATABASE','SOURCE_STORAGE_ACCOUNT','TENANT_MAPPING_FILE','CONFIRM_APP_STOPPED')
$previous=@{}
foreach($name in $variables) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
Push-Location $repoRoot
try {
    $env:SQL_SERVER=$SqlServerFqdn
    $env:SQL_DATABASE=$SqlDatabaseName
    $env:SOURCE_STORAGE_ACCOUNT=$SourceStorageAccount
    $env:TENANT_MAPPING_FILE=(Resolve-Path -LiteralPath $TenantMappingFile).Path
    & az functionapp stop --subscription $SubscriptionId -g $ResourceGroupName -n $FunctionAppName
    if($LASTEXITCODE -ne 0) { throw 'Could not stop Function; refusing migration.' }
    $stopped=$true
    $state=& az functionapp show --subscription $SubscriptionId -g $ResourceGroupName -n $FunctionAppName --query state -o tsv
    if($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'Stopped') { throw 'Stopped state not confirmed.' }
    & node scripts/migrate-table-data.mjs copy
    if($LASTEXITCODE -ne 0) { throw 'Final source copy failed.' }
    & node scripts/migrate-table-data.mjs verify
    if($LASTEXITCODE -ne 0) { throw 'Final source reconciliation failed.' }
    $env:CONFIRM_APP_STOPPED='yes'
    # From this point onward, uncertainty must not restart the app against stale Tables.
    $safeToStart=$false
    & node scripts/migrate-table-data.mjs activate
    if($LASTEXITCODE -ne 0) { throw 'Activation failed or is uncertain. Inspect cutover state before restarting.' }
    & (Join-Path $PSScriptRoot 'Set-NsoAuditSqlRuntime.ps1') -SubscriptionId $SubscriptionId `
        -ResourceGroupName $ResourceGroupName -FunctionAppName $FunctionAppName -SqlServerFqdn $SqlServerFqdn `
        -SqlDatabaseName $SqlDatabaseName -ManagementTenantId $ManagementTenantId -EnvironmentName $EnvironmentName -TenantStore sql
    $safeToStart=$true
} finally {
    if($stopped -and $safeToStart) {
        & az functionapp start --subscription $SubscriptionId -g $ResourceGroupName -n $FunctionAppName
        if($LASTEXITCODE -ne 0) { Write-Warning 'Function restart failed; restart manually after checking configuration.' }
    } elseif($stopped) {
        Write-Warning 'Function left stopped to prevent stale Table writes. Repair SQL runtime configuration and validate cutover state before starting it.'
    }
    foreach($name in $variables) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    Pop-Location
}
for($attempt=0;$attempt -lt 12;$attempt++) {
    try {
        $health=Invoke-RestMethod -Uri $healthUri -TimeoutSec 10
        if($health.status -eq 'healthy' -and $health.storage -eq 'sql') {
            Write-Host 'SQL cutover complete. Deployed API is healthy using SQL through its runtime identity.'
            return
        }
    } catch { }
    Start-Sleep -Seconds 5
}
throw 'SQL configured but runtime health did not recover in the check window. Do not switch back to stale Tables; inspect runtime logs and repair forward.'
