param location string
param environmentName string
param uniqueSuffix string
param entraClientSecretName string

var compactPrefix = 'nsoaudit${environmentName}${uniqueSuffix}'
var standardPrefix = 'nso-audit-${environmentName}-${uniqueSuffix}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(compactPrefix, 24)
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource scanContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/scans'
  properties: {
    publicAccess: 'None'
  }
}

resource findingsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: '${storage.name}/default/findings'
}

resource scansTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: '${storage.name}/default/scans'
}

resource tenantsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: '${storage.name}/default/tenants'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${standardPrefix}-identity'
  location: location
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take(replace('${standardPrefix}-kv', '-', ''), 24)
  location: location
  properties: {
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    publicNetworkAccess: 'Enabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
  }
}

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${standardPrefix}-logs'
  location: location
  properties: {
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
    workspaceCapping: {
      dailyQuotaGb: 0.1
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${standardPrefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    IngestionMode: 'LogAnalytics'
    WorkspaceResourceId: logWorkspace.id
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${standardPrefix}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${standardPrefix}-api'
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    clientAffinityEnabled: false
    siteConfig: {
      alwaysOn: false
      ftpsState: 'Disabled'
      http20Enabled: true
      linuxFxVersion: 'NODE|22'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'AzureWebJobsStorage__clientId'
          value: identity.properties.clientId
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'KEY_VAULT_URI'
          value: vault.properties.vaultUri
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storage.name
        }
        {
          name: 'ENTRA_CLIENT_SECRET_NAME'
          value: entraClientSecretName
        }
      ]
    }
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${standardPrefix}-web'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
  }
}

var blobDataOwnerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var queueDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
var tableDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, blobDataOwnerRoleId)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataOwnerRoleId
  }
}

resource queueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, queueDataContributorRoleId)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: queueDataContributorRoleId
  }
}

resource tableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, tableDataContributorRoleId)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: tableDataContributorRoleId
  }
}

resource vaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

output staticWebAppName string = staticWebApp.name
output functionAppName string = functionApp.name
output keyVaultName string = vault.name
