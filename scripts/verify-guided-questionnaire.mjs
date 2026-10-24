// Transactional Dev/disposable validation. Fixtures and candidate catalog always roll back.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseClientAnswers} from '../apps/api/dist/src/questionnaires/clientInput.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!process.env.SQL_SERVER||!process.env.SQL_DATABASE)throw new Error('Explicit SQL target and CONFIRM_DEV_WRITE_TEST=yes required.');
if(!process.env.SQL_DATABASE.startsWith('nso-audit-')||!process.env.SQL_DATABASE.includes('dev')&&!process.env.SQL_DATABASE.startsWith('nso-audit-validation-'))throw new Error('Dev or disposable target required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
const org=randomUUID(),id=randomUUID(),group=randomUUID();
const req=()=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org).input('id',sql.UniqueIdentifier,id).input('group',sql.UniqueIdentifier,group);
try{
  const original=(await req().query("SELECT QuestionId,QuestionVersion,DefinitionJson FROM questionnaire.ClientQuestionDefinitions WHERE TemplateVersion='client-v1' ORDER BY QuestionId")).recordset;
  assert.equal(original.length,124);
  if(process.argv.includes('--validate-migration')){
    assert.equal((await req().query("SELECT COUNT(*) AS N FROM questionnaire.ClientQuestionDefinitions WHERE TemplateVersion='client-v2'")).recordset[0].N,0,'Candidate must not already be installed.');
    const source=await readFile(new URL('../database/migrations/015_guided_questionnaire.sql',import.meta.url),'utf8');
    for(const batch of source.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await req().batch(batch);
  }
  const catalog=JSON.parse(await readFile(new URL('../config/questionnaires/client-v2.json',import.meta.url),'utf8'));
  const actual=(await req().query("SELECT q.QuestionId,q.Version,q.Prompt,d.DefinitionJson FROM questionnaire.Questions q JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=q.QuestionId AND d.QuestionVersion=q.Version WHERE d.TemplateVersion='client-v2'")).recordset;
  assert.equal(actual.length,121);
  for(const q of catalog.questions){const row=actual.find(v=>v.QuestionId===q.id);assert.equal(row.Version,3);assert.equal(row.Prompt,q.prompt);assert.deepEqual(JSON.parse(row.DefinitionJson).fields,q.fields);}
  const answers=parseClientAnswers([
    {questionId:'SCP-05',questionVersion:3,records:[{platform:'microsoft',tenant:'tenant-example',subscriptions:'Production; Test'},{platform:'aws',account:'123456789012'},{platform:'google',projects:'analytics'}]},
    {questionId:'SCP-06',questionVersion:3,records:[{activity:'finance',systems:'QuickBooks',tolerance:'day'}]},
    {questionId:'SCP-08',questionVersion:3,records:[{provider:'Partner',responsibilities:['service-2','service-13']}]},
    {questionId:'SCP-07.LOCATIONS',questionVersion:3,records:[{dataType:'employee',system:'sharepoint',location:'HR site'},{dataType:'employee',system:'application'}]},
    {questionId:'SCP-10.PROFILES',questionVersion:3,records:[{purpose:'security'},{purpose:'insurance',insurer:'Insurer A'},{purpose:'insurance',insurer:'Insurer B'},{purpose:'compliance',framework:'Customer standard'}]},
  ],catalog.questions,false);
  await req().query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable guided questionnaire validation');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@id,'client-v2');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@org,@id,'Guided fixture');
    INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name) VALUES(@org,@id,@group,'client-v2','company','Company');
    EXECUTE AS USER='nso_api_runtime';`);
  for(const answer of answers)await req().input('question',sql.VarChar(100),answer.questionId).input('records',sql.NVarChar(sql.MAX),JSON.stringify(answer.records)).query("INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,RecordsJson) VALUES(@org,@id,@group,@question,3,'records','answered',@records)");
  const saved=(await req().query('SELECT QuestionId,RecordsJson FROM app.ClientAssessmentAnswers WHERE AssessmentId=@id')).recordset;
  for(const answer of answers)assert.deepEqual(JSON.parse(saved.find(row=>row.QuestionId===answer.questionId).RecordsJson),answer.records);
  await req().query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;");
  assert.equal((await req().query('SELECT COUNT(*) AS N FROM app.ClientAssessmentAnswers WHERE AssessmentId=@id')).recordset[0].N,0);
  await req().query('REVERT;');
  assert.deepEqual((await req().query("SELECT QuestionId,QuestionVersion,DefinitionJson FROM questionnaire.ClientQuestionDefinitions WHERE TemplateVersion='client-v1' ORDER BY QuestionId")).recordset,original);
  console.log('PASS: candidate/catalog definitions, five guided forms, nested multi-select storage, hybrid entries, multiple purposes and unchanged v1 catalog; runtime row isolation verified.');
}finally{await new sql.Request(tx).query("REVERT; EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>{});await tx.rollback().catch(()=>{});await pool.close();}
console.log('Fixtures and any candidate migration rolled back.');
