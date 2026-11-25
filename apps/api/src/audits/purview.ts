import {ManagedIdentityCredential} from '@azure/identity';
import type {SnapshotRecord} from './catalog.js';
import {CollectionError} from './licensing.js';
import type {CollectionJob} from './store.js';

const policyFields=['id','name','mode','workload','enabled','distributionStatus','exchangeLocationCount','sharePointLocationCount','oneDriveLocationCount','teamsLocationCount','endpointLocationCount'];
const ruleFields=['id','name','policy','mode','priority','disabled','hasSensitiveInformationCondition','hasUserNotification','hasIncidentReport','hasOverride','hasBlockAction'];
const object=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CollectionError('invalidResponse');
  return value as Record<string,unknown>;
};
const sameId=(value:unknown,expected:string)=>typeof value==='string'&&value.toLowerCase()===expected.toLowerCase();
let credential:ManagedIdentityCredential|undefined;

export function purviewEnabledFor(tenantId:string){
  return Boolean(process.env.PURVIEW_COLLECTOR_URL&&process.env.PURVIEW_TENANT_IDS?.split(',').some(id=>sameId(id.trim(),tenantId)));
}

export function purviewRecords(payload:unknown,job:Pick<CollectionJob,'TenantId'|'ScanId'|'DataType'>):SnapshotRecord[]{
  const result=object(payload);
  if(result.schemaVersion!=='purview-evidence-v1'||result.module!=='dlp'||result.status!=='complete'||
    !sameId(result.tenantId,job.TenantId)||!sameId(result.scanId,job.ScanId)||typeof result.collectedAt!=='string')
    throw new CollectionError('invalidResponse');
  const collectedAt=new Date(result.collectedAt);
  const evidence=object(result.evidence);
  const policies=job.DataType==='purviewDlpPolicies';
  const rows=evidence[policies?'policies':'rules'];
  if(!Array.isArray(rows)||rows.length!==evidence[policies?'policyCount':'ruleCount']||
    rows.length>10000||!Number.isFinite(collectedAt.getTime()))throw new CollectionError('invalidResponse');
  const ids=new Set<string>();
  return rows.map(value=>{
    const row=object(value);
    if(typeof row.id!=='string'||!row.id.trim()||row.id.length>450||ids.has(row.id.toLowerCase()))
      throw new CollectionError('invalidResponse');
    ids.add(row.id.toLowerCase());
    const fields=(policies?policyFields:ruleFields).flatMap(key=>{
      const value=row[key];
      return value===null||['string','boolean','number'].includes(typeof value)?[[key,value]]:[];
    });
    return {sourceId:row.id,displayName:typeof row.name==='string'?row.name.slice(0,512):null,
      state:typeof row.mode==='string'?row.mode.slice(0,128):null,sourceCreatedAtUtc:null,sourceUpdatedAtUtc:null,
      sourceJson:JSON.stringify(Object.fromEntries(fields)),collectedAtUtc:collectedAt.toISOString()};
  });
}

export async function fetchPurviewRecords(job:CollectionJob):Promise<SnapshotRecord[]>{
  if(!purviewEnabledFor(job.TenantId))throw new CollectionError('purviewNotEnabled',true);
  const url=new URL(process.env.PURVIEW_COLLECTOR_URL!);
  const audience=process.env.ENTRA_CLIENT_ID;
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!audience)
    throw new CollectionError('purviewConfiguration');
  credential??=new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID?{clientId:process.env.AZURE_CLIENT_ID}:{});
  let token:string;
  try{token=(await credential.getToken(`api://${audience}/.default`)).token;}
  catch{throw new CollectionError('purviewAuthentication');}
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(110_000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({tenantId:job.TenantId,scanId:job.ScanId,dataset:job.DataType})});
  if(response.status===401||response.status===403)throw new CollectionError('purviewAccessDenied',true);
  const raw=await response.text();
  if(Buffer.byteLength(raw)>4*1024*1024)throw new CollectionError('invalidResponse');
  if(!response.ok){
    let stage:unknown;
    try{stage=object(JSON.parse(raw)).stage;}catch{}
    const failureCode=stage==='certificate'?'purviewCertificateUnavailable':stage==='connect'?'purviewConnectionFailed':
      stage==='readPolicies'||stage==='readRules'?'purviewReadFailed':`purviewCollectorHttp${response.status}`;
    throw new CollectionError(failureCode);
  }
  return purviewRecords(JSON.parse(raw),job);
}
