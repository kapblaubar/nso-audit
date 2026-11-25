-- Add Purview policy and rule snapshots without changing existing evidence.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','azureResources','azureVaultSecurity','azureVaultDiagnostics','azureVnetSettings','azureNsgSettings','azureSqlFirewall','azureSqlVnet','azureSqlAudit','azureBlobProtection','azureRoleAssignments','azureRoleDefinitions','azureStorageSettings','azureSqlSettings','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations','directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','directoryRoleEligibility','recoveryVaults','recoveryBackupPolicies','recoveryVaultConfig','recoveryVaultStorage','recoveryVaultDetails','recoveryPolicyDetails','purviewDlpPolicies','purviewDlpRules'));
GO
CREATE TABLE app.AuditPurviewDlpPolicies (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(450) NOT NULL,
  DisplayName nvarchar(512) NULL,
  State nvarchar(128) NULL,
  SourceCreatedAtUtc datetime2 NULL,
  SourceUpdatedAtUtc datetime2 NULL,
  SourceJson nvarchar(max) NOT NULL CHECK (ISJSON(SourceJson)=1),
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditPurviewDlpPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditPurviewDlpPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditPurviewDlpPolicies_Audit ON app.AuditPurviewDlpPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpPolicies AFTER UPDATE;
GO
GRANT SELECT ON OBJECT::app.AuditPurviewDlpPolicies TO nso_compare_reader;
GO
CREATE TABLE app.AuditPurviewDlpRules (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(450) NOT NULL,
  DisplayName nvarchar(512) NULL,
  State nvarchar(128) NULL,
  SourceCreatedAtUtc datetime2 NULL,
  SourceUpdatedAtUtc datetime2 NULL,
  SourceJson nvarchar(max) NOT NULL CHECK (ISJSON(SourceJson)=1),
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditPurviewDlpRules PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditPurviewDlpRules_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditPurviewDlpRules_Audit ON app.AuditPurviewDlpRules(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpRules,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpRules AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditPurviewDlpRules AFTER UPDATE;
GO
GRANT SELECT ON OBJECT::app.AuditPurviewDlpRules TO nso_compare_reader;
GO
