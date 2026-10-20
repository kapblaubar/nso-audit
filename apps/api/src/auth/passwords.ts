import {randomBytes, scrypt, timingSafeEqual, createHash} from 'node:crypto';

export function tokenHash(value:string):string{return createHash('sha256').update(value).digest('hex');}
export function newToken():string{return randomBytes(32).toString('base64url');}
export function validEmail(value:unknown):value is string{return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
export function validPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=15&&value.length<=128&&/\p{Lu}/u.test(value)&&/\p{Ll}/u.test(value)&&/[0-9]/.test(value)&&/[\p{P}\p{S}]/u.test(value);}
let hashing=0;
async function derive(password:string,salt:string):Promise<Buffer>{
  if(hashing>=4)throw new Error('AUTH_BUSY');
  hashing++;
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));}
  finally{hashing--;}
}
export async function hashPassword(password:string):Promise<string>{
  const salt=randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password:string,stored:string):Promise<boolean>{
  const [version,salt,key]=stored.split('$');
  const valid=version==='scrypt-v1'&&/^[a-f0-9]{32}$/.test(salt??'')&&/^[a-f0-9]{128}$/.test(key??'');
  const derived=await derive(password,valid?salt!:'00000000000000000000000000000000');
  return valid&&timingSafeEqual(derived,Buffer.from(key!,'hex'));
}
