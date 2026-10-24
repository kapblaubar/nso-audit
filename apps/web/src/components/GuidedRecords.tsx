import type {ClientAnswer,ClientQuestion,Field} from '../clientAssessmentApi';

type Row=NonNullable<ClientAnswer['records']>[number];
export function fieldVisible(field:Field,row:Row){
  if(field.onlyWhenPresent&&!row[field.id])return false;
  if(!field.when)return true;
  const value=row[field.when.field];
  return field.when.values.some(option=>Array.isArray(value)?value.includes(option):value===option);
}

export function GuidedRecords({question,answer,onChange}:{question:ClientQuestion;answer:ClientAnswer|undefined;onChange:(patch:Partial<ClientAnswer>)=>void}){
  const guide=question.guided!,rows=answer?.records??[];
  const selector=guide.selector;
  const save=(next:Row[])=>onChange({records:next});
  function edit(index:number,field:Field,value:Row[string]|undefined){
    const next=rows.map(row=>({...row}));
    if(value===undefined)delete next[index]![field.id];else next[index]![field.id]=value;
    for(const candidate of question.fields)if(candidate.when&&!fieldVisible(candidate,next[index]!))delete next[index]![candidate.id];
    save(next);
  }
  function add(value?:string){if(rows.length<100)save([...rows,selector?{[selector]:value!}:{}]);}
  return <div className="guided-records">
    {selector?<div className="guided-choices" role="group" aria-label={guide.label}>{guide.choices?.map(choice=>{
      const selected=rows.some(row=>row[selector]===choice.id);
      return <label className="questionnaire-choice" key={choice.id}><input type="checkbox" checked={selected} disabled={!selected&&rows.length>=100} onChange={event=>event.target.checked?add(choice.id):save(rows.filter(row=>row[selector]!==choice.id))}/>{choice.label}</label>;
    })}</div>:null}
    {rows.map((row,index)=>{
      const selection=selector?guide.choices?.find(choice=>choice.id===row[selector]):undefined;
      const title=selection?.label??(typeof row.provider==='string'&&row.provider?row.provider:'Provider');
      return <fieldset className="assessment-record" key={index}><legend>{title} {index+1}</legend><div className="questionnaire-grid">
        {question.fields.filter(field=>field.id!==selector&&fieldVisible(field,row)).map(field=>{
          const value=row[field.id];
          if(field.type==='multi')return <fieldset key={field.id}><legend>{field.label}</legend>{field.options?.map(option=><label className="questionnaire-choice" key={option.id}><input type="checkbox" checked={Array.isArray(value)&&value.includes(option.id)} onChange={event=>{const selected=Array.isArray(value)?value:[];edit(index,field,event.target.checked?[...selected,option.id]:selected.filter(v=>v!==option.id));}}/>{option.label}</label>)}</fieldset>;
          return <label className="management-field" key={field.id}><span>{field.label}</span>{field.type==='select'?<select required={field.required} value={typeof value==='string'?value:''} onChange={event=>edit(index,field,event.target.value||undefined)}><option value="">{field.required?'Choose':'Choose if known'}</option>{field.options?.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>:field.id==='previousDetails'?<textarea rows={3} maxLength={field.maxLength??1000} value={typeof value==='string'?value:''} onChange={event=>edit(index,field,event.target.value||undefined)}/>:<input required={field.required} maxLength={field.maxLength??1000} placeholder={field.placeholder} value={typeof value==='string'||typeof value==='number'?value:''} onChange={event=>edit(index,field,event.target.value||undefined)}/>}</label>;
        })}
      </div><button type="button" className="text-button" onClick={()=>save(rows.filter((_,i)=>i!==index))}>Remove {title} {index+1}</button>
        {selector?<button type="button" className="management-secondary" disabled={rows.length>=100} onClick={()=>add(String(row[selector]))}>{guide.kind==='environments'?`Add another ${title} tenant, account or site`:guide.kind==='storage'?`Add another location for ${title}`:guide.kind==='purposes'?`Add another requirement for ${title}`:`Add another ${title} activity`}</button>:null}
      </fieldset>;
    })}
    {!selector?<button type="button" className="management-secondary" disabled={rows.length>=100} onClick={()=>add()}>{guide.addLabel}</button>:null}
  </div>;
}
