// Only synthetic evidence in a dedicated disposable database, never Dev/customer data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';
import * as store from '../apps/api/dist/src/audits/store.js';
import {datasetCatalog} from '../apps/api/dist/src/audits/catalog.js';
import {normalizeSnapshots} from '../apps/api/dist/src/audits/snapshots.js';
import {fetchIntuneChildPage,parseIntuneCursor} from '../apps/api/dist/src/audits/intune.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sql=require('mssql');
const database=process.env.SQL_DATABASE;
if(!database?.startsWith('nso-audit-validation-')||process.env.CONFIRM_DISPOSABLE_AUDIT_TEST!==database)
  throw new Error('Explicit disposable database confirmation required.');
process.env.TENANT_STORE='sql';
const pool=await getSqlPool(),org=randomUUID(),tenant=randomUUID(),other=randomUUID();
try{
  const existing=await pool.request().query('SELECT COUNT(*) N FROM dbo.AuditCollectionJobs;');
  assert.equal(existing.recordset[0].N,0,'Use an empty disposable database.');
  await pool.request().query("UPDATE dbo.ScanStorageCutover SET Backend='sql' WHERE Id=1;");
  await withOrganization(org,async t=>new sql.Request(t).input('org',sql.UniqueIdentifier,org).input('tenant',sql.UniqueIdentifier,tenant)
    .query("INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,N'Intune disposable test'); INSERT security.EntraConnections(OrganizationId,TenantId) VALUES(@org,@tenant);"));
  const audit=await store.createDataAudit(tenant,randomUUID(),randomUUID());
  const completed=new Set();let iterations=0;
  while(true){
    const job=await store.claimCollection();if(!job)break;
    assert.ok(++iterations<100);await store.startCollection(job);
    const source=datasetCatalog[job.DataType];
    if(source&&'parent' in source){
      assert.ok(completed.has(source.parent),'Child ran before inventory was terminal.');
      const cursor=parseIntuneCursor(job.NextLink),{parent,status}=await store.nextIntuneParent(job,cursor);
      assert.equal(status,'complete');
      if(!parent){await store.checkpointCollection(job,[],null);completed.add(job.DataType);continue;}
      const page=await fetchIntuneChildPage(job.DataType,parent,cursor,'synthetic',async()=>Response.json(source.relationship?{value:[{id:'0',target:{'@odata.type':'#microsoft.graph.allDevicesAssignmentTarget'}}]}:{id:parent.sourceId,passwordRequired:true}));
      // Parent FK prevents evidence being attached to a policy outside this audit.
      await assert.rejects(()=>store.checkpointCollection(job,[{...page.records[0],parentSourceId:'absent'}],page.nextLink));
      await store.checkpointCollection(job,page.records,page.nextLink);
      await assert.rejects(()=>store.checkpointCollection(job,page.records,null),'Released lease must reject stale worker.');
      const saved=await store.getSnapshotRows(tenant,audit.scanId,job.DataType,1,'');
      assert.equal(saved.total,1);assert.equal(saved.rows[0].ParentSourceId,parent.sourceId);
      assert.ok(saved.rows[0].StoredAtUtc);assert.ok(saved.rows[0].CollectedAtUtc);
    }else{
      const records=source?normalizeSnapshots([{id:'policy-1',displayName:'Synthetic policy'}],new Date().toISOString()):[];
      await store.checkpointCollection(job,records,null);completed.add(job.DataType);
    }
  }
  assert.equal(completed.size,24);assert.equal((await store.getDataAudit(tenant,audit.scanId)).audit.Status,'complete');
  await withOrganization(other,async t=>{
    for(const source of Object.values(datasetCatalog).filter(s=>'parent' in s||s.table==='AuditSettingsCatalogPolicies')){
      assert.equal((await new sql.Request(t).query(`SELECT * FROM app.${source.table}`)).recordset.length,0,'RLS leaked Intune evidence.');
    }
  });
  // A second audit retains the first snapshot and propagates missing parent access.
  const second=await store.createDataAudit(tenant,randomUUID(),randomUUID());
  while(true){
    const job=await store.claimCollection();if(!job)break;
    await store.startCollection(job);
    const source=datasetCatalog[job.DataType];
    if(job.DataType==='settingsCatalogPolicies')await store.checkpointCollection(job,[],null,{code:'missingAccess',missingAccess:true});
    else if(source&&'parent' in source){
      const {parent,status}=await store.nextIntuneParent(job,parseIntuneCursor(null));assert.equal(parent,null);
      await store.checkpointCollection(job,[],null,status==='complete'?undefined:{code:'parentCollectionIncomplete',missingAccess:status==='missingAccess'});
    }else await store.checkpointCollection(job,[],null);
  }
  const secondResult=await store.getDataAudit(tenant,second.scanId);
  assert.equal(secondResult.audit.Status,'partial');
  assert.equal(secondResult.collections.find(c=>c.DataType==='settingsCatalogSettings').Status,'missingAccess');
  assert.equal((await store.getSnapshotRows(tenant,audit.scanId,'settingsCatalogSettings',1,'')).total,1);
  console.log('PASS: 24 datasets, dependency scheduling, parent FKs, atomic rollback, stale leases, RLS, immutable snapshots and missing-parent status.');
}finally{await pool.close();}
