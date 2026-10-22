import {randomUUID} from 'node:crypto';
import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import sql from 'mssql';
import {withOrganization,uuidPattern} from '../storage/sql.js';
import {resolveQuestionnaireUser,RequestError} from './questionnaires.js';
import {object,QuestionnaireInputError} from '../questionnaires/input.js';
import {boundedText,inputError,parseClientAnswers,parseFields,parseReview,questionsForGroup,type ClientQuestion,type ClientAnswer,type Section} from '../questionnaires/clientInput.js';

const reply=(status:number,jsonBody:object):HttpResponseInit=>({status,jsonBody,headers:{'Cache-Control':'no-store'}});
const query=(tx:sql.Transaction,org:string,id:string)=>new sql.Request(tx).input('org',sql.UniqueIdentifier,org).input('id',sql.UniqueIdentifier,id);
const fields={booleanValue:['BooleanValue',sql.Bit],textValue:['TextValue',sql.NVarChar(4000)],numberValue:['NumberValue',sql.Decimal(18,4)],unit:['Unit',sql.NVarChar(32)],dateValue:['DateValue',sql.Date],selectedOptionId:['SelectedOptionId',sql.VarChar(64)],totalInScope:['TotalInScope',sql.Int],totalCovered:['TotalCovered',sql.Int],estimatedPercentage:['EstimatedPercentage',sql.Decimal(7,4)],measurementDate:['MeasurementDate',sql.Date],measurementSource:['MeasurementSource',sql.NVarChar(500)],justification:['Justification',sql.NVarChar(2000)],evidenceReference:['EvidenceReference',sql.NVarChar(2000)]} as const;
function dateValue(value:unknown){return value instanceof Date?value.toISOString().slice(0,10):value;}
export async function loadClientAssessment(tx:sql.Transaction,org:string,id:string){
  const result=await query(tx,org,id).query(`
    SELECT d.*,a.TemplateVersion,a.Status FROM app.ClientAssessmentDetails d JOIN app.Assessments a ON a.OrganizationId=d.OrganizationId AND a.AssessmentId=d.AssessmentId WHERE d.OrganizationId=@org AND d.AssessmentId=@id;
    SELECT * FROM app.ClientAssessmentGroups WHERE OrganizationId=@org AND AssessmentId=@id ORDER BY Name;
    SELECT * FROM app.ClientAssessmentAnswers WHERE OrganizationId=@org AND AssessmentId=@id;
    SELECT * FROM app.ClientAssessmentSelections WHERE OrganizationId=@org AND AssessmentId=@id;
    SELECT * FROM app.ClientAssessmentReviews WHERE OrganizationId=@org AND AssessmentId=@id;`);
  const sets=result.recordsets as sql.IRecordSet<any>[],detail=sets[0]?.[0];
  if(!detail)throw new RequestError(404,'Client assessment not found.');
  if(detail.TemplateVersion!=='client-v1')throw new RequestError(409,'This client questionnaire version is not supported by this API.');
  const catalog=await new sql.Request(tx).input('template',sql.VarChar(64),detail.TemplateVersion).query(`
    SELECT * FROM questionnaire.ClientSections WHERE TemplateVersion=@template ORDER BY Position;
    SELECT q.*,d.SectionId,d.SourceQuestionId,d.DefinitionJson FROM questionnaire.Questions q JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=q.QuestionId AND d.QuestionVersion=q.Version WHERE d.TemplateVersion=@template ORDER BY q.Position;
    SELECT o.* FROM questionnaire.QuestionOptions o JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=o.QuestionId AND d.QuestionVersion=o.QuestionVersion WHERE d.TemplateVersion=@template ORDER BY o.Position;`);
  const cat=catalog.recordsets as sql.IRecordSet<any>[];
  const sections:Section[]=(cat[0]??[]).map(s=>({id:s.SectionId,title:s.Title,position:s.Position,repeatable:s.Repeatable,...JSON.parse(s.DefinitionJson)}));
  const questions:ClientQuestion[]=(cat[1]??[]).map(q=>({id:q.QuestionId,version:q.Version,sourceId:q.SourceQuestionId,sectionId:q.SectionId,prompt:q.Prompt,help:q.HelpText,type:q.AnswerType,...JSON.parse(q.DefinitionJson),options:(cat[2]??[]).filter(o=>o.QuestionId===q.QuestionId&&o.QuestionVersion===q.Version).map(o=>({id:o.OptionId,label:o.Label}))}));
  const groups=(sets[1]??[]).map(g=>({id:g.GroupId,sectionId:g.SectionId,name:g.Name,context:JSON.parse(g.ContextJson) as Record<string,unknown>,
    answers:(sets[2]??[]).filter(a=>a.GroupId===g.GroupId).map(row=>{
      const answer:Record<string,unknown>={questionId:row.QuestionId,questionVersion:row.QuestionVersion,state:row.AnswerState};
      for(const [key,[column]] of Object.entries(fields))if(row[column]!==null)answer[key]=dateValue(row[column]);
      if(row.RecordsJson!==null)answer.records=JSON.parse(row.RecordsJson);
      if(row.AnswerType==='multi'&&row.AnswerState==='answered')answer.selections=(sets[3]??[]).filter(s=>s.GroupId===g.GroupId&&s.QuestionId===row.QuestionId).map(s=>s.OptionId);
      return answer;
    }),
    reviews:(sets[4]??[]).filter(r=>r.GroupId===g.GroupId).map(r=>({questionId:r.QuestionId,questionVersion:r.QuestionVersion,conclusion:r.Conclusion,evidenceState:r.EvidenceState,collectionState:r.CollectionState,notes:r.Notes,actionOwner:r.ActionOwner??'',targetDate:dateValue(r.TargetDate)??'',updatedAt:r.UpdatedAt})),
  }));
  return {id:detail.AssessmentId,name:detail.Name,answerOwner:detail.AnswerOwner??'',reviewer:detail.Reviewer??'',revision:detail.Revision,status:detail.Status,templateVersion:detail.TemplateVersion,sections,questions,groups};
}
async function audit(tx:sql.Transaction,org:string,userId:string,action:string){await new sql.Request(tx).input('org',sql.UniqueIdentifier,org).input('user',sql.NVarChar(100),userId).input('action',sql.VarChar(100),action).query("INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action) VALUES(@org,'email',@user,@action)");}
async function lock(tx:sql.Transaction,org:string,id:string,revision:unknown){
  if(!Number.isInteger(revision)||Number(revision)<0||Number(revision)>=2147483647)return inputError('A valid assessment revision is required.');
  const result=await query(tx,org,id).input('revision',sql.Int,revision).query(`UPDATE d SET Revision=Revision+1,UpdatedAt=SYSUTCDATETIME() FROM app.ClientAssessmentDetails d JOIN app.Assessments a ON a.OrganizationId=d.OrganizationId AND a.AssessmentId=d.AssessmentId WHERE d.OrganizationId=@org AND d.AssessmentId=@id AND d.Revision=@revision AND a.Status='draft'; SELECT @@ROWCOUNT AS Changed;`);
  if(!result.recordset[0]?.Changed)throw new RequestError(409,'This assessment changed or is unavailable. Reopen it before saving. Your edits have not been saved.');
}
async function writeAnswer(tx:sql.Transaction,org:string,id:string,group:string,userId:string,answer:ClientAnswer,question:ClientQuestion){
  const request=query(tx,org,id).input('group',sql.UniqueIdentifier,group).input('question',sql.VarChar(100),question.id).input('version',sql.Int,question.version)
    .input('type',sql.VarChar(16),question.type).input('state',sql.VarChar(16),answer.state).input('user',sql.UniqueIdentifier,userId)
    .input('records',sql.NVarChar(sql.MAX),answer.records?JSON.stringify(answer.records):null);
  for(const [key,[,type]]of Object.entries(fields))request.input(key,type,(answer as unknown as Record<string,unknown>)[key]??null);
  await request.query(`INSERT app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,AnswerType,AnswerState,UpdatedBy,RecordsJson,${Object.values(fields).map(v=>v[0]).join(',')}) VALUES(@org,@id,@group,@question,@version,@type,@state,@user,@records,${Object.keys(fields).map(k=>'@'+k).join(',')});`);
  for(const option of answer.selections??[])await query(tx,org,id).input('group',sql.UniqueIdentifier,group).input('question',sql.VarChar(100),question.id).input('version',sql.Int,question.version).input('option',sql.VarChar(64),option).query('INSERT app.ClientAssessmentSelections(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,OptionId) VALUES(@org,@id,@group,@question,@version,@option)');
}
export async function clientAssessments(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  try{
    const user=await resolveQuestionnaireUser(request),id=request.params.assessmentId,groupId=request.params.groupId,questionId=request.params.questionId;
    const canReview=['owner','admin'].includes(user.role);
    for(const value of [id,groupId])if(value&&!uuidPattern.test(value))throw new RequestError(400,'Invalid assessment or group identifier.');
    if(request.method==='GET')return await withOrganization(user.organizationId,async tx=>{
      if(id)return reply(200,await loadClientAssessment(tx,user.organizationId,id));
      const result=await new sql.Request(tx).input('org',sql.UniqueIdentifier,user.organizationId).query(`
        SELECT d.AssessmentId AS id,d.Name AS name,d.Revision AS revision,d.UpdatedAt AS updatedAt,a.TemplateVersion AS templateVersion FROM app.ClientAssessmentDetails d JOIN app.Assessments a ON a.OrganizationId=d.OrganizationId AND a.AssessmentId=d.AssessmentId WHERE d.OrganizationId=@org ORDER BY d.UpdatedAt DESC;
        SELECT AssessmentId AS id,ScopeName AS name,AssetClass AS assetClass FROM app.QuestionnaireScopes WHERE OrganizationId=@org ORDER BY UpdatedAt DESC;`);
      const sets=result.recordsets as sql.IRecordSet<any>[];return reply(200,{assessments:sets[0]??[],earlierAssessments:sets[1]??[]});
    });
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new RequestError(415,'JSON is required.');
    const origin=request.headers.get('origin');if(origin&&origin!==process.env.PORTAL_ORIGIN)throw new RequestError(403,'Request origin is not allowed.');
    const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>524288)throw new RequestError(413,'Request is too large.');
    let body:Record<string,unknown>;try{body=object(JSON.parse(raw));}catch{throw new RequestError(400,'Invalid JSON request.');}
    return await withOrganization(user.organizationId,async tx=>{
      if(!id){
        const name=boundedText(body.name,'Assessment name')!,owner=boundedText(body.answerOwner,'Answer owner',200,false),reviewer=boundedText(body.reviewer,'Reviewer',200,false),created=randomUUID();
        await query(tx,user.organizationId,created).input('name',sql.NVarChar(200),name).input('owner',sql.NVarChar(200),owner??null).input('reviewer',sql.NVarChar(200),reviewer??null).query(`
          INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@id,'client-v1');
          INSERT app.ClientAssessmentDetails(OrganizationId,AssessmentId,Name,AnswerOwner,Reviewer) VALUES(@org,@id,@name,@owner,@reviewer);
          INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name)
            SELECT @org,@id,NEWID(),TemplateVersion,SectionId,Title FROM questionnaire.ClientSections WHERE TemplateVersion='client-v1' AND Repeatable=0;`);
        await audit(tx,user.organizationId,user.userId,'clientAssessment.created');
        return reply(201,await loadClientAssessment(tx,user.organizationId,created));
      }
      await lock(tx,user.organizationId,id,body.revision);
      const assessment=await loadClientAssessment(tx,user.organizationId,id);
      if(request.method==='POST'){
        const section=assessment.sections.find(s=>s.id===body.sectionId);
        if(!section?.repeatable)return inputError('Choose a section that supports additional scope groups.');
        const name=boundedText(body.name,'Group name')!,groupContext=parseFields(body.context,section.groupFields);
        if(Object.values(groupContext).some(value=>value===null))return inputError('Choose the group scope before answering its questions.');
        const created=randomUUID();
        await query(tx,user.organizationId,id).input('group',sql.UniqueIdentifier,created).input('section',sql.VarChar(32),section.id).input('name',sql.NVarChar(200),name).input('context',sql.NVarChar(2000),JSON.stringify(groupContext)).query("INSERT app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId,TemplateVersion,SectionId,Name,ContextJson) VALUES(@org,@id,@group,'client-v1',@section,@name,@context)");
        await audit(tx,user.organizationId,user.userId,'clientAssessment.groupAdded');
      }else if(groupId){
        const group=assessment.groups.find(g=>g.id.toLowerCase()===groupId.toLowerCase());
        if(!group)throw new RequestError(404,'Assessment group not found.');
        const applicable=questionsForGroup(assessment.questions,group.sectionId,group.context);
        if(questionId){
          if(!canReview)throw new RequestError(403,'An owner or administrator is required to record reviewer conclusions.');
          const question=applicable.find(q=>q.id===questionId&&q.version===body.questionVersion);
          if(!question)return inputError('Choose a current question in this group.');
          const review=parseReview(body.review);
          await query(tx,user.organizationId,id).input('group',sql.UniqueIdentifier,groupId).input('question',sql.VarChar(100),questionId).input('version',sql.Int,question.version)
            .input('conclusion',sql.VarChar(24),review.conclusion).input('evidence',sql.VarChar(24),review.evidenceState).input('collection',sql.VarChar(24),review.collectionState).input('notes',sql.NVarChar(2000),review.notes).input('owner',sql.NVarChar(200),review.actionOwner??null).input('target',sql.Date,review.targetDate??null).input('user',sql.UniqueIdentifier,user.userId).query(`
              UPDATE app.ClientAssessmentReviews SET Conclusion=@conclusion,EvidenceState=@evidence,CollectionState=@collection,Notes=@notes,ActionOwner=@owner,TargetDate=@target,UpdatedBy=@user,UpdatedAt=SYSUTCDATETIME() WHERE OrganizationId=@org AND AssessmentId=@id AND GroupId=@group AND QuestionId=@question;
              IF @@ROWCOUNT=0 INSERT app.ClientAssessmentReviews(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion,Conclusion,EvidenceState,CollectionState,Notes,ActionOwner,TargetDate,UpdatedBy) VALUES(@org,@id,@group,@question,@version,@conclusion,@evidence,@collection,@notes,@owner,@target,@user);`);
          await audit(tx,user.organizationId,user.userId,'clientAssessment.reviewed');
        }else{
          const answers=parseClientAnswers(body.answers,applicable,canReview);
          await query(tx,user.organizationId,id).input('group',sql.UniqueIdentifier,groupId).input('reviewer',sql.Bit,canReview).query(`
            DELETE s FROM app.ClientAssessmentSelections s JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=s.QuestionId AND d.QuestionVersion=s.QuestionVersion WHERE s.OrganizationId=@org AND s.AssessmentId=@id AND s.GroupId=@group AND (@reviewer=1 OR JSON_VALUE(d.DefinitionJson,'$.reviewerOnly')='false');
            DELETE a FROM app.ClientAssessmentAnswers a JOIN questionnaire.ClientQuestionDefinitions d ON d.QuestionId=a.QuestionId AND d.QuestionVersion=a.QuestionVersion WHERE a.OrganizationId=@org AND a.AssessmentId=@id AND a.GroupId=@group AND (@reviewer=1 OR JSON_VALUE(d.DefinitionJson,'$.reviewerOnly')='false');`);
          for(const answer of answers)await writeAnswer(tx,user.organizationId,id,groupId,user.userId,answer,applicable.find(q=>q.id===answer.questionId)!);
          await audit(tx,user.organizationId,user.userId,'clientAssessment.answersSaved');
        }
      }else{
        const name=boundedText(body.name,'Assessment name')!,owner=boundedText(body.answerOwner,'Answer owner',200,false),reviewer=boundedText(body.reviewer,'Reviewer',200,false);
        await query(tx,user.organizationId,id).input('name',sql.NVarChar(200),name).input('owner',sql.NVarChar(200),owner??null).input('reviewer',sql.NVarChar(200),reviewer??null).query('UPDATE app.ClientAssessmentDetails SET Name=@name,AnswerOwner=@owner,Reviewer=@reviewer WHERE OrganizationId=@org AND AssessmentId=@id');
        await audit(tx,user.organizationId,user.userId,'clientAssessment.detailsSaved');
      }
      return reply(request.method==='POST'?201:200,await loadClientAssessment(tx,user.organizationId,id));
    });
  }catch(error){
    if(error instanceof RequestError)return reply(error.status,{error:error.message});
    if(error instanceof QuestionnaireInputError)return reply(400,{error:error.message});
    context.error('Client assessment operation failed.');
    return reply(503,{error:'The client questionnaire is temporarily unavailable. Your changes have not been confirmed saved.'});
  }
}
app.http('clientAssessments',{methods:['GET','POST'],authLevel:'anonymous',route:'me/client-assessments',handler:clientAssessments});
app.http('clientAssessment',{methods:['GET','PUT'],authLevel:'anonymous',route:'me/client-assessments/{assessmentId}',handler:clientAssessments});
app.http('clientAssessmentGroups',{methods:['POST'],authLevel:'anonymous',route:'me/client-assessments/{assessmentId}/groups',handler:clientAssessments});
app.http('clientAssessmentGroup',{methods:['PUT'],authLevel:'anonymous',route:'me/client-assessments/{assessmentId}/groups/{groupId}',handler:clientAssessments});
app.http('clientAssessmentReview',{methods:['PUT'],authLevel:'anonymous',route:'me/client-assessments/{assessmentId}/groups/{groupId}/reviews/{questionId}',handler:clientAssessments});
