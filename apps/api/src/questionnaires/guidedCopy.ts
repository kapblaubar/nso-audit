import type {ClientAnswer,ClientQuestion} from './clientInput.js';

type Row=NonNullable<ClientAnswer['records']>[number];
const platform=(value:unknown)=>/microsoft|azure|365/i.test(String(value))?'microsoft':/aws|amazon/i.test(String(value))?'aws':/google|gcp/i.test(String(value))?'google':/prem|site/i.test(String(value))?'on-premises':'other';
const information=(value:unknown)=>/employee|staff/i.test(String(value))?'employee':/customer/i.test(String(value))?'customer':/financ/i.test(String(value))?'financial':/health/i.test(String(value))?'health':/payment/i.test(String(value))?'payment':/intellectual/i.test(String(value))?'ip':'other';
const purpose=(value:unknown)=>/insurance/i.test(String(value))?'insurance':/cmmc|nist|compliance|framework/i.test(String(value))?'compliance':/ai|copilot/i.test(String(value))?'ai':/security|configuration/i.test(String(value))?'security':'other';

// A guided copy is a new draft. The original assessment, evidence and reviews stay intact.
// Preserve original row contents as visible previous details rather than guessing classifications.
export function guidedCopyAnswers(answers:ClientAnswer[],questions:ClientQuestion[],canReview:boolean):ClientAnswer[]{
  const result:ClientAnswer[]=[];
  for(const question of questions){
    if(question.reviewerOnly&&!canReview)continue;
    const old=answers.find(a=>a.questionId===question.id);
    if(!question.guided){if(old)result.push({...old,questionVersion:question.version});continue;}
    const records:Row[]=[];
    for(const row of old?.records??[]){
      const labels:Record<string,string>={environment:'Environment',account:'Tenant / account identifier',domains:'Domains',locations:'Locations',service:'Business activity',systems:'Supporting systems',owner:'Owner',criticality:'Criticality',provider:'Provider',responsibilities:'Responsibilities',contact:'Support contact',dataType:'Information type',location:'Storage location',view:'Report purpose',profile:'Requested profile',version:'Version'};
      const previousDetails=Object.entries(row).map(([key,value])=>`${labels[key]??key}: ${value===null?'Unknown':Array.isArray(value)?value.join(', '):value}`).join('; ');
      switch(question.id){
        case 'SCP-05':{
          const selected=platform(row.environment);
          const next:Row={platform:selected,previousDetails};
          if(typeof row.environment==='string')next.name=row.environment;
          if(typeof row.locations==='string')next.locations=row.locations;
          if(selected==='other')next.description=String(row.environment??'Previously recorded environment');
          if(['microsoft','google','on-premises'].includes(selected)&&typeof row.domains==='string')next.domains=row.domains;
          if(selected==='microsoft'&&typeof row.account==='string')next.tenant=row.account;
          if(selected==='aws'&&typeof row.account==='string')next.account=row.account;
          records.push(next);break;
        }
        case 'SCP-06':records.push({activity:'other',description:String(row.service??'Previously recorded activity'),...(typeof row.systems==='string'?{systems:row.systems}:{}),...(typeof row.owner==='string'?{owner:row.owner}:{}),previousDetails});break;
        case 'SCP-08':records.push({provider:String(row.provider??'Previously recorded provider'),...(typeof row.systems==='string'?{systems:row.systems}:{}),...(typeof row.contact==='string'?{contact:row.contact}:{}),previousDetails});break;
        case 'SCP-07.LOCATIONS':{
          const selected=information(row.dataType);
          records.push({dataType:selected,...(selected==='other'?{description:String(row.dataType??'Previously recorded information')}:{}),...(typeof row.location==='string'?{location:row.location}:{}),...(typeof row.owner==='string'?{owner:row.owner}:{}),previousDetails});break;
        }
        case 'SCP-10.PROFILES':{
          const selected=purpose(`${row.view??''} ${row.profile??''}`);
          records.push({purpose:selected,...(selected==='other'?{description:String(row.profile??row.view??'Previously requested report')}:{}),...(selected==='compliance'&&typeof row.profile==='string'?{framework:row.profile}:{}),...(['insurance','compliance'].includes(selected)&&typeof row.version==='string'?{version:row.version}:{}),previousDetails});break;
        }
      }
    }
    const companion={ 'SCP-05':'SCP-04','SCP-07.LOCATIONS':'SCP-07','SCP-10.PROFILES':'SCP-10'}[question.id];
    const selected=answers.find(a=>a.questionId===companion);
    for(const value of selected?.selections??[]){
      if(value==='none')continue;
      const selector=question.guided.selector!;
      const mapped=question.id==='SCP-05'?platform(value):question.id==='SCP-07.LOCATIONS'?information(value):purpose(value);
      const matching=records.find(row=>row[selector]===mapped);
      if(matching&&!['cmmc','nist'].includes(value)){
        matching.previousDetails=[matching.previousDetails,`Previously selected: ${value}`,selected?.justification].filter(Boolean).join('; ');
        continue;
      }
      const row:Row={[selector]:mapped,previousDetails:`Previously selected: ${value}${selected?.justification?`. ${selected.justification}`:''}`};
      if(mapped==='other')row.description=selected?.justification??value;
      if(['cmmc','nist'].includes(value))row.framework=value.toUpperCase();
      records.push(row);
    }
    if(records.length)result.push({questionId:question.id,questionVersion:question.version,state:'answered',records,...(old?.justification?{justification:old.justification}:{}),...(old?.evidenceReference?{evidenceReference:old.evidenceReference}:{})});
    else if(old&&old.state!=='answered')result.push({...old,questionVersion:question.version});
  }
  return result;
}
