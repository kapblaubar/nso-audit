-- Unified tenant audit datasets. Additive: existing history and licensing are retained.
DECLARE @Constraint sysname;
SELECT @Constraint=name FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('app.DataAudits') AND definition LIKE '%Scope%';
IF @Constraint IS NULL THROW 51000,'Audit scope constraint not found.',1;
DECLARE @DropSql nvarchar(max)=N'ALTER TABLE app.DataAudits DROP CONSTRAINT '+QUOTENAME(@Constraint);
EXEC sys.sp_executesql @DropSql;
ALTER TABLE app.DataAudits ADD CONSTRAINT CK_DataAudits_Scope CHECK (Scope IN ('licensing','tenant'));
ALTER TABLE app.DataAudits ADD SubscriptionId uniqueidentifier NULL;
SELECT @Constraint=name FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('app.AuditCollections') AND definition LIKE '%DataType%';
IF @Constraint IS NULL THROW 51000,'Collection type constraint not found.',1;
SET @DropSql=N'ALTER TABLE app.AuditCollections DROP CONSTRAINT '+QUOTENAME(@Constraint);
EXEC sys.sp_executesql @DropSql;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments'));
GO
CREATE TABLE app.AuditConditionalAccessPolicies (
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
  CONSTRAINT PK_AuditConditionalAccessPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditConditionalAccessPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditConditionalAccessPolicies_Audit ON app.AuditConditionalAccessPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditConditionalAccessPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditConditionalAccessPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditConditionalAccessPolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditNamedLocations (
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
  CONSTRAINT PK_AuditNamedLocations PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditNamedLocations_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditNamedLocations_Audit ON app.AuditNamedLocations(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditNamedLocations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditNamedLocations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditNamedLocations AFTER UPDATE;
GO
CREATE TABLE app.AuditAuthenticationMethods (
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
  CONSTRAINT PK_AuditAuthenticationMethods PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAuthenticationMethods_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAuthenticationMethods_Audit ON app.AuditAuthenticationMethods(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationMethods,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationMethods AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationMethods AFTER UPDATE;
GO
CREATE TABLE app.AuditAuthenticationRegistrations (
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
  CONSTRAINT PK_AuditAuthenticationRegistrations PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAuthenticationRegistrations_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAuthenticationRegistrations_Audit ON app.AuditAuthenticationRegistrations(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationRegistrations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationRegistrations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthenticationRegistrations AFTER UPDATE;
GO
CREATE TABLE app.AuditAuthorizationPolicies (
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
  CONSTRAINT PK_AuditAuthorizationPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAuthorizationPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAuthorizationPolicies_Audit ON app.AuditAuthorizationPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthorizationPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthorizationPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAuthorizationPolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditRoleAssignments (
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
  CONSTRAINT PK_AuditRoleAssignments PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditRoleAssignments_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditRoleAssignments_Audit ON app.AuditRoleAssignments(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRoleAssignments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRoleAssignments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditRoleAssignments AFTER UPDATE;
GO
CREATE TABLE app.AuditDeviceConfigurations (
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
  CONSTRAINT PK_AuditDeviceConfigurations PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDeviceConfigurations_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDeviceConfigurations_Audit ON app.AuditDeviceConfigurations(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceConfigurations AFTER UPDATE;
GO
CREATE TABLE app.AuditCompliancePolicies (
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
  CONSTRAINT PK_AuditCompliancePolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditCompliancePolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditCompliancePolicies_Audit ON app.AuditCompliancePolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCompliancePolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditAppProtectionPolicies (
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
  CONSTRAINT PK_AuditAppProtectionPolicies PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAppProtectionPolicies_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAppProtectionPolicies_Audit ON app.AuditAppProtectionPolicies(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAppProtectionPolicies,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAppProtectionPolicies AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAppProtectionPolicies AFTER UPDATE;
GO
CREATE TABLE app.AuditMicrosoftSecureScores (
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
  CONSTRAINT PK_AuditMicrosoftSecureScores PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditMicrosoftSecureScores_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditMicrosoftSecureScores_Audit ON app.AuditMicrosoftSecureScores(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditMicrosoftSecureScores,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditMicrosoftSecureScores AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditMicrosoftSecureScores AFTER UPDATE;
GO
CREATE TABLE app.AuditSecureScoreProfiles (
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
  CONSTRAINT PK_AuditSecureScoreProfiles PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditSecureScoreProfiles_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditSecureScoreProfiles_Audit ON app.AuditSecureScoreProfiles(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSecureScoreProfiles,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSecureScoreProfiles AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditSecureScoreProfiles AFTER UPDATE;
GO
CREATE TABLE app.AuditResourceGroups (
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
  CONSTRAINT PK_AuditResourceGroups PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditResourceGroups_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditResourceGroups_Audit ON app.AuditResourceGroups(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditResourceGroups,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditResourceGroups AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditResourceGroups AFTER UPDATE;
GO
CREATE TABLE app.AuditDefenderCloudScores (
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
  CONSTRAINT PK_AuditDefenderCloudScores PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDefenderCloudScores_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDefenderCloudScores_Audit ON app.AuditDefenderCloudScores(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderCloudScores,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderCloudScores AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderCloudScores AFTER UPDATE;
GO
CREATE TABLE app.AuditDefenderRecommendations (
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
  CONSTRAINT PK_AuditDefenderRecommendations PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDefenderRecommendations_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDefenderRecommendations_Audit ON app.AuditDefenderRecommendations(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderRecommendations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderRecommendations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderRecommendations AFTER UPDATE;
GO
CREATE TABLE app.AuditDefenderAssessmentMetadata (
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
  CONSTRAINT PK_AuditDefenderAssessmentMetadata PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDefenderAssessmentMetadata_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDefenderAssessmentMetadata_Audit ON app.AuditDefenderAssessmentMetadata(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderAssessmentMetadata,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderAssessmentMetadata AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDefenderAssessmentMetadata AFTER UPDATE;
GO
