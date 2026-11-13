import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { requireAuditUser, AuditAccessError } from '../auth/requireAuditUser.js';
import { customerCredential } from '../access/customerAccess.js';
import { uuidPattern } from '../storage/sql.js';
import { claimCollection, checkpointCollection, createDataAudit, getDataAudit, getLicenseRows,
  requireAuditSql, startCollection,getJobSubscription,getSnapshotRows,nextIntuneParent } from '../audits/store.js';
import {fetchIntuneChildPage,parseIntuneCursor} from '../audits/intune.js';
import { graphPage, processCollection } from '../audits/worker.js';
import {datasetCatalog,isDataType,isSnapshotType} from '../audits/catalog.js';
import {fetchSnapshotPage,sourceJson,sourceScope} from '../audits/snapshots.js';
import {CollectionError} from '../audits/licensing.js';
import type {CollectionJob} from '../audits/store.js';
import type {SnapshotRecord} from '../audits/catalog.js';

function enabled():boolean {return process.env.DATA_AUDITS_ENABLED==='true';}
async function handle(request:HttpRequest,context:InvocationContext,
  operation:(tenantId:string,objectId:string)=>Promise<HttpResponseInit>):Promise<HttpResponseInit> {
  let user;
  try {user=await requireAuditUser(request);}catch(error){
    return {status:error instanceof AuditAccessError?error.status:401,jsonBody:{error:'Audit access is not authorized.'}};
  }
  try {
    if(!enabled())return {status:503,jsonBody:{error:'Audit data collection is not enabled yet.'}};
    return await operation(user.tenantId,user.objectId);
  }catch(error){
    if(error instanceof AuditAccessError)return {status:error.status,jsonBody:{error:error.message}};
    // No source response, credential error detail, user data or paging tokens in logs.
    context.error('Data audit operation failed.');
    return {status:500,jsonBody:{error:'The audit data could not be accessed. Please try again.'}};
  }
}
export async function createAudit(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  return handle(request,context,async(tenantId,objectId)=>({status:202,jsonBody:await createDataAudit(tenantId,objectId)}));
}
export async function readAudit(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  return handle(request,context,async tenantId=>{
    const scanId=request.params.scanId??'';
    if(!uuidPattern.test(scanId))return {status:400,jsonBody:{error:'A valid audit ID is required.'}};
    const result=await getDataAudit(tenantId,scanId);
    return result?{status:200,jsonBody:result}:{status:404,jsonBody:{error:'Audit not found.'}};
  });
}
export async function readEvidence(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  return handle(request,context,async tenantId=>{
    const scanId=request.params.scanId??'',dataType=request.params.dataType;
    const rawPage=request.query.get('page')??'1',page=Number(rawPage),search=(request.query.get('search')??'').trim();
    const skuId=request.query.get('skuId')??undefined;
    if(!uuidPattern.test(scanId)||!dataType||!isDataType(dataType)||
      !/^\d+$/.test(rawPage)||!Number.isSafeInteger(page)||page<1||page>1000000||search.length>200||
      (skuId!==undefined&&!uuidPattern.test(skuId)))return {status:400,jsonBody:{error:'Invalid audit data filter.'}};
    const result=isSnapshotType(dataType)?await getSnapshotRows(tenantId,scanId,dataType,page,search):await getLicenseRows(tenantId,scanId,dataType,page,search,skuId);
    return result?{status:200,jsonBody:result}:{status:404,jsonBody:{error:'Audit not found.'}};
  });
}
async function collectSnapshot(job:CollectionJob):Promise<void>{
  if(!isSnapshotType(job.DataType))throw new Error('Invalid snapshot type.');
  await startCollection(job);
  let page:{records:SnapshotRecord[];nextLink:string|null};
  try{
    if(job.Attempts>3)throw new CollectionError('workerInterrupted');
    const subscriptionId=await getJobSubscription(job);
    const source=datasetCatalog[job.DataType];
    const credential=await customerCredential(job.TenantId);
    let token:string;
    try{token=(await credential.getToken(sourceScope(job.DataType))).token;}
    catch{throw new CollectionError('authenticationUnavailable');}
    if('arm' in source){
      if(!subscriptionId)throw new CollectionError('missingSubscription');
      const subscription=await sourceJson(`https://management.azure.com/subscriptions/${subscriptionId}?api-version=2022-12-01`,token);
      if(String(subscription.tenantId??'').toLowerCase()!==job.TenantId.toLowerCase())throw new CollectionError('subscriptionTenantMismatch');
    }
    if('parent' in source){
      const cursor=parseIntuneCursor(job.NextLink),{parent,status}=await nextIntuneParent(job,cursor);
      if(status==='queued'||status==='running')throw new CollectionError('parentCollectionIncomplete');
      if(!parent){
        if(cursor.page)throw new CollectionError('invalidPagingLink');
        if(status!=='complete')throw new CollectionError('parentCollectionIncomplete',status==='missingAccess');
        page={records:[],nextLink:null};
      }else page=await fetchIntuneChildPage(job.DataType,parent,cursor,token);
    }else page=await fetchSnapshotPage(job.DataType,subscriptionId,job.NextLink,token);
  }catch(error){
    const safe=error instanceof CollectionError?error:new CollectionError('sourceUnavailable');
    await checkpointCollection(job,[],null,{code:safe.code,missingAccess:safe.missingAccess});
    return;
  }
  await checkpointCollection(job,page.records,page.nextLink);
}
export async function collectAuditData(_timer:unknown,context:InvocationContext):Promise<void>{
  if(!enabled())return;
  await requireAuditSql();
  const deadline=Date.now()+45000;
  for(let count=0;count<20&&Date.now()<deadline;count++){
    const job=await claimCollection();
    if(!job)return;
    try{
      if(isSnapshotType(job.DataType)){await collectSnapshot(job);continue;}
      await processCollection(job,{start:startCollection,checkpoint:checkpointCollection,page:graphPage,
        token:async tenantId=>(await (await customerCredential(tenantId)).getToken('https://graph.microsoft.com/.default')).token});
    }catch{
      context.error('Audit collection checkpoint failed; its lease will expire for recovery.');
    }
  }
}
app.http('createDataAudit',{methods:['POST'],authLevel:'anonymous',route:'me/audits',handler:createAudit});
app.http('readDataAudit',{methods:['GET'],authLevel:'anonymous',route:'me/audits/{scanId}',handler:readAudit});
app.http('readAuditEvidence',{methods:['GET'],authLevel:'anonymous',route:'me/audits/{scanId}/{dataType}',handler:readEvidence});
app.timer('collectAuditData',{schedule:'0 * * * * *',useMonitor:true,runOnStartup:false,handler:collectAuditData});
