import type {AccountInfo} from '@azure/msal-browser';
import {getApiAccessToken} from './auth';
import {appConfig} from './config';

export interface CustomerProfile {
  companyName:string;primaryContactName:string;primaryContactEmail:string;phone:string;website:string;
  industry:string;country:string;state:string;employeeCount:number|null;deviceCount:number|null;notes:string;
  microsoftAccount:string;microsoftTenantId:string;subscriptionIds:string[];
}
export interface ClientContact {id:string;displayName:string;email:string;role:'owner'|'admin'|'contributor'|'viewer'}
export interface CustomerSummary {organizationId:string;companyName:string;primaryContactEmail:string;version:string}
export interface CustomerDetails {organizationId:string;version:string;profile:Partial<CustomerProfile>;users:ClientContact[];pendingOwnerEmail:string|null}
export interface ManagementSession {name:string;role:string;environment:string}
export class ManagementRequestError extends Error{
  constructor(message:string,public readonly code?:string,public readonly diagnostic?:{reason?:string;clientIp?:string}){super(message);}
}
async function call<T>(account:AccountInfo,path:string,method='GET',body?:unknown):Promise<T>{
  if(!appConfig.apiBaseUrl)throw new Error('The management API is not configured.');
  const token=await getApiAccessToken(account);
  const response=await fetch(`${appConfig.apiBaseUrl}/management/${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json() as T&{error?:string;code?:string;diagnostic?:{reason?:string;clientIp?:string}};
  if(!response.ok)throw new ManagementRequestError(result.error??`Management request failed (${response.status}).`,result.code,result.diagnostic);
  return result;
}
export const managementSession=(account:AccountInfo)=>call<ManagementSession>(account,'bootstrap');
export const listCustomers=(account:AccountInfo)=>call<{customers:CustomerSummary[]}>(account,'customers');
export const getCustomer=(account:AccountInfo,id:string)=>call<CustomerDetails>(account,`customers/${encodeURIComponent(id)}`);
export const saveCustomer=(account:AccountInfo,id:string|undefined,profile:CustomerProfile,users:ClientContact[],version?:string)=>
  call<CustomerDetails>(account,id?`customers/${encodeURIComponent(id)}`:'customers',id?'PUT':'POST',{profile,users,...(version?{version}:{})});

export const activateCustomerContact=(account:AccountInfo,organizationId:string,contactId:string)=>
  call<{message:string}>(account,`customers/${encodeURIComponent(organizationId)}/contacts/${encodeURIComponent(contactId)}/activate`,'POST',{});

export interface TestAccount{id:string;email:string;name:string;verified:boolean;membershipCount:number}
export const listTestAccounts=(account:AccountInfo)=>call<{accounts:TestAccount[]}>(account,'test-users');
export const deleteTestAccount=(account:AccountInfo,id:string,confirmEmail:string)=>call<{message:string}>(account,`test-users/${encodeURIComponent(id)}`,'DELETE',{confirmEmail});
