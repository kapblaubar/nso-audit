using './purview-collector.bicep'

param location = 'westus2'
param functionName = 'nso-audit-dev-pur-api'
param storageName = 'nsoauditdevpur257f10d8'
param vaultName = 'nso-audit-dev-kv'
param certificateName = 'nso-audit-dlp-certificate'
param appRegistrationId = 'f293a122-bf49-44a7-bfc9-48cfae6f8376'
param callerPrincipalId = '85a61920-0209-4fc3-b9fa-d2cde3034894'
param tenantDomains = {
  'fe0c1fea-bc61-42cc-b384-bad739ef3c6e': 'kapblaubargmail.onmicrosoft.com'
}
