using './sql.bicep'

param environmentName = 'dev'
param sqlServerName = 'nso-audit-dev-257f10d8'
param databaseName = 'nso-audit-dev'
param administratorLogin = 'chris@newsommer.com'
param administratorObjectId = '28995be7-732b-47c4-a04d-f4ea51eb088e'
param administratorType = 'User'
// API access is the approved subnet, not changing public worker addresses.
param allowedIpv4Addresses = []
param apiSubnetResourceId = '/subscriptions/257f10d8-cb7f-400c-8e29-7f1fc5318247/resourceGroups/NSO-Audit/providers/Microsoft.Network/virtualNetworks/nso-audit-dev-vnet/subnets/api-integration'
// Use the explicit bootstrap switch before this network exists in a fresh environment.
