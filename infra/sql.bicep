targetScope = 'resourceGroup'

@allowed(['dev', 'prod'])
param environmentName string
param location string = resourceGroup().location
@description('Globally unique SQL server name. Preserve this name after first deployment.')
param sqlServerName string
param databaseName string = 'nso-audit-${environmentName}'
@description('Entra object ID of the operator/group administering SQL, not the runtime application.')
param administratorObjectId string
param administratorLogin string
@allowed(['User', 'Group'])
param administratorType string = 'Group'
param skuName string = 'Basic'
param skuTier string = 'Basic'
param skuCapacity int = 5
param maxSizeBytes int = 2147483648
@description('Explicit IPv4 addresses for deployment operators and app outbound connectivity. No Azure-wide bypass.')
param allowedIpv4Addresses array = []

var tags = {
  application: 'nso-audit'
  environment: environmentName
  managedBy: 'bicep'
}

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: sqlServerName
  location: location
  tags: tags
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: administratorLogin
      sid: administratorObjectId
      tenantId: tenant().tenantId
      principalType: administratorType
    }
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
    capacity: skuCapacity
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: maxSizeBytes
    requestedBackupStorageRedundancy: 'Local'
  }
}

resource firewallRules 'Microsoft.Sql/servers/firewallRules@2023-08-01' = [for address in allowedIpv4Addresses: {
  parent: server
  name: 'allowed-${replace(address, '.', '-')}'
  properties: {
    startIpAddress: address
    endIpAddress: address
  }
}]

resource retention 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01' = {
  parent: database
  name: 'default'
  properties: {
    retentionDays: 7
  }
}

output serverFqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
