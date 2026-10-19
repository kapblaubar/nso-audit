import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical,digest,entityIdentity,validateMappings } from './legacy-model.mjs';
const tenant='fe0c1fea-bc61-42cc-b384-bad739ef3c6e',scan='d4b896db-96aa-45f8-8fc3-37b572f42648';
test('source reconciliation ignores property order but detects changed evidence and missing rows',()=>{
  assert.equal(canonical({b:2,a:{date:new Date('2026-01-01T00:00:00Z')}}),canonical({a:{date:'2026-01-01T00:00:00.000Z'},b:2}));
  assert.notEqual(digest([{evidenceJson:'{"count":1}'}]),digest([{evidenceJson:'{"count":2}'}]));
  assert.notEqual(digest([{rowKey:scan}]),digest([]));
});
test('migration rejects unrecognized source keys and tenants without explicit organization mapping',()=>{
  assert.throws(()=>entityIdentity('tenants',{partitionKey:tenant,rowKey:'unexpected'}));
  assert.throws(()=>entityIdentity('findings',{partitionKey:`${tenant}:invalid`,rowKey:'control'}));
  assert.deepEqual(entityIdentity('findings',{partitionKey:`${tenant}:${scan}`,rowKey:'control'}),{tenantId:tenant,scanId:scan,checkId:'control'});
  assert.throws(()=>validateMappings({},[tenant]));
  assert.throws(()=>validateMappings({[tenant]:{organizationId:'bad',displayName:'Customer'}},[tenant]));
  assert.doesNotThrow(()=>validateMappings({[tenant]:{organizationId:scan,displayName:'Customer'}},[tenant]));
});
