targetScope = 'resourceGroup'

@description('Existing Table Storage account; no keys are read or created.')
param storageAccountName string
@description('Temporary migration operator Entra object ID. Remove this assignment after migration.')
param operatorObjectId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}
var readerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '76199698-9eea-4c19-bc75-cec21354c6b6')
resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, operatorObjectId, readerRoleId, 'sql-migration')
  scope: storage
  properties: {
    principalId: operatorObjectId
    principalType: 'User'
    roleDefinitionId: readerRoleId
  }
}
output temporaryRoleAssignmentId string = reader.id
