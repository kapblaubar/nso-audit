import {randomUUID} from 'node:crypto';
import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import sql from 'mssql';
import {getSqlPool,uuidPattern,withOrganization} from '../storage/sql.js';
import {tokenHash} from '../auth/passwords.js';
import {object,parseAnswers,parseScope,QuestionnaireInputError,type Question,type Answer} from '../questionnaires/input.js';

export class RequestError extends Error { constructor(readonly status:number,message:string){super(message);} }
const reply=(status:number,body:object):HttpResponseInit=>({status,headers:{'Cache-Control':'no-store'},jsonBody:body});
export async function resolveQuestionnaireUser(request:HttpRequest) {
  const auth=request.headers.get('authorization')??'',organizationId=request.headers.get('x-nso-organization-id')??'';
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth)) throw new RequestError(401,'Sign in with your NSO Audit email account to open questionnaires.');
  if(!uuidPattern.test(organizationId)) throw new RequestError(403,'Choose an authorized workspace.');
  const pool=await getSqlPool();
  const result=await pool.request().input('TokenHash',sql.Char(64),tokenHash(auth.slice(7)))
    .input('OrganizationId',sql.UniqueIdentifier,organizationId).execute('security.AuthResolveQuestionnaire');
  const row=result.recordset?.[0];
  if(!row) throw new RequestError(403,'Workspace access is no longer available.');
  if(request.method!=='GET' && !['owner','admin','contributor'].includes(row.Role)) throw new RequestError(403,'Your workspace role permits viewing only.');
  return {organizationId,userId:row.UserId as string,role:row.Role as string};
}
async function catalog(transaction:sql.Transaction,assetClass:string,templateVersion:string):Promise<Question[]> {
  if(templateVersion!=='backups-v1') throw new RequestError(409,'This questionnaire template is not supported by this API version.');
  const result=await new sql.Request(transaction).input('db',sql.Bit,assetClass==='DB').query(`
    SELECT * FROM questionnaire.Questions WHERE TemplateVersion='backups-v1' OR (@db=1 AND TemplateVersion='backups-db-v1') ORDER BY Position;
    SELECT o.* FROM questionnaire.QuestionOptions o JOIN questionnaire.Questions q ON q.QuestionId=o.QuestionId AND q.Version=o.QuestionVersion
      WHERE q.TemplateVersion='backups-v1' OR (@db=1 AND q.TemplateVersion='backups-db-v1') ORDER BY o.Position;`);
  const sets=result.recordsets as sql.IRecordSet<any>[];
  return (sets[0]??[]).map(q=>({id:q.QuestionId,version:q.Version,prompt:q.Prompt,help:q.HelpText,type:q.AnswerType,
    options:(sets[1]??[]).filter(o=>o.QuestionId===q.QuestionId && o.QuestionVersion===q.Version).map(o=>({id:o.OptionId,label:o.Label}))}));
}
const fields = {
  booleanValue:['BooleanValue',sql.Bit],textValue:['TextValue',sql.NVarChar(4000)],numberValue:['NumberValue',sql.Decimal(18,4)],
  unit:['Unit',sql.NVarChar(32)],dateValue:['DateValue',sql.Date],selectedOptionId:['SelectedOptionId',sql.VarChar(64)],
  totalInScope:['TotalInScope',sql.Int],totalCovered:['TotalCovered',sql.Int],estimatedPercentage:['EstimatedPercentage',sql.Decimal(7,4)],
  measurementDate:['MeasurementDate',sql.Date],measurementSource:['MeasurementSource',sql.NVarChar(500)],
  justification:['Justification',sql.NVarChar(2000)],evidenceReference:['EvidenceReference',sql.NVarChar(2000)],
} as const;
function requestFor(transaction:sql.Transaction,organizationId:string,assessmentId:string) {
  return new sql.Request(transaction).input('org',sql.UniqueIdentifier,organizationId).input('id',sql.UniqueIdentifier,assessmentId);
}
async function load(transaction:sql.Transaction,organizationId:string,id:string) {
  const result=await requestFor(transaction,organizationId,id).query(`
    SELECT s.*,a.Status,a.TemplateVersion FROM app.QuestionnaireScopes s JOIN app.Assessments a ON a.OrganizationId=s.OrganizationId AND a.AssessmentId=s.AssessmentId
      WHERE s.OrganizationId=@org AND s.AssessmentId=@id;
    SELECT * FROM app.QuestionnaireAnswers WHERE OrganizationId=@org AND AssessmentId=@id;
    SELECT * FROM app.QuestionnaireAnswerSelections WHERE OrganizationId=@org AND AssessmentId=@id;`);
  const sets=result.recordsets as sql.IRecordSet<any>[],scope=sets[0]?.[0];
  if(!scope) throw new RequestError(404,'Assessment not found.');
  const answers=(sets[1]??[]).map(row=>{
    const answer:Record<string,unknown>={questionId:row.QuestionId,questionVersion:row.QuestionVersion,state:row.AnswerState};
    for(const [key,[column]] of Object.entries(fields)) if(row[column]!==null) answer[key]=row[column] instanceof Date ? row[column].toISOString().slice(0,10) : row[column];
    if(row.AnswerType==='multi' && row.AnswerState==='answered') answer.selections=(sets[2]??[]).filter(s=>s.QuestionId===row.QuestionId).map(s=>s.OptionId);
    return answer;
  });
  return {id:scope.AssessmentId,scopeName:scope.ScopeName,assetClass:scope.AssetClass,tenantId:scope.TenantId,
    revision:scope.Revision,status:scope.Status,questions:await catalog(transaction,scope.AssetClass,scope.TemplateVersion),answers};
}
async function insertAnswer(transaction:sql.Transaction,org:string,id:string,userId:string,answer:Answer,question:Question) {
  const request=requestFor(transaction,org,id).input('question',sql.VarChar(100),answer.questionId)
    .input('version',sql.Int,answer.questionVersion).input('type',sql.VarChar(16),question.type)
    .input('state',sql.VarChar(16),answer.state).input('user',sql.UniqueIdentifier,userId);
  for(const [key,[,type]] of Object.entries(fields)) request.input(key,type,(answer as unknown as Record<string,unknown>)[key]??null);
  const entries=Object.entries(fields);
  await request.query(`INSERT app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion,AnswerType,AnswerState,UpdatedBy,${entries.map(([,v])=>v[0]).join(',')})
    VALUES(@org,@id,@question,@version,@type,@state,@user,${entries.map(([k])=>'@'+k).join(',')});`);
  for(const option of answer.selections??[]) await requestFor(transaction,org,id)
    .input('question',sql.VarChar(100),answer.questionId).input('version',sql.Int,answer.questionVersion).input('option',sql.VarChar(64),option)
    .query('INSERT app.QuestionnaireAnswerSelections(OrganizationId,AssessmentId,QuestionId,QuestionVersion,OptionId) VALUES(@org,@id,@question,@version,@option)');
}
export async function questionnaires(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit> {
  try {
    const user=await resolveQuestionnaireUser(request),id=request.params.assessmentId;
    if(id && !uuidPattern.test(id)) throw new RequestError(400,'Invalid assessment ID.');
    if(request.method==='GET') return await withOrganization(user.organizationId,async transaction=>{
      if(id) return reply(200,await load(transaction,user.organizationId,id));
      const result=await new sql.Request(transaction).input('org',sql.UniqueIdentifier,user.organizationId).query(`
        SELECT s.AssessmentId AS id,s.ScopeName AS scopeName,s.AssetClass AS assetClass,s.Revision AS revision,s.UpdatedAt AS updatedAt
        FROM app.QuestionnaireScopes s WHERE OrganizationId=@org ORDER BY UpdatedAt DESC;`);
      return reply(200,{assessments:result.recordset});
    });
    if((request.method==='POST' && id)||(request.method==='PUT' && !id)) throw new RequestError(405,'Method not allowed.');
    if(!request.headers.get('content-type')?.startsWith('application/json')) throw new RequestError(415,'JSON is required.');
    const origin=request.headers.get('origin');
    if(origin && origin!==process.env.PORTAL_ORIGIN) throw new RequestError(403,'Request origin is not allowed.');
    const raw=await request.text();
    if(raw.length>131072) throw new RequestError(413,'Request is too large.');
    let body:Record<string,unknown>;
    try {body=object(JSON.parse(raw));} catch {throw new RequestError(400,'Invalid JSON request.');}
    return await withOrganization(user.organizationId,async transaction=>{
      if(request.method==='POST') {
        const scope=parseScope(body),createdId=randomUUID();
        await requestFor(transaction,user.organizationId,createdId).input('scope',sql.NVarChar(200),scope.scopeName)
          .input('class',sql.VarChar(16),scope.assetClass).input('tenant',sql.UniqueIdentifier,scope.tenantId).query(`
            INSERT app.Assessments(OrganizationId,AssessmentId,TemplateVersion) VALUES(@org,@id,'backups-v1');
            INSERT app.QuestionnaireScopes(OrganizationId,AssessmentId,ScopeName,AssetClass,TenantId) VALUES(@org,@id,@scope,@class,@tenant);`);
        await audit(transaction,user.organizationId,user.userId,'questionnaire.created');
        return reply(201,await load(transaction,user.organizationId,createdId));
      }
      if(!Number.isInteger(body.revision) || Number(body.revision)<0 || Number(body.revision)>=2147483647) throw new QuestionnaireInputError('A valid assessment revision is required.');
      // Acquire update lock before reading answers; stale clients cannot silently overwrite work.
      const updated=await requestFor(transaction,user.organizationId,id!).input('revision',sql.Int,body.revision).query(`
        UPDATE s SET Revision=Revision+1,UpdatedAt=SYSUTCDATETIME() FROM app.QuestionnaireScopes s
        JOIN app.Assessments a ON a.OrganizationId=s.OrganizationId AND a.AssessmentId=s.AssessmentId
        WHERE s.OrganizationId=@org AND s.AssessmentId=@id AND s.Revision=@revision AND a.Status='draft';
        SELECT @@ROWCOUNT AS Changed;`);
      if(!updated.recordset[0]?.Changed) throw new RequestError(409,'This assessment changed, is no longer a draft, or is unavailable. Reopen it before saving.');
      const current=await load(transaction,user.organizationId,id!);
      const answers=parseAnswers(body.answers,current.questions);
      await requestFor(transaction,user.organizationId,id!).query(`
        DELETE app.QuestionnaireAnswerSelections WHERE OrganizationId=@org AND AssessmentId=@id;
        DELETE app.QuestionnaireAnswers WHERE OrganizationId=@org AND AssessmentId=@id;`);
      for(const answer of answers) await insertAnswer(transaction,user.organizationId,id!,user.userId,answer,current.questions.find(q=>q.id===answer.questionId)!);
      await audit(transaction,user.organizationId,user.userId,'questionnaire.saved');
      return reply(200,await load(transaction,user.organizationId,id!));
    });
  } catch(error) {
    if(error instanceof RequestError) return reply(error.status,{error:error.message});
    if(error instanceof QuestionnaireInputError) return reply(400,{error:error.message});
    context.error('Questionnaire operation failed.');
    return reply(503,{error:'Questionnaires are temporarily unavailable. Your changes have not been confirmed saved.'});
  }
}
async function audit(transaction:sql.Transaction,org:string,user:string,action:string) {
  await new sql.Request(transaction).input('org',sql.UniqueIdentifier,org).input('user',sql.NVarChar(100),user).input('action',sql.VarChar(100),action)
    .query("INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action) VALUES(@org,'email',@user,@action)");
}
app.http('questionnaires',{methods:['GET','POST'],authLevel:'anonymous',route:'me/questionnaires',handler:questionnaires});
app.http('questionnaire',{methods:['GET','PUT'],authLevel:'anonymous',route:'me/questionnaires/{assessmentId}',handler:questionnaires});
