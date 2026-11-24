// Uses disposable workspaces and a short-lived viewer session. No collector is invoked.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {hashPassword,newToken,tokenHash} from '../apps/api/dist/src/auth/passwords.js';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';

const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql');
const base='https://nso-audit-dev-compare.azurewebsites.net/api';
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||process.env.SQL_DATABASE!=='nso-audit-dev'||
  process.env.SQL_SERVER!=='nso-audit-dev-257f10d8.database.windows.net')
  throw new Error('Set explicit Dev SQL targets and CONFIRM_DEV_WRITE_TEST=yes.');
const pool=await getSqlPool();
const user=randomUUID(),session=newToken(),email=`compare-${user}@example.invalid`;
const workspace=()=>({org:randomUUID(),tenant:randomUUID()});
const own=workspace(),other=workspace(),baseline=randomUUID(),comparison=randomUUID(),unrelated=randomUUID();

async function seed({org,tenant},scans,member){
  await withOrganization(org,async tx=>{
    const request=()=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org)
      .input('tenant',sql.UniqueIdentifier,tenant).input('user',sql.UniqueIdentifier,user);
    await request().query(`
      INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable Compare test');
      INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Disposable Compare test');
      INSERT security.EntraConnections(OrganizationId,TenantId) VALUES(@org,@tenant);
      ${member?"INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,'viewer');":''}`);
    for(const [scan,units] of scans){
      const entity=JSON.stringify({rowKey:scan,createdAt:new Date().toISOString(),status:'complete',auditScope:'tenant'});
      await request().input('scan',sql.UniqueIdentifier,scan).input('entity',sql.NVarChar(sql.MAX),entity)
        .input('policy',sql.NVarChar(sql.MAX),JSON.stringify({conditions:{enabled:units>1}}))
        .input('units',sql.Int,units).query(`
          INSERT app.ScanRuns(OrganizationId,TenantId,ScanId,EntityJson) VALUES(@org,@tenant,@scan,@entity);
          INSERT app.DataAudits(OrganizationId,TenantId,ScanId,Scope,Status,InitiatedBy,CollectorVersion)
            VALUES(@org,@tenant,@scan,'tenant','complete',@user,'compare-fixture');
          INSERT app.AuditCollections(OrganizationId,TenantId,ScanId,DataType,Status,RecordCount)
            VALUES(@org,@tenant,@scan,'licenses','complete',1),(@org,@tenant,@scan,'conditionalAccess','complete',1);
          INSERT app.AuditLicenses(OrganizationId,TenantId,ScanId,SourceId,SkuId,SkuPartNumber,EnabledUnits,CollectedAtUtc)
            VALUES(@org,@tenant,@scan,'compare-test','00000000-0000-4000-8000-000000000001','COMPARE_TEST',@units,SYSUTCDATETIME());
          INSERT app.AuditConditionalAccessPolicies(OrganizationId,TenantId,ScanId,SourceId,SourceJson,CollectedAtUtc)
            VALUES(@org,@tenant,@scan,'compare-test',@policy,SYSUTCDATETIME());`);
    }
  });
}

const call=(path,org=own.org)=>fetch(base+path,{
  headers:{Authorization:`Bearer ${session}`,'X-Nso-Organization-Id':org},signal:AbortSignal.timeout(60_000),
});
const comparisonPath=(against,dataset='')=>'/me/audit-compare?'+new URLSearchParams({
  baseline,comparison:against,...(dataset?{dataset}:{}),
});

try{
  await pool.request().input('user',sql.UniqueIdentifier,user).input('email',sql.NVarChar(254),email)
    .input('hash',sql.NVarChar(512),await hashPassword(newToken())).input('token',sql.Char(64),tokenHash(session)).query(`
      INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt)
        VALUES(@user,@email,@email,'Disposable Compare test',@hash,SYSUTCDATETIME());
      INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt) VALUES(@token,@user,DATEADD(minute,10,SYSUTCDATETIME()));`);
  await seed(own,[[baseline,1],[comparison,2]],true);
  await seed(other,[[unrelated,3]],false);
  const history=await call('/me/audit-compare/history');
  assert.equal(history.status,200);
  assert.deepEqual(new Set((await history.json()).scans.map(scan=>scan.scanId.toLowerCase())),new Set([baseline,comparison]));
  const response=await call(comparisonPath(comparison,'licenses'));
  assert.equal(response.status,200);
  const {differences,records}=await response.json();
  assert.equal(differences,1);
  assert.equal(records[0]?.status,'Changed');
  assert.deepEqual(records[0]?.changes.map(({path,before,after})=>({path,before:String(before),after:String(after)})),
    [{path:'/EnabledUnits',before:'1',after:'2'}]);
  const policy=await call(comparisonPath(comparison,'conditionalAccess'));
  assert.equal(policy.status,200);
  assert.deepEqual((await policy.json()).records[0]?.changes,[{path:'/Source/conditions/enabled',before:false,after:true}]);
  const summary=await call(comparisonPath(comparison,'conditionalAccess')+'&summary=true');
  assert.equal(summary.status,200);
  assert.deepEqual(await summary.json(),{differences:1,records:1});
  assert.equal((await call(comparisonPath(comparison,'licenseAssignments'))).status,409);
  assert.equal((await call(comparisonPath(unrelated))).status,404);
  assert.equal((await call('/me/audit-compare/history',other.org)).status,403);
  console.log('PASS: live Compare history, licensing and Conditional Access deltas, dataset summary, incomplete evidence, and workspace isolation.');
}finally{
  try{
    for(const {org} of [own,other])await withOrganization(org,tx=>new sql.Request(tx)
      .input('org',sql.UniqueIdentifier,org).query(`
        DELETE app.AuditLicenses WHERE OrganizationId=@org;
        DELETE app.AuditConditionalAccessPolicies WHERE OrganizationId=@org;
        DELETE app.AuditCollections WHERE OrganizationId=@org;
        DELETE app.DataAudits WHERE OrganizationId=@org;
        DELETE app.ScanRuns WHERE OrganizationId=@org;
        DELETE security.Memberships WHERE OrganizationId=@org;
        DELETE security.EntraConnections WHERE OrganizationId=@org;
        DELETE security.CustomerDirectory WHERE OrganizationId=@org;
        DELETE app.Organizations WHERE OrganizationId=@org;`));
    await pool.request().input('user',sql.UniqueIdentifier,user).query(`
      DELETE identitydata.Sessions WHERE UserId=@user;
      DELETE identitydata.Users WHERE UserId=@user;`);
    console.log('Removed disposable Compare test data.');
  }finally{await pool.close();}
}
