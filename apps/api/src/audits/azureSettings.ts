import {CollectionError} from './licensing.js';

type SettingsDataset='azureStorageSettings'|'azureSqlSettings';

function object(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function fields(value:unknown,...keys:string[]){
  const record=object(value);
  return Object.fromEntries(keys.map(key=>{
    const field=record[key];
    return [key,typeof field==='string'||typeof field==='boolean'||typeof field==='number'?field:null];
  }));
}

function list(value:unknown,project:(item:unknown)=>unknown){
  return Array.isArray(value)?value.map(project):null;
}

export function projectAzureSettings(dataset:SettingsDataset,value:unknown,subscriptionId:string|null){
  const item=object(value);
  const storage=dataset==='azureStorageSettings';
  const type=storage?'microsoft.storage/storageaccounts':'microsoft.sql/servers';
  const id=typeof item.id==='string'?item.id:'';
  const segments=id.toLowerCase().split('/');
  if(!subscriptionId||segments.length!==9||segments[1]!=='subscriptions'||segments[2]!==subscriptionId.toLowerCase()||
     segments[3]!=='resourcegroups'||!segments[4]||segments[5]!=='providers'||segments.slice(6,8).join('/')!==type||
     !segments[8]||typeof item.name!=='string'||!item.properties||typeof item.properties!=='object'||Array.isArray(item.properties))
    throw new CollectionError('invalidResponse');

  const properties=object(item.properties);
  const privateEndpoints=list(properties.privateEndpointConnections,entry=>{
    const endpoint=object(entry),settings=object(endpoint.properties);
    return {...fields(endpoint,'id'),...fields(settings.privateLinkServiceConnectionState,'status')};
  });
  const network=object(properties.networkAcls);
  return {
    id,name:item.name,
    network:{
      ...fields(properties,'publicNetworkAccess'),privateEndpoints,
      ...(storage?{
        ...fields(network,'defaultAction','bypass'),
        ipRules:list(network.ipRules,entry=>fields(entry,'value','action')),
        virtualNetworkRules:list(network.virtualNetworkRules,entry=>fields(entry,'id','action','state')),
        resourceAccessRules:list(network.resourceAccessRules,entry=>fields(entry,'resourceId','tenantId')),
      }:{}),
    },
    transport:storage?fields(properties,'supportsHttpsTrafficOnly','minimumTlsVersion'):fields(properties,'minimalTlsVersion'),
    access:storage?fields(properties,'allowBlobPublicAccess','allowSharedKeyAccess'):
      fields(properties.administrators,'login','principalType','sid','azureADOnlyAuthentication'),
    ...(storage?{sasPolicy:fields(properties.sasPolicy,'sasExpirationPeriod','expirationAction')}:{}),
  };
}
