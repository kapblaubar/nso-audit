targetScope = 'resourceGroup'
@allowed(['dev','prod'])
param environmentName string
param emailServiceName string
param communicationServiceName string
param dataLocation string = 'United States'
param runtimePrincipalId string

resource email 'Microsoft.Communication/emailServices@2023-03-31' = {
  name: emailServiceName
  location: 'global'
  tags: {
    application: 'nso-audit'
    environment: environmentName
    managedBy: 'bicep'
  }
  properties: { dataLocation: dataLocation }
}
resource domain 'Microsoft.Communication/emailServices/domains@2023-03-31' = {
  parent: email
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}
resource communication 'Microsoft.Communication/communicationServices@2023-03-31' = {
  name: communicationServiceName
  location: 'global'
  tags: {
    application: 'nso-audit'
    environment: environmentName
    managedBy: 'bicep'
  }
  properties: {
    dataLocation: dataLocation
    linkedDomains: [domain.id]
  }
}
resource senderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(communication.id,runtimePrincipalId,'account-email')
  scope: communication
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions','09976791-48a7-449e-bb21-39d1a415f350')
    principalId: runtimePrincipalId
    principalType: 'ServicePrincipal'
  }
}
output endpoint string = 'https://${communication.properties.hostName}'
output senderAddress string = 'DoNotReply@${domain.properties.mailFromSenderDomain}'
