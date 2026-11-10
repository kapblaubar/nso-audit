const key='nso.auditDataDestination';
const valid=(path:string)=>/^\/audit-data(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(path);
export function rememberAuditDestination(){
  if(valid(window.location.pathname))sessionStorage.setItem(key,window.location.pathname);
}
export function pendingAuditDestination():string|undefined{
  const path=sessionStorage.getItem(key);
  return path&&valid(path)?path:undefined;
}
export function clearAuditDestination(){sessionStorage.removeItem(key);}
