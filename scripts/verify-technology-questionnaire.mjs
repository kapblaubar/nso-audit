// Transactional catalog and runtime storage verification; all fixtures roll back.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseClientAnswers,parseFields,questionsForGroup} from '../apps/api/dist/src/questionnaires/clientInput.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
const {SQL_SERVER,SQL_DATABASE}=process.env;
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||SQL_SERVER!=='nso-audit-dev-257f10d8.database.windows.net'||!SQL_DATABASE||!(SQL_DATABASE==='nso-audit-dev'||/^nso-audit-validation-[a-f0-9]{8}$/.test(SQL_DATABASE)))throw new Error('Explicit approved Dev/disposable SQL target required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:SQL_SERVER,database:SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
const org=randomUUID(),id=randomUUID();
const req=()=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org).input('id',sql.UniqueIdentifier,id);
try{
  const historical="SELECT q.*,d.DefinitionJson,d.SectionId,d.SourceQuestionId FROM questionnaire.Questions q JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=q.QuestionId AND d.QuestionVersion=q.Version WHERE d.TemplateVersion IN ('client-v1','client-v2') ORDER BY q.QuestionId,q.Version";
  const original=(await req().query(historical)).recordset;assert.equal(original.length,245);
  if(process.argv.includes('--validate-migration')){
    assert.equal((await req().query("SELECT COUNT(*) AS N FROM questionnaire.ClientQuestionDefinitions WHERE TemplateVersion='client-v3'")).recordset[0].N,0);
    const source=await readFile(new URL('../database/migrations/016_technology_register.sql',import.meta.url),'utf8');
    for(const batch of source.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await req().batch(batch);
  }
  const catalog=JSON.parse(await readFile(new URL('../config/questionnaires/client-v3.json',import.meta.url),'utf8'));
  const actual=(await req().query("SELECT q.*,d.DefinitionJson FROM questionnaire.Questions q JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=q.QuestionId AND d.QuestionVersion=q.Version WHERE d.TemplateVersion='client-v3' ORDER BY q.Position")).recordset;
  assert.equal(actual.length,151);
  for(const q of catalog.questions){
    const row=actual.find(v=>v.QuestionId===q.id);assert.equal(row.Version,4);assert.equal(row.Prompt,q.prompt);assert.equal(row.AnswerType,q.type);
    assert.deepEqual(JSON.parse(row.DefinitionJson),{fields:q.fields,units:q.units,reviewerOnly:q.reviewerOnly,assetClass:q.assetClass??null,sourcePrompt:q.sourcePrompt,...(q.guided?{guided:q.guided}:{}),...(q.entryKind?{entryKind:q.entryKind}:{})});
  }
  const sections=(await req().query("SELECT * FROM questionnaire.ClientSections WHERE TemplateVersion='client-v3' ORDER BY Position")).recordset;assert.equal(sections.length,12);
  for(const s of catalog.sections)assert.deepEqual(JSON.parse(sections.find(row=>row.SectionId===s.id).DefinitionJson),{groupFields:s.groupFields,help:s.help,description:s.description.trim()});
  await req().query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Disposable technology validation');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@id,'client-v3');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@org,@id,'Technology fixture');
    EXECUTE AS USER='nso_api_runtime';`);
  const assets=catalog.sections.find(s=>s.id==='assets');let stored=0;
  for(const type of assets.groupFields.find(f=>f.id==='assetClass').options){
    for(const entryKind of ['single','group']){
      const group=randomUUID(),context=parseFields({assetClass:type.id,entryKind,management:'internal'},assets.groupFields);
      const applicable=questionsForGroup(catalog.questions,'assets',context);assert.equal(applicable.length,10);
      assert.equal(applicable.filter(q=>q.type==='coverage').length,entryKind==='group'?2:0);
      await req().input('group',sql.UniqueIdentifier,group).input('context',sql.NVarChar(2000),JSON.stringify(context)).query("INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name,ContextJson) VALUES(@org,@id,@group,'client-v3','assets','Synthetic entry',@context)");
      const detail=applicable.find(q=>q.assetClass===type.id);
      const answer=parseClientAnswers([{questionId:detail.id,questionVersion:4,state:'answered',textValue:`${type.id}/${entryKind}`}],applicable,false)[0];
      await req().input('group',sql.UniqueIdentifier,group).input('question',sql.VarChar(100),answer.questionId).input('text',sql.NVarChar(4000),answer.textValue).query("INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,TextValue) VALUES(@org,@id,@group,@question,4,'text','answered',@text)");
      const saved=(await req().input('group',sql.UniqueIdentifier,group).query('SELECT TextValue FROM app.ClientAssessmentAnswers WHERE AssessmentId=@id AND GroupId=@group')).recordset;
      assert.equal(saved[0].TextValue,answer.textValue);stored++;
      const wrong=catalog.questions.find(q=>q.sectionId==='assets'&&q.assetClass&&q.assetClass!==type.id);
      assert.throws(()=>parseClientAnswers([{questionId:wrong.id,questionVersion:4,state:'unknown'}],applicable,false));
    }
  }
  assert.equal(stored,14);
  await req().query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;");
  assert.equal((await req().query('SELECT COUNT(*) AS N FROM app.ClientAssessmentAnswers WHERE AssessmentId=@id')).recordset[0].N,0);
  await req().query('REVERT;');assert.deepEqual((await req().query(historical)).recordset,original);
  console.log('PASS: v3 catalog/sections, all seven types and both entry kinds, runtime answer round trips and row isolation; v1/v2 unchanged.');
}finally{
  await new sql.Request(tx).query("REVERT; EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>{});
  await tx.rollback().catch(()=>{});await pool.close();
}
console.log('Fixtures and any candidate migration rolled back.');
