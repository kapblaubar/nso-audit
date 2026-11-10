import { CollectionError, fetchLicensePage, normalizeAssignments, normalizeLicenses, type LicensePage } from './licensing.js';
import type { CollectionJob } from './store.js';
import type { AssignmentRecord, LicenseRecord } from './licensing.js';

export interface WorkerDependencies {
  start:(job:CollectionJob)=>Promise<void>;
  token:(tenantId:string)=>Promise<string>;
  page:(job:CollectionJob,token:string)=>Promise<LicensePage>;
  checkpoint:(job:CollectionJob,rows:LicenseRecord[]|AssignmentRecord[],nextLink:string|null,
    error?:{code:string;missingAccess:boolean})=>Promise<void>;
}
// SQL failures propagate to the host. An expired lease can then replay the uncommitted page.
export async function processCollection(job:CollectionJob,deps:WorkerDependencies):Promise<void> {
  await deps.start(job);
  let page:LicensePage;
  let records:LicenseRecord[]|AssignmentRecord[];
  try {
    if(job.Attempts>3)throw new CollectionError('workerInterrupted');
    let token:string;
    try {token=await deps.token(job.TenantId);}catch{throw new CollectionError('authenticationUnavailable');}
    page=await deps.page(job,token);
    records=job.DataType==='licenses'?normalizeLicenses(page.values,page.collectedAtUtc):normalizeAssignments(page.values,page.collectedAtUtc);
  } catch(error) {
    const safe=error instanceof CollectionError?error:new CollectionError('invalidResponse');
    await deps.checkpoint(job,[],null,{code:safe.code,missingAccess:safe.missingAccess});
    return;
  }
  await deps.checkpoint(job,records,page.nextLink);
}
export const graphPage:WorkerDependencies['page']=(job,token)=>{
  if(job.DataType!=='licenses'&&job.DataType!=='licenseAssignments')throw new CollectionError('invalidDataType');
  return fetchLicensePage(job.DataType,job.NextLink,token);
};
