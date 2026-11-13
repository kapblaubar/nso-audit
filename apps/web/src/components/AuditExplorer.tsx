import {DirectoryRoleDetails,DirectoryRoleSummary,roleName,assigneeName} from './DirectoryRoleDetails';
import {useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadLicenseEvidence,type DataAudit,type LicenseEvidenceRow as Row,type LicenseEvidencePage} from '../api';
import {ConditionalAccessDetails,NamedLocationDetails,Fields,sourceRecord} from './AuditPolicyDetails';

type Collection=DataAudit['collections'][number];
const groups=[
  {name:'Identity & access',types:['conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments']},
  {name:'Devices',types:['settingsCatalogPolicies','deviceConfigurations','compliancePolicies','appProtectionPolicies']},
  {name:'Data protection',types:[]},
  {name:'Threat protection',types:['defenderRecommendations','defenderMetadata','endpointRecommendations','resourceGroups']},
  {name:'Scores',types:['secureScores','secureScoreProfiles','defenderScores','exposureScores','deviceSecureScores']},
  {name:'Backups',types:[]},
  {name:'Licensing',types:['licenses','licenseAssignments']}
];
const children:Record<string,{settings:string;assignments:string}>={
  settingsCatalogPolicies:{settings:'settingsCatalogSettings',assignments:'settingsCatalogAssignments'},
  deviceConfigurations:{settings:'deviceConfigurationDetails',assignments:'deviceConfigurationAssignments'},
  compliancePolicies:{settings:'compliancePolicyDetails',assignments:'compliancePolicyAssignments'}
};
const labels:Record<string,string>={settingsCatalogPolicies:'Settings catalog',deviceConfigurations:'Configuration profiles',compliancePolicies:'Compliance policies',authenticationMethods:'Authentication methods',licenses:'Licenses',licenseAssignments:'License assignments'};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString():'Not provided';
const name=(r:Row)=>sourceRecord(r).roleDefinitionId?roleName(r):r.DisplayName??r.SourceId??'Unnamed record';
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

function PolicyDetail({account,report,type,row,refresh}:{account:AuditAccount;report:DataAudit;type:string;row:Row;refresh:number}){
  const [tab,setTab]=useState(()=>{const requested=new URLSearchParams(window.location.search).get('dataset');return requested===children[type]?.settings?'Settings':requested===children[type]?.assignments?'Assignments':'Overview';});
  const [related,setRelated]=useState<Record<string,Row[]>>({}),[failures,setFailures]=useState<Record<string,string>>({}),[busy,setBusy]=useState(true);
  const [locations,setLocations]=useState(new Map<string,string>());
  const relations=children[type],progress=JSON.stringify(report.collections);
  useEffect(()=>{
    let cancelled=false;setRelated({});setFailures({});setLocations(new Map());setBusy(true);
    const types=relations?Object.values(relations):type==='conditionalAccess'?['namedLocations']:[];
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
        else setRelated(current=>({...current,[child]:rows.filter(r=>r.ParentSourceId===row.SourceId)}));
      }catch{if(!cancelled)setFailures(current=>({...current,[child]:'Saved evidence could not be loaded. Use Refresh to try again.'}));}
    })).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,type,row.SourceId,progress,refresh]);
  const source=sourceRecord(row),tabs=relations?['Overview','Settings','Assignments','Source evidence']:['Overview','Source evidence'];
  const child=relations?(tab==='Settings'?relations.settings:relations.assignments):'';
  const collection=report.collections.find(c=>c.DataType===child),rows=related[child]??[];
  return <section className="explorer-detail" aria-label="Item details"><header><p className="eyebrow">Selected item</p><h2>{name(row)}</h2>
    <p className="audit-evidence-date">Collected {when(row.CollectedAtUtc)}</p></header>
    <div className="explorer-tabs" role="tablist" aria-label="Detail sections">{tabs.map(t=><button key={t} type="button" role="tab" id={`detail-${t.replaceAll(' ','-')}`} aria-selected={tab===t} aria-controls="explorer-tab-panel" tabIndex={tab===t?0:-1} onKeyDown={event=>{const i=tabs.indexOf(t);const next=event.key==='ArrowRight'?tabs[(i+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:undefined;if(next){event.preventDefault();setTab(next);document.getElementById(`detail-${next.replaceAll(' ','-')}`)?.focus();}}} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <div id="explorer-tab-panel" role="tabpanel" aria-labelledby={`detail-${tab.replaceAll(' ','-')}`}>
    {tab==='Overview'?<>{type==='conditionalAccess'?<>{failures.namedLocations?<p role="alert">Location names could not be loaded. Saved IDs are shown.</p>:null}<ConditionalAccessDetails rows={[row]} locations={locations}/></>:type==='namedLocations'?<NamedLocationDetails rows={[row]}/>:type==='roleAssignments'?<DirectoryRoleDetails row={row}/>:relations?<><p>{String(source.description??'No description provided.')}</p><Fields value={{Platform:source.platforms??source['@odata.type'],Technology:source.technologies,State:source.state??row.State,'Source updated':source.lastModifiedDateTime,'Policy ID':row.SourceId}}/><p>Select Settings or Assignments above to explore this policy.</p></>:<Fields value={source}/>}</>:null}
    {relations&&(tab==='Settings'||tab==='Assignments')?<><Notice collection={collection}/>{failures[child]?<p role="alert">{failures[child]}</p>:busy?<p role="status">Loading linked evidence…</p>:collection?<>{rows.length?(tab==='Settings'?<Settings rows={rows} catalog={type==='settingsCatalogPolicies'}/>:<Assignments rows={rows}/>):<p>{collection.Status==='complete'?`No ${tab.toLowerCase()} returned for this policy.`:'No evidence saved for this policy yet.'}</p>}</>:null}</>:null}
    {tab==='Source evidence'?<><p>Original saved responses for this item. IDs and timestamps are retained for verification.</p><Source rows={[row]}/>{relations?Object.entries(relations).map(([kind,child])=><section key={child}><h3>{kind==='settings'?'Settings':'Assignments'}</h3><Notice collection={report.collections.find(c=>c.DataType===child)}/>{failures[child]?<p role="alert">{failures[child]}</p>:busy?<p>Loading…</p>:<Source rows={related[child]??[]}/>}</section>):null}</>:null}
    </div></section>;
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
  const item=data?.rows.find(r=>r.SourceId===selected),complete=report.collections.filter(c=>c.Status==='complete').length;
  return <section className="audit-explorer" aria-label="Audit explorer"><header className="explorer-summary"><div><span className="eyebrow">Audit coverage</span><h2>{complete} / {report.collections.length} datasets collected</h2><p>{when(report.audit.CreatedAtUtc)} · {report.audit.Status}</p></div>
    <details><summary>Collection details</summary><p>Audit ID: {report.audit.ScanId}</p><ul>{report.collections.map(c=><li key={c.DataType}>{c.Label??c.DataType}: {c.Status} · {c.RecordCount} records{c.ErrorCode?` · ${c.ErrorCode}`:''}</li>)}</ul></details></header>
    <div className="explorer-layout"><nav className="explorer-categories" aria-label="Audit categories">{groups.map(g=><div key={g.name}><button type="button" aria-expanded={group===g.name} onClick={()=>{const first=g.types.find(t=>report.collections.some(c=>c.DataType===t));navigate(first??`unavailable-${g.name}`,g.name);}}>{g.name}<small>{g.types.some(t=>report.collections.some(c=>c.DataType===t))?'Browse':'Not collected'}</small></button>
      {group===g.name?<div className="explorer-datasets">{g.types.filter(t=>report.collections.some(c=>c.DataType===t)).map(t=><button key={t} type="button" aria-current={type===t?'page':undefined} onClick={()=>navigate(t,g.name)}>{labels[t]??report.collections.find(c=>c.DataType===t)?.Label??t}<span>{report.collections.find(c=>c.DataType===t)?.RecordCount}</span></button>)}</div>:null}</div>)}</nav>
    <section className="explorer-inventory" aria-label="Audit inventory"><p className="eyebrow">{group}</p><h2>{labels[type]??collection?.Label??'Not collected'}</h2><Notice collection={collection}/>
      {type==='roleAssignments'&&collection?<DirectoryRoleSummary account={account} report={report} refresh={refresh}/>:null}
      {collection?<><label>Search inventory<input type="search" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setPage(1);setSelected(null);}}/></label>
      {busy?<p role="status">Loading inventory…</p>:null}{error?<p role="alert">{error}</p>:null}
      {data?<><p className="explorer-count">{data.total} matching records</p><div className="explorer-items">{data.rows.map(r=><button key={r.SourceId} type="button" aria-pressed={selected===r.SourceId} onClick={()=>{setSelected(r.SourceId??null);const p=new URLSearchParams({dataset:type,item:r.SourceId??''});window.history.replaceState({},'',`${window.location.pathname}?${p}`);}}><strong>{name(r)}</strong><small>{type==='roleAssignments'?assigneeName(r):readable(r.State??sourceRecord(r).platforms??sourceRecord(r)['@odata.type']??'Saved evidence')}</small><span>View details →</span></button>)}</div>
      {!data.rows.length?<p>{collection.Status==='complete'?(search?'No records match your search.':'No records returned for this dataset.'):'No records saved yet.'}</p>:null}
      <div className="explorer-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button type="button" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div></>:null}</>:<p>This category has no collected evidence in this snapshot. It is not a clean audit result.</p>}</section>
    {item?<PolicyDetail key={`${type}:${item.SourceId}`} account={account} report={report} type={type} row={item} refresh={refresh}/>:<section className="explorer-detail explorer-empty"><h2>Select an item</h2><p>Choose a category and an inventory item to explore its saved configuration.</p></section>}</div></section>;
}
