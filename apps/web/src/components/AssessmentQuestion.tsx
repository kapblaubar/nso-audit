import {useState,type ChangeEvent} from 'react';
import type {ClientAnswer,ClientQuestion,Field,Review} from '../clientAssessmentApi';
export function RecordField({field,value,onChange,allowUnknown=true}:{field:Field;value:string|number|null|undefined;onChange:(value:string|number|null|undefined)=>void;allowUnknown?:boolean}){
  const unknown=value===null;
  return <div className="assessment-record-field"><label className="management-field"><span>{field.label}</span>{field.type==='select'?<select required={field.required&&!unknown} value={unknown?'__unknown':value??''} onChange={event=>onChange(event.target.value==='__unknown'?null:event.target.value||undefined)}><option value="">Choose</option>{allowUnknown?<option value="__unknown">Unknown</option>:null}{field.options?.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>:<input required={field.required&&!unknown} disabled={unknown} type={field.type==='number'?'number':field.type==='date'?'date':'text'} min={field.type==='number'?0:undefined} max={field.type==='number'?99999999999999:undefined} step={field.type==='number'?0.0001:undefined} maxLength={1000} value={unknown?'':value??''} onChange={event=>onChange(event.target.value===''?undefined:field.type==='number'?Number(event.target.value):event.target.value)}/>}</label>
    {allowUnknown&&field.type!=='select'?<label className="questionnaire-choice"><input type="checkbox" checked={unknown} onChange={event=>onChange(event.target.checked?null:undefined)}/>Unknown {field.label.toLowerCase()}</label>:null}
  </div>;
}
export function AssessmentQuestion({question,answer,onChange,disabled,review,canReview,onReview}:{question:ClientQuestion;answer:ClientAnswer|undefined;onChange:(answer:ClientAnswer|undefined)=>void;disabled:boolean;review:Review|undefined;canReview:boolean;onReview:(review:Review)=>void}){
  const [coverageMode,setCoverageMode]=useState(answer?.estimatedPercentage!==undefined?'estimate':'counts');
  const [reviewDraft,setReviewDraft]=useState<Review>(review??{questionId:question.id,questionVersion:question.version,conclusion:'unknown',evidenceState:'declared',collectionState:'notRequested',notes:'',actionOwner:'',targetDate:''});
  const intake=['company','profiles'].includes(question.sectionId)&&!question.reviewerOnly;
  const needsExplanation=answer?.state==='notApplicable'||answer?.selectedOptionId==='other'||answer?.selections?.includes('other');
  function update(next:Partial<ClientAnswer>){
    const value={questionId:question.id,questionVersion:question.version,state:'answered',...(question.units.length===1?{unit:question.units[0]}:{}),...next} as ClientAnswer;
    const keys=['textValue','booleanValue','numberValue','dateValue','selectedOptionId','selections','records','totalInScope','totalCovered','estimatedPercentage','measurementDate','measurementSource'] as const;
    const hasValue=keys.some(key=>{const v=value[key];return Array.isArray(v)?v.length>0:v!==undefined&&v!=='';});
    onChange(value.state==='answered'&&!hasValue?undefined:value);
  }
  const change=(patch:Partial<ClientAnswer>)=>update({...answer,...patch});
  function special(state:string){onChange({questionId:question.id,questionVersion:question.version,state,...(answer?.justification?{justification:answer.justification}:{})});}
  function textField(key:'textValue'|'unit'|'dateValue'|'measurementDate'|'measurementSource'|'justification'|'evidenceReference',label:string,type='text',required=false,maxLength=2000){
    const props={value:answer?.[key]??'',required:required&&!!answer,maxLength,onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{const next={...answer!};if(event.target.value)next[key]=event.target.value;else delete next[key];update(next);}};
    return <label className="management-field"><span>{label}</span>{key==='textValue'||key==='justification'?<textarea {...props} rows={3}/>:<input {...props} type={type}/>}</label>;
  }
  function numeric(key:'numberValue'|'totalInScope'|'totalCovered'|'estimatedPercentage',label:string,max:number,integer=false){return <label className="management-field"><span>{label}</span><input required={!!answer} type="number" min={key==='totalInScope'?1:0} max={max} step={integer?1:0.0001} value={answer?.[key]??''} onChange={event=>{const next={...answer!};if(event.target.value==='')delete next[key];else next[key]=Number(event.target.value);update(next);}}/></label>;}
  function input(){switch(question.type){
    case 'yn':return <label className="management-field"><span>Answer</span><select required={!!answer} value={answer?.booleanValue===undefined?'':String(answer.booleanValue)} onChange={event=>change({booleanValue:event.target.value==='true'})}><option value="" disabled>Choose</option><option value="true">Yes</option><option value="false">No</option></select></label>;
    case 'status':case 'select':return <label className="management-field"><span>Answer</span><select required={!!answer} value={answer?.selectedOptionId??''} onChange={event=>change({selectedOptionId:event.target.value})}><option value="" disabled>Choose</option>{question.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
    case 'text':return textField('textValue',question.sourceId==='SCP-01'?'Company or location name':'Answer','text',true,4000);
    case 'date':return textField('dateValue','Date','date',true);
    case 'number':return <div className="questionnaire-grid">{numeric('numberValue','Value',99999999999999,question.sourceId==='SCP-03')}{question.units.length?<label className="management-field"><span>Unit</span><select required={!!answer} value={answer?.unit??''} onChange={event=>change({unit:event.target.value})}><option value="" disabled>Choose</option>{question.units.map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label>:textField('unit','Unit','text',true,32)}</div>;
    case 'multi':return <div>{question.options.map(option=><label className="questionnaire-choice" key={option.id}><input type="checkbox" checked={answer?.selections?.includes(option.id)??false} onChange={event=>{const selected=answer?.selections??[];change({selections:event.target.checked?(option.id==='none'?['none']:[...selected.filter(id=>id!=='none'),option.id]):selected.filter(id=>id!==option.id)});}}/>{option.label}</label>)}</div>;
    case 'coverage':{
      const percent=answer?.totalInScope&&answer.totalCovered!==undefined?answer.totalCovered/answer.totalInScope*100:undefined;
      return <><label className="management-field"><span>Measurement method</span><select value={coverageMode} onChange={event=>{setCoverageMode(event.target.value);const next={...answer!};delete next.totalInScope;delete next.totalCovered;delete next.estimatedPercentage;update(next);}}><option value="counts">Actual counts</option><option value="estimate">Estimated percentage</option></select></label>
      <div className="questionnaire-grid">{coverageMode==='estimate'?numeric('estimatedPercentage','Estimated coverage (%)',100):<>{numeric('totalInScope','Total in scope',2147483647,true)}{numeric('totalCovered','Total covered',2147483647,true)}</>}</div>
      {percent!==undefined?<p>Calculated coverage: {percent.toFixed(1)}%</p>:null}<p className="management-help">Zero in scope requires an applicability review. Covered cannot exceed total.</p><div className="questionnaire-grid">{textField('measurementDate','Measurement date','date',true)}{textField('measurementSource','Measurement source','text',true,500)}</div></>;
    }
    case 'records':return <div>{(answer?.records??[]).map((row,index)=><div className="assessment-record" key={index}><strong>Item {index+1}</strong><div className="questionnaire-grid">{question.fields.map(field=><RecordField key={field.id} field={field} value={row[field.id]} onChange={value=>{const rows=structuredClone(answer?.records??[]);if(value===undefined)delete rows[index]![field.id];else rows[index]![field.id]=value;change({records:rows});}}/>)}</div><button type="button" className="text-button" onClick={()=>change({records:answer!.records!.filter((_,i)=>i!==index)})}>Remove item {index+1}</button></div>)}<button type="button" className="management-secondary" disabled={(answer?.records?.length??0)>=100} onClick={()=>change({records:[...(answer?.records??[]),{}]})}>Add item</button></div>;
  }}
  const reviewSelect=(key:'conclusion'|'evidenceState'|'collectionState',label:string,choices:[string,string][])=> <label className="management-field"><span>{label}</span><select disabled={!canReview} value={reviewDraft[key]} onChange={event=>setReviewDraft(current=>({...current,[key]:event.target.value}))}>{choices.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>;
  return <section className="questionnaire-question" aria-label={question.prompt}>
    <h3>{question.prompt}</h3>{question.help&&!/^(Text|Number|Multi|Select|Status|YN|Coverage|Date|Repeating)\b/i.test(question.help)?<p className="management-help">{question.help}</p>:null}
    {question.reviewerOnly?<p>Maintained by an owner or administrator reviewer.</p>:null}
    <fieldset disabled={disabled||question.reviewerOnly&&!canReview}>
      {!answer||answer.state==='answered'?input():<p>{answer.state==='unknown'?'Unknown':answer.state==='never'?'Never':'Not applicable'}</p>}
      <div className="questionnaire-answer-actions">
        {answer&&answer.state!=='answered'?<button type="button" className="text-button" onClick={()=>onChange(undefined)}>Enter an answer</button>:null}
        {!intake?<><button type="button" className="text-button" onClick={()=>special('unknown')}>I do not know</button><button type="button" className="text-button" onClick={()=>special('notApplicable')}>Not applicable</button>{question.type==='date'?<button type="button" className="text-button" onClick={()=>special('never')}>Never</button>:null}</>:null}
        {answer?<button type="button" className="text-button" onClick={()=>onChange(undefined)}>Clear answer</button>:null}
      </div>
      {needsExplanation?textField('justification',answer?.state==='notApplicable'?'Why is this not applicable?':'Please describe Other','text',true):null}
      {answer&&(!intake||answer.justification||answer.evidenceReference)?<details><summary>Additional details (optional)</summary>
        {!needsExplanation?textField('justification','Notes (optional)'):null}
        {!intake||answer.evidenceReference?textField('evidenceReference','Evidence reference (optional)'):null}
      </details>:null}
    </fieldset>
    {(!intake&&(canReview||review)||review)?<details className="assessment-review"><summary>Reviewer conclusion</summary><p>Recorded separately from the client's original answer. Unknown or missing evidence is not a pass.</p>
      <div className="questionnaire-grid">{reviewSelect('conclusion','Reviewer conclusion',[['unknown','Unknown'],['inPlace','In place'],['partly','Partly in place'],['gap','Gap'],['notApplicable','Not applicable']])}{reviewSelect('evidenceState','Evidence status',[['declared','Declared'],['observed','Observed'],['checked','Reviewer checked'],['missing','Missing'],['conflicting','Conflicting']])}{reviewSelect('collectionState','Collection status',[['notRequested','Not requested'],['complete','Complete'],['partial','Partial'],['failed','Failed'],['notConnected','Not connected'],['unsupported','Unsupported']])}</div>
      <label className="management-field"><span>Review rationale and actions</span><textarea disabled={!canReview} maxLength={2000} value={reviewDraft.notes} onChange={event=>setReviewDraft(current=>({...current,notes:event.target.value}))}/></label>
      <div className="questionnaire-grid"><label className="management-field"><span>Action owner</span><input disabled={!canReview} maxLength={200} value={reviewDraft.actionOwner} onChange={event=>setReviewDraft(current=>({...current,actionOwner:event.target.value}))}/></label><label className="management-field"><span>Target date</span><input disabled={!canReview} type="date" value={reviewDraft.targetDate} onChange={event=>setReviewDraft(current=>({...current,targetDate:event.target.value}))}/></label></div>
      {canReview?<button type="button" className="management-secondary" disabled={disabled} onClick={()=>onReview(reviewDraft)}>Save reviewer conclusion</button>:null}
    </details>:null}
  </section>;
}
