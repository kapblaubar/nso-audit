import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('config/questionnaires/client-v1.json','utf8'));
const org='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
async function setup(page:Page,role='contributor',stale=false){
  const data:any={id,name:'Company assessment',answerOwner:'Client',reviewer:'Reviewer',revision:0,status:'draft',...structuredClone(catalog),groups:catalog.sections.filter((s:any)=>!s.repeatable).map((s:any,index:number)=>({id:`33333333-3333-3333-3333-${String(index+1).padStart(12,'0')}`,sectionId:s.id,name:s.title,context:{},answers:[],reviews:[]}))};
  await page.addInitScript(()=>sessionStorage.setItem('nso.customerSession','a'.repeat(43)));
  await page.route('**/api/account/session',route=>route.fulfill({json:{user:{id:'user',name:'Client',email:'client@example.test'},workspaces:[{id:org,name:'Manual client',role,tenantId:null}]}}));
  await page.route('**/api/me/client-assessments**',async route=>{
    const request=route.request(),parts=new URL(request.url()).pathname.split('/').filter(Boolean);
    expect(request.headers()['x-nso-organization-id']).toBe(org);
    if(request.method()==='GET'&&!parts.includes(id))return route.fulfill({json:{assessments:[{id,name:data.name,templateVersion:'client-v1'}],earlierAssessments:[]}});
    if(request.method()!=='GET'){
      const body=request.postDataJSON();expect(body.revision).toBe(data.revision);
      if(stale)return route.fulfill({status:409,json:{error:'This assessment changed. Reopen it before saving.'}});
      data.revision++;
      if(request.method()==='POST')data.groups.push({id:`55555555-5555-5555-5555-${String(data.groups.length).padStart(12,'0')}`,name:body.name,sectionId:body.sectionId,context:body.context,answers:[],reviews:[]});
      else{const group=data.groups.find((g:any)=>g.id===parts[5]);if(parts.includes('reviews'))group.reviews=[{questionId:parts.at(-1),questionVersion:body.questionVersion,...body.review}];else group.answers=body.answers;}
    }
    return route.fulfill({json:data});
  });
  await page.goto('/signin');await page.getByRole('button',{name:'Questionnaire',exact:true}).click();await page.getByRole('button',{name:'Open assessment',exact:true}).click();return data;
}
const question=(page:Page,prompt:string)=>page.getByRole('region',{name:prompt,exact:true});
const navigate=async(page:Page,title:string)=>page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button',{name:new RegExp(title)}).click();
async function addGroup(page:Page,name:string,assetClass:string){const details=page.locator('.assessment-add-group');if(!await details.evaluate(e=>e.hasAttribute('open')))await details.getByText('Add a scope group',{exact:true}).click();await details.getByLabel('Group name / environment',{exact:true}).fill(name);await details.getByRole('combobox',{name:'Asset class',exact:true}).selectOption(assetClass);await details.getByRole('button',{name:'Add scope group',exact:true}).click();}
test('all 12 sections, company records and multiple backup scopes save and reopen independently',async({page})=>{
  const data=await setup(page);await expect(page.getByRole('heading',{name:'Client assessment questionnaire',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button')).toHaveCount(12);
  const scopes=question(page,'What tenants/accounts, domains and locations belong to each environment?');await scopes.getByRole('button',{name:'Add item',exact:true}).click();
  for(const [label,value] of [['Environment / platform','Microsoft 365'],['Tenant / account identifier','tenant-example'],['Domains','example.test'],['Locations','US']])await scopes.getByLabel(label!,{exact:true}).fill(value!);
  const env=question(page,'Which environments are included?');await env.getByRole('checkbox',{name:'Microsoft 365',exact:true}).check();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  await navigate(page,'Backups and recovery');await addGroup(page,'Office laptops','endpoints');
  const strategy=question(page,'Do you have a defined backup strategy for these systems/data?');await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('true');
  const retention=question(page,'How long are backups retained?');await retention.getByRole('button',{name:'Add item',exact:true}).click();await retention.getByLabel('Retention tier',{exact:true}).fill('Daily');await retention.getByRole('spinbutton',{name:'Retention duration',exact:true}).fill('30');await retention.getByRole('combobox',{name:'Unit',exact:true}).selectOption('days');await retention.getByLabel('Systems / data covered',{exact:true}).fill('Office laptops');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  await addGroup(page,'Production databases','databases');await expect(question(page,'Can required databases be restored to a selected point in time?')).toBeVisible();await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('false');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.getByRole('combobox',{name:'Scope group',exact:true}).selectOption({label:'Office laptops'});await expect(strategy.getByRole('combobox',{name:'Answer',exact:true})).toHaveValue('true');expect(data.groups.filter((g:any)=>g.sectionId==='backups')).toHaveLength(2);
  await navigate(page,'Company and assessment scope');await expect(scopes.getByLabel('Domains',{exact:true})).toHaveValue('example.test');await page.getByRole('button',{name:'All client assessments',exact:true}).click();await page.getByRole('button',{name:'Open assessment',exact:true}).click();await expect(scopes.getByLabel('Domains',{exact:true})).toHaveValue('example.test');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'.azure/browser-results/client-questionnaire-mobile.png',fullPage:true});
});
test('stale edits remain visible and are not reported as saved',async({page})=>{
  await setup(page,'contributor',true);const company=question(page,'What company, business units and locations does this assessment cover?');await company.getByLabel('Company or location name').fill('Washougal');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Reopen');await expect(company.getByLabel('Company or location name')).toHaveValue('Washougal');await expect(page.getByText('Unsaved changes',{exact:true})).toBeVisible();
});
test('viewers cannot create, enter answers or record reviews',async({page})=>{
  await setup(page,'viewer');for(const input of await page.locator('.questionnaire-question input, .questionnaire-question textarea, .questionnaire-question select').all())await expect(input).toBeDisabled();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Save reviewer conclusion'})).toHaveCount(0);
});
test('an admin records a reviewer conclusion independently of the customer answer',async({page})=>{
  const data=await setup(page,'admin');await navigate(page,'Backups and recovery');await addGroup(page,'Office laptops','endpoints');const company=question(page,'Do you have a defined backup strategy for these systems/data?');await company.getByText('Reviewer conclusion',{exact:true}).first().click();await company.getByLabel('Review rationale and actions').fill('Scope needs supporting evidence');await company.getByRole('combobox',{name:'Evidence status',exact:true}).selectOption('missing');await company.getByRole('button',{name:'Save reviewer conclusion'}).click();await expect(page.getByRole('status')).toContainText('saved separately');const group=data.groups.find((g:any)=>g.sectionId==='backups');expect(group.answers).toHaveLength(0);expect(group.reviews[0].conclusion).toBe('unknown');expect(group.reviews[0].evidenceState).toBe('missing');
});

 test('company intake is a direct answer and clearing it removes the saved response',async({page})=>{
  const data=await setup(page,'admin');const company=question(page,'What company, business units and locations does this assessment cover?');
  await expect(company.getByLabel('Response status')).toHaveCount(0);
  await expect(company.getByText('Reviewer conclusion',{exact:true})).toHaveCount(0);
  await expect(company.getByLabel('Evidence reference (optional)')).toHaveCount(0);
  await company.getByLabel('Company or location name').fill('Washougal');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(data.groups.find((g:any)=>g.sectionId==='company').answers[0].textValue).toBe('Washougal');
  await company.getByLabel('Company or location name').fill('');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(data.groups.find((g:any)=>g.sectionId==='company').answers).toHaveLength(0);
});

test('security exceptions and Other choices require explanations without a status field',async({page})=>{
  await setup(page);const environments=question(page,'Which environments are included?');
  await environments.getByRole('checkbox',{name:'other',exact:true}).check();
  await expect(environments.getByLabel('Please describe Other')).toBeVisible();
  await environments.getByLabel('Please describe Other').fill('Private platform');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  await navigate(page,'Backups and recovery');await addGroup(page,'Office laptops','endpoints');
  const strategy=question(page,'Do you have a defined backup strategy for these systems/data?');
  await strategy.getByRole('button',{name:'Not applicable',exact:true}).click();
  await expect(strategy.getByLabel('Why is this not applicable?')).toBeVisible();
  await strategy.getByLabel('Why is this not applicable?').fill('No data retained on these devices');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
  await strategy.getByRole('button',{name:'Enter an answer',exact:true}).click();
  await strategy.getByRole('combobox',{name:'Answer',exact:true}).selectOption('false');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
});
