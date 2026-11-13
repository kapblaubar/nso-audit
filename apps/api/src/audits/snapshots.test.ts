import assert from 'node:assert/strict';
import {test} from 'node:test';
import {datasetCatalog,allDataTypes,isDataType} from './catalog.js';
import {CollectionError} from './licensing.js';
import {fetchSnapshotPage,normalizeSnapshots,sanitizeEvidence,sourceUrl,validateSnapshotUrl} from './snapshots.js';
const sub='00000000-0000-4000-8000-000000000001';
test('unified scope includes dedicated configuration, security and license datasets',()=>{
  assert.equal(allDataTypes.length,27);assert.equal(new Set(Object.values(datasetCatalog).map(d=>d.table)).size,25);
  for(const type of ['conditionalAccess','namedLocations','compliancePolicies','licenses','licenseAssignments'])assert.equal(isDataType(type),true);
  assert.equal(isDataType('__proto__'),false);assert.equal(isDataType('DROP TABLE'),false);
});
test('preserves full policy configuration with source identity and observation timestamps',()=>{
  const value={id:'policy-1',displayName:'Test policy',state:'enabled',createdDateTime:'2026-01-01T00:00:00Z',
    conditions:{users:{includeUsers:['All'],excludeUsers:['emergency-user']}},grantControls:{builtInControls:['mfa']}};
  const rows=normalizeSnapshots([value,value],'2026-11-09T00:00:00Z');
  assert.equal(rows.length,1);assert.equal(rows[0]?.sourceId,'policy-1');assert.equal(rows[0]?.state,'enabled');
  assert.equal(rows[0]?.sourceCreatedAtUtc,'2026-01-01T00:00:00.000Z');
  assert.deepEqual(JSON.parse(rows[0]!.sourceJson),value);
  assert.throws(()=>normalizeSnapshots([{displayName:'No identity'}],'2026-11-09T00:00:00Z'),CollectionError);
});
test('redacts credential material without destroying password policy settings',()=>{
  assert.deepEqual(sanitizeEvidence({passwordRequired:true,passwordMinimumLength:12,settings:{preSharedKey:'do-not-store',privateKey:'do-not-store'},
    nested:[{clientSecret:'do-not-store'}]}),{passwordRequired:true,passwordMinimumLength:12,
    settings:{preSharedKey:'[redacted]',privateKey:'[redacted]'},nested:[{clientSecret:'[redacted]'}]});
});
test('ARM URLs require a valid subscription and paging stays within the same source',()=>{
  const url=sourceUrl('resourceGroups',sub);assert.match(url,new RegExp(`/subscriptions/${sub}/resourcegroups`));
  assert.throws(()=>sourceUrl('resourceGroups',null),/missingSubscription/);
  for(const target of ['https://evil.invalid/path',url.replace(sub,'00000000-0000-4000-8000-000000000002'),
    url.replace('resourcegroups','providers/Microsoft.Compute/virtualMachines')])assert.throws(()=>validateSnapshotUrl(target,url));
});
test('Graph and ARM page links are retained and singleton policies are saved as records',async()=>{
  const next=`https://management.azure.com/subscriptions/${sub}/resourcegroups?api-version=2021-04-01&$skiptoken=next`;
  const page=await fetchSnapshotPage('resourceGroups',sub,null,'fixture',async()=>Response.json({value:[{id:'/resourceGroups/fixture',name:'fixture'}],nextLink:next}));
  assert.equal(page.nextLink,next);assert.equal(page.records.length,1);
  const policy=await fetchSnapshotPage('authenticationMethods',null,null,'fixture',async()=>Response.json({id:'authenticationMethodsPolicy',authenticationMethodConfigurations:[{id:'Fido2',state:'enabled'}]}));
  assert.equal(policy.records.length,1);assert.equal(policy.nextLink,null);
  await assert.rejects(()=>fetchSnapshotPage('conditionalAccess',null,null,'fixture',async()=>new Response(null,{status:403})),
    (error:unknown)=>error instanceof CollectionError&&error.missingAccess);
  await assert.rejects(()=>fetchSnapshotPage('conditionalAccess',null,null,'fixture',async()=>Response.json({})),/invalidResponse/);
});

test('role collection expands role and principal and retains snapshot identity',async()=>{
  const value={id:'assignment-1',roleDefinitionId:'role-1',principalId:'user-1',roleDefinition:{id:'role-1',displayName:'Global Administrator',templateId:'62e90394-69f5-4237-9190-012177145e10'},principal:{id:'user-1','@odata.type':'#microsoft.graph.user',displayName:'Test Admin',userPrincipalName:'admin@example.test'}};
  const page=await fetchSnapshotPage('roleAssignments',null,null,'fixture',async url=>{
    assert.equal(new URL(String(url)).searchParams.get('$expand'),'roleDefinition,principal');
    return Response.json({value:[value]});
  });
  assert.equal(page.records[0]?.displayName,'Global Administrator');
  assert.equal(page.records[0]?.sourceId,'assignment-1');
  assert.deepEqual(JSON.parse(page.records[0]!.sourceJson),value);
  assert.equal(normalizeSnapshots([{id:'older',roleDefinitionId:'role-1',principalId:'user-1'}],'2026-11-10T00:00:00Z')[0]?.displayName,null);
});
test('Defender score snapshots preserve zero scores and validate singleton responses',async()=>{
  for(const type of ['exposureScores','deviceSecureScores'] as const){
    assert.ok(sourceUrl(type,null).startsWith('https://api.security.microsoft.com/api/'));
    const page=await fetchSnapshotPage(type,null,null,'fixture',async()=>Response.json({score:0,time:'2026-11-13T12:00:00Z'}));
    assert.equal(page.records[0]?.sourceId,type);
    assert.equal(JSON.parse(page.records[0]!.sourceJson).score,0);
    await assert.rejects(()=>fetchSnapshotPage(type,null,null,'fixture',async()=>Response.json({})),/invalidResponse/);
  }
  const initial=sourceUrl('endpointRecommendations',null);
  assert.throws(()=>validateSnapshotUrl('https://graph.microsoft.com/api/recommendations',initial),/invalidPagingLink/);
  const next=initial+'?$skip=1';
  const page=await fetchSnapshotPage('endpointRecommendations',null,null,'fixture',async()=>Response.json({value:[{id:'rec'}],'@odata.nextLink':next}));
  assert.equal(page.records[0]?.sourceId,'rec');assert.equal(page.nextLink,next);
});
