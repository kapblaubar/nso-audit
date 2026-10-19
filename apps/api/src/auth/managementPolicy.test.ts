import test from 'node:test';
import assert from 'node:assert/strict';
import { assertManagementTenant, isManagementRole } from './managementPolicy.js';

const staff = { tenantId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', objectId: 'staff-object' };
test('management denies missing configuration and a different Entra tenant', () => {
  assert.throws(() => assertManagementTenant(staff, undefined));
  assert.throws(() => assertManagementTenant(staff, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
  assert.doesNotThrow(() => assertManagementTenant(staff, staff.tenantId.toLowerCase()));
});
test('customer roles and unrecognized roles never grant management authority', () => {
  for (const role of [undefined, null, '', 'owner', 'admin', 'viewer', 'contributor', 'globalAdmin']) {
    assert.equal(isManagementRole(role), false);
  }
  assert.equal(isManagementRole('setupAdmin'), true);
  assert.equal(isManagementRole('platformAdmin'), true);
});
