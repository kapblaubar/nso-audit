// Compile the reviewed Markdown question tables into an immutable, versioned SQL catalog.
// --check verifies the checked-in catalog/migration; regeneration never applies SQL.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const md=await readFile(new URL('docs/client-assessment-questionnaire-v1.md',root),'utf8');
const slug=value=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const options=labels=>labels.map(label=>({id:slug(label),label}));
const field=(id,label,type='text',extra={})=>({id,label,type,required:true,...extra});
const sectionIds=['company','assets','backups','identity','devices','network','cloud','data','response','governance','ai','profiles'];
const assetOptions=options(['Endpoints','Servers','Databases','Network devices','Cloud workloads','Business applications','SaaS services']);
const backupOptions=options(['Endpoints','Servers','Databases','Email and collaboration / SaaS','Cloud workloads and storage','Network and security configuration']);
const groupFields={
  assets:[field('assetClass','Asset class','select',{options:assetOptions}),field('management','Management','select',{options:options(['Managed','Unmanaged'])})],
  backups:[field('assetClass','Asset class','select',{options:backupOptions})],
  identity:[field('population','Account population','select',{options:options(['Administrators','Ordinary users','Service identities'])})],
  devices:[field('assetClass','Asset class','select',{options:options(['Endpoints','Servers'])})],
  cloud:[field('platform','Platform / tenant')],ai:[field('product','AI product / use case')],
};
const groupHelp={assets:'Add groups for each asset class, environment and management boundary.',backups:'Add groups for endpoints, servers, databases, SaaS, cloud workloads and network configurations as applicable. Keep differing strategies separate.',identity:'Add separate groups for administrators and ordinary users in each identity environment.',devices:'Add separate endpoint and server groups, including remote devices.',cloud:'Add a group for each tenant or platform.',ai:'Add a group for each proposed or deployed AI product/use case.'};
const records={
  'SCP-05':[field('environment','Environment / platform'),field('account','Tenant / account identifier'),field('domains','Domains'),field('locations','Locations')],
  'SCP-06':[field('service','Business service'),field('systems','Supporting systems'),field('owner','Owner'),field('criticality','Criticality','select',{options:options(['Critical','High','Standard','Unknown'])})],
  'SCP-08':[field('provider','MSP / supplier'),field('responsibilities','Operating responsibilities'),field('systems','Systems / services'),field('contact','Contact / escalation','text',{required:false})],
  'BKP-07':[field('tier','Retention tier'),field('duration','Retention duration','number'),field('unit','Unit','select',{options:options(['Days','Months','Years'])}),field('scope','Systems / data covered')],
  'AI-01':[field('product','AI agent / Copilot product'),field('purpose','Business purpose / use case'),field('owner','Owner'),field('deployment','Deployment status','select',{options:options(['Proposed','Pilot','Deployed','Retired','Unknown'])})],
  'PRF-07':[field('criterion','Profile / criterion and version'),field('need','Unresolved question / evidence need'),field('owner','Owner'),field('status','Review status','select',{options:options(['Open','In progress','Resolved','Unknown'])})],
};
const splits={
  'SCP-03':[['SCP-03.EMP','How many employees are in scope?'],['SCP-03.CON','How many contractors are in scope?'],['SCP-03.ADM','How many IT administrators are in scope?']],
  'BKP-13':[['BKP-13','Are backups encrypted in transit?'],['BKP-13-REST','Are backups encrypted at rest?'],['BKP-13-KEY','Is encryption key recovery documented?']],
  'BKP-17':[['BKP-17','Did tested restoration meet the approved recovery point objective?'],['BKP-17-TIME','Did tested restoration meet the approved recovery time objective?']],
  'DEV-06':[['DEV-06.CRITICAL','What is the required remediation deadline for critical vulnerabilities?'],['DEV-06.HIGH','What is the required remediation deadline for high-risk vulnerabilities?']],
  'DEV-07':[['DEV-07.CRITICAL','What proportion meets the critical vulnerability remediation deadline?'],['DEV-07.HIGH','What proportion meets the high-risk vulnerability remediation deadline?']],
  'DAT-03':[['DAT-03.CLASSIFICATION','Are classification and labeling controls used where needed?'],['DAT-03.DLP','Are data-loss prevention controls used where needed?']],
  'DAT-05':[['DAT-05.STORAGE','Is sensitive data encrypted in storage where required?'],['DAT-05.TRANSIT','Is sensitive data encrypted in transit where required?']],
};
const units={'SCP-03':['people'],'BKP-08':['minutes','hours','days'],'BKP-09':['minutes','hours','days'],'IAM-07':['hours'],'DEV-06':['days']};
const sections=[];const questions=[];let section;
for(const line of md.replace(/\r\n/g,'\n').split('\n')){
  const heading=/^## (\d+)\. (.+)$/.exec(line);
  if(heading){const index=Number(heading[1]);section=index<=12?{id:sectionIds[index-1],position:index,title:heading[2],repeatable:!!groupFields[sectionIds[index-1]],groupFields:groupFields[sectionIds[index-1]]??[],help:groupHelp[sectionIds[index-1]]??'Answer for the company and assessment scope.',description:''}:undefined;if(section)sections.push(section);}
  else if(section&&!line.startsWith('|'))section.description+=(section.description?'\n':'')+line;
  const match=/^\| ([A-Z]+-[A-Z0-9-]+) \| (.+?) \| (.+?) \|$/.exec(line);
  if(!section||!match)continue;
  const [,sourceId,prompt,descriptor]=match;
  let type=records[sourceId]?'records':/^YN/.test(descriptor)?'yn':/^Status/.test(descriptor)?'status':/^Coverage/.test(descriptor)?'coverage':/^Select:/.test(descriptor)?'select':/^Multi:/.test(descriptor)?'multi':/^Date/.test(descriptor)?'date':/^Number/.test(descriptor)?'number':'text';
  let choices=[];
  if(type==='status')choices=[{id:'inPlace',label:'In place'},{id:'partly',label:'Partly in place'},{id:'notInPlace',label:'Not in place'}];
  if(type==='select'||type==='multi')choices=options(descriptor.replace(/^[^:]+:\s*/,'').split(';')[0].split(',').map(x=>x.trim()));
  if(type==='multi')choices.push({id:'none',label:'None'});
  for(const [id,wording] of splits[sourceId]??[[sourceId,prompt]])questions.push({id,version:2,sourceId,sourcePrompt:prompt,sectionId:section.id,position:questions.length+1,prompt:wording,type,
    help:descriptor,options:choices,fields:records[sourceId]??[],units:units[sourceId]??[],reviewerOnly:sourceId==='PRF-07',
    ...(sourceId.startsWith('BKP-DB-')?{assetClass:'databases'}:{})});
}
const extras=[
  {sourceId:'SCP-07',id:'SCP-07.LOCATIONS',sectionId:'company',prompt:'Where is each sensitive data type stored?',fields:[field('dataType','Sensitive data type'),field('location','Storage location / system'),field('owner','Owner')]},
  {sourceId:'SCP-10',id:'SCP-10.PROFILES',sectionId:'company',prompt:'Which exact report profiles and versions are requested?',fields:[field('view','Report view'),field('profile','Product / insurer form / framework'),field('version','Version / edition or To be selected')]},
];
for(const extra of extras)questions.push({...extra,sourcePrompt:questions.find(q=>q.sourceId===extra.sourceId).sourcePrompt,version:2,position:questions.length+1,type:'records',help:'Add a separate row for each item. Use Unknown when a detail is not known.',options:[],units:[],reviewerOnly:false});
const catalog={templateVersion:'client-v1',source:'docs/client-assessment-questionnaire-v1.md',sections,questions};
const json=JSON.stringify(catalog,null,2)+'\n';
const quote=value=>"N'"+String(value).replaceAll("'","''")+"'";
let seed=`-- Generated from the Markdown question tables by scripts/build-client-questionnaire.mjs.\n-- Catalog SHA256: ${createHash('sha256').update(json).digest('hex')}\n`;
seed+='INSERT questionnaire.ClientSections(TemplateVersion,SectionId,Position,Title,Repeatable,DefinitionJson) VALUES\n'+sections.map(s=>`('client-v1',${quote(s.id)},${s.position},${quote(s.title)},${s.repeatable?1:0},${quote(JSON.stringify({groupFields:s.groupFields,help:s.help,description:s.description.trim()}))})`).join(',\n')+';\n';
seed+='INSERT questionnaire.Questions(QuestionId,Version,TemplateVersion,Position,Prompt,AnswerType,HelpText) VALUES\n'+questions.map(q=>`(${quote(q.id)},2,'client-v1',${q.position},${quote(q.prompt)},${quote(q.type)},${quote(q.help)})`).join(',\n')+';\n';
seed+='INSERT questionnaire.ClientQuestionDefinitions(QuestionId,QuestionVersion,TemplateVersion,SectionId,SourceQuestionId,DefinitionJson) VALUES\n'+questions.map(q=>`(${quote(q.id)},2,'client-v1',${quote(q.sectionId)},${quote(q.sourceId)},${quote(JSON.stringify({fields:q.fields,units:q.units,reviewerOnly:q.reviewerOnly,assetClass:q.assetClass??null,sourcePrompt:q.sourcePrompt}))})`).join(',\n')+';\n';
const choices=questions.flatMap(q=>q.options.map((o,i)=>`(${quote(q.id)},2,${quote(o.id)},${quote(o.label)},${i+1})`));
seed+='INSERT questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId,Label,Position) VALUES\n'+choices.join(',\n')+';\nGO\n';
const schema=await readFile(new URL('database/templates/014_client_assessment.schema.sql',root),'utf8');
const outputs=[['config/questionnaires/client-v1.json',json],['database/migrations/014_client_assessment.sql',schema.replace(/\r\n/g,'\n').trimEnd()+'\nGO\n'+seed]];
for(const [path,content]of outputs){const url=new URL(path,root);if(process.argv.includes('--check')){
  const existing=await readFile(url,'utf8').catch(()=> '');if(existing.replace(/\r\n/g,'\n')!==content)throw new Error(`${path} differs from the Markdown/schema. Regenerate before applying this unapplied migration.`);
}else{await mkdir(new URL('./',url),{recursive:true});await writeFile(url,content);}}
console.log(`${sections.length} sections, ${questions.length} typed questions; all Markdown question IDs compiled.`);
