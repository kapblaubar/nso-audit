# Recovery Services backup snapshots

A full tenant audit reads the Recovery Services vaults in the selected Azure subscription. It saves the vault and policy inventories, each resource's detail response, vault backup configuration, and vault backup storage. Azure Resource Manager API version `2025-08-01` returns vault security and redundancy settings and authoritative protected-item counts in the detail responses. The audit applies its standard evidence secret redaction and links records within the same organization, tenant, and audit.

In **Current audit → Backups → Recovery Services vaults**, select a vault to see its configuration, storage settings, and policies by workload. Each policy retains its complete schedule and retention objects and every workload sub-policy. The view shows Azure's protected-item count and separates the audit collection time from any Azure creation time supplied by the source. **Source evidence** contains the saved responses.

## Deployment and validation

1. Use the existing audit application and its read access to the selected subscription. Azure Reader at subscription scope covers vault discovery and reads of backup policies, backup configuration, and storage configuration. Use the approved tenant connection and subscription.
2. Validate migrations 023–024 against a schema through migration 022 in a transaction that rolls back. Check the six tables, each table's three organization isolation predicates, and the five child foreign keys and queue dependencies. Apply them with `node scripts/database.mjs migrate --through=024_recovery_services_details.sql` and repeat to verify checksums and idempotence.
3. Run API tests and the audit browser checks. Deploy the API before the web application using the versioned scripts. Run a fresh tenant audit. Verify all six datasets in **Collection details** and compare saved policy settings, protected-item counts, and vault security and redundancy with Azure. Historical snapshots retain the collection coverage recorded at run time.
4. If recovery is needed, let active backup dataset jobs reach a terminal state before rolling back API and web packages. Retain the additive schema and audit data.

- [Recovery Services vault inventory](https://learn.microsoft.com/en-us/rest/api/recoveryservices/vaults/list-by-subscription-id?view=rest-recoveryservices-2025-08-01)
- [Backup policy inventory](https://learn.microsoft.com/en-us/rest/api/backup/backup-policies/list?view=rest-backup-2025-08-01)
- [Vault backup configuration](https://learn.microsoft.com/en-us/rest/api/backup/backup-resource-vault-configs/get?view=rest-backup-2025-08-01)
- [Vault backup storage configuration](https://learn.microsoft.com/en-us/rest/api/backup/backup-resource-storage-configs-non-crr/get?view=rest-backup-2025-08-01)
