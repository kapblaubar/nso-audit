import type { TenantUser } from './requireTenantUser.js';

export function assertManagementTenant(user: TenantUser, approvedTenantId: string | undefined): void {
  if (!approvedTenantId || user.tenantId.toLowerCase() !== approvedTenantId.toLowerCase()) {
    throw new Error('Management access requires the configured NewSommer Entra tenant.');
  }
}

export function isManagementRole(value: unknown): value is 'setupAdmin' | 'platformAdmin' {
  return value === 'setupAdmin' || value === 'platformAdmin';
}
