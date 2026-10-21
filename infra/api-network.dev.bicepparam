using './api-network.bicep'
param environmentName = 'dev'
param location = 'westus2'
// Planned migration: preserve the legacy API as rollback; migrate website to this candidate after validation.
param functionAppName = 'nso-audit-dev-api-flex'
param planName = 'nso-audit-dev-flex-plan'
param virtualNetworkName = 'nso-audit-dev-vnet'
param sqlServerName = 'nso-audit-dev-257f10d8'
param sqlDatabaseName = 'nso-audit-dev'
param storageAccountName = 'nsoauditdev'
param runtimeIdentityName = 'nso-audit-dev-identity'
param portalOrigin = 'https://blue-mushroom-0b2666c1e.7.azurestaticapps.net'
param allowedOrigins = ['https://blue-mushroom-0b2666c1e.7.azurestaticapps.net']
param entraClientId = 'f293a122-bf49-44a7-bfc9-48cfae6f8376'
param managementTenantId = 'fe0c1fea-bc61-42cc-b384-bad739ef3c6e'
param managementObjectId = '28995be7-732b-47c4-a04d-f4ea51eb088e'
param keyVaultUri = 'https://nso-audit-dev-kv.vault.azure.net/'
param emailEndpoint = 'https://nso-audit-dev-communication.unitedstates.communication.azure.com'
param emailSender = 'DoNotReply@3af01091-e156-4e91-a638-3cc56386996d.azurecomm.net'
param restrictToFrontDoor = false

param invitationLifetimeHours = 72
