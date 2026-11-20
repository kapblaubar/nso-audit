import {datasetCatalog,type SnapshotDataType,type SnapshotRecord} from './catalog.js';
import {projectAzureSettings} from './azureSettings.js';
import {projectAzureRole} from './azureRoles.js';
import {CollectionError} from './licensing.js';
import {uuidPattern} from '../storage/sql.js';

const secretFields=new Set(['password','clientsecret','secret','sharedsecret','presharedkey','privatekey','accesstoken','refreshtoken','certificatepassword','passwordcredentials','keycredentials']);
export function sanitizeEvidence(value:unknown):unknown{
  if(Array.isArray(value))return value.map(sanitizeEvidence);
  if(value&&typeof value==='object'){
    const item=value as Record<string,unknown>;
    // Intune custom/encrypted and secret settings put credentials in generic value fields.
    if(item.isEncrypted===true||/secretsettingvalue|omasettingbase64/i.test(String(item['@odata.type']??'')))
      return Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,
        ['value','encryptedValue'].includes(key)?'[redacted]':sanitizeEvidence(entry)]));
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>
    [key,secretFields.has(key.toLowerCase())?'[redacted]':sanitizeEvidence(item)]));
  return value;
}
export function sourceScope(dataType:SnapshotDataType):string{
  const source=datasetCatalog[dataType];
  return 'arm' in source?'https://management.azure.com/.default':'endpoint' in source?'https://api.securitycenter.microsoft.com/.default':'https://graph.microsoft.com/.default';
}
export function sourceUrl(dataType:SnapshotDataType,subscriptionId:string|null):string{
  const source=datasetCatalog[dataType];
  if('arm' in source){
    if(!subscriptionId||!uuidPattern.test(subscriptionId))throw new CollectionError('missingSubscription');
    return `https://management.azure.com/subscriptions/${subscriptionId}${source.path}`;
  }
  return `${'endpoint' in source?'https://api.securitycenter.microsoft.com':'https://graph.microsoft.com'}${source.path}`;
}
export function validateSnapshotUrl(value:string,initial:string):string{
  const url=new URL(value),base=new URL(initial);
  if(url.origin!==base.origin||url.pathname.toLowerCase()!==base.pathname.toLowerCase()||url.username||url.password||url.hash||value.length>4000)
    throw new CollectionError('invalidPagingLink');
  return url.href;
}
export async function sourceJson(url:string,token:string,fetcher:typeof fetch=fetch,options:{timeoutMs?:number;retryTimeouts?:boolean;language?:string}={}):Promise<Record<string,unknown>>{
  for(let attempt=0;attempt<3;attempt++){
    let response:Response;
    const headers:Record<string,string>={Authorization:`Bearer ${token}`,Accept:'application/json'};
    if(options.language)headers['Accept-Language']=options.language;
    try{response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(options.timeoutMs??30000)});}
    catch(error){
      const timeout=error instanceof Error&&error.name==='TimeoutError';
      if(timeout&&options.retryTimeouts&&attempt<2){await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));continue;}
      throw new CollectionError(timeout?'sourceTimeout':'sourceUnavailable');
    }
    if(response.ok){
      let body:unknown;try{body=await response.json();}catch{throw new CollectionError('invalidResponse');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new CollectionError('invalidResponse');
      return body as Record<string,unknown>;
    }
    if(response.status===401||response.status===403)throw new CollectionError('missingAccess',true);
    if(response.status!==429&&response.status<500)throw new CollectionError(`http${response.status}`);
    const retry=response.headers.get('retry-after');
    const seconds=retry?Number(retry):NaN;
    const delay=Number.isFinite(seconds)?seconds*1000:retry?Date.parse(retry)-Date.now():1000*(attempt+1);
    if(attempt===2||delay>10000)throw new CollectionError(response.status===429?'throttled':response.status===504?'sourceTimeout':'sourceUnavailable');
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,Number.isFinite(delay)?delay:1000)));
  }
  throw new CollectionError('sourceUnavailable');
}
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function normalizeSnapshots(values:unknown[],collectedAtUtc:string):SnapshotRecord[]{
  const rows=new Map<string,SnapshotRecord>();
  for(const value of values){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new CollectionError('invalidResponse');
    const item=value as Record<string,unknown>;
    const sourceId=item.id??item.name;
    if(typeof sourceId!=='string'||!sourceId||sourceId.length>450)throw new CollectionError('invalidSourceIdentifier');
    const properties=item.properties&&typeof item.properties==='object'?item.properties as Record<string,unknown>:{};
    const role=item.roleDefinition&&typeof item.roleDefinition==='object'?item.roleDefinition as Record<string,unknown>:{};
    const display=item.displayName??item.recommendationName??role.displayName??properties.displayName??item.name??item.userPrincipalName;
    const state=item.state??properties.provisioningState;
    rows.set(sourceId,{sourceId,displayName:typeof display==='string'?display.slice(0,512):null,
      state:typeof state==='string'?state.slice(0,128):null,
      sourceCreatedAtUtc:date(item.createdDateTime),sourceUpdatedAtUtc:date(item.lastModifiedDateTime??item.modifiedDateTime),
      sourceJson:JSON.stringify(sanitizeEvidence(item)),collectedAtUtc});
  }
  return [...rows.values()];
}
export async function fetchSnapshotPage(dataType:SnapshotDataType,subscriptionId:string|null,nextLink:string|null,token:string,
  fetcher:typeof fetch=fetch){
  const initial=sourceUrl(dataType,subscriptionId),url=validateSnapshotUrl(nextLink??initial,initial);
  // The PIM service rejects the wildcard language sent by Node fetch.
  const options=dataType==='directoryRoleEligibility'?{language:'en-US'}
    :dataType==='secureScores'||dataType==='secureScoreProfiles'?{timeoutMs:45000,retryTimeouts:true}:{};
  const body=await sourceJson(url,token,fetcher,options);
  const next=body['@odata.nextLink']??body.nextLink;
  if(next!==undefined&&next!==null&&typeof next!=='string')throw new CollectionError('invalidPagingLink');
  const nextUrl=typeof next==='string'&&next?validateSnapshotUrl(next,initial):null;
  if(nextUrl===url)throw new CollectionError('invalidPagingLink');
  const source=datasetCatalog[dataType];
  if('endpoint' in source&&'singleton' in source){
    if(typeof body.score!=='number'||!Number.isFinite(body.score)||typeof body.time!=='string'||!Number.isFinite(Date.parse(body.time)))throw new CollectionError('invalidResponse');
  }
  const values='singleton' in source?[('endpoint' in source?{...body,id:dataType,lastModifiedDateTime:body.time}:body)]:body.value;
  if(!Array.isArray(values))throw new CollectionError('invalidResponse');
  const evidence=dataType==='azureResources'?values.map(value=>{
    const item=value as Record<string,unknown>|null;
    const match=typeof item?.id==='string'?/^\/subscriptions\/([^/]+)\/(?:resourceGroups\/([^/]+)\/)?providers\//i.exec(item.id):null;
    if(!match?.[1]||match[1].toLowerCase()!==subscriptionId?.toLowerCase()||
      typeof item?.name!=='string'||typeof item.type!=='string')throw new CollectionError('invalidResponse');
    return {id:item.id,name:item.name,type:item.type,kind:item.kind,location:item.location,
      resourceGroup:match[2]??null,subscriptionId,tags:item.tags};
  }):values;
  const projected=dataType==='azureStorageSettings'||dataType==='azureSqlSettings'
    ?evidence.map(item=>projectAzureSettings(dataType,item,subscriptionId)):evidence;
  const records=dataType==='azureRoleAssignments'||dataType==='azureRoleDefinitions'
    ?projected.map(item=>projectAzureRole(dataType,item)):projected;
  return {records:normalizeSnapshots(records,new Date().toISOString()),nextLink:'latestOnly' in source?null:nextUrl};
}
