import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {guidedCopyAnswers} from './guidedCopy.js';
import {clientAssessmentTemplate,parseClientAnswers,parseFields,parseReview,questionsForGroup,type ClientQuestion,type Section} from './clientInput.js';
import {clientAssessments} from '../functions/clientAssessments.js';
const {HttpRequest,InvocationContext}=createRequire(import.meta.url)('@azure/functions') as typeof import('@azure/functions');
const catalog=JSON.parse(await readFile(new URL('../../../../../config/questionnaires/client-v1.json',import.meta.url),'utf8')) as {sections:Section[];questions:ClientQuestion[]};
const question=(id:string)=>catalog.questions.find(q=>q.id===id)!;
test('all Markdown question IDs are mapped to typed questions in the correct 12 sections',async()=>{
  const md=await readFile(new URL('../../../../../docs/client-assessment-questionnaire-v1.md',import.meta.url),'utf8');
  const ids=[...md.matchAll(/^\| ([A-Z]+-[A-Z0-9-]+) \|/gm)].map(match=>match[1]!);
  assert.equal(catalog.sections.length,12);assert.equal(catalog.questions.length,124);
  for(const id of ids)assert.ok(catalog.questions.some(q=>q.sourceId===id),`Missing Markdown question ${id}`);
  for(const match of md.matchAll(/^\| ([A-Z]+-[A-Z0-9-]+) \| (.+?) \|/gm))assert.ok(catalog.questions.filter(q=>q.sourceId===match[1]).every(q=>q.sourcePrompt===match[2]),`Source wording drift for ${match[1]}`);
  assert.equal(new Set(catalog.questions.map(q=>q.id)).size,catalog.questions.length);
  assert.ok(catalog.questions.every(q=>catalog.sections.some(s=>s.id===q.sectionId)));
  assert.equal(question('SCP-04').type,'multi');assert.equal(question('BKP-07').type,'records');
  assert.equal(question('DEV-06.CRITICAL').sourceId,'DEV-06');assert.equal(question('DAT-03.DLP').sourceId,'DAT-03');
});
test('backup scope controls database-specific questions without leaking other sections',()=>{
  const databases=questionsForGroup(catalog.questions,'backups',{assetClass:'databases'});
  const endpoints=questionsForGroup(catalog.questions,'backups',{assetClass:'endpoints'});
  assert.equal(databases.length,endpoints.length+2);
  assert.ok(databases.some(q=>q.id==='BKP-DB-01'));assert.ok(!endpoints.some(q=>q.id==='BKP-DB-01'));
  assert.ok(endpoints.every(q=>q.sectionId==='backups'));
  assert.ok(questionsForGroup(catalog.questions,'identity',{population:'administrators'}).every(q=>q.id.startsWith('IAM-')));
});
test('structured lists preserve separate tiers and explicit unknown cells; reject unknown fields and invalid values',()=>{
  const q=question('BKP-07');
  const rows=[{tier:'Daily',duration:30,unit:'days',scope:'Endpoints'},{tier:'Archive',duration:null,unit:'years',scope:'Critical data'}];
  const parsed=parseClientAnswers([{questionId:q.id,questionVersion:2,state:'answered',records:rows}],[q],false);
  assert.deepEqual(parsed[0]?.records,rows);assert.equal(parsed[0]?.textValue,undefined);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:2,state:'answered',records:[]}],[q],false),/rows/);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:2,state:'answered',records:[{...rows[0],extra:'hidden'}]}],[q],false),/Unexpected/);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:2,state:'answered',records:[{...rows[0],duration:-1}]}],[q],false));
  assert.throws(()=>parseFields({tier:'Tier'},q.fields),/required/);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:2,state:'unknown',records:rows}],[q],false),/fields/);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:2,state:'answered',records:rows,textValue:'forged'}],[q],false),/text answer/);
});
test('version, unit, personnel counts, other choices and reviewer-only questions are validated',()=>{
  const count=question('SCP-03.EMP');
  assert.throws(()=>parseClientAnswers([{questionId:count.id,questionVersion:2,state:'answered',numberValue:2.5,unit:'people'}],[count],false),/whole/);
  assert.throws(()=>parseClientAnswers([{questionId:count.id,questionVersion:2,state:'answered',numberValue:2,unit:'days'}],[count],false),/unit/);
  assert.throws(()=>parseClientAnswers([{questionId:count.id,questionVersion:1,state:'unknown'}],[count],false),/outdated/);
  const multi=question('SCP-04');
  assert.throws(()=>parseClientAnswers([{questionId:multi.id,questionVersion:2,state:'answered',selections:['none','azure']}],[multi],false),/alone/);
  assert.throws(()=>parseClientAnswers([{questionId:multi.id,questionVersion:2,state:'answered',selections:['other']}],[multi],false),/Other/);
  const reviewer=question('PRF-07');
  assert.throws(()=>parseClientAnswers([{questionId:reviewer.id,questionVersion:2,state:'unknown'}],[reviewer],false),/reviewer/);
  assert.equal(parseClientAnswers([{questionId:reviewer.id,questionVersion:2,state:'unknown'}],[reviewer],true)[0]?.state,'unknown');
});
test('review conclusions require rationale and retain distinct evidence and collection states',()=>{
  const review={conclusion:'unknown',evidenceState:'missing',collectionState:'notConnected',notes:'No evidence provided'};
  assert.equal(parseReview(review).conclusion,'unknown');assert.equal(parseReview(review).collectionState,'notConnected');
  assert.throws(()=>parseReview({...review,notes:''}),/rationale/);
  assert.throws(()=>parseReview({...review,conclusion:'certified'}));assert.throws(()=>parseReview({...review,targetDate:'2026-02-30'}));
});
test('full client API fails closed before SQL when no session is supplied',async()=>{
  const context=new InvocationContext({functionName:'client-test'});
  for(const method of ['GET','POST','PUT'])assert.equal((await clientAssessments(new HttpRequest({url:'https://example.test/api/me/client-assessments',method}),context)).status,401);
});

test('direct answers infer state and single units while retaining strict validation',()=>{
  const q=question('SCP-01');
  assert.equal(parseClientAnswers([{questionId:q.id,questionVersion:q.version,textValue:'Washougal'}],[q],false)[0]?.state,'answered');
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:q.version,textValue:''}],[q],false),/required/);
  assert.throws(()=>parseClientAnswers([{questionId:q.id,questionVersion:q.version,state:'invalid',textValue:'Washougal'}],[q],false),/state/);
  const count=question('SCP-03.EMP');
  assert.equal(parseClientAnswers([{questionId:count.id,questionVersion:count.version,numberValue:0}],[count],false)[0]?.unit,'people');
  const record=question('BKP-07');
  assert.equal(parseClientAnswers([{questionId:record.id,questionVersion:record.version,records:[{tier:'Daily',duration:30,unit:'days',scope:'Endpoints'}]}],[record],false)[0]?.records?.length,1);
});

const guidedCatalog=JSON.parse(await readFile(new URL('../../../../../config/questionnaires/client-v2.json',import.meta.url),'utf8')) as {questions:ClientQuestion[]};
const guidedQuestion=(id:string)=>guidedCatalog.questions.find(q=>q.id===id)!;
test('guided record validation supports conditional fields and multi-provider responsibilities',()=>{
  const q=guidedQuestion('SCP-05');
  const parse=(row:object)=>parseClientAnswers([{questionId:q.id,questionVersion:3,records:[row]}],[q],false);
  assert.equal(parse({platform:'aws'})[0]?.records?.[0]?.platform,'aws');
  assert.throws(()=>parse({platform:'fake'}),/valid/);
  assert.throws(()=>parse({platform:null}),/required/);
  assert.throws(()=>parse({platform:'aws',tenant:'wrong platform'}),/not applicable/);
  assert.throws(()=>parse({platform:'other'}),/required/);
  assert.throws(()=>parse({platform:'aws',unexpected:'x'}),/Unexpected/);
  const supplier=guidedQuestion('SCP-08');
  const supplierParse=(row:object)=>parseClientAnswers([{questionId:supplier.id,questionVersion:3,records:[row]}],[supplier],false);
  assert.deepEqual(supplierParse({provider:'Partner',responsibilities:['service-2','service-13']})[0]?.records?.[0]?.responsibilities,['service-2','service-13']);
  assert.throws(()=>supplierParse({provider:'Partner',responsibilities:['service-2','service-2']}),/valid/);
  assert.throws(()=>supplierParse({provider:'Partner',responsibilities:['made-up']}),/valid/);
  assert.throws(()=>supplierParse({provider:'Partner',responsibilities:['other']}),/required/);
  assert.equal(supplierParse({provider:'Partner',responsibilities:['other'],other:'Custom service'}).length,1);
});

test('guided copies preserve the original, carried-over values and previously selected purposes',()=>{
  const answers=[
    {questionId:'SCP-01',questionVersion:2,state:'answered' as const,textValue:'Washougal'},
    {questionId:'SCP-04',questionVersion:2,state:'answered' as const,selections:['microsoft-365','azure','aws']},
    {questionId:'SCP-05',questionVersion:2,state:'answered' as const,records:[{environment:'Microsoft 365',account:'tenant-123',domains:'example.com',locations:'US'}]},
    {questionId:'SCP-06',questionVersion:2,state:'answered' as const,records:[{service:'Payroll',systems:'QuickBooks',owner:'Finance',criticality:'high'}]},
    {questionId:'SCP-08',questionVersion:2,state:'answered' as const,records:[{provider:'Partner',responsibilities:'Database administration',systems:'Azure SQL'}]},
    {questionId:'SCP-10',questionVersion:2,state:'answered' as const,selections:['insurance','cmmc','nist']},
  ];
  const snapshot=structuredClone(answers);
  const converted=guidedCopyAnswers(answers,guidedCatalog.questions,false);
  const parsed=parseClientAnswers(converted,guidedCatalog.questions,false);
  assert.deepEqual(answers,snapshot);
  assert.equal(parsed.find(a=>a.questionId==='SCP-01')?.textValue,'Washougal');
  assert.equal(parsed.find(a=>a.questionId==='SCP-05')?.records?.[0]?.tenant,'tenant-123');
  assert.equal(parsed.find(a=>a.questionId==='SCP-05')?.records?.length,2);
  assert.match(String(parsed.find(a=>a.questionId==='SCP-05')?.records?.[0]?.previousDetails),/Previously selected: azure/);
  assert.match(String(parsed.find(a=>a.questionId==='SCP-08')?.records?.[0]?.previousDetails),/Database administration/);
  assert.equal(parsed.find(a=>a.questionId==='SCP-10.PROFILES')?.records?.length,3);
  assert.equal(parsed.find(a=>a.questionId==='SCP-06')?.records?.[0]?.tolerance,undefined);
});

test('technology register filters every asset type and rejects answers for another type or entry kind',async()=>{
  const v3=JSON.parse(await readFile(new URL('../../../../../config/questionnaires/client-v3.json',import.meta.url),'utf8')) as {sections:Section[];questions:ClientQuestion[]};
  const assets=v3.sections.find(s=>s.id==='assets')!;
  for(const type of assets.groupFields.find(f=>f.id==='assetClass')!.options!){
    for(const entryKind of ['single','group']){
      const visible=questionsForGroup(v3.questions,'assets',{assetClass:type.id,entryKind});
      assert.equal(visible.length,10);
      assert.equal(visible.filter(q=>q.assetClass===type.id).length,4);
      assert.equal(visible.filter(q=>q.type==='coverage').length,entryKind==='single'?0:2);
      assert.ok(visible.every(q=>!q.assetClass||q.assetClass===type.id));
      const wrong=v3.questions.find(q=>q.assetClass&&q.assetClass!==type.id)!;
      assert.throws(()=>parseClientAnswers([{questionId:wrong.id,questionVersion:4,state:'answered',textValue:'wrong type'}],visible,false));
      const wrongKind=v3.questions.find(q=>q.entryKind&&q.entryKind!==entryKind)!;
      assert.throws(()=>parseClientAnswers([{questionId:wrongKind.id,questionVersion:4,state:'unknown'}],visible,false));
      const detail=visible.find(q=>q.assetClass===type.id)!;
      const answers=parseClientAnswers([{questionId:detail.id,questionVersion:4,state:'answered',textValue:'Example system details'}],visible,false);
      assert.equal(answers[0]!.textValue,'Example system details');
    }
  }
});


test('new assessments default to technology questions while guided copies preserve their target',()=>{
  assert.equal(clientAssessmentTemplate(undefined),'client-v3');
  assert.equal(clientAssessmentTemplate(undefined,true),'client-v2');
  assert.equal(clientAssessmentTemplate('client-v2'),'client-v2');
  assert.equal(clientAssessmentTemplate('client-v3'),'client-v3');
  assert.throws(()=>clientAssessmentTemplate(['client-v3']));
  assert.throws(()=>clientAssessmentTemplate('unsupported'));
});
