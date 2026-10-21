-- SQL rowversion must be cast to binary before hexadecimal conversion.
-- Preserve role checks, row locks, stale-write rejection and contact-access revocation.
ALTER PROCEDURE security.ManagementListCustomers @TenantId uniqueidentifier,@ObjectId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  SELECT OrganizationId,DisplayName,PrimaryContactEmail,UpdatedAt,CONVERT(varchar(18),CONVERT(binary(8),Revision),1) AS Version
    FROM security.CustomerDirectory ORDER BY DisplayName,OrganizationId;
END;
GO
ALTER PROCEDURE security.ManagementGetCustomer @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@OrganizationId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  IF NOT EXISTS(SELECT 1 FROM security.CustomerDirectory WHERE OrganizationId=@OrganizationId) THROW 51004,'Customer not found.',1;
  BEGIN TRY
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    SELECT o.OrganizationId,o.DisplayName,d.PrimaryContactEmail,p.ProfileJson,CONVERT(varchar(18),CONVERT(binary(8),d.Revision),1) AS Version,
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

ALTER PROCEDURE security.ManagementSaveCustomer
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
        WHERE OrganizationId=@OrganizationId AND CONVERT(varchar(18),CONVERT(binary(8),Revision),1)=@ExpectedVersion;
      IF @@ROWCOUNT=0 THROW 51001,'This customer was changed by another administrator. Reload before saving.',1;
      UPDATE app.Organizations SET DisplayName=@DisplayName WHERE OrganizationId=@OrganizationId;
    END;
    UPDATE app.CustomerProfiles SET ProfileJson=@ProfileJson WHERE OrganizationId=@OrganizationId;
    IF @@ROWCOUNT=0 INSERT app.CustomerProfiles(OrganizationId,ProfileJson) VALUES(@OrganizationId,@ProfileJson);
    DECLARE @PreviousEmails table(Email nvarchar(254));
    DELETE app.CustomerContacts OUTPUT DELETED.Email INTO @PreviousEmails WHERE OrganizationId=@OrganizationId;
    INSERT app.CustomerContacts(OrganizationId,ContactId,DisplayName,Email,IntendedRole)
      SELECT @OrganizationId,id,displayName,email,role FROM OPENJSON(@ContactsJson)
      WITH(id uniqueidentifier,displayName nvarchar(150),email nvarchar(254),role varchar(16));
    -- Saving a removed contact must revoke its account's access atomically.
    DELETE m FROM security.Memberships m
      JOIN identitydata.Users u ON u.UserId=m.UserId
      WHERE m.OrganizationId=@OrganizationId
        AND EXISTS(SELECT 1 FROM @PreviousEmails p WHERE LOWER(LTRIM(RTRIM(p.Email)))=u.NormalizedEmail)
        AND NOT EXISTS(SELECT 1 FROM app.CustomerContacts c WHERE c.OrganizationId=@OrganizationId AND LOWER(LTRIM(RTRIM(c.Email)))=u.NormalizedEmail);
    IF @@ROWCOUNT>0
      INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
      VALUES(@OrganizationId,'entra',CONVERT(nvarchar(36),@ObjectId),'customer.contactAccessRevoked');

    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
      VALUES(@OrganizationId,'entra',CONVERT(nvarchar(36),@ObjectId),CASE WHEN @Create=1 THEN 'customer.created' ELSE 'customer.updated' END);
    SELECT CONVERT(varchar(18),CONVERT(binary(8),Revision),1) AS Version FROM security.CustomerDirectory WHERE OrganizationId=@OrganizationId;
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
