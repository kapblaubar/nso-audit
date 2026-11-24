import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import {requireAuditUser,AuditAccessError} from '../auth/requireAuditUser.js';
import {getDataAudit,requireAuditSql} from '../audits/store.js';
import {isDataType} from '../audits/catalog.js';
import {getSqlPool,uuidPattern} from '../storage/sql.js';
import {listTenantScans} from '../storage/sqlTenantStore.js';
import {compareEvidence} from './compareEvidence.js';
import {CompareCapacityError,readPair} from './store.js';

function json(status:number,jsonBody:unknown):HttpResponseInit {
  return {status,jsonBody,headers:{'Cache-Control':'no-store'}};
}
function error(status:number,message:string){return json(status,{error:message});}

function authorized(operation:(request:HttpRequest,tenant:string)=>Promise<HttpResponseInit>){
  return async(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>=>{
    let tenant:string;
    try{tenant=(await requireAuditUser(request)).tenantId;}
    catch(err){return error(err instanceof AuditAccessError?err.status:401,'Audit access is not authorized.');}
    try{return await operation(request,tenant);}
    catch(err){
      if(err instanceof CompareCapacityError)return error(413,err.message);
      context.error('Audit Compare operation failed.');
      return error(500,'The comparison service could not read the saved audits.');
    }
  };
}

export const readComparison=authorized(async(request,tenant)=>{
  const baseline=request.query.get('baseline')?.toLowerCase()??'';
  const comparison=request.query.get('comparison')?.toLowerCase()??'';
  const dataset=request.query.get('dataset');
  if(!uuidPattern.test(baseline)||!uuidPattern.test(comparison)||baseline===comparison||(dataset!==null&&!isDataType(dataset)))
    return error(400,'Choose two different valid audit IDs and a valid dataset.');
  const pair=await Promise.all([getDataAudit(tenant,baseline),getDataAudit(tenant,comparison)]);
  const [before,after]=pair;
  if(!before||!after)return error(404,'One or both audits were not found.');
  if(pair.some(report=>!['complete','partial','failed'].includes(report?.audit.Status)))
    return error(409,'Both audits must finish before they can be compared.');
  if(!dataset)return json(200,pair);
  if(pair.some(report=>!report?.collections.some(item=>item.DataType===dataset&&item.Status==='complete')))
    return error(409,'This dataset did not complete in both audits.');
  const rows=await readPair(tenant,baseline,comparison,dataset);
  const records=compareEvidence(rows.before,rows.after,dataset);
  const differences=records.filter(record=>record.status!=='Unchanged').length;
  if(request.query.get('summary')==='true')return json(200,{differences,records:records.length});
  return json(200,{records,differences});
});

app.http('compareAudits',{methods:['GET'],authLevel:'anonymous',route:'me/audit-compare',handler:readComparison});
app.http('compareHistory',{methods:['GET'],authLevel:'anonymous',route:'me/audit-compare/history',handler:authorized(async(_request,tenant)=>{
  await requireAuditSql();
  return json(200,{scans:await listTenantScans(tenant,100)});
})});
app.http('compareHealth',{methods:['GET'],authLevel:'anonymous',route:'health',handler:async()=>{
  try{
    await requireAuditSql();
    await (await getSqlPool()).request().query('SELECT TOP(0) ScanId FROM app.DataAudits;');
    return json(200,{status:'ok',service:'audit-compare'});
  }catch{return error(503,'Audit Compare storage is unavailable.');}
}});
