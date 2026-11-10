import {createHash} from 'node:crypto';
import {datasetCatalog,type SnapshotDataType,type SnapshotRecord} from './catalog.js';
import {CollectionError} from './licensing.js';
import {normalizeSnapshots,sourceJson,validateSnapshotUrl} from './snapshots.js';

export interface ParentSnapshot {sourceId:string;displayName:string|null;status:string}
export interface IntuneCursor {after:string;page:string|null}
export function parseIntuneCursor(value:string|null):IntuneCursor{
  if(value===null)return {after:'',page:null};
  try{
    const cursor=JSON.parse(value);
    if(typeof cursor.after!=='string'||cursor.after.length>450||
      !(cursor.page===null||typeof cursor.page==='string')||!cursor.after)throw new Error();
    return {after:cursor.after,page:cursor.page};
  }catch{throw new CollectionError('invalidPagingLink');}
}
export function intuneChildUrl(dataType:SnapshotDataType,parentId:string):string{
  const source=datasetCatalog[dataType];
  if(!('parent' in source)||!parentId||parentId.length>450||parentId==='.'||parentId==='..')throw new CollectionError('invalidSourceIdentifier');
  return `https://graph.microsoft.com${source.path}/${encodeURIComponent(parentId)}${source.relationship?`/${source.relationship}`:''}${'expandDefinitions' in source?'?$expand=settingDefinitions':''}`;
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const string=(value:unknown,max=512)=>typeof value==='string'?value.slice(0,max):null;
export async function fetchIntuneChildPage(dataType:SnapshotDataType,parent:ParentSnapshot,cursor:IntuneCursor,token:string,fetcher:typeof fetch=fetch){
  const source=datasetCatalog[dataType];
  if(!('parent' in source))throw new CollectionError('invalidDataType');
  const initial=intuneChildUrl(dataType,parent.sourceId);
  const url=validateSnapshotUrl(cursor.page??initial,initial);
  const body=await sourceJson(url,token,fetcher);
  const values=source.relationship?body.value:[body];
  if(!Array.isArray(values))throw new CollectionError('invalidResponse');
  const next=body['@odata.nextLink'];
  if(next!==undefined&&next!==null&&typeof next!=='string')throw new CollectionError('invalidPagingLink');
  const nextPage=typeof next==='string'&&next?validateSnapshotUrl(next,initial):null;
  if(nextPage===url)throw new CollectionError('invalidPagingLink');
  const records:SnapshotRecord[]=values.map(value=>{
    const item=object(value),instance=object(item.settingInstance),target=object(item.target);
    // Do not silently lose expanded metadata pages or accept a detail for a different policy.
    if(item['settingDefinitions@odata.nextLink'])throw new CollectionError('incompleteSettingDefinitions');
    if(!source.relationship&&item.id!==parent.sourceId)throw new CollectionError('invalidSourceIdentifier');
    const row=normalizeSnapshots([item],new Date().toISOString())[0]!;
    const definitions=Array.isArray(item.settingDefinitions)?item.settingDefinitions.map(object):[];
    const definition=definitions.find(d=>d.id===instance.settingDefinitionId);
    const type=string(target['@odata.type'],128);
    const targetName=type?.includes('allDevices')?'All Devices':type?.includes('allLicensedUsers')?'All Users':string(target.groupId);
    return {...row,sourceId:createHash('sha256').update(JSON.stringify([parent.sourceId,row.sourceId])).digest('hex'),
      parentSourceId:parent.sourceId,childSourceId:row.sourceId,
      displayName:[parent.displayName??parent.sourceId,string(definition?.displayName)??targetName??row.displayName??row.sourceId].join(' / ').slice(0,512),
      settingDefinitionId:string(instance.settingDefinitionId),targetType:type,groupId:string(target.groupId,128),
      filterId:string(target.deviceAndAppManagementAssignmentFilterId,128),filterType:string(target.deviceAndAppManagementAssignmentFilterType,64)};
  });
  const nextLink=JSON.stringify({after:parent.sourceId,page:nextPage});
  if(nextLink.length>4000)throw new CollectionError('invalidPagingLink');
  return {records,nextLink};
}
