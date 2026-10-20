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
