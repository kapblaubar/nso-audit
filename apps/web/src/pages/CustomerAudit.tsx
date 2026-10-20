import {useEffect,useState} from 'react';
import type {EmailAuditAccount} from '../auth';
import {loadTenantBootstrap,type TenantBootstrap} from '../api';
import {ReportPage} from './ReportPage';
import {OnboardingPage} from './OnboardingPage';
export function CustomerAudit({account,onSignOut,onBack}:{account:EmailAuditAccount;onSignOut:()=>void;onBack:()=>void}){
  const [bootstrap,setBootstrap]=useState<TenantBootstrap>(),[error,setError]=useState('');
  useEffect(()=>{let cancelled=false;void loadTenantBootstrap(account).then(result=>{if(!cancelled)setBootstrap(result);}).catch(()=>{if(!cancelled)setError('This workspace could not be opened. Your access may have changed.');});return()=>{cancelled=true;};},[account.organizationId]);
  return <><div className="customer-workspace-back"><button className="text-button" onClick={onBack}>? Your workspaces</button></div>{error?<main className="route-loading"><p role="alert">{error}</p></main>:!bootstrap?<main className="route-loading">Loading workspace?</main>:bootstrap.latestScan&&bootstrap.destination==='report'?<ReportPage account={account} bootstrap={bootstrap} scanId={window.location.pathname.match(/^\/reports\/([^/]+)$/)?.[1]??bootstrap.latestScan.scanId} onSignOut={onSignOut}/>:<OnboardingPage account={account} bootstrap={bootstrap} onSignOut={onSignOut}/>}</>;
}
