// Uses Azure CLI authentication locally; never accepts a SQL password or prints tokens.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const sql = require('mssql');
const { AzureCliCredential } = require('@azure/identity');
const server = process.env.SQL_SERVER;
const database = process.env.SQL_DATABASE;
if (!server || !database) throw new Error('Set SQL_SERVER and SQL_DATABASE.');
const token = await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool = await new sql.ConnectionPool({
  server, database,
  authentication: { type: 'azure-active-directory-access-token', options: { token: token.token } },
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 1, min: 0 },
  requestTimeout: 60000,
}).connect();

async function migrate() {
  await pool.request().query(`IF OBJECT_ID(N'dbo.SchemaMigrations') IS NULL
    CREATE TABLE dbo.SchemaMigrations (Name nvarchar(200) PRIMARY KEY, Sha256 char(64) NOT NULL,
    AppliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());`);
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((item) => /^\d+_.+\.sql$/.test(item)).sort()) {
    const source = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).query(`DECLARE @r int;
        EXEC @r=sys.sp_getapplock @Resource='nso-schema-migrations', @LockMode='Exclusive',
          @LockOwner='Transaction', @LockTimeout=30000;
        IF @r < 0 THROW 51000, 'Could not acquire migration lock.', 1;`);
      const existing = await new sql.Request(transaction).input('name', sql.NVarChar(200), name)
        .query('SELECT Sha256 FROM dbo.SchemaMigrations WHERE Name=@name');
      if (existing.recordset[0]) {
        if (existing.recordset[0].Sha256 !== checksum) throw new Error(`Applied migration modified: ${name}`);
      } else {
        for (const batch of source.split(/^\s*GO\s*\r?$/gmi).filter((item) => item.trim())) {
          await new sql.Request(transaction).batch(batch);
        }
        await new sql.Request(transaction).input('name', sql.NVarChar(200), name)
          .input('checksum', sql.Char(64), checksum)
          .query('INSERT dbo.SchemaMigrations(Name,Sha256) VALUES (@name,@checksum)');
        console.log(`Applied ${name}`);
      }
      await transaction.commit();
    } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
  }
  console.log('Schema is current.');
}

async function bootstrap() {
  const objectId = process.env.SQL_RUNTIME_OBJECT_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(objectId ?? '')) {
    throw new Error('SQL_RUNTIME_OBJECT_ID must be the managed identity principal/object ID.');
  }
  const bytes = Buffer.from(objectId.replaceAll('-', ''), 'hex');
  const sid = Buffer.concat([bytes.subarray(0,4).reverse(), bytes.subarray(4,6).reverse(), bytes.subarray(6,8).reverse(), bytes.subarray(8)]).toString('hex');
  await pool.request().query(`IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'nso_api_runtime')
      CREATE USER [nso_api_runtime] WITH SID=0x${sid}, TYPE=E;
    IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'nso_api_runtime' AND sid=0x${sid})
      THROW 51000, 'Runtime identity mismatch; explicit repair required.', 1;
    ALTER ROLE nso_runtime ADD MEMBER [nso_api_runtime];`);
  console.log('Runtime identity granted nso_runtime; no schema ownership or migration rights.');
}

async function bootstrapManagement() {
  const tenantId = process.env.MANAGEMENT_TENANT_ID;
  const objectId = process.env.MANAGEMENT_OBJECT_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(tenantId ?? '') || !uuid.test(objectId ?? '')) throw new Error('Set MANAGEMENT_TENANT_ID and MANAGEMENT_OBJECT_ID.');
  await pool.request().input('tenantId', sql.UniqueIdentifier, tenantId).input('objectId', sql.UniqueIdentifier, objectId)
    .query(`IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@tenantId AND EntraObjectId=@objectId)
      INSERT identitydata.ManagementUsers(EntraTenantId,EntraObjectId,Role) VALUES (@tenantId,@objectId,'setupAdmin');
      IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@tenantId AND EntraObjectId=@objectId AND DisabledAt IS NULL)
        THROW 51000, 'Management principal is disabled; explicit review required.', 1;`);
  console.log('Explicit Entra principal provisioned as setup administrator.');
}

async function verifyIsolation() {
  const a = randomUUID(), b = randomUUID();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = () => new sql.Request(transaction);
    for (const id of [a,b]) {
      await request().input('id', sql.UniqueIdentifier, id).query(`EXEC sys.sp_set_session_context @key=N'organizationId', @value=@id;
        INSERT app.Organizations(OrganizationId,DisplayName) VALUES (@id,N'Isolation test');`);
    }
    await request().query("EXECUTE AS USER=N'nso_api_runtime';");
    await request().input('id', sql.UniqueIdentifier, a).query(`EXEC sys.sp_set_session_context @key=N'organizationId', @value=@id;`);
    const result = await request().input('a', sql.UniqueIdentifier, a).input('b', sql.UniqueIdentifier, b)
      .query(`SELECT OrganizationId FROM app.Organizations WHERE OrganizationId IN (@a,@b);`);
    if (result.recordset.length !== 1 || result.recordset[0].OrganizationId.toLowerCase() !== a) throw new Error('Cross-organization read isolation failed.');
    await request().query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=NULL;");
    const empty = await request().input('a', sql.UniqueIdentifier, a).input('b', sql.UniqueIdentifier, b)
      .query('SELECT OrganizationId FROM app.Organizations WHERE OrganizationId IN (@a,@b)');
    if (empty.recordset.length) throw new Error('Missing context did not fail closed.');
    console.log('PASS: organization A cannot read B; missing context cannot read either.');
  } finally {
    await new sql.Request(transaction).query('REVERT;').catch(() => undefined);
    await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=NULL;").catch(() => undefined);
    await transaction.rollback();
  }
  const blocked = new sql.Transaction(pool);
  await blocked.begin();
  let rejected = false;
  try {
    await new sql.Request(blocked).input('a', sql.UniqueIdentifier, a).input('b', sql.UniqueIdentifier, b)
      .query(`EXECUTE AS USER=N'nso_api_runtime';
        EXEC sys.sp_set_session_context @key=N'organizationId', @value=@a;
        INSERT app.Organizations(OrganizationId,DisplayName) VALUES (@b,N'Must be blocked');`);
  } catch (error) {
    if (error.number !== 33504) throw error;
    rejected = true;
  } finally {
    await new sql.Request(blocked).query('REVERT;').catch(() => undefined);
    await new sql.Request(blocked).query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=NULL;").catch(() => undefined);
    await blocked.rollback().catch(() => undefined);
  }
  if (!rejected) throw new Error('Cross-organization insert was not blocked.');
  console.log('PASS: cross-organization writes blocked. Test data rolled back.');
  const permissions = await pool.request().query(`EXECUTE AS USER=N'nso_api_runtime';
    SELECT HAS_PERMS_BY_NAME('identitydata.Users','OBJECT','SELECT') AS CanReadPasswords,
      HAS_PERMS_BY_NAME('security.Memberships','OBJECT','INSERT') AS CanGrantMembership,
      HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','ALTER ANY SECURITY POLICY') AS CanAlterPolicy,
      IS_ROLEMEMBER('db_owner') AS IsOwner;
    REVERT;`);
  if (Object.values(permissions.recordset[0]).some((value) => value !== 0)) throw new Error('Runtime permissions are excessive or could not be verified.');
  console.log('PASS: runtime cannot read credentials, grant membership, alter isolation or act as database owner.');
}

try {
  const command = process.argv[2];
  if (command === 'migrate') await migrate();
  else if (command === 'bootstrap') await bootstrap();
  else if (command === 'bootstrap-management') await bootstrapManagement();
  else if (command === 'verify') await verifyIsolation();
  else throw new Error(`Usage: node ${fileURLToPath(import.meta.url)} migrate|bootstrap|bootstrap-management|verify`);
} finally { await pool.close(); }
