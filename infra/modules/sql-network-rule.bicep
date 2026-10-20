param sqlServerName string
param subnetResourceId string
param ruleName string
resource server 'Microsoft.Sql/servers@2023-08-01' existing = { name: sqlServerName }
resource rule 'Microsoft.Sql/servers/virtualNetworkRules@2023-08-01' = {
  parent: server
  name: ruleName
  properties: {
    virtualNetworkSubnetId: subnetResourceId
    ignoreMissingVnetServiceEndpoint: false
  }
}
output ruleId string = rule.id
