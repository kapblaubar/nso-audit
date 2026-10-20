// Public build configuration only; no credentials or deployment tokens.
import {readFileSync,appendFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2]??'config/environments/dev.public.json','utf8'));
const keys=['VITE_ENTRA_CLIENT_ID','VITE_AUTH_REDIRECT_URI','VITE_API_BASE_URL','VITE_API_SCOPE'];
for(const key of keys){
  const value=config[key];
  if(typeof value!=='string'||!value||/[\r\n]/.test(value))throw new Error(`Invalid public setting ${key}`);
}
if(config.VITE_API_BASE_URL!=='/api'&&new URL(config.VITE_API_BASE_URL).protocol!=='https:')throw new Error('Use HTTPS API or same-origin /api');
if(new URL(config.VITE_AUTH_REDIRECT_URI).protocol!=='https:')throw new Error('Use HTTPS callback');
if(!process.env.GITHUB_ENV)throw new Error('GITHUB_ENV is required');
appendFileSync(process.env.GITHUB_ENV,keys.map(key=>`${key}=${config[key]}`).join('\n')+'\n');
