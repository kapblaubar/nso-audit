-- Individual Recovery Services resources return additional settings.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations','directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','directoryRoleEligibility','recoveryVaults','recoveryBackupPolicies','recoveryVaultConfig','recoveryVaultStorage','recoveryVaultDetails','recoveryPolicyDetails'));
GO
CREATE TABLE app.AuditRecoveryVaultDetails (
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
  CONSTRAINT FK_AuditRecoveryVaultDetails_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditRecoveryVaults(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditRecoveryVaultDetails PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryVaultDetails_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryVaultDetails_Audit ON app.AuditRecoveryVaultDetails(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultDetails,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultDetails AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryVaultDetails AFTER UPDATE;
GO
CREATE TABLE app.AuditRecoveryPolicyDetails (
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
  CONSTRAINT FK_AuditRecoveryPolicyDetails_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditRecoveryBackupPolicies(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditRecoveryPolicyDetails PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRecoveryPolicyDetails_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRecoveryPolicyDetails_Audit ON app.AuditRecoveryPolicyDetails(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryPolicyDetails,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryPolicyDetails AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRecoveryPolicyDetails AFTER UPDATE;
GO
INSERT dbo.AuditDatasetDependencies(DataType,ParentType) VALUES
  ('recoveryVaultDetails','recoveryVaults'),
  ('recoveryPolicyDetails','recoveryBackupPolicies');
GO
