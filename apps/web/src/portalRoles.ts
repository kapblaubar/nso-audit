import type {AuditAccount} from './auth';

export function portalRoleLabel(role:string){
  switch(role){
    case 'partnerAdmin':return 'Partner Admin';
    case 'partnerUser':return 'Partner User';
    case 'owner':
    case 'admin':return 'Client Admin';
    case 'viewer':return 'Client User';
    case 'contributor':return 'Client Contributor';
    case 'setupAdmin':return 'Staff Setup Admin';
    case 'platformAdmin':return 'Staff Platform Admin';
    default:return 'Microsoft account';
  }
}

export function canRunAudits(account:AuditAccount){
  return !('kind' in account)||(account.kind==='email'&&account.role!=='viewer');
}
