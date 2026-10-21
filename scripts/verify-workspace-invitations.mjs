// Isolated Dev SQL regression. No email is sent; all fixture data is removed in finally.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {getSqlPool,withOrganization} from '../apps/api/dist/src/storage/sql.js';
import {hashPassword,newToken,tokenHash} from '../apps/api/dist/src/auth/passwords.js';
import {validateCustomerInput} from '../apps/api/dist/src/management/customerInput.js';
import * as store from '../apps/api/dist/src/management/customerStore.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||process.env.SQL_DATABASE!=='nso-audit-dev'||process.env.SQL_SERVER!=='nso-audit-dev-257f10d8.database.windows.net')throw new Error('Explicit approved Dev SQL targets required.');
const claims=JSON.parse(Buffer.from((await new AzureCliCredential().getToken('https://database.windows.net/.default')).token.split('.')[1],'base64url').toString('utf8'));
const actor={tenantId:claims.tid,objectId:claims.oid},org=randomUUID(),company=`Invitation fixture ${org}`;
const contacts=['new','existing','expired','resend','removed','failed','unverified'].map(label=>({id:randomUUID(),displayName:`Fixture ${label}`,email:`invite-${label}-${org}@example.invalid`,role:'viewer'}));
const password='Long invitation Password1!',originalHash=await hashPassword(password),pool=await getSqlPool();
const admin=()=>pool.request().input('TenantId',sql.UniqueIdentifier,actor.tenantId).input('ObjectId',sql.UniqueIdentifier,actor.objectId);
const accept=(token,passwordHash=null,session=null)=>pool.request().input('TokenHash',sql.Char(64),tokenHash(token)).input('PasswordHash',sql.NVarChar(512),passwordHash).input('SessionHash',sql.Char(64),session).execute('security.AuthAcceptInvitation');
const inspect=token=>pool.request().input('TokenHash',sql.Char(64),tokenHash(token)).execute('security.AuthInspectInvitation');
const issue=async(index,delivered=true)=>{
  const token=newToken();
  await admin().input('OrganizationId',sql.UniqueIdentifier,org).input('ContactId',sql.UniqueIdentifier,contacts[index].id).input('TokenHash',sql.Char(64),tokenHash(token)).execute('security.ManagementInviteContact');
  await admin().input('TokenHash',sql.Char(64),tokenHash(token)).input('Succeeded',sql.Bit,delivered).execute('security.ManagementInvitationDelivery');
  return token;
};
let created=false;
try{
  let customer=await store.saveCustomer(actor,org,validateCustomerInput({profile:{companyName:company,primaryContactName:'Fixture',primaryContactEmail:contacts[0].email},users:contacts},true),true);created=true;
  for(const index of [1,6])await pool.request().input('email',sql.NVarChar(254),contacts[index].email).input('hash',sql.NVarChar(512),originalHash).input('verified',sql.Bit,index===1).query(`INSERT identitydata.Users(Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt) VALUES(@email,@email,'Fixture',@hash,CASE WHEN @verified=1 THEN SYSUTCDATETIME() ELSE NULL END);`);
  const first=await issue(0);
  assert.equal((await inspect(first)).recordset[0].NeedsPassword,true);
  assert.equal((await pool.request().input('org',sql.UniqueIdentifier,org).query('SELECT COUNT(*) AS n FROM security.Memberships WHERE OrganizationId=@org')).recordset[0].n,0);
  await assert.rejects(()=>accept(first),error=>error.number===51016);
  await accept(first,originalHash);await assert.rejects(()=>accept(first,originalHash),error=>error.number===51010);
  const account=(await pool.request().input('email',sql.NVarChar(254),contacts[0].email).execute('security.AuthLookup')).recordset[0];
  const otherSession=tokenHash(newToken());
  await pool.request().input('UserId',sql.UniqueIdentifier,account.UserId).input('ExpectedHash',sql.NVarChar(512),originalHash).input('SessionHash',sql.Char(64),otherSession).execute('security.AuthLogin');
  const existing=await issue(1);assert.equal((await inspect(existing)).recordset[0].NeedsPassword,false);
  const differentHash=await hashPassword('Different Password1!');
  await assert.rejects(()=>accept(existing,differentHash),error=>error.number===51015);
  await assert.rejects(()=>accept(existing,null,otherSession),error=>error.number===51015);
  const existingUser=(await pool.request().input('Email',sql.NVarChar(254),contacts[1].email).execute('security.AuthLookup')).recordset[0];
  const existingSession=tokenHash(newToken());
  await pool.request().input('UserId',sql.UniqueIdentifier,existingUser.UserId).input('ExpectedHash',sql.NVarChar(512),originalHash).input('SessionHash',sql.Char(64),existingSession).execute('security.AuthLogin');
  await accept(existing,await hashPassword('Different Password1!'),existingSession);
  assert.equal((await pool.request().input('email',sql.NVarChar(254),contacts[1].email).execute('security.AuthLookup')).recordset[0].PasswordHash,originalHash);
  const expired=await issue(2);await pool.request().input('hash',sql.Char(64),tokenHash(expired)).query('UPDATE identitydata.WorkspaceInvitations SET ExpiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE TokenHash=@hash');
  await assert.rejects(()=>accept(expired,originalHash),error=>error.number===51010);
  const replaced=await issue(3);
  await assert.rejects(()=>issue(3),error=>error.number===51014);
  await pool.request().input('hash',sql.Char(64),tokenHash(replaced)).query('UPDATE identitydata.WorkspaceInvitations SET CreatedAt=DATEADD(minute,-2,SYSUTCDATETIME()) WHERE TokenHash=@hash');
  const replacement=await issue(3);await assert.rejects(()=>accept(replaced,originalHash),error=>error.number===51010);assert.equal((await inspect(replacement)).recordset.length,1);
  const removed=await issue(4),failed=await issue(5,false),unverified=await issue(6);
  await assert.rejects(()=>accept(failed,originalHash),error=>error.number===51010);
  await accept(unverified,originalHash);
  customer=await store.getCustomer(actor,org);
  const next=customer.users.filter(user=>user.id!==contacts[4].id).map(({id,displayName,email,role})=>({id,displayName,email,role}));
  await store.saveCustomer(actor,org,validateCustomerInput({profile:customer.profile,users:next,version:customer.version},false),false);
  await assert.rejects(()=>accept(removed,originalHash),error=>error.number===51010);
  customer=await store.getCustomer(actor,org);
  next.find(user=>user.id===contacts[3].id).role='owner';
  await store.saveCustomer(actor,org,validateCustomerInput({profile:customer.profile,users:next,version:customer.version},false),false);
  await assert.rejects(()=>accept(replacement,originalHash),error=>error.number===51010);
  await assert.rejects(()=>pool.request().query(`EXECUTE AS USER=N'nso_api_runtime'; BEGIN TRY SELECT TokenHash FROM identitydata.WorkspaceInvitations; REVERT; END TRY BEGIN CATCH REVERT; THROW; END CATCH;`));
  if(process.env.INVITATION_TEST_API_BASE_URL){
    const base=process.env.INVITATION_TEST_API_BASE_URL;
    if(base!=='https://nso-audit-dev-api-flex.azurewebsites.net/api')throw new Error('Approved Dev API required.');
    const call=async(action,body,session)=>{
      const response=await fetch(`${base}/account/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session}`}:{})},body:JSON.stringify(body)});
      return{status:response.status,body:await response.json()};
    };
    const live=await issue(5);
    assert.equal((await call('invitation',{token:live})).body.needsPassword,true);
    assert.equal((await call('accept-invitation',{token:live,password:'weak'})).status,400);
    assert.equal((await call('accept-invitation',{token:live,password,role:'owner',organizationId:randomUUID()})).status,200);
    assert.equal((await call('accept-invitation',{token:live,password})).status,400);
    const login=await call('login',{email:contacts[5].email,password});assert.equal(login.status,200);
    const sessionResponse=await fetch(`${base}/account/session`,{headers:{Authorization:`Bearer ${login.body.token}`}});
    const sessionBody=await sessionResponse.json();assert.equal(sessionBody.workspaces[0].id.toLowerCase(),org);assert.equal(sessionBody.workspaces[0].role,'viewer');
    const denied=await fetch(`${base}/management/customers/${org}/contacts/${contacts[5].id}/invite`,{method:'POST',headers:{Authorization:`Bearer ${login.body.token}`,'Content-Type':'application/json'},body:'{}'});
    assert.equal(denied.status,401);
    await pool.request().input('org',sql.UniqueIdentifier,org).input('contact',sql.UniqueIdentifier,contacts[0].id).query('UPDATE identitydata.WorkspaceInvitations SET CreatedAt=DATEADD(minute,-2,SYSUTCDATETIME()) WHERE OrganizationId=@org AND ContactId=@contact');
    const existingLive=await issue(0);
    assert.equal((await call('invitation',{token:existingLive})).body.needsPassword,false);
    assert.equal((await call('accept-invitation',{token:existingLive,password})).status,401);
    assert.equal((await call('accept-invitation',{token:existingLive},login.body.token)).status,401);
    const originalLogin=await call('login',{email:contacts[0].email,password});assert.equal(originalLogin.status,200);
    assert.equal((await call('accept-invitation',{token:existingLive},originalLogin.body.token)).status,200);
    console.log('PASS: live HTTP invitation inspection, password policy, activation/login, forged-role isolation, replay rejection, staff denial and exact existing-account session.');
  }
  await admin().input('UserId',sql.UniqueIdentifier,account.UserId).input('ConfirmationEmail',sql.NVarChar(254),contacts[0].email)
    .input('EmailBucketHash',sql.Char(64),tokenHash(`email:${contacts[0].email}`)).execute('security.ManagementDeleteAccount');
  assert.equal((await pool.request().input('email',sql.NVarChar(254),contacts[0].email).query('SELECT COUNT(*) AS n FROM identitydata.WorkspaceInvitations WHERE NormalizedEmail=@email')).recordset[0].n,0);
  console.log('PASS: invitation verification/membership, existing-account sign-in and password preservation, replay/expiry/resend, failed delivery, contact removal/role change, unverified onboarding and private-token permissions.');
}finally{
  if(created)await withOrganization(org,async transaction=>{
    await new sql.Request(transaction).input('org',sql.UniqueIdentifier,org).input('company',sql.NVarChar(200),company).query(`
      IF NOT EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName=@company) THROW 51000,'Fixture ownership mismatch.',1;
      DELETE identitydata.WorkspaceInvitations WHERE OrganizationId=@org;
      DELETE security.Memberships WHERE OrganizationId=@org;
      DELETE identitydata.AccountTokens WHERE UserId IN (SELECT UserId FROM identitydata.Users WHERE NormalizedEmail LIKE 'invite-%-'+CONVERT(nvarchar(36),@org)+'@example.invalid');
      DELETE identitydata.Sessions WHERE UserId IN (SELECT UserId FROM identitydata.Users WHERE NormalizedEmail LIKE 'invite-%-'+CONVERT(nvarchar(36),@org)+'@example.invalid');
      DELETE identitydata.Users WHERE NormalizedEmail LIKE 'invite-%-'+CONVERT(nvarchar(36),@org)+'@example.invalid';
      DELETE app.CustomerContacts WHERE OrganizationId=@org;
      DELETE app.CustomerProfiles WHERE OrganizationId=@org;
      DELETE app.AuditEvents WHERE OrganizationId=@org;
      DELETE security.CustomerDirectory WHERE OrganizationId=@org;
      DELETE app.Organizations WHERE OrganizationId=@org;`);
  });
  await pool.close();console.log('Disposable invitation fixture removed.');
}
