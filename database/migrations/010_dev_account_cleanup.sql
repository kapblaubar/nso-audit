-- Dev tooling is exposed only by Dev API routes; no runtime schema-wide identity grants.
-- Preserve shared answers while removing their reference to a deleted account.
ALTER TABLE app.Answers ALTER COLUMN UpdatedBy uniqueidentifier NULL;
GO
CREATE PROCEDURE security.ManagementListAccounts @TenantId uniqueidentifier,@ObjectId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  SELECT u.UserId,u.Email,u.DisplayName,u.EmailVerifiedAt,u.CreatedAt,
    (SELECT COUNT(*) FROM security.Memberships m WHERE m.UserId=u.UserId) AS MembershipCount
    FROM identitydata.Users u ORDER BY u.CreatedAt DESC,u.UserId;
END;
GO
CREATE PROCEDURE security.ManagementDeleteAccount @TenantId uniqueidentifier,@ObjectId uniqueidentifier,
  @UserId uniqueidentifier,@ConfirmationEmail nvarchar(254),@EmailBucketHash char(64)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @email nvarchar(254);
    SELECT @email=NormalizedEmail FROM identitydata.Users WITH(UPDLOCK,HOLDLOCK) WHERE UserId=@UserId;
    IF @email IS NULL THROW 51004,'Account not found.',1;
    IF @email<>LOWER(LTRIM(RTRIM(@ConfirmationEmail))) THROW 51002,'Email confirmation does not match.',1;
    -- The private directory lets the role-checked procedure visit every organization through RLS.
    DECLARE @org uniqueidentifier;
    DECLARE organizations CURSOR LOCAL FAST_FORWARD FOR SELECT OrganizationId FROM security.CustomerDirectory;
    OPEN organizations;
    FETCH NEXT FROM organizations INTO @org;
    WHILE @@FETCH_STATUS=0
    BEGIN
      -- Match management save's lock order and invalidate stale customer editors.
      UPDATE security.CustomerDirectory SET UpdatedAt=SYSUTCDATETIME() WHERE OrganizationId=@org
        AND EXISTS(SELECT 1 FROM security.Memberships WHERE OrganizationId=@org AND UserId=@UserId);
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
      UPDATE app.Answers SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;
      DELETE app.CustomerContacts WHERE OrganizationId=@org AND LOWER(LTRIM(RTRIM(Email)))=@email;
      IF @@ROWCOUNT>0 UPDATE security.CustomerDirectory SET UpdatedAt=SYSUTCDATETIME() WHERE OrganizationId=@org;
      DELETE app.AuditEvents WHERE OrganizationId=@org AND ActorType IN ('email','user') AND ActorId=CONVERT(nvarchar(36),@UserId);
      IF EXISTS(SELECT 1 FROM security.Memberships WHERE OrganizationId=@org AND UserId=@UserId)
        INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
          VALUES(@org,'entra',CONVERT(nvarchar(36),@ObjectId),'customer.testAccountDeleted');
      FETCH NEXT FROM organizations INTO @org;
    END;
    CLOSE organizations; DEALLOCATE organizations;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    DELETE security.WorkspaceOwnershipRequests WHERE CompletedUserId=@UserId;
    DELETE security.Memberships WHERE UserId=@UserId;
    DELETE identitydata.RegistrationRequests WHERE UserId=@UserId;
    DELETE security.AuthAttempts WHERE BucketHash=@EmailBucketHash OR BucketHash IN (
      SELECT LOWER(CONVERT(char(64),HASHBYTES('SHA2_256',CONVERT(varchar(70),'email:'+TokenHash)),2)) FROM identitydata.AccountTokens WHERE UserId=@UserId);
    DELETE identitydata.AccountTokens WHERE UserId=@UserId;
    DELETE identitydata.Sessions WHERE UserId=@UserId;
    DELETE identitydata.Users WHERE UserId=@UserId;
    COMMIT;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
GRANT EXECUTE ON security.ManagementListAccounts TO nso_runtime;
GRANT EXECUTE ON security.ManagementDeleteAccount TO nso_runtime;
GO
