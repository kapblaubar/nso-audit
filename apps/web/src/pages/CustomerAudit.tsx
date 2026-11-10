import {useEffect,useState} from 'react';
import type {EmailAuditAccount} from '../auth';
import {loadTenantBootstrap,type TenantBootstrap} from '../api';
import {ReportPage} from './ReportPage';
import {OnboardingPage} from './OnboardingPage';
import {DataAuditPage} from './DataAuditPage';
export function CustomerAudit({account,onSignOut,onBack}:{account:EmailAuditAccount;onSignOut:()=>void;onBack:()=>void}){
  const [bootstrap,setBootstrap]=useState<TenantBootstrap>(),[error,setError]=useState('');
  useEffect(()=>{let cancelled=false;void loadTenantBootstrap(account).then(result=>{
    if(cancelled)return;
    if(!/^\/(audit-data|reports)(\/|$)/.test(window.location.pathname)&&window.location.pathname!=='/onboarding')window.history.replaceState({},'','/audit-data');
    setBootstrap(result);
  }).catch(()=>{if(!cancelled)setError('This workspace could not be opened. Your access may have changed.');});return()=>{cancelled=true;};},[account.organizationId]);
  if(bootstrap&&/^\/audit-data(?:\/[^/]+(?:\/licenses)?)?$/.test(window.location.pathname)){
    const id=window.location.pathname.split('/')[2];
    return <><button className="text-button" onClick={onBack}>Your workspaces</button><DataAuditPage account={account} onSignOut={onSignOut} {...(id?{scanId:id}:{})}/></>;
  }
  return <><div className="customer-workspace-back"><button className="text-button" onClick={onBack}>Your workspaces</button></div>{error?<main className="route-loading"><p role="alert">{error}</p></main>:!bootstrap?<main className="route-loading">Loading workspace?</main>:window.location.pathname.startsWith('/reports/')?<ReportPage account={account} bootstrap={bootstrap} scanId={window.location.pathname.match(/^\/reports\/([^/]+)$/)?.[1]??''} onSignOut={onSignOut}/>:<OnboardingPage account={account} bootstrap={bootstrap} onSignOut={onSignOut}/>}</>;
}
