// Transactional Dev-only validation. Every fixture and optional migration is rolled back.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql');const {AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes')throw new Error('Set CONFIRM_DEV_WRITE_TEST=yes for the selected Dev database.');
if(!process.env.SQL_SERVER||!process.env.SQL_DATABASE)throw new Error('Set SQL_SERVER and SQL_DATABASE.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
try{
  if(process.argv.includes('--validate-migration')||process.argv.includes('--validate-audit-access')||process.argv.includes('--validate-contact-revocation')){
    const migrations=process.argv.includes('--validate-contact-revocation')?['009_contact_access_revocation.sql']:process.argv.includes('--validate-audit-access')?['008_email_audit_access.sql','009_contact_access_revocation.sql']:['007_customer_accounts.sql','008_email_audit_access.sql','009_contact_access_revocation.sql'];
    for(const migration of migrations){
      const source=await readFile(new URL(`../database/migrations/${migration}`,import.meta.url),'utf8');
      for(const batch of source.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await new sql.Request(tx).batch(batch);
    }
  }
  const suffix=randomUUID(),email=`account-${suffix}@example.invalid`;
  const request=()=>new sql.Request(tx);
  const invoke=async(name,inputs={})=>{const r=request();for(const [key,value] of Object.entries(inputs))r.input(key,value);return r.execute(`security.${name}`);};
  const verifyHash='a'.repeat(64),sessionHash='b'.repeat(64),resetHash='c'.repeat(64);
  // Validate using the runtime's exact grants, not deployment-owner privileges.
  await request().query("EXECUTE AS USER='nso_api_runtime';");
  const created=await invoke('AuthRegister',{Email:email,DisplayName:'Disposable account',PasswordHash:'fixture-hash',TokenHash:verifyHash});
  assert.equal(created.recordset.length,1);
  const duplicate=await invoke('AuthRegister',{Email:email,DisplayName:'Attacker',PasswordHash:'replacement',TokenHash:'d'.repeat(64)});
  assert.equal(duplicate.recordset,undefined);
  const lookup=await invoke('AuthLookup',{Email:email});const user=lookup.recordset[0];assert.equal(user.PasswordHash,'fixture-hash');
  const denied=await invoke('AuthLogin',{UserId:user.UserId,ExpectedHash:'fixture-hash',SessionHash:sessionHash});assert.equal(denied.recordset[0].Created,0);
  await invoke('AuthCompleteToken',{TokenHash:verifyHash,Purpose:'verifyEmail'});
  const login=await invoke('AuthLogin',{UserId:user.UserId,ExpectedHash:'fixture-hash',SessionHash:sessionHash});assert.equal(login.recordset[0].Created,1);
  const current=await invoke('AuthSession',{TokenHash:sessionHash});assert.equal(current.recordset[0].Email,email);assert.equal(current.recordsets[1].length,0);
  const badSession=await invoke('AuthSession',{TokenHash:'e'.repeat(64)});assert.equal(badSession.recordset.length,0);
  await request().query('REVERT;');
  const org=randomUUID(),otherOrg=randomUUID(),tenant=randomUUID(),staffTenant=randomUUID(),staffObject=randomUUID();
  await request().input('org',org).input('tenant',tenant).input('user',user.UserId).input('email',email).input('staffTenant',staffTenant).input('staffObject',staffObject).query(`
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable workspace');
    INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Disposable workspace');
    INSERT security.EntraConnections(OrganizationId,TenantId) VALUES(@org,@tenant);
    INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,'viewer');
    INSERT app.CustomerContacts(OrganizationId,ContactId,DisplayName,Email,IntendedRole) VALUES(@org,NEWID(),'Fixture',@email,'viewer');
    INSERT identitydata.ManagementUsers(EntraTenantId,EntraObjectId,Role) VALUES(@staffTenant,@staffObject,'setupAdmin');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    EXECUTE AS USER='nso_api_runtime';`);
  const allowed=await invoke('AuthResolveAudit',{TokenHash:sessionHash,OrganizationId:org});assert.equal(allowed.recordset[0].TenantId.toLowerCase(),tenant);assert.equal(allowed.recordset[0].Role,'viewer');
  const wrongOrg=await invoke('AuthResolveAudit',{TokenHash:sessionHash,OrganizationId:otherOrg});assert.equal(wrongOrg.recordset,undefined);
  await request().query('REVERT;');
  const revision=(await request().input('org',org).query('SELECT CONVERT(varchar(18),Revision,1) AS Version FROM security.CustomerDirectory WHERE OrganizationId=@org')).recordset[0].Version;
  await request().query("EXECUTE AS USER='nso_api_runtime';");
  await invoke('ManagementSaveCustomer',{TenantId:staffTenant,ObjectId:staffObject,OrganizationId:org,DisplayName:'Disposable workspace',PrimaryContactEmail:email,ProfileJson:'{}',ContactsJson:'[]',Create:false,ExpectedVersion:revision});
  const removed=await invoke('AuthResolveAudit',{TokenHash:sessionHash,OrganizationId:org});assert.equal(removed.recordset,undefined);

  await invoke('AuthIssueToken',{Email:email,Purpose:'resetPassword',TokenHash:resetHash});
  await invoke('AuthCompleteToken',{TokenHash:resetHash,Purpose:'resetPassword',PasswordHash:'new-fixture-hash'});
  const revoked=await invoke('AuthSession',{TokenHash:sessionHash});assert.equal(revoked.recordset.length,0);
  const oldPassword=await invoke('AuthLogin',{UserId:user.UserId,ExpectedHash:'fixture-hash',SessionHash:'f'.repeat(64)});assert.equal(oldPassword.recordset[0].Created,0);
  const bucket=suffix.replaceAll('-','').padEnd(64,'0');
  assert.equal((await invoke('AuthThrottle',{BucketHash:bucket,Limit:1})).recordset[0].Allowed,true);
  assert.equal((await invoke('AuthThrottle',{BucketHash:bucket,Limit:1})).recordset[0].Allowed,false);
  const deniedOrg=await invoke('AuthResolveAudit',{TokenHash:sessionHash,OrganizationId:randomUUID()});assert.equal(deniedOrg.recordset,undefined);
  await request().query('REVERT;');
  // Reuse/expiry checks separately so expected SQL THROW does not abort the fixture transaction.
  assert.equal((await request().input('hash',resetHash).query('SELECT COUNT(*) AS n FROM identitydata.AccountTokens WHERE TokenHash=@hash AND UsedAt IS NOT NULL')).recordset[0].n,1);
  assert.equal((await request().input('email',email).query('SELECT COUNT(*) AS n FROM security.Memberships m JOIN identitydata.Users u ON u.UserId=m.UserId WHERE u.Email=@email')).recordset[0].n,0);
  console.log('Passed runtime registration, duplicate protection, verification gating, session denial, reset revocation, password-race protection, rate limiting workspace membership isolation, revoked membership denial and absence of automatic memberships.');
}finally{
  await new sql.Request(tx).query('REVERT;').catch(()=>{});
  await tx.rollback().catch(()=>{});await pool.close();
}
console.log('Rolled back all validation fixtures and any candidate migration.');
