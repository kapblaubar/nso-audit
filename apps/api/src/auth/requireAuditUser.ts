import type {HttpRequest} from '@azure/functions';
import sql from 'mssql';
import {requireTenantUser,type TenantUser} from './requireTenantUser.js';
import {getSqlPool,uuidPattern} from '../storage/sql.js';
import {tokenHash} from './passwords.js';
export class AuditAccessError extends Error{constructor(public readonly status:number){super('Audit access is not authorized.');}}
export async function requireAuditUser(request:HttpRequest):Promise<TenantUser>{
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))return requireTenantUser(request);
  const organizationId=request.headers.get('x-nso-organization-id');
  if(!organizationId||!uuidPattern.test(organizationId))throw new AuditAccessError(403);
  const pool=await getSqlPool();
  const result=await pool.request().input('TokenHash',sql.Char(64),tokenHash(authorization.slice(7)))
    .input('OrganizationId',sql.UniqueIdentifier,organizationId).execute('security.AuthResolveAudit');
  const row=result.recordset?.[0];
  if(!row?.TenantId)throw new AuditAccessError(403);
  if(request.method!=='GET'&&!['owner','admin','contributor'].includes(row.Role))throw new AuditAccessError(403);
  return{tenantId:row.TenantId,objectId:row.UserId};
}
