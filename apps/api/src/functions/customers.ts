import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import {requireManagementUser} from '../auth/requireManagementUser.js';
import {CustomerInputError,validateCustomerInput} from '../management/customerInput.js';
import {listCustomers,getCustomer,saveCustomer} from '../management/customerStore.js';
import {uuidPattern} from '../storage/sql.js';

export async function manageCustomers(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  const headers={'Cache-Control':'no-store'};
  let actor;
  try{actor=await requireManagementUser(request);}catch{return{status:403,headers,jsonBody:{error:'NewSommer management access is required.'}};}
  try{
    const id=request.params.organizationId;
    if(id&&!uuidPattern.test(id))return{status:400,headers,jsonBody:{error:'Invalid customer identifier.'}};
    if(request.method==='GET')return{status:200,headers,jsonBody:id?await getCustomer(actor,id):{customers:await listCustomers(actor)}};
    const creating=request.method==='POST';
    const raw=await request.text();
    if(raw.length>64000)throw new CustomerInputError('Customer details are too large.');
    let body:unknown;
    try{body=JSON.parse(raw);}catch{throw new CustomerInputError('Customer details must be valid JSON.');}
    const input=validateCustomerInput(body,creating);
    return{status:creating?201:200,headers,jsonBody:await saveCustomer(actor,id??crypto.randomUUID(),input,creating)};
  }catch(error){
    if(error instanceof CustomerInputError)return{status:400,headers,jsonBody:{error:error.message}};
    const number=typeof error==='object'&&error!==null&&'number'in error?error.number:undefined;
    if(number===51001)return{status:409,headers,jsonBody:{error:'This customer changed. Reload the customer before saving again.'}};
    if(number===51004)return{status:404,headers,jsonBody:{error:'Customer not found.'}};
    if(number===51003)return{status:403,headers,jsonBody:{error:'Management access is required.'}};
    context.error('Customer management operation failed.');
    return{status:500,headers,jsonBody:{error:'Customer details could not be saved or loaded. Please try again.'}};
  }
}
app.http('managementCustomers',{methods:['GET','POST'],authLevel:'anonymous',route:'management/customers',handler:manageCustomers});
app.http('managementCustomer',{methods:['GET','PUT'],authLevel:'anonymous',route:'management/customers/{organizationId}',handler:manageCustomers});
