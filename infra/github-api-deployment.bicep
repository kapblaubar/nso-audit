targetScope = 'resourceGroup'
param location string
param environmentName string
param functionAppName string
param deploymentIdentityName string
param githubRepository string
param githubEnvironment string
resource api 'Microsoft.Web/sites@2024-04-01' existing = { name: functionAppName }
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deploymentIdentityName
  location: location
  tags: { application: 'nso-audit', environment: environmentName, managedBy: 'bicep' }
}
resource federation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-environment'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:${githubEnvironment}'
    audiences: ['api://AzureADTokenExchange']
  }
}
var websiteContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions','de139f84-1756-47ae-9be6-808fbbe84772')
resource deploymentRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(api.id,identity.id,websiteContributor)
  scope: api
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: websiteContributor
  }
}
output clientId string = identity.properties.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
