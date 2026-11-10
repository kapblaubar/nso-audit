import { uuidPattern } from '../storage/sql.js';

export type LicenseDataType = 'licenses' | 'licenseAssignments';
export interface LicenseRecord {
  sourceId: string; skuId: string; skuPartNumber: string; productName: string | null;
  enabledUnits: number | null; suspendedUnits: number | null; warningUnits: number | null;
  consumedUnits: number | null; capabilityStatus: string | null; appliesTo: string | null;
  collectedAtUtc: string;
}
export interface AssignmentRecord {
  userId: string; skuId: string; assignmentSource: string; userPrincipalName: string | null;
  email: string | null; displayName: string | null; assignmentType: 'direct' | 'group' | 'unknown';
  assignmentState: string | null; assignmentError: string | null; disabledPlansJson: string;
  sourceUpdatedAtUtc: string | null; collectedAtUtc: string;
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CollectionError('invalidResponse');
  return value as ObjectValue;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new CollectionError('invalidResponse');
  return value.toLowerCase();
}
function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new CollectionError('invalidResponse');
  return value;
}
function count(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new CollectionError('invalidResponse');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new CollectionError('invalidResponse');
  return value;
}
export class CollectionError extends Error {
  constructor(readonly code: string, readonly missingAccess = false) { super(code); }
}

export function initialLicenseUrl(dataType: LicenseDataType): string {
  return dataType === 'licenses'
    ? 'https://graph.microsoft.com/v1.0/subscribedSkus'
    : 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,assignedLicenses,licenseAssignmentStates&$top=100';
}

// Paging links are untrusted source data. Never send a token to another host or endpoint.
export function validateLicenseUrl(value: string, dataType: LicenseDataType): string {
  const url = new URL(value);
  const expected = dataType === 'licenses' ? '/v1.0/subscribedSkus' : '/v1.0/users';
  if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash ||
      url.pathname !== expected || value.length > 4000) throw new CollectionError('invalidPagingLink');
  return url.href;
}

export function normalizeLicenses(values: unknown[], collectedAtUtc: string): LicenseRecord[] {
  const records = new Map<string, LicenseRecord>();
  for (const value of values) {
    const item = object(value), units = object(item.prepaidUnits ?? {});
    const sourceId = text(item.id, 128), skuPartNumber = text(item.skuPartNumber, 256);
    if (!sourceId || !skuPartNumber) throw new CollectionError('invalidResponse');
    records.set(sourceId, {sourceId, skuId:id(item.skuId), skuPartNumber, productName:null,
      enabledUnits:count(units.enabled), suspendedUnits:count(units.suspended), warningUnits:count(units.warning),
      consumedUnits:count(item.consumedUnits), capabilityStatus:text(item.capabilityStatus,64),
      appliesTo:text(item.appliesTo,32), collectedAtUtc});
  }
  return [...records.values()];
}

export function normalizeAssignments(values: unknown[], collectedAtUtc: string): AssignmentRecord[] {
  const records = new Map<string, AssignmentRecord>();
  for (const value of values) {
    const user = object(value), userId = id(user.id);
    const common = {userId, userPrincipalName:text(user.userPrincipalName,320), email:text(user.mail,320),
      displayName:text(user.displayName,256), collectedAtUtc};
    const assigned = array(user.assignedLicenses);
    const states = user.licenseAssignmentStates == null ? [] : array(user.licenseAssignmentStates);
    const covered = new Set<string>();
    for (const value of states) {
      const state = object(value), skuId = id(state.skuId);
      const groupId = state.assignedByGroup == null ? null : id(state.assignedByGroup);
      // Missing metadata is unknown; only an explicit null establishes a direct assignment.
      const assignmentType = state.assignedByGroup === undefined ? 'unknown' : groupId ? 'group' : 'direct';
      const assignmentSource = groupId ?? assignmentType;
      const updated = text(state.lastUpdatedDateTime,64);
      if (updated && !Number.isFinite(Date.parse(updated))) throw new CollectionError('invalidResponse');
      records.set(`${userId}:${skuId}:${assignmentSource}`, {...common, skuId, assignmentSource, assignmentType,
        assignmentState:text(state.state,64), assignmentError:text(state.error,128),
        disabledPlansJson:JSON.stringify(array(state.disabledPlans ?? []).map(id)),
        sourceUpdatedAtUtc:updated ? new Date(updated).toISOString() : null});
      covered.add(skuId);
    }
    for (const value of assigned) {
      const license = object(value), skuId = id(license.skuId);
      if (covered.has(skuId)) continue;
      records.set(`${userId}:${skuId}:unknown`, {...common, skuId, assignmentSource:'unknown', assignmentType:'unknown',
        assignmentState:null, assignmentError:null, disabledPlansJson:JSON.stringify(array(license.disabledPlans ?? []).map(id)),
        sourceUpdatedAtUtc:null});
    }
  }
  return [...records.values()];
}

export interface LicensePage { values: unknown[]; nextLink: string | null; collectedAtUtc: string }
export async function fetchLicensePage(dataType: LicenseDataType, nextLink: string | null, token: string,
  fetcher: typeof fetch = fetch): Promise<LicensePage> {
  const url = validateLicenseUrl(nextLink ?? initialLicenseUrl(dataType),dataType);
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, {headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
        redirect:'error', signal:AbortSignal.timeout(30000)});
    } catch { throw new CollectionError('sourceUnavailable'); }
    if (response.ok) {
      let body: ObjectValue;
      try { body = object(await response.json()); } catch { throw new CollectionError('invalidResponse'); }
      const next = text(body['@odata.nextLink'],4000);
      if (next && validateLicenseUrl(next,dataType) === url) throw new CollectionError('invalidPagingLink');
      return {values:array(body.value), nextLink:next ? validateLicenseUrl(next,dataType) : null,
        collectedAtUtc:new Date().toISOString()};
    }
    if (response.status === 401 || response.status === 403) throw new CollectionError('missingAccess',true);
    if (response.status !== 429 && response.status < 500) throw new CollectionError(`http${response.status}`);
    if (attempt === 2) throw new CollectionError(response.status === 429 ? 'throttled' : 'sourceUnavailable');
    const retry = response.headers.get('retry-after');
    const seconds = retry ? Number(retry) : NaN;
    const wait = Number.isFinite(seconds) ? seconds*1000 : retry ? Date.parse(retry)-Date.now() : 1000*(attempt+1);
    // Long throttles are a visible failure; never retry earlier than the source requested.
    if (wait > 10000) throw new CollectionError('throttled');
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,Number.isFinite(wait)?wait:1000)));
  }
  throw new CollectionError('sourceUnavailable');
}
