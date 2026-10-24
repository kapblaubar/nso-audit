// Synthetic Dev-only round trip through SQL, the deployed API and optionally the real browser.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {newToken,tokenHash} from '../apps/api/dist/src/auth/passwords.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
const {SQL_SERVER,SQL_DATABASE,QUESTIONNAIRE_TEST_API_BASE_URL,QUESTIONNAIRE_TEST_PORTAL_URL}=process.env;
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!SQL_SERVER||!SQL_DATABASE||!QUESTIONNAIRE_TEST_API_BASE_URL)throw new Error('Explicit Dev SQL/API targets and CONFIRM_DEV_WRITE_TEST=yes required.');
const api=new URL(QUESTIONNAIRE_TEST_API_BASE_URL);if(api.protocol!=='https:'||!api.hostname.includes('dev'))throw new Error('Dev HTTPS API required.');
if(QUESTIONNAIRE_TEST_PORTAL_URL&&new URL(QUESTIONNAIRE_TEST_PORTAL_URL).protocol!=='https:')throw new Error('HTTPS portal required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:SQL_SERVER,database:SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const org=randomUUID(),other=randomUUID(),user=randomUUID(),legacy=randomUUID(),session=newToken();let browser;
const req=()=>pool.request().input('org',sql.UniqueIdentifier,org).input('other',sql.UniqueIdentifier,other).input('user',sql.UniqueIdentifier,user).input('legacy',sql.UniqueIdentifier,legacy).input('hash',sql.Char(64),tokenHash(session));
async function call(path='',method='GET',body,workspace=org,authenticated=true){const response=await fetch(`${api.href.replace(/\/$/,'')}/me/client-assessments${path}`,{method,headers:{...(authenticated?{Authorization:`Bearer ${session}`} :{}),'X-Nso-Organization-Id':workspace,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
try{
  await req().query(`INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt) VALUES(@user,CONVERT(nvarchar(36),@user)+'@example.invalid',CONVERT(nvarchar(36),@user)+'@example.invalid','Disposable full questionnaire user','unusable-fixture',SYSUTCDATETIME());
    INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt) VALUES(@hash,@user,DATEADD(hour,1,SYSUTCDATETIME()));
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable full questionnaire client');
    INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Disposable full questionnaire client');
    INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,'contributor');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@legacy,'backups-v1');
    INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass) VALUES(@org,@legacy,'Preserved earlier backup answers','END');
    INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy) VALUES(@org,@legacy,'BKP-01',1,'yn','answered',1,@user);
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@other;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@other,'Disposable neighboring client');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@other,@other,'client-v1');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@other,@other,'Neighbor');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  assert.equal((await call('','GET',undefined,org,false)).status,401);assert.equal((await call('','GET',undefined,other)).status,403);assert.equal((await call(`/${other}`)).status,404);
  const created=await call('','POST',{name:'Disposable complete client assessment',answerOwner:'Synthetic client',reviewer:'Synthetic reviewer'});assert.equal(created.status,201,JSON.stringify(created.body));let current=created.body;
  assert.equal(current.sections.length,12);assert.equal(current.questions.length,121);assert.equal(current.templateVersion,'client-v2');
  const id=current.id;
  async function update(path,method,body){const result=await call(`/${id}${path}`,method,{revision:current.revision,...body});assert.ok([200,201].includes(result.status),JSON.stringify(result.body));current=result.body;return current;}
  const company=current.groups.find(g=>g.sectionId==='company');
  const companyAnswers=[
    {questionId:'SCP-01',questionVersion:3,state:'answered',textValue:'Synthetic company'},
    {questionId:'SCP-03.EMP',questionVersion:3,state:'answered',numberValue:5,unit:'people'},
    {questionId:'SCP-05',questionVersion:3,state:'answered',records:[{platform:'microsoft',tenant:'Synthetic tenant',domains:'example.invalid',locations:'US'},{platform:'aws',account:'123456789012'},{platform:'google',projects:'analytics'}]},
  ];
  await update(`/groups/${company.id}`,'PUT',{answers:companyAnswers});
  for(const section of current.sections.filter(s=>s.repeatable)){
    const context=Object.fromEntries(section.groupFields.map(f=>[f.id,f.type==='select'?f.options[0].id:'Synthetic '+f.label]));
    await update('/groups','POST',{sectionId:section.id,name:section.id==='backups'?'Endpoint backups':section.title+' scope',context});
  }
  const end=current.groups.find(g=>g.sectionId==='backups');
  const endpointAnswers=[{questionId:'BKP-01',questionVersion:3,state:'answered',booleanValue:true},
    {questionId:'BKP-02',questionVersion:3,state:'answered',totalInScope:100,totalCovered:80,measurementDate:'2026-10-21',measurementSource:'Synthetic backup console'},
    {questionId:'BKP-04',questionVersion:3,state:'answered',selectedOptionId:'daily'},
    {questionId:'BKP-07',questionVersion:3,state:'answered',records:[{tier:'Daily',duration:30,unit:'days',scope:'Endpoints'},{tier:'Archive',duration:1,unit:'years',scope:'Critical endpoint data'}]},
    {questionId:'BKP-10',questionVersion:3,state:'answered',selectedOptionId:'partly'},
    {questionId:'BKP-15',questionVersion:3,state:'answered',dateValue:'2026-10-20'}];
  await update(`/groups/${end.id}`,'PUT',{answers:endpointAnswers});
  await update('/groups','POST',{sectionId:'backups',name:'Database backups',context:{assetClass:'databases'}});
  const db=current.groups.find(g=>g.name==='Database backups');await update(`/groups/${db.id}`,'PUT',{answers:[{questionId:'BKP-01',questionVersion:3,state:'answered',booleanValue:false},{questionId:'BKP-DB-01',questionVersion:3,state:'unknown'}]});
  const stableRevision=current.revision;
  assert.equal((await call(`/${id}/groups/${end.id}`,'PUT',{revision:stableRevision,answers:[{questionId:'BKP-DB-01',questionVersion:3,state:'unknown'}]})).status,400);
  assert.equal((await call(`/${id}/groups/${end.id}`,'PUT',{revision:stableRevision,answers:[{questionId:'IAM-01',questionVersion:3,state:'unknown'}]})).status,400);
  assert.equal((await call(`/${id}/groups/${end.id}`,'PUT',{revision:stableRevision-1,answers:[]})).status,409);
  assert.equal((await call(`/${id}`)).body.revision,stableRevision);
  assert.equal((await call(`/${id}/groups/${end.id}/reviews/BKP-01`,'PUT',{revision:stableRevision,questionVersion:3,review:{conclusion:'unknown',evidenceState:'missing',collectionState:'notRequested',notes:'No restore evidence'}})).status,403);
  const profiles=current.groups.find(g=>g.sectionId==='profiles');
  assert.equal((await call(`/${id}/groups/${profiles.id}`,'PUT',{revision:stableRevision,answers:[{questionId:'PRF-07',questionVersion:3,state:'unknown'}]})).status,400);
  await req().query("UPDATE security.Memberships SET Role='admin' WHERE OrganizationId=@org AND UserId=@user;");
  await update(`/groups/${end.id}/reviews/BKP-01`,'PUT',{questionVersion:3,review:{conclusion:'unknown',evidenceState:'missing',collectionState:'notRequested',notes:'Synthetic review; successful recovery not established'}});
  assert.equal(current.groups.find(g=>g.id===end.id).answers.find(a=>a.questionId==='BKP-01').booleanValue,true);
  await update(`/groups/${profiles.id}`,'PUT',{answers:[{questionId:'PRF-07',questionVersion:3,state:'unknown'}]});
  await req().query("UPDATE security.Memberships SET Role='contributor' WHERE OrganizationId=@org AND UserId=@user;");
  await update(`/groups/${profiles.id}`,'PUT',{answers:[{questionId:'PRF-01',questionVersion:3,state:'unknown'}]});
  assert.ok(current.groups.find(g=>g.id===profiles.id).answers.some(a=>a.questionId==='PRF-07'),'Contributor save must preserve the reviewer-only answer.');
  await req().query("UPDATE security.Memberships SET Role='viewer' WHERE OrganizationId=@org AND UserId=@user;");
  assert.equal((await call(`/${id}`)).status,200);assert.equal((await call('','POST',{name:'Forbidden'})).status,403);assert.equal((await call(`/${id}/groups/${end.id}`,'PUT',{revision:current.revision,answers:[]})).status,403);
  await req().query("UPDATE security.Memberships SET Role='contributor' WHERE OrganizationId=@org AND UserId=@user;");
  current=(await call(`/${id}`)).body;
  assert.equal(current.groups.find(g=>g.id===end.id).answers.find(a=>a.questionId==='BKP-01').booleanValue,true);
  assert.equal(current.groups.find(g=>g.id===db.id).answers.find(a=>a.questionId==='BKP-01').booleanValue,false);
  assert.deepEqual(current.groups.find(g=>g.id===company.id).answers.find(a=>a.questionId==='SCP-05').records,companyAnswers[2].records);
  assert.ok((await call()).body.earlierAssessments.some(a=>a.id.toLowerCase()===legacy));
  console.log('PASS: live 12-section / 121-question guided client assessment, all repeatable scope families, all input types, separate endpoint/database answers, records, revisions, role/client isolation and independent reviews.');
  if(QUESTIONNAIRE_TEST_PORTAL_URL){
    const {chromium}=createRequire(new URL('../package.json',import.meta.url))('@playwright/test');browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});const page=await browser.newPage();
    await page.addInitScript(value=>sessionStorage.setItem('nso.customerSession',value),session);await page.goto(new URL('/signin',QUESTIONNAIRE_TEST_PORTAL_URL).href);
    await page.getByRole('button',{name:'Questionnaire',exact:true}).click();await page.getByRole('button',{name:'Open assessment',exact:true}).click();
    await page.getByRole('navigation',{name:'Assessment sections'}).waitFor({state:'visible'});
    assert.equal(await page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button').count(),12);
    const scope=page.getByRole('region',{name:'What company, business units and locations does this assessment cover?',exact:true});
    await scope.getByRole('textbox',{name:'Company or location name',exact:true}).fill('Synthetic company updated in browser');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
    await page.getByRole('button',{name:'All client assessments',exact:true}).click();await page.getByRole('button',{name:'Open assessment',exact:true}).click();assert.equal(await scope.getByRole('textbox',{name:'Company or location name',exact:true}).inputValue(),'Synthetic company updated in browser');
    await mkdir(new URL('../.azure/browser-results/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.azure/browser-results/full-client-questionnaire-live.png',import.meta.url)),fullPage:true});
    await page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button',{name:/Backups and recovery/}).click();
    const strategy=page.getByRole('region',{name:'Do you have a defined backup strategy for these systems/data?',exact:true});
    await page.getByRole('combobox',{name:'Scope group',exact:true}).selectOption({label:'Endpoint backups'});assert.equal(await strategy.getByRole('combobox',{name:'Answer',exact:true}).inputValue(),'true');
    await page.getByRole('combobox',{name:'Scope group',exact:true}).selectOption({label:'Database backups'});assert.equal(await strategy.getByRole('combobox',{name:'Answer',exact:true}).inputValue(),'false');
    await page.getByRole('button',{name:'All client assessments',exact:true}).click();await page.getByText('Earlier backup-only assessments (1)',{exact:true}).click();await page.getByRole('button',{name:'Open earlier assessment'}).click();
    assert.equal(await page.getByRole('region',{name:'Do you have a defined backup strategy?',exact:true}).getByRole('combobox',{name:'Answer',exact:true}).inputValue(),'true');
    console.log('PASS: live browser shows all 12 sections, saves/reopens company answers, switches separate backup scopes and opens preserved earlier answers.');
  }
  // Verify a legacy draft can be copied without changing its answers or historical review.
  const sourceId=randomUUID(),sourceCompany=randomUUID(),sourceBackup1=randomUUID(),sourceBackup2=randomUUID();
  await req().input('source',sql.UniqueIdentifier,sourceId).input('companyGroup',sql.UniqueIdentifier,sourceCompany).input('backup1',sql.UniqueIdentifier,sourceBackup1).input('backup2',sql.UniqueIdentifier,sourceBackup2).query(`
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@source,'client-v1');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@org,@source,'Disposable earlier client draft');
    INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name,ContextJson) VALUES
      (@org,@source,@companyGroup,'client-v1','company','Company','{}'),
      (@org,@source,@backup1,'client-v1','backups','Duplicate scope name','{"assetClass":"endpoints"}'),
      (@org,@source,@backup2,'client-v1','backups','Duplicate scope name','{"assetClass":"endpoints"}');
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,RecordsJson,UpdatedBy) VALUES
      (@org,@source,@companyGroup,'SCP-05',2,'records','answered','[{"environment":"Microsoft 365","account":"tenant-old","domains":"example.invalid","locations":"US"}]',@user);
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy) VALUES
      (@org,@source,@backup1,'BKP-01',2,'yn','answered',1,@user),(@org,@source,@backup2,'BKP-01',2,'yn','answered',0,@user);
    INSERT app.ClientAssessmentReviews(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,Conclusion,EvidenceState,CollectionState,Notes,UpdatedBy) VALUES
      (@org,@source,@backup1,'BKP-01',2,'unknown','missing','notRequested','Original review remains on original',@user);
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  const before=(await call(`/${sourceId}`)).body;
  assert.equal((await call('','POST',{name:'Stale guided copy',copyFrom:sourceId,sourceRevision:99})).status,409);
  const copied=await call('','POST',{name:'Disposable guided copy',copyFrom:sourceId,sourceRevision:before.revision});
  assert.equal(copied.status,201,JSON.stringify(copied.body));assert.equal(copied.body.templateVersion,'client-v2');
  assert.equal(copied.body.groups.find(g=>g.sectionId==='company').answers.find(a=>a.questionId==='SCP-05').records[0].tenant,'tenant-old');
  assert.deepEqual(copied.body.groups.filter(g=>g.sectionId==='backups').map(g=>g.answers[0].booleanValue).sort(),[false,true]);
  assert.ok(copied.body.groups.every(g=>g.reviews.length===0));
  assert.deepEqual((await call(`/${sourceId}`)).body,before,'Original answers, revision and reviews must remain unchanged.');
  assert.equal((await call('','POST',{name:'Unauthorized copy',copyFrom:other,sourceRevision:0})).status,404);
  console.log('PASS: guided copy preserves legacy source/reviews, duplicate-named scopes stay separate, stale and cross-workspace copies are rejected.');

}finally{
  await browser?.close();
  try{for(const fixture of [org,other])await pool.request().input('org',sql.UniqueIdentifier,fixture).query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    IF EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@org AND DisplayName NOT LIKE 'Disposable %') THROW 51000,'Fixture ownership mismatch; cleanup refused.',1;
    DELETE app.ClientAssessmentReviews WHERE OrganizationId=@org; DELETE app.ClientAssessmentSelections WHERE OrganizationId=@org; DELETE app.ClientAssessmentAnswers WHERE OrganizationId=@org; DELETE app.ClientAssessmentGroups WHERE OrganizationId=@org; DELETE app.ClientAssessmentDetails WHERE OrganizationId=@org;
    DELETE app.QuestionnaireAnswerSelections WHERE OrganizationId=@org; DELETE app.QuestionnaireAnswers WHERE OrganizationId=@org; DELETE app.QuestionnaireScopes WHERE OrganizationId=@org; DELETE app.Assessments WHERE OrganizationId=@org; DELETE app.AuditEvents WHERE OrganizationId=@org; DELETE security.Memberships WHERE OrganizationId=@org; DELETE security.CustomerDirectory WHERE OrganizationId=@org; DELETE app.Organizations WHERE OrganizationId=@org; EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
    await req().query('DELETE identitydata.Sessions WHERE UserId=@user; DELETE identitydata.Users WHERE UserId=@user;');console.log('Synthetic clients and account removed; no mail sent.');
  }finally{await pool.close();}
}
