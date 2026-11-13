import {useEffect,useState} from 'react';
import type {AuditAccount} from '../auth';
import {loadLicenseEvidence,type DataAudit,type LicenseEvidenceRow} from '../api';
import {sourceRecord} from './AuditPolicyDetails';
import {RecommendationDetails} from './FindingDetailsModal';

const tabs=[['secure','Secure Score'],['exposure','Exposure Score'],['devices','Secure Score for Devices'],['defender','Defender for Cloud']] as const;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function Recommendations({account,report,refresh}:{account:AuditAccount;report:DataAudit;refresh:number}){
  const requested=new URLSearchParams(window.location.search).get('source');
  const [tab,setTab]=useState(tabs.some(([id])=>id===requested)?requested!:'secure');
  const [datasets,setDatasets]=useState<Record<string,LicenseEvidenceRow[]>>({});
  const [error,setError]=useState(''),[loading,setLoading]=useState(false);
  const types=tab==='secure'?['secureScores','secureScoreProfiles']:tab==='defender'?['defenderRecommendations','defenderMetadata']:[];
  const typeKey=types.join(','),progress=JSON.stringify(report.collections);
  useEffect(()=>{
    let cancelled=false;setDatasets({});setError('');setLoading(true);
    void Promise.all(types.map(async type=>{
      if(!report.collections.some(c=>c.DataType===type))return [type,[]] as const;
      const rows:LicenseEvidenceRow[]=[];
      for(let page=1;!cancelled;page++){
        const result=await loadLicenseEvidence(account,report.audit.ScanId,type,page,'','');
        rows.push(...result.rows);if(page*result.pageSize>=result.total)break;
      }
      return [type,rows] as const;
    })).then(entries=>{if(!cancelled)setDatasets(Object.fromEntries(entries));})
      .catch(()=>{if(!cancelled)setError('Saved recommendations could not be loaded. Use Refresh to try again.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[account,report.audit.ScanId,typeKey,progress,refresh]);
  const profiles=new Map((datasets.secureScoreProfiles??[]).map(row=>{const source=sourceRecord(row);return [String(source.id??row.SourceId),source];}));
  const latest=(datasets.secureScores??[]).map(sourceRecord).sort((a,b)=>String(b.createdDateTime??'').localeCompare(String(a.createdDateTime??'')))[0];
  const controls=Array.isArray(latest?.controlScores)?latest.controlScores.map(object):[];
  const secure=controls.map(control=>{
    const id=String(control.controlName??''),profile=profiles.get(id),percentage=Number(control.scoreInPercentage??100);
    return {id,title:profile?.title??id,category:control.controlCategory??profile?.controlCategory,service:profile?.service,implementationCost:profile?.implementationCost,userImpact:profile?.userImpact,threats:profile?.threats,remediation:profile?.remediation,actionUrl:profile?.actionUrl,scorePercentage:percentage,potentialGain:Math.round(Number(profile?.maxScore??0)*(100-percentage))/100};
  }).filter(item=>item.potentialGain>0).sort((a,b)=>b.potentialGain-a.potentialGain);
  const metadata=new Map((datasets.defenderMetadata??[]).map(row=>{const source=sourceRecord(row);return [String(source.name??row.SourceId).split('/').pop(),object(source.properties)];}));
  const grouped=new Map<string,Record<string,unknown>>();
  for(const row of datasets.defenderRecommendations??[]){
    const source=sourceRecord(row),properties=object(source.properties),status=object(properties.status);
    if(String(status.code).toLowerCase()!=='unhealthy')continue;
    const id=String(source.name??row.SourceId).split('/').pop()!,definition=metadata.get(id)??object(properties.metadata);
    const resource=object(properties.resourceDetails),affected=String(resource.Id??resource.id??source.id??row.SourceId);
    const existing=grouped.get(id);
    if(existing){(existing.affectedResources as string[]).push(affected);existing.affectedResourceCount=Number(existing.affectedResourceCount)+1;}
    else grouped.set(id,{id,title:properties.displayName??definition.displayName??id,severity:definition.severity??'Unknown',status:status.code,causes:[status.cause??status.description].filter(Boolean),affectedResourceCount:1,affectedResources:[affected],remediation:definition.remediationDescription??properties.description,actionUrl:object(properties.links).azurePortal});
  }
  const severity:Record<string,number>={high:0,medium:1,low:2};
  const defender=Array.from(grouped.values()).sort((a,b)=>(severity[String(a.severity).toLowerCase()]??3)-(severity[String(b.severity).toLowerCase()]??3));
  const recommendations=tab==='secure'?secure:defender;
  const complete=types.length>0&&types.every(type=>report.collections.find(c=>c.DataType===type)?.Status==='complete');
  const select=(id:string)=>{setTab(id);const params=new URLSearchParams(window.location.search);params.set('source',id);window.history.replaceState({},'',`${window.location.pathname}?${params}`);};
  return <section className="tenant-recommendations" aria-labelledby="tenant-recommendations-title"><p className="eyebrow">Prioritized actions</p><h2 id="tenant-recommendations-title">Tenant recommendations</h2>
    <nav className="audit-provider-tabs" aria-label="Recommendation sources">{tabs.map(([id,label])=><button type="button" key={id} className="detail-button" aria-pressed={tab===id} onClick={()=>select(id)}>{label}</button>)}</nav>
    <div aria-live="polite">{!types.length?<section className="audit-provider-empty"><h3>{tabs.find(([id])=>id===tab)?.[1]}</h3><p>This source is not collected yet. No recommendations from this source are available in saved audits.</p></section>:<>
      {types.map(type=>{const collection=report.collections.find(c=>c.DataType===type);return <p key={type}>{collection?.Label??type}: {collection?.Status??'Not collected in this audit'}{collection?.CompletedAtUtc?` · Collected ${new Date(collection.CompletedAtUtc).toLocaleString()}`:''}{collection?.ErrorCode?` · ${collection.ErrorCode}`:''}</p>;})}
      {!complete?<p role="status">Collection is incomplete or unavailable. Saved recommendations may be incomplete.</p>:null}
      {loading?<p role="status">Loading saved recommendations…</p>:error?<p role="alert">{error}</p>:recommendations.length?<><p>{recommendations.length} outstanding recommendations from this audit, ordered by {tab==='secure'?'potential points gained':'severity'}.</p><RecommendationDetails evidence={{recommendations}} defender={tab==='defender'}/></>:<p>{complete?'No outstanding recommendations returned in this snapshot.':'No recommendation evidence is available from the saved records yet.'}</p>}
    </>}</div>
  </section>;
}
