import {useEffect,useState} from 'react';
import type {ComparedRecord} from '../../../api/src/compareApp/compareEvidence';
import {loadComparePair,loadComparison,type DataAudit,type ScanHistoryItem} from '../api';
import type {AuditAccount} from '../auth';

const PAGE_SIZE=25;
const ALL_DATASETS='*';
const date=(value:string)=>new Date(value).toLocaleString();
const auditLabel=(audit:ScanHistoryItem)=>`${date(audit.createdAt)} · ${audit.auditScope==='tenant'?'Tenant':'Licensing'} · ${audit.status} · ${audit.scanId.slice(-8)}`;
const formatValue=(value:unknown)=>value===undefined?'—':JSON.stringify(value,null,2);

function ComparisonRecord({record,onlyDifferences}:{record:ComparedRecord;onlyDifferences:boolean}){
  const changed=record.status!=='Unchanged';
  return <article className={`audit-compare-record${changed?' audit-compare-changed':''}`}>
    <h3>{record.label} <small>{record.status}</small></h3>
    {record.changes.length>0&&<div className="audit-table-scroll">
      <table className="audit-evidence-table"><thead><tr><th scope="col">Field</th><th scope="col">Baseline</th><th scope="col">Comparison</th></tr></thead>
        <tbody>{record.changes.map(change=><tr key={change.path}><th scope="row">{change.path}</th>
          <td><pre>{formatValue(change.before)}</pre></td><td className="audit-compare-value-changed"><pre>{formatValue(change.after)}</pre></td></tr>)}</tbody>
      </table>
    </div>}
    {(!onlyDifferences||record.status!=='Changed')&&<details open={record.status==='Added'||record.status==='Removed'||undefined}><summary>{record.status==='Added'?'Comparison evidence':record.status==='Removed'?'Baseline evidence':'Saved evidence'}</summary>
      <div className="audit-compare-columns"><div><h4>Baseline</h4><pre>{formatValue(record.before)}</pre></div>
        <div className={record.status==='Added'?'audit-compare-value-changed':undefined}><h4>Comparison</h4><pre>{formatValue(record.after)}</pre></div></div>
    </details>}
  </article>;
}

function ComparisonRecords({records,onlyDifferences}:{records:ComparedRecord[];onlyDifferences:boolean}){
  const [page,setPage]=useState(1);
  const differences=records.filter(record=>record.status!=='Unchanged');
  const visible=onlyDifferences?differences:records;
  return <>
    <p role="status">{differences.length} {differences.length===1?'difference':'differences'} across {records.length} saved records.</p>
    {visible.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(record=>
      <ComparisonRecord key={record.id} record={record} onlyDifferences={onlyDifferences}/>)}
    {visible.length===0&&<p>{records.length===0?'Both collections are empty.':'No differences found in this dataset.'}</p>}
    {visible.length>PAGE_SIZE&&<div className="report-actions">
      <button className="detail-button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>Previous</button>
      <span>Page {page} of {Math.ceil(visible.length/PAGE_SIZE)}</span>
      <button className="detail-button" disabled={page*PAGE_SIZE>=visible.length} onClick={()=>setPage(value=>value+1)}>Next</button>
    </div>}
  </>;
}

export function AuditCompare({account,history,anchorId,loadingHistory}:{account:AuditAccount;history:ScanHistoryItem[];anchorId?:string;loadingHistory:boolean}){
  const eligible=history.filter(row=>row.auditScope&&['complete','partial','failed'].includes(row.status));
  const [baselineChoice,setBaseline]=useState<string>(),[comparisonChoice,setComparison]=useState<string>();
  const comparisonId=comparisonChoice??eligible.find(row=>row.scanId===anchorId)?.scanId??eligible[0]?.scanId??'';
  const baselineId=baselineChoice??eligible.find(row=>row.scanId!==comparisonId)?.scanId??'';
  const [datasetChoice,setDataset]=useState(ALL_DATASETS);
  const [onlyDifferences,setOnlyDifferences]=useState(false);
  const [loadedPair,setReports]=useState<{key:string;reports:[DataAudit,DataAudit]}>();
  const [results,setResults]=useState<Record<string,{records:ComparedRecord[];error?:string}>>({});
  const [pairError,setPairError]=useState('');
  const validPair=!!baselineId&&!!comparisonId&&baselineId!==comparisonId;
  const pairKey=JSON.stringify([baselineId,comparisonId]);
  const reports=loadedPair?.key===pairKey?loadedPair.reports:undefined;

  useEffect(()=>{
    setReports(undefined);setPairError('');setDataset(ALL_DATASETS);
    if(!validPair)return;
    const controller=new AbortController();
    void loadComparePair(account,baselineId,comparisonId,controller.signal)
      .then(reports=>{if(!controller.signal.aborted)setReports({key:pairKey,reports});})
      .catch(err=>{if(!controller.signal.aborted)setPairError(err instanceof Error?err.message:'Audit details could not be loaded.');});
    return()=>controller.abort();
  },[account,baselineId,comparisonId,validPair]);

  const baselineCollections=reports?.[0].collections??[],comparisonCollections=reports?.[1].collections??[];
  const datasets=new Map([...baselineCollections,...comparisonCollections].map(item=>[item.DataType,item.Label??item.DataType]));
  const baselineStatus=(type:string)=>baselineCollections.find(item=>item.DataType===type)?.Status;
  const comparisonStatus=(type:string)=>comparisonCollections.find(item=>item.DataType===type)?.Status;
  const dataset=datasetChoice;
  const comparable=(type:string)=>baselineStatus(type)==='complete'&&comparisonStatus(type)==='complete';

  useEffect(()=>{
    setResults({});
    if(!reports)return;
    const controller=new AbortController(),{signal}=controller;
    const complete=reports[0].collections.filter(item=>item.Status==='complete'&&reports[1].collections.some(
      other=>other.DataType===item.DataType&&other.Status==='complete')&&(dataset===ALL_DATASETS||dataset===item.DataType));
    void (async()=>{
      for(const {DataType:type} of complete){
        try{
          const {records}=await loadComparison(account,baselineId,comparisonId,type,signal);
          if(signal.aborted)return;
          setResults(items=>({...items,[type]:{records}}));
        }catch(err){
          if(signal.aborted)return;
          const error=err instanceof Error?err.message:'Saved evidence could not be compared.';
          setResults(items=>({...items,[type]:{records:[],error}}));
        }
      }
    })();
    return()=>controller.abort();
  },[account,baselineId,comparisonId,dataset,reports]);

  const selectedDatasets=[...datasets].filter(([type])=>dataset===ALL_DATASETS||type===dataset);
  const options=eligible.map(audit=><option key={audit.scanId} value={audit.scanId}>{auditLabel(audit)}</option>);
  return <section className="audit-compare" aria-label="Saved audit comparison">
    {loadingHistory?<p role="status">Loading audit history…</p>:eligible.length<2?<p>Two finished tenant or licensing audits are required for comparison.</p>:<>
      <div className="audit-compare-columns">
        <label className="management-field">Baseline audit<select value={baselineId} onChange={event=>setBaseline(event.target.value)}>{options}</select></label>
        <label className="management-field">Comparison audit<select value={comparisonId} onChange={event=>setComparison(event.target.value)}>{options}</select></label>
      </div>
      {!validPair?<p>Select two different audits.</p>:pairError?<p role="alert">{pairError}</p>:!reports?<p role="status">Loading audit details…</p>:datasets.size===0?<p>These audits have no saved datasets.</p>:<>
        <div className="report-actions audit-compare-actions">
          <label className="management-field">Dataset<select aria-label="Dataset" value={dataset} onChange={event=>setDataset(event.target.value)}>
            <option value={ALL_DATASETS}>All datasets</option>
            {[...datasets].map(([type,label])=><option key={type} value={type}>{label}</option>)}
          </select></label>
          <button className="detail-button" type="button" aria-pressed={onlyDifferences}
            onClick={()=>setOnlyDifferences(value=>!value)}>Difference Only</button>
        </div>
        {selectedDatasets.map(([type,label])=>{
          const result=results[type];
          return <section key={type} aria-label={label}>
            <h2>{label}</h2>
            {!comparable(type)?<p role="status">Comparison requires a completed dataset in both audits. Baseline: {baselineStatus(type)??'not collected'}. Comparison: {comparisonStatus(type)??'not collected'}.</p>:
              !result?<p role="status">Comparing saved evidence…</p>:result.error?<p role="alert">{result.error}</p>:
                <ComparisonRecords key={String(onlyDifferences)} records={result.records} onlyDifferences={onlyDifferences}/>}
          </section>;
        })}
      </>}
    </>}
  </section>;
}
