import assert from 'node:assert/strict';
import test from 'node:test';
import functions from '@azure/functions';
import {compareEvidence} from './compareEvidence.js';
import {readComparison} from './index.js';

test('compares nested source changes and ignores local timestamps and object key order',()=>{
  const before=[
    {SourceId:'same',SourceJson:'{"a":1,"b":2}',CollectedAtUtc:'before'},
    {SourceId:'edit',SourceJson:'{"settings":{"enabled":false}}'},
    {SourceId:'remove'},
  ];
  const after=[
    {SourceId:'same',SourceJson:'{"b":2,"a":1}',CollectedAtUtc:'after'},
    {SourceId:'edit',SourceJson:'{"settings":{"enabled":true}}'},
    {SourceId:'add'},
  ];
  const rows=compareEvidence(before,after,'conditionalAccess');
  assert.deepEqual(rows.map(row=>row.status),['Unchanged','Changed','Added','Removed']);
  assert.deepEqual(rows[1]?.changes,[{path:'/Source/settings/enabled',before:false,after:true}]);
});

test('distinguishes assignment paths and detects disabled plan and source timestamp changes',()=>{
  const assignment={UserId:'u',SkuId:'sku',AssignmentSource:'direct',DisabledPlansJson:'["b","a"]',
    SourceUpdatedAtUtc:new Date('2026-11-20T12:00:00Z')};
  const rows=compareEvidence([assignment],[
    {...assignment,DisabledPlansJson:'["a","b"]',SourceUpdatedAtUtc:new Date('2026-11-21T12:00:00Z')},
    {...assignment,AssignmentSource:'group'},
  ],'licenseAssignments');
  assert.deepEqual(rows.map(row=>row.status),['Changed','Added']);
  assert.deepEqual(rows[0]?.changes,[{path:'/SourceUpdatedAtUtc',before:'2026-11-20T12:00:00.000Z',after:'2026-11-21T12:00:00.000Z'}]);
});

test('rejects anonymous requests before touching SQL',async()=>{
  const result=await readComparison(new functions.HttpRequest({method:'GET',url:'https://compare.example.invalid/api/me/audit-compare'}),
    new functions.InvocationContext());
  assert.equal(result.status,401);
  assert.deepEqual(result.headers,{'Cache-Control':'no-store'});
});
