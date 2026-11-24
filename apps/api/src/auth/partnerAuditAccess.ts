import sql from 'mssql';
import type {TenantUser} from './requireTenantUser.js';
import {getSqlPool} from '../storage/sql.js';

export async function resolvePartnerAudit(user:TenantUser,organizationId?:string){
  const pool=await getSqlPool();
  const result=await pool.request()
    .input('EntraTenantId',sql.UniqueIdentifier,user.tenantId)
    .input('EntraObjectId',sql.UniqueIdentifier,user.objectId)
    .input('OrganizationId',sql.UniqueIdentifier,organizationId??null)
    .execute('security.ResolvePartnerAudit');
  if(!Array.isArray(result.recordsets)||result.recordsets.length!==2)throw new Error('Unexpected partner directory response.');
  const principal=result.recordsets[0]![0] as {Role:'partnerAdmin'|'partnerUser';DisabledAt:Date|null}|undefined;
  const workspaces=(result.recordsets[1] as {OrganizationId:string;DisplayName:string;TenantId:string}[]).map(row=>({
    organizationId:row.OrganizationId, name:row.DisplayName, tenantId:row.TenantId,
  }));
  return {principal,workspaces};
}
