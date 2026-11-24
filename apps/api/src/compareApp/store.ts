import sql from 'mssql';
import {datasetCatalog,isSnapshotType,type DataType} from '../audits/catalog.js';
import {withTenant} from '../storage/sqlTenantStore.js';
import type {EvidenceRow} from './compareEvidence.js';

const MAX_ROWS=20000;
const MAX_SOURCE_BYTES=16*1024*1024;
export class CompareCapacityError extends Error {}

export async function readPair(tenantId:string,baselineId:string,comparisonId:string,dataset:DataType) {
  const snapshot=isSnapshotType(dataset);
  const table=snapshot?datasetCatalog[dataset].table:dataset==='licenses'?'AuditLicenses':'AuditLicenseAssignments';
  const childColumns=snapshot&&'parent' in datasetCatalog[dataset]?
    ',ParentSourceId,ChildSourceId,SettingDefinitionId,TargetType,GroupId,FilterId,FilterType':'';
  const columns=snapshot?'SourceId,DisplayName,State,SourceCreatedAtUtc,SourceUpdatedAtUtc,SourceJson'+childColumns:
    dataset==='licenses'?'SourceId,SkuId,SkuPartNumber,ProductName,EnabledUnits,SuspendedUnits,WarningUnits,ConsumedUnits,CapabilityStatus,AppliesTo':
    'UserId,SkuId,AssignmentSource,UserPrincipalName,Email,DisplayName,AssignmentType,AssignmentState,AssignmentError,SourceUpdatedAtUtc,DisabledPlansJson';
  const sourceColumn=snapshot?'SourceJson':dataset==='licenseAssignments'?'DisabledPlansJson':undefined;
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const request=()=>new sql.Request(transaction)
      .input('organization',sql.UniqueIdentifier,organizationId).input('tenant',sql.UniqueIdentifier,tenantId)
      .input('baseline',sql.UniqueIdentifier,baselineId).input('comparison',sql.UniqueIdentifier,comparisonId);
    const scope='WHERE OrganizationId=@organization AND TenantId=@tenant AND ScanId IN (@baseline,@comparison)';
    const result=await request().query(`SELECT COUNT_BIG(*) Total,
      ${sourceColumn?`SUM(CONVERT(bigint,DATALENGTH(${sourceColumn})))`:'0'} SourceBytes FROM app.[${table}] ${scope};`);
    if(Number(result.recordset[0].Total)>MAX_ROWS||Number(result.recordset[0].SourceBytes)>MAX_SOURCE_BYTES)
      throw new CompareCapacityError('This dataset exceeds the comparison size limit.');
    const output=await request().query(`SELECT ScanId,${columns} FROM app.[${table}] ${scope} ORDER BY
      ${dataset==='licenseAssignments'?'UserId,SkuId,AssignmentSource':'SourceId'};`);
    const before:EvidenceRow[]=[],after:EvidenceRow[]=[];
    for(const {ScanId,...row} of output.recordset){
      (String(ScanId).toLowerCase()===baselineId?before:after).push(row);
    }
    return {before,after};
  });
}
