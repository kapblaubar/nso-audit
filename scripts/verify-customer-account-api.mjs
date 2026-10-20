// Live Dev integration test: isolated verified fixture, no emails sent, cleanup in finally.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword,newToken,tokenHash} from '../apps/api/dist/src/auth/passwords.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql');const {AzureCliCredential}=require('@azure/identity');
const {SQL_SERVER,SQL_DATABASE,ACCOUNT_TEST_API_BASE_URL}=process.env;
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!SQL_SERVER||!SQL_DATABASE||!ACCOUNT_TEST_API_BASE_URL)throw new Error('Set explicit Dev SQL/API targets and CONFIRM_DEV_WRITE_TEST=yes.');
const api=new URL(ACCOUNT_TEST_API_BASE_URL);
if(api.protocol!=='https:'||!api.hostname.includes('dev'))throw new Error('Refusing a non-Dev HTTPS API target.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:SQL_SERVER,database:SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const userId=randomUUID(),org=randomUUID(),tenant=randomUUID(),email=`api-${userId}@example.invalid`;
const password=`Aa1!${newToken()}`,nextPassword=`Bb2!${newToken()}`,reset=newToken();
const call=async(path,body,session,workspace)=>{
  const response=await fetch(`${api.href.replace(/\/$/,'')}/${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:`Bearer ${session}`} :{}),...(workspace?{'X-Nso-Organization-Id':workspace}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{status:response.status,body:await response.json()};
};
try{
  const tx=new sql.Transaction(pool);await tx.begin();
  try{
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,userId).input('email',sql.NVarChar(254),email).input('hash',sql.NVarChar(512),await hashPassword(password)).input('org',sql.UniqueIdentifier,org).input('tenant',sql.UniqueIdentifier,tenant).query(`
      INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt) VALUES(@id,@email,@email,'Disposable API fixture',@hash,SYSUTCDATETIME());
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
      INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable API workspace');
      INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Disposable API workspace');
      INSERT security.EntraConnections(OrganizationId,TenantId) VALUES(@org,@tenant);
      INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@id,'viewer');
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
    await tx.commit();
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
  assert.equal((await call('account/session')).status,401);
  const login=await call('account/login',{email,password});assert.equal(login.status,200,'Fixture login failed');const session=login.body.token;
  const me=await call('account/session',undefined,session);assert.equal(me.status,200);assert.equal(me.body.workspaces[0].id.toLowerCase(),org);
  assert.equal((await call('management/bootstrap',undefined,session)).status,403);
  assert.equal((await call('me/bootstrap',undefined,session,randomUUID())).status,403);
  assert.equal((await call('me/bootstrap',undefined,session,org)).status,200);
  assert.equal((await call('me/scans',{subscriptionId:randomUUID()},session,org)).status,403);
  await pool.request().input('Email',sql.NVarChar(254),email).input('Purpose',sql.VarChar(16),'resetPassword').input('TokenHash',sql.Char(64),tokenHash(reset)).execute('security.AuthIssueToken');
  assert.equal((await call('account/reset',{token:reset,password:nextPassword})).status,200);
  assert.equal((await call('account/session',undefined,session)).status,401);
  assert.equal((await call('account/reset',{token:reset,password:nextPassword})).status,400);
  assert.equal((await call('account/login',{email,password})).status,401);
  const next=await call('account/login',{email,password:nextPassword});assert.equal(next.status,200);
  assert.equal((await call('account/logout',{},next.body.token)).status,200);
  assert.equal((await call('account/session',undefined,next.body.token)).status,401);
  console.log('Live Dev API passed: login/session, exact membership isolation, viewer write denial, staff denial, reset/token replay protection, session revocation and logout.');
}finally{
  const cleanup=new sql.Transaction(pool);await cleanup.begin();
  try{
    await new sql.Request(cleanup).input('user',sql.UniqueIdentifier,userId).input('org',sql.UniqueIdentifier,org).input('emailBucket',sql.Char(64),tokenHash(`email:${email}`)).query(`
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
      DELETE security.Memberships WHERE UserId=@user AND OrganizationId=@org;
      DELETE security.EntraConnections WHERE OrganizationId=@org;
      DELETE security.CustomerDirectory WHERE OrganizationId=@org;
      DELETE app.Organizations WHERE OrganizationId=@org;
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
      DELETE identitydata.AccountTokens WHERE UserId=@user;
      DELETE identitydata.Sessions WHERE UserId=@user;
      DELETE identitydata.Users WHERE UserId=@user;
      DELETE security.AuthAttempts WHERE BucketHash=@emailBucket;`);
    await cleanup.commit();console.log('Removed disposable account and workspace.');
  }catch(error){await cleanup.rollback().catch(()=>{});throw error;}finally{await pool.close();}
}
