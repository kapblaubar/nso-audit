const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CustomerInputError extends Error {}
export interface CustomerContact {id:string;displayName:string;email:string;role:'owner'|'admin'|'contributor'|'viewer'}
export interface CustomerProfile {
  companyName:string;primaryContactName:string;primaryContactEmail:string;phone:string;website:string;
  industry:string;country:string;state:string;employeeCount:number|null;deviceCount:number|null;notes:string;
  microsoftAccount:string;microsoftTenantId:string;subscriptionIds:string[];
}
export interface CustomerInput {profile:CustomerProfile;users:CustomerContact[];version?:string}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new CustomerInputError('Customer details must be an object.');
  return value as Record<string,unknown>;
}
function text(value:unknown,label:string,max:number,required=false):string {
  if(value===undefined||value===null) value='';
  if(typeof value!=='string'||value.length>max) throw new CustomerInputError(`${label} must be text of at most ${max} characters.`);
  const result=value.trim();
  if(required&&!result) throw new CustomerInputError(`${label} is required.`);
  return result;
}
function email(value:unknown,label:string,required=false):string {
  const result=text(value,label,254,required).toLowerCase();
  if(result&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new CustomerInputError(`${label} must be a valid email address.`);
  return result;
}
function count(value:unknown,label:string):number|null {
  if(value===undefined||value===null||value==='') return null;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>10000000) throw new CustomerInputError(`${label} must be a whole number between 0 and 10000000.`);
  return value;
}
export function validateCustomerInput(value:unknown,creating:boolean):CustomerInput {
  const input=object(value),p=object(input.profile);
  const permitted=['companyName','primaryContactName','primaryContactEmail','phone','website','industry','country','state','employeeCount','deviceCount','notes','microsoftAccount','microsoftTenantId','subscriptionIds'];
  if(Object.keys(input).some(key=>!['profile','users','version'].includes(key))||Object.keys(p).some(key=>!permitted.includes(key))) throw new CustomerInputError('Unsupported customer field. Do not enter passwords or credentials here.');
  const tenantId=text(p.microsoftTenantId,'Microsoft Tenant ID',36);
  if(tenantId&&!uuid.test(tenantId)) throw new CustomerInputError('Microsoft Tenant ID must be a complete GUID or left empty.');
  const subscriptions=p.subscriptionIds??[];
  if(!Array.isArray(subscriptions)||subscriptions.length>50||subscriptions.some(id=>typeof id!=='string'||!uuid.test(id.trim()))) throw new CustomerInputError('Subscription IDs must be complete GUIDs; leave the list empty if not applicable.');
  const website=text(p.website,'Website',500);
  if(website){try{const url=new URL(website);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();}catch{throw new CustomerInputError('Website must be an http or https URL without credentials.');}}
  const users=input.users??[];
  if(!Array.isArray(users)||users.length>50) throw new CustomerInputError('Up to 50 client users can be recorded.');
  const contacts:CustomerContact[]=users.map(value=>{
    const u=object(value);
    if(Object.keys(u).some(key=>!['id','displayName','email','role'].includes(key))) throw new CustomerInputError('Unsupported client user field.');
    if(typeof u.id!=='string'||!uuid.test(u.id))throw new CustomerInputError('Client user identifier is invalid.');
    if(!['owner','admin','contributor','viewer'].includes(String(u.role)))throw new CustomerInputError('Choose a valid client role.');
    return {id:u.id.toLowerCase(),displayName:text(u.displayName,'Client user name',150,true),email:email(u.email,'Client user email',true),role:u.role as CustomerContact['role']};
  });
  if(new Set(contacts.map(u=>u.email)).size!==contacts.length||new Set(contacts.map(u=>u.id)).size!==contacts.length)throw new CustomerInputError('Each client user must have a unique email and identifier.');
  const version=text(input.version,'Version',18);
  if(!creating&&!/^0x[0-9a-f]{16}$/i.test(version))throw new CustomerInputError('Reload this customer before saving.');
  return {profile:{companyName:text(p.companyName,'Company name',200,true),primaryContactName:text(p.primaryContactName,'Primary contact name',150,true),primaryContactEmail:email(p.primaryContactEmail,'Primary contact email',true),
    phone:text(p.phone,'Phone',64),website,industry:text(p.industry,'Industry',150),country:text(p.country,'Country',100),state:text(p.state,'State or region',100),
    employeeCount:count(p.employeeCount,'Employee count'),deviceCount:count(p.deviceCount,'Device count'),notes:text(p.notes,'Notes',4000),
    microsoftAccount:email(p.microsoftAccount,'Microsoft account'),microsoftTenantId:tenantId.toLowerCase(),subscriptionIds:[...new Set(subscriptions.map((id:string)=>id.trim().toLowerCase()))]},users:contacts,...(version?{version}:{})};
}
