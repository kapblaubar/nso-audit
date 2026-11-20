import assert from 'node:assert/strict';
import {test} from 'node:test';
import {datasetCatalog,allDataTypes,isDataType} from './catalog.js';
import {CollectionError} from './licensing.js';
import {sourceScope,sourceJson,fetchSnapshotPage,normalizeSnapshots,sanitizeEvidence,sourceUrl,validateSnapshotUrl} from './snapshots.js';
const sub='00000000-0000-4000-8000-000000000001';
test('unified scope includes dedicated configuration, security and license datasets',()=>{
  assert.equal(allDataTypes.length,41);assert.equal(new Set(Object.values(datasetCatalog).map(d=>d.table)).size,39);
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

test('role assignments expand only the principal and role definitions are collected separately',async()=>{
  const value={id:'assignment-1',roleDefinitionId:'role-1',principalId:'user-1',principal:{id:'user-1','@odata.type':'#microsoft.graph.user',displayName:'Test Admin',userPrincipalName:'admin@example.test'}};
  const page=await fetchSnapshotPage('roleAssignments',null,null,'fixture',async url=>{
    assert.equal(new URL(String(url)).searchParams.get('$expand'),'principal');
    return Response.json({value:[value]});
  });
  assert.equal(page.records[0]?.sourceId,'assignment-1');
  assert.deepEqual(JSON.parse(page.records[0]!.sourceJson),value);
  const definition={id:'role-1',displayName:'Global Administrator',isBuiltIn:true,isPrivileged:true};
  const catalog=await fetchSnapshotPage('directoryRoleDefinitions',null,null,'fixture',async url=>{
    assert.match(String(url),/roleDefinitions\?/);
    return Response.json({value:[definition]});
  });
  assert.equal(catalog.records[0]?.displayName,definition.displayName);
  assert.equal(normalizeSnapshots([{id:'older',roleDefinitionId:'role-1',principalId:'user-1'}],'2026-11-10T00:00:00Z')[0]?.displayName,null);
});
test('PIM eligibility requests send an explicit locale',async()=>{
  const source={id:'eligible-1',roleDefinitionId:'role-1',principalId:'user-1'};
  const result=await fetchSnapshotPage('directoryRoleEligibility',null,null,'fixture',async (url,init)=>{
    assert.match(String(url),/roleEligibilityScheduleInstances$/);
    assert.equal(new Headers(init?.headers).get('Accept-Language'),'en-US');
    return Response.json({value:[source]});
  });
  assert.deepEqual(JSON.parse(result.records[0]!.sourceJson),source);
});
test('Defender score snapshots preserve zero scores and validate singleton responses',async()=>{
  for(const type of ['exposureScores','deviceSecureScores'] as const){
    assert.ok(sourceUrl(type,null).startsWith('https://api.securitycenter.microsoft.com/api/'));
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

test('Endpoint token audience retains the granted WindowsDefenderATP roles',()=>{
  for(const type of ['exposureScores','deviceSecureScores','endpointRecommendations'] as const)assert.equal(sourceScope(type),'https://api.securitycenter.microsoft.com/.default');
  assert.equal(sourceScope('secureScores'),'https://graph.microsoft.com/.default');
});
test('source timeouts remain distinguishable from permission denials',async()=>{
  await assert.rejects(()=>sourceJson('https://graph.microsoft.com/v1.0/security/secureScores','fixture',async()=>{throw new DOMException('Timed out','TimeoutError');}),/sourceTimeout/);
});

test('Secure Score retains the latest snapshot while profiles retain all pages',async()=>{
  assert.ok(sourceUrl('secureScores',null).endsWith('?$top=1'));
  const score=await fetchSnapshotPage('secureScores',null,null,'fixture',async()=>Response.json({value:[{id:'latest-score'}],'@odata.nextLink':sourceUrl('secureScores',null)+'&$skiptoken=older'}));
  assert.equal(score.records.length,1);assert.equal(score.nextLink,null);
  const next=sourceUrl('secureScoreProfiles',null)+'&$skiptoken=more';
  const profiles=await fetchSnapshotPage('secureScoreProfiles',null,null,'fixture',async()=>Response.json({value:[{id:'control'}],'@odata.nextLink':next}));
  assert.equal(profiles.nextLink,next);
});
test('Secure Score retries a transient request timeout without retrying access denial',async()=>{
  let calls=0;
  const result=await fetchSnapshotPage('secureScores',null,null,'fixture',async()=>{
    if(++calls===1)throw new DOMException('Timed out','TimeoutError');
    return Response.json({value:[{id:'score'}]});
  });
  assert.equal(calls,2);assert.equal(result.records.length,1);
  calls=0;
  await assert.rejects(()=>fetchSnapshotPage('secureScoreProfiles',null,null,'fixture',async()=>{calls++;return new Response(null,{status:403});}),/missingAccess/);
  assert.equal(calls,1);
});

test('Azure inventory stores resource metadata and follows subscription-scoped paging',async()=>{
  const url=sourceUrl('azureResources',sub);
  const next=url+'&$skiptoken=next';
  const id='/subscriptions/'+sub+'/resourceGroups/audit/providers/Microsoft.Storage/storageAccounts/example';
  const page=await fetchSnapshotPage('azureResources',sub,null,'fixture',async input=>{
    assert.equal(input,url);
    return Response.json({value:[{id,name:'example',type:'Microsoft.Storage/storageAccounts',
      location:'westus',tags:{environment:'test'},properties:{credential:'discard'}}],nextLink:next});
  });
  assert.equal(page.nextLink,next);
  assert.deepEqual(JSON.parse(page.records[0]!.sourceJson),{
    id,name:'example',type:'Microsoft.Storage/storageAccounts',location:'westus',
    resourceGroup:'audit',subscriptionId:sub,tags:{environment:'test'}
  });
  await assert.rejects(()=>fetchSnapshotPage('azureResources',sub,next,'fixture',async()=>
    Response.json({value:[{id:id.replace(sub,'other'),name:'example',type:'Microsoft.Storage/storageAccounts'}]})),/invalidResponse/);
});

test('Azure resource settings preserve explicit values and discard unrelated provider properties',async()=>{
  const storageId='/subscriptions/'+sub+'/resourceGroups/audit/providers/Microsoft.Storage/storageAccounts/example';
  const storage=await fetchSnapshotPage('azureStorageSettings',sub,null,'fixture',async()=>Response.json({value:[{
    id:storageId,name:'example',properties:{allowSharedKeyAccess:false,
      sasPolicy:{sasExpirationPeriod:'01.00:00:00',expirationAction:'Block',token:'discard-me'},
      networkAcls:{defaultAction:'Deny',ipRules:[{value:'192.0.2.1',action:'Allow'}]},
      connectionString:'discard-me'}
  }]}));
  const saved=JSON.parse(storage.records[0]!.sourceJson);
  assert.equal(saved.access.allowSharedKeyAccess,false);
  assert.equal(saved.transport.minimumTlsVersion,null);
  assert.deepEqual(saved.sasPolicy,{sasExpirationPeriod:'01.00:00:00',expirationAction:'Block'});
  assert.doesNotMatch(storage.records[0]!.sourceJson,/discard-me/);

  const serverId=storageId.replace('Microsoft.Storage/storageAccounts','Microsoft.Sql/servers');
  const server={id:serverId,name:'example',properties:{minimalTlsVersion:'1.2',
    administrators:{login:'audit-admin',azureADOnlyAuthentication:true},administratorLoginPassword:'discard-me'}};
  const sql=await fetchSnapshotPage('azureSqlSettings',sub,null,'fixture',async()=>Response.json({value:[server]}));
  assert.equal(JSON.parse(sql.records[0]!.sourceJson).access.azureADOnlyAuthentication,true);
  assert.doesNotMatch(sql.records[0]!.sourceJson,/discard-me/);
  await assert.rejects(()=>fetchSnapshotPage('azureSqlSettings',sub,null,'fixture',async()=>
    Response.json({value:[{...server,id:serverId.replace(sub,'other')}]})),/invalidResponse/);
});
