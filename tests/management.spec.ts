import {test,expect,type Page} from '@playwright/test';

async function mockManagement(page:Page,authorized=true){
  await page.route('**/src/auth.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    export async function initializeAuth(){return {account:{name:'Test administrator',username:'staff@example.test',tenantId:'test',homeAccountId:'test'}};}
    export async function getApiAccessToken(){return 'browser-test-only';}
    export async function signIn(){} export async function signOut(){}
    export async function signInManagement(){} export async function signOutManagement(){}
  `}));
  let saved:any;
  let customerRequests=0;
  await page.route('**/api/management/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/bootstrap')){
      await route.fulfill({status:authorized?200:403,json:authorized?{role:'setupAdmin',name:'Test administrator',environment:'dev'}:{error:'NewSommer management access is required.'}});return;
    }
    if(path.endsWith('/test-users')){await route.fulfill({json:{accounts:[]}});return;}
    if(path.endsWith('/invite')){
      expect(route.request().method()).toBe('POST');
      await route.fulfill({json:{message:'Invitation sent to owner@example.test.'}});return;
    }
    customerRequests++;
    if(route.request().method()==='GET'&&path.endsWith('/customers')){
      await route.fulfill({json:{customers:saved?[{organizationId:saved.organizationId,companyName:saved.profile.companyName,primaryContactEmail:saved.profile.primaryContactEmail,version:saved.version}]:[]}});return;
    }
    if(['POST','PUT'].includes(route.request().method())){
      const input=route.request().postDataJSON();
      saved={...input,organizationId:'d4b896db-96aa-45f8-8fc3-37b572f42648',version:saved?'0x0000000000000002':'0x0000000000000001',pendingOwnerEmail:null};
    }
    await route.fulfill({json:saved});
  });
  return{saved:()=>saved,requests:()=>customerRequests};
}

test('staff can create and edit a non-Microsoft customer with a pending owner',async({page})=>{
  const state=await mockManagement(page);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/clientmanagement');
  await expect(page.getByRole('heading',{name:'Customer management'})).toBeVisible();
  await page.getByLabel(/^Company name/).fill('Independent customer');
  await page.getByLabel(/^Primary contact name/).fill('Client owner');
  await page.getByLabel(/^Primary contact email/).fill('owner@example.test');
  await page.getByRole('button',{name:'Add primary contact as owner'}).click();
  await expect(page.getByLabel('User 1 email')).toHaveValue('owner@example.test');
  await page.getByRole('button',{name:'Create customer',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Customer details saved');
  expect(state.saved().profile.microsoftAccount).toBe('');
  expect(state.saved().profile.microsoftTenantId).toBe('');
  expect(state.saved().profile.subscriptionIds).toEqual([]);
  expect(state.saved().users[0].role).toBe('owner');
  await page.getByLabel(/^Setup notes/).fill('Insurance renewal assessment');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Customer details saved');
  expect(state.saved().version).toBe('0x0000000000000002');
  expect(state.saved().profile.notes).toBe('Insurance renewal assessment');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Send invitation',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Invitation sent');
  await expect(page.getByRole('button',{name:'Resend invitation',exact:true})).toBeEnabled();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.azure/browser-results/management-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.azure/browser-results/management-mobile.png',fullPage:true});
});

test('a signed-in user without a management role cannot see customer forms',async({page})=>{
  const state=await mockManagement(page,false);
  await page.goto('/clientmanagement');
  await expect(page.getByRole('alert')).toContainText('management access is required');
  await expect(page.getByLabel(/^Company name/)).toHaveCount(0);
  expect(state.requests()).toBe(0);
});

test('Dev test account deletion requires the exact email and preserves the user until confirmed',async({page})=>{
  await mockManagement(page);let deleted=false;
  await page.route('**/api/management/test-users**',async route=>{
    if(route.request().method()==='DELETE'){
      expect(route.request().postDataJSON()).toEqual({confirmEmail:'repeat@example.test'});deleted=true;
      return route.fulfill({json:{message:'Test account deleted. You can register this email again.'}});
    }
    await route.fulfill({json:{accounts:deleted?[]:[{id:'aa8333f3-cb60-4d4b-b095-2151cdcbdfb1',email:'repeat@example.test',name:'Tester',verified:false,membershipCount:0}]}});
  });
  await page.goto('/clientmanagement');await page.getByText('Test accounts ? delete and register again',{exact:true}).click();
  await page.getByRole('button',{name:'Delete account',exact:true}).click();
  const confirm=page.getByRole('button',{name:'Permanently delete account',exact:true});await expect(confirm).toBeDisabled();
  await page.getByLabel('Type the email to confirm deletion').fill('wrong@example.test');await expect(confirm).toBeDisabled();expect(deleted).toBe(false);
  await page.getByLabel('Type the email to confirm deletion').fill('repeat@example.test');await confirm.click();
  await expect(page.getByRole('status')).toContainText('register this email again');expect(deleted).toBe(true);
});

test('signed-in staff can retry a database outage without another Microsoft login',async({page})=>{
  await mockManagement(page);
  let unavailable=true;
  await page.route('**/api/management/bootstrap',route=>route.fulfill({status:unavailable?503:200,json:unavailable?{error:'Your Microsoft sign-in succeeded, but the customer database is temporarily unavailable. Retry access shortly.',code:'staff_directory_unavailable',diagnostic:{reason:'firewallDenied',clientIp:'192.0.2.1'}}:{role:'setupAdmin',name:'Administrator',environment:'dev'}}));
  await page.goto('/clientmanagement');
  await expect(page.getByRole('alert')).toContainText('database is temporarily unavailable');
  await expect(page.getByRole('button',{name:'Sign in with Microsoft',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy support details',exact:true})).toBeVisible();
  unavailable=false;await page.getByRole('button',{name:'Retry access',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Customer management'})).toBeVisible();
});
