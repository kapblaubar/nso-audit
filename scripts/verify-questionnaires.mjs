// Explicit Dev-only transactional validation. Every fixture and optional candidate migration rolls back.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!process.env.SQL_SERVER||!process.env.SQL_DATABASE)
  throw new Error('Set explicit Dev SQL targets and CONFIRM_DEV_WRITE_TEST=yes. Never run against Prod.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,
  authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
const a=randomUUID(),b=randomUUID(),user=randomUUID(),hash=createHash('sha256').update(randomUUID()).digest('hex');
const req=()=>new sql.Request(tx).input('a',sql.UniqueIdentifier,a).input('b',sql.UniqueIdentifier,b)
  .input('user',sql.UniqueIdentifier,user).input('hash',sql.Char(64),hash);
try{
  if(process.argv.includes('--validate-migration')){
    const source=await readFile(new URL('../database/migrations/013_questionnaires.sql',import.meta.url),'utf8');
    for(const batch of source.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await new sql.Request(tx).batch(batch);
  }
  await req().query(`SET XACT_ABORT OFF;
    INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt)
      VALUES(@user,CONVERT(nvarchar(36),@user)+'@example.invalid',CONVERT(nvarchar(36),@user)+'@example.invalid','Questionnaire fixture','unusable-fixture',SYSUTCDATETIME());
    INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt) VALUES(@hash,@user,DATEADD(hour,1,SYSUTCDATETIME()));
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@a;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@a,'Questionnaire fixture A');
    INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@a,@user,'contributor');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@a,@a,'backups-v1');
    INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass) VALUES(@a,@a,'Fixture laptops','END');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@b;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@b,'Questionnaire fixture B');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@b,@b,'backups-v1');
    INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass) VALUES(@b,@b,'Other client servers','SRV');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    EXECUTE AS USER='nso_api_runtime';`);
  const resolve=org=>new sql.Request(tx).input('TokenHash',sql.Char(64),hash).input('OrganizationId',sql.UniqueIdentifier,org).execute('security.AuthResolveQuestionnaire');
  assert.equal((await resolve(a)).recordset[0].Role,'contributor','Manual client without a Microsoft connection must resolve.');
  assert.equal((await resolve(b)).recordset.length,0,'Membership must not cross clients.');
  assert.equal((await req().query('SELECT * FROM app.QuestionnaireScopes')).recordset.length,0,'Resolver must clear context.');
  await req().query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=@a;");
  assert.deepEqual((await req().query('SELECT AssessmentId FROM app.QuestionnaireScopes')).recordset.map(r=>r.AssessmentId.toLowerCase()),[a]);
  await req().query(`INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy)
    VALUES(@a,@a,'BKP-01',1,'yn','answered',0,@user);`);
  assert.equal((await req().query("SELECT BooleanValue FROM app.QuestionnaireAnswers WHERE QuestionId='BKP-01'")).recordset[0].BooleanValue,false);
  await assert.rejects(()=>req().query(`UPDATE app.QuestionnaireAnswers SET TextValue='wrong type' WHERE OrganizationId=@a AND AssessmentId=@a;`));
  await assert.rejects(()=>req().query(`UPDATE app.QuestionnaireAnswers SET AnswerState='notApplicable',BooleanValue=NULL,Justification=NULL WHERE OrganizationId=@a AND AssessmentId=@a;`));
  await assert.rejects(()=>req().query(`INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,TotalInScope,TotalCovered,MeasurementDate,MeasurementSource,UpdatedBy)
    VALUES(@a,@a,'BKP-02',1,'coverage','answered',10,11,'2026-10-21','Fixture',@user);`));
  await assert.rejects(()=>req().query(`INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy)
    VALUES(@b,@b,'BKP-01',1,'yn','answered',1,@user);`));
  await assert.rejects(()=>req().query("UPDATE questionnaire.Questions SET Prompt='Unapproved change' WHERE QuestionId='BKP-01';"));
  // Optimistic concurrency succeeds once and rejects the stale revision.
  assert.equal((await req().query('UPDATE app.QuestionnaireScopes SET Revision=Revision+1 WHERE OrganizationId=@a AND AssessmentId=@a AND Revision=0; SELECT @@ROWCOUNT AS Changed;')).recordset[0].Changed,1);
  assert.equal((await req().query('UPDATE app.QuestionnaireScopes SET Revision=Revision+1 WHERE OrganizationId=@a AND AssessmentId=@a AND Revision=0; SELECT @@ROWCOUNT AS Changed;')).recordset[0].Changed,0);
  await req().query('REVERT; UPDATE security.Memberships SET Role=\'viewer\' WHERE OrganizationId=@a AND UserId=@user; EXECUTE AS USER=\'nso_api_runtime\';');
  assert.equal((await resolve(a)).recordset[0].Role,'viewer','Role changes must be reflected on the next request.');
  await req().query("REVERT; UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE TokenHash=@hash; EXECUTE AS USER='nso_api_runtime';");
  assert.equal((await resolve(a)).recordset.length,0,'Revoked sessions must fail closed.');
  console.log('PASS: no-connector membership, cross-client isolation, cleared context, typed values, coverage constraints, catalog protection, revisions and session revocation.');
}finally{
  await new sql.Request(tx).query("REVERT; EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>{});
  await tx.rollback().catch(()=>{});await pool.close();
}
console.log('All fixtures and any candidate migration rolled back.');
