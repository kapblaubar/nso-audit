import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { requireAuditUser, AuditAccessError } from '../auth/requireAuditUser.js';
import { customerCredential } from '../access/customerAccess.js';
import { uuidPattern } from '../storage/sql.js';
import { claimCollection, checkpointCollection, createDataAudit, getDataAudit, getLicenseRows,
  requireAuditSql, startCollection } from '../audits/store.js';
import { graphPage, processCollection } from '../audits/worker.js';

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
    if(!uuidPattern.test(scanId)||(dataType!=='licenses'&&dataType!=='licenseAssignments')||
      !/^\d+$/.test(rawPage)||!Number.isSafeInteger(page)||page<1||page>1000000||search.length>200||
      (skuId!==undefined&&!uuidPattern.test(skuId)))return {status:400,jsonBody:{error:'Invalid audit data filter.'}};
    const result=await getLicenseRows(tenantId,scanId,dataType,page,search,skuId);
    return result?{status:200,jsonBody:result}:{status:404,jsonBody:{error:'Audit not found.'}};
  });
}
export async function collectAuditData(_timer:unknown,context:InvocationContext):Promise<void>{
  if(!enabled())return;
  await requireAuditSql();
  const deadline=Date.now()+45000;
  for(let count=0;count<20&&Date.now()<deadline;count++){
    const job=await claimCollection();
    if(!job)return;
    try{
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
