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
    id,name:item.name,...(storage?fields(item,'kind'):{}),
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

function sortedList(value:unknown,project:(item:unknown)=>unknown){
  return list(value,project)?.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))??null;
}

function strings(value:unknown){
  return sortedList(value,item=>typeof item==='string'?item:null);
}

function references(value:unknown){
  return sortedList(value,item=>fields(item,'id'));
}

function securityRule(value:unknown){
  const rule=object(value),settings=object(rule.properties);
  return {...fields(rule,'name'),...fields(settings,'priority','direction','access','protocol',
    'sourceAddressPrefix','destinationAddressPrefix','sourcePortRange','destinationPortRange'),
    sourceAddressPrefixes:strings(settings.sourceAddressPrefixes),
    destinationAddressPrefixes:strings(settings.destinationAddressPrefixes),
    sourcePortRanges:strings(settings.sourcePortRanges),destinationPortRanges:strings(settings.destinationPortRanges),
    sourceApplicationSecurityGroups:references(settings.sourceApplicationSecurityGroups),
    destinationApplicationSecurityGroups:references(settings.destinationApplicationSecurityGroups)};
}

export function projectAzureChildSettings(dataset:string,item:Record<string,unknown>){
  const {id,name}=item;
  const properties=object(item.properties);
  if(!item.properties||typeof item.properties!=='object'||Array.isArray(item.properties))
    throw new CollectionError('invalidResponse');
  switch(dataset){
    case 'azureSqlFirewall': {
      const rule=fields(properties,'startIpAddress','endIpAddress');
      if(typeof rule.startIpAddress!=='string'||typeof rule.endIpAddress!=='string')
        throw new CollectionError('invalidResponse');
      return {id,name,...rule,allowAzureServices:rule.startIpAddress==='0.0.0.0'&&rule.endIpAddress==='0.0.0.0'};
    }
    case 'azureSqlVnet':
      return {id,name,...fields(properties,'virtualNetworkSubnetId','ignoreMissingVnetServiceEndpoint','state')};
    case 'azureSqlAudit':
      return {id,name,...fields(properties,'state','retentionDays','isAzureMonitorTargetEnabled','isManagedIdentityInUse'),
        storageTargetConfigured:typeof properties.storageEndpoint==='string'?Boolean(properties.storageEndpoint):null};
    case 'azureBlobProtection':
      return {id,name,...fields(properties,'isVersioningEnabled'),
        blobSoftDelete:fields(properties.deleteRetentionPolicy,'enabled','days'),
        containerSoftDelete:fields(properties.containerDeleteRetentionPolicy,'enabled','days')};
    case 'azureVaultSecurity':{
      const acl=object(properties.networkAcls);
      return {id,name,...fields(properties,'publicNetworkAccess','enableRbacAuthorization','enableSoftDelete',
        'softDeleteRetentionInDays','enablePurgeProtection'),
        firewall:{...fields(acl,'defaultAction','bypass'),ipRules:sortedList(acl.ipRules,item=>fields(item,'value')),
          virtualNetworkRules:sortedList(acl.virtualNetworkRules,item=>fields(item,'id','ignoreMissingVnetServiceEndpoint'))},
        privateEndpoints:sortedList(properties.privateEndpointConnections,item=>{
          const connection=object(item),detail=object(connection.properties);
          return {...fields(connection,'id'),...fields(detail.privateLinkServiceConnectionState,'status')};
        }),
        accessPolicies:sortedList(properties.accessPolicies,item=>{
          const policy=object(item),permissions=object(policy.permissions);
          return {...fields(policy,'tenantId','objectId','applicationId'),
            keys:strings(permissions.keys),secrets:strings(permissions.secrets),
            certificates:strings(permissions.certificates),storage:strings(permissions.storage)};
        })};
    }
    case 'azureVaultDiagnostics':
      return {id,name,...fields(properties,'workspaceId','storageAccountId','eventHubAuthorizationRuleId','eventHubName','marketplacePartnerId'),
        logs:sortedList(properties.logs,item=>fields(item,'category','categoryGroup','enabled')),
        metrics:sortedList(properties.metrics,item=>fields(item,'category','enabled'))};
    case 'azureVnetSettings':
      return {id,name,addressPrefixes:strings(object(properties.addressSpace).addressPrefixes),
        dnsServers:strings(object(properties.dhcpOptions).dnsServers),
        subnets:sortedList(properties.subnets,item=>{
          const subnet=object(item),detail=object(subnet.properties);
          return {...fields(subnet,'name','id'),...fields(detail,'addressPrefix','privateEndpointNetworkPolicies',
            'privateLinkServiceNetworkPolicies','defaultOutboundAccess'),
            addressPrefixes:strings(detail.addressPrefixes),
            networkSecurityGroup:fields(detail.networkSecurityGroup,'id').id,
            routeTable:fields(detail.routeTable,'id').id,natGateway:fields(detail.natGateway,'id').id,
            privateEndpoints:references(detail.privateEndpoints),
            serviceEndpoints:sortedList(detail.serviceEndpoints,value=>fields(value,'service')),
            delegations:sortedList(detail.delegations,value=>fields(object(value).properties,'serviceName'))};
        }),
        peerings:sortedList(properties.virtualNetworkPeerings,item=>{
          const peering=object(item),detail=object(peering.properties);
          return {...fields(peering,'name'),...fields(detail,'peeringState','allowVirtualNetworkAccess',
            'allowForwardedTraffic','allowGatewayTransit','useRemoteGateways'),
            remoteVirtualNetwork:fields(detail.remoteVirtualNetwork,'id').id};
        })};
    case 'azureNsgSettings':
      return {id,name,subnets:references(properties.subnets),networkInterfaces:references(properties.networkInterfaces),
        securityRules:sortedList(properties.securityRules,securityRule),
        defaultSecurityRules:sortedList(properties.defaultSecurityRules,securityRule)};
    default:throw new CollectionError('invalidDataType');
  }
}
