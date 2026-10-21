import {useEffect,useState,type FormEvent} from 'react';
import {appConfig} from '../config';
interface Invitation{email:string;name:string;company:string;role:string;needsPassword:boolean}
export function InvitationPage(){
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')??'');
  const [invitation,setInvitation]=useState<Invitation>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[accepted,setAccepted]=useState(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  async function call<T>(action:string,body:object,session?:string):Promise<T>{
    if(!appConfig.apiBaseUrl)throw new Error('Account service is not configured.');
    const response=await fetch(`${appConfig.apiBaseUrl}/account/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session}`}:{})},body:JSON.stringify(body),cache:'no-store'});
    const result=await response.json() as T&{error?:string};
    if(!response.ok)throw new Error(result.error??'Invitation could not be accepted.');
    return result;
  }
  useEffect(()=>{
    window.history.replaceState({},'',window.location.pathname);
    let cancelled=false;
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)){setError('This invitation is invalid or expired. Ask NewSommer to send a new one.');setReady(true);return;}
    void call<Invitation>('invitation',{token}).then(result=>{if(!cancelled)setInvitation(result);})
      .catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'Invitation could not be loaded.');})
      .finally(()=>{if(!cancelled)setReady(true);});
    return()=>{cancelled=true;};
  },[]);
  async function submit(event:FormEvent){
    event.preventDefault();if(!invitation||busy)return;
    if(invitation.needsPassword&&password!==confirmation){setError('The passwords do not match.');return;}
    setBusy(true);setError('');
    try{
      let session:string|undefined;
      if(!invitation.needsPassword)session=(await call<{token:string}>('login',{email:invitation.email,password})).token;
      await call('accept-invitation',{token,...(invitation.needsPassword?{password}:{})},session);
      setPassword('');setConfirmation('');setAccepted(true);
      if(session){sessionStorage.setItem('nso.customerSession',session);sessionStorage.removeItem('nso.customerWorkspace');window.location.assign('/account');}
    }catch(cause){setError(cause instanceof Error?cause.message:'Invitation could not be accepted.');}
    finally{setBusy(false);}
  }
  return <main className="customer-entry"><nav className="nav"><a className="brand" href="/"><img className="brand-mark" src="/brand/nsosquare.png" width="40" height="40" alt=""/><span className="brand-name">NSO Audit</span></a></nav>
    <section className="customer-entry-card"><p className="eyebrow">Workspace invitation</p>
      <h1>{accepted?'Invitation accepted':invitation?.needsPassword?'Set your password':'Accept your invitation'}</h1>
      {error?<p className="management-error" role="alert">{error}</p>:null}
      {!ready?<p role="status">Loading invitation...</p>:accepted?<><p role="status">Your email is verified and your workspace access is active.</p><a className="management-primary" href="/signin">Sign in to your workspace</a></>:invitation?<>
        <p>You have been invited to <strong>{invitation.company}</strong> as <strong>{invitation.role}</strong>.</p>
        <p>{invitation.needsPassword?'Choose your NSO Audit password to verify your email and accept access.':'Sign in with your existing NSO Audit password to accept. Your password will stay the same.'}</p>
        <form onSubmit={event=>void submit(event)}><fieldset disabled={busy}>
          <label className="management-field"><span>Email address</span><input type="email" value={invitation.email} readOnly autoComplete="username"/></label>
          <label className="management-field"><span>{invitation.needsPassword?'New password':'Password'}</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={invitation.needsPassword?15:1} maxLength={128} autoComplete={invitation.needsPassword?'new-password':'current-password'} pattern={invitation.needsPassword?String.raw`(?=.*\p{Lu})(?=.*\p{Ll})(?=.*[0-9])(?=.*[\p{P}\p{S}]).{15,128}`:undefined}/></label>
          {invitation.needsPassword?<><p className="management-help">15 to 128 characters, including an uppercase letter, a lowercase letter, a number and a special character.</p><label className="management-field"><span>Confirm password</span><input type="password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} required autoComplete="new-password" maxLength={128}/></label></>:<p><a href="/signin" target="_blank" rel="noopener noreferrer">Forgot password? Reset it in a new tab, then return here.</a></p>}
          <button className="management-primary customer-submit" type="submit">{busy?'Please wait...':invitation.needsPassword?'Set password and accept invitation':'Sign in and accept invitation'}</button>
        </fieldset></form></>:<p><a href="/signin">Go to customer sign-in</a></p>}
    </section></main>;
}
