import type {LicenseEvidenceRow} from '../api';
type RecordValue=Record<string,unknown>;
const object=(value:unknown):RecordValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};
export function sourceRecord(row:LicenseEvidenceRow):RecordValue{
  try{return object(JSON.parse(row.SourceJson??'{}'));}catch{return {};}
}
const label=(key:string)=>key.replace(/^@odata\./,'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
const names:Record<string,string>={enabled:'Enabled',disabled:'Disabled',enabledForReportingButNotEnforced:'Report-only',
  browser:'Browser',mobileAppsAndDesktopClients:'Mobile apps and desktop clients',exchangeActiveSync:'Exchange ActiveSync',other:'Other clients',
  all:'All client types',mfa:'Require multifactor authentication',block:'Block access',compliantDevice:'Require a compliant device',
  domainJoinedDevice:'Require a hybrid joined device',approvedApplication:'Require an approved application',compliantApplication:'Require app protection',
  passwordChange:'Require a password change',windows:'Windows',macOS:'macOS',iOS:'iOS',android:'Android',linux:'Linux',GuestsOrExternalUsers:'Guests and external users'};
function display(value:unknown):string{
  if(value===null||value===undefined)return 'Not provided';
  if(typeof value==='boolean')return value?'Yes':'No';
  return names[String(value)]??String(value);
}
function Values({value,allLabel,locations}:{value:unknown;allLabel?:string;locations?:Map<string,string>}){
  if(value===undefined||value===null)return <>Not provided</>;
  if(!Array.isArray(value))return <>{display(value)}</>;
  if(!value.length)return <>None</>;
  return <ul className="audit-value-list">{value.map((item,index)=>{
    const id=String(item);
    const text=id==='All'||(id==='all'&&allLabel)?allLabel??'All':id==='None'?'None':id==='Office365'?'Microsoft 365':id==='AllTrusted'?'All trusted locations':locations?.get(id.toLowerCase())??display(item);
    return <li key={`${id}:${index}`}>{text}</li>;
  })}</ul>;
}
function Fields({value}:{value:unknown}){
  if(value===null||value===undefined)return <span>Not provided</span>;
  if(Array.isArray(value))return value.length?<ul className="audit-value-list">{value.map((v,i)=><li key={i}><Fields value={v}/></li>)}</ul>:<span>None</span>;
  if(typeof value==='object'){
    const entries=Object.entries(object(value)).filter(([key])=>key!=='@odata.context'&&key!=='@odata.type');
    return entries.length?<dl className="audit-policy-fields">{entries.map(([key,item])=><div key={key}><dt>{label(key)}</dt><dd><Fields value={item}/></dd></div>)}</dl>:<span>No settings returned</span>;
  }
  return <span>{display(value)}</span>;
}
function Raw({row}:{row:LicenseEvidenceRow}){
  return <details className="audit-raw-evidence"><summary>View source JSON</summary><pre className="audit-source-json">{JSON.stringify(sourceRecord(row),null,2)}</pre></details>;
}
const when=(value:string|undefined)=>value?new Date(value).toLocaleString():'Not provided';
export function ConditionalAccessDetails({rows,locations}:{rows:LicenseEvidenceRow[];locations:Map<string,string>}){
  return <div className="audit-policy-list">{rows.map(row=>{
    const policy=sourceRecord(row),conditions=object(policy.conditions),users=object(conditions.users),apps=object(conditions.applications);
    const location=object(conditions.locations),platforms=object(conditions.platforms),grant=object(policy.grantControls);
    const targeting=[['Included users',users.includeUsers,'All users'],['Excluded users',users.excludeUsers,'All users'],
      ['Included groups',users.includeGroups],['Excluded groups',users.excludeGroups],['Included directory roles',users.includeRoles],['Excluded directory roles',users.excludeRoles],
      ['Included applications',apps.includeApplications,'All applications'],['Excluded applications',apps.excludeApplications,'All applications'],
      ['Included locations',location.includeLocations,'All locations'],['Excluded locations',location.excludeLocations,'All locations'],
      ['Client applications',conditions.clientAppTypes],['Included platforms',platforms.includePlatforms,'All platforms'],['Excluded platforms',platforms.excludePlatforms,'All platforms'],
      ['User risk',conditions.userRiskLevels],['Sign-in risk',conditions.signInRiskLevels],['Service principal risk',conditions.servicePrincipalRiskLevels]] as const;
    const additional=Object.fromEntries(Object.entries(conditions).filter(([key])=>!['users','applications','locations','platforms','clientAppTypes','userRiskLevels','signInRiskLevels','servicePrincipalRiskLevels'].includes(key)));
    const userExtra=Object.fromEntries(Object.entries(users).filter(([key])=>!['includeUsers','excludeUsers','includeGroups','excludeGroups','includeRoles','excludeRoles'].includes(key)));
    const appExtra=Object.fromEntries(Object.entries(apps).filter(([key])=>!['includeApplications','excludeApplications'].includes(key)));
    return <article className="audit-policy-card" key={row.SourceId}>
      <header><h3>{String(policy.displayName??row.DisplayName??row.SourceId)}</h3><span className="audit-state">{display(policy.state??row.State)}</span></header>
      <p className="audit-evidence-date">Collected {when(row.CollectedAtUtc)}</p>
      {policy.state==='enabledForReportingButNotEnforced'?<p>Report-only: this policy evaluates access but does not enforce these controls.</p>:policy.state==='disabled'?<p>This policy is disabled and does not enforce these controls.</p>:null}
      <h4>Who and what this policy targets</h4>
      <dl className="audit-policy-fields">{targeting.map(([title,value,...rest])=><div key={title}><dt>{title}</dt><dd><Values value={value} {...(rest[0]?{allLabel:rest[0]}:{})} {...(title.includes('locations')?{locations}:{})}/></dd></div>)}</dl>
      <h4>Access requirements</h4><dl className="audit-policy-fields"><div><dt>Controls</dt><dd><Values value={grant.builtInControls}/></dd></div>
        <div><dt>How controls combine</dt><dd>{grant.operator==='AND'?'All listed controls are required':grant.operator==='OR'?'At least one listed control is required':'Not provided'}</dd></div>
        {Object.entries(grant).filter(([key])=>!['builtInControls','operator'].includes(key)).map(([key,item])=><div key={key}><dt>{label(key)}</dt><dd><Fields value={item}/></dd></div>)}
      </dl><h4>Session controls</h4>{policy.sessionControls?<Fields value={policy.sessionControls}/>:<p>No session controls returned.</p>}
      {Object.values(userExtra).some(v=>v!=null)?<><h4>Additional user targeting</h4><Fields value={userExtra}/></>:null}
      {Object.values(appExtra).some(v=>v!=null)?<><h4>Additional application targeting</h4><Fields value={appExtra}/></>:null}
      {Object.values(additional).some(v=>v!=null)?<><h4>Additional conditions</h4><Fields value={additional}/></>:null}
      <p className="audit-evidence-date">Policy ID: {row.SourceId}</p><Raw row={row}/>
    </article>;
  })}</div>;
}
function country(value:unknown):string{
  const code=String(value);
  try{return `${new Intl.DisplayNames(['en'],{type:'region'}).of(code.toUpperCase())??code} (${code})`;}catch{return code;}
}
export function NamedLocationDetails({rows}:{rows:LicenseEvidenceRow[]}){
  return <div className="audit-table-scroll"><table className="audit-evidence-table"><thead><tr><th>Location</th><th>Type</th><th>Trusted</th><th>Networks or countries</th><th>Unknown countries / regions</th><th>Collected</th></tr></thead>
    <tbody>{rows.map(row=>{
      const location=sourceRecord(row),type=String(location['@odata.type']??'');
      const ip=type.includes('ipNamedLocation')||Array.isArray(location.ipRanges),countries=Array.isArray(location.countriesAndRegions)?location.countriesAndRegions:[];
      const networks=Array.isArray(location.ipRanges)?location.ipRanges:[];
      return <tr key={row.SourceId}><td><strong>{String(location.displayName??row.DisplayName??row.SourceId)}</strong><small>{row.SourceId}</small><Raw row={row}/></td>
        <td>{ip?'IP ranges':type.includes('countryNamedLocation')||countries.length?'Countries / regions':'Not provided'}</td>
        <td>{typeof location.isTrusted==='boolean'?(location.isTrusted?'Trusted':'Not trusted'):'Not provided'}</td>
        <td>{ip?networks.length?<ul className="audit-value-list">{networks.map((range,i)=><li key={i}>{String(object(range).cidrAddress??'Not provided')}</li>)}</ul>:'No IP ranges returned':countries.length?<ul className="audit-value-list">{countries.map((code,i)=><li key={i}>{country(code)}</li>)}</ul>:'No countries returned'}</td>
        <td>{typeof location.includeUnknownCountriesAndRegions==='boolean'?(location.includeUnknownCountriesAndRegions?'Included':'Excluded'):'Not provided'}</td><td>{when(row.CollectedAtUtc)}</td></tr>;
    })}</tbody></table></div>;
}
