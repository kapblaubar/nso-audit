import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {HttpRequest,InvocationContext}=createRequire(import.meta.url)('@azure/functions') as typeof import('@azure/functions');
import {testAccounts} from '../functions/testAccounts.js';
test('test-account cleanup is unavailable outside Dev and denies unauthenticated Dev callers',async()=>{
  const previous=process.env.APP_ENVIRONMENT;
  try{
    for(const environment of ['prod','unknown','']){
      process.env.APP_ENVIRONMENT=environment;
      const response=await testAccounts(new HttpRequest({url:'https://example.test/api/management/test-users',method:'GET'}),new InvocationContext({functionName:'test'}));
      assert.equal(response.status,404);
    }
    process.env.APP_ENVIRONMENT='dev';
    const response=await testAccounts(new HttpRequest({url:'https://example.test/api/management/test-users',method:'GET'}),new InvocationContext({functionName:'test'}));
    assert.equal(response.status,403);
  }finally{if(previous===undefined)delete process.env.APP_ENVIRONMENT;else process.env.APP_ENVIRONMENT=previous;}
});
