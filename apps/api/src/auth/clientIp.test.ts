import test from 'node:test';
import assert from 'node:assert/strict';
import {requestClientIp} from './clientIp.js';
test('client-IP throttling trusts the configured edge only after FDID matches',()=>{
  const headers=new Headers({'x-forwarded-for':'198.51.100.9, 192.0.2.1:443','x-azure-fdid':'trusted-edge','x-azure-socketip':'203.0.113.7'});
  assert.equal(requestClientIp(headers,undefined),'192.0.2.1');
  assert.equal(requestClientIp(headers,'different-edge'),'192.0.2.1');
  assert.equal(requestClientIp(headers,'trusted-edge'),'203.0.113.7');
  headers.set('x-azure-socketip','not an IP');assert.equal(requestClientIp(headers,'trusted-edge'),'192.0.2.1');
  headers.set('x-forwarded-for','[2001:db8::1]:443');assert.equal(requestClientIp(headers,undefined),'2001:db8::1');
});
