-- Explicit, operator-approved mapping from legacy Entra tenant to customer organization.
CREATE TABLE security.EntraConnections (
  TenantId uniqueidentifier NOT NULL PRIMARY KEY,
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_EntraConnections UNIQUE (OrganizationId, TenantId)
);
GO
CREATE PROCEDURE security.ResolveEntraOrganization @TenantId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  SELECT OrganizationId FROM security.EntraConnections WHERE TenantId=@TenantId;
END;
GO
GRANT EXECUTE ON security.ResolveEntraOrganization TO nso_runtime;
GO

-- Preserve full source entities while indexing their relational scope and scan history.
-- Do not truncate existing evidence or reinterpret historical scores during migration.
CREATE TABLE app.TenantRegistrations (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  EntityJson nvarchar(max) NOT NULL CHECK (ISJSON(EntityJson)=1),
  CONSTRAINT PK_TenantRegistrations PRIMARY KEY (OrganizationId,TenantId),
  CONSTRAINT FK_TenantRegistrations_Connection FOREIGN KEY (OrganizationId,TenantId)
    REFERENCES security.EntraConnections(OrganizationId,TenantId)
);
CREATE TABLE app.ScanRuns (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  EntityJson nvarchar(max) NOT NULL CHECK (ISJSON(EntityJson)=1),
  CreatedAt AS CONVERT(varchar(40), JSON_VALUE(EntityJson,'$.createdAt')) PERSISTED,
  CONSTRAINT PK_ScanRuns PRIMARY KEY (OrganizationId,TenantId,ScanId),
  CONSTRAINT FK_ScanRuns_Connection FOREIGN KEY (OrganizationId,TenantId)
    REFERENCES security.EntraConnections(OrganizationId,TenantId)
);
CREATE INDEX IX_ScanRuns_History ON app.ScanRuns(OrganizationId,TenantId,CreatedAt DESC);
CREATE TABLE app.ScanFindings (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  CheckId nvarchar(256) NOT NULL,
  EntityJson nvarchar(max) NOT NULL CHECK (ISJSON(EntityJson)=1),
  CONSTRAINT PK_ScanFindings PRIMARY KEY (OrganizationId,TenantId,ScanId,CheckId),
  CONSTRAINT FK_ScanFindings_Scan FOREIGN KEY (OrganizationId,TenantId,ScanId)
    REFERENCES app.ScanRuns(OrganizationId,TenantId,ScanId)
);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.TenantRegistrations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.TenantRegistrations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.TenantRegistrations AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanRuns,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanRuns AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanRuns AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanFindings,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanFindings AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ScanFindings AFTER UPDATE;
GO
CREATE TABLE dbo.ScanStorageCutover (
  Id int NOT NULL PRIMARY KEY CHECK (Id=1),
  Backend varchar(8) NOT NULL CHECK (Backend IN ('tables','sql')),
  VerifiedAt datetime2 NULL,
  SourceDigest char(64) NULL
);
INSERT dbo.ScanStorageCutover(Id,Backend) VALUES (1,'tables');
GO
