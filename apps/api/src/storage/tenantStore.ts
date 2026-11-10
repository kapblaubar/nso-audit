// Explicit backend selection supports a staged deployment before the verified SQL cutover.
// Never fall back to stale Tables when SQL fails.
import type * as tables from './tableTenantStore.js';
import * as database from './sqlTenantStore.js';
export type { TenantBootstrapRecord } from './tableTenantStore.js';

async function store() {
  const backend = process.env.TENANT_STORE ?? 'sql';
  if (backend === 'sql') {
    await database.assertSqlCutoverActivated();
    return database;
  }
  throw new Error('Audit data requires SQL storage. Legacy Azure Table storage is no longer a runtime backend.');
}
export const getTenantBootstrap: typeof tables.getTenantBootstrap = async (...args) => (await store()).getTenantBootstrap(...args);
export const saveAccessCheck: typeof tables.saveAccessCheck = async (...args) => (await store()).saveAccessCheck(...args);
export const saveStarterScan: typeof tables.saveStarterScan = async (...args) => (await store()).saveStarterScan(...args);
export const getStarterScan: typeof tables.getStarterScan = async (...args) => (await store()).getStarterScan(...args);
export const listTenantScans: typeof tables.listTenantScans = async (...args) => (await store()).listTenantScans(...args);
