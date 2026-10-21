import sql from 'mssql';
import { getSqlPool } from '../storage/sql.js';
import type { CustomerInput } from './customerInput.js';
interface Actor {tenantId:string;objectId:string}
async function request(actor:Actor){return (await getSqlPool()).request().input('TenantId',sql.UniqueIdentifier,actor.tenantId).input('ObjectId',sql.UniqueIdentifier,actor.objectId);}
export async function listCustomers(actor:Actor){
  const result=await (await request(actor)).execute('security.ManagementListCustomers');
  return result.recordset.map(row=>({organizationId:String(row.OrganizationId).toLowerCase(),companyName:row.DisplayName as string,primaryContactEmail:row.PrimaryContactEmail as string,version:row.Version as string}));
}
export async function getCustomer(actor:Actor,organizationId:string){
  const result=await (await request(actor)).input('OrganizationId',sql.UniqueIdentifier,organizationId).execute('security.ManagementGetCustomer');
  const sets=result.recordsets as sql.IRecordSet<Record<string,unknown>>[];
  const row=sets[0]?.[0];
  if(!row)throw new Error('Customer details are unavailable.');
  return {organizationId:String(row.OrganizationId).toLowerCase(),version:row.Version as string,
    profile:row.ProfileJson?JSON.parse(row.ProfileJson as string):{companyName:row.DisplayName,primaryContactEmail:row.PrimaryContactEmail},
    pendingOwnerEmail:row.PendingOwnerEmail as string|null,
    users:(sets[1]??[]).map(u=>({id:String(u.ContactId).toLowerCase(),displayName:u.DisplayName as string,email:u.Email as string,role:u.IntendedRole as string,invitationStatus:u.InvitationStatus as string}))};
}
export async function saveCustomer(actor:Actor,organizationId:string,input:CustomerInput,creating:boolean){
  await (await request(actor)).input('OrganizationId',sql.UniqueIdentifier,organizationId)
    .input('DisplayName',sql.NVarChar(200),input.profile.companyName).input('PrimaryContactEmail',sql.NVarChar(254),input.profile.primaryContactEmail)
    .input('ProfileJson',sql.NVarChar(sql.MAX),JSON.stringify(input.profile)).input('ContactsJson',sql.NVarChar(sql.MAX),JSON.stringify(input.users))
    .input('Create',sql.Bit,creating).input('ExpectedVersion',sql.VarChar(18),input.version??null).execute('security.ManagementSaveCustomer');
  return getCustomer(actor,organizationId);
}
