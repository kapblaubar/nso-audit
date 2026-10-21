-- Invitation secrets stay hashed in a private catalog, accessible only through narrow procedures.
CREATE TABLE identitydata.WorkspaceInvitations (
  TokenHash char(64) NOT NULL PRIMARY KEY,
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  ContactId uniqueidentifier NOT NULL,
  NormalizedEmail nvarchar(254) NOT NULL,
  DisplayName nvarchar(150) NOT NULL,
  IntendedRole varchar(16) NOT NULL CHECK(IntendedRole IN ('owner','admin','contributor','viewer')),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ExpiresAt datetime2 NOT NULL,
  DeliveredAt datetime2 NULL,
  UsedAt datetime2 NULL,
  RevokedAt datetime2 NULL
);
CREATE INDEX IX_WorkspaceInvitations_Contact ON identitydata.WorkspaceInvitations(OrganizationId,ContactId);
GO
CREATE PROCEDURE security.ManagementInviteContact
  @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@OrganizationId uniqueidentifier,@ContactId uniqueidentifier,
  @TokenHash char(64),@LifetimeHours int=72
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  IF @LifetimeHours<1 OR @LifetimeHours>168 THROW 51002,'Invalid invitation lifetime.',1;
  BEGIN TRY
    BEGIN TRANSACTION;
    -- Match customer-save lock order so a concurrent contact edit cannot race issuance/acceptance.
    DECLARE @company nvarchar(200);
    SELECT @company=DisplayName FROM security.CustomerDirectory WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@OrganizationId;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    DECLARE @email nvarchar(254),@name nvarchar(150),@role varchar(16);
    SELECT @email=LOWER(LTRIM(RTRIM(c.Email))),@name=c.DisplayName,@role=c.IntendedRole FROM app.CustomerContacts c
      JOIN app.Organizations o ON o.OrganizationId=c.OrganizationId AND o.Status='active'
      WHERE c.OrganizationId=@OrganizationId AND c.ContactId=@ContactId;
    IF @email IS NULL THROW 51004,'Saved contact not found.',1;
    IF EXISTS(SELECT 1 FROM identitydata.WorkspaceInvitations WHERE OrganizationId=@OrganizationId AND ContactId=@ContactId
      AND RevokedAt IS NULL AND CreatedAt>DATEADD(minute,-1,SYSUTCDATETIME())) THROW 51014,'Wait a minute before resending.',1;
    UPDATE identitydata.WorkspaceInvitations SET RevokedAt=SYSUTCDATETIME()
      WHERE OrganizationId=@OrganizationId AND ContactId=@ContactId AND UsedAt IS NULL AND RevokedAt IS NULL;
    INSERT identitydata.WorkspaceInvitations(TokenHash,OrganizationId,ContactId,NormalizedEmail,DisplayName,IntendedRole,ExpiresAt)
      VALUES(@TokenHash,@OrganizationId,@ContactId,@email,@name,@role,DATEADD(hour,@LifetimeHours,SYSUTCDATETIME()));
    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
      VALUES(@OrganizationId,'entra',CONVERT(nvarchar(36),@ObjectId),'customer.invitationCreated');
    SELECT @email AS Email,@company AS CompanyName,@name AS DisplayName,@role AS IntendedRole;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    COMMIT;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE PROCEDURE security.ManagementInvitationDelivery
  @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@TokenHash char(64),@Succeeded bit
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  UPDATE identitydata.WorkspaceInvitations SET DeliveredAt=CASE WHEN @Succeeded=1 THEN SYSUTCDATETIME() ELSE NULL END,
    RevokedAt=CASE WHEN @Succeeded=0 THEN SYSUTCDATETIME() ELSE RevokedAt END
    WHERE TokenHash=@TokenHash AND UsedAt IS NULL AND RevokedAt IS NULL;
END;
GO
CREATE PROCEDURE security.AuthInspectInvitation @TokenHash char(64)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @org uniqueidentifier;
  SELECT @org=OrganizationId FROM identitydata.WorkspaceInvitations WHERE TokenHash=@TokenHash
    AND DeliveredAt IS NOT NULL AND UsedAt IS NULL AND RevokedAt IS NULL AND ExpiresAt>SYSUTCDATETIME();
  IF @org IS NULL THROW 51010,'Invitation is invalid or expired.',1;
  BEGIN TRY
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    SELECT i.NormalizedEmail AS Email,i.DisplayName,o.DisplayName AS CompanyName,i.IntendedRole,
      CAST(CASE WHEN u.EmailVerifiedAt IS NOT NULL THEN 0 ELSE 1 END AS bit) AS NeedsPassword
      FROM identitydata.WorkspaceInvitations i
      JOIN app.Organizations o ON o.OrganizationId=i.OrganizationId AND o.Status='active'
      JOIN app.CustomerContacts c ON c.OrganizationId=i.OrganizationId AND c.ContactId=i.ContactId
        AND LOWER(LTRIM(RTRIM(c.Email)))=i.NormalizedEmail AND c.IntendedRole=i.IntendedRole
      LEFT JOIN identitydata.Users u ON u.NormalizedEmail=i.NormalizedEmail
      WHERE i.TokenHash=@TokenHash AND i.DeliveredAt IS NOT NULL AND i.UsedAt IS NULL AND i.RevokedAt IS NULL AND i.ExpiresAt>SYSUTCDATETIME()
        AND (u.UserId IS NULL OR u.DisabledAt IS NULL);
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;
END;
GO
CREATE PROCEDURE security.AuthAcceptInvitation @TokenHash char(64),@PasswordHash nvarchar(512)=NULL,@SessionHash char(64)=NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @org uniqueidentifier;
  SELECT @org=OrganizationId FROM identitydata.WorkspaceInvitations WHERE TokenHash=@TokenHash;
  IF @org IS NULL THROW 51010,'Invitation is invalid or expired.',1;
  BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @directory uniqueidentifier;
    SELECT @directory=OrganizationId FROM security.CustomerDirectory WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@org;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@org;
    DECLARE @email nvarchar(254),@name nvarchar(150),@role varchar(16),@contact uniqueidentifier;
    SELECT @email=i.NormalizedEmail,@name=i.DisplayName,@role=i.IntendedRole,@contact=i.ContactId
      FROM identitydata.WorkspaceInvitations i WITH(UPDLOCK,HOLDLOCK)
      JOIN app.CustomerContacts c ON c.OrganizationId=i.OrganizationId AND c.ContactId=i.ContactId
        AND LOWER(LTRIM(RTRIM(c.Email)))=i.NormalizedEmail AND c.IntendedRole=i.IntendedRole
      JOIN app.Organizations o ON o.OrganizationId=i.OrganizationId AND o.Status='active'
      WHERE i.TokenHash=@TokenHash AND i.DeliveredAt IS NOT NULL AND i.UsedAt IS NULL AND i.RevokedAt IS NULL AND i.ExpiresAt>SYSUTCDATETIME();
    IF @email IS NULL THROW 51010,'Invitation is invalid or expired.',1;
    DECLARE @user uniqueidentifier,@verified datetime2,@disabled datetime2;
    SELECT @user=UserId,@verified=EmailVerifiedAt,@disabled=DisabledAt FROM identitydata.Users WITH(UPDLOCK,HOLDLOCK) WHERE NormalizedEmail=@email;
    IF @disabled IS NOT NULL THROW 51010,'Invitation is invalid or expired.',1;
    IF @verified IS NOT NULL
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM identitydata.Sessions WHERE TokenHash=@SessionHash AND UserId=@user
        AND RevokedAt IS NULL AND ExpiresAt>SYSUTCDATETIME()) THROW 51015,'Sign in with the invited account to accept.',1;
      -- Existing verified account passwords are NEVER replaced by an invitation.
    END
    ELSE
    BEGIN
      IF @PasswordHash IS NULL THROW 51016,'Choose a password to accept.',1;
      IF @user IS NULL
      BEGIN
        SET @user=NEWID();
        INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash,EmailVerifiedAt)
          VALUES(@user,@email,@email,@name,@PasswordHash,SYSUTCDATETIME());
      END
      ELSE
      BEGIN
        UPDATE identitydata.Users SET PasswordHash=@PasswordHash,EmailVerifiedAt=SYSUTCDATETIME() WHERE UserId=@user;
        UPDATE identitydata.AccountTokens SET UsedAt=SYSUTCDATETIME() WHERE UserId=@user AND UsedAt IS NULL;
        UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE UserId=@user AND RevokedAt IS NULL;
      END;
    END;
    IF EXISTS(SELECT 1 FROM security.Memberships WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@org AND UserId=@user)
      UPDATE security.Memberships SET Role=@role WHERE OrganizationId=@org AND UserId=@user;
    ELSE INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@org,@user,@role);
    UPDATE identitydata.WorkspaceInvitations SET UsedAt=SYSUTCDATETIME()
      WHERE OrganizationId=@org AND ContactId=@contact AND UsedAt IS NULL AND RevokedAt IS NULL;
    UPDATE security.WorkspaceOwnershipRequests SET CompletedAt=SYSUTCDATETIME(),CompletedUserId=@user
      WHERE OrganizationId=@org AND LOWER(LTRIM(RTRIM(TargetClientEmail)))=@email AND CompletedAt IS NULL AND @role='owner';
    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action)
      VALUES(@org,'email',CONVERT(nvarchar(36),@user),'customer.invitationAccepted');
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    COMMIT;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
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
    SELECT c.ContactId,c.DisplayName,c.Email,c.IntendedRole,
      CASE WHEN EXISTS(SELECT 1 FROM security.Memberships m JOIN identitydata.Users u ON u.UserId=m.UserId
        WHERE m.OrganizationId=c.OrganizationId AND u.NormalizedEmail=LOWER(LTRIM(RTRIM(c.Email))) AND u.DisabledAt IS NULL) THEN 'active'
      WHEN EXISTS(SELECT 1 FROM identitydata.WorkspaceInvitations i WHERE i.OrganizationId=c.OrganizationId AND i.ContactId=c.ContactId
        AND i.NormalizedEmail=LOWER(LTRIM(RTRIM(c.Email))) AND i.IntendedRole=c.IntendedRole AND i.DeliveredAt IS NOT NULL
        AND i.UsedAt IS NULL AND i.RevokedAt IS NULL AND i.ExpiresAt>SYSUTCDATETIME()) THEN 'invited' ELSE 'notInvited' END AS InvitationStatus
      FROM app.CustomerContacts c WHERE c.OrganizationId=@OrganizationId ORDER BY c.Email;
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
    -- A saved removal/email/role change permanently revokes old pending invitations.
    UPDATE i SET RevokedAt=SYSUTCDATETIME() FROM identitydata.WorkspaceInvitations i
      WHERE i.OrganizationId=@OrganizationId AND i.UsedAt IS NULL AND i.RevokedAt IS NULL
        AND NOT EXISTS(SELECT 1 FROM OPENJSON(@ContactsJson) WITH(id uniqueidentifier,email nvarchar(254),role varchar(16)) c
          WHERE c.id=i.ContactId AND LOWER(LTRIM(RTRIM(c.email)))=i.NormalizedEmail AND c.role=i.IntendedRole);
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

ALTER PROCEDURE security.ManagementDeleteAccount @TenantId uniqueidentifier,@ObjectId uniqueidentifier,
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
    DELETE identitydata.WorkspaceInvitations WHERE NormalizedEmail=@email;
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

GRANT EXECUTE ON security.ManagementInviteContact TO nso_runtime;
GRANT EXECUTE ON security.ManagementInvitationDelivery TO nso_runtime;
GRANT EXECUTE ON security.AuthInspectInvitation TO nso_runtime;
GRANT EXECUTE ON security.AuthAcceptInvitation TO nso_runtime;
GO
