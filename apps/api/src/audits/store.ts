import sql from 'mssql';
import { getSqlPool, uuidPattern, withOrganization } from '../storage/sql.js';
import { assertSqlCutoverActivated, withTenant } from '../storage/sqlTenantStore.js';
import type { AssignmentRecord, LicenseDataType, LicenseRecord } from './licensing.js';
import {allDataTypes,datasetCatalog,isSnapshotType,type DataType,type SnapshotRecord,type SnapshotDataType} from './catalog.js';
import type {IntuneCursor,ParentSnapshot} from './intune.js';

export interface CollectionJob {
  OrganizationId:string; TenantId:string; ScanId:string; DataType:DataType;
  NextLink:string|null; LeaseId:string; Attempts:number;
}
export async function requireAuditSql():Promise<void> {
  if (process.env.TENANT_STORE !== 'sql') throw new Error('Data audits require SQL scan storage.');
  await assertSqlCutoverActivated();
}
function scoped(transaction:sql.Transaction, organizationId:string, tenantId:string, scanId:string) {
  return new sql.Request(transaction).input('OrganizationId',sql.UniqueIdentifier,organizationId)
    .input('TenantId',sql.UniqueIdentifier,tenantId).input('ScanId',sql.UniqueIdentifier,scanId);
}
function jobRequest(transaction:sql.Transaction, job:CollectionJob) {
  return scoped(transaction,job.OrganizationId,job.TenantId,job.ScanId)
    .input('DataType',sql.VarChar(32),job.DataType).input('LeaseId',sql.UniqueIdentifier,job.LeaseId);
}
export async function createDataAudit(tenantId:string, initiatedBy:string,subscriptionId?:string) {
  await requireAuditSql();
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const scanId=crypto.randomUUID(),createdAt=new Date().toISOString();
    const scope=subscriptionId?'tenant':'licensing';
    const scan={partitionKey:tenantId,rowKey:scanId,status:'queued',createdAt,auditScope:scope,...(subscriptionId?{subscriptionId}:{})};
    await scoped(transaction,organizationId,tenantId,scanId).input('json',sql.NVarChar(sql.MAX),JSON.stringify(scan))
      .input('InitiatedBy',sql.UniqueIdentifier,initiatedBy).input('Scope',sql.VarChar(32),scope)
      .input('SubscriptionId',sql.UniqueIdentifier,subscriptionId??null).query(`
      INSERT app.ScanRuns(OrganizationId,TenantId,ScanId,EntityJson) VALUES(@OrganizationId,@TenantId,@ScanId,@json);
      INSERT app.DataAudits(OrganizationId,TenantId,ScanId,Scope,Status,InitiatedBy,CollectorVersion,SubscriptionId)
      VALUES(@OrganizationId,@TenantId,@ScanId,@Scope,'queued',@InitiatedBy,'tenant-data-v3-roles',@SubscriptionId);
      UPDATE app.TenantRegistrations SET EntityJson=JSON_MODIFY(EntityJson,'$.lastScanId',CONVERT(varchar(36),@ScanId))
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId;
      IF @@ROWCOUNT=0 INSERT app.TenantRegistrations(OrganizationId,TenantId,EntityJson)
        VALUES(@OrganizationId,@TenantId,JSON_MODIFY(N'{}','$.lastScanId',CONVERT(varchar(36),@ScanId)));`);
    for (const dataType of subscriptionId?allDataTypes:['licenses','licenseAssignments']) {
      await scoped(transaction,organizationId,tenantId,scanId).input('DataType',sql.VarChar(32),dataType)
        .query(`INSERT app.AuditCollections(OrganizationId,TenantId,ScanId,DataType,Status) VALUES(@OrganizationId,@TenantId,@ScanId,@DataType,'queued');`);
      await scoped(transaction,organizationId,tenantId,scanId).input('DataType',sql.VarChar(32),dataType)
        .execute('security.EnqueueAuditCollection');
    }
    return {scanId,tenantId,status:'queued',createdAt,auditScope:scope};
  });
}
export async function claimCollection():Promise<CollectionJob|undefined> {
  const result=await (await getSqlPool()).request().execute('security.ClaimAuditCollection');
  return result.recordset[0] as CollectionJob|undefined;
}
export async function startCollection(job:CollectionJob):Promise<void> {
  await withOrganization(job.OrganizationId,async transaction=>{
    await jobRequest(transaction,job).execute('security.LockAuditCollection');
    await jobRequest(transaction,job).query(`
      UPDATE app.DataAudits WITH(UPDLOCK) SET Status='running',StartedAtUtc=COALESCE(StartedAtUtc,SYSUTCDATETIME())
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND Status IN ('queued','running');
      UPDATE app.AuditCollections SET Status='running',StartedAtUtc=COALESCE(StartedAtUtc,SYSUTCDATETIME())
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND DataType=@DataType;
      UPDATE app.ScanRuns SET EntityJson=JSON_MODIFY(EntityJson,'$.status','running')
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`);
  });
}

// Identifiers/types below are static code, never derived from requests or Graph responses.
const licenseColumns = {
  SourceId:['nvarchar(128)','sourceId'],SkuId:['uniqueidentifier','skuId'],SkuPartNumber:['nvarchar(256)','skuPartNumber'],
  ProductName:['nvarchar(256)','productName'],EnabledUnits:['bigint','enabledUnits'],SuspendedUnits:['bigint','suspendedUnits'],
  WarningUnits:['bigint','warningUnits'],ConsumedUnits:['bigint','consumedUnits'],CapabilityStatus:['nvarchar(64)','capabilityStatus'],
  AppliesTo:['nvarchar(32)','appliesTo'],CollectedAtUtc:['datetime2','collectedAtUtc'],
};
const assignmentColumns = {
  UserId:['uniqueidentifier','userId'],SkuId:['uniqueidentifier','skuId'],AssignmentSource:['nvarchar(64)','assignmentSource'],
  UserPrincipalName:['nvarchar(320)','userPrincipalName'],Email:['nvarchar(320)','email'],DisplayName:['nvarchar(256)','displayName'],
  AssignmentType:['varchar(16)','assignmentType'],AssignmentState:['nvarchar(64)','assignmentState'],
  AssignmentError:['nvarchar(128)','assignmentError'],DisabledPlansJson:['nvarchar(max)','disabledPlansJson'],
  SourceUpdatedAtUtc:['datetime2','sourceUpdatedAtUtc'],CollectedAtUtc:['datetime2','collectedAtUtc'],
};
const snapshotColumns={SourceId:['nvarchar(450)','sourceId'],DisplayName:['nvarchar(512)','displayName'],State:['nvarchar(128)','state'],
  SourceCreatedAtUtc:['datetime2','sourceCreatedAtUtc'],SourceUpdatedAtUtc:['datetime2','sourceUpdatedAtUtc'],SourceJson:['nvarchar(max)','sourceJson'],CollectedAtUtc:['datetime2','collectedAtUtc']};
function evidenceTable(dataType:DataType):string{return isSnapshotType(dataType)?`app.${datasetCatalog[dataType].table}`:dataType==='licenses'?'app.AuditLicenses':'app.AuditLicenseAssignments';}
function insertPage(dataType:DataType):string {
  const columns=isSnapshotType(dataType)?{...snapshotColumns,...('parent' in datasetCatalog[dataType]?intuneColumns:{})}:dataType==='licenses'?licenseColumns:assignmentColumns;
  const table=evidenceTable(dataType);
  const keys=dataType==='licenseAssignments'?['UserId','SkuId','AssignmentSource']:['SourceId'];
  const names=Object.keys(columns);
  const definitions=Object.entries(columns).map(([name,[type,path]])=>`${name} ${type} '$.${path}'`).join(',');
  const match=['OrganizationId=@OrganizationId','TenantId=@TenantId','ScanId=@ScanId',...keys.map(key=>`${key}=page.${key}`)].map(s=>`existing.${s}`).join(' AND ');
  // A replayed page inserts only missing keys. The cursor advances in this same transaction.
  return `INSERT ${table}(OrganizationId,TenantId,ScanId,${names.join(',')})
    SELECT @OrganizationId,@TenantId,@ScanId,${names.map(n=>`page.${n}`).join(',')}
    FROM OPENJSON(@Rows) WITH(${definitions}) page
    WHERE NOT EXISTS(SELECT 1 FROM ${table} existing WHERE ${match});`;
}

export async function checkpointCollection(job:CollectionJob, records:LicenseRecord[]|AssignmentRecord[]|SnapshotRecord[],
  nextLink:string|null, error?:{code:string;missingAccess:boolean}):Promise<void> {
  await withOrganization(job.OrganizationId,async transaction=>{
    await jobRequest(transaction,job).execute('security.LockAuditCollection');
    // Serializes finalization of sibling datasets without holding locks during HTTP calls.
    await jobRequest(transaction,job).query(`SELECT ScanId FROM app.DataAudits WITH(UPDLOCK,HOLDLOCK)
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`);
    if(records.length) await jobRequest(transaction,job).input('Rows',sql.NVarChar(sql.MAX),JSON.stringify(records)).query(insertPage(job.DataType));
    const finished=!!error||nextLink===null;
    const table=evidenceTable(job.DataType);
    await jobRequest(transaction,job).input('Finished',sql.Bit,finished)
      .input('ErrorCode',sql.VarChar(64),error?.code??null).input('MissingAccess',sql.Bit,error?.missingAccess??false)
      .query(`DECLARE @Count int=(SELECT COUNT(*) FROM ${table} WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId);
      UPDATE app.AuditCollections SET RecordCount=@Count,ErrorCode=@ErrorCode,
        Status=CASE WHEN @ErrorCode IS NOT NULL THEN CASE WHEN @Count>0 THEN 'partial' WHEN @MissingAccess=1 THEN 'missingAccess' ELSE 'failed' END
          WHEN @Finished=1 THEN 'complete' ELSE 'running' END,
        CompletedAtUtc=CASE WHEN @Finished=1 THEN SYSUTCDATETIME() ELSE NULL END
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND DataType=@DataType;
      IF NOT EXISTS(SELECT 1 FROM app.AuditCollections WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND Status IN ('queued','running'))
      BEGIN
        DECLARE @Status varchar(16)=CASE
          WHEN NOT EXISTS(SELECT 1 FROM app.AuditCollections WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND Status<>'complete') THEN 'complete'
          WHEN EXISTS(SELECT 1 FROM app.AuditCollections WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND (Status='complete' OR RecordCount>0)) THEN 'partial'
          ELSE 'failed' END;
        UPDATE app.DataAudits SET Status=@Status,CompletedAtUtc=SYSUTCDATETIME()
          WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;
        UPDATE app.ScanRuns SET EntityJson=JSON_MODIFY(JSON_MODIFY(EntityJson,'$.status',@Status),'$.completedAt',CONVERT(varchar(33),SYSUTCDATETIME(),126)+'Z')
          WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;
      END;`);
    await jobRequest(transaction,job).input('NextLink',sql.NVarChar(4000),nextLink).input('Finished',sql.Bit,finished)
      .execute('security.CheckpointAuditCollection');
  });
}

export async function getDataAudit(tenantId:string,scanId:string) {
  await requireAuditSql();
  if(!uuidPattern.test(scanId))return null;
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const audit=(await scoped(transaction,organizationId,tenantId,scanId).query(`SELECT ScanId,Scope,Status,
      CollectorVersion,SubscriptionId,CreatedAtUtc,StartedAtUtc,CompletedAtUtc FROM app.DataAudits
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`)).recordset[0];
    if(!audit)return null;
    const collections=(await scoped(transaction,organizationId,tenantId,scanId).query(`SELECT DataType,Status,
      StartedAtUtc,CompletedAtUtc,RecordCount,ErrorCode FROM app.AuditCollections
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId ORDER BY DataType;`)).recordset;
    return {audit,collections:collections.map(row=>{
      const dataType=String(row.DataType);
      return {...row,...(isSnapshotType(dataType)?{Label:datasetCatalog[dataType].label,Category:datasetCatalog[dataType].category}:{Label:dataType==='licenses'?'Licenses':'License assignments',Category:'Licensing'})};
    })};
  });
}
export async function getLicenseRows(tenantId:string,scanId:string,dataType:LicenseDataType,
  page:number,search:string,skuId?:string) {
  await requireAuditSql();
  if(!uuidPattern.test(scanId))return null;
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const exists=(await scoped(transaction,organizationId,tenantId,scanId).query(`SELECT 1 FROM app.DataAudits
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`)).recordset[0];
    if(!exists)return null;
    const isLicenses=dataType==='licenses';
    const table=isLicenses?'app.AuditLicenses':'app.AuditLicenseAssignments';
    const fields=isLicenses?'SourceId,SkuId,SkuPartNumber,ProductName,EnabledUnits,SuspendedUnits,WarningUnits,ConsumedUnits,CapabilityStatus,AppliesTo,CollectedAtUtc,StoredAtUtc':
      'UserId,SkuId,AssignmentSource,UserPrincipalName,Email,DisplayName,AssignmentType,AssignmentState,AssignmentError,SourceUpdatedAtUtc,CollectedAtUtc,StoredAtUtc';
    const from=isLicenses?`${table} evidence`:`${table} evidence OUTER APPLY
      (SELECT TOP(1) SkuPartNumber,ProductName FROM app.AuditLicenses l WHERE l.OrganizationId=evidence.OrganizationId
        AND l.TenantId=evidence.TenantId AND l.ScanId=evidence.ScanId AND l.SkuId=evidence.SkuId ORDER BY l.SourceId) product`;
    const searchable=isLicenses?['SkuPartNumber','ProductName','CONVERT(nvarchar(36),evidence.SkuId)']:
      ['UserPrincipalName','Email','DisplayName','AssignmentType','product.SkuPartNumber','product.ProductName','CONVERT(nvarchar(36),evidence.SkuId)'];
    const where=`evidence.OrganizationId=@OrganizationId AND evidence.TenantId=@TenantId AND evidence.ScanId=@ScanId
      AND (@SkuId IS NULL OR evidence.SkuId=@SkuId)
      AND (@Search='' OR ${searchable.map(f=>`CHARINDEX(@Search,${f})>0`).join(' OR ')})`;
    const result=await scoped(transaction,organizationId,tenantId,scanId).input('Offset',sql.Int,(page-1)*50)
      .input('Search',sql.NVarChar(200),search).input('SkuId',sql.UniqueIdentifier,skuId??null)
      .query(`SELECT COUNT(*) Total FROM ${from} WHERE ${where};
        SELECT ${fields.split(',').map(f=>`evidence.${f}`).join(',')}${isLicenses?'':',product.SkuPartNumber,product.ProductName'} FROM ${from} WHERE ${where}
        ORDER BY ${isLicenses?'evidence.SkuPartNumber,evidence.SourceId':'evidence.UserId,evidence.SkuId,evidence.AssignmentSource'}
        OFFSET @Offset ROWS FETCH NEXT 50 ROWS ONLY;`);
    const sets=result.recordsets as sql.IRecordSet<unknown>[];
    return {rows:sets[1]??[],total:(sets[0]?.[0] as {Total:number}|undefined)?.Total??0,page,pageSize:50};
  });
}

export async function getJobSubscription(job:CollectionJob):Promise<string|null>{
  return withOrganization(job.OrganizationId,async transaction=>{
    const row=(await jobRequest(transaction,job).query(`SELECT SubscriptionId FROM app.DataAudits
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`)).recordset[0];
    return row?.SubscriptionId??null;
  });
}
export async function getSnapshotRows(tenantId:string,scanId:string,dataType:SnapshotDataType,page:number,search:string){
  await requireAuditSql();
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const table=evidenceTable(dataType);
    const exists=(await scoped(transaction,organizationId,tenantId,scanId).query(`SELECT 1 FROM app.DataAudits WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId;`)).recordset[0];
    if(!exists)return null;
    const where=`OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND
      (@Search='' OR CHARINDEX(@Search,DisplayName)>0 OR CHARINDEX(@Search,SourceId)>0 OR CHARINDEX(@Search,SourceJson)>0)`;
    const result=await scoped(transaction,organizationId,tenantId,scanId).input('Offset',sql.Int,(page-1)*50)
      .input('Search',sql.NVarChar(200),search).query(`SELECT COUNT(*) Total FROM ${table} WHERE ${where};
      SELECT SourceId,DisplayName,State,SourceCreatedAtUtc,SourceUpdatedAtUtc,SourceJson,CollectedAtUtc,StoredAtUtc${'parent' in datasetCatalog[dataType]?','+Object.keys(intuneColumns).join(','):''} FROM ${table}
      WHERE ${where} ORDER BY SourceId OFFSET @Offset ROWS FETCH NEXT 50 ROWS ONLY;`);
    const sets=result.recordsets as sql.IRecordSet<unknown>[];
    return {rows:sets[1]??[],total:(sets[0]?.[0] as {Total:number}|undefined)?.Total??0,page,pageSize:50};
  });
}

const intuneColumns={ParentSourceId:['nvarchar(450)','parentSourceId'],ChildSourceId:['nvarchar(450)','childSourceId'],
  SettingDefinitionId:['nvarchar(512)','settingDefinitionId'],TargetType:['nvarchar(128)','targetType'],GroupId:['nvarchar(128)','groupId'],
  FilterId:['nvarchar(128)','filterId'],FilterType:['nvarchar(64)','filterType']};
export async function nextIntuneParent(job:CollectionJob,cursor:IntuneCursor):Promise<{parent:ParentSnapshot|null;status:string}>{
  if(!isSnapshotType(job.DataType))throw new Error('Invalid child type.');
  const source=datasetCatalog[job.DataType];
  if(!('parent' in source))throw new Error('Invalid child type.');
  return withOrganization(job.OrganizationId,async transaction=>{
    const result=await jobRequest(transaction,job).input('ParentType',sql.VarChar(32),source.parent)
      .input('After',sql.NVarChar(450),cursor.after).query(`
      SELECT Status FROM app.AuditCollections WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND DataType=@ParentType;
      SELECT TOP(1) SourceId,DisplayName FROM ${evidenceTable(source.parent)}
      WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND SourceId${cursor.page?'=':'>'}@After ORDER BY SourceId;`);
    const sets=result.recordsets as sql.IRecordSet<any>[];
    const status=sets[0]?.[0]?.Status??'failed',row=sets[1]?.[0];
    return {status,parent:row?{sourceId:row.SourceId,displayName:row.DisplayName,status}:null};
  });
}
