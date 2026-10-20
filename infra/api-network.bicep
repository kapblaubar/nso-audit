targetScope = 'resourceGroup'
@allowed(['dev','prod'])
param environmentName string
param location string
param functionAppName string
param planName string
param virtualNetworkName string
param subnetName string = 'api-integration'
param addressPrefix string = '10.42.0.0/24'
param subnetPrefix string = '10.42.0.0/26'
param sqlServerName string
param sqlDatabaseName string
param storageAccountName string
param runtimeIdentityName string
param deploymentContainerName string = 'flex-deployments'
param portalOrigin string
param allowedOrigins array
param entraClientId string
param managementTenantId string
param managementObjectId string
param keyVaultUri string
param emailEndpoint string
param emailSender string
param entraClientSecretName string = 'nso-audit-app-client-secret'
param entraClientCertificateName string = 'nso-audit-dlp-certificate'
@allowed([512,2048,4096])
param instanceMemoryMB int = 2048
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40
@description('Enable only after Front Door routes and health probes are verified. Missing profile ID fails closed.')
param restrictToFrontDoor bool = false
param frontDoorId string = ''

var tags = {
  application: 'nso-audit'
  environment: environmentName
  managedBy: 'bicep'
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: runtimeIdentityName }
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: storageAccountName }
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: false
  }
}
resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: location
  tags: tags
  properties: { addressSpace: { addressPrefixes: [addressPrefix] } }
}
resource subnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: network
  name: subnetName
  properties: {
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
    addressPrefix: subnetPrefix
    delegations: [
      {
        name: 'functions-flex'
        properties: { serviceName: 'Microsoft.App/environments' }
      }
    ]
    serviceEndpoints: [
      {
        service: 'Microsoft.Sql'
        locations: [location]
      }
    ]
  }
}
module sqlNetwork 'modules/sql-network-rule.bicep' = {
  name: 'api-sql-network-${environmentName}'
  params: {
    sqlServerName: sqlServerName
    subnetResourceId: subnet.id
    ruleName: 'nso-audit-${environmentName}-api-subnet'
  }
}
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: { reserved: true }
}
resource api 'Microsoft.Web/sites@2024-04-01' = {
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
      cors: {
        allowedOrigins: allowedOrigins
        supportCredentials: false
      }
      ipSecurityRestrictionsDefaultAction: restrictToFrontDoor ? 'Deny' : 'Allow'
      ipSecurityRestrictions: restrictToFrontDoor && !empty(frontDoorId) ? [
        {
          name: 'specific-front-door'
          priority: 100
          action: 'Allow'
          tag: 'ServiceTag'
          ipAddress: 'AzureFrontDoor.Backend'
          headers: { 'x-azure-fdid': [frontDoorId] }
        }
      ] : []
      scmIpSecurityRestrictionsUseMain: false
    }
    functionAppConfig: {
      runtime: {
        name: 'node'
        version: '22'
      }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identity.id
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: instanceMemoryMB
        maximumInstanceCount: maximumInstanceCount
        triggers: { http: { perInstanceConcurrency: 16 } }
        alwaysReady: []
      }
    }
  }
  resource settings 'config' = {
    name: 'appsettings'
    properties: {
      AzureWebJobsStorage__accountName: storage.name
      AzureWebJobsStorage__credential: 'managedidentity'
      AzureWebJobsStorage__clientId: identity.properties.clientId
      AZURE_CLIENT_ID: identity.properties.clientId
      APP_ENVIRONMENT: environmentName
      ENTRA_CLIENT_ID: entraClientId
      ENTRA_MANAGEMENT_TENANT_ID: managementTenantId
      ENTRA_MANAGEMENT_OBJECT_ID: managementObjectId
      KEY_VAULT_URI: keyVaultUri
      STORAGE_ACCOUNT_NAME: storage.name
      ENTRA_CLIENT_SECRET_NAME: entraClientSecretName
      ENTRA_CLIENT_CERTIFICATE_NAME: entraClientCertificateName
      SQL_SERVER: '${sqlServerName}${environment().suffixes.sqlServerHostname}'
      SQL_DATABASE: sqlDatabaseName
      SQL_AUTH_MODE: 'managedidentity'
      TENANT_STORE: 'sql'
      PORTAL_ORIGIN: portalOrigin
      ACCOUNT_EMAIL_ENDPOINT: emailEndpoint
      ACCOUNT_EMAIL_SENDER: emailSender
      FRONT_DOOR_ID: restrictToFrontDoor ? frontDoorId : ''
    }
  }
}
output functionAppName string = api.name
output apiBaseUrl string = 'https://${api.properties.defaultHostName}/api'
output subnetResourceId string = subnet.id
output sqlNetworkRuleId string = sqlNetwork.outputs.ruleId
