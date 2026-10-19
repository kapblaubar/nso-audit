// Read-only contract comparison. Never emits findings, evidence or user identities.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as tables from '../apps/api/dist/src/storage/tableTenantStore.js';
import * as database from '../apps/api/dist/src/storage/sqlTenantStore.js';
import { getSqlPool } from '../apps/api/dist/src/storage/sql.js';
import { canonical } from './lib/legacy-model.mjs';

const mappings=JSON.parse(await readFile(process.env.TENANT_MAPPING_FILE,'utf8'));
try {
  for(const tenantId of Object.keys(mappings)) {
    assert.ok(canonical(await database.getTenantBootstrap(tenantId))===canonical(await tables.getTenantBootstrap(tenantId)),'Bootstrap contract differs.');
    const history=await tables.listTenantScans(tenantId,100);
    assert.ok(canonical(await database.listTenantScans(tenantId,100))===canonical(history),'History contract differs.');
    for(const scan of history) {
      const expected=await tables.getStarterScan(tenantId,scan.scanId),actual=await database.getStarterScan(tenantId,scan.scanId);
      for(const value of [expected,actual]) value.findings.sort((a,b)=>a.checkId.localeCompare(b.checkId));
      assert.ok(canonical(actual)===canonical(expected),'Report contract differs.');
      assert.equal(await database.getStarterScan(tenantId,randomUUID()),null);
    }
    if(history[0]) await assert.rejects(()=>database.getStarterScan(randomUUID(),history[0].scanId));
    assert.equal(await database.getStarterScan(tenantId,"' OR 1=1 --"),null);
    console.log(`PASS: bootstrap, history, ${history.length} reports, scores and evidence match; invalid/unknown scans rejected.`);
  }
} finally { await (await getSqlPool()).close(); }
