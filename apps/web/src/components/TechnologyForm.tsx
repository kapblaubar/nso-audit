import {useId,useState} from 'react';
import type {ClientAnswer,ClientQuestion} from '../clientAssessmentApi';

const labels:Record<string,string>={
  'TEC-PURPOSE':'Business activities supported',
  'TEC-BUSINESS-OWNER':'Business owner',
  'TEC-TECHNICAL-OWNER':'Maintained by / support provider',
  'TEC-INVENTORY':'Listed in your inventory?',
  'TEC-COVERAGE':'Inventory coverage',
  'TEC-SUPPORT':'Still supported by the vendor?',
  'TEC-SUPPORT-COVERAGE':'Supported items',
  'TEC-CHECKED':'Details last checked',
  'TEC-ENDPOINTS-1':'Device types and approximate counts',
  'TEC-ENDPOINTS-2':'Company-owned or personal?',
  'TEC-ENDPOINTS-3':'Operating systems and versions',
  'TEC-ENDPOINTS-4':'How are devices assigned and retired?',
  'TEC-SERVERS-1':'Applications and services running here',
  'TEC-SERVERS-2':'Physical or virtual?',
  'TEC-SERVERS-3':'Hosting location',
  'TEC-SERVERS-4':'Operating systems and versions',
  'TEC-DATABASES-1':'Applications using this database',
  'TEC-DATABASES-2':'Database platform and version',
  'TEC-DATABASES-3':'Hosting location',
  'TEC-DATABASES-4':'Production, development or test?',
  'TEC-NETWORK-DEVICES-1':'Equipment types and approximate counts',
  'TEC-NETWORK-DEVICES-2':'Locations served',
  'TEC-NETWORK-DEVICES-3':'Manufacturers and models',
  'TEC-NETWORK-DEVICES-4':'Configuration and firmware managed by',
  'TEC-CLOUD-WORKLOADS-1':'Cloud provider and account / subscription',
  'TEC-CLOUD-WORKLOADS-2':'Business services running here',
  'TEC-CLOUD-WORKLOADS-3':'Production, development or test?',
  'TEC-CLOUD-WORKLOADS-4':'How are cloud resources tracked?',
  'TEC-BUSINESS-APPLICATIONS-1':'Application purpose and users',
  'TEC-BUSINESS-APPLICATIONS-2':'Application type',
  'TEC-BUSINESS-APPLICATIONS-3':'Hosting and support',
  'TEC-BUSINESS-APPLICATIONS-4':'Connected applications and databases',
  'TEC-SAAS-SERVICES-1':'Service and company account',
  'TEC-SAAS-SERVICES-2':'Business use and approximate user count',
  'TEC-SAAS-SERVICES-3':'Service administrator',
  'TEC-SAAS-SERVICES-4':'Subscription and renewal owner',
};
const suggestions:Record<string,string[]>={
  'TEC-BUSINESS-APPLICATIONS-2':['Vendor product','Custom-built','Vendor product with custom development'],
  'TEC-ENDPOINTS-2':['Company-owned','Personal','Company-owned and personal'],
  'TEC-SERVERS-2':['Physical','Virtual','Physical and virtual'],
  'TEC-DATABASES-4':['Production','Development','Test','Production, development and test'],
  'TEC-CLOUD-WORKLOADS-3':['Production','Development','Test','Production, development and test'],
};
export function TechnologyForm({questions,answers,onChange,disabled}:{disabled:boolean;questions:ClientQuestion[];answers:Record<string,ClientAnswer>;onChange:(id:string,answer:ClientAnswer|undefined)=>void}){
  const [options,setOptions]=useState(false);
  return <>
    <p className="management-help">Leave details blank if you're not sure.</p>
    <div className="technology-form-grid">{questions.map(question=><fieldset key={question.id} className={question.type==='coverage'?'technology-wide':undefined} disabled={disabled}><TechnologyField question={question} answer={answers[question.id]} options={options} onChange={answer=>onChange(question.id,answer)}/></fieldset>)}</div>
    <label className="questionnaire-choice technology-options"><input type="checkbox" checked={options} onChange={event=>setOptions(event.target.checked)}/>Show notes and answer options</label>
  </>;
}
function TechnologyField({question:q,answer:a,options,onChange}:{question:ClientQuestion;answer:ClientAnswer|undefined;options:boolean;onChange:(answer:ClientAnswer|undefined)=>void}){
  const id=useId(),label=labels[q.id]??q.prompt;
  const [estimated,setEstimated]=useState(a?.estimatedPercentage!==undefined);
  const special=a&&a.state!=='answered';
  function update(patch:{[K in keyof ClientAnswer]?:ClientAnswer[K]|undefined}){
    const next=Object.fromEntries(Object.entries({...a,...patch,questionId:q.id,questionVersion:q.version,state:'answered'}).filter(([,value])=>value!==undefined)) as unknown as ClientAnswer;
    const values=[next.textValue,next.selectedOptionId,next.booleanValue,next.dateValue,next.totalInScope,next.totalCovered,next.estimatedPercentage,next.measurementDate,next.measurementSource];
    onChange(values.some(v=>v!==undefined&&v!=='')?next:undefined);
  }
  function state(value:string){
    if(!value||value==='answered'){if(special||!value)onChange(undefined);return;}
    onChange({questionId:q.id,questionVersion:q.version,state:value,...(a?.justification?{justification:a.justification}:{}),...(a?.evidenceReference?{evidenceReference:a.evidenceReference}:{})});
  }
  const stateOptions=<><option value="unknown">Not sure</option><option value="notApplicable">Not applicable</option>{q.type==='date'?<option value="never">Never</option>:null}</>;
  const responseState=<select id={id} value={special?a.state:'answered'} onChange={e=>state(e.target.value)}><option value="answered">Enter an answer</option>{stateOptions}</select>;
  function number(key:'totalInScope'|'totalCovered'|'estimatedPercentage',title:string,max:number){return <label className="management-field"><span>{title}</span><input type="number" required={!!a} min={key==='totalInScope'?1:0} max={max} step={key==='estimatedPercentage'?'0.0001':'1'} value={a?.[key]??''} onChange={e=>update({[key]:e.target.value===''?undefined:Number(e.target.value)})}/></label>;}
  const select=q.type==='yn'||q.type==='status'||q.type==='select';
  return <section className={`technology-field${q.type==='coverage'?' technology-wide':''}`} aria-label={q.prompt}>
    {q.type==='coverage'?<><h4>{label}</h4>{special?<label className="management-field"><span>{label}</span>{responseState}</label>:<>
      <label className="management-field"><span>Measure by</span><select value={estimated?'estimate':'counts'} onChange={e=>{setEstimated(e.target.value==='estimate');update({totalInScope:undefined,totalCovered:undefined,estimatedPercentage:undefined});}}><option value="counts">Item counts</option><option value="estimate">Estimated percentage</option></select></label>
      <div className="technology-measurement-grid">{estimated?number('estimatedPercentage','Covered (%)',100):<>{number('totalInScope','Items in total',2147483647)}{number('totalCovered','Items covered',2147483647)}</>}
        <label className="management-field"><span>As of</span><input type="date" required={!!a} value={a?.measurementDate??''} onChange={e=>update({measurementDate:e.target.value||undefined})}/></label>
        <label className="management-field"><span>Source</span><input required={!!a} maxLength={500} placeholder="For example, device list" value={a?.measurementSource??''} onChange={e=>update({measurementSource:e.target.value||undefined})}/></label>
      </div></>}
    </>:<label className="management-field" htmlFor={id}><span>{label}</span>{select?<select id={id} value={special?a.state:q.type==='yn'?(a?.booleanValue===undefined?'':String(a.booleanValue)):a?.selectedOptionId??''} onChange={e=>{
      const value=e.target.value;if(!value||['unknown','notApplicable'].includes(value)){state(value);return;}
      update(q.type==='yn'?{booleanValue:value==='true'}:{selectedOptionId:value});
    }}><option value="">Choose</option>{q.type==='yn'?<><option value="true">Yes</option><option value="false">No</option></>:q.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}{stateOptions}</select>:special?responseState:<input id={id} type={q.type==='date'?'date':'text'} maxLength={4000} list={suggestions[q.id]?`${id}-suggestions`:undefined} value={q.type==='date'?a?.dateValue??'':a?.textValue??''} onChange={e=>update(q.type==='date'?{dateValue:e.target.value||undefined}:{textValue:e.target.value||undefined})}/>}</label>}
    {suggestions[q.id]?<datalist id={`${id}-suggestions`}>{suggestions[q.id]!.map(value=><option key={value} value={value}/>)}</datalist>:null}
    {a?.state==='notApplicable'?<label className="management-field"><span>Why doesn't this apply?</span><input required maxLength={2000} value={a.justification??''} onChange={e=>onChange({...a,justification:e.target.value})}/></label>:null}
    {options?<div className="technology-extra-options">
      {!select&&!special?<label className="management-field"><span>Answer options</span><select value="answered" onChange={e=>state(e.target.value)}><option value="answered">Enter an answer</option>{stateOptions}<option value="">Clear answer</option></select></label>:null}
      {a?<>{a.state!=='notApplicable'?<label className="management-field"><span>Notes</span><textarea rows={2} maxLength={2000} value={a.justification??''} onChange={e=>onChange({...a,justification:e.target.value})}/></label>:null}<label className="management-field"><span>Evidence reference</span><input maxLength={2000} value={a.evidenceReference??''} onChange={e=>onChange({...a,evidenceReference:e.target.value})}/></label><button type="button" className="text-button" onClick={()=>onChange(undefined)}>Clear answer</button></>:null}
    </div>:null}
  </section>;
}
