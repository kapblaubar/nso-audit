import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationMessage,invitationLifetimeHours} from './accountEmail.js';
test('invitation links use configured HTTPS origin and a fragment, without query secrets or credentials',()=>{
  const message=invitationMessage('https://portal.example.test/some/path','a'.repeat(43),'Client workspace',72);
  assert.ok(message.plainText.includes('https://portal.example.test/account/invitation#token='+'a'.repeat(43)));
  assert.ok(message.plainText.includes('Client workspace'));assert.ok(message.plainText.includes('72 hours'));
  assert.ok(!message.plainText.includes('?token='));
  assert.throws(()=>invitationMessage('http://portal.example.test','a'.repeat(43),'Client',72));
  assert.throws(()=>invitationMessage('https://portal.example.test','bad token','Client',72));
});
test('invitation lifetime is bounded and separately configurable per environment',()=>{
  const previous=process.env.ACCOUNT_INVITATION_HOURS;
  try{process.env.ACCOUNT_INVITATION_HOURS='48';assert.equal(invitationLifetimeHours(),48);
    for(const invalid of ['0','169','1.5','NaN']){process.env.ACCOUNT_INVITATION_HOURS=invalid;assert.throws(invitationLifetimeHours);}
  }finally{if(previous===undefined)delete process.env.ACCOUNT_INVITATION_HOURS;else process.env.ACCOUNT_INVITATION_HOURS=previous;}
});
