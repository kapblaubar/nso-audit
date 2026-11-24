targetScope = 'resourceGroup'

@allowed(['dev', 'prod'])
param environmentName string
param location string
param functionAppName string
param planName string
param identityName string
param storageName string
param virtualNetworkName string
param subnetName string
param sqlServerName string
param sqlDatabaseName string
param entraClientId string
param allowedOrigins array
@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40
param frontDoorId string = ''

var tags = {
  application: 'nso-audit'
  environment: environmentName
  workload: 'audit-compare'
  managedBy: 'bicep'
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' existing = { name: virtualNetworkName }
resource subnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: network
  name: subnetName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  tags: tags
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource deployment 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'compare-deployments'
  properties: { publicAccess: 'None' }
}
resource storageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, identity.id, 'blob-owner')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}
resource compare 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: subnet.id
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      cors: { allowedOrigins: allowedOrigins, supportCredentials: false }
      ipSecurityRestrictionsDefaultAction: empty(frontDoorId) ? 'Allow' : 'Deny'
      ipSecurityRestrictions: empty(frontDoorId) ? [] : [
        {
          name: 'specific-front-door'
          priority: 100
          action: 'Allow'
          tag: 'ServiceTag'
          ipAddress: 'AzureFrontDoor.Backend'
          headers: { 'x-azure-fdid': [frontDoorId] }
        }
      ]
      scmIpSecurityRestrictionsUseMain: false
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: identity.properties.clientId }
        { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        { name: 'APP_ENVIRONMENT', value: environmentName }
        { name: 'ENTRA_CLIENT_ID', value: entraClientId }
        { name: 'SQL_SERVER', value: '${sqlServerName}${environment().suffixes.sqlServerHostname}' }
        { name: 'SQL_DATABASE', value: sqlDatabaseName }
        { name: 'SQL_AUTH_MODE', value: 'managedidentity' }
        { name: 'TENANT_STORE', value: 'sql' }
      ]
    }
    functionAppConfig: {
      runtime: { name: 'node', version: '22' }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deployment.name}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identity.id
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: instanceMemoryMB
        maximumInstanceCount: maximumInstanceCount
        triggers: { http: { perInstanceConcurrency: 4 } }
        alwaysReady: []
      }
    }
  }
  dependsOn: [storageAccess]
}

output functionAppName string = compare.name
output apiBaseUrl string = 'https://${compare.properties.defaultHostName}/api'
output identityClientId string = identity.properties.clientId
