import {EmailClient} from '@azure/communication-email';
import {ManagedIdentityCredential,AzureCliCredential} from '@azure/identity';

export function emailConfiguration(){
  const endpoint=process.env.ACCOUNT_EMAIL_ENDPOINT,sender=process.env.ACCOUNT_EMAIL_SENDER,origin=process.env.PORTAL_ORIGIN;
  if(!endpoint||!sender||!origin||new URL(origin).protocol!=='https:')throw new Error('ACCOUNT_EMAIL_NOT_CONFIGURED');
  return{endpoint,sender,origin:new URL(origin).origin};
}
export async function sendAccountEmail(email:string,token:string,purpose:'verifyEmail'|'resetPassword'){
  const config=emailConfiguration();
  const credential=process.env.WEBSITE_HOSTNAME?new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID?{clientId:process.env.AZURE_CLIENT_ID}:{}):new AzureCliCredential();
  const client=new EmailClient(config.endpoint,credential);
  const label=purpose==='verifyEmail'?'Verify your email':'Reset your password';
  const link=`${config.origin}/account/${purpose==='verifyEmail'?'verify':'reset'}#token=${encodeURIComponent(token)}`;
  const poller=await client.beginSend({senderAddress:config.sender,recipients:{to:[{address:email}]},content:{subject:`NSO Audit: ${label}`,plainText:`${label} for your NSO Audit account:\n\n${link}\n\nThis link expires in ${purpose==='verifyEmail'?'24 hours':'30 minutes'}. If you did not request this, ignore this message.`}});
  const result=await poller.pollUntilDone();
  if(result.status!=='Succeeded')throw new Error('ACCOUNT_EMAIL_FAILED');
}

export function invitationLifetimeHours():number{
  const hours=Number(process.env.ACCOUNT_INVITATION_HOURS??72);
  if(!Number.isInteger(hours)||hours<1||hours>168)throw new Error('INVITATION_LIFETIME_INVALID');
  return hours;
}
export function invitationMessage(origin:string,token:string,company:string,hours:number){
  const portal=new URL(origin);
  if(portal.protocol!=='https:'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('INVITATION_LINK_INVALID');
  const link=`${portal.origin}/account/invitation#token=${encodeURIComponent(token)}`;
  return {subject:'NSO Audit: Your workspace invitation',plainText:`You have been invited to ${company} on NSO Audit.\n\nAccept your invitation and set your password, or sign in if you already have an account:\n\n${link}\n\nThis invitation expires in ${hours} hours. If you did not expect it, ignore this email.`};
}
export async function sendInvitationEmail(email:string,token:string,company:string,hours:number){
  const config=emailConfiguration();
  const credential=process.env.WEBSITE_HOSTNAME?new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID?{clientId:process.env.AZURE_CLIENT_ID}:{}):new AzureCliCredential();
  const poller=await new EmailClient(config.endpoint,credential).beginSend({senderAddress:config.sender,recipients:{to:[{address:email}]},content:invitationMessage(config.origin,token,company,hours)});
  if((await poller.pollUntilDone()).status!=='Succeeded')throw new Error('INVITATION_EMAIL_FAILED');
}
