import {isIP} from 'node:net';
type HeaderReader={get:(name:string)=>string|null};
function normalize(value:string|null):string|undefined{
  if(!value)return undefined;
  const trimmed=value.trim();
  if(isIP(trimmed))return trimmed;
  const withoutPort=/^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(trimmed)?.[1]??/^\[([^\]]+)\](?::\d+)?$/.exec(trimmed)?.[1];
  return withoutPort&&isIP(withoutPort)?withoutPort:undefined;
}
export function requestClientIp(headers:HeaderReader,expectedFrontDoorId:string|undefined):string{
  const peer=normalize((headers.get('x-forwarded-for')??'').split(',').at(-1)??null);
  // FRONT_DOOR_ID is enabled only together with the platform service-tag + FDID origin gate.
  if(expectedFrontDoorId&&headers.get('x-azure-fdid')?.toLowerCase()===expectedFrontDoorId.toLowerCase()){
    const client=normalize(headers.get('x-azure-socketip'));
    if(client)return client;
  }
  return peer??'unknown';
}
