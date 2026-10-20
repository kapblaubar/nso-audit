import {useEffect,useState} from 'react';
import type {AccountInfo} from '@azure/msal-browser';
import {listTestAccounts,deleteTestAccount,type TestAccount} from '../managementApi';
export function TestAccounts({account,onDeleted,blocked,onBusyChange}:{account:AccountInfo;onDeleted:()=>void;blocked:boolean;onBusyChange:(busy:boolean)=>void}){
  const [accounts,setAccounts]=useState<TestAccount[]>([]),[selected,setSelected]=useState<TestAccount>(),[confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function refresh(){setError('');try{setAccounts((await listTestAccounts(account)).accounts);}catch{setError('Test accounts could not be loaded.');}}
  useEffect(()=>{void refresh();},[]);
  async function remove(){
    if(blocked||!selected||confirmation.trim().toLowerCase()!==selected.email.toLowerCase())return;
    setBusy(true);onBusyChange(true);setError('');setNotice('');
    try{const result=await deleteTestAccount(account,selected.id,confirmation);setSelected(undefined);setConfirmation('');setNotice(result.message);await refresh();onDeleted();}
    catch(cause){setError(cause instanceof Error?cause.message:'Deletion failed.');}finally{setBusy(false);onBusyChange(false);}
  }
  return <section className="management-card" aria-label="Dev test accounts"><div className="management-section-heading"><div><h2>Test accounts</h2><p>Delete an email login so you can register it again. Available in Dev only.</p></div><button type="button" className="management-secondary" onClick={()=>void refresh()} disabled={busy}>Refresh accounts</button></div>
    {error?<p className="management-error" role="alert">{error}</p>:null}{notice?<p className="management-success" role="status">{notice}</p>:null}
    {blocked&&!busy?<p>Save or discard customer edits before deleting an account.</p>:null}
    <p>Deletion removes the password hash, sessions, verification/reset links, registration requests, memberships and matching user-roster entries. Customer workspaces, company details and assessment content remain; saved answers lose their link to the deleted user.</p>
    {accounts.length?<ul>{accounts.map(user=><li key={user.id}><strong>{user.email}</strong> ? {user.verified?'Verified':'Not verified'} ? {user.membershipCount} workspace(s) <button type="button" className="management-remove" disabled={busy||blocked} onClick={()=>{setSelected(user);setConfirmation('');setNotice('');}}>Delete account</button></li>)}</ul>:<p>No email accounts.</p>}
    {selected?<div role="group" aria-label="Confirm account deletion"><p>Permanently delete <strong>{selected.email}</strong> from the active database? This signs them out and allows a fresh registration.</p><label className="management-field"><span>Type the email to confirm deletion</span><input type="email" value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={busy} autoComplete="off"/></label><button className="management-remove" type="button" disabled={busy||blocked||confirmation.trim().toLowerCase()!==selected.email.toLowerCase()} onClick={()=>void remove()}>{busy?'Deleting?':'Permanently delete account'}</button><button className="management-secondary" type="button" disabled={busy} onClick={()=>setSelected(undefined)}>Cancel</button></div>:null}
  </section>;
}
