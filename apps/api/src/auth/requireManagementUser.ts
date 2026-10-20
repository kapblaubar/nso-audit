import type { HttpRequest } from '@azure/functions';
import sql from 'mssql';
import {ManagementAccessError} from './managementFailure.js';
import { requireTenantUser } from './requireTenantUser.js';
import { assertManagementTenant, assertManagementIdentity, isManagementRole } from './managementPolicy.js';
import { getSqlPool } from '../storage/sql.js';

export async function requireManagementUser(request: HttpRequest) {
  let user;
  try{user=await requireTenantUser(request);}
  catch{throw new ManagementAccessError(401,'session_invalid','Your Microsoft session could not be verified. Sign out and sign in again.');}
  if(!process.env.ENTRA_MANAGEMENT_TENANT_ID||!process.env.ENTRA_MANAGEMENT_OBJECT_ID)
    throw new ManagementAccessError(503,'staff_configuration_unavailable','Staff access configuration is unavailable. Please retry access shortly.');
  try{
    assertManagementTenant(user,process.env.ENTRA_MANAGEMENT_TENANT_ID);
    assertManagementIdentity(user,process.env.ENTRA_MANAGEMENT_OBJECT_ID);
  }catch{throw new ManagementAccessError(403,'staff_identity_denied','This Microsoft account does not have staff access. Use your authorized NewSommer work account.');}
  let role:unknown;
  try{
    const pool=await getSqlPool();
    const result=await pool.request().input('TenantId',sql.UniqueIdentifier,user.tenantId)
      .input('ObjectId',sql.UniqueIdentifier,user.objectId).execute('security.GetManagementRole');
    role=result.recordset[0]?.Role;
  }catch(error){
    const clientIp=/Client with IP address '([0-9.]+)'/.exec(error instanceof Error?error.message:'')?.[1];
    throw new ManagementAccessError(503,'staff_directory_unavailable','Your Microsoft sign-in succeeded, but the customer database is temporarily unavailable. Retry access shortly.',clientIp);
  }
  if(!isManagementRole(role))throw new ManagementAccessError(403,'staff_role_inactive','Your Microsoft account has no active staff role.');
  return{...user,role};
}
