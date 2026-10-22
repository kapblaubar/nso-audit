import {test,expect,type Page} from '@playwright/test';
const org='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
const questions=[
  {id:'BKP-01',version:1,prompt:'Do you have a backup strategy?',help:'For this scope.',type:'yn',options:[]},
  {id:'BKP-02',version:1,prompt:'What proportion is covered?',help:'Measured or estimated.',type:'coverage',options:[]},
  {id:'BKP-04',version:1,prompt:'How frequently are backups taken?',help:'Actual interval.',type:'select',options:[{id:'daily',label:'Daily'}]},
  {id:'BKP-15',version:1,prompt:'When was the last restore?',help:'Restore test date.',type:'date',options:[]},
];
async function setup(page:Page,role='contributor',conflict=false){
  let stored:any[]=[];let revision=0;let saves=0;
  await page.addInitScript(()=>sessionStorage.setItem('nso.customerSession','a'.repeat(43)));
  await page.route('**/api/account/session',route=>route.fulfill({json:{user:{id:'user',name:'Client',email:'client@example.test'},workspaces:[{id:org,name:'Manual client',role,tenantId:null}]}}));
  await page.route('**/api/me/client-assessments',route=>route.fulfill({json:{assessments:[],earlierAssessments:[{id,name:'Office laptops',assetClass:'END'}]}}));
  await page.route('**/api/me/questionnaires**',async route=>{
    expect(route.request().headers()['x-nso-organization-id']).toBe(org);
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(43)}`);
    const request=route.request(),detail=new URL(request.url()).pathname.endsWith(id);
    if(request.method()==='GET'&&!detail)return route.fulfill({json:{assessments:role==='viewer'?[{id,scopeName:'Office laptops',assetClass:'END'}]:saves?[{id,scopeName:'Office laptops',assetClass:'END'}]:[]}});
    if(request.method()==='POST'){expect(request.postDataJSON()).toEqual({scopeName:'Office laptops',assetClass:'END'});}
    if(request.method()==='PUT'){
      if(conflict)return route.fulfill({status:409,json:{error:'This assessment changed. Reopen it before saving.'}});
      expect(request.postDataJSON().revision).toBe(revision);stored=request.postDataJSON().answers;revision++;saves++;
    }
    return route.fulfill({json:{id,scopeName:'Office laptops',assetClass:'END',tenantId:null,revision,status:'draft',questions,answers:stored}});
  });
  await page.goto('/signin');await page.getByRole('button',{name:'Questionnaire',exact:true}).click();
  await page.getByText('Earlier backup-only assessments (1)',{exact:true}).click();await page.getByRole('button',{name:'Open earlier assessment'}).click();
  return {saved:()=>stored,saves:()=>saves};
}
test('a client without a Microsoft tenant can save and reopen typed backup answers',async({page})=>{
  const result=await setup(page);
  const strategy=page.getByRole('region',{name:'Do you have a backup strategy?'});
  await strategy.getByLabel('Response status').selectOption('answered');
  await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('true');
  const coverage=page.getByRole('region',{name:'What proportion is covered?'});
  await coverage.getByLabel('Response status').selectOption('answered');
  await coverage.getByLabel('Total systems in scope').fill('100');await coverage.getByLabel('Covered systems').fill('80');
  await coverage.getByLabel('Measurement date').fill('2026-10-21');await coverage.getByLabel('Measurement source').fill('Backup console');
  await expect(coverage.getByText('Calculated coverage: 80.0%')).toBeVisible();
  const frequency=page.getByRole('region',{name:'How frequently are backups taken?'});
  await frequency.getByLabel('Response status').selectOption('answered');await frequency.getByRole('combobox',{name:'Answer',exact:true}).selectOption('daily');
  await page.getByRole('region',{name:'When was the last restore?'}).getByLabel('Response status').selectOption('never');
  await page.getByRole('button',{name:'Save draft'}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(result.saves()).toBe(1);expect(result.saved()).toContainEqual({questionId:'BKP-02',questionVersion:1,state:'answered',totalInScope:100,totalCovered:80,measurementDate:'2026-10-21',measurementSource:'Backup console'});
  await page.getByRole('button',{name:'All client assessments'}).click();await page.getByText('Earlier backup-only assessments (1)',{exact:true}).click();await page.getByRole('button',{name:'Open earlier assessment'}).click();
  await expect(coverage.getByLabel('Covered systems')).toHaveValue('80');await expect(strategy.getByRole('combobox',{name:'Answer',exact:true})).toHaveValue('true');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.azure/browser-results/questionnaire-mobile.png',fullPage:true});
});
test('stale saves preserve edited answers and do not report success',async({page})=>{
  await setup(page,'contributor',true);
  const strategy=page.getByRole('region',{name:'Do you have a backup strategy?'});
  await strategy.getByLabel('Response status').selectOption('answered');await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('false');
  await page.getByRole('button',{name:'Save draft'}).click();await expect(page.getByRole('alert')).toContainText('Reopen');
  await expect(strategy.getByRole('combobox',{name:'Answer',exact:true})).toHaveValue('false');await expect(page.getByText('Unsaved changes',{exact:true})).toBeVisible();
});
test('viewers can reopen questionnaires but cannot create or edit them',async({page})=>{
  await setup(page,'viewer');await expect(page.getByRole('button',{name:'Create assessment'})).toHaveCount(0);
  await expect(page.getByText('This assessment is read-only.')).toBeVisible();
  for(const select of await page.getByLabel('Response status').all())await expect(select).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save draft'})).toHaveCount(0);
});
