// Integration check against an initialized Dev database using isolated, temporary organizations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { getSqlPool,withOrganization } from '../apps/api/dist/src/storage/sql.js';
import * as store from '../apps/api/dist/src/storage/sqlTenantStore.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes') throw new Error('Set CONFIRM_DEV_WRITE_TEST=yes for isolated Dev write tests.');
const fixtures=[{organizationId:randomUUID(),tenantId:randomUUID()},{organizationId:randomUUID(),tenantId:randomUUID()}];
const baseline={baselineId:'integration-test',score:50,coverage:100,assessedWeight:1,applicableWeight:1,controls:[]};
const finding={checkId:'integration-test',title:'Integration test',status:'pass',detail:'Temporary fixture',evidence:{nested:{value:1}}};
const pool=await getSqlPool();
try {
  for(const fixture of fixtures) await withOrganization(fixture.organizationId,async(transaction)=>{
    await new sql.Request(transaction).input('org',sql.UniqueIdentifier,fixture.organizationId).input('tenant',sql.UniqueIdentifier,fixture.tenantId)
      .query(`INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,N'Migration write test');
        INSERT security.EntraConnections(TenantId,OrganizationId) VALUES(@tenant,@org);`);
  });
  const [a,b]=fixtures;
  await assert.rejects(()=>store.saveStarterScan(a.tenantId,randomUUID(),[finding,finding],baseline));
  assert.equal((await store.listTenantScans(a.tenantId)).length,0,'Failed write left a partial scan.');
  assert.equal((await store.getTenantBootstrap(a.tenantId)).latestScan,null);
  await store.saveAccessCheck(a.tenantId,randomUUID(),true,true);
  const saved=await store.saveStarterScan(a.tenantId,randomUUID(),[finding],baseline);
  const loaded=await store.getStarterScan(a.tenantId,saved.scanId);
  assert.deepEqual(loaded.findings,[finding]);
  assert.deepEqual(loaded.baseline,baseline);
  assert.equal((await store.getTenantBootstrap(a.tenantId)).latestScan.scanId,saved.scanId);
  assert.equal((await store.listTenantScans(a.tenantId)).length,1);
  assert.equal(await store.getStarterScan(b.tenantId,saved.scanId),null,'Another customer could read this scan.');
  assert.equal((await store.listTenantScans(b.tenantId)).length,0);
  console.log('PASS: access-check merge, scan/evidence write and read, latest report, history, atomic failure rollback and cross-customer denial.');
} finally {
  for(const fixture of fixtures) await withOrganization(fixture.organizationId,async(transaction)=>{
    await new sql.Request(transaction).input('org',sql.UniqueIdentifier,fixture.organizationId).input('tenant',sql.UniqueIdentifier,fixture.tenantId)
      .query(`IF EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName<>N'Migration write test')
          THROW 51000,'Fixture ownership mismatch; refusing cleanup.',1;
        DELETE app.ScanFindings WHERE OrganizationId=@org;
        DELETE app.ScanRuns WHERE OrganizationId=@org;
        DELETE app.TenantRegistrations WHERE OrganizationId=@org;
        DELETE security.EntraConnections WHERE OrganizationId=@org AND TenantId=@tenant;
        DELETE app.Organizations WHERE OrganizationId=@org AND DisplayName=N'Migration write test';`);
  });
  await pool.close();
  console.log('Temporary write-test organizations removed.');
}
