// Local browser checks with synthetic, intercepted API responses; no Azure calls or credentials.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';

process.env.VITE_API_BASE_URL='/api';
const server=await createServer({root:fileURLToPath(new URL('../apps/web',import.meta.url)),
  server:{host:'127.0.0.1',port:0},configFile:false});
await server.listen();
const address=server.httpServer.address();
const origin=process.env.AUDIT_UI_TEST_ORIGIN??`http://127.0.0.1:${address.port}`;
const apiOrigin=process.env.AUDIT_UI_TEST_API_ORIGIN??origin;
let browser;
const org='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002';
const scan='00000000-0000-4000-8000-000000000003',sku='00000000-0000-4000-8000-000000000004';
const at='2026-11-09T12:00:00.000Z';
try{
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const context=await browser.newContext();
  await context.addInitScript(({org})=>{sessionStorage.setItem('nso.customerSession','synthetic-test-session');sessionStorage.setItem('nso.customerWorkspace',org);},{org});
  let role='owner',firstPollAt=0,fail=false;
  const requests=[];
  const respondApi=async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.origin,apiOrigin);requests.push(`${request.method()} ${url.pathname}${url.search}`);
    const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value),
      headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
    if(request.method()==='OPTIONS')return respond({});
    if(url.pathname==='/api/account/login')return respond({token:'synthetic-test-session'});
    if(url.pathname==='/api/account/logout')return respond({});
    if(url.pathname==='/api/account/session')return respond({user:{name:'Fixture User',email:'fixture@example.invalid'},
      workspaces:[{id:org,name:'Fixture workspace',tenantId:tenant,role}]});
    assert.equal(request.headers()['x-nso-organization-id'],org);
    if(url.pathname==='/api/me/bootstrap')return respond({tenantId:tenant,registered:true,consentStatus:'granted',azureRbacStatus:'notConfigured',
      latestScan:{scanId:'00000000-0000-4000-8000-000000000099',status:'complete'},destination:'report'});
    if(url.pathname==='/api/me/scans')return respond({scans:[{scanId:scan,status:'complete',createdAt:at,auditScope:'licensing'}]});
    if(url.pathname==='/api/me/audits'&&request.method()==='POST')return respond({scanId:scan},202);
    if(url.pathname===`/api/me/audits/${scan}`){
      firstPollAt ||= Date.now();
      const status=Date.now()-firstPollAt<2000?'running':fail?'partial':'complete';
      return respond({audit:{ScanId:scan,Scope:'licensing',Status:status,CreatedAtUtc:at,StartedAtUtc:at,CompletedAtUtc:status==='running'?null:at},
        collections:[{DataType:'licenses',Status:'complete',RecordCount:1,ErrorCode:null},
          {DataType:'licenseAssignments',Status:fail?'missingAccess':status,RecordCount:fail?0:1,ErrorCode:fail?'missingAccess':null}]});
    }
    if(url.pathname===`/api/me/audits/${scan}/licenses`)return respond({rows:[{SourceId:'fixture',SkuId:sku,SkuPartNumber:'FIXTURE_SKU',EnabledUnits:10,ConsumedUnits:1,CollectedAtUtc:at}],total:1,page:1,pageSize:50});
    if(url.pathname===`/api/me/audits/${scan}/licenseAssignments`)return respond({rows:fail?[]:[{UserId:tenant,SkuId:sku,UserPrincipalName:'fixture@example.invalid',SkuPartNumber:'FIXTURE_SKU',AssignmentType:'direct',AssignmentSource:'direct',AssignmentState:'Active',CollectedAtUtc:at}],total:fail?0:1,page:1,pageSize:50});
    throw new Error(`Unexpected API request: ${url.pathname}`);
  };
  await context.route('**/api/**',respondApi);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/audit-data`);
  await page.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  await page.locator(`.scan-history a[href="/audit-data/${scan}"]`).waitFor();
  await page.getByRole('button',{name:'Run license audit',exact:true}).click();
  await page.waitForURL(`**/audit-data/${scan}`);
  await page.getByText('Collection is queued or running.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Run license audit',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.audit-data-page .step-action')?.disabled,undefined,{timeout:15000});
  await page.getByRole('button',{name:'View users',exact:true}).click();
  await page.getByRole('cell',{name:'fixture@example.invalid',exact:true}).waitFor();
  assert.ok(requests.some(r=>r.includes(`/licenseAssignments?`)&&r.includes(`skuId=${sku}`)));
  await page.getByRole('button',{name:'Clear license filter'}).click();
  await page.getByRole('searchbox').fill('fixture');
  await page.getByRole('cell',{name:'fixture@example.invalid',exact:true}).waitFor();
  assert.ok(requests.some(r=>r.includes('search=fixture')));
  fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByText('Microsoft denied access.',{exact:false}).waitFor();
  await page.reload();
  await page.getByRole('heading',{name:'Audit snapshot',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,`/audit-data/${scan}`,'Session restoration lost the requested audit.');
  role='viewer';await page.reload();
  await page.getByText('You have read-only access to saved audits.').waitFor();
  assert.equal(await page.getByRole('button',{name:'Run license audit',exact:true}).isDisabled(),true);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Audit page overflows the mobile viewport.');
  assert.deepEqual(errors,[]);
  const chooser=await browser.newContext();
  await chooser.addInitScript(()=>sessionStorage.setItem('nso.customerSession','synthetic-test-session'));
  await chooser.route('**/api/**',respondApi);
  const chooserPage=await chooser.newPage();
  await chooserPage.goto(`${origin}/audit-data`);
  await chooserPage.getByRole('heading',{name:'Your workspaces',exact:true}).waitFor();
  await chooserPage.getByRole('button',{name:'Open workspace',exact:true}).click();
  await chooserPage.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  assert.equal(new URL(chooserPage.url()).pathname,'/audit-data','Workspace selection lost the audit destination.');
  await chooser.close();
  const login=await browser.newContext();
  await login.route('**/api/**',respondApi);
  const loginPage=await login.newPage();
  await loginPage.goto(`${origin}/signin`);
  await loginPage.getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');
  await loginPage.getByLabel('Password',{exact:true}).fill('Synthetic-password-for-tests');
  await loginPage.getByRole('button',{name:'Sign in with email',exact:true}).click();
  await loginPage.getByRole('button',{name:'Open workspace',exact:true}).click();
  await loginPage.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  assert.equal(new URL(loginPage.url()).pathname,'/audit-data','Normal sign-in opened an old report.');
  await loginPage.getByRole('button',{name:'Sign out',exact:true}).click();
  await loginPage.getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');
  await loginPage.getByLabel('Password',{exact:true}).fill('Synthetic-password-for-tests');
  await loginPage.getByRole('button',{name:'Sign in with email',exact:true}).click();
  await loginPage.getByRole('button',{name:'Open workspace',exact:true}).click();
  await loginPage.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  assert.equal(new URL(loginPage.url()).pathname,'/audit-data','Sign-out/sign-in returned to an old report.');
  await loginPage.goto(`${origin}/account/workspace`);
  await loginPage.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  assert.equal(new URL(loginPage.url()).pathname,'/audit-data','Old workspace bookmark opened a scorecard.');
  await login.close();
  console.log('PASS: audit launch, progress polling, stored license rows, assignment drill-down/search, missing access, route restoration, viewer controls and mobile layout.');
  console.log('PASS: audit destination survives workspace selection and email sign-in.');
}finally{await browser?.close();await server.close();}
