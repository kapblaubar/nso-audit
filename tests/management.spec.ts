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
  await page.goto('/management');
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
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.azure/browser-results/management-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.azure/browser-results/management-mobile.png',fullPage:true});
});

test('a signed-in user without a management role cannot see customer forms',async({page})=>{
  const state=await mockManagement(page,false);
  await page.goto('/management');
  await expect(page.getByRole('alert')).toContainText('management access is required');
  await expect(page.getByLabel(/^Company name/)).toHaveCount(0);
  expect(state.requests()).toBe(0);
});
