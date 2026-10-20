import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {AccountInfo} from '@azure/msal-browser';
import {initializeAuth,signInManagement,signOutManagement} from '../auth';
import {ManagementRequestError,activateCustomerContact,managementSession,listCustomers,getCustomer,saveCustomer,type ManagementSession,type CustomerProfile,type ClientContact,type CustomerSummary,type CustomerDetails} from '../managementApi';
import {TestAccounts} from './TestAccounts';
import {ThemeToggle} from '../components/ThemeToggle';

const emptyProfile:CustomerProfile={companyName:'',primaryContactName:'',primaryContactEmail:'',phone:'',website:'',industry:'',country:'',state:'',employeeCount:null,deviceCount:null,notes:'',microsoftAccount:'',microsoftTenantId:'',subscriptionIds:[]};

export function ManagementPage(){
  const [ready,setReady]=useState(false),[account,setAccount]=useState<AccountInfo>(),[session,setSession]=useState<ManagementSession>();
  const [customers,setCustomers]=useState<CustomerSummary[]>([]),[selected,setSelected]=useState<CustomerDetails>(),[profile,setProfile]=useState<CustomerProfile>({...emptyProfile});
  const [users,setUsers]=useState<ClientContact[]>([]),[subscriptions,setSubscriptions]=useState(''),[search,setSearch]=useState('');
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
  const [supportDetails,setSupportDetails]=useState('');
  const selectionRequest=useRef(0);
  useEffect(()=>{
    let cancelled=false;
    void initializeAuth().then(async state=>{
      if(cancelled)return;
      if(state.error)throw new Error(state.error);
      setAccount(state.account);
      if(state.account){
        const authorized=await managementSession(state.account);
        if(cancelled)return;
        setSession(authorized);
        window.history.replaceState({},'','/clientmanagement');
        sessionStorage.removeItem('nso.managementLogin');
        const result=await listCustomers(state.account);
        if(!cancelled)setCustomers(result.customers);
      }
    }).catch((cause:unknown)=>{if(!cancelled){setError(cause instanceof Error?cause.message:'Management sign-in failed.');if(cause instanceof ManagementRequestError&&cause.code)setSupportDetails(JSON.stringify({code:cause.code,...cause.diagnostic},null,2));}})
      .finally(()=>{if(!cancelled)setReady(true);});
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function populate(customer:CustomerDetails|undefined){
    setSelected(customer);setProfile({...emptyProfile,...customer?.profile});setUsers(customer?.users??[]);
    setSubscriptions(customer?.profile.subscriptionIds?.join('\n')??'');setDirty(false);
  }
  function mayLeave(){return !dirty||window.confirm('Discard unsaved customer changes?');}
  async function choose(id:string){
    if(!account||!mayLeave())return;
    const sequence=++selectionRequest.current;
    setLoading(true);setError('');setNotice('');
    try{const customer=await getCustomer(account,id);if(sequence===selectionRequest.current)populate(customer);}
    catch(cause){if(sequence===selectionRequest.current)setError(cause instanceof Error?cause.message:'Customer could not be loaded.');}
    finally{if(sequence===selectionRequest.current)setLoading(false);}
  }
  function create(){if(!mayLeave())return;selectionRequest.current++;populate(undefined);setLoading(false);setError('');setNotice('');}
  function update<K extends keyof CustomerProfile>(key:K,value:CustomerProfile[K]){setProfile(previous=>({...previous,[key]:value}));setDirty(true);setNotice('');}
  function updateUser(id:string,changes:Partial<ClientContact>){setUsers(previous=>previous.map(user=>user.id===id?{...user,...changes}:user));setDirty(true);setNotice('');}
  function addUser(primary=false){setUsers(previous=>[...previous,{id:crypto.randomUUID(),displayName:primary?profile.primaryContactName:'',email:primary?profile.primaryContactEmail:'',role:primary?'owner':'viewer'}]);setDirty(true);setNotice('');}
  async function submit(event:FormEvent){
    event.preventDefault();if(!account||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const saved=await saveCustomer(account,selected?.organizationId,{...profile,subscriptionIds:subscriptions.split(/[\s,;]+/).filter(Boolean)},users,selected?.version);
      populate(saved);
      const result=await listCustomers(account);setCustomers(result.customers);
      setNotice('Customer details saved. Activate access separately after each client verifies their email account.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Customer could not be saved.');}
    finally{setSaving(false);}
  }
  async function activate(contactId:string){
    if(!account||!selected||dirty||saving)return;
    if(!window.confirm('Grant this verified email account access to this customer using the saved intended role?'))return;
    setSaving(true);setError('');setNotice('');
    try{const result=await activateCustomerContact(account,selected.organizationId,contactId);setNotice(result.message);}
    catch(cause){setError(cause instanceof Error?cause.message:'Access could not be activated.');}
    finally{setSaving(false);}
  }
  const authenticate=()=>{setError('');void signInManagement().catch(cause=>setError(cause instanceof Error?cause.message:'Microsoft sign-in failed.'));};
  const logout=()=>{if(mayLeave())void signOutManagement().catch(()=>setError('Sign-out failed. Please try again.'));};
  const textField=(key:keyof CustomerProfile,label:string,required=false,type='text')=>(
    <label className="management-field"><span>{label} <small>{required?'Required':'Optional'}</small></span>
      <input type={type} value={String(profile[key]??'')} onChange={event=>update(key,event.target.value as never)} required={required}
        maxLength={key==='companyName'?200:key==='website'?500:key==='primaryContactName'?150:key==='phone'?64:key==='country'||key==='state'?100:key==='industry'?150:254}/></label>
  );
  if(!ready)return <main className="route-loading"><span>Checking NewSommer management access…</span></main>;
  if(!session)return <main className="management-login"><a className="brand" href="/"><img src="/brand/nsosquare.png" width="44" height="44" alt=""/><span>NSO Audit</span></a>
    <section><p className="eyebrow">NewSommer management</p><h1>Set up your clients.</h1><p>Manage customer workspaces and their users. Sign in with your authorized NewSommer Microsoft work account.</p>
      {error?<p className="management-error" role="alert">{error}</p>:null}
      {account?<button className="management-primary" onClick={()=>window.location.reload()}>Retry access</button>:<button className="management-primary" onClick={authenticate}>Sign in with Microsoft</button>}
      {supportDetails?<button className="management-secondary" onClick={()=>void navigator.clipboard.writeText(supportDetails).catch(()=>setError('Could not copy support details.'))}>Copy support details</button>:null}
      {account?<button className="management-secondary" onClick={logout}>Sign out of {account.username}</button>:null}
      <a className="management-back" href="/">Back to NSO Audit</a></section></main>;
  return <main className="management-page">
    <nav className="nav" aria-label="Management navigation"><a className="brand" href="/clientmanagement"><img className="brand-mark" src="/brand/nsosquare.png" width="40" height="40" alt=""/><span className="brand-name">NSO Audit <small>Management</small></span></a>
      <div className="account-menu"><span className="management-env">{session.environment}</span><span>{account?.name??session.name}</span><a href="/audit">Existing audit</a><ThemeToggle/><button className="text-button" onClick={logout}>Sign out</button></div></nav>
    <header className="management-header"><div><p className="eyebrow">NewSommer workspace</p><h1>Customer management</h1><p>Set up the company first. Connect its systems when it is ready.</p></div><button className="management-primary" onClick={create} disabled={saving}>+ New customer</button></header>
    {session.environment==='dev'&&account?<details className="management-test-accounts"><summary>Test accounts ? delete and register again</summary><TestAccounts account={account} blocked={dirty||saving||loading} onBusyChange={setSaving} onDeleted={()=>{selectionRequest.current++;populate(undefined);void listCustomers(account).then(result=>setCustomers(result.customers)).catch(()=>setError('Refresh customers to reload changes.'));}}/></details>:null}
    <div className="management-layout">
      <aside className="management-customers" aria-label="Customers"><div className="management-list-heading"><h2>Customers</h2><span>{customers.length}</span></div>
        <label className="management-field"><span className="sr-only">Search customers</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search company or contact"/></label>
        <div className="management-customer-list">{customers.filter(customer=>`${customer.companyName} ${customer.primaryContactEmail}`.toLowerCase().includes(search.toLowerCase())).map(customer=><button key={customer.organizationId} className={selected?.organizationId===customer.organizationId?'is-selected':''} onClick={()=>void choose(customer.organizationId)} disabled={saving} aria-pressed={selected?.organizationId===customer.organizationId}><strong>{customer.companyName}</strong><span>{customer.primaryContactEmail||'Contact details needed'}</span></button>)}
          {!customers.length?<p>No customers yet. Create your first workspace.</p>:null}</div>
      </aside>
      <section className="management-editor" aria-busy={loading||saving}>
        <div className="management-editor-title"><div><p className="eyebrow">{selected?'Customer workspace':'New workspace'}</p><h2>{selected?.profile.companyName||'Create a customer'}</h2></div><span className="management-badge">{dirty?'Unsaved changes':selected?'Saved workspace':'Draft'}</span></div>
        {error?<p className="management-error" role="alert">{error}</p>:null}{notice?<p className="management-success" role="status">{notice}</p>:null}
        {loading?<p role="status">Loading customer details…</p>:<form onSubmit={event=>void submit(event)}>
          <fieldset disabled={saving}>
            <section className="management-card"><h3>Company & primary contact</h3><p>Only the company name and primary contact are required.</p><div className="management-fields">
              {textField('companyName','Company name',true)}{textField('website','Website',false,'url')}{textField('primaryContactName','Primary contact name',true)}{textField('primaryContactEmail','Primary contact email',true,'email')}
              {textField('phone','Phone')}{textField('industry','Industry')}{textField('country','Country')}{textField('state','State / region')}
              {(['employeeCount','deviceCount'] as const).map(key=><label className="management-field" key={key}><span>{key==='employeeCount'?'Employees':'Devices'} <small>Optional</small></span><input type="number" min="0" max="10000000" step="1" value={profile[key]??''} onChange={event=>update(key,event.target.value===''?null:Number(event.target.value))}/></label>)}
            </div></section>
            <section className="management-card"><div className="management-section-heading"><div><h3>Client users</h3><p>Record names, email addresses and intended workspace roles.</p></div><button type="button" className="management-secondary" onClick={()=>addUser()}>+ Add user</button></div>
              <p className="management-help">Save each contact, then ask them to create an email account and verify their email at the customer sign-in page. Activate access when they are ready. Saving a contact removal also revokes that email account?s workspace access. Do not enter passwords here.</p>
              {selected?.pendingOwnerEmail?<p className="management-owner-note">Pending ownership handover: <strong>{selected.pendingOwnerEmail}</strong></p>:null}
              {!users.length?<div className="management-empty"><p>No client users recorded.</p><button className="management-secondary" type="button" disabled={!profile.primaryContactName||!profile.primaryContactEmail} onClick={()=>addUser(true)}>Add primary contact as owner</button></div>:null}
              {users.map((user,index)=><div className="management-user" key={user.id}><label className="management-field"><span>Name <small>Required</small></span><input aria-label={`User ${index+1} name`} value={user.displayName} required maxLength={150} onChange={event=>updateUser(user.id,{displayName:event.target.value})}/></label>
                <label className="management-field"><span>Email <small>Required</small></span><input aria-label={`User ${index+1} email`} type="email" required maxLength={254} value={user.email} onChange={event=>updateUser(user.id,{email:event.target.value})}/></label>
                <label className="management-field"><span>Intended role</span><select aria-label={`User ${index+1} role`} value={user.role} onChange={event=>updateUser(user.id,{role:event.target.value as ClientContact['role']})}><option value="owner">Owner</option><option value="admin">Client admin</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></select></label>
                <button type="button" className="management-secondary" disabled={!selected||dirty||saving} onClick={()=>void activate(user.id)}>Activate access</button><button type="button" className="management-remove" aria-label={`Remove user ${index+1}`} onClick={()=>{setUsers(previous=>previous.filter(item=>item.id!==user.id));setDirty(true);}}>Remove</button></div>)}
            </section>
            <section className="management-card"><div className="management-section-heading"><h3>Microsoft environment</h3><span className="management-badge">Entirely optional</span></div><p>Leave these fields empty for clients that do not use Microsoft. Saving identifiers does not grant consent or start a scan.</p>
              <div className="management-fields">{textField('microsoftAccount','Microsoft account',false,'email')}
                <label className="management-field"><span>Azure / Entra Tenant ID <small>Optional</small></span><input value={profile.microsoftTenantId} maxLength={36} placeholder="00000000-0000-0000-0000-000000000000" onChange={event=>update('microsoftTenantId',event.target.value)}/></label>
                <label className="management-field management-wide"><span>Azure Subscription IDs <small>Optional</small></span><textarea rows={3} value={subscriptions} placeholder="One Subscription ID per line" onChange={event=>{setSubscriptions(event.target.value);setDirty(true);}}/><small>One per line, or separated by commas. An Azure subscription is not required.</small></label></div></section>
            <section className="management-card"><label className="management-field"><span>Setup notes <small>Optional</small></span><textarea rows={4} value={profile.notes} maxLength={4000} onChange={event=>update('notes',event.target.value)} placeholder="Assessment purpose, IT provider, insurance renewal date or setup questions"/></label></section>
            <footer className="management-save"><p>{selected?'Update this customer workspace.':'Creates a customer workspace without requiring Microsoft access.'}</p><button className="management-primary" type="submit" disabled={saving}>{saving?'Saving…':selected?'Save changes':'Create customer'}</button></footer>
          </fieldset>
        </form>}
      </section>
    </div>
  </main>;
}
