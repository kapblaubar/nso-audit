import {useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadLicenseEvidence,type DataAudit,type LicenseEvidenceRow as Row} from '../api';
import {Fields,sourceRecord} from './AuditPolicyDetails';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function roleEvidence(row:Row){
  const source=sourceRecord(row),role=obj(source.roleDefinition),principal=obj(source.principal);
  return {source,role,principal};
}
export function roleName(row:Row){const {source,role}=roleEvidence(row);return String(role.displayName??`Role name not captured (${source.roleDefinitionId??'unknown'})`);}
export function assigneeName(row:Row){const {source,principal}=roleEvidence(row);return String(principal.displayName??principal.userPrincipalName??`Assignee ${source.principalId??'unknown'}`);}
export function DirectoryRoleDetails({row}:{row:Row}){
  const {source,role,principal}=roleEvidence(row);
  const kind=String(principal['@odata.type']??'').replace('#microsoft.graph.','');
  return <><h3>{assigneeName(row)}</h3>{!role.displayName?<p>Role name was not captured in this audit. Run a new tenant audit to collect names.</p>:null}
    <Fields value={{'Role':role.displayName,'Description':role.description,'Assignee type':kind||'Not captured','Sign-in name':principal.userPrincipalName,'Email':principal.mail,'Scope':source.directoryScopeId==='/'?'Tenant-wide':source.directoryScopeId,'App scope':source.appScopeId,'Role definition ID':source.roleDefinitionId,'Principal ID':source.principalId,'Assignment ID':source.id}}/>
    <p>Saved assignment at collection time. Group membership and PIM eligibility are not included.</p></>;
}
const priorityRoles=[['62e90394-69f5-4237-9190-012177145e10','Global Administrator'],['e8611ab8-c189-46e8-94e1-60213ab1f814','Privileged Role Administrator'],['7be44c8a-adaf-4e2a-84d6-ab2649e08a13','Privileged Authentication Administrator']];
export function DirectoryRoleSummary({account,report,refresh}:{account:AuditAccount;report:DataAudit;refresh:number}){
  const [rows,setRows]=useState<Row[]>(),[failed,setFailed]=useState(false);
  const progress=JSON.stringify(report.collections);
  useEffect(()=>{let cancelled=false;setRows(undefined);setFailed(false);
    void (async()=>{const all:Row[]=[];let page=1;while(!cancelled){const result=await loadLicenseEvidence(account,report.audit.ScanId,'roleAssignments',page,'','');all.push(...result.rows);if(page*result.pageSize>=result.total)break;page++;}if(!cancelled)setRows(all);})().catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,progress,refresh]);
  if(failed)return <p role="alert">Role summary could not be loaded. Use Refresh to try again.</p>;
  if(!rows)return <p role="status">Loading role summary?</p>;
  const unknown=rows.filter(r=>{const {role}=roleEvidence(r);return !role.templateId;}).length;
  const complete=report.collections.find(c=>c.DataType==='roleAssignments')?.Status==='complete';
  return <section className="role-summary" aria-label="Priority role summary"><h3>Priority roles to review</h3><p>Across this audit, independent of search. {complete?'':'Partial evidence. '}{unknown?`${unknown} assignments lack a role template; counts may be incomplete.`:''}</p>
    {priorityRoles.map(([id,label])=>{const matching=rows.filter(r=>String(roleEvidence(r).role.templateId??'').toLowerCase()===id);
      const users=new Set(matching.filter(r=>roleEvidence(r).principal['@odata.type']==='#microsoft.graph.user').map(r=>roleEvidence(r).source.principalId).filter(Boolean));
      return <div key={id}><strong>{label}</strong><p>{matching.length} observed assignments ? {users.size} identified direct users</p></div>;})}
    <p>Selected high-impact roles, not a complete risk assessment. Counts exclude group members and PIM eligibility. Unidentified assignees are not counted as users.</p></section>;
}
