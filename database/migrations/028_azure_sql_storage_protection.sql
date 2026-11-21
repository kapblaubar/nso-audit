CREATE TABLE app.AuditAzureSqlFirewall (
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
  CONSTRAINT FK_AuditAzureSqlFirewall_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditAzureSqlSettings(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditAzureSqlFirewall PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAzureSqlFirewall_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAzureSqlFirewall_Audit ON app.AuditAzureSqlFirewall(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlFirewall,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlFirewall AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlFirewall AFTER UPDATE;
GO
CREATE TABLE app.AuditAzureSqlVnet (
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
  CONSTRAINT FK_AuditAzureSqlVnet_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditAzureSqlSettings(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditAzureSqlVnet PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAzureSqlVnet_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAzureSqlVnet_Audit ON app.AuditAzureSqlVnet(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlVnet,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlVnet AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlVnet AFTER UPDATE;
GO
CREATE TABLE app.AuditAzureSqlAudit (
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
  CONSTRAINT FK_AuditAzureSqlAudit_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditAzureSqlSettings(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditAzureSqlAudit PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAzureSqlAudit_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAzureSqlAudit_Audit ON app.AuditAzureSqlAudit(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlAudit,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlAudit AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureSqlAudit AFTER UPDATE;
GO
CREATE TABLE app.AuditAzureBlobProtection (
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
  CONSTRAINT FK_AuditAzureBlobProtection_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditAzureStorageSettings(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditAzureBlobProtection PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAzureBlobProtection_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAzureBlobProtection_Audit ON app.AuditAzureBlobProtection(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureBlobProtection,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureBlobProtection AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureBlobProtection AFTER UPDATE;
GO
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','azureResources','azureSqlFirewall','azureSqlVnet','azureSqlAudit','azureBlobProtection','azureRoleAssignments','azureRoleDefinitions','azureStorageSettings','azureSqlSettings','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations','directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','directoryRoleEligibility','recoveryVaults','recoveryBackupPolicies','recoveryVaultConfig','recoveryVaultStorage','recoveryVaultDetails','recoveryPolicyDetails'));
GO
INSERT dbo.AuditDatasetDependencies(DataType,ParentType) VALUES
  ('azureSqlFirewall','azureSqlSettings'),
  ('azureSqlVnet','azureSqlSettings'),
  ('azureSqlAudit','azureSqlSettings'),
  ('azureBlobProtection','azureStorageSettings');
GO
