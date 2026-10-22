// Dev-only transactional verification; never targets a real user's account.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));const sql=require('mssql'),{AzureCliCredential}=require('@azure/identity');
if(process.env.CONFIRM_DEV_WRITE_TEST!=='yes'||!process.env.SQL_SERVER||!process.env.SQL_DATABASE)throw new Error('Set explicit Dev SQL targets and CONFIRM_DEV_WRITE_TEST=yes.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},pool:{max:1},requestTimeout:60000}).connect();
const tx=new sql.Transaction(pool);await tx.begin();
try{
  if(process.argv.includes('--validate-migration')){
    // Requires schema 013; optionally validate the latest cleanup procedure inside this rollback.
    const source=await readFile(new URL('../database/migrations/013_questionnaires.sql',import.meta.url),'utf8');
    const procedure=source.slice(source.indexOf('ALTER PROCEDURE security.ManagementDeleteAccount'));
    for(const batch of procedure.split(/^\s*GO\s*$/gmi).filter(x=>x.trim()))await new sql.Request(tx).batch(batch);
    const clientSchema=(await new sql.Request(tx).query("SELECT OBJECT_ID('app.ClientAssessmentAnswers') AS ObjectId")).recordset[0].ObjectId;
    if(clientSchema){
      const clientSource=await readFile(new URL('../database/migrations/014_client_assessment.sql',import.meta.url),'utf8');
      const repair=clientSource.split(/^\s*GO\s*$/gmi).find(batch=>batch.includes('DECLARE @procedure nvarchar(max)'));
      if(!repair)throw new Error('Migration 014 cleanup procedure update was not found.');
      await new sql.Request(tx).batch(repair);
    }
  }
  const user=randomUUID(),other=randomUUID(),org=randomUUID(),staffTenant=randomUUID(),staffObject=randomUUID(),email=`cleanup-${user}@example.invalid`;
  const bucket=createHash('sha256').update(`email:${email}`).digest('hex');
  const req=()=>new sql.Request(tx).input('user',sql.UniqueIdentifier,user).input('other',sql.UniqueIdentifier,other).input('org',sql.UniqueIdentifier,org).input('email',sql.NVarChar(254),email).input('staffTenant',sql.UniqueIdentifier,staffTenant).input('staffObject',sql.UniqueIdentifier,staffObject);
  await req().query(`
    INSERT identitydata.ManagementUsers(EntraTenantId,EntraObjectId,Role) VALUES(@staffTenant,@staffObject,'setupAdmin');
    INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash) VALUES(@user,@email,@email,'Fixture','fixture'),(@other,CONVERT(nvarchar(36),@other)+'@example.invalid',CONVERT(nvarchar(36),@other)+'@example.invalid','Neighbor','fixture');
    INSERT identitydata.AccountTokens(TokenHash,UserId,Purpose,ExpiresAt) VALUES(REPLICATE('a',64),@user,'verifyEmail',DATEADD(day,1,SYSUTCDATETIME()));
    INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt) VALUES(REPLICATE('b',64),@user,DATEADD(day,1,SYSUTCDATETIME()));
    INSERT identitydata.RegistrationRequests(UserId,CompanyName) VALUES(@user,'Fixture');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@org,'Shared fixture');
    INSERT security.CustomerDirectory(OrganizationId,DisplayName) VALUES(@org,'Shared fixture');
    INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,'owner'),(@org,@other,'viewer');
    INSERT app.CustomerContacts(OrganizationId,ContactId,DisplayName,Email,IntendedRole) VALUES(@org,NEWID(),'Fixture',@email,'owner');
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@org,'fixture');
    INSERT app.Answers(OrganizationId,AssessmentId,QuestionId,AnswerJson,UpdatedBy) VALUES(@org,@org,'fixture','{"value":1}',@user);
    INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass) VALUES(@org,@org,'Cleanup fixture','END');
    INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,BooleanValue,UpdatedBy)
      VALUES(@org,@org,'BKP-01',1,'yn','answered',1,@user);
    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action) VALUES(@org,'user',CONVERT(nvarchar(36),@user),'fixture');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    EXECUTE AS USER='nso_api_runtime';`);
  await req().query('REVERT;');
  const hasClientSchema=(await req().query("SELECT CASE WHEN OBJECT_ID('app.ClientAssessmentAnswers') IS NULL THEN 0 ELSE 1 END AS Present")).recordset[0].Present;
  if(hasClientSchema)await req().query(`
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@other,'client-v1');
    INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name) VALUES(@org,@other,'Cleanup client fixture');
    INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name) VALUES(@org,@other,@other,'client-v1','company','Company');
    INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,TextValue,UpdatedBy) VALUES(@org,@other,@other,'SCP-01',2,'text','answered','Preserve company',@user);
    INSERT app.ClientAssessmentReviews(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,Conclusion,EvidenceState,CollectionState,Notes,UpdatedBy) VALUES(@org,@other,@other,'SCP-01',2,'unknown','declared','notRequested','Preserve review',@user);
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  await req().query("EXECUTE AS USER='nso_api_runtime';");
  await new sql.Request(tx).input('TenantId',sql.UniqueIdentifier,staffTenant).input('ObjectId',sql.UniqueIdentifier,staffObject).input('UserId',sql.UniqueIdentifier,user).input('ConfirmationEmail',sql.NVarChar(254),email).input('EmailBucketHash',sql.Char(64),bucket).execute('security.ManagementDeleteAccount');
  await req().query('REVERT;');
  const result=await req().query(`
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    SELECT (SELECT COUNT(*) FROM identitydata.Users WHERE UserId=@user) AS Target,
      (SELECT COUNT(*) FROM identitydata.AccountTokens WHERE UserId=@user) AS Tokens,
      (SELECT COUNT(*) FROM identitydata.Sessions WHERE UserId=@user) AS Sessions,
      (SELECT COUNT(*) FROM identitydata.RegistrationRequests WHERE UserId=@user) AS Requests,
      (SELECT COUNT(*) FROM security.Memberships WHERE UserId=@user) AS Memberships,
      (SELECT COUNT(*) FROM app.CustomerContacts WHERE OrganizationId=@org) AS Contacts,
      (SELECT COUNT(*) FROM identitydata.Users WHERE UserId=@other) AS Neighbor,
      (SELECT COUNT(*) FROM security.Memberships WHERE OrganizationId=@org AND UserId=@other) AS NeighborAccess,
      (SELECT COUNT(*) FROM app.Answers WHERE OrganizationId=@org AND UpdatedBy IS NULL AND AnswerJson='{"value":1}') AS PreservedAnswer,
      (SELECT COUNT(*) FROM app.QuestionnaireAnswers WHERE OrganizationId=@org AND UpdatedBy IS NULL AND BooleanValue=1) AS PreservedQuestionnaireAnswer,
      (SELECT COUNT(*) FROM app.Organizations WHERE OrganizationId=@org) AS PreservedWorkspace;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  assert.deepEqual(result.recordset[0],{Target:0,Tokens:0,Sessions:0,Requests:0,Memberships:0,Contacts:0,Neighbor:1,NeighborAccess:1,PreservedAnswer:1,PreservedQuestionnaireAnswer:1,PreservedWorkspace:1});
  if(hasClientSchema){
    const preserved=await req().query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
      SELECT (SELECT COUNT(*) FROM app.ClientAssessmentAnswers WHERE OrganizationId=@org AND UpdatedBy IS NULL AND TextValue='Preserve company') AS Answers,
        (SELECT COUNT(*) FROM app.ClientAssessmentReviews WHERE OrganizationId=@org AND UpdatedBy IS NULL AND Notes='Preserve review') AS Reviews;
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
    assert.deepEqual(preserved.recordset[0],{Answers:1,Reviews:1});
  }
  await req().query("EXECUTE AS USER='nso_api_runtime';");
  const registered=await new sql.Request(tx).input('Email',sql.NVarChar(254),email).input('DisplayName',sql.NVarChar(150),'Re-register').input('PasswordHash',sql.NVarChar(512),'new-fixture').input('TokenHash',sql.Char(64),'c'.repeat(64)).execute('security.AuthRegister');
  assert.equal(registered.recordset[0].Email,email);
  console.log('PASS: runtime cleanup, credentials/tokens/memberships removed, shared workspace/answers/neighbor preserved, same email can register again.');
}finally{await new sql.Request(tx).query('REVERT;').catch(()=>{});await tx.rollback().catch(()=>{});await pool.close();}
console.log('All fixtures and any candidate migration rolled back.');
