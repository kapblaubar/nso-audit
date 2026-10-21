import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAnswers,parseScope,type Question} from './input.js';
import {createRequire} from 'node:module';
const {HttpRequest,InvocationContext}=createRequire(import.meta.url)('@azure/functions') as typeof import('@azure/functions');
import {questionnaires} from '../functions/questionnaires.js';
function question(type:Question['type']):Question{return {id:'test',version:1,type,prompt:'Test',help:'',options:[{id:'daily',label:'Daily'},{id:'other',label:'Other'},{id:'none',label:'None'}]};}
const answer={questionId:'test',questionVersion:1,state:'answered'};
test('coverage retains measured counts, zero coverage and explicit estimates without inventing a pass',()=>{
  const counts={...answer,totalInScope:100,totalCovered:0,measurementDate:'2026-10-21',measurementSource:'Backup console'};
  assert.equal(parseAnswers([counts],[question('coverage')])[0]?.totalCovered,0);
  assert.throws(()=>parseAnswers([{...counts,totalInScope:0}],[question('coverage')]),/applicability/);
  assert.throws(()=>parseAnswers([{...counts,totalCovered:101}],[question('coverage')]),/exceed/);
  assert.throws(()=>parseAnswers([{...counts,estimatedPercentage:90}],[question('coverage')]),/not both/);
  assert.equal(parseAnswers([{...answer,estimatedPercentage:80,measurementDate:counts.measurementDate,measurementSource:counts.measurementSource}],[question('coverage')])[0]?.estimatedPercentage,80);
  assert.throws(()=>parseAnswers([{...counts,measurementSource:''}],[question('coverage')]),/source/);
});
test('unknown and not-applicable are explicit and cannot carry hidden typed values',()=>{
  assert.deepEqual(parseAnswers([{...answer,state:'unknown'}],[question('yn')]),[{...answer,state:'unknown'}]);
  assert.throws(()=>parseAnswers([{...answer,state:'unknown',booleanValue:true}],[question('yn')]),/fields/);
  assert.throws(()=>parseAnswers([{...answer,state:'notApplicable'}],[question('yn')]),/Explain/);
  assert.throws(()=>parseAnswers([{...answer,state:'notApplicable',justification:'   '}],[question('yn')]));
  assert.equal(parseAnswers([{...answer,state:'notApplicable',justification:'No servers in scope'}],[question('yn')])[0]?.state,'notApplicable');
  assert.throws(()=>parseAnswers([{...answer,state:'never'}],[question('yn')]),/date/);
});
test('typed values, catalog options, question versions and duplicate IDs are validated',()=>{
  assert.equal(parseAnswers([{...answer,booleanValue:false}],[question('yn')])[0]?.booleanValue,false);
  assert.throws(()=>parseAnswers([{...answer,booleanValue:'yes'}],[question('yn')]));
  assert.throws(()=>parseAnswers([{...answer,booleanValue:true,textValue:'extra'}],[question('yn')]),/fields/);
  assert.throws(()=>parseAnswers([{...answer,selectedOptionId:'unlisted'}],[question('select')]));
  assert.throws(()=>parseAnswers([{...answer,selectedOptionId:'other'}],[question('select')]),/Describe/);
  assert.throws(()=>parseAnswers([{...answer,questionVersion:2,booleanValue:true}],[question('yn')]),/outdated/);
  assert.throws(()=>parseAnswers([{...answer,state:'unknown'},{...answer,state:'unknown'}],[question('yn'),{...question('yn'),id:'other'}]),/duplicate/);
  assert.throws(()=>parseAnswers([{...answer,numberValue:-1,unit:'days'}],[question('number')]));
  assert.throws(()=>parseAnswers([{...answer,numberValue:1}],[question('number')]),/Unit/);
});
test('multi-selection exclusivity, valid dates and empty draft answers are preserved',()=>{
  assert.throws(()=>parseAnswers([{...answer,selections:['none','daily']}],[question('multi')]),/alone/);
  assert.throws(()=>parseAnswers([{...answer,selections:['daily','daily']}],[question('multi')]));
  assert.throws(()=>parseAnswers([{...answer,selections:[]}],[question('multi')]));
  assert.equal(parseAnswers([{...answer,selections:['daily']}],[question('multi')])[0]?.selections?.[0],'daily');
  assert.throws(()=>parseAnswers([{...answer,dateValue:'2026-02-30'}],[question('date')]),/date/);
  assert.equal(parseAnswers([{...answer,state:'never'}],[question('date')])[0]?.state,'never');
  assert.deepEqual(parseAnswers([],[question('yn')]),[]);
});
test('non-Microsoft scopes work and invalid tenant or asset classes fail',()=>{
  assert.deepEqual(parseScope({scopeName:' Office laptops ',assetClass:'END'}),{scopeName:'Office laptops',assetClass:'END',tenantId:null});
  assert.throws(()=>parseScope({scopeName:'Office',assetClass:'unlisted'}));
  assert.throws(()=>parseScope({scopeName:'Office',assetClass:'END',tenantId:'invalid'}));
});
test('questionnaire endpoints deny missing sessions and invalid workspace headers before SQL access',async()=>{
  const context=new InvocationContext({functionName:'questionnaire-test'});
  for(const method of ['GET','POST','PUT']){
    const denied=await questionnaires(new HttpRequest({url:'https://example.test/api/me/questionnaires',method}),context);
    assert.equal(denied.status,401);
  }
  const denied=await questionnaires(new HttpRequest({url:'https://example.test/api/me/questionnaires',method:'GET',
    headers:{Authorization:`Bearer ${'a'.repeat(43)}`,'X-Nso-Organization-Id':'invalid'}}),context);
  assert.equal(denied.status,403);
});
