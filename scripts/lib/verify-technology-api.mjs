import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Uses only the parent verifier's disposable workspace/account and cleanup lifecycle.
export async function verifyTechnologyApi({call,req,other,browser,session,portal}){
  const created=await call('','POST',{name:'Disposable technology-specific assessment'});
  assert.equal(created.status,201,JSON.stringify(created.body));let current=created.body;
  assert.equal(current.templateVersion,'client-v3');assert.equal(current.questions.length,151);
  const id=current.id,assets=current.sections.find(s=>s.id==='assets');
  assert.equal((await call(`/${id}`,'GET',undefined,other)).status,403);
  async function update(path,method,body){const result=await call(`/${id}${path}`,method,{revision:current.revision,...body});assert.ok([200,201].includes(result.status),JSON.stringify(result.body));current=result.body;}
  for(const type of assets.groupFields.find(f=>f.id==='assetClass').options){
    for(const entryKind of ['single','group']){
      const name=`${type.id}/${entryKind}`;
      await update('/groups','POST',{sectionId:'assets',name,context:{assetClass:type.id,entryKind,management:'provider'}});
      const group=current.groups.find(g=>g.name===name);
      const questions=current.questions.filter(q=>q.sectionId==='assets'&&(!q.assetClass||q.assetClass===type.id)&&(!q.entryKind||q.entryKind===entryKind));
      assert.equal(questions.length,10);
      const detail=questions.find(q=>q.assetClass===type.id),coverage=questions.find(q=>q.type==='coverage');
      const answers=[...questions.filter(q=>q.assetClass===type.id).map(q=>({questionId:q.id,questionVersion:4,state:'answered',textValue:name})),...(coverage?[{questionId:coverage.id,questionVersion:4,state:'answered',totalInScope:10,totalCovered:8,measurementDate:'2026-10-28',measurementSource:'Synthetic inventory'}]:[{questionId:'TEC-INVENTORY',questionVersion:4,state:'answered',booleanValue:true}])];
      await update(`/groups/${group.id}`,'PUT',{answers});
      const wrong=current.questions.find(q=>q.sectionId==='assets'&&q.assetClass&&q.assetClass!==type.id);
      assert.equal((await call(`/${id}/groups/${group.id}`,'PUT',{revision:current.revision,answers:[{questionId:wrong.id,questionVersion:4,state:'unknown'}]})).status,400);
      const wrongKind=current.questions.find(q=>q.entryKind&&q.entryKind!==entryKind);
      assert.equal((await call(`/${id}/groups/${group.id}`,'PUT',{revision:current.revision,answers:[{questionId:wrongKind.id,questionVersion:4,state:'unknown'}]})).status,400);
      assert.equal((await call(`/${id}`)).body.revision,current.revision);
      assert.equal((await call(`/${id}`)).body.groups.find(g=>g.id===group.id).answers.find(a=>a.questionId===detail.id).textValue,name);
    }
  }
  const first=current.groups.find(g=>g.sectionId==='assets');
  assert.equal((await call(`/${id}/groups/${first.id}`,'PUT',{revision:current.revision-1,answers:[]})).status,409);
  await req().query("UPDATE security.Memberships SET Role='viewer' WHERE OrganizationId=@org AND UserId=@user;");
  assert.equal((await call(`/${id}`)).status,200);
  assert.equal((await call(`/${id}/groups/${first.id}`,'PUT',{revision:current.revision,answers:[]})).status,403);
  assert.equal((await call('','POST',{name:'Forbidden v3',templateVersion:'client-v3'})).status,403);
  await req().query("UPDATE security.Memberships SET Role='contributor' WHERE OrganizationId=@org AND UserId=@user;");
  console.log('PASS: live v3 creation, all seven types/both entry kinds, save/reopen, coverage, invalid-type/kind rejection, stale saves and viewer restrictions.');
  if(browser&&portal){
    const page=await browser.newPage();
    await page.addInitScript(value=>sessionStorage.setItem('nso.customerSession',value),session);
    await page.goto(new URL('/signin',portal).href);
    await page.getByRole('button',{name:'Questionnaire',exact:true}).click();
    assert.equal(await page.getByRole('checkbox',{name:'Use technology-specific questions (new version)',exact:true}).count(),0);
    await page.getByRole('textbox',{name:'Assessment name',exact:true}).fill('Disposable browser default assessment');
    await page.getByRole('button',{name:'Create assessment',exact:true}).click();
    await page.getByRole('heading',{name:'Disposable browser default assessment',exact:true}).waitFor();
    await page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button',{name:/Your technology and who manages it/}).waitFor();
    await page.getByRole('button',{name:'All client assessments',exact:true}).click();
    await page.getByRole('listitem').filter({hasText:'Disposable technology-specific assessment'}).getByRole('button',{name:'Open assessment',exact:true}).click();
    await page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button',{name:/Your technology and who manages it/}).click();
    const selector=page.getByRole('combobox',{name:'Technology',exact:true});
    await selector.selectOption({label:'databases/single'});
    assert.equal(await page.locator('.technology-form-card').count(),1);
    assert.equal(await page.getByText('Reviewer conclusion',{exact:true}).count(),0);
    const platform=page.getByRole('region',{name:'Which database platform and version are used?',exact:true});
    assert.equal(await platform.getByRole('textbox',{name:'Database platform and version',exact:true}).inputValue(),'databases/single');
    assert.equal(await page.getByRole('combobox',{name:'Measure by',exact:true}).count(),0);
    await platform.getByRole('textbox',{name:'Database platform and version',exact:true}).fill('Azure SQL - synthetic browser check');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
    await selector.selectOption({label:'endpoints/group'});
    assert.equal(await page.getByRole('combobox',{name:'Measure by',exact:true}).count(),2);
    assert.equal(await platform.count(),0);
    await selector.selectOption({label:'databases/single'});
    assert.equal(await platform.getByRole('textbox',{name:'Database platform and version',exact:true}).inputValue(),'Azure SQL - synthetic browser check');
    await page.reload();
    // /account/questionnaires restores the questionnaire listing after a reload.
    await page.getByRole('listitem').filter({hasText:'Disposable technology-specific assessment'}).getByRole('button',{name:'Open assessment',exact:true}).click();
    await page.getByRole('navigation',{name:'Assessment sections'}).getByRole('button',{name:/Your technology and who manages it/}).click();
    await page.getByRole('combobox',{name:'Technology',exact:true}).selectOption({label:'databases/single'});
    assert.equal(await platform.getByRole('textbox',{name:'Database platform and version',exact:true}).inputValue(),'Azure SQL - synthetic browser check');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await mkdir(new URL('../../.azure/browser-results/',import.meta.url),{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL('../../.azure/browser-results/technology-questionnaire-live.png',import.meta.url)),fullPage:true});
    await page.close();console.log('PASS: deployed browser creates technology assessments by default, shows a simple technology card without reviewer clutter, saves/reopens database details, switches groups and fits mobile width.');
  }
}
