import sql from 'mssql';

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getSqlPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const server = process.env.SQL_SERVER;
    const database = process.env.SQL_DATABASE;
    if (!server || !database) throw new Error('SQL_SERVER and SQL_DATABASE must be configured.');
    const pool = new sql.ConnectionPool({
      server, database,
      authentication: {
        type: 'azure-active-directory-default',
        options: process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : {},
      },
      options: { encrypt: true, trustServerCertificate: false },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      connectionTimeout: 30000, requestTimeout: 30000,
    });
    poolPromise = pool.connect().catch((error: unknown) => { poolPromise = undefined; throw error; });
  }
  return poolPromise;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caller must resolve an authorized organization from server-side membership first.
 * A transaction pins one connection. Every use sets context, and clears it before release.
 * RLS is a second boundary, not authorization for arbitrary organization IDs.
 */
export async function withOrganization<T>(organizationId: string, operation: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
  if (!uuidPattern.test(organizationId)) throw new Error('Invalid organization identifier.');
  const pool = await getSqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input('organizationId', sql.UniqueIdentifier, organizationId)
      .query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=@organizationId;");
    const result = await operation(transaction);
    await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=NULL;");
    await transaction.commit();
    return result;
  } catch (error) {
    // SESSION_CONTEXT is not transactional. Clear before rollback while the connection is pinned.
    let discardPool = false;
    try {
      await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'organizationId', @value=NULL;");
    } catch {
      // If context cannot be cleared, discard the pool rather than reuse a suspect connection.
      poolPromise = undefined;
      discardPool = true;
    }
    await transaction.rollback().catch(() => undefined);
    if (discardPool) await pool.close().catch(() => undefined);
    throw error;
  }
}
