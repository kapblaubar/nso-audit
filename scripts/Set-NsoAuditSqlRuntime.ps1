[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $FunctionAppName,
    [Parameter(Mandatory)][string] $SqlServerFqdn,
    [Parameter(Mandatory)][string] $SqlDatabaseName,
    [Parameter(Mandatory)][Guid] $ManagementTenantId,
    [Parameter(Mandatory)][Guid] $ManagementObjectId,
    [ValidateSet('dev', 'prod')][Parameter(Mandatory)][string] $EnvironmentName,
    [ValidateSet('tables', 'sql')][string] $TenantStore = 'tables'
)
$ErrorActionPreference = 'Stop'
& az functionapp config appsettings set --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name $FunctionAppName --settings "SQL_SERVER=$SqlServerFqdn" "SQL_DATABASE=$SqlDatabaseName" `
    "ENTRA_MANAGEMENT_TENANT_ID=$ManagementTenantId" "ENTRA_MANAGEMENT_OBJECT_ID=$ManagementObjectId" "APP_ENVIRONMENT=$EnvironmentName" "TENANT_STORE=$TenantStore" 'SQL_AUTH_MODE=managedidentity' --query '[].name' -o json
if ($LASTEXITCODE -ne 0) { throw 'SQL runtime configuration failed.' }
# Appends only named settings; does not replace existing settings or expose their values.
