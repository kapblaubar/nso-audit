import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import sql from 'mssql';
import {requireManagementUser} from '../auth/requireManagementUser.js';
import {getSqlPool,uuidPattern} from '../storage/sql.js';
import {validEmail,tokenHash} from '../auth/passwords.js';
export async function testAccounts(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  const headers={'Cache-Control':'no-store'};
  if(process.env.APP_ENVIRONMENT!=='dev')return{status:404,headers,jsonBody:{error:'Not found.'}};
  let actor;try{actor=await requireManagementUser(request);}catch{return{status:403,headers,jsonBody:{error:'Management access is required.'}};}
  try{
    const pool=await getSqlPool();
    const query=pool.request().input('TenantId',sql.UniqueIdentifier,actor.tenantId).input('ObjectId',sql.UniqueIdentifier,actor.objectId);
    if(request.method==='GET'){
      const result=await query.execute('security.ManagementListAccounts');
      return{status:200,headers,jsonBody:{accounts:result.recordset.map(row=>({id:row.UserId,email:row.Email,name:row.DisplayName,verified:!!row.EmailVerifiedAt,membershipCount:row.MembershipCount}))}};
    }
    if(!uuidPattern.test(request.params.userId??''))return{status:400,headers,jsonBody:{error:'Invalid account.'}};
    const raw=await request.text();if(raw.length>1024)return{status:400,headers,jsonBody:{error:'Invalid confirmation.'}};
    let body:unknown;try{body=JSON.parse(raw);}catch{return{status:400,headers,jsonBody:{error:'Invalid confirmation.'}};}
    const email=body&&typeof body==='object'&&'confirmEmail'in body&&typeof body.confirmEmail==='string'?body.confirmEmail.trim().toLowerCase():'';
    if(!validEmail(email))return{status:400,headers,jsonBody:{error:'Type the account email address to confirm deletion.'}};
    await query.input('UserId',sql.UniqueIdentifier,request.params.userId).input('ConfirmationEmail',sql.NVarChar(254),email)
      .input('EmailBucketHash',sql.Char(64),tokenHash(`email:${email}`)).execute('security.ManagementDeleteAccount');
    return{status:200,headers,jsonBody:{message:'Test account deleted. You can register this email again.'}};
  }catch(error){
    const number=typeof error==='object'&&error!==null&&'number'in error?error.number:undefined;
    if(number===51002)return{status:400,headers,jsonBody:{error:'The confirmation email does not match this account.'}};
    if(number===51004)return{status:404,headers,jsonBody:{error:'Account not found. Refresh the list.'}};
    context.error('Dev account cleanup failed.');return{status:503,headers,jsonBody:{error:'The account could not be deleted. Please try again.'}};
  }
}
app.http('listTestAccounts',{methods:['GET'],authLevel:'anonymous',route:'management/test-users',handler:testAccounts});
app.http('deleteTestAccount',{methods:['DELETE'],authLevel:'anonymous',route:'management/test-users/{userId}',handler:testAccounts});
