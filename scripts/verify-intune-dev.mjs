// Real Dev audit through the deployed worker. Never inject synthetic evidence into Dev.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';
import {createDataAudit,getDataAudit,getSnapshotRows} from '../apps/api/dist/src/audits/store.js';
import {datasetCatalog} from '../apps/api/dist/src/audits/catalog.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sql=require('mssql');
if(process.env.SQL_DATABASE!=='nso-audit-dev'||process.env.SQL_SERVER!=='nso-audit-dev-257f10d8.database.windows.net')
  throw new Error('This verification is restricted to the existing Dev database.');
process.env.TENANT_STORE='sql';
const tenant='fe0c1fea-bc61-42cc-b384-bad739ef3c6e',operator='28995be7-732b-47c4-a04d-f4ea51eb088e';
const pool=await getSqlPool();
try{
  const tables=Object.values(datasetCatalog).filter(s=>'parent' in s||s.table==='AuditSettingsCatalogPolicies').map(s=>s.table);
  for(const table of tables){
    const check=await pool.request().input('Table',sql.NVarChar(128),'app.'+table).query(`
      SELECT (SELECT COUNT(*) FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(@Table)) Predicates,
      (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(@Table) AND (is_disabled=1 OR is_not_trusted=1)) InvalidKeys;`);
    assert.equal(check.recordset[0].Predicates,3);assert.equal(check.recordset[0].InvalidKeys,0);
  }
  if(process.argv.includes('--start')){
    const connection=await pool.request().input('Tenant',sql.UniqueIdentifier,tenant)
      .query('SELECT OrganizationId FROM security.EntraConnections WHERE TenantId=@Tenant;');
    assert.equal(connection.recordset.length,1,'Expected existing approved Dev tenant connection.');
    const org=connection.recordset[0].OrganizationId;
    const subscription=await withOrganization(org,async t=>(await new sql.Request(t).input('Tenant',sql.UniqueIdentifier,tenant)
      .query('SELECT TOP(1) SubscriptionId FROM app.DataAudits WHERE TenantId=@Tenant AND SubscriptionId IS NOT NULL ORDER BY CreatedAtUtc DESC;')).recordset[0]?.SubscriptionId);
    assert.ok(subscription,'Existing approved subscription required.');
    console.log(JSON.stringify(await createDataAudit(tenant,operator,subscription)));
  }else{
    const scan=process.argv.find(s=>s.startsWith('--scan='))?.slice(7);
    if(scan){
      const result=await getDataAudit(tenant,scan);assert.ok(result);
      console.log(JSON.stringify({audit:result.audit,collections:result.collections.map(c=>({type:c.DataType,status:c.Status,count:c.RecordCount,error:c.ErrorCode}))},null,2));
      if(process.argv.includes('--verify-roles')){
        const collection=result.collections.find(c=>c.DataType==='roleAssignments');
        assert.equal(collection?.Status,'complete','Role collection must be complete.');
        const rows=[];let page=1;
        while(true){const evidence=await getSnapshotRows(tenant,scan,'roleAssignments',page++,'');rows.push(...evidence.rows);if(rows.length>=evidence.total)break;}
        const values=rows.map(r=>JSON.parse(r.SourceJson));
        assert.ok(values.length,'Dev verification expects existing directory assignments.');
        for(const [i,value] of values.entries()){
          assert.ok(value.roleDefinition?.displayName,'Role name missing');
          assert.equal(value.roleDefinition.id,value.roleDefinitionId);
          assert.equal(value.principal?.id,value.principalId);
          assert.equal(rows[i].DisplayName,value.roleDefinition.displayName);
        }
        console.log(JSON.stringify({roleEvidenceVerified:true,assignments:values.length,namedRoles:values.filter(v=>v.roleDefinition?.displayName).length,namedPrincipals:values.filter(v=>v.principal?.displayName).length,globalAdministratorAssignments:values.filter(v=>v.roleDefinition?.templateId==='62e90394-69f5-4237-9190-012177145e10').length}));
      }
      if(process.argv.includes('--verify-evidence')){
        assert.equal(result.audit.Status,'complete','Real collection must complete before evidence verification.');
        const load=async type=>{
          const rows=[];let page=1;
          while(true){const result=await getSnapshotRows(tenant,scan,type,page++,'');rows.push(...result.rows);if(rows.length>=result.total)return rows;}
        };
        const policies=await load('settingsCatalogPolicies'),settings=await load('settingsCatalogSettings');
        for(const policy of policies){
          const expected=JSON.parse(policy.SourceJson).settingCount;
          if(Number.isInteger(expected))assert.equal(settings.filter(r=>r.ParentSourceId===policy.SourceId).length,expected,'Setting count differs from policy source metadata.');
        }
        const definitionCount=settings.filter(r=>Array.isArray(JSON.parse(r.SourceJson).settingDefinitions)&&JSON.parse(r.SourceJson).settingDefinitions.length>0).length;
        for(const [type,source] of Object.entries(datasetCatalog).filter(([,s])=>'parent' in s)){
          const parents=await load(source.parent),rows=await load(type),parentIds=new Set(parents.map(p=>p.SourceId));
          for(const row of rows){assert.ok(parentIds.has(row.ParentSourceId));assert.ok(row.ChildSourceId);assert.ok(row.CollectedAtUtc);assert.ok(row.StoredAtUtc);}
          if(!source.relationship)assert.equal(rows.length,parents.length,'Missing full policy detail.');
        }
        await withOrganization(randomUUID(),async t=>{
          for(const table of tables){const rows=await new sql.Request(t).input('Scan',sql.UniqueIdentifier,scan).query(`SELECT SourceId FROM app.${table} WHERE ScanId=@Scan;`);assert.equal(rows.recordset.length,0,'Foreign organization read exposed Intune evidence.');}
        });
        console.log(JSON.stringify({verified:true,settings:settings.length,settingsWithDefinitions:definitionCount,policyCount:policies.length,checks:'Source setting counts, parent relationships, full policy coverage, timestamps and foreign-organization RLS'}));
      }
    }else console.log('PASS: seven Dev tables, 21 RLS predicates and enabled/trusted foreign keys.');
  }
}finally{await pool.close();}
