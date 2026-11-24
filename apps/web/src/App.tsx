import { useEffect, useMemo, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { initializeAuth, signOut } from "./auth";
import { loadPortalWorkspaces, loadTenantBootstrap, type TenantBootstrap } from "./api";
import {PortalAccountHeader,PortalWorkspaceSelectors,WorkspaceSelectionContext,type PortalWorkspace} from './components/PortalAccountHeader';
import {ThemeToggle} from './components/ThemeToggle';
import { LandingPage } from "./pages/LandingPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ReportPage } from "./pages/ReportPage";
import {CustomerEntry} from "./pages/CustomerEntry";
import {InvitationPage} from './pages/InvitationPage';
import {ManagementPage} from './pages/ManagementPage';
import {DataAuditPage} from './pages/DataAuditPage';
import {rememberAuditDestination} from './auditNavigation';

export function App() {
  rememberAuditDestination();
  if(window.location.pathname==='/account/invitation')return <InvitationPage/>;
  if(window.location.pathname==='/management'||window.location.pathname.startsWith('/management/')){
    window.history.replaceState({},'',`/clientmanagement${window.location.search}${window.location.hash}`);
  }
  const management=window.location.pathname==='/clientmanagement'||window.location.pathname.startsWith('/clientmanagement/')||
    (window.location.pathname==='/auth/callback'&&sessionStorage.getItem('nso.managementLogin')==='1');
  if(management)return <ManagementPage/>;
  if(window.location.pathname==='/signin'||window.location.pathname.startsWith('/account')||(sessionStorage.getItem('nso.customerSession')&&['/','/audit','/onboarding'].includes(window.location.pathname))||(sessionStorage.getItem('nso.customerSession')&&/^\/(reports|scans|audit-data)(\/|$)/.test(window.location.pathname)))return <CustomerEntry/>;
  return <LegacyApp/>;
}

function LegacyApp() {
  const [account, setAccount] = useState<AccountInfo>();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string>();
  const [bootstrap, setBootstrap] = useState<TenantBootstrap>();
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string>();
  const [directory,setDirectory]=useState<Awaited<ReturnType<typeof loadPortalWorkspaces>>>();
  const [directoryError,setDirectoryError]=useState('');
  const [selection,setSelection]=useState<PortalWorkspace>();
  const scopedAccount=useMemo(()=>{
    if(!account||!directory)return undefined;
    if(!directory.role)return account;
    if(!selection)return undefined;
    return {entraAccount:account,username:account.username,...(account.name?{name:account.name}:{}),kind:'partner' as const,role:directory.role,
      organizationId:selection.organizationId,tenantId:selection.tenantId};
  },[account,directory,selection]);

  useEffect(() => {
    void initializeAuth().then((state) => {
      setAccount(state.account);
      setAuthError(state.error);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!account) return;
    let active=true;
    void loadPortalWorkspaces(account).then(result=>{
      if(!active)return;
      const last=sessionStorage.getItem(`nso.partnerWorkspace.${account.homeAccountId}`);
      setSelection(result.workspaces.find(item=>item.tenantId===last)??(result.workspaces.length===1?result.workspaces[0]:undefined));
      setDirectory(result);
    }).catch(cause=>{if(active)setDirectoryError(cause instanceof Error?cause.message:'Assigned workspaces could not be loaded.');});
    return()=>{active=false;};
  },[account]);

  useEffect(() => {
    if (!scopedAccount) return;
    let active=true;
    const partner='kind' in scopedAccount;
    if(partner&&!window.location.pathname.startsWith('/reports/')&&!window.location.pathname.startsWith('/audit-data')){
      window.history.replaceState({},'','/audit-data');
    }
    if(partner&&window.location.pathname.startsWith('/audit-data'))return;
    setBootstrapLoading(true);
    setBootstrapError(undefined);
    void loadTenantBootstrap(scopedAccount)
      .then((result) => {
        if(!active)return;
        setBootstrap(result);
        const destination = result.registered ? '/audit-data' : '/onboarding';
        if (!window.location.pathname.startsWith('/reports/')&&!window.location.pathname.startsWith('/audit-data')&&window.location.pathname!=='/onboarding') window.history.replaceState({}, '', destination);
      })
      .catch((error: unknown) => {
        if(!active)return;
        setBootstrapError(error instanceof Error ? error.message : "Tenant setup could not be loaded.");
        window.history.replaceState({}, "", "/onboarding");
      })
      .finally(() => {if(active)setBootstrapLoading(false);});
    return()=>{active=false;};
  }, [scopedAccount]);

  const beginSignIn = () => {
    setAuthError(undefined);
    window.location.assign("/signin");
  };

  const beginSignOut = () => {
    void signOut().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Microsoft sign-out failed."));
  };

  if (!authReady || (account && bootstrapLoading && !bootstrap)) {
    return <main className="route-loading"><span>{account ? "Loading your tenant workspace…" : "Preparing NSO Audit…"}</span></main>;
  }

  if (!account) {
    return <LandingPage authReady={authReady} {...(authError ? { authError } : {})} onSignIn={beginSignIn} />;
  }

  const select=(workspace:PortalWorkspace)=>{
    sessionStorage.setItem(`nso.partnerWorkspace.${account.homeAccountId}`,workspace.tenantId);
    window.history.replaceState({},'','/audit-data');
    setBootstrap(undefined);
    setBootstrapLoading(false);
    setSelection(workspace);
  };
  const workspaceContext=directory?.role?{workspaces:directory.workspaces,active:selection,select}:undefined;
  if(!scopedAccount)return <WorkspaceSelectionContext.Provider value={workspaceContext}>
    <main className="report-page"><nav className="nav"><a className="brand" href="/">NSO Audit</a>
      <div className="nav-actions"><PortalAccountHeader username={account.username} {...(directory?.role?{role:directory.role}:{})}/><ThemeToggle/><button className="text-button" onClick={beginSignOut}>Sign out</button></div>
    </nav><section className="report-shell"><h1>Client workspaces</h1><PortalWorkspaceSelectors/>
      {directoryError?<p role="alert">{directoryError}</p>:!directory?<p role="status">Loading assigned clients…</p>:!directory.workspaces.length?<p>No client tenants are assigned to this account.</p>:null}
    </section></main>
  </WorkspaceSelectionContext.Provider>;
  const scopedKey='kind' in scopedAccount?`${scopedAccount.organizationId}:${scopedAccount.tenantId}`:scopedAccount.tenantId;
  if(/^\/audit-data(?:\/[^/]+(?:\/(?:licenses|recommendations|directory-access))?)?$/.test(window.location.pathname)){
    const id=window.location.pathname.split('/')[2];
    return <WorkspaceSelectionContext.Provider value={workspaceContext}><DataAuditPage key={scopedKey} account={scopedAccount} onSignOut={beginSignOut} {...(id&&id!=='compare'?{scanId:id}:{})}/></WorkspaceSelectionContext.Provider>;
  }

  if (window.location.pathname.startsWith('/reports/') && bootstrap?.latestScan) {
    const requestedScanId = window.location.pathname.match(/^\/reports\/([^/]+)$/)?.[1];
    return <WorkspaceSelectionContext.Provider value={workspaceContext}><ReportPage key={scopedKey} account={scopedAccount} bootstrap={bootstrap} scanId={requestedScanId ? decodeURIComponent(requestedScanId) : bootstrap.latestScan.scanId} onSignOut={beginSignOut} /></WorkspaceSelectionContext.Provider>;
  }

  if('kind' in scopedAccount)return <WorkspaceSelectionContext.Provider value={workspaceContext}><DataAuditPage key={scopedKey} account={scopedAccount} onSignOut={beginSignOut}/></WorkspaceSelectionContext.Provider>;
  return <OnboardingPage account={scopedAccount} {...(bootstrap ? { bootstrap } : {})} {...(bootstrapError ? { bootstrapError } : {})} onSignOut={beginSignOut} />;
}
