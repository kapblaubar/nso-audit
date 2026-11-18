-- Recovery Services vaults and backup policy evidence. Apply before API deployment.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations','directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','directoryRoleEligibility','recoveryVaults','recoveryBackupPolicies','recoveryVaultConfig','recoveryVaultStorage'));
GO
CREATE TABLE app.AuditRecoveryVaults (
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
  CONSTRAINT PK_AuditRecoveryVaults PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryVaults_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryVaults_Audit ON app.AuditRecoveryVaults(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaults,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaults AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaults AFTER UPDATE;
GO
CREATE TABLE app.AuditRecoveryBackupPolicies (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(450) NOT NULL,
  ParentSourceId nvarchar(450) NOT NULL,
  ChildSourceId nvarchar(450) NOT NULL,
  SettingDefinitionId nvarchar(512) NULL,
  TargetType nvarchar(128) NULL,
  GroupId nvarchar(128) NULL,
  FilterId nvarchar(128) NULL,
  FilterType nvarchar(64) NULL,
  DisplayName nvarchar(512) NULL,
  State nvarchar(128) NULL,
  SourceCreatedAtUtc datetime2 NULL,
  SourceUpdatedAtUtc datetime2 NULL,
  SourceJson nvarchar(max) NOT NULL CHECK (ISJSON(SourceJson)=1),
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AuditRecoveryBackupPolicies_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditRecoveryVaults(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditRecoveryBackupPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryBackupPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryBackupPolicies_Audit ON app.AuditRecoveryBackupPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryBackupPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryBackupPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryBackupPolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditRecoveryVaultConfig (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(450) NOT NULL,
  ParentSourceId nvarchar(450) NOT NULL,
  ChildSourceId nvarchar(450) NOT NULL,
  SettingDefinitionId nvarchar(512) NULL,
  TargetType nvarchar(128) NULL,
  GroupId nvarchar(128) NULL,
  FilterId nvarchar(128) NULL,
  FilterType nvarchar(64) NULL,
  DisplayName nvarchar(512) NULL,
  State nvarchar(128) NULL,
  SourceCreatedAtUtc datetime2 NULL,
  SourceUpdatedAtUtc datetime2 NULL,
  SourceJson nvarchar(max) NOT NULL CHECK (ISJSON(SourceJson)=1),
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AuditRecoveryVaultConfig_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditRecoveryVaults(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditRecoveryVaultConfig PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryVaultConfig_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryVaultConfig_Audit ON app.AuditRecoveryVaultConfig(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultConfig,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultConfig AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultConfig AFTER UPDATE;
GO
CREATE TABLE app.AuditRecoveryVaultStorage (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(450) NOT NULL,
  ParentSourceId nvarchar(450) NOT NULL,
  ChildSourceId nvarchar(450) NOT NULL,
  SettingDefinitionId nvarchar(512) NULL,
  TargetType nvarchar(128) NULL,
  GroupId nvarchar(128) NULL,
  FilterId nvarchar(128) NULL,
  FilterType nvarchar(64) NULL,
  DisplayName nvarchar(512) NULL,
  State nvarchar(128) NULL,
  SourceCreatedAtUtc datetime2 NULL,
  SourceUpdatedAtUtc datetime2 NULL,
  SourceJson nvarchar(max) NOT NULL CHECK (ISJSON(SourceJson)=1),
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AuditRecoveryVaultStorage_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditRecoveryVaults(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditRecoveryVaultStorage PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryVaultStorage_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryVaultStorage_Audit ON app.AuditRecoveryVaultStorage(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultStorage,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultStorage AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultStorage AFTER UPDATE;
GO
INSERT dbo.AuditDatasetDependencies(DataType,ParentType) VALUES
  ('recoveryBackupPolicies','recoveryVaults'),
  ('recoveryVaultConfig','recoveryVaults'),
  ('recoveryVaultStorage','recoveryVaults');
GO
