import {object,parseAnswers,QuestionnaireInputError,type Question,type Answer} from './input.js';
export interface Field {id:string;label:string;type:'text'|'number'|'date'|'select';required:boolean;options?:{id:string;label:string}[]}
export interface ClientQuestion extends Omit<Question,'type'> {
  type:Question['type']|'records';sourceId:string;sourcePrompt:string;sectionId:string;fields:Field[];units:string[];reviewerOnly:boolean;assetClass:string|null;
}
export interface ClientAnswer extends Answer {records?:Record<string,string|number|null>[]}
export interface Section {id:string;title:string;position:number;repeatable:boolean;help:string;description?:string;groupFields:Field[]}
export const inputError=(message:string):never=>{throw new QuestionnaireInputError(message);};
export function boundedText(value:unknown,name:string,max=200,required=true):string|undefined{
  if(value===undefined||value===null||value===''){if(required)return inputError(`${name} is required.`);return undefined;}
  if(typeof value!=='string'||!value.trim()||value.length>max)return inputError(`Enter ${name} (up to ${max} characters).`);
  return value.trim();
}
export function parseFields(raw:unknown,fields:Field[]):Record<string,string|number|null>{
  const values=object(raw),result:Record<string,string|number|null>={};
  if(Object.keys(values).some(key=>!fields.some(field=>field.id===key)))return inputError('Unexpected record or group field.');
  for(const field of fields){
    const value=values[field.id];
    if(value===null){result[field.id]=null;continue;} // Explicit per-field Unknown; omitted required fields still fail.
    if(value===undefined||value===''){if(field.required)return inputError(`${field.label} is required or must be explicitly Unknown.`);continue;}
    if(field.type==='number'){
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>99999999999999)return inputError(`Invalid ${field.label}.`);
      result[field.id]=value;
    }else if(field.type==='select'){
      if(!field.options?.some(option=>option.id===value))return inputError(`Choose a valid ${field.label}.`);
      result[field.id]=value as string;
    }else if(field.type==='date'){
      if(typeof value!=='string'||value<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return inputError(`Invalid ${field.label}.`);
      result[field.id]=value;
    }else result[field.id]=boundedText(value,field.label,1000)!;
  }
  return result;
}
export function parseClientAnswers(raw:unknown,questions:ClientQuestion[],canReview:boolean):ClientAnswer[]{
  if(!Array.isArray(raw)||raw.length>questions.length)return inputError('Invalid response list.');
  const seen=new Set<string>();
  return raw.map(value=>{
    const item=object(value),question=questions.find(q=>q.id===item.questionId&&q.version===item.questionVersion);
    if(!question||seen.has(question.id))return inputError('Unknown, duplicate or outdated question.');
    seen.add(question.id);
    if(question.reviewerOnly&&!canReview)return inputError('This question is maintained by an owner or administrator reviewer.');
    const input={...item};let records:ClientAnswer['records'];
    if(question.type==='records'&&input.state==='answered'){
      if(input.textValue!==undefined)return inputError('Structured records cannot contain a text answer field.');
      if(!Array.isArray(input.records)||input.records.length<1||input.records.length>100)return inputError('Add between 1 and 100 rows.');
      records=input.records.map(row=>parseFields(row,question.fields));delete input.records;
      input.textValue='structured-records';
    }
    const parsed=parseAnswers([input],[{...question,type:question.type==='records'?'text':question.type} as Question])[0]!;
    if(question.type==='records'&&records){delete parsed.textValue;return {...parsed,records};}
    if(parsed.state==='answered'&&question.type==='number'){
      if(question.units.length&&!question.units.includes(parsed.unit!))return inputError(`Choose a supported unit for ${question.prompt}`);
      if(question.sourceId==='SCP-03'&&!Number.isInteger(parsed.numberValue))return inputError('Personnel counts must be whole numbers.');
    }
    if(parsed.selections?.includes('other')&&!parsed.justification)return inputError('Describe the Other selection.');
    return parsed;
  });
}
export function questionsForGroup(questions:ClientQuestion[],sectionId:string,context:Record<string,unknown>){
  return questions.filter(q=>q.sectionId===sectionId&&(!q.assetClass||q.assetClass===context.assetClass));
}
export function parseReview(raw:unknown){
  const input=object(raw);
  const values={conclusion:['inPlace','partly','gap','unknown','notApplicable'],evidenceState:['declared','observed','checked','missing','conflicting'],collectionState:['complete','partial','failed','notConnected','unsupported','notRequested']};
  for(const [field,choices] of Object.entries(values))if(!choices.includes(String(input[field])))return inputError(`Choose a valid ${field}.`);
  const targetDate=boundedText(input.targetDate,'Target date',10,false);
  if(targetDate&&(targetDate<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||!Number.isFinite(Date.parse(targetDate))||new Date(targetDate).toISOString().slice(0,10)!==targetDate))return inputError('Invalid target date.');
  return {conclusion:String(input.conclusion),evidenceState:String(input.evidenceState),collectionState:String(input.collectionState),notes:boundedText(input.notes,'Review rationale',2000)!,actionOwner:boundedText(input.actionOwner,'Action owner',200,false),targetDate};
}
