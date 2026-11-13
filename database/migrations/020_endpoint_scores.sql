-- Defender for Endpoint scores and recommendations. Apply before API deployment.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations'));
GO
CREATE TABLE app.AuditExposureScores (
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
  CONSTRAINT PK_AuditExposureScores PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditExposureScores_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditExposureScores_Audit ON app.AuditExposureScores(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditExposureScores,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditExposureScores AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditExposureScores AFTER UPDATE;
GO
CREATE TABLE app.AuditDeviceSecureScores (
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
  CONSTRAINT PK_AuditDeviceSecureScores PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditDeviceSecureScores_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditDeviceSecureScores_Audit ON app.AuditDeviceSecureScores(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceSecureScores,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceSecureScores AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditDeviceSecureScores AFTER UPDATE;
GO
CREATE TABLE app.AuditEndpointRecommendations (
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
  CONSTRAINT PK_AuditEndpointRecommendations PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditEndpointRecommendations_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditEndpointRecommendations_Audit ON app.AuditEndpointRecommendations(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEndpointRecommendations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEndpointRecommendations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEndpointRecommendations AFTER UPDATE;
GO
