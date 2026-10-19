import sql from 'mssql';
import type { BaselineResult } from '../scoring/baseline.js';
import type { TenantBootstrapRecord } from './tableTenantStore.js';
import { getSqlPool, uuidPattern, withOrganization } from './sql.js';

type Entity = Record<string, unknown>;
type Finding = { checkId: string; title: string; status: string; detail: string; evidence?: unknown };
type ScanStatus = NonNullable<TenantBootstrapRecord['latestScan']>['status'];

export async function assertSqlCutoverActivated():Promise<void> {
  const pool=await getSqlPool();
  const state=await pool.request().execute('security.GetScanStorageState');
  if(state.recordset[0]?.Backend!=='sql') throw new Error('SQL scan storage has not passed cutover verification.');
}

async function withTenant<T>(tenantId: string, operation: (transaction: sql.Transaction, organizationId: string) => Promise<T>): Promise<T> {
  if (!uuidPattern.test(tenantId)) throw new Error('Invalid tenant identifier.');
  const pool = await getSqlPool();
  // This ID is supplied by the verified Entra token on the existing /me endpoints.
  // Future client routes must resolve explicit membership instead of using this legacy path.
  const result = await pool.request().input('TenantId', sql.UniqueIdentifier, tenantId).execute('security.ResolveEntraOrganization');
  const organizationId: unknown = result.recordset[0]?.OrganizationId;
  if (typeof organizationId !== 'string') throw new Error('This tenant has no approved customer workspace.');
  return withOrganization(organizationId, (transaction) => operation(transaction, organizationId));
}

function request(transaction: sql.Transaction, organizationId: string, tenantId: string) {
  return new sql.Request(transaction).input('organizationId', sql.UniqueIdentifier, organizationId).input('tenantId', sql.UniqueIdentifier, tenantId);
}
function entity(row: { EntityJson: string } | undefined): Entity | undefined {
  return row ? JSON.parse(row.EntityJson) as Entity : undefined;
}

export async function getTenantBootstrap(tenantId: string): Promise<TenantBootstrapRecord> {
  // An unregistered tenant can see setup, but cannot auto-provision a customer organization.
  const pool = await getSqlPool();
  const mapping = await pool.request().input('TenantId', sql.UniqueIdentifier, tenantId).execute('security.ResolveEntraOrganization');
  if (!mapping.recordset[0]) return { tenantId, registered:false, consentStatus:'notConfigured', azureRbacStatus:'notConfigured', latestScan:null, destination:'onboarding' };
  return withTenant(tenantId, async (transaction, organizationId) => {
    const registration = entity((await request(transaction,organizationId,tenantId)
      .query('SELECT EntityJson FROM app.TenantRegistrations WHERE OrganizationId=@organizationId AND TenantId=@tenantId')).recordset[0]);
    let latestScan: TenantBootstrapRecord['latestScan'] = null;
    if (typeof registration?.lastScanId === 'string' && uuidPattern.test(registration.lastScanId)) {
      const scan = entity((await request(transaction,organizationId,tenantId).input('scanId',sql.UniqueIdentifier,registration.lastScanId)
        .query('SELECT EntityJson FROM app.ScanRuns WHERE OrganizationId=@organizationId AND TenantId=@tenantId AND ScanId=@scanId')).recordset[0]);
      if (scan) latestScan = { scanId:registration.lastScanId, tenantId, status:scan.status as ScanStatus, createdAt:String(scan.createdAt),
        ...(typeof scan.completedAt==='string'?{completedAt:scan.completedAt}:{}), ...(typeof scan.score==='number'?{score:scan.score}:{}) };
    }
    const destination = latestScan?.status==='complete'||latestScan?.status==='partial'?'report':latestScan?.status==='queued'||latestScan?.status==='running'?'scan':'onboarding';
    return { tenantId,registered:!!registration,
      consentStatus:(registration?.consentStatus ?? 'notConfigured') as TenantBootstrapRecord['consentStatus'],
      azureRbacStatus:(registration?.azureRbacStatus ?? 'notConfigured') as TenantBootstrapRecord['azureRbacStatus'], latestScan,destination };
  });
}

async function mergeRegistration(transaction: sql.Transaction, organizationId:string, tenantId:string, changes:Entity) {
  const existing = entity((await request(transaction,organizationId,tenantId)
    .query('SELECT EntityJson FROM app.TenantRegistrations WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@organizationId AND TenantId=@tenantId')).recordset[0]);
  const json = JSON.stringify({ ...existing, partitionKey:tenantId, rowKey:'registration', ...changes });
  await request(transaction,organizationId,tenantId).input('json',sql.NVarChar(sql.MAX),json).query(`
    UPDATE app.TenantRegistrations SET EntityJson=@json WHERE OrganizationId=@organizationId AND TenantId=@tenantId;
    IF @@ROWCOUNT=0 INSERT app.TenantRegistrations(OrganizationId,TenantId,EntityJson) VALUES(@organizationId,@tenantId,@json);`);
}

export async function saveAccessCheck(tenantId:string, subscriptionId:string, consentGranted:boolean, azureRbacConfigured:boolean):Promise<void> {
  await withTenant(tenantId, (transaction,organizationId) => mergeRegistration(transaction,organizationId,tenantId,{
    subscriptionId,consentStatus:consentGranted?'granted':'error',azureRbacStatus:azureRbacConfigured?'configured':'partial',accessCheckedAt:new Date().toISOString(),
  }));
}

export async function saveStarterScan(tenantId:string, subscriptionId:string, findings:Finding[], baseline:BaselineResult) {
  return withTenant(tenantId, async(transaction,organizationId) => {
    const scanId=crypto.randomUUID(),now=new Date().toISOString(),score=baseline.score??undefined;
    const scan={partitionKey:tenantId,rowKey:scanId,status:'complete',createdAt:now,completedAt:now,score,subscriptionId,
      baselineId:baseline.baselineId,coverage:baseline.coverage,baselineJson:JSON.stringify(baseline)};
    await request(transaction,organizationId,tenantId).input('scanId',sql.UniqueIdentifier,scanId).input('json',sql.NVarChar(sql.MAX),JSON.stringify(scan))
      .query('INSERT app.ScanRuns(OrganizationId,TenantId,ScanId,EntityJson) VALUES(@organizationId,@tenantId,@scanId,@json)');
    for(const finding of findings) {
      const {evidence,...fields}=finding;
      const row={partitionKey:`${tenantId}:${scanId}`,rowKey:finding.checkId,...fields,...(evidence===undefined?{}:{evidenceJson:JSON.stringify(evidence)})};
      await request(transaction,organizationId,tenantId).input('scanId',sql.UniqueIdentifier,scanId).input('checkId',sql.NVarChar(256),finding.checkId)
        .input('json',sql.NVarChar(sql.MAX),JSON.stringify(row)).query('INSERT app.ScanFindings(OrganizationId,TenantId,ScanId,CheckId,EntityJson) VALUES(@organizationId,@tenantId,@scanId,@checkId,@json)');
    }
    await mergeRegistration(transaction,organizationId,tenantId,{lastScanId:scanId});
    return {scanId,tenantId,status:'complete' as const,createdAt:now,completedAt:now,score,baseline,findings};
  });
}

export async function getStarterScan(tenantId:string,scanId:string) {
  if(!uuidPattern.test(scanId)) return null;
  return withTenant(tenantId,async(transaction,organizationId) => {
    const scan=entity((await request(transaction,organizationId,tenantId).input('scanId',sql.UniqueIdentifier,scanId)
      .query('SELECT EntityJson FROM app.ScanRuns WHERE OrganizationId=@organizationId AND TenantId=@tenantId AND ScanId=@scanId')).recordset[0]);
    if(!scan) return null;
    const rows=await request(transaction,organizationId,tenantId).input('scanId',sql.UniqueIdentifier,scanId)
      .query('SELECT CheckId,EntityJson FROM app.ScanFindings WHERE OrganizationId=@organizationId AND TenantId=@tenantId AND ScanId=@scanId ORDER BY CheckId');
    const findings:Finding[]=rows.recordset.map((row:{CheckId:string;EntityJson:string})=>{
      const value=JSON.parse(row.EntityJson) as Entity;
      return {checkId:row.CheckId,title:String(value.title),status:String(value.status),detail:String(value.detail),
        ...(typeof value.evidenceJson==='string'?{evidence:JSON.parse(value.evidenceJson) as unknown}:{})};
    });
    return {scanId,tenantId,status:scan.status as ScanStatus,createdAt:String(scan.createdAt),
      completedAt:scan.completedAt as string|undefined,score:scan.score as number|undefined,subscriptionId:scan.subscriptionId as string|undefined,
      ...(typeof scan.baselineJson==='string'?{baseline:JSON.parse(scan.baselineJson) as BaselineResult}:{}),findings};
  });
}

export async function listTenantScans(tenantId:string,limit=25) {
  return withTenant(tenantId,async(transaction,organizationId)=>{
    const result=await request(transaction,organizationId,tenantId).input('limit',sql.Int,Math.max(1,Math.min(100,Math.floor(limit))))
      .query('SELECT TOP(@limit) ScanId,EntityJson FROM app.ScanRuns WHERE OrganizationId=@organizationId AND TenantId=@tenantId ORDER BY CreatedAt DESC,ScanId');
    return result.recordset.map((row:{ScanId:string;EntityJson:string})=>{
      const scan=JSON.parse(row.EntityJson) as Entity;
      return {scanId:String(scan.rowKey),status:scan.status as ScanStatus,createdAt:String(scan.createdAt),completedAt:scan.completedAt as string|undefined,score:scan.score as number|undefined};
    });
  });
}
