// Explicit Dev/disposable SQL verification. Candidate migration and all fixtures roll back.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!process.env.SQL_SERVER||!process.env.SQL_DATABASE)throw new Error('Explicit Dev SQL target and CONFIRM_DEV_WRITE_TEST=yes required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
const org=randomUUID(),other=randomUUID(),user=randomUUID(),end=randomUUID(),db=randomUUID(),company=randomUUID();
const req=()=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org).input('other',sql.UniqueIdentifier,other).input('user',sql.UniqueIdentifier,user).input('end',sql.UniqueIdentifier,end).input('db',sql.UniqueIdentifier,db).input('company',sql.UniqueIdentifier,company);
try{
  if(process.argv.includes('--validate-migration')){
    const source=await readFile(new URL('../database/migrations/014_client_assessment.sql',import.meta.url),'utf8');
    for(const batch of source.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await new sql.Request(tx).batch(batch);
  }
  await req().query(`SET XACT_ABORT OFF;
    INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash) VALUES(@user,CONVERT(nvarchar(36),@user)+'@example.invalid',CONVERT(nvarchar(36),@user)+'@example.invalid','Client questionnaire fixture','unusable-fixture');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Client questionnaire fixture');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@org,'client-v1');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@org,@org,'Complete client assessment');
    INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name,ContextJson) VALUES
      (@org,@org,@company,'client-v1','company','Company','{}'),(@org,@org,@end,'client-v1','backups','Endpoints','{"assetClass":"endpoints"}'),(@org,@org,@db,'client-v1','backups','Databases','{"assetClass":"databases"}');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@other;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@other,'Neighbor client fixture');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@other,@other,'client-v1');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@other,@other,'Neighbor');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    EXECUTE AS USER='nso_api_runtime';`);
  assert.equal((await req().query('SELECT * FROM app.ClientAssessmentDetails')).recordset.length,0);
  const catalog=await req().query("SELECT (SELECT COUNT(*) FROM questionnaire.ClientSections WHERE TemplateVersion='client-v1') AS Sections,(SELECT COUNT(*) FROM questionnaire.ClientQuestionDefinitions WHERE TemplateVersion='client-v1') AS Questions");
  assert.deepEqual(catalog.recordset[0],{Sections:12,Questions:124});
  await req().query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;");
  assert.deepEqual((await req().query('SELECT AssessmentId FROM app.ClientAssessmentDetails')).recordset.map(r=>r.AssessmentId.toLowerCase()),[org]);
  await req().query(`
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy) VALUES
      (@org,@org,@end,'BKP-01',2,'yn','answered',1,@user),(@org,@org,@db,'BKP-01',2,'yn','answered',0,@user);
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,RecordsJson,UpdatedBy) VALUES
      (@org,@org,@company,'SCP-05',2,'records','answered','[{"environment":"Manual","account":null,"domains":"example.invalid","locations":"US"}]',@user);
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,UpdatedBy) VALUES(@org,@org,@company,'SCP-04',2,'multi','answered',@user);
    INSERT app.ClientAssessmentSelections(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,OptionId) VALUES(@org,@org,@company,'SCP-04',2,'azure');
    INSERT app.ClientAssessmentReviews(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,Conclusion,EvidenceState,CollectionState,Notes,UpdatedBy)
      VALUES(@org,@org,@end,'BKP-01',2,'unknown','missing','notRequested','Fixture review remains separate',@user);`);
  const saved=await req().query("SELECT GroupId,BooleanValue FROM app.ClientAssessmentAnswers WHERE QuestionId='BKP-01'");
  assert.equal(saved.recordset.find(r=>r.GroupId.toLowerCase()===end).BooleanValue,true);
  assert.equal(saved.recordset.find(r=>r.GroupId.toLowerCase()===db).BooleanValue,false);
  assert.equal((await req().query('SELECT COUNT(*) AS N FROM app.ClientAssessmentReviews')).recordset[0].N,1);
  await assert.rejects(()=>req().query("UPDATE app.ClientAssessmentAnswers SET TextValue='wrong type' WHERE GroupId=@end"));
  await assert.rejects(()=>req().query("UPDATE app.ClientAssessmentAnswers SET AnswerState='notApplicable',BooleanValue=NULL WHERE GroupId=@end"));
  await assert.rejects(()=>req().query("UPDATE questionnaire.ClientSections SET Title='Unauthorized' WHERE SectionId='company'"));
  assert.equal((await req().query('UPDATE app.ClientAssessmentDetails SET Revision=Revision+1 WHERE OrganizationId=@org AND AssessmentId=@org AND Revision=0; SELECT @@ROWCOUNT AS N;')).recordset[0].N,1);
  assert.equal((await req().query('UPDATE app.ClientAssessmentDetails SET Revision=Revision+1 WHERE OrganizationId=@org AND AssessmentId=@org AND Revision=0; SELECT @@ROWCOUNT AS N;')).recordset[0].N,0);
  await assert.rejects(()=>req().query("INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name) VALUES(@other,@other,NEWID(),'client-v1','company','Cross client')"));
  console.log('PASS: 12 sections / 124 questions, separate group answers, records, multi-selection, independent reviews, runtime RLS/type/catalog protections and revisions.');
}finally{await new sql.Request(tx).query("REVERT; EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>{});await tx.rollback().catch(()=>{});await pool.close();}
console.log('All fixtures and any candidate migration rolled back.');
