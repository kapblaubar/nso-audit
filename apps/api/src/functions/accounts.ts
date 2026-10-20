import {app,type HttpRequest,type HttpResponseInit,type InvocationContext} from '@azure/functions';
import sql from 'mssql';
import {requestClientIp} from '../auth/clientIp.js';
import {getSqlPool} from '../storage/sql.js';
import {hashPassword,verifyPassword,validEmail,validPassword,newToken,tokenHash} from '../auth/passwords.js';
import {emailConfiguration,sendAccountEmail} from '../auth/accountEmail.js';

const generic='If the address is eligible, an email is on its way. Check your inbox and spam folder.';
const headers={'Cache-Control':'no-store','Pragma':'no-cache'};
const reply=(status:number,body:object):HttpResponseInit=>({status,headers,jsonBody:body});
function bearer(request:HttpRequest){const value=request.headers.get('authorization')??'';return /^Bearer [A-Za-z0-9_-]{43}$/.test(value)?value.slice(7):'';}
export async function accounts(request:HttpRequest,context:InvocationContext):Promise<HttpResponseInit>{
  try{
    const action=request.params.action??'';
    if(!['register','login','forgot','resend','verify','reset','session','logout'].includes(action))return reply(404,{error:'Not found.'});
    const pool=await getSqlPool();
    if(action==='session'||action==='logout'){
      if((action==='session'&&request.method!=='GET')||(action==='logout'&&request.method!=='POST'))return reply(405,{error:'Method not allowed.'});
      const token=bearer(request);if(!token)return reply(401,{error:'Please sign in.'});
      const result=await pool.request().input('TokenHash',sql.Char(64),tokenHash(token)).input('Revoke',sql.Bit,action==='logout').execute('security.AuthSession');
      if(action==='logout')return reply(200,{message:'Signed out.'});
      const user=result.recordset[0];if(!user)return reply(401,{error:'Please sign in again.'});
      return reply(200,{user:{id:user.UserId,email:user.Email,name:user.DisplayName},workspaces:((result.recordsets as sql.IRecordSet<any>[])[1]??[]).map(row=>({id:row.OrganizationId,name:row.DisplayName,role:row.Role,tenantId:row.TenantId??null}))});
    }
    if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'JSON is required.'});
    const origin=request.headers.get('origin');
    if(origin&&origin!==process.env.PORTAL_ORIGIN)return reply(403,{error:'Request origin is not allowed.'});
    const raw=await request.text();if(raw.length>4096)return reply(413,{error:'Request is too large.'});
    let body:Record<string,unknown>;
    try{const parsed:unknown=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();body=parsed as Record<string,unknown>;}catch{return reply(400,{error:'Invalid request.'});}
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const peer=requestClientIp(request.headers,process.env.FRONT_DOOR_ID);
    for(const [bucket,limit] of [[`peer:${peer}`,50],[`email:${email||tokenHash(String(body.token??''))}`,10]] as const){
      const throttle=await pool.request().input('BucketHash',sql.Char(64),tokenHash(bucket)).input('Limit',sql.Int,limit).execute('security.AuthThrottle');
      if(!throttle.recordset[0]?.Allowed)return{...reply(429,{error:'Too many attempts. Try again in 15 minutes.'}),headers:{...headers,'Retry-After':'900'}};
    }
    if(['register','login','forgot','resend'].includes(action)&&!validEmail(email))return reply(400,{error:'Enter a valid email address.'});
    if(['register','reset'].includes(action)&&!validPassword(body.password))return reply(400,{error:'Use 15 to 128 characters with an uppercase letter, a lowercase letter, a number and a special character.'});
    if(action==='register'){
      emailConfiguration();
      const name=typeof body.name==='string'?body.name.trim():'';
      if(!name||name.length>150)return reply(400,{error:'Enter your name (up to 150 characters).'});
      const token=newToken();
      const result=await pool.request().input('Email',sql.NVarChar(254),email).input('DisplayName',sql.NVarChar(150),name)
        .input('PasswordHash',sql.NVarChar(512),await hashPassword(body.password as string)).input('TokenHash',sql.Char(64),tokenHash(token)).execute('security.AuthRegister');
      if(result.recordset?.[0])await sendAccountEmail(email,token,'verifyEmail');
      return reply(200,{message:generic});
    }
    if(action==='forgot'||action==='resend'){
      emailConfiguration();const token=newToken(),purpose=action==='forgot'?'resetPassword':'verifyEmail';
      const result=await pool.request().input('Email',sql.NVarChar(254),email).input('Purpose',sql.VarChar(16),purpose)
        .input('TokenHash',sql.Char(64),tokenHash(token)).execute('security.AuthIssueToken');
      if(result.recordset?.[0])await sendAccountEmail(email,token,purpose);
      return reply(200,{message:generic});
    }
    if(action==='login'){
      if(typeof body.password!=='string'||body.password.length>128)return reply(401,{error:'Sign-in failed. Check your details and verify your email before signing in.'});
      const result=await pool.request().input('Email',sql.NVarChar(254),email).execute('security.AuthLookup');
      const user=result.recordset[0];
      const matches=await verifyPassword(body.password,user?.PasswordHash??'');
      if(!matches||!user)return reply(401,{error:'Sign-in failed. Check your details and verify your email before signing in.'});
      const token=newToken();
      const session=await pool.request().input('UserId',sql.UniqueIdentifier,user.UserId).input('ExpectedHash',sql.NVarChar(512),user.PasswordHash)
        .input('SessionHash',sql.Char(64),tokenHash(token)).execute('security.AuthLogin');
      if(!session.recordset[0]?.Created)return reply(401,{error:'Sign-in failed. Check your details and verify your email before signing in.'});
      return reply(200,{token,expiresIn:28800});
    }
    if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token))return reply(400,{error:'This link is invalid or expired.'});
    await pool.request().input('TokenHash',sql.Char(64),tokenHash(body.token)).input('Purpose',sql.VarChar(16),action==='verify'?'verifyEmail':'resetPassword')
      .input('PasswordHash',sql.NVarChar(512),action==='reset'?await hashPassword(body.password as string):null).execute('security.AuthCompleteToken');
    return reply(200,{message:action==='verify'?'Email verified. You can now sign in.':'Password changed. Sign in with your new password.'});
  }catch(error){
    if(typeof error==='object'&&error!==null&&'number'in error&&error.number===51010)return reply(400,{error:'This link is invalid or expired. Request a new one.'});
    context.error('Customer account operation failed.');
    return reply(503,{error:'Account service is temporarily unavailable. Please try again shortly.'});
  }
}
app.http('customerAccounts',{methods:['GET','POST'],authLevel:'anonymous',route:'account/{action}',handler:accounts});
