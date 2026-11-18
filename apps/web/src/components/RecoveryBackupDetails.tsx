import type {LicenseEvidenceRow} from '../api';
import {Fields,sourceRecord} from './AuditPolicyDetails';

const object = (value: unknown): Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};

export function backupPolicyGroup(row: LicenseEvidenceRow) {
  const {backupManagementType,workLoadType,workloadType} = object(sourceRecord(row).properties);
  const workload = String(workLoadType ?? workloadType ?? '');
  switch (String(backupManagementType).toLowerCase()) {
    case 'azureiaasvm': return 'Azure IaaS VM';
    case 'azurestorage': return 'Azure Storage';
    case 'azureworkload':
      if (/^sql/i.test(workload)) return 'Azure Workload (SQL)';
      if (/^saphana/i.test(workload)) return 'Azure Workload (SAP HANA)';
      return workload ? `Azure Workload (${workload})` : 'Azure Workload';
    default: return String(backupManagementType ?? 'Other backup policies');
  }
}

export function RecoveryBackupPolicy({row,vault,detail}: {row: LicenseEvidenceRow; vault?: LicenseEvidenceRow | undefined; detail?: LicenseEvidenceRow | undefined}) {
  const source = sourceRecord(detail ?? row);
  const properties = object(source.properties);
  const {schedulePolicy,retentionPolicy,vaultRetentionPolicy,subProtectionPolicy,...settings} = properties;
  const subPolicies = Array.isArray(subProtectionPolicy) ? subProtectionPolicy : [];
  const parent = vault ? sourceRecord(vault) : {};
  const groupId = row.ParentSourceId?.replace(/\/providers\/.*$/i,'');
  const systemData = object(source.systemData);
  const collectedAt = detail?.CollectedAtUtc ?? row.CollectedAtUtc;
  return <>
    <Fields value={{
      Vault: parent.name ?? row.ParentSourceId?.split('/').at(-1),
      'Vault location': parent.location ?? source.location,
      'Resource group ID': groupId,
      'Created in Azure': systemData.createdAt,
      'Collected at': collectedAt ? new Date(collectedAt).toLocaleString() : undefined,
      ...settings,
    }}/>
    {schedulePolicy != null ? <section><h3>Schedule</h3><Fields value={schedulePolicy}/></section> : null}
    {retentionPolicy != null ? <section><h3>Retention</h3><Fields value={retentionPolicy}/></section> : null}
    {vaultRetentionPolicy != null ? <section><h3>Vault and snapshot retention</h3><Fields value={vaultRetentionPolicy}/></section> : null}
    {subPolicies.map((entry,index) => {
      const {policyType,...settings} = object(entry);
      return <section key={index}><h3>{String(policyType ?? 'Sub-policy')}</h3><Fields value={settings}/></section>;
    })}
    <details><summary>All captured policy properties</summary><Fields value={source}/></details>
  </>;
}
