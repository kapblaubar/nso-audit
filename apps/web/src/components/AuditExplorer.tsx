import {backupPolicyGroup,RecoveryBackupPolicy} from './RecoveryBackupDetails';
import {DirectoryRoleDetails,DirectoryRoleSummary,roleName,assigneeName,type RoleDefinitions} from './DirectoryRoleDetails';
import {Fragment,useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadAzureRoleHistory,loadLicenseEvidence,type AzureRoleAssignment,type AzureRoleHistory,type DataAudit,type LicenseEvidenceRow as Row,type LicenseEvidencePage} from '../api';
import {ConditionalAccessDetails,NamedLocationDetails,Fields,sourceRecord} from './AuditPolicyDetails';

type Collection=DataAudit['collections'][number];
const groups=[
  {name:'Identity & access',types:['conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments']},
  {name:'Devices',types:['settingsCatalogPolicies','deviceConfigurations','compliancePolicies','appProtectionPolicies']},
  {name:'Data protection',types:[]},
  {name:'Threat protection',types:['defenderRecommendations','defenderMetadata','endpointRecommendations']},
  {name:'Azure',types:['azureResources','resourceGroups']},
  {name:'Scores',types:['secureScores','secureScoreProfiles','defenderScores','exposureScores','deviceSecureScores']},
  {name:'Backups',types:['recoveryVaults','recoveryBackupPolicies']},
  {name:'Licensing',types:['licenses','licenseAssignments']}
];
const children:Record<string,{settings:string;assignments:string}>={
  settingsCatalogPolicies:{settings:'settingsCatalogSettings',assignments:'settingsCatalogAssignments'},
  deviceConfigurations:{settings:'deviceConfigurationDetails',assignments:'deviceConfigurationAssignments'},
  compliancePolicies:{settings:'compliancePolicyDetails',assignments:'compliancePolicyAssignments'}
};
const vaultDatasets=['recoveryVaultDetails','recoveryVaultConfig','recoveryVaultStorage','recoveryBackupPolicies','recoveryPolicyDetails'];
const labels:Record<string,string>={settingsCatalogPolicies:'Settings catalog',deviceConfigurations:'Configuration profiles',compliancePolicies:'Compliance policies',authenticationMethods:'Authentication methods',licenses:'Licenses',licenseAssignments:'License assignments'};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString():'Not provided';
const name=(r:Row,definitions?:RoleDefinitions)=>sourceRecord(r).roleDefinitionId?roleName(r,definitions):r.DisplayName??r.SourceId??'Unnamed record';
const readable=(v:unknown)=>String(v??'Not provided').replace(/^#microsoft.graph\./,'').replace(/([a-z])([A-Z])/g,'$1 $2');
function Notice({collection}:{collection:Collection|undefined}){
  if(!collection)return <p className="explorer-notice">Not collected in this audit.</p>;
  if(collection.Status==='complete')return null;
  return <p className="explorer-notice" role="status">{collection.Status==='missingAccess'?'Access unavailable':collection.Status==='partial'?'Partial collection':collection.Status==='failed'?'Collection failed':'Collection in progress'}.
    {' '}Saved rows may be incomplete.{collection.ErrorCode?` Reason: ${collection.ErrorCode}.`:''}</p>;
}
function Source({rows}:{rows:Row[]}){return <>{rows.map((r,i)=><details className="audit-raw-evidence" key={r.SourceId??i}><summary>View source JSON{rows.length>1?` · ${r.ChildSourceId??i+1}`:''}</summary><pre className="audit-source-json">{JSON.stringify(sourceRecord(r),null,2)}</pre></details>)}</>;}
// Render Graph setting definitions and choices without guessing the meaning of unknown values.
function SettingValue({instance,definitions}:{instance:unknown;definitions:Record<string,unknown>[]}){
  const item=object(instance),definition=definitions.find(d=>d.id===item.settingDefinitionId);
  const title=String(definition?.displayName??item.settingDefinitionId??'Setting');
  const values=Object.entries(item).filter(([key])=>/SettingValue$|SettingCollectionValue$/.test(key));
  return <section className="explorer-setting"><h4>{title}</h4>{values.map(([key,raw])=>{
    const items=Array.isArray(raw)?raw:[raw];
    return <div key={key}>{items.map((v,index)=>{
      const value=object(v),options=Array.isArray(definition?.options)?definition.options.map(object):[];
      const option=options.find(o=>o.itemId===value.value);
      const nested=Array.isArray(value.children)?value.children:[];
      return <div key={index}>{'value' in value?<p className="explorer-setting-value">{String(option?.displayName??value.value??'Not provided')}</p>:null}
        {nested.map((child,i)=><SettingValue key={i} instance={child} definitions={definitions}/>)}
        {!('value' in value)&&!nested.length?<Fields value={value}/>:null}</div>;
    })}</div>;
  })}{!values.length?<Fields value={item}/>:null}</section>;
}
function Settings({rows,catalog}:{rows:Row[];catalog:boolean}){return <>{rows.map(row=>{
  const source=sourceRecord(row),definitions=Array.isArray(source.settingDefinitions)?source.settingDefinitions.map(object):[];
  return catalog?<SettingValue key={row.SourceId} instance={source.settingInstance} definitions={definitions}/>:<Fields key={row.SourceId} value={Object.fromEntries(Object.entries(source).filter(([k])=>!['id','displayName','description','createdDateTime','lastModifiedDateTime'].includes(k)))}/>;
})}</>;}
function Assignments({rows}:{rows:Row[]}){return <div className="explorer-assignments">{rows.map(row=>{
  const target=object(sourceRecord(row).target),type=String(target['@odata.type']??'');
  const audience=type.includes('allDevices')?'All Devices':type.includes('allLicensedUsers')?'All Users':target.groupId?`Group ${target.groupId}`:readable(type);
  return <article key={row.SourceId}><strong>{type.includes('exclusion')?'Excluded':'Included'} · {audience}</strong>
    {target.groupId?<p>Group name is not available in this snapshot.</p>:null}
    <Fields value={Object.fromEntries(Object.entries(target).filter(([k])=>!['groupId','@odata.type'].includes(k)))}/></article>;
})}</div>;}

function PolicyDetail({account,report,type,row,refresh,definitions}:{account:AuditAccount;report:DataAudit;type:string;row:Row;refresh:number;definitions:RoleDefinitions}){
  const [tab,setTab]=useState(()=>{const requested=new URLSearchParams(window.location.search).get('dataset');return requested===children[type]?.settings?'Settings':requested===children[type]?.assignments?'Assignments':'Overview';});
  const [related,setRelated]=useState<Record<string,Row[]>>({}),[failures,setFailures]=useState<Record<string,string>>({}),[busy,setBusy]=useState(true);
  const [locations,setLocations]=useState(new Map<string,string>());
  const relations=children[type],progress=JSON.stringify(report.collections);
  useEffect(()=>{
    let cancelled=false;setRelated({});setFailures({});setLocations(new Map());setBusy(true);
    const types=relations?Object.values(relations):type==='conditionalAccess'?['namedLocations']
      :type==='recoveryVaults'?vaultDatasets:type==='recoveryBackupPolicies'?['recoveryVaults','recoveryPolicyDetails']:[];
    void Promise.all(types.map(async child=>{
      if(!report.collections.some(c=>c.DataType===child))return;
      try{
        const rows:Row[]=[];let page=1;
        while(!cancelled){
          const result=await loadLicenseEvidence(account,report.audit.ScanId,child,page,'','');
          rows.push(...result.rows);if(page*result.pageSize>=result.total)break;page++;
        }
        if(cancelled)return;
        if(child==='namedLocations')setLocations(new Map(rows.filter(r=>r.SourceId).map(r=>[r.SourceId!.toLowerCase(),name(r)])));
        else setRelated(current=>({...current,[child]:rows.filter(r=>child==='recoveryVaults'?r.SourceId===row.ParentSourceId
          :child==='recoveryPolicyDetails'&&type==='recoveryVaults'?String(r.ChildSourceId??'').toLowerCase().startsWith(String(row.SourceId).toLowerCase()+'/backuppolicies/')
          :r.ParentSourceId===row.SourceId)}));
      }catch{if(!cancelled)setFailures(current=>({...current,[child]:'Saved evidence could not be loaded. Use Refresh to try again.'}));}
    })).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,type,row.SourceId,progress,refresh]);
  const source=sourceRecord(row),tabs=relations?['Overview','Settings','Assignments','Source evidence']
    :type==='recoveryVaults'?['Overview','Vault settings','Source evidence']:['Overview','Source evidence'];
  const child=relations?(tab==='Settings'?relations.settings:relations.assignments):'';
  const collection=report.collections.find(c=>c.DataType===child),rows=related[child]??[];
  const backupSections = type==='recoveryVaults' ? vaultDatasets.filter(dataset=>
    tab==='Overview'?dataset==='recoveryBackupPolicies':tab==='Vault settings'&&dataset!=='recoveryBackupPolicies'&&dataset!=='recoveryPolicyDetails').map(dataset=>{
    const status=report.collections.find(c=>c.DataType===dataset);
    const evidence=related[dataset]??[];
    return <section key={dataset}><h3>{status?.Label??({recoveryVaultDetails:'Vault settings',recoveryVaultConfig:'Vault backup configuration',recoveryVaultStorage:'Vault backup storage',recoveryBackupPolicies:'Backup policies'})[dataset]}</h3>
      <Notice collection={status}/>
      {failures[dataset]?<p role="alert">{failures[dataset]}</p>:busy?<p role="status">Loading saved vault evidence…</p>
        :dataset==='recoveryBackupPolicies'&&evidence.length?<><Notice collection={report.collections.find(c=>c.DataType==='recoveryPolicyDetails')}/>
          {failures.recoveryPolicyDetails?<p role="alert">{failures.recoveryPolicyDetails}</p>:null}
          <BackupPolicyList rows={evidence} details={related.recoveryPolicyDetails??[]} vault={row}/></>
        :evidence.length?evidence.map(item=><Fields key={item.SourceId} value={sourceRecord(item).properties}/>)
        :status?.Status==='complete'?<p>No records returned for this vault.</p>:null}
    </section>;
  }) : null;
  return <section className="explorer-detail" aria-label="Item details"><header>{type!=='recoveryVaults'?<p className="eyebrow">Selected item</p>:null}<h2>{name(row,definitions)}</h2>

    <p className="audit-evidence-date">Collected {when(row.CollectedAtUtc)}</p></header>
    <div className="explorer-tabs" role="tablist" aria-label="Detail sections">{tabs.map(t=><button key={t} type="button" role="tab" id={`detail-${t.replaceAll(' ','-')}`} aria-selected={tab===t} aria-controls="explorer-tab-panel" tabIndex={tab===t?0:-1} onKeyDown={event=>{const i=tabs.indexOf(t);const next=event.key==='ArrowRight'?tabs[(i+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:undefined;if(next){event.preventDefault();setTab(next);document.getElementById(`detail-${next.replaceAll(' ','-')}`)?.focus();}}} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <div id="explorer-tab-panel" role="tabpanel" aria-labelledby={`detail-${tab.replaceAll(' ','-')}`}>
    {tab==='Overview'?<>{type==='conditionalAccess'?<>{failures.namedLocations?<p role="alert">Location names could not be loaded. Saved IDs are shown.</p>:null}<ConditionalAccessDetails rows={[row]} locations={locations}/></>:type==='namedLocations'?<NamedLocationDetails rows={[row]}/>:type==='recoveryVaults'?<div className="vault-overview"><div className="vault-fields"><Fields value={{Location:source.location,SKU:source.sku,Identity:source.identity,Tags:source.tags}}/></div>{backupSections}</div>
      :type==='recoveryBackupPolicies'?<><Notice collection={report.collections.find(c=>c.DataType==='recoveryPolicyDetails')}/>
        {failures.recoveryPolicyDetails?<p role="alert">{failures.recoveryPolicyDetails}</p>:null}
        <RecoveryBackupPolicy row={row} vault={related.recoveryVaults?.[0]} detail={related.recoveryPolicyDetails?.[0]}/></>
      :type==='roleAssignments'?<DirectoryRoleDetails row={row} definitions={definitions}/>:relations?<><p>{String(source.description??'No description provided.')}</p><Fields value={{Platform:source.platforms??source['@odata.type'],Technology:source.technologies,State:source.state??row.State,'Source updated':source.lastModifiedDateTime,'Policy ID':row.SourceId}}/><p>Select Settings or Assignments above to explore this policy.</p></>:<Fields value={source}/>}</>:null}
    {tab==='Vault settings'?<div className="vault-overview">{backupSections}</div>:null}
    {relations&&(tab==='Settings'||tab==='Assignments')?<><Notice collection={collection}/>{failures[child]?<p role="alert">{failures[child]}</p>:busy?<p role="status">Loading linked evidence…</p>:collection?<>{rows.length?(tab==='Settings'?<Settings rows={rows} catalog={type==='settingsCatalogPolicies'}/>:<Assignments rows={rows}/>):<p>{collection.Status==='complete'?`No ${tab.toLowerCase()} returned for this policy.`:'No evidence saved for this policy yet.'}</p>}</>:null}</>:null}
    {tab==='Source evidence'?<><p>Original saved responses for this item. IDs and timestamps are retained for verification.</p><Source rows={[row]}/>{type==='recoveryBackupPolicies'?<Source rows={related.recoveryPolicyDetails??[]}/>:null}{type==='recoveryVaults'?vaultDatasets.map(dataset=><Source key={dataset} rows={related[dataset]??[]}/>):null}{relations?Object.entries(relations).map(([kind,child])=><section key={child}><h3>{kind==='settings'?'Settings':'Assignments'}</h3><Notice collection={report.collections.find(c=>c.DataType===child)}/>{failures[child]?<p role="alert">{failures[child]}</p>:busy?<p>Loading…</p>:<Source rows={related[child]??[]}/>}</section>):null}</>:null}
    </div></section>;
}

const azureProtectionLabels={
  azureSqlFirewall:'SQL firewall rules',azureSqlVnet:'SQL virtual network rules',
  azureSqlAudit:'SQL server auditing',azureBlobProtection:'Blob recovery protection',
};
type AzureProtectionDataset=keyof typeof azureProtectionLabels;

function protectionFields(dataset:AzureProtectionDataset,row:Row){
  const data=sourceRecord(row);
  switch(dataset){
    case 'azureSqlFirewall':return {'Start IP':data.startIpAddress,'End IP':data.endIpAddress,'Allows Azure services':data.allowAzureServices};
    case 'azureSqlVnet':return {Subnet:data.virtualNetworkSubnetId,State:data.state,'Ignore missing service endpoint':data.ignoreMissingVnetServiceEndpoint};
    case 'azureSqlAudit':return {State:data.state,'Retention days':data.retentionDays,'Azure Monitor target':data.isAzureMonitorTargetEnabled,
      'Storage target configured':data.storageTargetConfigured,'Uses managed identity':data.isManagedIdentityInUse};
    case 'azureBlobProtection':{
      const blob=object(data.blobSoftDelete),container=object(data.containerSoftDelete);
      return {'Versioning':data.isVersioningEnabled,'Blob soft delete':blob.enabled,'Blob retention days':blob.days,
        'Container soft delete':container.enabled,'Container retention days':container.days};
    }
  }
}

function AzureProtection({account,report,scope,dataset,refresh}:{account:AuditAccount;report:DataAudit;scope:string;dataset:AzureProtectionDataset;refresh:number}){
  const collection=report.collections.find(c=>c.DataType===dataset);
  const status=collection?.Status,count=collection?.RecordCount,scanId=report.audit.ScanId;
  const [result,setResult]=useState<{rows:Row[];previous?:Row[];prior?:LicenseEvidencePage['prior'];comparisonError?:boolean}>();
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!status)return;
    let cancelled=false;
    async function load(id:string){
      const first=await loadLicenseEvidence(account,id,dataset,1,'','',undefined,scope);
      const rows=[...first.rows];
      for(let page=2;!cancelled&&(page-1)*first.pageSize<first.total;page++){
        const next=await loadLicenseEvidence(account,id,dataset,page,'','',undefined,scope);
        rows.push(...next.rows);
      }
      return {...first,rows};
    }
    setResult(undefined);setError(false);
    void load(scanId).then(async current=>{
      if(cancelled)return;
      setResult(current);
      if(!current.prior)return;
      try{
        const previous=await load(current.prior.ScanId);
        if(!cancelled)setResult({...current,previous:previous.rows});
      }catch{if(!cancelled)setResult({...current,comparisonError:true});}
    }).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;};
  },[account,scanId,scope,dataset,status,count,refresh]);
  const rows=result?.rows??[];
  const before=new Map(result?.previous?.map(row=>[row.ChildSourceId?.toLowerCase(),row]));
  const after=new Map(rows.map(row=>[row.ChildSourceId?.toLowerCase(),row]));
  const changes=result?.previous?[...new Set([...before.keys(),...after.keys()])].flatMap(id=>{
    const previous=before.get(id),current=after.get(id);
    if(previous&&current&&JSON.stringify(protectionFields(dataset,previous))===JSON.stringify(protectionFields(dataset,current)))return [];
    return [{id,previous,current}];
  }):[];
  return <section>
    <h4>{azureProtectionLabels[dataset]}</h4>
    <Notice collection={collection}/>
    {error?<p role="alert">Saved settings could not be loaded. Use Refresh to try again.</p>:null}
    {status&&!result&&!error?<p role="status">Loading saved settings?</p>:null}
    {result&&dataset==='azureSqlFirewall'&&(status==='complete'||rows.some(row=>sourceRecord(row).allowAzureServices===true))?
      <p>Allow Azure services: {rows.some(row=>sourceRecord(row).allowAzureServices===true)?'Rule present':'No matching rule returned'}</p>:null}
    {rows.map(row=><div key={row.SourceId}>
      {dataset==='azureSqlFirewall'||dataset==='azureSqlVnet'?<strong>{String(sourceRecord(row).name??row.ChildSourceId)}</strong>:null}
      <Fields value={protectionFields(dataset,row)}/>
    </div>)}
    {result&&status==='complete'&&!rows.length?<p>No settings returned for this resource.</p>:null}
    {result?.comparisonError?<p role="alert">Previous snapshot could not be loaded.</p>:null}
    {result?.previous?<details><summary>Changes since {when(result.prior?.CreatedAtUtc)}</summary>
      {changes.length?changes.map(({id,previous,current})=><section key={id}>
        <h5>{previous?current?'Changed':'Removed':'Added'} ? {String(sourceRecord((current??previous)!).name??id)}</h5>
        {previous?<><p>Previous</p><Fields value={protectionFields(dataset,previous)}/></>:null}
        {current?<><p>Current</p><Fields value={protectionFields(dataset,current)}/></>:null}
      </section>):<p>No configuration changes detected.</p>}
    </details>:null}
  </section>;
}

function AzureSettings({account,report,resourceId,dataset,refresh,kind}:{account:AuditAccount;report:DataAudit;
  resourceId:string;dataset:'azureStorageSettings'|'azureSqlSettings';refresh:number;kind:unknown}){
  const [row,setRow]=useState<Row>(),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  const collection=report.collections.find(c=>c.DataType===dataset);
  const status=collection?.Status,count=collection?.RecordCount;
  useEffect(()=>{
    if(!status)return;
    let cancelled=false;
    setRow(undefined);setBusy(true);setError(false);
    void loadLicenseEvidence(account,report.audit.ScanId,dataset,1,'','',undefined,resourceId)
      .then(result=>{if(!cancelled)setRow(result.rows[0]);})
      .catch(()=>{if(!cancelled)setError(true);})
      .finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,dataset,resourceId,refresh,status,count]);
  const settings=row?sourceRecord(row):{};
  const storage=dataset==='azureStorageSettings';
  const network=object(settings.network),transport=object(settings.transport),access=object(settings.access);
  const sas=object(settings.sasPolicy),fileOnly=storage&&String(kind).toLowerCase()==='filestorage';
  return <section aria-label="Security and configuration">
    <h3>{storage?'Storage security and configuration':'SQL server security and configuration'}</h3>
    <Notice collection={collection}/>
    {busy?<p role="status">Loading saved settings?</p>:null}
    {error?<p role="alert">Settings could not be loaded. Use Refresh to try again.</p>:null}
    {status==='complete'&&!busy&&!error&&!row?<p>No configuration record was returned for this resource.</p>:null}
    {row?<div className="azure-settings-sections">
      <section><h4>Network and transport</h4><Fields value={{
        'Public network access':network.publicNetworkAccess,
        'Minimum TLS':storage?transport.minimumTlsVersion:transport.minimalTlsVersion,
        'Private endpoints':network.privateEndpoints,
        ...(storage?{'HTTPS only':transport.supportsHttpsTrafficOnly,'Firewall default action':network.defaultAction,
          'Firewall bypass':network.bypass,'IP rules':network.ipRules,'Virtual network rules':network.virtualNetworkRules,
          'Resource access rules':network.resourceAccessRules}:{}),
      }}/></section>
      {storage?<section><h4>Storage access and SAS</h4><Fields value={{
        'Anonymous blob access':access.allowBlobPublicAccess,'Shared Key access':access.allowSharedKeyAccess,
        ...(sas.sasExpirationPeriod||sas.expirationAction?{'SAS maximum validity':sas.sasExpirationPeriod,'SAS expiration action':sas.expirationAction}
          :{'SAS expiration policy':'No SAS expiration policy returned'}),
      }}/></section>:<section><h4>Microsoft Entra authentication</h4><Fields value={{
        'Entra administrator':access.login,'Principal type':access.principalType,'Principal ID':access.sid,
        'Entra-only authentication':access.azureADOnlyAuthentication,
      }}/></section>}
    </div>:null}
    {fileOnly?<p>Blob recovery protection is unavailable for FileStorage accounts.</p>:null}
    {(storage?(fileOnly?[]:['azureBlobProtection'] as const):(['azureSqlFirewall','azureSqlVnet','azureSqlAudit'] as const)).map(key=>
      <AzureProtection key={key} account={account} report={report} scope={resourceId} dataset={key} refresh={refresh}/>)}
  </section>;
}

function AzureRoleTable({rows,scope}:{rows:AzureRoleAssignment[];scope:string}){
  return <div className="azure-resource-scroll"><table className="azure-resource-table" aria-label="Azure role assignments">
    <thead><tr>{['Principal','Type','Role','Assignment scope','Access','Condition'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.Id}>
      <th scope="row" title={row.PrincipalId}>{row.PrincipalName??row.PrincipalId}</th>
      <td>{row.PrincipalType??'Unknown'}</td><td title={row.RoleId}>{row.RoleName??row.RoleId}</td>
      <td title={row.Scope}>{row.Scope}</td>
      <td>{row.Scope===scope.toLowerCase()?'Direct':'Inherited'}</td>
      <td title={row.Condition??undefined}>{row.Condition?'Conditional':'None returned'}</td>
    </tr>)}</tbody>
  </table></div>;
}

function AzureRoles({account,report,scope,refresh}:{account:AuditAccount;report:DataAudit;scope:string;refresh:number}){
  const [open,setOpen]=useState(false),[history,setHistory]=useState<AzureRoleHistory>(),[error,setError]=useState(false);
  const collection=report.collections.find(c=>c.DataType==='azureRoleAssignments');
  const status=collection?.Status,progress=JSON.stringify(report.collections);
  const scanId=report.audit.ScanId;
  useEffect(()=>{
    if(!open||!status)return;
    let cancelled=false;
    setHistory(undefined);setError(false);
    void loadAzureRoleHistory(account,scanId,scope)
      .then(result=>{if(!cancelled)setHistory(result);}).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;};
  },[account,open,scanId,scope,refresh,status,progress]);
  const current=history?.rows.filter(row=>row.ScanId.toLowerCase()===scanId.toLowerCase())??[];
  const priorId=history?.summary.PriorScanId?.toLowerCase();
  const prior=history?.rows.filter(row=>row.ScanId.toLowerCase()===priorId)??[];
  const previousById=new Map(prior.map(row=>[row.Id,row]));
  const currentById=new Map(current.map(row=>[row.Id,row]));
  const added=current.filter(row=>!previousById.has(row.Id));
  const removed=prior.filter(row=>!currentById.has(row.Id));
  const changed=current.filter(row=>{
    const previous=previousById.get(row.Id);
    return previous&&(row.RoleId!==previous.RoleId||row.PrincipalId!==previous.PrincipalId||
      row.Condition!==previous.Condition||row.ConditionVersion!==previous.ConditionVersion);
  });
  return <details className="azure-resource-group" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Azure roles and changes</summary>
    {open?<div><Notice collection={collection}/>
      <p>Shows assignments at this scope and inherited within the subscription. Management group and tenant-level grants are outside this view.</p>
      {status&&!history&&!error?<p role="status">Loading Azure roles?</p>:null}
      {error?<p role="alert">Azure roles could not be loaded. Use Refresh to try again.</p>:null}
      {history?<><h4>Saved assignments</h4>
        {current.length?<AzureRoleTable rows={current} scope={scope}/>:status==='complete'?<p>No Azure role assignments were returned for this scope.</p>:null}
        <h4>Changes since the previous complete role snapshot</h4>
        {priorId?<><p>{when(history.summary.PriorCreatedAt)} to {when(report.audit.CreatedAtUtc)}</p>
          {!added.length&&!removed.length&&!changed.length?<p>No assignment changes detected.</p>:null}
          {added.length?<><h5>Added</h5><AzureRoleTable rows={added} scope={scope}/></>:null}
          {removed.length?<><h5>Removed</h5><AzureRoleTable rows={removed} scope={scope}/></>:null}
          {changed.length?<><h5>Updated assignments</h5>{changed.map(row=><div key={row.Id}>
            <p>Previous</p><AzureRoleTable rows={[previousById.get(row.Id)!]} scope={scope}/>
            <p>Current</p><AzureRoleTable rows={[row]} scope={scope}/>
          </div>)}</>:null}
        </>:<p>{status==='complete'?'No earlier complete Azure role snapshot for this subscription.':'A complete role snapshot is required to compare changes.'}</p>}
      </>:null}
    </div>:null}
  </details>;
}

function AzureResources({rows,account,report,refresh}:{rows:Row[];account:AuditAccount;report:DataAudit;refresh:number}){
  const [expanded,setExpanded]=useState<string|null>(null);
  return <div className="azure-resource-scroll"><table className="azure-resource-table" aria-label="Azure resource inventory">
    <thead><tr>{['Name','Resource type','Resource group','Location','Subscription ID','Tags'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(row=>{
      const resource=sourceRecord(row),id=row.SourceId??'';
      const tags=Object.entries(object(resource.tags)).map(([key,value])=>key+': '+String(value));
      const open=expanded===id;
      const type=String(resource.type).toLowerCase();
      const dataset=type==='microsoft.storage/storageaccounts'?'azureStorageSettings':
        type==='microsoft.sql/servers'?'azureSqlSettings':null;
      const portalUrl='https://portal.azure.com/#@'+encodeURIComponent(report.audit.TenantId)+'/resource'+id.split('/').map(encodeURIComponent).join('/');
      return <Fragment key={id}><tr>
        <th scope="row"><button type="button" aria-expanded={open} onClick={()=>setExpanded(open?null:id)}>{name(row)}</button></th>
        {[resource.type,resource.resourceGroup,resource.location,resource.subscriptionId,tags.join(', ')].map((value,index)=>
          <td key={index} title={String(value||'?')}>{String(value||'?')}</td>)}
      </tr>{open?<tr className="azure-resource-detail"><td colSpan={6}>
        <a href={portalUrl} target="_blank" rel="noreferrer">Open in Azure portal</a>
        <Fields value={{'Resource ID':id,Tags:resource.tags}}/>
        <AzureRoles key={id} account={account} report={report} scope={id} refresh={refresh}/>
        {dataset?<AzureSettings key={id} account={account} report={report} resourceId={id} dataset={dataset} refresh={refresh} kind={resource.kind}/>:null}
      </td></tr>:null}</Fragment>;
    })}</tbody>
  </table></div>;
}

function GroupResources({account,report,resourceGroup,refresh}:{account:AuditAccount;report:DataAudit;resourceGroup:string;refresh:number}){
  const [page,setPage]=useState(1),[data,setData]=useState<LicenseEvidencePage>(),[error,setError]=useState(false);
  const collection=report.collections.find(c=>c.DataType==='azureResources');
  const status=collection?.Status,count=collection?.RecordCount;
  useEffect(()=>{
    if(!status)return;
    let cancelled=false;
    setData(undefined);setError(false);
    void loadLicenseEvidence(account,report.audit.ScanId,'azureResources',page,'','',resourceGroup)
      .then(result=>{if(!cancelled)setData(result);}).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,resourceGroup,page,refresh,status,count]);
  return <><Notice collection={collection}/>
    {error?<p role="alert">Resources could not be loaded. Use Refresh to try again.</p>:null}
    {status&&!data&&!error?<p role="status">Loading resources?</p>:null}
    {data?.rows.length?<AzureResources rows={data.rows} account={account} report={report} refresh={refresh}/>:null}
    {data&&!data.total&&status==='complete'?<p>No resources returned for this group.</p>:null}
    {data&&(page>1||data.total>data.pageSize)?<div className="explorer-pagination">
      <button type="button" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button>
      <span>Page {page}</span>
      <button type="button" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(page+1)}>Next</button>
    </div>:null}
  </>;
}

function AzureResourceGroup({row,account,report,refresh}:{row:Row;account:AuditAccount;report:DataAudit;refresh:number}){
  const [open,setOpen]=useState(false);
  const groupName=name(row);
  return <details className="azure-resource-group" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{groupName}</summary>
    {open?<>{row.SourceId?<AzureRoles account={account} report={report} scope={row.SourceId} refresh={refresh}/>:null}
      <GroupResources account={account} report={report} resourceGroup={groupName} refresh={refresh}/></>:null}
  </details>;
}

function BackupPolicyList({rows,details,vault}:{rows:Row[];details:Row[];vault:Row}){
  const detailsByPolicy=new Map(details.map(detail=>[detail.ParentSourceId,detail]));
  const groups=new Map<string,Row[]>();
  for(const row of rows){
    const group=backupPolicyGroup(row),entries=groups.get(group);
    if(entries)entries.push(row);
    else groups.set(group,[row]);
  }
  return <div className="vault-workloads">{[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([group,policies])=>
    <details key={group} className="vault-workload"><summary>{group} <span className="vault-policy-count">{policies.length}</span></summary>{policies.map(policy=><details className="vault-policy" key={policy.SourceId}>
      <summary>{String(sourceRecord(policy).name??name(policy))}</summary>
      <RecoveryBackupPolicy row={policy} vault={vault} detail={detailsByPolicy.get(policy.SourceId)}/>
    </details>)}</details>
  )}</div>;
}

export function AuditExplorer({account,report,refresh}:{account:AuditAccount;report:DataAudit;refresh:number}){
  const query=new URLSearchParams(window.location.search),requested=query.get('dataset')??'conditionalAccess';
  const parent=Object.entries(children).find(([,r])=>Object.values(r).includes(requested))?.[0]??requested;
  const [type,setType]=useState(parent),[group,setGroup]=useState(groups.find(g=>g.types.includes(parent))?.name??'Identity & access');
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<LicenseEvidencePage>(),[selected,setSelected]=useState<string|null>(query.get('item'));
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const progress=JSON.stringify(report.collections),collection=report.collections.find(c=>c.DataType===type);
  const navigate=(next:string,category?:string)=>{
    if(next==='licenses'||next==='licenseAssignments'){window.location.assign(`/audit-data/${report.audit.ScanId}/licenses?view=${next==='licenses'?'summary':'assigned'}`);return;}
    setType(next);setGroup(category??groups.find(g=>g.types.includes(next))?.name??group);setSearch('');setPage(1);setSelected(null);setData(undefined);
    const params=new URLSearchParams({dataset:next});window.history.replaceState({},'',`${window.location.pathname}?${params}`);
  };
  useEffect(()=>{
    let cancelled=false;setData(undefined);setError('');setBusy(true);
    if(!collection){setBusy(false);return;}
    const timer=setTimeout(()=>{void loadLicenseEvidence(account,report.audit.ScanId,type,page,search,'').then(result=>{
      if(!cancelled){setData(result);setSelected(current=>result.rows.some(r=>r.SourceId===current)?current:result.rows[0]?.SourceId??null);}
    }).catch(()=>{if(!cancelled)setError('Inventory could not be loaded. Use Refresh to try again.');}).finally(()=>{if(!cancelled)setBusy(false);});},200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[account,report.audit.ScanId,type,page,search,progress,refresh]);
  const [definitions,setDefinitions]=useState<RoleDefinitions>(new Map());
  const hasDefinitions=report.collections.some(c=>c.DataType==='directoryRoleDefinitions'&&c.RecordCount>0);
  useEffect(()=>{
    let cancelled=false;
    setDefinitions(new Map());
    if(type!=='roleAssignments'||!hasDefinitions)return;
    void (async()=>{
      const roles=new Map<string,Record<string,unknown>>();
      for(let p=1;!cancelled;p++){
        const result=await loadLicenseEvidence(account,report.audit.ScanId,'directoryRoleDefinitions',p,'','');
        for(const row of result.rows)if(row.SourceId)roles.set(row.SourceId,sourceRecord(row));
        if(p*result.pageSize>=result.total)break;
      }
      if(!cancelled)setDefinitions(roles);
    })().catch(()=>{if(!cancelled)setDefinitions(new Map());});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,type,hasDefinitions,progress,refresh]);
  const item=data?.rows.find(r=>r.SourceId===selected),complete=report.collections.filter(c=>c.Status==='complete').length;
  const azureView=type==='azureResources'||type==='resourceGroups';
  const vaultView=type==='recoveryVaults';
  const singleVault=vaultView&&collection?.Status==='complete'&&collection.RecordCount===1&&!search&&(!data||data.total===1);
  return <section className="audit-explorer" aria-label="Audit explorer"><header className="explorer-summary"><div><span className="eyebrow">Audit coverage</span><h2>{complete} / {report.collections.length} datasets collected</h2><p>{when(report.audit.CreatedAtUtc)} · {report.audit.Status}</p></div>
    <details><summary>Collection details</summary><p>Audit ID: {report.audit.ScanId}</p><ul>{report.collections.map(c=><li key={c.DataType}>{c.Label??c.DataType}: {c.Status} · {c.RecordCount} records{c.ErrorCode?` · ${c.ErrorCode}`:''}</li>)}</ul></details></header>
    <div className={vaultView?'explorer-layout explorer-vault-layout':azureView?'explorer-layout explorer-azure-layout':'explorer-layout'}><nav className="explorer-categories" aria-label="Audit categories">{groups.map(g=><div key={g.name}><button type="button" aria-expanded={group===g.name} onClick={()=>{const first=g.types.find(t=>report.collections.some(c=>c.DataType===t));navigate(first??`unavailable-${g.name}`,g.name);}}>{g.name}<small>{g.types.some(t=>report.collections.some(c=>c.DataType===t))?'Browse':'Not collected'}</small></button>
      {group===g.name?<div className="explorer-datasets">{g.types.filter(t=>report.collections.some(c=>c.DataType===t)).map(t=><button key={t} type="button" aria-current={type===t?'page':undefined} onClick={()=>navigate(t,g.name)}>{labels[t]??report.collections.find(c=>c.DataType===t)?.Label??t}<span>{report.collections.find(c=>c.DataType===t)?.RecordCount}</span></button>)}</div>:null}</div>)}</nav>
    <section className="explorer-inventory" aria-label="Audit inventory">{vaultView?null:<p className="eyebrow">{group}</p>}<h2>{labels[type]??collection?.Label??'Not collected'}</h2><Notice collection={collection}/>
      {type==='roleAssignments'&&collection?<DirectoryRoleSummary account={account} report={report} refresh={refresh} definitions={definitions}/>:null}
      {collection?<>{singleVault?null:<label>Search inventory<input type="search" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setPage(1);setSelected(null);}}/></label>}
      {busy?<p role="status">Loading inventory…</p>:null}{error?<p role="alert">{error}</p>:null}
      {data?<>{singleVault?null:<p className="explorer-count">{data.total} matching records</p>}{type==='azureResources'?<AzureResources rows={data.rows} account={account} report={report} refresh={refresh}/>:type==='resourceGroups'?data.rows.map(row=><AzureResourceGroup key={row.SourceId} row={row} account={account} report={report} refresh={refresh}/>):<div className="explorer-items">{data.rows.map(r=><button key={r.SourceId} type="button" aria-pressed={selected===r.SourceId} onClick={()=>{setSelected(r.SourceId??null);const p=new URLSearchParams({dataset:type,item:r.SourceId??''});window.history.replaceState({},'',`${window.location.pathname}?${p}`);}}><strong>{name(r,definitions)}</strong><small>{type==='roleAssignments'?assigneeName(r):type==='recoveryBackupPolicies'?backupPolicyGroup(r):readable(r.State??sourceRecord(r).platforms??sourceRecord(r)['@odata.type']??'Saved evidence')}</small>{singleVault?null:<span>View details →</span>}</button>)}</div>}
      {!data.rows.length?<p>{collection.Status==='complete'?(search?'No records match your search.':'No records returned for this dataset.'):'No records saved yet.'}</p>:null}
      {vaultView&&page===1&&data.total<=data.pageSize?null:<div className="explorer-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button type="button" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</>:null}</>:<p>This category has no collected evidence in this snapshot. It is not a clean audit result.</p>}</section>
    {azureView?null:item?<PolicyDetail key={`${type}:${item.SourceId}`} account={account} report={report} type={type} row={item} refresh={refresh} definitions={definitions}/>:<section className="explorer-detail explorer-empty"><h2>Select an item</h2><p>Choose a category and an inventory item to explore its saved configuration.</p></section>}</div></section>;
}
