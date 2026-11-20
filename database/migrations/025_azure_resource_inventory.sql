CREATE TABLE app.AuditAzureResources (
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
  CONSTRAINT PK_AuditAzureResources PRIMARY KEY NONCLUSTERED (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditAzureResources_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId) REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE CLUSTERED INDEX IX_AuditAzureResources_Audit ON app.AuditAzureResources(OrganizationId,TenantId,ScanId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureResources,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureResources AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditAzureResources AFTER UPDATE;
GO
-- Register the Azure resource inventory collection.
ALTER TABLE app.AuditCollections DROP CONSTRAINT CK_AuditCollections_DataType;
ALTER TABLE app.AuditCollections ADD CONSTRAINT CK_AuditCollections_DataType CHECK (DataType IN ('settingsCatalogPolicies','settingsCatalogSettings','settingsCatalogAssignments','deviceConfigurationDetails','deviceConfigurationAssignments','compliancePolicyDetails','compliancePolicyAssignments','conditionalAccess','namedLocations','authenticationMethods','registrations','authorizationPolicy','roleAssignments','deviceConfigurations','compliancePolicies','appProtectionPolicies','secureScores','secureScoreProfiles','resourceGroups','azureResources','defenderScores','defenderRecommendations','defenderMetadata','licenses','licenseAssignments','exposureScores','deviceSecureScores','endpointRecommendations','directoryUsers','directoryGroups','directoryGroupMembers','directoryRoleDefinitions','directoryRoleEligibility','recoveryVaults','recoveryBackupPolicies','recoveryVaultConfig','recoveryVaultStorage','recoveryVaultDetails','recoveryPolicyDetails'));
GO
