import type {HttpRequest} from '@azure/functions';
import sql from 'mssql';
import {requireTenantUser,type TenantUser} from './requireTenantUser.js';
import {getSqlPool,uuidPattern} from '../storage/sql.js';
import {tokenHash} from './passwords.js';
import {resolvePartnerAudit} from './partnerAuditAccess.js';
export class AuditAccessError extends Error{constructor(public readonly status:number){super('Audit access is not authorized.');}}
export async function requireAuditUser(request:HttpRequest):Promise<TenantUser>{
  const authorization=request.headers.get('authorization')??'';
  const organizationId=request.headers.get('x-nso-organization-id');
  const tenantId=request.headers.get('x-nso-tenant-id');
  if(tenantId&&!uuidPattern.test(tenantId))throw new AuditAccessError(403);
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)){
    const user=await requireTenantUser(request);
    if(organizationId&&!uuidPattern.test(organizationId))throw new AuditAccessError(403);
    const {principal,workspaces}=await resolvePartnerAudit(user,organizationId??undefined);
    if(!principal){
      if(organizationId||tenantId)throw new AuditAccessError(403);
      return user;
    }
    const scope=workspaces.find(item=>item.tenantId.toLowerCase()===tenantId?.toLowerCase());
    if(principal.DisabledAt||!organizationId||!scope||request.method!=='GET')throw new AuditAccessError(403);
    return {...user,tenantId:scope.tenantId};
  }
  if(!organizationId||!uuidPattern.test(organizationId))throw new AuditAccessError(403);
  const pool=await getSqlPool();
  const result=await pool.request().input('TokenHash',sql.Char(64),tokenHash(authorization.slice(7)))
    .input('OrganizationId',sql.UniqueIdentifier,organizationId)
    .input('TenantId',sql.UniqueIdentifier,tenantId).execute('security.AuthResolveAudit');
  const row=result.recordset?.[0];
  if(!row?.TenantId)throw new AuditAccessError(403);
  if(request.method!=='GET'&&!['owner','admin','contributor'].includes(row.Role))throw new AuditAccessError(403);
  return{tenantId:row.TenantId,objectId:row.UserId};
}
