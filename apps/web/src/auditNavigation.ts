const key='nso.auditDataDestination';
const valid=(path:string)=>/^\/audit-data(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:licenses|recommendations))?)?$/i.test(path);
export function rememberAuditDestination(){
  if(valid(window.location.pathname)){
    const params=new URLSearchParams(window.location.search),saved=new URLSearchParams();
    for(const name of ['provider','view','dataset','skuId','source']){const value=params.get(name);if(value&&value.length<=200)saved.set(name,value);}
    sessionStorage.setItem(key,window.location.pathname+(saved.size?`?${saved}`:''));
  }
}
export function pendingAuditDestination():string|undefined{
  const path=sessionStorage.getItem(key);
  if(!path)return undefined;
  try{const url=new URL(path,window.location.origin);return url.origin===window.location.origin&&valid(url.pathname)&&!url.hash?`${url.pathname}${url.search}`:undefined;}catch{return undefined;}
}
export function clearAuditDestination(){sessionStorage.removeItem(key);}
