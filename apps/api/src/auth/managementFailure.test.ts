import test from 'node:test';
import assert from 'node:assert/strict';
import {ManagementAccessError,managementFailure} from './managementFailure.js';
test('staff authorization and service failure remain distinct without disclosing raw exceptions',()=>{
  for(const status of [401,403,503] as const){const result=managementFailure(new ManagementAccessError(status,'known','Safe message'));assert.equal(result.status,status);assert.equal(result.jsonBody.error,'Safe message');}
  const result=managementFailure(new Error('sensitive connection exception'));assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('sensitive'));
});
