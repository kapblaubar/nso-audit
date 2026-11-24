param location string
param functionName string
param storageName string
param vaultName string
param certificateName string
param appRegistrationId string
param callerPrincipalId string
param tenantDomains object

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: vaultName
}
resource backingSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: vault
  name: certificateName
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${functionName}-identity'
  location: location
}
resource certificateRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: backingSecret
  name: guid(backingSecret.id, identity.id, 'Key Vault Secrets User')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}
resource files 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: files
  name: functionName
}
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionName}-plan'
  location: location
  kind: 'functionapp'
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: false }
}

var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: functionName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      powerShellVersion: '7.6'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: storageConnection }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: storageConnection }
        { name: 'WEBSITE_CONTENTSHARE', value: share.name }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'powershell' }
        { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        { name: 'ENTRA_CLIENT_ID', value: appRegistrationId }
        { name: 'KEY_VAULT_URI', value: vault.properties.vaultUri }
        { name: 'ENTRA_CLIENT_CERTIFICATE_NAME', value: certificateName }
        { name: 'PURVIEW_TENANT_DOMAINS', value: string(tenantDomains) }
        { name: 'PSWorkerInProcConcurrencyUpperBound', value: '1' }
      ]
    }
  }
}
resource auth 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
      excludedPaths: ['/api/health']
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: appRegistrationId
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [appRegistrationId, 'api://${appRegistrationId}']
          defaultAuthorizationPolicy: {
            allowedPrincipals: { identities: [callerPrincipalId] }
          }
        }
      }
    }
    httpSettings: { requireHttps: true }
  }
}

output hostname string = app.properties.defaultHostName
