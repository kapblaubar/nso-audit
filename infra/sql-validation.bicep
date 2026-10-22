targetScope = 'resourceGroup'

@description('Existing SQL server. This template does not change server configuration.')
param sqlServerName string
@description('Unique disposable validation database; never use an application database name.')
param databaseName string
param location string
param operatorIpv4Address string
param operatorRuleName string

resource server 'Microsoft.Sql/servers@2023-08-01' existing = {
  name: sqlServerName
}
resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: databaseName
  location: location
  tags: {
    application: 'nso-audit'
    environment: 'dev'
    purpose: 'disposable-questionnaire-validation'
  }
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648
    requestedBackupStorageRedundancy: 'Local'
  }
}
resource operatorRule 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: server
  name: operatorRuleName
  properties: {
    startIpAddress: operatorIpv4Address
    endIpAddress: operatorIpv4Address
  }
}
