import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { initializeAuth, signOut } from "./auth";
import { loadTenantBootstrap, type TenantBootstrap } from "./api";
import { LandingPage } from "./pages/LandingPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ReportPage } from "./pages/ReportPage";
import {CustomerEntry} from "./pages/CustomerEntry";
import {ManagementPage} from './pages/ManagementPage';

export function App() {
  if(window.location.pathname==='/management'||window.location.pathname.startsWith('/management/')){
    window.history.replaceState({},'',`/clientmanagement${window.location.search}${window.location.hash}`);
  }
  const management=window.location.pathname==='/clientmanagement'||window.location.pathname.startsWith('/clientmanagement/')||
    (window.location.pathname==='/auth/callback'&&sessionStorage.getItem('nso.managementLogin')==='1');
  if(management)return <ManagementPage/>;
  if(window.location.pathname==='/signin'||window.location.pathname.startsWith('/account')||(sessionStorage.getItem('nso.customerSession')&&['/','/audit','/onboarding'].includes(window.location.pathname))||(sessionStorage.getItem('nso.customerSession')&&/^\/(reports|scans)\//.test(window.location.pathname)))return <CustomerEntry/>;
  return <LegacyApp/>;
}

function LegacyApp() {
  const [account, setAccount] = useState<AccountInfo>();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string>();
  const [bootstrap, setBootstrap] = useState<TenantBootstrap>();
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string>();

  useEffect(() => {
    void initializeAuth().then((state) => {
      setAccount(state.account);
      setAuthError(state.error);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!account) return;
    setBootstrapLoading(true);
    setBootstrapError(undefined);
    void loadTenantBootstrap(account)
      .then((result) => {
        setBootstrap(result);
        const destination = result.destination === "report" && result.latestScan
          ? `/reports/${encodeURIComponent(result.latestScan.scanId)}`
          : result.destination === "scan" && result.latestScan
            ? `/scans/${encodeURIComponent(result.latestScan.scanId)}`
            : "/onboarding";
        if (!window.location.pathname.startsWith("/reports/")) window.history.replaceState({}, "", destination);
      })
      .catch((error: unknown) => {
        setBootstrapError(error instanceof Error ? error.message : "Tenant setup could not be loaded.");
        window.history.replaceState({}, "", "/onboarding");
      })
      .finally(() => setBootstrapLoading(false));
  }, [account]);

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

  if (bootstrap?.destination === "report" && bootstrap.latestScan) {
    const requestedScanId = window.location.pathname.match(/^\/reports\/([^/]+)$/)?.[1];
    return <ReportPage account={account} bootstrap={bootstrap} scanId={requestedScanId ? decodeURIComponent(requestedScanId) : bootstrap.latestScan.scanId} onSignOut={beginSignOut} />;
  }

  return <OnboardingPage account={account} {...(bootstrap ? { bootstrap } : {})} {...(bootstrapError ? { bootstrapError } : {})} onSignOut={beginSignOut} />;
}
