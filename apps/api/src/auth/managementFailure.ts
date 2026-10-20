export class ManagementAccessError extends Error{
  constructor(public readonly status:401|403|503,public readonly code:string,message:string,public readonly clientIp?:string){super(message);}
}
export function managementFailure(error:unknown){
  const failure=error instanceof ManagementAccessError?error:new ManagementAccessError(503,'management_unavailable','Management is temporarily unavailable. Please retry access shortly.');
  return{status:failure.status,jsonBody:{error:failure.message,code:failure.code,
    ...(process.env.APP_ENVIRONMENT==='dev'&&failure.clientIp?{diagnostic:{reason:'firewallDenied',clientIp:failure.clientIp}}:{})}};
}
