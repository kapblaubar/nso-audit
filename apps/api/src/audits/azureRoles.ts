import {CollectionError} from './licensing.js';
import {uuidPattern} from '../storage/sql.js';

type RoleDataset='azureRoleAssignments'|'azureRoleDefinitions';

export function projectAzureRole(dataset:RoleDataset,value:unknown){
  const item=value as {id?:unknown;properties?:Record<string,unknown>}|null;
  const properties=item?.properties;
  const id=typeof item?.id==='string'?item.id.toLowerCase():'';
  const guid=id.split('/').at(-1)??'';
  if(!properties||!uuidPattern.test(guid))throw new CollectionError('invalidResponse');
  if(dataset==='azureRoleDefinitions'){
    if(typeof properties.roleName!=='string')throw new CollectionError('invalidResponse');
    return {id:guid,name:properties.roleName};
  }
  const {scope,principalId,roleDefinitionId,principalType,condition,conditionVersion}=properties;
  const roleId=typeof roleDefinitionId==='string'?roleDefinitionId.toLowerCase().split('/').at(-1)??'':'';
  if(typeof scope!=='string'||!scope.startsWith('/')||typeof principalId!=='string'||
    !uuidPattern.test(principalId)||!uuidPattern.test(roleId))throw new CollectionError('invalidResponse');
  const canonicalScope=scope.toLowerCase().replace(/\/$/,'');
  if(id!==canonicalScope+'/providers/microsoft.authorization/roleassignments/'+guid)
    throw new CollectionError('invalidResponse');
  return {id,scope:canonicalScope,principalId:principalId.toLowerCase(),roleId,
    principalType:typeof principalType==='string'?principalType:null,
    condition:typeof condition==='string'?condition:null,
    conditionVersion:typeof conditionVersion==='string'?conditionVersion:null};
}
