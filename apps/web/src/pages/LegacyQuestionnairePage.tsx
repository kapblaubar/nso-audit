import {useEffect,useState,type FormEvent,type ChangeEvent} from 'react';
import {appConfig} from '../config';

type AnswerType='yn'|'status'|'coverage'|'select'|'multi'|'date'|'text'|'number';
interface Question{id:string;version:number;prompt:string;help:string;type:AnswerType;options:{id:string;label:string}[]}
interface Answer{
  questionId:string;questionVersion:number;state:string;justification?:string;evidenceReference?:string;
  booleanValue?:boolean;textValue?:string;numberValue?:number;unit?:string;dateValue?:string;
  selectedOptionId?:string;selections?:string[];totalInScope?:number;totalCovered?:number;
  estimatedPercentage?:number;measurementDate?:string;measurementSource?:string;
}
interface Assessment{id:string;scopeName:string;assetClass:string;tenantId:string|null;revision:number;status:string;questions:Question[];answers:Answer[]}
const classes=[['END','Endpoints'],['SRV','Servers'],['DB','Databases'],['SaaS','Email / collaboration / SaaS'],['CLD','Cloud workloads / storage'],['NET','Network / security configuration']];
const valueKeys=['booleanValue','textValue','numberValue','unit','dateValue','selectedOptionId','selections','totalInScope','totalCovered','estimatedPercentage','measurementDate','measurementSource'] as const;
export function LegacyQuestionnairePage({organizationId,workspaceName,role,onBack,initialAssessmentId}:{organizationId:string;workspaceName:string;role:string;onBack:()=>void;initialAssessmentId:string}){
  const [assessment,setAssessment]=useState<Assessment>();
  const [answers,setAnswers]=useState<Record<string,Answer>>({});
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
  const [coverageModes,setCoverageModes]=useState<Record<string,string>>({});
  const canWrite=['owner','admin','contributor'].includes(role);
  async function call<T>(suffix='',body?:object,method='GET'):Promise<T>{
    if(!appConfig.apiBaseUrl)throw new Error('The questionnaire service is not configured.');
    const response=await fetch(`${appConfig.apiBaseUrl}/me/questionnaires${suffix}`,{method,headers:{
      Authorization:`Bearer ${sessionStorage.getItem('nso.customerSession')??''}`,'X-Nso-Organization-Id':organizationId,
      ...(body?{'Content-Type':'application/json'}:{}),
    },...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json() as T&{error?:string};
    if(!response.ok)throw new Error(result.error??'The questionnaire request failed.');
    return result;
  }
  useEffect(()=>{let cancelled=false;void call<Assessment>(`/${initialAssessmentId}`).then(data=>{if(!cancelled)accept(data);})
    .catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'Could not load questionnaires.');}).finally(()=>{if(!cancelled)setBusy(false);});return()=>{cancelled=true;};},[organizationId]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function accept(data:Assessment){setAssessment(data);setAnswers(Object.fromEntries(data.answers.map(a=>[a.questionId,a])));setCoverageModes(Object.fromEntries(data.answers.map(a=>[a.questionId,a.estimatedPercentage!==undefined?'estimate':'counts'])));setDirty(false);}
  function leave(action:()=>void){if(!dirty||window.confirm('Discard unsaved questionnaire changes?')){setDirty(false);action();}}
  async function open(id:string){setBusy(true);setError('');setNotice('');try{accept(await call<Assessment>(`/${id}`));}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();if(!assessment)return;setBusy(true);setError('');setNotice('');try{
    const saved=await call<Assessment>(`/${assessment.id}`,{revision:assessment.revision,answers:Object.values(answers)},'PUT');
    accept(saved);setNotice('Draft saved. You can return later to continue.');
  }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  function change(question:Question,patch:Partial<Answer>){setAnswers(current=>({...current,[question.id]:{
    questionId:question.id,questionVersion:question.version,state:'answered',...current[question.id],...patch,
  }}));setDirty(true);setNotice('');}
  function state(question:Question,value:string){
    setAnswers(current=>{const updated={...current};if(!value)delete updated[question.id];else{
      const next={...current[question.id],questionId:question.id,questionVersion:question.version,state:value};
      for(const key of valueKeys)delete next[key];updated[question.id]=next;
    }return updated;});setDirty(true);setNotice('');
  }
  function stringField(question:Question,answer:Answer,key:'textValue'|'unit'|'dateValue'|'measurementDate'|'measurementSource'|'justification'|'evidenceReference',label:string,type='text',required=false,maxLength=2000){
    const props={id:`${question.id}-${key}`,value:answer[key]??'',required,maxLength,onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
      const next={...answer};if(event.target.value)next[key]=event.target.value;else delete next[key];setAnswers(current=>({...current,[question.id]:next}));setDirty(true);setNotice('');
    }};
    return <label className="management-field"><span>{label}</span>{key==='textValue'||key==='justification'?<textarea {...props} rows={3}/>:<input {...props} type={type}/>}</label>;
  }
  function numeric(question:Question,answer:Answer,key:'numberValue'|'totalInScope'|'totalCovered'|'estimatedPercentage',label:string,max:number,integer=false){return <label className="management-field"><span>{label}</span><input type="number" min={0} max={max} step={integer?1:0.0001} required value={answer[key]??''} onChange={event=>{
    setAnswers(current=>{const next={...current[question.id]!};if(event.target.value==='')delete next[key];else next[key]=Number(event.target.value);return {...current,[question.id]:next};});setDirty(true);setNotice('');
  }}/></label>;}
  function input(question:Question,answer:Answer){switch(question.type){
    case 'yn':return <label className="management-field"><span>Answer</span><select required value={answer.booleanValue===undefined?'':String(answer.booleanValue)} onChange={event=>change(question,{booleanValue:event.target.value==='true'})}><option value="" disabled>Choose</option><option value="true">Yes</option><option value="false">No</option></select></label>;
    case 'status':case 'select':return <label className="management-field"><span>Answer</span><select required value={answer.selectedOptionId??''} onChange={event=>change(question,{selectedOptionId:event.target.value})}><option value="" disabled>Choose</option>{question.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
    case 'text':return stringField(question,answer,'textValue','Answer','text',true,4000);
    case 'date':return stringField(question,answer,'dateValue','Date','date',true);
    case 'number':return <div className="questionnaire-grid">{numeric(question,answer,'numberValue','Value',99999999999999)}{stringField(question,answer,'unit','Unit (for example, days)','text',true,32)}</div>;
    case 'multi':return <div>{question.options.map(option=><label className="questionnaire-choice" key={option.id}><input type="checkbox" checked={answer.selections?.includes(option.id)??false} onChange={event=>{
      const selected=answer.selections??[];change(question,{selections:event.target.checked?(option.id==='none'?['none']:[...selected.filter(id=>id!=='none'),option.id]):selected.filter(id=>id!==option.id)});
    }}/>{option.label}</label>)}</div>;
    case 'coverage':{
      const estimate=coverageModes[question.id]==='estimate';
      const percentage=answer.totalInScope && answer.totalCovered!==undefined ? answer.totalCovered/answer.totalInScope*100 : undefined;
      return <><label className="management-field"><span>Measurement method</span><select value={estimate?'estimate':'counts'} onChange={event=>{
        setCoverageModes(current=>({...current,[question.id]:event.target.value}));setAnswers(current=>{const next={...current[question.id]!};delete next.totalInScope;delete next.totalCovered;delete next.estimatedPercentage;return {...current,[question.id]:next};});setDirty(true);setNotice('');
      }}><option value="counts">Actual counts</option><option value="estimate">Estimated percentage</option></select></label><div className="questionnaire-grid">{estimate?numeric(question,answer,'estimatedPercentage','Estimated coverage (%)',100):<>{numeric(question,answer,'totalInScope','Total systems in scope',2147483647,true)}{numeric(question,answer,'totalCovered','Covered systems',2147483647,true)}</>}</div>
      {percentage!==undefined?<p>Calculated coverage: {percentage.toFixed(1)}%</p>:null}
      <p className="management-help">Zero systems requires an applicability review. Covered systems cannot exceed total systems.</p>
      <div className="questionnaire-grid">{stringField(question,answer,'measurementDate','Measurement date','date',true)}{stringField(question,answer,'measurementSource','Measurement source','text',true,500)}</div></>;
    }
  }}
  const readOnly=!canWrite || assessment?.status!=='draft';
  return <main className="questionnaire-page"><nav className="nav"><strong>NSO Audit · {workspaceName}</strong><button className="text-button" disabled={busy} onClick={()=>leave(onBack)}>Your workspaces</button></nav>
    <h1>Client assessment questionnaire</h1><p>This earlier assessment contains backup answers only. Your saved data remains available here. Return to the client assessment list to start the complete questionnaire.</p>
    {error?<p className="management-error" role="alert">{error}</p>:null}{notice?<p className="management-success" role="status">{notice}</p>:null}
    {busy?<p role="status">Loading or saving questionnaire…</p>:null}
    {!assessment?null:<>
      <button className="text-button" disabled={busy} onClick={()=>leave(onBack)}>All client assessments</button>
      <h2>{assessment.scopeName}</h2><p>{classes.find(c=>c[0]===assessment.assetClass)?.[1]} · {Object.keys(answers).length} of {assessment.questions.length} questions have a response. This is completion, not a security grade.</p>
      {readOnly?<p>This assessment is read-only.</p>:null}
      <form onSubmit={event=>void save(event)}><fieldset disabled={busy||readOnly}>
        {assessment.questions.map(question=>{const answer=answers[question.id];return <section className="questionnaire-question" key={question.id} aria-labelledby={`${question.id}-title`}>
          <h3 id={`${question.id}-title`}>{question.prompt}</h3><p className="management-help">{question.help}</p>
          <label className="management-field"><span>Response status</span><select value={answer?.state??''} onChange={event=>state(question,event.target.value)}><option value="">Unanswered</option><option value="answered">Provide answer</option><option value="unknown">Unknown</option><option value="notApplicable">Not applicable</option>{question.type==='date'?<option value="never">Never</option>:null}</select></label>
          {answer?.state==='answered'?input(question,answer):null}
          {answer?<>{stringField(question,answer,'justification',answer.state==='notApplicable'?'Why is this not applicable?':'Explanation / exceptions / owner','text',answer.state==='notApplicable'||answer.selectedOptionId==='other')}{stringField(question,answer,'evidenceReference','Evidence reference (optional)')}</>:null}
        </section>;})}
        {!readOnly?<div className="questionnaire-save"><button className="management-primary" type="submit" disabled={!dirty}>Save draft</button><span>{dirty?'Unsaved changes':'No unsaved changes'}</span></div>:null}
      </fieldset></form>
    </>}
  </main>;
}
