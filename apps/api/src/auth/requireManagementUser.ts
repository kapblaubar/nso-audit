import type { HttpRequest } from '@azure/functions';
import sql from 'mssql';
import { requireTenantUser } from './requireTenantUser.js';
import { assertManagementTenant, isManagementRole } from './managementPolicy.js';
import { getSqlPool } from '../storage/sql.js';

export async function requireManagementUser(request: HttpRequest) {
  // Only verified Entra access tokens are accepted, never client portal sessions.
  const user = await requireTenantUser(request);
  assertManagementTenant(user, process.env.ENTRA_MANAGEMENT_TENANT_ID);
  const pool = await getSqlPool();
  const result = await pool.request().input('TenantId', sql.UniqueIdentifier, user.tenantId)
    .input('ObjectId', sql.UniqueIdentifier, user.objectId).execute('security.GetManagementRole');
  const role: unknown = result.recordset[0]?.Role;
  if (!isManagementRole(role)) throw new Error('An active management role is required.');
  return { ...user, role };
}
