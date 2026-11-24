// Local browser checks with synthetic, intercepted API responses; no Azure calls or credentials.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';

process.env.VITE_API_BASE_URL='/api';
process.env.VITE_COMPARE_API_BASE_URL='https://compare.example.invalid/api';
const server=await createServer({root:fileURLToPath(new URL('../apps/web',import.meta.url)),
  server:{host:'127.0.0.1',port:0},configFile:false});
await server.listen();
const address=server.httpServer.address();
const origin=process.env.AUDIT_UI_TEST_ORIGIN??`http://127.0.0.1:${address.port}`;
const apiOrigin=process.env.AUDIT_UI_TEST_API_ORIGIN??origin;
const compareOrigin=process.env.AUDIT_UI_TEST_COMPARE_ORIGIN??'https://compare.example.invalid';
const {compareEvidence}=await server.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../apps/api/src/compareApp/compareEvidence.ts',import.meta.url)));
let browser;
const org='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002';
const scan='00000000-0000-4000-8000-000000000003',sku='00000000-0000-4000-8000-000000000004';
const at='2026-11-09T12:00:00.000Z';
const compareBaseline='00000000-0000-4000-8000-000000000095',compareCurrent='00000000-0000-4000-8000-000000000096';
try{
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const context=await browser.newContext();
  await context.addInitScript(({org})=>{sessionStorage.setItem('nso.customerSession','synthetic-test-session');sessionStorage.setItem('nso.customerWorkspace',org);},{org});
  let role='owner',firstPollAt=0,fail=false,fullStarted=false;
  const requests=[];
  const respondApi=async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.origin,url.pathname.startsWith('/api/me/audit-compare')?compareOrigin:apiOrigin);
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
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
    if(url.pathname==='/api/me/scans'&&request.method()==='POST'){
      assert.equal(request.postDataJSON().subscriptionId,tenant);
      fullStarted=true;
      return respond({scanId:'00000000-0000-4000-8000-000000000099',auditScope:'tenant',status:'queued'},202);
    }
    if(url.pathname==='/api/me/audit-compare/history')return respond({scans:[
      {scanId:compareCurrent,status:'partial',createdAt:at,auditScope:'tenant'},
      {scanId:compareBaseline,status:'complete',createdAt:'2026-11-08T12:00:00.000Z',auditScope:'tenant'},
      {scanId:scan,status:'running',createdAt:at,auditScope:'licensing'}]});
    if(url.pathname==='/api/me/audit-compare'){
      assert.equal(url.searchParams.get('baseline'),compareBaseline);
      assert.equal(url.searchParams.get('comparison'),compareCurrent);
      if(!url.searchParams.has('dataset'))return respond([compareBaseline,compareCurrent].map(ScanId=>({audit:{ScanId,Scope:'tenant'},collections:[
        {DataType:'conditionalAccess',Label:'Conditional Access policies',Status:'complete'},
        {DataType:'namedLocations',Label:'Named locations',Status:ScanId===compareCurrent?'missingAccess':'complete'}]})));
      assert.equal(url.searchParams.get('dataset'),'conditionalAccess');
      const fixture=current=>[
        {SourceId:'same',DisplayName:'Same policy',SourceJson:current?'{"b":2,"a":1}':'{"a":1,"b":2}',CollectedAtUtc:current?at:'2026-11-08T12:00:00.000Z'},
        {SourceId:'edit',DisplayName:'Edited policy',SourceJson:JSON.stringify({conditions:{enabled:current}})},
        {SourceId:current?'add':'remove',DisplayName:current?'New policy':'Old policy'},
      ];
      const records=compareEvidence(fixture(false),fixture(true),'conditionalAccess');
      const differences=records.filter(row=>row.status!=='Unchanged').length;
      return respond({records:url.searchParams.has('summary')?records.length:records,differences});
    }
    if(url.pathname==='/api/me/scans')return respond({scans:[{scanId:scan,status:'complete',createdAt:at,auditScope:'licensing'},
      {scanId:'00000000-0000-4000-8000-000000000099',status:'complete',createdAt:at}]});
    if(url.pathname==='/api/me/scans/00000000-0000-4000-8000-000000000099')return respond({scanId:'00000000-0000-4000-8000-000000000099',subscriptionId:tenant,findings:[],...(fullStarted?{auditScope:'tenant'}:{})});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099')return respond({audit:{ScanId:'00000000-0000-4000-8000-000000000099',Scope:'tenant',Status:'complete',CreatedAtUtc:at,StartedAtUtc:at,CompletedAtUtc:at},
      collections:['secureScores','secureScoreProfiles','defenderRecommendations','defenderMetadata','exposureScores','deviceSecureScores','endpointRecommendations'].map(DataType=>({DataType,Status:'complete',RecordCount:1,CompletedAtUtc:at})).concat([
        {DataType:'directoryUsers',Status:'complete',RecordCount:1},
        ...[['recoveryVaults','Recovery Services vaults'],['recoveryVaultDetails','Recovery Services vault settings'],['recoveryBackupPolicies','Backup policies'],['recoveryPolicyDetails','Backup policy settings'],['recoveryVaultConfig','Vault backup configuration'],['recoveryVaultStorage','Vault backup storage']].map(([DataType,Label])=>({DataType,Label,Status:'complete',RecordCount:1})),
        {DataType:'directoryGroups',Status:'complete',RecordCount:1},
        {DataType:'directoryGroupMembers',Status:'complete',RecordCount:1},
        {DataType:'directoryRoleDefinitions',Status:'complete',RecordCount:2},
        {DataType:'directoryRoleEligibility',Status:'missingAccess',RecordCount:0},
        {DataType:'roleAssignments',Label:'Directory role assignments',Status:'complete',RecordCount:3,ErrorCode:null},{DataType:'settingsCatalogPolicies',Label:'Settings catalog policies',Status:'complete',RecordCount:2,ErrorCode:null},{DataType:'settingsCatalogSettings',Label:'Settings',Status:'complete',RecordCount:2,ErrorCode:null},{DataType:'settingsCatalogAssignments',Label:'Assignments',Status:'complete',RecordCount:1,ErrorCode:null},{DataType:'conditionalAccess',Label:'Conditional Access policies',Status:'complete',RecordCount:1,ErrorCode:null},{DataType:'namedLocations',Label:'Named locations',Status:'complete',RecordCount:2,ErrorCode:null},{DataType:'licenses',Label:'Licenses',Status:'complete',RecordCount:1,ErrorCode:null},{DataType:'licenseAssignments',Label:'License assignments',Status:'complete',RecordCount:1,ErrorCode:null}])});
    const vaultId='/subscriptions/'+tenant+'/resourceGroups/Recovery/providers/Microsoft.RecoveryServices/vaults/FixtureVault';
    const backupFixtures={
      recoveryVaults:{id:vaultId,name:'FixtureVault',location:'westus2',properties:{publicNetworkAccess:'Disabled'}},
      recoveryBackupPolicies:{name:'Fixture SQL policy',properties:{backupManagementType:'AzureWorkload',workLoadType:'SQLDataBase',protectedItemsCount:0,subProtectionPolicy:[
        {policyType:'Full',retentionPolicy:{retentionPolicyType:'LongTermRetentionPolicy'}},
        {policyType:'Log',schedulePolicy:{schedulePolicyType:'LogSchedulePolicy',scheduleFrequencyInMins:60}},
      ]}},
      recoveryVaultDetails:{name:'FixtureVault',properties:{redundancySettings:{standardTierStorageRedundancy:'GeoRedundant'},securitySettings:{immutabilitySettings:{state:'Locked'}}}},
      recoveryVaultConfig:{name:'vaultconfig',properties:{softDeleteFeatureState:'Enabled'}},
      recoveryVaultStorage:{name:'vaultstorageconfig',properties:{storageType:'GeoRedundant'}},
    };
    backupFixtures.recoveryPolicyDetails={...backupFixtures.recoveryBackupPolicies,properties:{...backupFixtures.recoveryBackupPolicies.properties,protectedItemsCount:2}};
    const backupType=url.pathname.split('/').pop(),backup=backupFixtures[backupType];
    if(backup)return respond({rows:[{SourceId:backup.id??backupType,DisplayName:backup.name,SourceJson:JSON.stringify(backup),ParentSourceId:backupType==='recoveryPolicyDetails'?'recoveryBackupPolicies':vaultId,ChildSourceId:vaultId+'/backupPolicies/fixture'}],total:1,pageSize:50});
    const directoryFixtures={
      directoryUsers:[{id:'user-a',displayName:'Fixture Admin',mail:'admin@example.invalid',accountEnabled:true}],
      directoryGroups:[{id:'group-a',displayName:'Admin Group',securityEnabled:true,groupTypes:[]}],
      directoryGroupMembers:[{id:'user-a','@odata.type':'#microsoft.graph.user'}],
      directoryRoleDefinitions:[
        {id:'role-ga',displayName:'Global Administrator',isBuiltIn:true,isPrivileged:true,templateId:'62e90394-69f5-4237-9190-012177145e10'},
        {id:'role-unused',displayName:'Unused Fixture Role',isBuiltIn:false,isPrivileged:false},
      ],
    };
    const dataset=url.pathname.split('/').pop(),directory=directoryFixtures[dataset];
    if(directory)return respond({rows:directory.map(source=>({SourceId:source.id,SourceJson:JSON.stringify(source),
      ...(dataset==='directoryGroupMembers'?{ParentSourceId:'group-a'}:{})})),total:directory.length,pageSize:50});
    const recommendationFixtures={exposureScores:{id:'exposureScores',score:42,time:at},deviceSecureScores:{id:'deviceSecureScores',score:75,time:at},endpointRecommendations:{id:'endpoint-rec',recommendationName:'Update fixture browser',status:'Active',exposureImpact:2,configScoreImpact:3,exposedMachinesCount:4,remediationType:'Update'},secureScores:{createdDateTime:at,controlScores:[{controlName:'fixture-control',scoreInPercentage:25}]},secureScoreProfiles:{id:'fixture-control',title:'Protect fixture accounts',maxScore:8,remediation:'Enable protection'},defenderRecommendations:{name:'fixture-assessment',properties:{displayName:'Protect fixture resources',status:{code:'Unhealthy'},resourceDetails:{Id:'/fixture/resource'}}},defenderMetadata:{name:'fixture-assessment',properties:{severity:'High',remediationDescription:'<p>Open <strong>Environment settings</strong> and select <strong>Defender plans</strong>.</p>'}}};
    const fixture=recommendationFixtures[url.pathname.split('/').pop()];
    if(fixture)return respond({rows:[{SourceId:fixture.id??fixture.name??'score',SourceJson:JSON.stringify(fixture),CollectedAtUtc:at}],total:1,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/roleAssignments'){
      const p=Number(url.searchParams.get('page')??1);
      const source={id:`assignment-${p}`,roleDefinitionId:'role-ga',principalId:p===1?'user-a':'group-a',roleDefinition:{displayName:'Global Administrator',templateId:'62e90394-69f5-4237-9190-012177145e10'},principal:{displayName:p===1?'Fixture Admin':'Admin Group','@odata.type':p===1?'#microsoft.graph.user':'#microsoft.graph.group'},directoryScopeId:'/'};
      return respond({rows:[{SourceId:source.id,CollectedAtUtc:at,SourceJson:JSON.stringify(source)}],total:2,page:p,pageSize:1});
    }
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/settingsCatalogPolicies')return respond({rows:[{SourceId:'policy-a',DisplayName:'Endpoint hardening',CollectedAtUtc:at,SourceJson:JSON.stringify({name:'Endpoint hardening',platforms:'windows10',description:'Fixture configuration'})},{SourceId:'policy-b',DisplayName:'Browser controls',CollectedAtUtc:at,SourceJson:JSON.stringify({name:'Browser controls',platforms:'windows10'})}],total:2,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/settingsCatalogSettings'){
      const second=url.searchParams.get('page')==='2';
      return respond({rows:[{SourceId:second?'child-a':'child-b',ParentSourceId:second?'policy-a':'policy-b',ChildSourceId:'0',CollectedAtUtc:at,SourceJson:JSON.stringify({settingInstance:{settingDefinitionId:second?'def-a':'def-b',choiceSettingValue:{value:'enabled',children:[{settingDefinitionId:'nested',simpleSettingValue:{value:30}}]}},settingDefinitions:[{id:second?'def-a':'def-b',displayName:second?'Block untrusted applications':'Browser-only setting',options:[{itemId:'enabled',displayName:'Enabled'}]},{id:'nested',displayName:'Timeout minutes'}]})}],total:2,page:second?2:1,pageSize:1});
    }
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/settingsCatalogAssignments')return respond({rows:[{SourceId:'assignment-a',ParentSourceId:'policy-a',ChildSourceId:'0',CollectedAtUtc:at,SourceJson:JSON.stringify({target:{'@odata.type':'#microsoft.graph.allDevicesAssignmentTarget'}})}],total:1,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/conditionalAccess')return respond({rows:[{SourceId:'fixture-policy',DisplayName:'Fixture MFA policy',State:'enabled',CollectedAtUtc:at,SourceJson:JSON.stringify({id:'fixture-policy',displayName:'Fixture MFA policy',state:'enabled',conditions:{users:{includeUsers:['All'],excludeUsers:[]},applications:{includeApplications:['All']},locations:{includeLocations:['fixture-hq'],excludeLocations:['AllTrusted']},clientAppTypes:['browser'],platforms:{includePlatforms:['all']}},grantControls:{builtInControls:['mfa'],operator:'AND'}})}],total:1,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/namedLocations')return respond({rows:[{SourceId:'fixture-hq',DisplayName:'HQ network',CollectedAtUtc:at,SourceJson:JSON.stringify({'@odata.type':'#microsoft.graph.ipNamedLocation',displayName:'HQ network',isTrusted:true,ipRanges:[{cidrAddress:'192.0.2.0/24'},{cidrAddress:'2001:db8::/32'}]})},{SourceId:'fixture-countries',DisplayName:'Allowed countries',CollectedAtUtc:at,SourceJson:JSON.stringify({'@odata.type':'#microsoft.graph.countryNamedLocation',displayName:'Allowed countries',countriesAndRegions:['US','GB'],includeUnknownCountriesAndRegions:true})}],total:2,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/licenses')return respond({rows:[{SourceId:'fixture',SkuId:sku,SkuPartNumber:'FIXTURE_SKU',EnabledUnits:10,ConsumedUnits:1,CollectedAtUtc:at}],total:1,page:1,pageSize:50});
    if(url.pathname==='/api/me/audits/00000000-0000-4000-8000-000000000099/licenseAssignments')return respond({rows:[{UserId:tenant,SkuId:sku,UserPrincipalName:'fixture@example.invalid',SkuPartNumber:'FIXTURE_SKU',AssignmentType:'direct',AssignmentSource:'direct',AssignmentState:'Active',CollectedAtUtc:at}],total:1,page:1,pageSize:50});
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
  context.setDefaultTimeout(15000);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/audit-data`);
  await page.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  await page.locator(`.scan-history a[href="/audit-data/${scan}/licenses"]`).waitFor();
  await page.getByLabel('Azure subscription ID',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.audit-data-page .step-action')?.disabled);
  assert.equal(await page.getByRole('button',{name:'Run license audit',exact:true}).count(),0,'License-only launch replaced the main audit.');
  await page.getByRole('button',{name:'Run audit',exact:true}).click();
  await page.waitForURL('**/audit-data/00000000-0000-4000-8000-000000000099');
  await page.getByRole('heading',{name:'Audit snapshot',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Fixture MFA policy',exact:true}).waitFor();
  await page.getByText('Require multifactor authentication',{exact:true}).waitFor();
  await page.locator('.audit-policy-card').getByText('HQ network',{exact:true}).waitFor();
  await page.getByText('All platforms',{exact:true}).waitFor();
  assert.equal(await page.locator('.audit-raw-evidence[open]').count(),0,'JSON should be optional, not the default policy view.');
  await page.getByRole('link',{name:'Recommendations',exact:true}).click();
  await page.getByRole('heading',{name:'Protect fixture accounts',exact:true}).waitFor();
  await page.getByText(/6 potential points .* 25% complete/).waitFor();
  await page.getByRole('button',{name:'Defender for Cloud',exact:true}).click();
  await page.getByRole('heading',{name:'Protect fixture resources',exact:true}).waitFor();
  await page.getByText(/High severity .* 1 affected resource/).waitFor();
  assert.equal(await page.locator('.recommendation-remediation').first().evaluate(el=>getComputedStyle(el).display),'block');
  assert.equal(await page.locator('.safe-rich-text').first().evaluate(el=>getComputedStyle(el).display),'block');
  await page.getByText('Environment settings',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Exposure Score',exact:true}).click();
  await page.getByText(/Exposure Score: 42/).waitFor();
  await page.getByRole('heading',{name:'Update fixture browser',exact:true}).waitFor();
  await page.getByText(/2 exposure impact/).waitFor();
  await page.getByRole('button',{name:'Secure Score for Devices',exact:true}).click();
  await page.getByText(/Secure Score for Devices: 75/).waitFor();
  await page.getByText(/3 configuration score impact/).waitFor();
  await page.getByRole('button',{name:'Exposure Score',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Exposure Score',exact:true,pressed:true}).waitFor();
  await page.getByRole('link',{name:'Current audit',exact:true}).click();
  await page.getByRole('button',{name:/^Directory role assignments/}).click();
  await page.getByRole('heading',{name:'Global Administrator',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Fixture Admin',exact:true}).waitFor();
  await page.getByText('2 observed assignments ? 1 identified direct users',{exact:true}).waitFor();
  assert.ok(requests.some(r=>r.includes('roleAssignments?page=2')),'Role summary must include all pages.');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('heading',{name:'Admin Group',exact:true}).waitFor();
  await page.getByText('2 observed assignments ? 1 identified direct users',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Audit categories'}).getByRole('button',{name:/^Devices/}).click();
  await page.getByRole('heading',{name:'Endpoint hardening',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'Block untrusted applications',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Timeout minutes',exact:true}).waitFor();
  if(process.env.AUDIT_UI_SCREENSHOT)await page.evaluate(()=>window.scrollTo(0,0));
  if(process.env.AUDIT_UI_SCREENSHOT)await page.screenshot({path:process.env.AUDIT_UI_SCREENSHOT,fullPage:true});
  assert.equal(await page.getByRole('heading',{name:'Browser-only setting',exact:true}).count(),0,'A different policy leaked into selected settings.');
  assert.ok(requests.some(r=>r.includes('settingsCatalogSettings?page=2')),'Child pagination was truncated.');
  await page.getByRole('tab',{name:'Assignments',exact:true}).click();
  await page.getByText(/Included.*All Devices/).waitFor();
  await page.getByRole('button',{name:/Browser controls.*View details/}).click();
  await page.getByRole('tab',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'Browser-only setting',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Block untrusted applications',exact:true}).count(),0);
  await page.getByRole('tab',{name:'Assignments',exact:true}).click();
  await page.getByText('No assignments returned for this policy.',{exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Browser controls',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Source evidence',exact:true}).click();
  assert.equal(await page.locator('.audit-raw-evidence[open]').count(),0);
  await page.getByRole('navigation',{name:'Audit categories'}).getByRole('button',{name:/^Backups/}).click();
  await page.getByRole('heading',{name:'FixtureVault',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Vault settings',exact:true}).click();
  await page.getByText('Locked',{exact:true}).waitFor();
  assert.equal(await page.getByText('Locked',{exact:true}).locator('../..').evaluate(field=>getComputedStyle(field).display),'block');
  assert.equal(await page.getByLabel('Search inventory').count(),0,'A single vault should not need search.');
  assert.equal(await page.getByRole('button',{name:'Next',exact:true}).count(),0,'A single vault page should not need pagination.');
  assert.equal(await page.locator('.snapshot-history').evaluate(history=>history.open),false);
  await page.locator('.snapshot-history summary').click();
  await page.locator(`.scan-history a[href="/audit-data/${scan}/licenses"]`).waitFor();
  await page.locator('.snapshot-history summary').click();
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await page.locator('.vault-workload > summary').filter({hasText:'Azure Workload (SQL)'}).click();
  await page.locator('summary').filter({hasText:'Fixture SQL policy'}).click();
  await page.getByRole('heading',{name:'Full',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Log',exact:true}).waitFor();
  await page.getByText('Protected Items Count',{exact:true}).filter({visible:true}).locator('..').getByText('2',{exact:true}).waitFor();
  await page.getByText('LogSchedulePolicy',{exact:true}).filter({visible:true}).waitFor();
  await page.getByRole('navigation',{name:'Audit categories'}).getByRole('button',{name:/^Identity/}).click();
  await page.getByRole('navigation',{name:'Audit categories'}).getByRole('button',{name:/Named locations/}).click();
  await page.getByRole('cell',{name:'Trusted',exact:true}).waitFor();
  await page.getByText('192.0.2.0/24',{exact:true}).waitFor();
  await page.getByText('2001:db8::/32',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Allowed countries.*View details/}).click();
  await page.getByText('United States (US)',{exact:true}).waitFor();
  await page.getByText('United Kingdom (GB)',{exact:true}).waitFor();
  assert.equal(await page.getByRole('row').filter({hasText:'Allowed countries'}).getByRole('cell',{name:'Not provided',exact:true}).count(),1,'Missing trust metadata must not be presented as Not trusted.');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('navigation',{name:'Audit categories'}).getByRole('button',{name:/Conditional Access policies/}).click();
  await page.getByRole('heading',{name:'Fixture MFA policy',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Policy details overflow the mobile viewport.');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  assert.equal(await page.getByRole('navigation',{name:'Workspace menu'}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.setViewportSize({width:1280,height:900});
  const menu=page.getByRole('navigation',{name:'Workspace menu'});
  await menu.getByRole('link',{name:'Users, Groups & Roles',exact:true}).click();
  await page.getByText(/Fixture Admin.*Enabled/).first().click();
  await page.getByText('Global Administrator \u00b7 Tenant-wide \u00b7 via Admin Group',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Groups',exact:true}).click();
  await page.getByText('Admin Group \u00b7 1 enabled direct users',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Roles',exact:true}).click();
  await page.getByText('Unused Fixture Role \u00b7 Custom \u00b7 Standard \u00b7 0 assignments',{exact:true}).waitFor();
  await page.getByText('PIM role eligibility \u00b7 Access denied',{exact:true}).waitFor();
  await menu.getByRole('link',{name:'Licenses',exact:true}).click();
  await page.getByRole('heading',{name:'Licenses',level:1,exact:true}).waitFor();
  await page.getByRole('button',{name:'View users',exact:true}).click();
  await page.getByRole('cell',{name:'fixture@example.invalid',exact:true}).waitFor();
  const assignedPath=new URL(page.url());assert.ok(assignedPath.pathname.endsWith('/licenses'));assert.equal(assignedPath.searchParams.get('view'),'assigned');
  await page.reload();await page.getByRole('cell',{name:'fixture@example.invalid',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace menu'}).getByRole('link',{name:'Current audit',exact:true}).click();
  await page.getByRole('heading',{name:'Audit snapshot',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/audit-data/00000000-0000-4000-8000-000000000099');
  await page.goBack();
  await page.getByRole('cell',{name:'fixture@example.invalid',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace menu'}).getByRole('link',{name:'Current audit',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace menu'}).getByRole('link',{name:'Licenses',exact:true}).click();
  await page.getByRole('button',{name:'View users',exact:true}).waitFor();
  const licenseRequests=requests.filter(r=>r.includes('/licenses?')).length;
  await page.getByRole('navigation',{name:'License providers'}).getByRole('link',{name:'Google Workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Google Workspace licenses',exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.includes('/licenses?')).length,licenseRequests,'An unavailable provider loaded Microsoft inventory.');
  await page.getByRole('navigation',{name:'License providers'}).getByRole('link',{name:'AWS',exact:true}).click();
  await page.getByRole('heading',{name:'AWS licenses',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'License providers'}).getByRole('link',{name:'Microsoft 365',exact:true}).click();
  await page.getByRole('button',{name:'View users',exact:true}).waitFor();
  assert.ok(requests.includes('POST /api/me/scans'),'Main audit did not use the working collector.');
  await page.goto(`${origin}/audit-data/${scan}/licenses`);
  await page.getByText('Collection is queued or running.',{exact:false}).waitFor();
  await page.getByText('Collection is queued or running.',{exact:false}).waitFor({state:'hidden',timeout:15000});
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
  await page.getByRole('heading',{name:'Licenses',level:1,exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,`/audit-data/${scan}/licenses`,'Session restoration lost the requested license page.');
  role='viewer';await page.reload();
  await page.getByText('You have read-only access to saved audits.').waitFor();
  await page.getByRole('group',{name:'Signed-in account'}).getByText('Client User',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Run license audit',exact:true}).count(),0,'Licenses must not replace the full audit launcher.');
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
  const deep=await browser.newContext();
  await deep.addInitScript(()=>sessionStorage.setItem('nso.customerSession','synthetic-test-session'));
  await deep.route('**/api/**',respondApi);
  const deepPage=await deep.newPage();
  await deepPage.goto(`${origin}/audit-data/00000000-0000-4000-8000-000000000099/licenses?provider=google`);
  await deepPage.getByRole('button',{name:'Open workspace',exact:true}).click();
  await deepPage.getByRole('heading',{name:'Google Workspace licenses',exact:true}).waitFor();
  assert.equal(new URL(deepPage.url()).searchParams.get('provider'),'google','Workspace selection lost the license provider.');
  await deep.close();
  role='owner';
  const login=await browser.newContext();
  await login.route('**/api/**',respondApi);
  const loginPage=await login.newPage();
  await loginPage.goto(`${origin}/signin`);
  await loginPage.getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');
  await loginPage.getByLabel('Password',{exact:true}).fill('Synthetic-password-for-tests');
  await loginPage.getByRole('button',{name:'Sign in with email',exact:true}).click();
  await loginPage.getByRole('button',{name:'Open workspace',exact:true}).click();
  await loginPage.getByRole('heading',{name:'Audit collection',exact:true}).waitFor();
  await loginPage.getByRole('group',{name:'Signed-in account'}).getByText('fixture@example.invalid',{exact:true}).waitFor();
  await loginPage.getByRole('group',{name:'Signed-in account'}).getByText('Client Admin',{exact:true}).waitFor();
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
  const beforeCompare=requests.length;
  const compareMenu=page.getByRole('navigation',{name:'Workspace menu'});
  assert.deepEqual((await compareMenu.getByRole('link').allTextContents()).slice(1,4),['Current audit','Audit Compare','Recommendations']);
  await compareMenu.getByRole('link',{name:'Audit Compare'}).click();
  await page.getByRole('heading',{name:'Audit Compare',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Comparison audit').inputValue(),compareCurrent);
  assert.equal(await page.getByLabel('Baseline audit').inputValue(),compareBaseline);
  assert.equal(await page.getByLabel('Dataset',{exact:true}).inputValue(),'*');
  await page.getByText('3 differences across 4 saved records.').waitFor();
  const changes=page.locator('.audit-compare-changed');
  assert.equal(await changes.count(),3);
  await changes.getByText('/Source/conditions/enabled',{exact:true}).waitFor();
  const changedField=changes.getByRole('row').filter({hasText:'/Source/conditions/enabled'});
  assert.equal(await changedField.locator('td.audit-compare-value-changed').textContent(),'true');
  assert.equal(await changedField.locator('td').first().getAttribute('class'),null);
  await changes.locator('.audit-compare-value-changed').getByRole('heading',{name:'Comparison',exact:true}).waitFor();
  await changes.getByText('Added',{exact:true}).waitFor();
  await changes.getByText('Removed',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Same policy Unchanged'}).waitFor();
  await changes.getByText('Saved evidence',{exact:true}).click();
  await page.getByRole('button',{name:'Difference Only'}).click();
  assert.equal(await page.getByRole('heading',{name:'Same policy Unchanged'}).count(),0);
  assert.equal(await changes.getByText('Saved evidence',{exact:true}).count(),0);
  assert.equal(await changes.count(),3);
  await page.getByLabel('Dataset',{exact:true}).selectOption('conditionalAccess');
  await page.getByText('3 differences across 4 saved records.').waitFor();
  await page.getByLabel('Dataset',{exact:true}).selectOption('namedLocations');
  await page.getByText(/Baseline: complete. Comparison: missingAccess/).waitFor();
  assert.equal(await changes.count(),0);
  await page.getByLabel('Baseline audit').selectOption(compareCurrent);
  await page.getByText('Select two different audits.').waitFor();
  assert.ok(!requests.slice(beforeCompare).some(request=>/\/api\/me\/(audits|scans)\b/.test(request)));
  console.log('PASS: Audit Compare uses its dedicated origin, with field changes, added and removed evidence, Difference Only and collection coverage.');
  console.log('PASS: audit launch, progress polling, stored license rows, assignment drill-down/search, missing access, route restoration, viewer controls and mobile layout.');
  console.log('PASS: audit destination survives workspace selection and email sign-in.');
  console.log('PASS: main Run audit starts a unified SQL audit, restores saved subscription settings and opens stored configuration evidence; licensing is part of the same run.');
  console.log('PASS: linked policy settings, nested definition labels, complete child pagination, assignment isolation, empty assignments, deep-link reload and unavailable categories.');
  console.log('PASS: readable CAP/location evidence, resolved location names, license provider navigation, assignment deep links, reload and return to the same audit.');
}finally{await browser?.close();await server.close();}
