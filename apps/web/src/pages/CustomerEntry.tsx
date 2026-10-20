import {useEffect,useState,type FormEvent} from 'react';
import {signIn,initializeAuth} from '../auth';
import {appConfig} from '../config';
import {CustomerAudit} from './CustomerAudit';
import {ThemeToggle} from '../components/ThemeToggle';

type Mode='login'|'register'|'forgot'|'resend'|'verify'|'reset';
interface CustomerSession{user:{id:string;email:string;name:string};workspaces:{id:string;name:string;role:string;tenantId?:string|null}[]}
const storageKey='nso.customerSession';
export function CustomerEntry(){
  const initial:Mode=window.location.pathname==='/account/reset'?'reset':window.location.pathname==='/account/verify'?'verify':'login';
  const [activeOrg,setActiveOrg]=useState(()=>window.location.pathname!=='/signin'&&window.location.pathname!=='/account'?sessionStorage.getItem('nso.customerWorkspace')??'':'');
  const [mode,setMode]=useState<Mode>(initial),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')??'');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[session,setSession]=useState<CustomerSession>(),[ready,setReady]=useState(false);
  async function call<T>(action:string,body?:object,sessionToken?:string):Promise<T>{
    if(!appConfig.apiBaseUrl)throw new Error('Account service is not configured.');
    const response=await fetch(`${appConfig.apiBaseUrl}/account/${action}`,{method:action==='session'?'GET':'POST',headers:{'Content-Type':'application/json',...(sessionToken?{Authorization:`Bearer ${sessionToken}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json() as T&{error?:string};
    if(!response.ok)throw new Error(result.error??'Account request failed.');
    return result;
  }
  useEffect(()=>{
    // Links keep secrets out of server access logs; remove the fragment after capturing it.
    if(window.location.hash)window.history.replaceState({},'',window.location.pathname);
    let cancelled=false;
    const existing=sessionStorage.getItem(storageKey);
    if(existing&&initial==='login')void call<CustomerSession>('session',undefined,existing).then(result=>{if(!cancelled){setSession(result);window.history.replaceState({},'','/account');}})
      .catch(()=>sessionStorage.removeItem(storageKey)).finally(()=>{if(!cancelled)setReady(true);});
    else setReady(true);
    return()=>{cancelled=true;};
  },[]);
  function change(next:Mode){setMode(next);setError('');setNotice('');setPassword('');window.history.replaceState({},'','/signin');}
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const result=await call<{message?:string;token?:string}>(mode,{name,email,password,...(mode==='verify'||mode==='reset'?{token}:{})});
      setPassword('');
      if(result.token){
        sessionStorage.setItem(storageKey,result.token);
        setSession(await call<CustomerSession>('session',undefined,result.token));
        window.history.replaceState({},'','/account');
      }else{setNotice(result.message??'Request completed.');if(mode==='reset'||mode==='verify'){setMode('login');window.history.replaceState({},'','/signin');}}
    }catch(cause){setError(cause instanceof Error?cause.message:'Account request failed.');}
    finally{setBusy(false);}
  }
  async function microsoft(){setBusy(true);setError('');try{await initializeAuth();await signIn();}catch(cause){setError(cause instanceof Error?cause.message:'Microsoft sign-in failed.');setBusy(false);}}
  async function logout(){setBusy(true);setError('');try{await call('logout',{},sessionStorage.getItem(storageKey)??'');sessionStorage.removeItem(storageKey);setSession(undefined);setActiveOrg('');sessionStorage.removeItem('nso.customerWorkspace');change('login');}catch{setError('Could not sign out. Please try again.');}finally{setBusy(false);}}
  const title={login:'Sign in to NSO Audit',register:'Create your account',forgot:'Reset your password',resend:'Verify your email',verify:'Confirm your email',reset:'Choose a new password'}[mode];
  const workspace=session?.workspaces.find(item=>item.id===activeOrg);
  if(session&&workspace?.tenantId)return <CustomerAudit account={{kind:'email',organizationId:workspace.id,tenantId:workspace.tenantId,name:session.user.name,username:session.user.email,role:workspace.role}} onSignOut={()=>void logout()} onBack={()=>{setActiveOrg('');window.history.replaceState({},'','/account');}}/>;
  if(!ready)return <main className="route-loading">Loading your account?</main>;
  return <main className="customer-entry"><nav className="nav"><a className="brand" href="/"><img className="brand-mark" src="/brand/nsosquare.png" width="40" height="40" alt=""/><span className="brand-name">NSO Audit</span></a><div className="nav-actions"><ThemeToggle/>{session?<button className="text-button" onClick={()=>void logout()} disabled={busy}>Sign out</button>:null}</div></nav>
    <section className="customer-entry-card">
      <p className="eyebrow">Customer portal</p>
      <h1>{session?`Welcome, ${session.user.name}`:title}</h1>
      {error?<p className="management-error" role="alert">{error}</p>:null}
      {notice?<p className="management-success" role="status">{notice}</p>:null}
      {session?<><p>Signed in as {session.user.email}</p><h2>Your workspaces</h2>{session.workspaces.length?<ul className="customer-workspaces">{session.workspaces.map(workspace=><li key={workspace.id}><strong>{workspace.name}</strong><span>{workspace.role}</span>{workspace.tenantId?<button className="management-secondary" onClick={()=>{sessionStorage.setItem('nso.customerWorkspace',workspace.id);setActiveOrg(workspace.id);window.history.replaceState({},'','/account/workspace');}}>Open workspace</button>:<span>Microsoft connection pending</span>}</li>)}</ul>:<p>Your email is verified. Your workspace will appear here after NewSommer approves your access.</p>}<p className="management-help">Your portal account does not grant Microsoft assessment permissions. Microsoft connections are authorized separately by your organization?s administrator.</p></>:<>
        {mode==='login'?<><p>Use your Microsoft work account or your NSO Audit email and password.</p><button className="management-primary customer-microsoft" onClick={()=>void microsoft()} disabled={busy}>Continue with Microsoft</button><div className="customer-divider">or sign in with email</div></>:null}
        {mode==='register'?<p>Use any email address and create a separate NSO Audit password. We?ll email you a verification link.</p>:null}
        {mode==='forgot'||mode==='resend'?<p>Enter your email address to request a new link.</p>:null}
        {mode==='verify'?<p>Confirm this address to finish verifying your NSO Audit account.</p>:null}
        <form onSubmit={event=>void submit(event)}>
          <fieldset disabled={busy}>
          {mode==='register'?<label className="management-field"><span>Your name</span><input value={name} onChange={event=>setName(event.target.value)} autoComplete="name" maxLength={150} required/></label>:null}
          {mode!=='verify'&&mode!=='reset'?<label className="management-field"><span>Email address</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" maxLength={254} required/></label>:null}
          {mode==='login'||mode==='register'||mode==='reset'?<label className="management-field"><span>{mode==='reset'?'New password':'Password'}</span><input type="password" aria-label={mode==='reset'?'New password':'Password'} value={password} onChange={event=>setPassword(event.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:15} maxLength={128} pattern={mode==='login'?undefined:String.raw`(?=.*\p{Lu})(?=.*\p{Ll})(?=.*[0-9])(?=.*[\p{P}\p{S}]).{15,128}`} title={mode==='login'?undefined:'Use 15 to 128 characters with an uppercase letter, a lowercase letter, a number and a special character.'} required/>{mode!=='login'?<small>15 to 128 characters, including an uppercase letter, a lowercase letter, a number and a special character.</small>:null}</label>:null}
          <button className="management-primary customer-submit" type="submit">{busy?'Please wait?':{login:'Sign in with email',register:'Create account',forgot:'Send reset link',resend:'Send verification link',verify:'Verify email',reset:'Save new password'}[mode]}</button>
          </fieldset>
        </form>
        <div className="customer-entry-links">{mode==='login'?<><button className="text-button" onClick={()=>change('register')} disabled={busy}>Create account</button><button className="text-button" onClick={()=>change('forgot')} disabled={busy}>Forgot password?</button><button className="text-button" onClick={()=>change('resend')} disabled={busy}>Resend verification email</button></>:<button className="text-button" onClick={()=>change('login')} disabled={busy}>Back to sign in</button>}</div>
      </>}
    </section>
  </main>;
}
