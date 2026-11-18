import {useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadLicenseEvidence,type DataAudit,type LicenseEvidenceRow} from '../api';
import {sourceRecord} from './AuditPolicyDetails';

const datasets = {
  directoryUsers: 'Users',
  directoryGroups: 'Groups',
  directoryGroupMembers: 'Direct group membership',
  directoryRoleDefinitions: 'Role definitions',
  roleAssignments: 'Role assignments',
  directoryRoleEligibility: 'PIM role eligibility',
};
type Dataset = keyof typeof datasets;
type RecordFields = Record<string,unknown>;
const tabs = ['Users','Groups','Roles'] as const;
const fields = (value: unknown): RecordFields =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordFields : {};
const groupTypes = (group: RecordFields): unknown[] => Array.isArray(group.groupTypes) ? group.groupTypes : [];
const name = (record: RecordFields) => String(record.displayName ?? record.userPrincipalName ?? record.id ?? 'Unknown');
const type = (record: RecordFields) => String(record['@odata.type'] ?? '').replace('#microsoft.graph.','');
const flag = (value: unknown, yes: string, no: string) => value === true ? yes : value === false ? no : 'Unknown';

function indexBy(records: RecordFields[], key: string) {
  const map = new Map<string,RecordFields[]>();
  for (const record of records) {
    const id = String(record[key] ?? '');
    const entries = map.get(id);
    if (entries) entries.push(record);
    else map.set(id,[record]);
  }
  return map;
}

export function DirectoryAccess({account,report,refresh}: {account: AuditAccount; report: DataAudit; refresh: number}) {
  const [tab,setTab] = useState<typeof tabs[number]>('Users');
  const [search,setSearch] = useState('');
  const [saved,setSaved] = useState<Partial<Record<Dataset,LicenseEvidenceRow[]>>>({});
  const [errors,setErrors] = useState<Dataset[]>([]);
  const [loading,setLoading] = useState(true);
  const scanId = report.audit.ScanId;
  const progress = JSON.stringify(report.collections);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaved({});
    setErrors([]);
    const available = (Object.keys(datasets) as Dataset[]).filter(key =>
      report.collections.some(collection => collection.DataType === key && collection.RecordCount > 0));
    void Promise.allSettled(available.map(async key => {
      const rows: LicenseEvidenceRow[] = [];
      for (let page = 1; !cancelled; page++) {
        const result = await loadLicenseEvidence(account,scanId,key,page,'','');
        rows.push(...result.rows);
        if (page * result.pageSize >= result.total) break;
      }
      return rows;
    })).then(results => {
      if (cancelled) return;
      const loaded: Partial<Record<Dataset,LicenseEvidenceRow[]>> = {};
      const failed: Dataset[] = [];
      results.forEach((result,index) => {
        const key = available[index]!;
        if (result.status === 'fulfilled') loaded[key] = result.value;
        else failed.push(key);
      });
      setSaved(loaded);
      setErrors(failed);
      setLoading(false);
    });
    return () => {cancelled = true;};
  },[account,scanId,progress,refresh]);

  const collection = (key: Dataset) => report.collections.find(item => item.DataType === key);
  const complete = (key: Dataset) => !loading && !errors.includes(key) && collection(key)?.Status === 'complete';
  const records = (key: Dataset) => (saved[key] ?? []).map(sourceRecord);
  const users = records('directoryUsers');
  const groups = records('directoryGroups');
  const usersById = new Map(users.map(user => [String(user.id),user]));
  const groupsById = new Map(groups.map(group => [String(group.id),group]));
  const members = (saved.directoryGroupMembers ?? []).map(row => ({
    ...sourceRecord(row), groupId: row.ParentSourceId,
  }));
  const membersByGroup = indexBy(members,'groupId');
  const membershipsByPrincipal = indexBy(members,'id');
  const active = records('roleAssignments');
  const eligibilityCollectedAt = Date.parse(collection('directoryRoleEligibility')?.CompletedAtUtc ?? report.audit.CreatedAtUtc);
  const eligible = records('directoryRoleEligibility').filter(assignment =>
    (!assignment.startDateTime || Date.parse(String(assignment.startDateTime)) <= eligibilityCollectedAt)
    && (!assignment.endDateTime || Date.parse(String(assignment.endDateTime)) > eligibilityCollectedAt));
  const roles = new Map(records('directoryRoleDefinitions').map(role => [String(role.id),role]));
  for (const assignment of [...active,...eligible]) {
    const id = String(assignment.roleDefinitionId ?? '');
    if (id && !roles.has(id)) roles.set(id,{id,...fields(assignment.roleDefinition)});
  }
  const activeByRole = indexBy(active,'roleDefinitionId');
  const eligibleByRole = indexBy(eligible,'roleDefinitionId');
  const activeByPrincipal = indexBy(active,'principalId');
  const eligibleByPrincipal = indexBy(eligible,'principalId');
  const query = search.trim().toLowerCase();
  const matches = (...values: unknown[]) => values.some(value => String(value ?? '').toLowerCase().includes(query));
  const sorted = (rows: RecordFields[]) => [...rows].sort((a,b) => name(a).localeCompare(name(b)));
  const scope = (assignment: RecordFields) => assignment.directoryScopeId === '/'
    ? 'Tenant-wide' : String(assignment.directoryScopeId ?? assignment.appScopeId ?? 'Scope unavailable');
  const directMembers = (groupId: string) => membersByGroup.get(groupId) ?? [];
  const principal = (id: string, fallback: RecordFields) => usersById.get(id) ?? groupsById.get(id) ?? fallback;
  const accountStatus = (user: RecordFields) => flag(user.accountEnabled,'Enabled','Disabled');
  const relevant: Dataset[] = tab === 'Users' ? ['directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','roleAssignments','directoryRoleEligibility']
    : tab === 'Groups' ? ['directoryGroups','directoryGroupMembers','directoryUsers']
    : ['directoryRoleDefinitions','roleAssignments','directoryRoleEligibility','directoryGroupMembers','directoryUsers','directoryGroups'];

  function status(key: Dataset) {
    const item = collection(key);
    return errors.includes(key) ? 'Saved evidence could not be loaded. Try Refresh.'
      : item ? [item.Status === 'missingAccess' ? 'Access denied' : item.Status,item.ErrorCode].filter(Boolean).join(' · ')
      : 'Unavailable in this audit';
  }

  function assignmentList(assignments: RecordFields[], key: Dataset) {
    if (!assignments.length) return <p>{complete(key) ? 'None captured' : 'Unavailable'}</p>;
    return <ul>{assignments.map(assignment => {
      const id = String(assignment.principalId);
      const expanded = fields(assignment.principal);
      const assignee = principal(id,{id,...expanded});
      const group = groupsById.has(id) || type(expanded) === 'group';
      return <li key={String(assignment.id)}>
        {name(assignee)} · {group ? 'Group · ' : usersById.has(id) ? `${accountStatus(assignee)} · ` : ''}{scope(assignment)}
        {group ? <details><summary>Direct user members</summary>{memberList(id,true)}</details> : null}
      </li>;
    })}</ul>;
  }

  function memberList(id: string, usersOnly = false) {
    const rows = directMembers(id).filter(member => !usersOnly || type(member) === 'user' || usersById.has(String(member.id)));
    return rows.length ? <ul>{sorted(rows.map(member => principal(String(member.id),member))).map(member =>
      <li key={String(member.id)}>{name(member)}{usersById.has(String(member.id)) ? ` · ${accountStatus(member)}` : ''}</li>)}</ul>
      : <p>{complete('directoryGroupMembers') ? 'None captured' : 'Unavailable'}</p>;
  }

  function userRoles(userId: string, groupIds: string[], assignments: ReturnType<typeof indexBy>, key: Dataset) {
    const entries = [userId,...groupIds].flatMap(id => assignments.get(id) ?? []);
    return entries.length ? <ul>{entries.map(assignment => {
      const id = String(assignment.principalId);
      const roleId = String(assignment.roleDefinitionId);
      return <li key={String(assignment.id)}>{name(roles.get(roleId) ?? {id:roleId})} · {scope(assignment)}
        {id !== userId ? ` · via ${name(groupsById.get(id) ?? {id})}` : ''}</li>;
    })}</ul> : <p>{complete(key) && complete('directoryGroupMembers') ? 'None captured' : 'Unavailable'}</p>;
  }

  return <section aria-label="Users, Groups & Roles">
    <nav className="audit-provider-tabs" aria-label="Directory views">
      {tabs.map(item => <button className="detail-button" type="button" key={item} aria-pressed={item === tab}
        onClick={() => {setTab(item);setSearch('');}}>{item}</button>)}
    </nav>
    {loading ? <p role="status">Loading saved directory evidence…</p> : <>
      {relevant.some(key => !complete(key)) ? <ul aria-label="Directory collection status">
        {relevant.filter(key => !complete(key)).map(key => <li key={key}>{datasets[key]} · {status(key)}</li>)}
      </ul> : null}
      <label className="management-field">Search {tab.toLowerCase()}<input value={search} onChange={event => setSearch(event.target.value)}/></label>
      {tab === 'Users' ? <div className="directory-records">
        {sorted(users).filter(user => matches(user.displayName,user.mail,user.userPrincipalName)).map(user => {
          const id = String(user.id);
          const groupIds = (membershipsByPrincipal.get(id) ?? []).map(member => String(member.groupId));
          return <details key={id}><summary>{name(user)} · {String(user.mail ?? user.userPrincipalName ?? id)} · {accountStatus(user)}</summary>
            <h3>Direct group memberships</h3>
            {groupIds.length ? <ul>{groupIds.map(groupId => <li key={groupId}>{name(groupsById.get(groupId) ?? {id:groupId})}</li>)}</ul>
              : <p>{complete('directoryGroupMembers') ? 'None captured' : 'Unavailable'}</p>}
            <h3>Assigned roles</h3>{userRoles(id,groupIds,activeByPrincipal,'roleAssignments')}
            <h3>PIM eligibility</h3>{userRoles(id,groupIds,eligibleByPrincipal,'directoryRoleEligibility')}
          </details>;
        })}
      </div> : tab === 'Groups' ? <>
        {complete('directoryGroups') ? <p>
          {groups.length} total · {groups.filter(group => groupTypes(group).includes('Unified')).length} Microsoft 365 · {' '}
          {groups.filter(group => group.securityEnabled === true && !groupTypes(group).includes('Unified')).length} security · {' '}
          {groups.filter(group => groupTypes(group).includes('DynamicMembership')).length} dynamic · {' '}
          {groups.filter(group => group.onPremisesSyncEnabled == null).length} cloud · {' '}
          {groups.filter(group => group.onPremisesSyncEnabled != null).length} on-premises (current or previously synced)
        </p> : null}
        <div className="directory-records">{sorted(groups).filter(group => matches(group.displayName,group.mail)).map(group => {
          const id = String(group.id);
          const direct = directMembers(id);
          const enabled = direct.filter(member => usersById.get(String(member.id))?.accountEnabled === true).length;
          const userStatusKnown = direct.every(member => type(member) !== 'user' || typeof usersById.get(String(member.id))?.accountEnabled === 'boolean');
          return <details key={id}><summary>{name(group)} · {complete('directoryGroupMembers') && complete('directoryUsers') && userStatusKnown
            ? `${enabled} enabled direct users` : 'Enabled user count unavailable'}</summary>
            <h3>Direct members returned by Microsoft Graph</h3>{memberList(id)}
          </details>;
        })}</div>
      </> : <div className="directory-records">
        {sorted([...roles.values()]).filter(role => matches(role.displayName,role.description,role.id)).map(role => {
          const id = String(role.id), assignments = activeByRole.get(id) ?? [], eligibility = eligibleByRole.get(id) ?? [];
          return <details key={id}><summary>{name(role)} · {flag(role.isBuiltIn,'Built-in','Custom')} · {flag(role.isPrivileged,'Privileged','Standard')} · {' '}
            {complete('roleAssignments') ? `${assignments.length} assignments` : 'Assignment count unavailable'}</summary>
            {role.description ? <p>{String(role.description)}</p> : null}
            <h3>Assigned principals</h3>{assignmentList(assignments,'roleAssignments')}
            <h3>PIM eligibility</h3>{assignmentList(eligibility,'directoryRoleEligibility')}
          </details>;
        })}
      </div>}
    </>}
  </section>;
}
