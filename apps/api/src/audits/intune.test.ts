import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchIntuneChildPage,intuneChildUrl,parseIntuneCursor} from './intune.js';
import {sanitizeEvidence} from './snapshots.js';
const parent={sourceId:'policy-1',displayName:'Synthetic policy',status:'complete'};
test('settings retain nested values, definitions and parent-scoped identifiers',async()=>{
  const setting={id:'0',settingInstance:{settingDefinitionId:'setting-a',choiceSettingValue:{value:'enabled',children:[{settingDefinitionId:'nested',simpleSettingValue:{value:123}}]}},
    settingDefinitions:[{id:'setting-a',displayName:'Synthetic setting',options:[{itemId:'enabled',displayName:'Enabled'}]}]};
  const result=await fetchIntuneChildPage('settingsCatalogSettings',parent,parseIntuneCursor(null),'fixture',async url=>{
    assert.equal(String(url),intuneChildUrl('settingsCatalogSettings',parent.sourceId));return Response.json({value:[setting]});
  });
  assert.deepEqual(JSON.parse(result.records[0]!.sourceJson),setting);
  assert.equal(result.records[0]!.parentSourceId,'policy-1');assert.equal(result.records[0]!.childSourceId,'0');
  assert.match(result.records[0]!.displayName!,/Synthetic setting/);
  const other=await fetchIntuneChildPage('settingsCatalogSettings',{...parent,sourceId:'policy-2'},parseIntuneCursor(null),'fixture',async()=>Response.json({value:[setting]}));
  assert.notEqual(result.records[0]!.sourceId,other.records[0]!.sourceId);
  assert.deepEqual(parseIntuneCursor(result.nextLink),{after:'policy-1',page:null});
});
test('assignment inclusion, exclusions and filters remain queryable',async()=>{
  const page=await fetchIntuneChildPage('compliancePolicyAssignments',parent,parseIntuneCursor(null),'fixture',async()=>Response.json({value:[
    {id:'a',target:{'@odata.type':'#microsoft.graph.exclusionGroupAssignmentTarget',groupId:'synthetic-group',deviceAndAppManagementAssignmentFilterId:'filter',deviceAndAppManagementAssignmentFilterType:'exclude'}},
    {id:'b',target:{'@odata.type':'#microsoft.graph.allLicensedUsersAssignmentTarget'}}]}));
  assert.equal(page.records[0]!.groupId,'synthetic-group');assert.equal(page.records[0]!.filterType,'exclude');
  assert.match(page.records[0]!.targetType!,/exclusion/);assert.match(page.records[1]!.displayName!,/All Users/);
});
test('child paging is resumable and cannot switch policies, APIs or origins',async()=>{
  const initial=intuneChildUrl('settingsCatalogAssignments','policy-1'),next=initial+'?$skiptoken=next';
  const first=await fetchIntuneChildPage('settingsCatalogAssignments',parent,parseIntuneCursor(null),'fixture',async()=>Response.json({value:[],'@odata.nextLink':next}));
  const second=await fetchIntuneChildPage('settingsCatalogAssignments',parent,parseIntuneCursor(first.nextLink),'fixture',async url=>{
    assert.equal(url,next);return Response.json({value:[]});
  });
  assert.equal(parseIntuneCursor(second.nextLink).page,null);
  for(const url of [next.replace('policy-1','policy-2'),next.replace('graph.microsoft.com','evil.invalid'),next.replace('/assignments','/settings')])
    await assert.rejects(()=>fetchIntuneChildPage('settingsCatalogAssignments',parent,{after:'policy-1',page:url},'fixture',async()=>{throw new Error('Must not fetch');}),/invalidPagingLink/);
  assert.throws(()=>parseIntuneCursor('{'),/invalidPagingLink/);
});
test('empty sources, denied access, mismatched details and truncated definitions remain distinct',async()=>{
  const empty=await fetchIntuneChildPage('deviceConfigurationAssignments',parent,parseIntuneCursor(null),'fixture',async()=>Response.json({value:[]}));
  assert.equal(empty.records.length,0);
  await assert.rejects(()=>fetchIntuneChildPage('compliancePolicyDetails',parent,parseIntuneCursor(null),'fixture',async()=>new Response(null,{status:403})),/missingAccess/);
  await assert.rejects(()=>fetchIntuneChildPage('compliancePolicyDetails',parent,parseIntuneCursor(null),'fixture',async()=>Response.json({id:'different'})),/invalidSourceIdentifier/);
  await assert.rejects(()=>fetchIntuneChildPage('settingsCatalogSettings',parent,parseIntuneCursor(null),'fixture',async()=>Response.json({value:[{id:'0','settingDefinitions@odata.nextLink':'next'}]})),/incompleteSettingDefinitions/);
});
test('encrypted custom and secret setting values are redacted without losing policy requirements',()=>{
  assert.deepEqual(sanitizeEvidence({passwordRequired:true,omaSettings:[{id:'a',isEncrypted:true,value:'secret'}],
    setting:{'@odata.type':'#microsoft.graph.deviceManagementConfigurationSecretSettingValue',value:'secret'}}),
    {passwordRequired:true,omaSettings:[{id:'a',isEncrypted:true,value:'[redacted]'}],setting:{'@odata.type':'#microsoft.graph.deviceManagementConfigurationSecretSettingValue',value:'[redacted]'}});
});
test('Recovery Services child snapshots preserve nested policy settings and ARM paging',async()=>{
  const subscriptionId='257f10d8-cb7f-400c-8e29-7f1fc5318247';
  const vault={sourceId:`/subscriptions/${subscriptionId}/resourceGroups/Backup RG/providers/Microsoft.RecoveryServices/vaults/vault-a`,displayName:'vault-a',status:'complete'};
  const url=intuneChildUrl('recoveryBackupPolicies',vault.sourceId,subscriptionId);
  assert.match(url,/^https:\/\/management\.azure\.com\/subscriptions\/[^/]+\/resourceGroups\/Backup%20RG\/providers\/Microsoft\.RecoveryServices\/vaults\/vault-a\/backupPolicies\?api-version=/);
  const policy={id:`${vault.sourceId}/backupPolicies/sql-with-log`,name:'sql-with-log',properties:{
    backupManagementType:'AzureWorkload',workLoadType:'SQLDataBase',protectedItemsCount:0,subProtectionPolicy:[
      {policyType:'Full',retentionPolicy:{retentionPolicyType:'LongTermRetentionPolicy',dailySchedule:{retentionDuration:{count:30}}}},
      {policyType:'Log',schedulePolicy:{schedulePolicyType:'LogSchedulePolicy',scheduleFrequencyInMins:60}},
    ],
  }};
  const next=url+'&skipToken=page-2';
  const first=await fetchIntuneChildPage('recoveryBackupPolicies',vault,parseIntuneCursor(null),'fixture',async()=>Response.json({value:[policy],nextLink:next}),subscriptionId);
  assert.deepEqual(JSON.parse(first.records[0]!.sourceJson),policy);
  assert.equal(first.records[0]?.parentSourceId,vault.sourceId);
  assert.equal(parseIntuneCursor(first.nextLink).page,next);
  await assert.rejects(()=>fetchIntuneChildPage('recoveryBackupPolicies',vault,{after:vault.sourceId,page:next.replace('vault-a','vault-b')},'fixture',async()=>{throw new Error('Unexpected fetch');},subscriptionId),/invalidPagingLink/);
  assert.throws(()=>intuneChildUrl('recoveryBackupPolicies',vault.sourceId,'00000000-0000-0000-0000-000000000000'),/invalidSourceIdentifier/);
  const config={id:`${vault.sourceId}/backupconfig/vaultconfig`,properties:{softDeleteFeatureState:'Enabled'}};
  const settings=await fetchIntuneChildPage('recoveryVaultConfig',vault,parseIntuneCursor(null),'fixture',async()=>Response.json(config),subscriptionId);
  assert.deepEqual(JSON.parse(settings.records[0]!.sourceJson),config);
  const detailParent={sourceId:first.records[0]!.sourceId,resourceId:policy.id,displayName:policy.name,status:'complete'};
  const detail=await fetchIntuneChildPage('recoveryPolicyDetails',detailParent,parseIntuneCursor(null),'fixture',async resource=>{
    assert.equal(new URL(String(resource)).pathname,new URL(url).pathname+'/sql-with-log');
    return Response.json({...policy,properties:{...policy.properties,protectedItemsCount:2}});
  },subscriptionId);
  assert.equal(detail.records[0]?.parentSourceId,detailParent.sourceId);
  assert.equal(JSON.parse(detail.records[0]!.sourceJson).properties.protectedItemsCount,2);
});
