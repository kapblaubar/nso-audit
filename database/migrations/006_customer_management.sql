CREATE TABLE app.CustomerProfiles (
  OrganizationId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES app.Organizations(OrganizationId),
  ProfileJson nvarchar(max) NOT NULL CHECK(ISJSON(ProfileJson)=1)
);
CREATE TABLE app.CustomerContacts (
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  ContactId uniqueidentifier NOT NULL,
  DisplayName nvarchar(150) NOT NULL,
  Email nvarchar(254) NOT NULL,
  IntendedRole varchar(16) NOT NULL CHECK(IntendedRole IN ('owner','admin','contributor','viewer')),
  CONSTRAINT PK_CustomerContacts PRIMARY KEY(OrganizationId,ContactId),
  CONSTRAINT UQ_CustomerContacts_Email UNIQUE(OrganizationId,Email)
);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerProfiles,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerProfiles AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerProfiles AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerContacts,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerContacts AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.CustomerContacts AFTER UPDATE;
GO
-- Private management directory: accessible only through role-checked management procedures.
-- Duplicated summary fields are updated atomically with the organization/profile.
CREATE TABLE security.CustomerDirectory (
  OrganizationId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES app.Organizations(OrganizationId),
  DisplayName nvarchar(200) NOT NULL,
  PrimaryContactEmail nvarchar(254) NOT NULL DEFAULT N'',
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  Revision rowversion NOT NULL
);
GO
-- Discover existing workspaces through their security catalogs without disabling RLS.
DECLARE @org uniqueidentifier;
DECLARE organizations CURSOR LOCAL FAST_FORWARD FOR
  SELECT OrganizationId FROM security.EntraConnections
  UNION SELECT OrganizationId FROM security.Memberships
  UNION SELECT OrganizationId FROM security.WorkspaceOwnershipRequests;
OPEN organizations;
FETCH NEXT FROM organizations INTO @org;
WHILE @@FETCH_STATUS=0
BEGIN
  EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
  INSERT security.CustomerDirectory(OrganizationId,DisplayName,PrimaryContactEmail)
    SELECT o.OrganizationId,o.DisplayName,COALESCE(r.TargetClientEmail,N'')
    FROM app.Organizations o LEFT JOIN security.WorkspaceOwnershipRequests r ON r.OrganizationId=o.OrganizationId
    WHERE o.OrganizationId=@org;
  INSERT app.CustomerContacts(OrganizationId,ContactId,DisplayName,Email,IntendedRole)
    SELECT OrganizationId,NEWID(),N'',TargetClientEmail,'owner'
    FROM security.WorkspaceOwnershipRequests WHERE OrganizationId=@org AND CompletedAt IS NULL;
  FETCH NEXT FROM organizations INTO @org;
END;
CLOSE organizations;
DEALLOCATE organizations;
EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
GO
CREATE PROCEDURE security.ManagementListCustomers @TenantId uniqueidentifier,@ObjectId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  SELECT OrganizationId,DisplayName,PrimaryContactEmail,UpdatedAt,CONVERT(varchar(18),Revision,1) AS Version
    FROM security.CustomerDirectory ORDER BY DisplayName,OrganizationId;
END;
GO
CREATE PROCEDURE security.ManagementGetCustomer @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@OrganizationId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  IF NOT EXISTS(SELECT 1 FROM security.CustomerDirectory WHERE OrganizationId=@OrganizationId) THROW 51004,'Customer not found.',1;
  BEGIN TRY
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    SELECT o.OrganizationId,o.DisplayName,d.PrimaryContactEmail,p.ProfileJson,CONVERT(varchar(18),d.Revision,1) AS Version,
      r.TargetClientEmail AS PendingOwnerEmail
      FROM app.Organizations o JOIN security.CustomerDirectory d ON d.OrganizationId=o.OrganizationId
      LEFT JOIN app.CustomerProfiles p ON p.OrganizationId=o.OrganizationId
      LEFT JOIN security.WorkspaceOwnershipRequests r ON r.OrganizationId=o.OrganizationId AND r.CompletedAt IS NULL
      WHERE o.OrganizationId=@OrganizationId;
    SELECT ContactId,DisplayName,Email,IntendedRole FROM app.CustomerContacts WHERE OrganizationId=@OrganizationId ORDER BY Email;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;
END;
GO
CREATE PROCEDURE security.ManagementSaveCustomer
  @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@OrganizationId uniqueidentifier,
  @DisplayName nvarchar(200),@PrimaryContactEmail nvarchar(254),@ProfileJson nvarchar(max),@ContactsJson nvarchar(max),
  @Create bit,@ExpectedVersion varchar(18)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  IF ISJSON(@ProfileJson)<>1 OR ISJSON(@ContactsJson)<>1 THROW 51002,'Invalid customer data.',1;
  BEGIN TRY
    BEGIN TRANSACTION;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    IF @Create=1
    BEGIN
      IF EXISTS(SELECT 1 FROM security.CustomerDirectory WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@OrganizationId)
        THROW 51001,'Customer already exists.',1;
      INSERT app.Organizations(OrganizationId,DisplayName) VALUES(@OrganizationId,@DisplayName);
      INSERT security.CustomerDirectory(OrganizationId,DisplayName,PrimaryContactEmail)
        VALUES(@OrganizationId,@DisplayName,@PrimaryContactEmail);
    END
    ELSE
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM security.CustomerDirectory WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@OrganizationId)
        THROW 51004,'Customer not found.',1;
      UPDATE security.CustomerDirectory SET DisplayName=@DisplayName,PrimaryContactEmail=@PrimaryContactEmail,UpdatedAt=SYSUTCDATETIME()
        WHERE OrganizationId=@OrganizationId AND CONVERT(varchar(18),Revision,1)=@ExpectedVersion;
      IF @@ROWCOUNT=0 THROW 51001,'This customer was changed by another administrator. Reload before saving.',1;
      UPDATE app.Organizations SET DisplayName=@DisplayName WHERE OrganizationId=@OrganizationId;
    END;
    UPDATE app.CustomerProfiles SET ProfileJson=@ProfileJson WHERE OrganizationId=@OrganizationId;
    IF @@ROWCOUNT=0 INSERT app.CustomerProfiles(OrganizationId,ProfileJson) VALUES(@OrganizationId,@ProfileJson);
    DELETE app.CustomerContacts WHERE OrganizationId=@OrganizationId;
    INSERT app.CustomerContacts(OrganizationId,ContactId,DisplayName,Email,IntendedRole)
      SELECT @OrganizationId,id,displayName,email,role FROM OPENJSON(@ContactsJson)
      WITH(id uniqueidentifier,displayName nvarchar(150),email nvarchar(254),role varchar(16));
    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
      VALUES(@OrganizationId,'entra',CONVERT(nvarchar(36),@ObjectId),CASE WHEN @Create=1 THEN 'customer.created' ELSE 'customer.updated' END);
    SELECT CONVERT(varchar(18),Revision,1) AS Version FROM security.CustomerDirectory WHERE OrganizationId=@OrganizationId;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
GRANT EXECUTE ON security.ManagementListCustomers TO nso_runtime;
GRANT EXECUTE ON security.ManagementGetCustomer TO nso_runtime;
GRANT EXECUTE ON security.ManagementSaveCustomer TO nso_runtime;
GO
