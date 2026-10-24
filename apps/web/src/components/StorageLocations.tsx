import {useEffect,useRef,useState} from 'react';
import type {ClientAnswer,ClientQuestion} from '../clientAssessmentApi';

type Row=NonNullable<ClientAnswer['records']>[number];
interface Location {details:Row;types:string[];description:string}

// SQL/API rows remain one data type per location. Present matching locations once.
function groupLocations(records:Row[]):Location[]{
  const locations:Location[]=[];
  for(const record of records){
    const {dataType,description,...details}=record;
    const key=JSON.stringify(Object.entries(details).sort(([a],[b])=>a.localeCompare(b)));
    let location=locations.find(item=>JSON.stringify(Object.entries(item.details).sort(([a],[b])=>a.localeCompare(b)))===key&&!(dataType==='other'&&item.description&&item.description!==description));
    if(!location){location={details,types:[],description:''};locations.push(location);}
    if(typeof dataType==='string'&&!location.types.includes(dataType))location.types.push(dataType);
    if(typeof description==='string')location.description=description;
  }
  return locations;
}

export function StorageLocations({question,answer,onChange}:{question:ClientQuestion;answer:ClientAnswer|undefined;onChange:(patch:Partial<ClientAnswer>)=>void}){
  const [locations,setLocations]=useState(()=>groupLocations(answer?.records??[]));
  const lastSent=useRef(answer?.records);
  useEffect(()=>{if(answer?.records!==lastSent.current){lastSent.current=answer?.records;setLocations(groupLocations(answer?.records??[]));}},[answer?.records]);
  const types=question.fields.find(field=>field.id==='dataType')?.options??[];
  const systems=question.fields.find(field=>field.id==='system')?.options??[];
  const count=locations.reduce((sum,location)=>sum+location.types.length,0);
  function save(next:Location[]){
    setLocations(next);
    const records=next.flatMap(location=>location.types.map(dataType=>({...location.details,dataType,...(dataType==='other'?{description:location.description}:{} )})));
    lastSent.current=records.length?records:undefined;
    onChange({records});
  }
  function edit(index:number,patch:Partial<Location>){save(locations.map((location,i)=>i===index?{...location,...patch}:location));}
  function detail(index:number,key:string,value:string){
    const details={...locations[index]!.details};
    if(value)details[key]=value;else delete details[key];
    if(key==='system'&&value!=='other')delete details.otherSystem;
    edit(index,{details});
  }
  const text=(index:number,key:string,label:string,required=false,placeholder?:string)=> <label className="management-field"><span>{label}</span><input required={required} maxLength={1000} placeholder={placeholder} value={typeof locations[index]!.details[key]==='string'?String(locations[index]!.details[key]):''} onChange={event=>detail(index,key,event.target.value)}/></label>;
  return <div className="guided-records">
    {locations.map((location,index)=><fieldset className="assessment-record" key={index}><legend>Storage location {index+1}</legend>
      <div className="questionnaire-grid">
        <label className="management-field"><span>Application or storage system</span><select required value={typeof location.details.system==='string'?location.details.system:''} onChange={event=>detail(index,'system',event.target.value)}><option value="">Choose a system</option>{systems.map(system=><option key={system.id} value={system.id}>{system.label}</option>)}</select></label>
        {text(index,'location','Site, folder or application name (optional)',false,'For example, HR SharePoint site')}
        {location.details.system==='other'?text(index,'otherSystem','Other storage system',true):null}
        <fieldset><legend>Types of information stored here</legend><p className="management-help">Select all that apply.</p><div className="guided-choices">{types.map((type,i)=><label className="questionnaire-choice" key={type.id}><input type="checkbox" required={i===0&&!location.types.length} checked={location.types.includes(type.id)} disabled={!location.types.includes(type.id)&&count>=100} onChange={event=>edit(index,{types:event.target.checked?[...location.types,type.id]:location.types.filter(value=>value!==type.id),...(type.id==='other'&&!event.target.checked?{description:''}:{})})}/>{type.label}</label>)}</div></fieldset>
        {location.types.includes('other')?<label className="management-field"><span>Describe the other information</span><input required maxLength={1000} value={location.description} onChange={event=>edit(index,{description:event.target.value})}/></label>:null}
        {text(index,'owner','Person or team responsible (optional)')}
        {location.details.previousDetails?<label className="management-field"><span>Previous details (optional)</span><textarea rows={3} maxLength={8000} value={String(location.details.previousDetails)} onChange={event=>detail(index,'previousDetails',event.target.value)}/></label>:null}
      </div><button type="button" className="text-button" onClick={()=>save(locations.filter((_,i)=>i!==index))}>Remove storage location {index+1}</button>
    </fieldset>)}
    <button type="button" className="management-secondary" disabled={locations.length>=100||count>=100} onClick={()=>save([...locations,{details:{},types:[],description:''}])}>Add another storage location</button>
  </div>;
}
