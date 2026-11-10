-- Intune settings and assignments. Additive; apply before tenant-data-v2-intune API.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments'));
GO
CREATE TABLE app.AuditSettingsCatalogPolicies (
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
  CONSTRAINT PK_AuditSettingsCatalogPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditSettingsCatalogPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditSettingsCatalogPolicies_Audit ON app.AuditSettingsCatalogPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogPolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditSettingsCatalogSettings (
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
  CONSTRAINT FK_AuditSettingsCatalogSettings_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditSettingsCatalogPolicies(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditSettingsCatalogSettings PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditSettingsCatalogSettings_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditSettingsCatalogSettings_Audit ON app.AuditSettingsCatalogSettings(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogSettings,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogSettings AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogSettings AFTER UPDATE;
GO
CREATE TABLE app.AuditSettingsCatalogAssignments (
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
  CONSTRAINT FK_AuditSettingsCatalogAssignments_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditSettingsCatalogPolicies(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditSettingsCatalogAssignments PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditSettingsCatalogAssignments_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditSettingsCatalogAssignments_Audit ON app.AuditSettingsCatalogAssignments(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogAssignments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogAssignments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSettingsCatalogAssignments AFTER UPDATE;
GO
CREATE TABLE app.AuditDeviceConfigurationDetails (
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
  CONSTRAINT FK_AuditDeviceConfigurationDetails_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditDeviceConfigurations(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditDeviceConfigurationDetails PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDeviceConfigurationDetails_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDeviceConfigurationDetails_Audit ON app.AuditDeviceConfigurationDetails(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationDetails,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationDetails AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationDetails AFTER UPDATE;
GO
CREATE TABLE app.AuditDeviceConfigurationAssignments (
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
  CONSTRAINT FK_AuditDeviceConfigurationAssignments_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditDeviceConfigurations(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditDeviceConfigurationAssignments PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDeviceConfigurationAssignments_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDeviceConfigurationAssignments_Audit ON app.AuditDeviceConfigurationAssignments(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationAssignments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationAssignments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurationAssignments AFTER UPDATE;
GO
CREATE TABLE app.AuditCompliancePolicyDetails (
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
  CONSTRAINT FK_AuditCompliancePolicyDetails_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditCompliancePolicies(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditCompliancePolicyDetails PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditCompliancePolicyDetails_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditCompliancePolicyDetails_Audit ON app.AuditCompliancePolicyDetails(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyDetails,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyDetails AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyDetails AFTER UPDATE;
GO
CREATE TABLE app.AuditCompliancePolicyAssignments (
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
  CONSTRAINT FK_AuditCompliancePolicyAssignments_Parent FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId) REFERENCES app.AuditCompliancePolicies(OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT PK_AuditCompliancePolicyAssignments PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditCompliancePolicyAssignments_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditCompliancePolicyAssignments_Audit ON app.AuditCompliancePolicyAssignments(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyAssignments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyAssignments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicyAssignments AFTER UPDATE;
GO
-- Parent inventory must be terminal before its linked datasets can be claimed.
-- This static map is owned by migrations, not runtime/customer inputs.
CREATE TABLE dbo.AuditDatasetDependencies (DataType varchar(32) PRIMARY KEY, ParentType varchar(32) NOT NULL);
INSERT dbo.AuditDatasetDependencies(DataType,ParentType) VALUES
('settingsCatalogSettings','settingsCatalogPolicies'),
('settingsCatalogAssignments','settingsCatalogPolicies'),
('deviceConfigurationDetails','deviceConfigurations'),
('deviceConfigurationAssignments','deviceConfigurations'),
('compliancePolicyDetails','compliancePolicies'),
('compliancePolicyAssignments','compliancePolicies');
GO
CREATE OR ALTER PROCEDURE security.ClaimAuditCollection
AS
BEGIN
  SET NOCOUNT ON;
  ;WITH candidate AS (
    SELECT TOP(1) job.* FROM dbo.AuditCollectionJobs job WITH(UPDLOCK,READPAST,READCOMMITTEDLOCK)
    WHERE Finished=0 AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc<SYSUTCDATETIME())
      AND NOT EXISTS (
        SELECT 1 FROM dbo.AuditDatasetDependencies dependency
        JOIN dbo.AuditCollectionJobs parent ON parent.DataType=dependency.ParentType
          AND parent.OrganizationId=job.OrganizationId AND parent.TenantId=job.TenantId AND parent.ScanId=job.ScanId
        WHERE dependency.DataType=job.DataType AND parent.Finished=0)
    ORDER BY CreatedAtUtc,ScanId,DataType
  )
  UPDATE candidate SET LeaseId=NEWID(),LeaseUntilUtc=DATEADD(minute,5,SYSUTCDATETIME()),Attempts=Attempts+1
  OUTPUT inserted.OrganizationId,inserted.TenantId,inserted.ScanId,inserted.DataType,
    inserted.NextLink,inserted.LeaseId,inserted.Attempts;
END;
GO
