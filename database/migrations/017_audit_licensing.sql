-- Additive, typed evidence. Existing ScanRuns/ScanFindings remain intact.
CREATE TABLE app.DataAudits (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  Scope varchar(32) NOT NULL CHECK (Scope='licensing'),
  Status varchar(16) NOT NULL CHECK (Status IN ('queued','running','complete','partial','failed')),
  InitiatedBy uniqueidentifier NOT NULL,
  CollectorVersion varchar(32) NOT NULL,
  CreatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  StartedAtUtc datetime2 NULL,
  CompletedAtUtc datetime2 NULL,
  CONSTRAINT PK_DataAudits PRIMARY KEY (OrganizationId,TenantId,ScanId),
  CONSTRAINT FK_DataAudits_Scan FOREIGN KEY (OrganizationId,TenantId,ScanId)
    REFERENCES app.ScanRuns(OrganizationId,TenantId,ScanId)
);
CREATE TABLE app.AuditCollections (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  DataType varchar(32) NOT NULL CHECK (DataType IN ('licenses','licenseAssignments')),
  Status varchar(24) NOT NULL CHECK (Status IN ('queued','running','complete','partial','failed','missingAccess')),
  StartedAtUtc datetime2 NULL,
  CompletedAtUtc datetime2 NULL,
  RecordCount int NOT NULL DEFAULT 0,
  ErrorCode varchar(64) NULL,
  CONSTRAINT PK_AuditCollections PRIMARY KEY (OrganizationId,TenantId,ScanId,DataType),
  CONSTRAINT FK_AuditCollections_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId)
    REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE TABLE app.AuditLicenses (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  SourceId nvarchar(128) NOT NULL,
  SkuId uniqueidentifier NOT NULL,
  SkuPartNumber nvarchar(256) NOT NULL,
  ProductName nvarchar(256) NULL,
  EnabledUnits bigint NULL,
  SuspendedUnits bigint NULL,
  WarningUnits bigint NULL,
  ConsumedUnits bigint NULL,
  CapabilityStatus nvarchar(64) NULL,
  AppliesTo nvarchar(32) NULL,
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditLicenses PRIMARY KEY (OrganizationId,TenantId,ScanId,SourceId),
  CONSTRAINT FK_AuditLicenses_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId)
    REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
CREATE INDEX IX_AuditLicenses_Sku ON app.AuditLicenses(OrganizationId,TenantId,ScanId,SkuId);
CREATE TABLE app.AuditLicenseAssignments (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  UserId uniqueidentifier NOT NULL,
  SkuId uniqueidentifier NOT NULL,
  AssignmentSource nvarchar(64) NOT NULL,
  UserPrincipalName nvarchar(320) NULL,
  Email nvarchar(320) NULL,
  DisplayName nvarchar(256) NULL,
  AssignmentType varchar(16) NOT NULL CHECK (AssignmentType IN ('direct','group','unknown')),
  AssignmentState nvarchar(64) NULL,
  AssignmentError nvarchar(128) NULL,
  DisabledPlansJson nvarchar(max) NOT NULL CHECK (ISJSON(DisabledPlansJson)=1),
  SourceUpdatedAtUtc datetime2 NULL,
  CollectedAtUtc datetime2 NOT NULL,
  StoredAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditLicenseAssignments PRIMARY KEY (OrganizationId,TenantId,ScanId,UserId,SkuId,AssignmentSource),
  CONSTRAINT FK_AuditLicenseAssignments_Audit FOREIGN KEY (OrganizationId,TenantId,ScanId)
    REFERENCES app.DataAudits(OrganizationId,TenantId,ScanId)
);
-- Assignments can succeed independently of SKU inventory; no cross-dataset FK discards them.
CREATE INDEX IX_AuditLicenseAssignments_Sku ON app.AuditLicenseAssignments(OrganizationId,TenantId,ScanId,SkuId);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.DataAudits,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.DataAudits AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.DataAudits AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCollections,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCollections AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditCollections AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenses,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenses AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenses AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenseAssignments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenseAssignments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditLicenseAssignments AFTER UPDATE;
GO
-- Global dispatch metadata is accessible only through narrow procedures. It contains no
-- evidence or credentials. Never expose these procedures through customer endpoints.
CREATE TABLE dbo.AuditCollectionJobs (
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  ScanId uniqueidentifier NOT NULL,
  DataType varchar(32) NOT NULL,
  NextLink nvarchar(4000) NULL,
  LeaseId uniqueidentifier NULL,
  LeaseUntilUtc datetime2 NULL,
  Attempts int NOT NULL DEFAULT 0,
  Finished bit NOT NULL DEFAULT 0,
  CreatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditCollectionJobs PRIMARY KEY (OrganizationId,TenantId,ScanId,DataType),
  CONSTRAINT FK_AuditCollectionJobs_Collection FOREIGN KEY (OrganizationId,TenantId,ScanId,DataType)
    REFERENCES app.AuditCollections(OrganizationId,TenantId,ScanId,DataType)
);
CREATE INDEX IX_AuditCollectionJobs_Dispatch ON dbo.AuditCollectionJobs(Finished,LeaseUntilUtc,CreatedAtUtc);
GO
CREATE PROCEDURE security.EnqueueAuditCollection
  @OrganizationId uniqueidentifier, @TenantId uniqueidentifier, @ScanId uniqueidentifier, @DataType varchar(32)
AS
BEGIN
  SET NOCOUNT ON;
  IF @OrganizationId<>TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'organizationId'))
    OR SESSION_CONTEXT(N'organizationId') IS NULL THROW 51000,'Organization context required.',1;
  IF NOT EXISTS(SELECT 1 FROM app.AuditCollections WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId
    AND ScanId=@ScanId AND DataType=@DataType AND Status='queued') THROW 51000,'Collection not queued.',1;
  INSERT dbo.AuditCollectionJobs(OrganizationId,TenantId,ScanId,DataType) VALUES(@OrganizationId,@TenantId,@ScanId,@DataType);
END;
GO
CREATE PROCEDURE security.ClaimAuditCollection
AS
BEGIN
  SET NOCOUNT ON;
  ;WITH candidate AS (
    SELECT TOP(1) * FROM dbo.AuditCollectionJobs WITH(UPDLOCK,READPAST,READCOMMITTEDLOCK)
    WHERE Finished=0 AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc<SYSUTCDATETIME())
    ORDER BY CreatedAtUtc,ScanId,DataType
  )
  UPDATE candidate SET LeaseId=NEWID(),LeaseUntilUtc=DATEADD(minute,5,SYSUTCDATETIME()),Attempts=Attempts+1
  OUTPUT inserted.OrganizationId,inserted.TenantId,inserted.ScanId,inserted.DataType,
    inserted.NextLink,inserted.LeaseId,inserted.Attempts;
END;
GO
-- Called inside the same SQL transaction as page persistence. Locks fence out stale workers.
CREATE PROCEDURE security.LockAuditCollection
  @OrganizationId uniqueidentifier, @TenantId uniqueidentifier, @ScanId uniqueidentifier,
  @DataType varchar(32), @LeaseId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF @@TRANCOUNT=0 THROW 51000,'Transaction required.',1;
  IF @OrganizationId<>TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'organizationId'))
    OR SESSION_CONTEXT(N'organizationId') IS NULL THROW 51000,'Organization context required.',1;
  IF NOT EXISTS(SELECT 1 FROM dbo.AuditCollectionJobs WITH(UPDLOCK,HOLDLOCK)
    WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND DataType=@DataType
      AND LeaseId=@LeaseId AND Finished=0 AND LeaseUntilUtc>SYSUTCDATETIME())
    THROW 51001,'Collection lease lost.',1;
END;
GO
CREATE PROCEDURE security.CheckpointAuditCollection
  @OrganizationId uniqueidentifier, @TenantId uniqueidentifier, @ScanId uniqueidentifier,
  @DataType varchar(32), @LeaseId uniqueidentifier, @NextLink nvarchar(4000), @Finished bit
AS
BEGIN
  SET NOCOUNT ON;
  EXEC security.LockAuditCollection @OrganizationId,@TenantId,@ScanId,@DataType,@LeaseId;
  UPDATE dbo.AuditCollectionJobs SET NextLink=@NextLink,Finished=@Finished,
    LeaseId=NULL,LeaseUntilUtc=NULL,Attempts=0
  WHERE OrganizationId=@OrganizationId AND TenantId=@TenantId AND ScanId=@ScanId AND DataType=@DataType;
END;
GO
GRANT EXECUTE ON security.EnqueueAuditCollection TO nso_runtime;
GRANT EXECUTE ON security.ClaimAuditCollection TO nso_runtime;
GRANT EXECUTE ON security.LockAuditCollection TO nso_runtime;
GRANT EXECUTE ON security.CheckpointAuditCollection TO nso_runtime;
GO
