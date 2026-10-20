import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,newToken,tokenHash,validPassword} from './passwords.js';
test('passwords use unique salts, validate correctly, and malformed hashes fail closed',async()=>{
  const password='a sufficiently long passphrase';
  const a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.ok(await verifyPassword(password,a));
  assert.equal(await verifyPassword('incorrect password',a),false);
  assert.equal(await verifyPassword(password,'malformed'),false);
  assert.equal(validPassword('too short'),false);assert.equal(validPassword('x'.repeat(129)),false);
});
test('opaque tokens have sufficient entropy and database hashes do not expose tokens',()=>{
  const a=newToken(),b=newToken();assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
  assert.equal(tokenHash(a).length,64);assert.notEqual(tokenHash(a),a);
});

test('new passwords require length, uppercase, lowercase, a digit and punctuation or a symbol',()=>{
  for(const invalid of [null,15,'Short1!','onlylowercase123!','ONLYUPPERCASE123!','NoNumbersHere!!!','NoSpecialChars123','Spaces Alone 123','Aa1!'+ 'x'.repeat(125)])assert.equal(validPassword(invalid),false);
  for(const valid of ['LongerPassword1!','A long passphrase 2!','Aa1!'+ 'x'.repeat(124),'?mailPassword12!'])assert.equal(validPassword(valid),true);
});
