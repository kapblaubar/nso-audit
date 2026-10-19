import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { canonical, digest, entityIdentity, validateMappings } from './lib/legacy-model.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { TableClient } = require('@azure/data-tables');
const { AzureCliCredential } = require('@azure/identity');
const sql = require('mssql');
const credential = new AzureCliCredential();
const account = process.env.SOURCE_STORAGE_ACCOUNT;
if (!/^[a-z0-9]{3,24}$/.test(account ?? '')) throw new Error('Set SOURCE_STORAGE_ACCOUNT.');
const source = {};
for (const table of ['tenants','scans','findings']) {
  source[table] = [];
  const client = new TableClient(`https://${account}.table.core.windows.net`, table, credential);
  for await (const entity of client.listEntities()) source[table].push(entity);
  source[table].sort((a,b) => `${a.partitionKey}/${a.rowKey}`.localeCompare(`${b.partitionKey}/${b.rowKey}`));
}
const tenantIds = [...new Set(Object.entries(source).flatMap(([table,entities]) => entities.map((entity) => entityIdentity(table,entity).tenantId)))].sort();
const counts = Object.fromEntries(Object.entries(source).map(([table,entities]) => [table, entities.length]));
console.log(JSON.stringify({ counts, tenantIds, sourceDigest: digest(source) }));
const command = process.argv[2];
if (command === 'inspect') process.exit(0);
if (!['copy','verify','activate'].includes(command)) throw new Error('Usage: migrate-table-data.mjs inspect|copy|verify|activate');
const mappings = JSON.parse(await readFile(process.env.TENANT_MAPPING_FILE, 'utf8'));
validateMappings(mappings,tenantIds);
const token = await credential.getToken('https://database.windows.net/.default');
const pool = await new sql.ConnectionPool({ server:process.env.SQL_SERVER, database:process.env.SQL_DATABASE,
  authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},
  options:{encrypt:true,trustServerCertificate:false}, pool:{max:1,min:0}, requestTimeout:60000 }).connect();
const tableNames = { tenants:'TenantRegistrations',scans:'ScanRuns',findings:'ScanFindings' };
const transaction = new sql.Transaction(pool);
try {
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const request = () => new sql.Request(transaction);
  const state = await request().query('SELECT Backend FROM dbo.ScanStorageCutover WITH(UPDLOCK,HOLDLOCK) WHERE Id=1');
  if (state.recordset[0]?.Backend !== 'tables') throw new Error('SQL is authoritative; refusing source replay or legacy verification after cutover.');
  if (command === 'copy') {
    for (const tenantId of tenantIds) {
      const mapping = mappings[tenantId];
      await request().input('organizationId',sql.UniqueIdentifier,mapping.organizationId).input('tenantId',sql.UniqueIdentifier,tenantId)
        .input('displayName',sql.NVarChar(200),mapping.displayName).query(`
          EXEC sys.sp_set_session_context @key=N'organizationId',@value=@organizationId;
          IF EXISTS(SELECT 1 FROM security.EntraConnections WHERE TenantId=@tenantId AND OrganizationId<>@organizationId)
            THROW 51000,'Tenant organization mapping mismatch.',1;
          IF NOT EXISTS(SELECT 1 FROM app.Organizations WHERE OrganizationId=@organizationId)
            INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@organizationId,@displayName);
          IF NOT EXISTS(SELECT 1 FROM security.EntraConnections WHERE TenantId=@tenantId)
            INSERT security.EntraConnections(TenantId,OrganizationId) VALUES(@tenantId,@organizationId);`);
    }
    for (const [table,entities] of Object.entries(source)) {
      for (const entity of entities) {
        const identity = entityIdentity(table,entity);
        const req = request().input('organizationId',sql.UniqueIdentifier,mappings[identity.tenantId].organizationId)
          .input('tenantId',sql.UniqueIdentifier,identity.tenantId).input('json',sql.NVarChar(sql.MAX),canonical(entity));
        let keys = 'OrganizationId=@organizationId AND TenantId=@tenantId';
        let columns = 'OrganizationId,TenantId',values='@organizationId,@tenantId';
        if (identity.scanId) { req.input('scanId',sql.UniqueIdentifier,identity.scanId); keys+=' AND ScanId=@scanId';columns+=',ScanId';values+=',@scanId'; }
        if (identity.checkId) { req.input('checkId',sql.NVarChar(256),identity.checkId); keys+=' AND CheckId=@checkId';columns+=',CheckId';values+=',@checkId'; }
        await req.query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@organizationId;
          UPDATE app.${tableNames[table]} SET EntityJson=@json WHERE ${keys};
          IF @@ROWCOUNT=0 INSERT app.${tableNames[table]}(${columns},EntityJson) VALUES(${values},@json);`);
      }
    }
  }
  // Compare every entity, including historical baseline/evidence fields, not just row counts.
  for (const [table,entities] of Object.entries(source)) {
    const actual = [];
    for (const tenantId of tenantIds) {
      const result = await request().input('organizationId',sql.UniqueIdentifier,mappings[tenantId].organizationId)
        .input('tenantId',sql.UniqueIdentifier,tenantId).query(`EXEC sys.sp_set_session_context @key=N'organizationId',@value=@organizationId;
          SELECT EntityJson FROM app.${tableNames[table]} WHERE TenantId=@tenantId;`);
      actual.push(...result.recordset.map((row)=>JSON.parse(row.EntityJson)));
    }
    actual.sort((a,b)=>`${a.partitionKey}/${a.rowKey}`.localeCompare(`${b.partitionKey}/${b.rowKey}`));
    if (canonical(actual)!==canonical(entities)) throw new Error(`${table} reconciliation failed; transaction rolled back.`);
    console.log(`Verified ${entities.length} ${table} records including full entity contents.`);
  }
  if (command === 'activate') {
    if (process.env.CONFIRM_APP_STOPPED !== 'yes') throw new Error('Stop the Dev Function before activation and set CONFIRM_APP_STOPPED=yes.');
    await request().input('digest',sql.Char(64),digest(source)).query("UPDATE dbo.ScanStorageCutover SET Backend='sql',VerifiedAt=SYSUTCDATETIME(),SourceDigest=@digest WHERE Id=1;");
  }
  await request().query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;");
  await transaction.commit();
  console.log(command==='activate'?'SQL cutover authorized after exact source reconciliation.':'Copy/verification complete. Source Tables were not modified.');
} catch(error) {
  await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;").catch(()=>undefined);
  await transaction.rollback().catch(()=>undefined);
  throw error;
} finally { await pool.close(); }
