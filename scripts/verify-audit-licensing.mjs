// Real SQL checks. Requires an EMPTY disposable database with migrations through 017.
// Never run against Dev or Prod. No Microsoft source calls, credentials or real customer data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';
import * as store from '../apps/api/dist/src/audits/store.js';
import {normalizeLicenses,normalizeAssignments} from '../apps/api/dist/src/audits/licensing.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sql=require('mssql');
const database=process.env.SQL_DATABASE;
if(!database?.startsWith('nso-audit-validation-')||process.env.CONFIRM_DISPOSABLE_AUDIT_TEST!==database)
  throw new Error('Use a disposable nso-audit-validation-* database and set CONFIRM_DISPOSABLE_AUDIT_TEST to its exact name.');
process.env.TENANT_STORE='sql';
const fixtures=[{org:randomUUID(),tenant:randomUUID()},{org:randomUUID(),tenant:randomUUID()}];
const [a,b]=fixtures,sku=randomUUID(),user=randomUUID(),at=new Date().toISOString();
const license=normalizeLicenses([{id:'synthetic-license',skuId:sku,skuPartNumber:'SYNTHETIC_SKU',prepaidUnits:{enabled:5},consumedUnits:1}],at);
const assignments=normalizeAssignments([{id:user,userPrincipalName:'fixture@example.invalid',assignedLicenses:[{skuId:sku}],licenseAssignmentStates:[]}],at);
const pool=await getSqlPool();
const empty=await pool.request().query(`SELECT (SELECT COUNT(*) FROM security.EntraConnections) Connections,
  (SELECT COUNT(*) FROM dbo.AuditCollectionJobs) Jobs;`);
if(empty.recordset[0].Connections||empty.recordset[0].Jobs){await pool.close();throw new Error('Disposable database must have no tenant connections or jobs.');}
const prior=(await pool.request().execute('security.GetScanStorageState')).recordset[0].Backend;
const req=(t,f)=>new sql.Request(t).input('org',sql.UniqueIdentifier,f.org).input('tenant',sql.UniqueIdentifier,f.tenant);
try{
  await pool.request().query("UPDATE dbo.ScanStorageCutover SET Backend='sql' WHERE Id=1;");
  for(const f of fixtures)await withOrganization(f.org,async t=>{
    await req(t,f).query(`INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,N'Audit licensing disposable test');
      INSERT security.EntraConnections(OrganizationId,TenantId) VALUES(@org,@tenant);`);
  });
  const audit=await store.createDataAudit(a.tenant,user);
  assert.equal((await store.getDataAudit(a.tenant,audit.scanId)).audit.Status,'queued');
  assert.equal(await store.getDataAudit(b.tenant,audit.scanId),null);
  assert.equal(await store.getLicenseRows(b.tenant,audit.scanId,'licenses',1,''),null);
  const seen=new Set();
  for(let i=0;i<2;i++){
    let job=await store.claimCollection();assert.equal(job.ScanId.toLowerCase(),audit.scanId.toLowerCase());
    seen.add(job.DataType);await store.startCollection(job);
    const rows=job.DataType==='licenses'?license:assignments;
    if(i===0){
      await assert.rejects(()=>store.checkpointCollection(job,[{...rows[0],skuId:'not-a-guid'}],null));
      assert.equal((await store.getLicenseRows(a.tenant,audit.scanId,job.DataType,1,'')).total,0,'Failed page left evidence behind.');
      const cursor=(await pool.request().input('LeaseId',sql.UniqueIdentifier,job.LeaseId)
        .query('SELECT NextLink FROM dbo.AuditCollectionJobs WHERE LeaseId=@LeaseId;')).recordset[0];
      assert.equal(cursor.NextLink,null,'Failed page advanced its cursor.');
    }
    const next=job.DataType==='licenses'?'https://graph.microsoft.com/v1.0/subscribedSkus?$skiptoken=synthetic':
      'https://graph.microsoft.com/v1.0/users?$skiptoken=synthetic';
    await store.checkpointCollection(job,rows,next);
    await assert.rejects(()=>store.checkpointCollection(job,rows,null),'Released lease accepted a stale worker.');
    const resumed=await store.claimCollection();assert.equal(resumed.DataType,job.DataType);assert.equal(resumed.NextLink,next);
    await store.startCollection(resumed);
    await store.checkpointCollection(resumed,rows,null); // Same source keys must not duplicate.
    await assert.rejects(()=>store.checkpointCollection(resumed,rows,null),'Terminal snapshot accepted a worker write.');
    const saved=await store.getLicenseRows(a.tenant,audit.scanId,job.DataType,1,'');
    assert.equal(saved.total,1);assert.ok(saved.rows[0].CollectedAtUtc);assert.ok(saved.rows[0].StoredAtUtc);
  }
  assert.equal(seen.size,2);
  const loaded=await store.getDataAudit(a.tenant,audit.scanId);assert.equal(loaded.audit.Status,'complete');
  assert.deepEqual(loaded.collections.map(c=>c.RecordCount),[1,1]);
  assert.equal((await store.getLicenseRows(a.tenant,audit.scanId,'licenseAssignments',1,'fixture',sku)).total,1);
  await withOrganization(b.org,async t=>{
    const hidden=await new sql.Request(t).input('scan',sql.UniqueIdentifier,audit.scanId)
      .query('SELECT * FROM app.AuditLicenses WHERE ScanId=@scan;');
    assert.equal(hidden.recordset.length,0,'RLS exposed foreign tenant evidence.');
    await assert.rejects(()=>new sql.Request(t).input('org',sql.UniqueIdentifier,a.org).input('tenant',sql.UniqueIdentifier,a.tenant)
      .input('scan',sql.UniqueIdentifier,audit.scanId).input('sku',sql.UniqueIdentifier,sku)
      .query(`INSERT app.AuditLicenses(OrganizationId,TenantId,ScanId,SourceId,SkuId,SkuPartNumber,CollectedAtUtc)
        VALUES(@org,@tenant,@scan,'forbidden',@sku,'FORBIDDEN',SYSUTCDATETIME());`));
  });
  const second=await store.createDataAudit(a.tenant,user);assert.notEqual(second.scanId,audit.scanId);
  for(let i=0;i<2;i++){
    const job=await store.claimCollection();await store.startCollection(job);
    if(job.DataType==='licenses')await store.checkpointCollection(job,license,null);
    else await store.checkpointCollection(job,[],null,{code:'missingAccess',missingAccess:true});
  }
  assert.equal((await store.getDataAudit(a.tenant,second.scanId)).audit.Status,'partial');
  assert.equal((await store.getLicenseRows(a.tenant,audit.scanId,'licenseAssignments',1,'')).total,1,'A new run overwrote old evidence.');
  assert.equal(await store.claimCollection(),undefined);
  console.log('PASS: real SQL run creation, timestamped typed evidence, paging checkpoints/replay, stale lease denial, RLS read/write isolation, partial completion and independent snapshots.');
}finally{
  for(const f of fixtures)await withOrganization(f.org,async t=>{
    await req(t,f).query(`IF EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName<>N'Audit licensing disposable test')
      THROW 51000,'Fixture ownership mismatch.',1;
      DELETE dbo.AuditCollectionJobs WHERE OrganizationId=@org;
      DELETE app.AuditLicenseAssignments WHERE OrganizationId=@org;
      DELETE app.AuditLicenses WHERE OrganizationId=@org;
      DELETE app.AuditCollections WHERE OrganizationId=@org;
      DELETE app.DataAudits WHERE OrganizationId=@org;
      DELETE app.ScanFindings WHERE OrganizationId=@org;
      DELETE app.ScanRuns WHERE OrganizationId=@org;
      DELETE app.TenantRegistrations WHERE OrganizationId=@org;
      DELETE security.EntraConnections WHERE OrganizationId=@org AND TenantId=@tenant;
      DELETE app.Organizations WHERE OrganizationId=@org AND DisplayName=N'Audit licensing disposable test';`);
  });
  await pool.request().input('Backend',sql.VarChar(8),prior).query('UPDATE dbo.ScanStorageCutover SET Backend=@Backend WHERE Id=1;');
  await pool.close();
}
