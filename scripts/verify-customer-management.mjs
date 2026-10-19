import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';
import {validateCustomerInput} from '../apps/api/dist/src/management/customerInput.js';
import * as store from '../apps/api/dist/src/management/customerStore.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes')throw new Error('Explicit Dev write-test confirmation required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const claims=JSON.parse(Buffer.from(token.token.split('.')[1],'base64url').toString('utf8'));
const actor={tenantId:claims.tid,objectId:claims.oid},badActor={tenantId:claims.tid,objectId:randomUUID()};
const organizationId=randomUUID(),name=`Management test ${organizationId}`;
const input=validateCustomerInput({profile:{companyName:name,primaryContactName:'Test contact',primaryContactEmail:`qa-${organizationId}@example.invalid`},
  users:[{id:randomUUID(),displayName:'Test contact',email:`qa-${organizationId}@example.invalid`,role:'owner'}]},true);
const pool=await getSqlPool();
let created=false;
try{
  await assert.rejects(()=>store.listCustomers(badActor),error=>error.number===51003);
  await assert.rejects(()=>store.saveCustomer(badActor,organizationId,input,true),error=>error.number===51003);
  const saved=await store.saveCustomer(actor,organizationId,input,true);created=true;
  assert.equal(saved.profile.microsoftTenantId,'');assert.deepEqual(saved.profile.subscriptionIds,[]);assert.equal(saved.users.length,1);
  assert.ok((await store.listCustomers(actor)).some(row=>row.organizationId===organizationId));
  await assert.rejects(()=>store.getCustomer(badActor,organizationId),error=>error.number===51003);
  const revised={...input,profile:{...input.profile,notes:'Updated'},version:saved.version};
  const updated=await store.saveCustomer(actor,organizationId,revised,false);
  assert.notEqual(updated.version,saved.version);
  await assert.rejects(()=>store.saveCustomer(actor,organizationId,revised,false),error=>error.number===51001);
  assert.equal((await store.getCustomer(actor,organizationId)).profile.notes,'Updated');
  const grants=await pool.request().input('org',sql.UniqueIdentifier,organizationId).query(`
    SELECT (SELECT COUNT(*) FROM security.Memberships WHERE OrganizationId=@org) AS Memberships,
      (SELECT COUNT(*) FROM security.EntraConnections WHERE OrganizationId=@org) AS Connections;`);
  assert.equal(grants.recordset[0].Memberships,0);assert.equal(grants.recordset[0].Connections,0);
  await withOrganization(randomUUID(),async transaction=>{
    const result=await new sql.Request(transaction).input('org',sql.UniqueIdentifier,organizationId)
      .query(`EXECUTE AS USER=N'nso_api_runtime'; SELECT COUNT(*) AS Visible FROM app.CustomerProfiles WHERE OrganizationId=@org; REVERT;`);
    assert.equal(result.recordset[0].Visible,0);
  });
  console.log('PASS: non-Microsoft create/read/update, roster persistence, unauthorized management denial, optimistic concurrency, RLS isolation and no automatic access grants.');
}finally{
  if(created)await withOrganization(organizationId,async transaction=>{
    await new sql.Request(transaction).input('org',sql.UniqueIdentifier,organizationId).input('name',sql.NVarChar(200),name)
      .query(`IF NOT EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName=@name)
        THROW 51000,'Fixture ownership mismatch; refusing cleanup.',1;
        DELETE app.CustomerContacts WHERE OrganizationId=@org;
        DELETE app.CustomerProfiles WHERE OrganizationId=@org;
        DELETE app.AuditEvents WHERE OrganizationId=@org;
        DELETE security.CustomerDirectory WHERE OrganizationId=@org;
        DELETE app.Organizations WHERE OrganizationId=@org;`);
  });
  await pool.close();console.log('Temporary customer-management fixture removed.');
}
