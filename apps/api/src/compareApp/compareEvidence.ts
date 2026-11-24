export interface EvidenceRow extends Record<string,unknown> {
  SourceId?:string;
  SourceJson?:string;
  DisplayName?:string|null;
  UserPrincipalName?:string|null;
  SkuPartNumber?:string|null;
  ProductName?:string|null;
  SkuId?:string;
  UserId?:string;
  AssignmentSource?:string;
}

export type Change = {path:string; before:unknown; after:unknown};
type Evidence = Record<string,unknown>;
export type ComparedRecord = {
  id:string; label:string; status:'Added'|'Removed'|'Changed'|'Unchanged';
  before?:Evidence; after?:Evidence; changes:Change[];
};

function recordId(row:EvidenceRow,dataset:string):string {
  if(dataset==='licenses'&&row.SkuId)return JSON.stringify([row.SkuId,row.SourceId??'']);
  if(dataset==='licenseAssignments'&&row.UserId&&row.SkuId&&row.AssignmentSource)
    return JSON.stringify([row.UserId,row.SkuId,row.AssignmentSource]);
  if(row.SourceId)return JSON.stringify([row.SourceId]);
  throw new Error('A saved record is missing its source identity.');
}

function evidence(row:EvidenceRow):Evidence {
  const {SourceId,CollectedAtUtc,StoredAtUtc,SourceJson,...fields}=row;
  const normalized=Object.fromEntries(Object.entries(fields).map(([key,value])=>
    [key,value instanceof Date?value.toISOString():key==='DisabledPlansJson'&&typeof value==='string'?
      (JSON.parse(value) as string[]).sort():value]));
  return SourceJson==null ? normalized : {...normalized,Source:JSON.parse(SourceJson) as unknown};
}

const isObject=(value:unknown):value is Evidence=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function equal(before:unknown,after:unknown):boolean {
  if(Object.is(before,after))return true;
  if(Array.isArray(before)&&Array.isArray(after))
    return before.length===after.length&&before.every((item,index)=>equal(item,after[index]));
  if(isObject(before)&&isObject(after))
    return Object.keys(before).length===Object.keys(after).length&&Object.keys(before).every(
      key=>Object.hasOwn(after,key)&&equal(before[key],after[key]));
  return false;
}

function diff(before:Evidence,after:Evidence,path=''):Change[] {
  const changes:Change[]=[];
  const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
  for(const key of keys){
    const previous=Object.hasOwn(before,key)?before[key]:undefined;
    const current=Object.hasOwn(after,key)?after[key]:undefined;
    const field=path+'/'+key.replaceAll('~','~0').replaceAll('/','~1');
    if(isObject(previous)&&isObject(current))changes.push(...diff(previous,current,field));
    else if(!equal(previous,current))changes.push({path:field,before:previous,after:current});
  }
  return changes;
}

function indexRows(rows:EvidenceRow[],dataset:string){
  const indexed=new Map<string,EvidenceRow>();
  for(const row of rows){
    const id=recordId(row,dataset);
    if(indexed.has(id))throw new Error('The dataset contains duplicate source identities.');
    indexed.set(id,row);
  }
  return indexed;
}

export function compareEvidence(previous:EvidenceRow[],current:EvidenceRow[],dataset:string):ComparedRecord[] {
  const before=indexRows(previous,dataset),after=indexRows(current,dataset);
  return [...new Set([...after.keys(),...before.keys()])].map(id=>{
    const oldRow=before.get(id),newRow=after.get(id),labelRow=newRow??oldRow!;
    const oldEvidence=oldRow&&evidence(oldRow),newEvidence=newRow&&evidence(newRow);
    const changes=oldEvidence&&newEvidence?diff(oldEvidence,newEvidence):[];
    return {id,label:labelRow.DisplayName??labelRow.UserPrincipalName??labelRow.ProductName??labelRow.SkuPartNumber??labelRow.SourceId??labelRow.SkuId??id,
      status:!oldEvidence?'Added':!newEvidence?'Removed':changes.length?'Changed':'Unchanged',
      ...(oldEvidence?{before:oldEvidence}:{}),...(newEvidence?{after:newEvidence}:{}),changes};
  });
}
