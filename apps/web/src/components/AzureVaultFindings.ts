import type {LicenseEvidenceRow} from '../api';
import {sourceRecord} from './AuditPolicyDetails';

export const vaultNetworkRecommendation={
  id:'vault-public-network',
  title:'Restrict Key Vault public network access',
  action:'Review the vault’s consumers. Use private endpoints where possible, or restrict the firewall to approved networks before changing public access.',
};
export const vaultDiagnosticsRecommendation={
  id:'vault-missing-diagnostics',
  title:'Configure Key Vault audit logging',
  action:'Send Key Vault audit logs to an approved diagnostic destination and verify that it receives events.',
};

export function vaultNetworkFinding(row:LicenseEvidenceRow){
  const vault=sourceRecord(row);
  if(String(vault.publicNetworkAccess).toLowerCase()!=='enabled')return null;
  const defaultAction=String((vault.firewall as {defaultAction?:unknown}|null)?.defaultAction??'').toLowerCase();
  if(defaultAction==='deny')return null;
  if(defaultAction==='allow')return 'Public network access is enabled and the firewall default action is Allow.';
  return defaultAction?null:'Public network access is enabled and Azure returned no firewall default action.';
}

export function vaultDiagnosticsFinding(status:string|undefined,count:number){
  return status==='complete'&&count===0?'Azure returned no diagnostic settings for this vault.':null;
}
