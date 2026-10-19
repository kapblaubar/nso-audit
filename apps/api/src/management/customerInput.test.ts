import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomerInput} from './customerInput.js';
const profile={companyName:'Example company',primaryContactName:'Client owner',primaryContactEmail:'owner@example.test'};
const id='c2214bac-bf7a-427d-9013-111f8768d3e1';
test('a customer can be created without any Microsoft or Azure fields',()=>{
  const result=validateCustomerInput({profile},true);
  assert.equal(result.profile.microsoftAccount,'');assert.equal(result.profile.microsoftTenantId,'');
  assert.deepEqual(result.profile.subscriptionIds,[]);assert.deepEqual(result.users,[]);
  assert.equal(result.profile.employeeCount,null);
});
test('company and contact are required while supplied Microsoft identifiers must be valid',()=>{
  for(const key of ['companyName','primaryContactName','primaryContactEmail'])assert.throws(()=>validateCustomerInput({profile:{...profile,[key]:''}},true));
  assert.throws(()=>validateCustomerInput({profile:{...profile,microsoftTenantId:'not-a-tenant'}},true));
  assert.throws(()=>validateCustomerInput({profile:{...profile,subscriptionIds:['bad']}},true));
  assert.deepEqual(validateCustomerInput({profile:{...profile,subscriptionIds:[id,id.toUpperCase()]}},true).profile.subscriptionIds,[id]);
});
test('customer metadata cannot carry passwords, identity grants or forged actor fields',()=>{
  assert.throws(()=>validateCustomerInput({profile,password:'do not store'},true));
  assert.throws(()=>validateCustomerInput({profile:{...profile,password:'do not store'}},true));
  assert.throws(()=>validateCustomerInput({profile,actor:{role:'platformAdmin'}},true));
  assert.throws(()=>validateCustomerInput({profile,users:[{id,displayName:'Client',email:'client@example.test',role:'owner',userId:id}]},true));
});
test('duplicate user emails, invalid role and stale or absent versions are rejected',()=>{
  const user={id,displayName:'Client',email:'client@example.test',role:'owner'};
  assert.throws(()=>validateCustomerInput({profile,users:[user,{...user,id:'ce364cac-0ba8-491f-a0fb-54024e05c621',email:'CLIENT@example.test'}]},true));
  assert.throws(()=>validateCustomerInput({profile,users:[{...user,role:'platformAdmin'}]},true));
  assert.throws(()=>validateCustomerInput({profile},false));
  assert.equal(validateCustomerInput({profile,version:'0x0000000000000001'},false).version,'0x0000000000000001');
});
test('unsafe URLs and invalid counts are rejected',()=>{
  for(const website of ['javascript:alert(1)','https://user:password@example.test','not-a-url'])assert.throws(()=>validateCustomerInput({profile:{...profile,website}},true));
  for(const employeeCount of [-1,1.2,'500',NaN])assert.throws(()=>validateCustomerInput({profile:{...profile,employeeCount}},true));
});
