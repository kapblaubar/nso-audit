targetScope = 'subscription'

@description('Azure region for all regional resources.')
param location string = 'westus2'

@description('Resource group containing every NSO Audit resource.')
param resourceGroupName string = 'NSO-Audit'

@description('Deployment environment name.')
@allowed([
  'dev'
  'prod'
])
param environmentName string = 'dev'

@description('Short globally unique suffix, using lowercase letters and numbers only.')
@minLength(4)
@maxLength(10)
param uniqueSuffix string

@description('Name of the App Registration client secret stored in Key Vault. The secret value is supplied out of band.')
param entraClientSecretName string = 'nso-audit-app-client-secret'

@description('Name of the optional DLP client certificate stored in Key Vault. No certificate value is stored in deployment parameters.')
param entraClientCertificateName string = 'nso-audit-dlp-certificate'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    application: 'nso-audit'
    environment: environmentName
    managedBy: 'bicep'
    costProfile: 'low'
  }
}

module platform 'modules/platform.bicep' = {
  name: 'nso-audit-platform-${environmentName}'
  scope: resourceGroup
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    entraClientSecretName: entraClientSecretName
    entraClientCertificateName: entraClientCertificateName
  }
}

output resourceGroupName string = resourceGroup.name
output staticWebAppName string = platform.outputs.staticWebAppName
output functionAppName string = platform.outputs.functionAppName
output keyVaultName string = platform.outputs.keyVaultName
