// Live Dev API/browser verification using disposable, synthetic fixtures. No email is sent.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {newToken,tokenHash} from '../apps/api/dist/src/auth/passwords.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
const {SQL_SERVER,SQL_DATABASE,QUESTIONNAIRE_TEST_API_BASE_URL,QUESTIONNAIRE_TEST_PORTAL_URL}=process.env;
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!SQL_SERVER||!SQL_DATABASE||!QUESTIONNAIRE_TEST_API_BASE_URL)
  throw new Error('Set explicit Dev SQL/API targets and CONFIRM_DEV_WRITE_TEST=yes.');
const api=new URL(QUESTIONNAIRE_TEST_API_BASE_URL);
if(api.protocol!=='https:'||!api.hostname.includes('dev'))throw new Error('A Dev HTTPS API is required.');
if(QUESTIONNAIRE_TEST_PORTAL_URL&&new URL(QUESTIONNAIRE_TEST_PORTAL_URL).protocol!=='https:')throw new Error('HTTPS portal required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:SQL_SERVER,database:SQL_DATABASE,
  authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},
  options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const org=randomUUID(),other=randomUUID(),user=randomUUID(),session=newToken();
const request=()=>pool.request().input('org',sql.UniqueIdentifier,org).input('other',sql.UniqueIdentifier,other)
  .input('user',sql.UniqueIdentifier,user).input('hash',sql.Char(64),tokenHash(session));
const call=async(path='',method='GET',body,workspace=org,authenticated=true)=>{
  const response=await fetch(`${api.href.replace(/\/$/,'')}/me/questionnaires${path}`,{method,headers:{
    ...(authenticated?{Authorization:`Bearer ${session}`} :{}),'X-Nso-Organization-Id':workspace,
    ...(body?{'Content-Type':'application/json'}:{}),
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
};
let browser;
try{
  await request().query(`
    INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt)
      VALUES(@user,CONVERT(nvarchar(36),@user)+'@example.invalid',CONVERT(nvarchar(36),@user)+'@example.invalid','Disposable questionnaire user','unusable-fixture',SYSUTCDATETIME());
    INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt) VALUES(@hash,@user,DATEADD(hour,1,SYSUTCDATETIME()));
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable questionnaire client');
    INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Disposable questionnaire client');
    INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,'contributor');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@other;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@other,'Disposable neighboring client');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@other,@other,'backups-v1');
    INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass) VALUES(@other,@other,'Neighbor servers','SRV');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  assert.equal((await call('', 'GET',undefined,org,false)).status,401);
  assert.equal((await call('','GET',undefined,other)).status,403);
  assert.equal((await call(`/${other}`)).status,404);
  const created=await call('','POST',{scopeName:'Disposable database backup assessment',assetClass:'DB'});
  assert.equal(created.status,201,JSON.stringify(created.body));
  assert.equal(created.body.questions.length,25);
  const id=created.body.id;
  const answers=[
    {questionId:'BKP-01',questionVersion:1,state:'answered',booleanValue:true},
    {questionId:'BKP-02',questionVersion:1,state:'answered',totalInScope:10,totalCovered:8,measurementDate:'2026-10-21',measurementSource:'Synthetic backup console'},
    {questionId:'BKP-04',questionVersion:1,state:'answered',selectedOptionId:'daily'},
    {questionId:'BKP-15',questionVersion:1,state:'never'},
    {questionId:'BKP-06',questionVersion:1,state:'notApplicable',justification:'Synthetic validation scope'},
  ];
  const saved=await call(`/${id}`,'PUT',{revision:0,answers});assert.equal(saved.status,200,JSON.stringify(saved.body));
  const reopened=await call(`/${id}`);assert.equal(reopened.status,200);assert.equal(reopened.body.revision,1);
  assert.deepEqual(reopened.body.answers.sort((a,b)=>a.questionId.localeCompare(b.questionId)),answers.sort((a,b)=>a.questionId.localeCompare(b.questionId)));
  assert.equal((await call(`/${id}`,'PUT',{revision:0,answers:[]})).status,409);
  assert.equal((await call(`/${id}`,'PUT',{revision:1,answers:[{...answers.find(a=>a.questionId==='BKP-02'),totalCovered:11}]})).status,400);
  assert.equal((await call(`/${id}`)).body.revision,1,'Invalid saves must roll back revision changes.');
  await request().query("UPDATE security.Memberships SET Role='viewer' WHERE OrganizationId=@org AND UserId=@user;");
  assert.equal((await call(`/${id}`)).status,200);
  assert.equal((await call(`/${id}`,'PUT',{revision:1,answers})).status,403);
  assert.equal((await call('','POST',{scopeName:'Forbidden',assetClass:'END'})).status,403);
  await request().query("UPDATE security.Memberships SET Role='contributor' WHERE OrganizationId=@org AND UserId=@user;");
  console.log('PASS: live SQL-backed create/read/save/reopen, 25 database questions, typed values, invalid-save rollback, stale revisions, viewer and cross-client denial.');
  if(QUESTIONNAIRE_TEST_PORTAL_URL){
    const {chromium}=createRequire(new URL('../package.json',import.meta.url))('@playwright/test');
    browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
    const page=await browser.newPage();
    await page.addInitScript(value=>sessionStorage.setItem('nso.customerSession',value),session);
    await page.goto(new URL('/signin',QUESTIONNAIRE_TEST_PORTAL_URL).href);
    await page.getByRole('button',{name:'Questionnaire',exact:true}).click();
    await page.getByRole('button',{name:'Open assessment'}).click();
    const strategy=page.getByRole('region',{name:'Do you have a defined backup strategy?',exact:true});
    await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('false');
    await page.getByRole('button',{name:'Save draft'}).click();
    await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
    await page.getByRole('button',{name:'All backup assessments'}).click();
    await page.getByRole('button',{name:'Open assessment'}).click();
    assert.equal(await strategy.getByRole('combobox',{name:'Answer',exact:true}).inputValue(),'false');
    await mkdir(new URL('../.azure/browser-results/',import.meta.url),{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL('../.azure/browser-results/questionnaire-live-dev.png',import.meta.url)),fullPage:true});
    console.log('PASS: live deployed customer browser opens, edits, saves and reopens the backup questionnaire without Microsoft consent.');
  }
  await request().query('UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE TokenHash=@hash;');
  assert.equal((await call()).status,403);
}finally{
  await browser?.close();
  try{
    for(const fixture of [org,other])await pool.request().input('org',sql.UniqueIdentifier,fixture).query(`
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
      IF EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName NOT LIKE 'Disposable %')
        THROW 51000,'Unexpected fixture ownership; cleanup refused.',1;
      DELETE app.QuestionnaireAnswerSelections WHERE OrganizationId=@org;
      DELETE app.QuestionnaireAnswers WHERE OrganizationId=@org;
      DELETE app.QuestionnaireScopes WHERE OrganizationId=@org;
      DELETE app.Assessments WHERE OrganizationId=@org;
      DELETE app.AuditEvents WHERE OrganizationId=@org;
      DELETE security.Memberships WHERE OrganizationId=@org;
      DELETE security.CustomerDirectory WHERE OrganizationId=@org;
      DELETE app.Organizations WHERE OrganizationId=@org;
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
    await request().query('DELETE identitydata.Sessions WHERE UserId=@user; DELETE identitydata.Users WHERE UserId=@user;');
    console.log('Disposable questionnaire client/user data removed. No mail sent.');
  }finally{await pool.close();}
}
