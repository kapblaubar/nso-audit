import { createHash } from 'node:crypto';

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function canonical(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function entityIdentity(table, entity) {
  if (table === 'tenants' || table === 'scans') {
    if (!uuid.test(entity.partitionKey)) throw new Error('Invalid source tenant identifier.');
    if (table === 'tenants' && entity.rowKey !== 'registration') throw new Error('Unexpected tenant row; explicit migration support required.');
    if (table === 'scans' && !uuid.test(entity.rowKey)) throw new Error('Invalid source scan identifier.');
    return { tenantId: entity.partitionKey.toLowerCase(), scanId: table === 'scans' ? entity.rowKey.toLowerCase() : undefined };
  }
  const parts = entity.partitionKey.split(':');
  if (parts.length !== 2 || !uuid.test(parts[0]) || !uuid.test(parts[1]) || !entity.rowKey || entity.rowKey.length > 256) throw new Error('Invalid source finding identity.');
  return { tenantId: parts[0].toLowerCase(), scanId: parts[1].toLowerCase(), checkId: entity.rowKey };
}
export function validateMappings(mappings, tenantIds) {
  for (const tenantId of tenantIds) {
    const mapping = mappings[tenantId];
    if (!mapping || !uuid.test(mapping.organizationId) || !mapping.displayName?.trim()) throw new Error(`Explicit organization mapping required for tenant ${tenantId}.`);
  }
}
