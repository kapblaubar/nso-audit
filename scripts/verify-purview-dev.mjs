import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {getSqlPool} from '../apps/api/dist/src/storage/sql.js';
import {withTenant} from '../apps/api/dist/src/storage/sqlTenantStore.js';
import {getDataAudit} from '../apps/api/dist/src/audits/store.js';
import {readPair} from '../apps/api/dist/src/compareApp/store.js';

const sql=createRequire(new URL('../apps/api/package.json',import.meta.url))('mssql');
const tenantId='fe0c1fea-bc61-42cc-b384-bad739ef3c6e';
const initiator='28995be7-732b-47c4-a04d-f4ea51eb088e';
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||process.env.SQL_DATABASE!=='nso-audit-dev'||
  process.env.SQL_SERVER!=='nso-audit-dev-257f10d8.database.windows.net'||process.env.TENANT_STORE!=='sql')
  throw new Error('Set explicit Dev SQL targets, TENANT_STORE=sql and CONFIRM_DEV_WRITE_TEST=yes.');
const pool=await getSqlPool();
const scanId=randomUUID();
try{
  await withTenant(tenantId,async(tx,org)=>{
    const request=()=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org)
      .input('tenant',sql.UniqueIdentifier,tenantId).input('scan',sql.UniqueIdentifier,scanId);
    const entity={partitionKey:tenantId,rowKey:scanId,status:'queued',createdAt:new Date().toISOString(),auditScope:'tenant'};
    await request().input('entity',sql.NVarChar(sql.MAX),JSON.stringify(entity))
      .input('initiator',sql.UniqueIdentifier,initiator).query(`
        INSERT app.ScanRuns(OrganizationId,TenantId,ScanId,EntityJson) VALUES(@org,@tenant,@scan,@entity);
        INSERT app.DataAudits(OrganizationId,TenantId,ScanId,Scope,Status,InitiatedBy,CollectorVersion)
          VALUES(@org,@tenant,@scan,'tenant','queued',@initiator,'purview-dev-verification');
        INSERT app.AuditCollections(OrganizationId,TenantId,ScanId,DataType,Status)
          VALUES(@org,@tenant,@scan,'purviewDlpPolicies','queued'),(@org,@tenant,@scan,'purviewDlpRules','queued');
        EXEC security.EnqueueAuditCollection @OrganizationId=@org,@TenantId=@tenant,@ScanId=@scan,@DataType='purviewDlpPolicies';
        EXEC security.EnqueueAuditCollection @OrganizationId=@org,@TenantId=@tenant,@ScanId=@scan,@DataType='purviewDlpRules';`);
  });
  console.log('Dev DLP audit',scanId);
  const deadline=Date.now()+6*60_000;
  let previous='';
  while(Date.now()<deadline){
    const audit=await getDataAudit(tenantId,scanId);
    const results=audit?.collections.map(({DataType,Status,RecordCount,ErrorCode})=>({DataType,Status,RecordCount,ErrorCode}))??[];
    const serialized=JSON.stringify(results);
    if(serialized!==previous){console.log(serialized);previous=serialized;}
    if(results.length===2&&results.every(row=>!['queued','running'].includes(row.Status))){
      if(results.some(row=>row.Status!=='complete'))process.exitCode=1;
      else for(const result of results){
        const {after}=await readPair(tenantId,randomUUID(),scanId,result.DataType);
        if(after.length!==result.RecordCount)throw new Error('Compare storage returned an unexpected record count.');
      }
      break;
    }
    await delay(10_000);
  }
  if(Date.now()>=deadline)throw new Error('Timed out waiting for the Dev DLP audit.');
}finally{await pool.close();}
