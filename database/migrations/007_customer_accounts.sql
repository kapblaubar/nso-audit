-- Additive customer authentication. Runtime access is limited to procedures.
CREATE TABLE security.AuthAttempts (
  BucketHash char(64) NOT NULL PRIMARY KEY,
  WindowStart datetime2 NOT NULL,
  Attempts int NOT NULL
);
GO
CREATE PROCEDURE security.AuthThrottle @BucketHash char(64), @Limit int
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DELETE TOP(100) FROM security.AuthAttempts WHERE WindowStart<DATEADD(day,-1,SYSUTCDATETIME());
  IF NOT EXISTS(SELECT 1 FROM security.AuthAttempts WITH(UPDLOCK,HOLDLOCK) WHERE BucketHash=@BucketHash)
    INSERT security.AuthAttempts VALUES(@BucketHash,SYSUTCDATETIME(),0);
  UPDATE security.AuthAttempts SET Attempts=CASE WHEN WindowStart<DATEADD(minute,-15,SYSUTCDATETIME()) THEN 1 ELSE Attempts+1 END,
    WindowStart=CASE WHEN WindowStart<DATEADD(minute,-15,SYSUTCDATETIME()) THEN SYSUTCDATETIME() ELSE WindowStart END WHERE BucketHash=@BucketHash;
  SELECT CAST(CASE WHEN Attempts<=@Limit THEN 1 ELSE 0 END AS bit) AS Allowed FROM security.AuthAttempts WHERE BucketHash=@BucketHash;
  COMMIT;
END;
GO
CREATE PROCEDURE security.AuthRegister @Email nvarchar(254),@DisplayName nvarchar(150),@PasswordHash nvarchar(512),@TokenHash char(64)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  IF NOT EXISTS(SELECT 1 FROM identitydata.Users WITH(UPDLOCK,HOLDLOCK) WHERE NormalizedEmail=@Email)
  BEGIN
    DECLARE @id uniqueidentifier=NEWID();
    INSERT identitydata.Users(UserId,Email,NormalizedEmail,DisplayName,PasswordHash) VALUES(@id,@Email,@Email,@DisplayName,@PasswordHash);
    INSERT identitydata.AccountTokens(TokenHash,UserId,Purpose,ExpiresAt) VALUES(@TokenHash,@id,'verifyEmail',DATEADD(hour,24,SYSUTCDATETIME()));
    SELECT @Email AS Email;
  END;
  COMMIT;
END;
GO
CREATE PROCEDURE security.AuthLookup @Email nvarchar(254)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT UserId,PasswordHash FROM identitydata.Users WHERE NormalizedEmail=@Email AND DisabledAt IS NULL;
END;
GO
CREATE PROCEDURE security.AuthLogin @UserId uniqueidentifier,@ExpectedHash nvarchar(512),@SessionHash char(64)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT identitydata.Sessions(TokenHash,UserId,ExpiresAt)
    SELECT @SessionHash,UserId,DATEADD(hour,8,SYSUTCDATETIME()) FROM identitydata.Users
    WHERE UserId=@UserId AND PasswordHash=@ExpectedHash AND DisabledAt IS NULL AND EmailVerifiedAt IS NOT NULL;
  SELECT @@ROWCOUNT AS Created;
END;
GO
CREATE PROCEDURE security.AuthIssueToken @Email nvarchar(254),@Purpose varchar(16),@TokenHash char(64)
AS
BEGIN
  SET NOCOUNT ON;
  IF @Purpose NOT IN ('verifyEmail','resetPassword') THROW 51002,'Invalid purpose.',1;
  INSERT identitydata.AccountTokens(TokenHash,UserId,Purpose,ExpiresAt)
    SELECT @TokenHash,UserId,@Purpose,DATEADD(minute,CASE WHEN @Purpose='verifyEmail' THEN 1440 ELSE 30 END,SYSUTCDATETIME())
    FROM identitydata.Users WHERE NormalizedEmail=@Email AND DisabledAt IS NULL
      AND ((@Purpose='verifyEmail' AND EmailVerifiedAt IS NULL) OR (@Purpose='resetPassword' AND EmailVerifiedAt IS NOT NULL));
  IF @@ROWCOUNT>0 SELECT @Email AS Email;
END;
GO
CREATE PROCEDURE security.AuthCompleteToken @TokenHash char(64),@Purpose varchar(16),@PasswordHash nvarchar(512)=NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Purpose NOT IN ('verifyEmail','resetPassword') OR (@Purpose='resetPassword' AND @PasswordHash IS NULL)
    THROW 51002,'Invalid purpose.',1;
  BEGIN TRANSACTION;
  DECLARE @user uniqueidentifier;
  SELECT @user=t.UserId FROM identitydata.AccountTokens t WITH(UPDLOCK,HOLDLOCK)
    JOIN identitydata.Users u ON u.UserId=t.UserId AND u.DisabledAt IS NULL
    WHERE t.TokenHash=@TokenHash AND t.Purpose=@Purpose AND t.UsedAt IS NULL AND t.ExpiresAt>SYSUTCDATETIME();
  IF @user IS NULL BEGIN ROLLBACK; THROW 51010,'Link is invalid or expired.',1; END;
  UPDATE identitydata.AccountTokens SET UsedAt=SYSUTCDATETIME() WHERE UserId=@user AND Purpose=@Purpose AND UsedAt IS NULL;
  IF @Purpose='verifyEmail'
    UPDATE identitydata.Users SET EmailVerifiedAt=COALESCE(EmailVerifiedAt,SYSUTCDATETIME()) WHERE UserId=@user;
  ELSE
  BEGIN
    UPDATE identitydata.Users SET PasswordHash=@PasswordHash WHERE UserId=@user;
    UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE UserId=@user AND RevokedAt IS NULL;
  END;
  COMMIT;
END;
GO
CREATE PROCEDURE security.AuthSession @TokenHash char(64),@Revoke bit=0
AS
BEGIN
  SET NOCOUNT ON;
  IF @Revoke=1 BEGIN UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE TokenHash=@TokenHash; RETURN; END;
  DECLARE @user uniqueidentifier;
  SELECT @user=u.UserId FROM identitydata.Sessions s JOIN identitydata.Users u ON u.UserId=s.UserId
    WHERE s.TokenHash=@TokenHash AND s.RevokedAt IS NULL AND s.ExpiresAt>SYSUTCDATETIME() AND u.DisabledAt IS NULL AND u.EmailVerifiedAt IS NOT NULL;
  SELECT UserId,Email,DisplayName FROM identitydata.Users WHERE UserId=@user;
  SELECT d.OrganizationId,d.DisplayName,m.Role FROM security.Memberships m
    JOIN security.CustomerDirectory d ON d.OrganizationId=m.OrganizationId WHERE m.UserId=@user;
END;
GO
CREATE PROCEDURE security.ManagementActivateContact @TenantId uniqueidentifier,@ObjectId uniqueidentifier,@OrganizationId uniqueidentifier,@ContactId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF NOT EXISTS(SELECT 1 FROM identitydata.ManagementUsers WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId
    AND DisabledAt IS NULL AND Role IN ('setupAdmin','platformAdmin')) THROW 51003,'Management role required.',1;
  BEGIN TRY
    BEGIN TRANSACTION;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    DECLARE @user uniqueidentifier,@role varchar(16);
    SELECT @user=u.UserId,@role=c.IntendedRole FROM app.CustomerContacts c
      JOIN identitydata.Users u ON u.NormalizedEmail=LOWER(LTRIM(RTRIM(c.Email))) AND u.EmailVerifiedAt IS NOT NULL AND u.DisabledAt IS NULL
      JOIN app.Organizations o ON o.OrganizationId=c.OrganizationId AND o.Status='active'
      WHERE c.OrganizationId=@OrganizationId AND c.ContactId=@ContactId;
    IF @user IS NULL THROW 51011,'Contact must create and verify an email account first.',1;
    IF EXISTS(SELECT 1 FROM security.Memberships WITH(UPDLOCK,HOLDLOCK) WHERE OrganizationId=@OrganizationId AND UserId=@user)
      UPDATE security.Memberships SET Role=@role WHERE OrganizationId=@OrganizationId AND UserId=@user;
    ELSE INSERT security.Memberships(OrganizationId,UserId,Role) VALUES(@OrganizationId,@user,@role);
    INSERT app.AuditEvents(OrganizationId,ActorType,ActorId,Action) VALUES(@OrganizationId,'entra',CONVERT(nvarchar(36),@ObjectId),'customer.contactActivated');
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
GRANT EXECUTE ON security.AuthThrottle TO nso_runtime;
GRANT EXECUTE ON security.AuthRegister TO nso_runtime;
GRANT EXECUTE ON security.AuthLookup TO nso_runtime;
GRANT EXECUTE ON security.AuthLogin TO nso_runtime;
GRANT EXECUTE ON security.AuthIssueToken TO nso_runtime;
GRANT EXECUTE ON security.AuthCompleteToken TO nso_runtime;
GRANT EXECUTE ON security.AuthSession TO nso_runtime;
GRANT EXECUTE ON security.ManagementActivateContact TO nso_runtime;
GO
