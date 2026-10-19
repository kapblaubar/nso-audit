// Administrative nomination only. Never creates a password or marks an email verified.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sql=require('mssql');
const {AzureCliCredential}=require('@azure/identity');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const organizationId=process.env.OWNER_ORGANIZATION_ID;
const tenantId=process.env.MANAGEMENT_TENANT_ID;
const objectId=process.env.MANAGEMENT_OBJECT_ID;
const previousEmail=process.env.PREVIOUS_CLIENT_EMAIL?.trim().toLowerCase();
const targetEmail=process.env.TARGET_CLIENT_EMAIL?.trim().toLowerCase();
if(![organizationId,tenantId,objectId].every(value=>uuid.test(value??''))) throw new Error('Explicit organization and management principal IDs are required.');
if(![previousEmail,targetEmail].every(value=>value && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || previousEmail===targetEmail) throw new Error('Distinct previous and target client emails are required.');
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
// Ensure audit attribution is the actual authenticated operator, not a supplied identity.
const claims=JSON.parse(Buffer.from(token.token.split('.')[1],'base64url').toString('utf8'));
if(claims.tid?.toLowerCase()!==tenantId.toLowerCase() || claims.oid?.toLowerCase()!==objectId.toLowerCase()) throw new Error('Authenticated operator does not match the requested management actor.');
const pool=await new sql.ConnectionPool({server:process.env.SQL_SERVER,database:process.env.SQL_DATABASE,
  authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},
  options:{encrypt:true,trustServerCertificate:false}}).connect();
const transaction=new sql.Transaction(pool);
try{
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const result=await new sql.Request(transaction).input('organizationId',sql.UniqueIdentifier,organizationId)
    .input('tenantId',sql.UniqueIdentifier,tenantId).input('objectId',sql.UniqueIdentifier,objectId)
    .input('previousEmail',sql.NVarChar(254),previousEmail).input('targetEmail',sql.NVarChar(254),targetEmail).query(`
      IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@tenantId AND EntraObjectId=@objectId AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin'))
        THROW 51000,'An active NewSommer management role is required.',1;
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@organizationId;
      IF NOT EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@organizationId AND Status='active')
        THROW 51000,'Active workspace not found.',1;
      IF EXISTS(SELECT 1 FROM security.WorkspaceOwnershipRequests WHERE OrganizationId=@organizationId
          AND (PreviousClientEmail<>@previousEmail OR TargetClientEmail<>@targetEmail))
        THROW 51000,'A different ownership request already exists; explicit review required.',1;
      IF NOT EXISTS(SELECT 1 FROM security.WorkspaceOwnershipRequests WHERE OrganizationId=@organizationId)
      BEGIN
        INSERT security.WorkspaceOwnershipRequests(OrganizationId,PreviousClientEmail,TargetClientEmail,RequestedByTenantId,RequestedByObjectId)
          VALUES(@organizationId,@previousEmail,@targetEmail,@tenantId,@objectId);
        INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
          VALUES(@organizationId,'entra',CONVERT(nvarchar(36),@objectId),'workspace.ownerTransferRequested');
      END;
      SELECT CASE WHEN CompletedAt IS NULL THEN 'pendingVerifiedClient' ELSE 'completed' END AS TransferStatus
        FROM security.WorkspaceOwnershipRequests WHERE OrganizationId=@organizationId;
      SELECT COUNT(*) AS MatchingClientAccounts,
        SUM(CASE WHEN EmailVerifiedAt IS NOT NULL AND DisabledAt IS NULL THEN 1 ELSE 0 END) AS VerifiedActiveAccounts
        FROM identitydata.Users WHERE NormalizedEmail=@targetEmail;
      SELECT COUNT(*) AS ChrisManagementRoles FROM identitydata.ManagementUsers
        WHERE EntraTenantId=@tenantId AND EntraObjectId=@objectId AND DisabledAt IS NULL;
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;`);
  await transaction.commit();
  console.log(JSON.stringify({status:result.recordsets[0][0].TransferStatus,
    targetAccountExists:result.recordsets[1][0].MatchingClientAccounts>0,
    targetVerified:result.recordsets[1][0].VerifiedActiveAccounts>0,
    managementAccessPreserved:result.recordsets[2][0].ChrisManagementRoles===1}));
}catch(error){
  await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>undefined);
  await transaction.rollback().catch(()=>undefined);throw error;
}finally{await pool.close();}
