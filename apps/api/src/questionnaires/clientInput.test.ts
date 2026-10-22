import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {parseClientAnswers,parseFields,parseReview,questionsForGroup,type ClientQuestion,type Section} from './clientInput.js';
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
