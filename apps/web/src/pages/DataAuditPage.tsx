import {useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadDataAudit,loadLicenseEvidence,loadScanHistory,startDataAudit,
  type DataAudit,type LicenseEvidencePage,type ScanHistoryItem} from '../api';
import {ThemeToggle} from '../components/ThemeToggle';

const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString():'—';
const reason:Record<string,string>={missingAccess:'Microsoft denied access. Review licensing permissions and tenant consent.',
  authenticationUnavailable:'The tenant connection could not authenticate.',throttled:'Microsoft throttled collection. Start another audit after the service recovers.',
  sourceUnavailable:'The source could not be reached.',invalidResponse:'The source returned data that could not be safely recorded.',
  invalidPagingLink:'The source returned an invalid paging link.',workerInterrupted:'Collection was interrupted repeatedly.'};

export function DataAuditPage({account,onSignOut,scanId}:{account:AuditAccount;onSignOut:()=>void;scanId?:string}){
  const [report,setReport]=useState<DataAudit>(),[history,setHistory]=useState<ScanHistoryItem[]>([]);
  const [error,setError]=useState(''),[running,setRunning]=useState(false),[refresh,setRefresh]=useState(0);
  const [dataType,setDataType]=useState<'licenses'|'licenseAssignments'>('licenses');
  const [page,setPage]=useState(1),[search,setSearch]=useState(''),[skuId,setSkuId]=useState('');
  const [evidence,setEvidence]=useState<LicenseEvidencePage>(),[loading,setLoading]=useState(false),[dataError,setDataError]=useState('');
  const viewer='kind' in account&&account.role==='viewer';
  const active=!!report&&['queued','running'].includes(report.audit.Status);
  const progress=JSON.stringify(report?.collections);
  useEffect(()=>{
    let cancelled=false;
    void loadScanHistory(account).then(rows=>{if(!cancelled)setHistory(rows);}).catch(()=>{if(!cancelled)setError('Audit history could not be loaded.');});
    return()=>{cancelled=true;};
  },[account,refresh,active]);
  useEffect(()=>{
    if(!scanId)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      try{
        const result=await loadDataAudit(account,scanId);
        if(cancelled)return;
        setReport(result);setError('');
        if(['queued','running'].includes(result.audit.Status))timer=setTimeout(()=>void load(),5000);
      }catch(err){if(!cancelled)setError(err instanceof Error?err.message:'Audit could not be loaded.');}
    };
    void load();
    return()=>{cancelled=true;clearTimeout(timer);};
  },[account,scanId,refresh]);
  useEffect(()=>{
    if(!scanId||!report)return;
    let cancelled=false;
    setLoading(true);setEvidence(undefined);setDataError('');
    const timer=setTimeout(()=>{
      void loadLicenseEvidence(account,scanId,dataType,page,search,skuId).then(result=>{if(!cancelled)setEvidence(result);})
        .catch(err=>{if(!cancelled)setDataError(err instanceof Error?err.message:'Data could not be loaded.');})
        .finally(()=>{if(!cancelled)setLoading(false);});
    },250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[account,scanId,dataType,page,search,skuId,progress,refresh]);
  const start=async()=>{
    setRunning(true);setError('');
    try{const result=await startDataAudit(account);window.location.assign(`/audit-data/${encodeURIComponent(result.scanId)}`);}
    catch(err){setError(err instanceof Error?err.message:'Audit could not be started.');setRunning(false);}
  };
  const changeTab=(type:typeof dataType)=>{setDataType(type);setPage(1);setSearch('');setSkuId('');};
  const collection=report?.collections.find(c=>c.DataType===dataType);
  return <main className="report-page"><nav className="nav" aria-label="Audit navigation">
    <a className="brand" href="/"><img className="brand-mark" src="/brand/nsosquare.png" alt="" width="40" height="40"/><span className="brand-name">NSO Audit</span></a>
    <div className="nav-actions"><ThemeToggle/><button className="text-button" onClick={onSignOut}>Sign out</button></div>
  </nav><section className="report-shell audit-data-page">
    <p className="eyebrow">Tenant audit data</p><h1>{scanId?'Audit snapshot':'Audit collection'}</h1>
    <p>Tenant ID: {account.tenantId}</p>
    <p>Collect tenant licenses and user assignments. Each run keeps its own dated snapshot. Additional audit datasets will follow.</p>
    <div className="report-actions"><button className="step-action" disabled={viewer||running||active} onClick={()=>void start()}>{running?'Starting audit…':'Run license audit'}</button>
      <button className="detail-button" onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
    {viewer?<p>You have read-only access to saved audits.</p>:null}
    {error?<p role="alert" className="auth-error">{error}</p>:null}
    {scanId&&!report&&!error?<p role="status">Loading audit…</p>:null}
    {report?<><section className="audit-run-summary" aria-label="Audit summary">
      <h2>Audit summary</h2><dl><dt>Audit ID</dt><dd>{report.audit.ScanId}</dd><dt>Status</dt><dd>{report.audit.Status}</dd>
        <dt>Created</dt><dd>{date(report.audit.CreatedAtUtc)}</dd><dt>Started</dt><dd>{date(report.audit.StartedAtUtc)}</dd>
        <dt>Completed</dt><dd>{date(report.audit.CompletedAtUtc)}</dd></dl>
      {active?<p role="status">Collection is queued or running. You can leave this page and return later. Progress refreshes automatically.</p>:null}
      <ul>{report.collections.map(item=><li key={item.DataType}><strong>{item.DataType==='licenses'?'License summary':'User license assignments'}</strong>: {item.Status} · {item.RecordCount} records
        {item.ErrorCode?<p role="status">{reason[item.ErrorCode]??`Collection failed (${item.ErrorCode}).`} {item.RecordCount?'Saved rows are incomplete.':''}</p>:null}</li>)}</ul>
    </section><section aria-label="License evidence"><h2>Tenant licenses</h2>
      <div className="report-actions"><button className="detail-button" aria-pressed={dataType==='licenses'} onClick={()=>changeTab('licenses')}>License summary</button>
        <button className="detail-button" aria-pressed={dataType==='licenseAssignments'} onClick={()=>changeTab('licenseAssignments')}>Assigned users</button></div>
      <p>Products display their SKU when a friendly product name is unavailable. Assignment rows include direct, group, unknown, and error states; their count is not a unique-user total.</p>
      <label className="management-field">Search licenses or assignments<input type="search" maxLength={200} value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label>
      {skuId?<p>Filtered to SKU {skuId}. <button className="text-button" onClick={()=>{setSkuId('');setPage(1);}}>Clear license filter</button></p>:null}
      {loading?<p role="status">Loading saved evidence…</p>:null}
      {dataError?<p role="alert">{dataError}</p>:null}
      {evidence?<><p>{evidence.total} matching records. {collection?.Status!=='complete'?'Collection is incomplete; these rows are not a full inventory.':''}</p>
      <div className="audit-table-scroll"><table className="audit-evidence-table"><thead><tr>{dataType==='licenses'?<>
        <th>Product / SKU</th><th>Enabled units</th><th>Assigned units</th><th>Suspended / warning</th><th>Status</th><th>Applies to</th><th>Collected</th><th>Users</th>
      </>:<><th>User</th><th>Product / SKU</th><th>Assignment type</th><th>Group ID</th><th>State / error</th><th>Source updated</th><th>Collected</th></>}</tr></thead>
        <tbody>{evidence.rows.map(row=><tr key={row.SourceId??`${row.UserId}:${row.SkuId}:${row.AssignmentSource}`}>
          {dataType==='licenses'?<><td>{row.ProductName??row.SkuPartNumber??row.SkuId}<small>{row.SkuId}</small></td><td>{row.EnabledUnits??'—'}</td>
            <td>{row.ConsumedUnits??'—'}</td><td>{row.SuspendedUnits??'—'} / {row.WarningUnits??'—'}</td><td>{row.CapabilityStatus??'—'}</td><td>{row.AppliesTo??'—'}</td>
            <td>{date(row.CollectedAtUtc)}</td><td><button className="text-button" onClick={()=>{setDataType('licenseAssignments');setSkuId(row.SkuId);setPage(1);setSearch('');}}>View users</button></td></>:
          <><td>{row.Email??row.UserPrincipalName??row.UserId}<small>{row.DisplayName}</small></td><td>{row.ProductName??row.SkuPartNumber??row.SkuId}</td><td>{row.AssignmentType}</td>
            <td>{row.AssignmentType==='group'?row.AssignmentSource:'—'}</td><td>{row.AssignmentState??'Unknown'}{row.AssignmentError?` / ${row.AssignmentError}`:''}</td>
            <td>{date(row.SourceUpdatedAtUtc)}</td><td>{date(row.CollectedAtUtc)}</td></>}
        </tr>)}</tbody></table></div>
        {!evidence.rows.length?<p>{collection?.Status==='complete'?'No matching records in this snapshot.':'No matching evidence has been saved yet.'}</p>:null}
        <div className="report-actions"><button className="detail-button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span>
          <button className="detail-button" disabled={page*evidence.pageSize>=evidence.total} onClick={()=>setPage(p=>p+1)}>Next</button></div></>:null}
    </section></>:null}
    <section className="scan-history"><h2>Audit history</h2><p>{history.length} recent runs shown, including earlier scans.</p>
      <div>{history.map(item=><a href={`/${item.auditScope==='licensing'?'audit-data':'reports'}/${encodeURIComponent(item.scanId)}`} key={item.scanId}><span>{date(item.createdAt)}</span><small>{item.status}</small></a>)}</div>
    </section>
  </section></main>;
}
