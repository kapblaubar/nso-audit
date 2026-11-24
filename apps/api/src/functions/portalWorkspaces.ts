import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import {requireTenantUser} from '../auth/requireTenantUser.js';
import {resolvePartnerAudit} from '../auth/partnerAuditAccess.js';

export async function portalWorkspaces(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  const headers={'Cache-Control':'no-store'};
  let user;
  try{user=await requireTenantUser(request);}
  catch{return {status:401,headers,jsonBody:{error:'Microsoft sign-in could not be verified.'}};}
  try{
    const {principal,workspaces}=await resolvePartnerAudit(user);
    if(principal?.DisabledAt)return {status:403,headers,jsonBody:{error:'Partner access was disabled.'}};
    return {status:200,headers,jsonBody:{role:principal?.Role??null,workspaces}};
  }catch{
    context.error('Portal workspace lookup failed.');
    return {status:503,headers,jsonBody:{error:'Assigned workspaces could not be loaded.'}};
  }
}

app.http('portalWorkspaces',{methods:['GET'],authLevel:'anonymous',route:'me/portal-workspaces',handler:portalWorkspaces});
