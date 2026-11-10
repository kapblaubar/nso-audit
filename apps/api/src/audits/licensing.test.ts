import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CollectionError,fetchLicensePage,normalizeAssignments,normalizeLicenses,validateLicenseUrl} from './licensing.js';
import {processCollection,type WorkerDependencies} from './worker.js';
import type {CollectionJob} from './store.js';
import azureFunctions from '@azure/functions';
const {HttpRequest,InvocationContext}=azureFunctions;

const sku='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
const group='00000000-0000-4000-8000-000000000003',at='2026-11-09T12:00:00.000Z';
const license={id:`subscription_${sku}`,skuId:sku,skuPartNumber:'EXAMPLE_SKU',prepaidUnits:{enabled:10,suspended:2,warning:1},consumedUnits:3};
test('SKU inventory retains counts separately and deduplicates repeated source keys',()=>{
  const rows=normalizeLicenses([license,license],at);
  assert.equal(rows.length,1);assert.equal(rows[0]?.enabledUnits,10);assert.equal(rows[0]?.consumedUnits,3);
  assert.equal(rows[0]?.suspendedUnits,2);assert.equal(rows[0]?.productName,null);assert.equal(rows[0]?.collectedAtUtc,at);
  assert.equal(normalizeLicenses([{...license,consumedUnits:null}],at)[0]?.consumedUnits,null);
  assert.throws(()=>normalizeLicenses([{...license,consumedUnits:-1}],at),CollectionError);
});
test('direct and group paths for the same user/SKU remain distinct and retain errors',()=>{
  const state={skuId:sku,assignedByGroup:null,disabledPlans:[],state:'Active',lastUpdatedDateTime:at};
  const rows=normalizeAssignments([{id:user,mail:null,userPrincipalName:'fixture@example.invalid',assignedLicenses:[{skuId:sku}],
    licenseAssignmentStates:[state,state,{...state,assignedByGroup:group,state:'Error',error:'CountViolation'}]}],at);
  assert.equal(rows.length,2);assert.equal(rows[0]?.assignmentType,'direct');assert.equal(rows[1]?.assignmentType,'group');
  assert.equal(rows[1]?.assignmentSource,group);assert.equal(rows[1]?.assignmentError,'CountViolation');
  assert.equal(rows[0]?.sourceUpdatedAtUtc,at);assert.equal(rows[0]?.email,null);
});
test('missing assignment metadata stays unknown; unlicensed users create no assignment',()=>{
  assert.equal(normalizeAssignments([{id:user,assignedLicenses:[],licenseAssignmentStates:[]}],at).length,0);
  const rows=normalizeAssignments([{id:user,assignedLicenses:[{skuId:sku,disabledPlans:[]}]}],at);
  assert.equal(rows[0]?.assignmentType,'unknown');assert.equal(rows[0]?.assignmentState,null);
  assert.throws(()=>normalizeAssignments([{id:user}],at),CollectionError);
});
test('paging cannot exfiltrate tokens or change endpoint',()=>{
  for(const link of ['https://evil.invalid/v1.0/users','http://graph.microsoft.com/v1.0/users',
    'https://graph.microsoft.com/v1.0/groups','https://user:pass@graph.microsoft.com/v1.0/users',
    'https://graph.microsoft.com/v1.0/users#fragment'])assert.throws(()=>validateLicenseUrl(link,'licenseAssignments'));
  assert.match(validateLicenseUrl('https://graph.microsoft.com/v1.0/users?$skiptoken=example','licenseAssignments'),/skiptoken/);
});
test('Graph paging is retained; 403 is missing access rather than empty evidence',async()=>{
  const next='https://graph.microsoft.com/v1.0/subscribedSkus?$skiptoken=example';
  const page=await fetchLicensePage('licenses',null,'test-token',async(_url,init)=>{
    assert.equal(init?.method,undefined);assert.equal(init?.redirect,'error');
    return Response.json({value:[license],'@odata.nextLink':next});
  });
  assert.equal(page.nextLink,next);assert.equal(page.values.length,1);
  await assert.rejects(()=>fetchLicensePage('licenses',null,'test-token',async()=>new Response(null,{status:403})),
    (error:unknown)=>error instanceof CollectionError&&error.missingAccess);
  await assert.rejects(()=>fetchLicensePage('licenses',null,'test-token',async()=>Response.json({})),CollectionError);
});
test('retryable Graph failures use bounded retries and preserve empty success',async()=>{
  let calls=0;
  const page=await fetchLicensePage('licenses',null,'test-token',async()=>{
    calls++;return calls<3?new Response(null,{status:429,headers:{'retry-after':'0'}}):Response.json({value:[]});
  });
  assert.equal(calls,3);assert.deepEqual(page.values,[]);assert.equal(page.nextLink,null);
  calls=0;
  await assert.rejects(()=>fetchLicensePage('licenses',null,'test-token',async()=>{
    calls++;return new Response(null,{status:429,headers:{'retry-after':'600'}});
  }),/throttled/);
  assert.equal(calls,1);
});
const job:CollectionJob={OrganizationId:group,TenantId:user,ScanId:sku,DataType:'licenses',NextLink:null,LeaseId:group,Attempts:1};
function dependencies(overrides:Partial<WorkerDependencies>={}):WorkerDependencies{
  return {start:async()=>{},token:async()=> 'fixture',page:async()=>({values:[license],nextLink:null,collectedAtUtc:at}),
    checkpoint:async()=>{},...overrides};
}
test('worker persists normalized evidence with its cursor; no success before checkpoint',async()=>{
  const events:string[]=[];
  await processCollection(job,dependencies({start:async()=>{events.push('started');},checkpoint:async(actual,rows,next,error)=>{
    events.push('checkpoint');assert.equal(actual,job);assert.equal(rows.length,1);assert.equal(next,null);assert.equal(error,undefined);
  }}));
  assert.deepEqual(events,['started','checkpoint']);
  let checkpoints=0;
  await assert.rejects(()=>processCollection(job,dependencies({checkpoint:async()=>{checkpoints++;throw new Error('SQL unavailable');}})),/SQL unavailable/);
  assert.equal(checkpoints,1,'Database failure was incorrectly reclassified as a source failure.');
});
test('worker records source failure without discarding already persisted pages',async()=>{
  await processCollection(job,dependencies({page:async()=>{throw new CollectionError('missingAccess',true);},
    checkpoint:async(_job,rows,next,error)=>{assert.deepEqual(rows,[]);assert.equal(next,null);assert.deepEqual(error,{code:'missingAccess',missingAccess:true});}}));
  await processCollection({...job,Attempts:4},dependencies({token:async()=>{assert.fail('Interrupted job should not call Graph.');},
    checkpoint:async(_job,_rows,_next,error)=>{assert.equal(error?.code,'workerInterrupted');}}));
});
test('audit endpoints deny unauthenticated and unscoped portal requests before SQL access',async()=>{
  const {createAudit,readAudit,readEvidence}=await import('../functions/dataAudits.js');
  for(const [handler,method] of [[createAudit,'POST'],[readAudit,'GET'],[readEvidence,'GET']] as const){
    const context=new InvocationContext({functionName:'audit-access-test'});
    assert.equal((await handler(new HttpRequest({url:'https://example.invalid/api/me/audits',method}),context)).status,401);
    assert.equal((await handler(new HttpRequest({url:'https://example.invalid/api/me/audits',method,
      headers:{authorization:`Bearer ${'x'.repeat(43)}`}}),context)).status,403);
  }
});
