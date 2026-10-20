-- Resolve audit targets from a live session and explicit membership, never from email/domain.
ALTER PROCEDURE security.AuthSession @TokenHash char(64),@Revoke bit=0
AS
BEGIN
  SET NOCOUNT ON;
  IF @Revoke=1 BEGIN UPDATE identitydata.Sessions SET RevokedAt=SYSUTCDATETIME() WHERE TokenHash=@TokenHash; RETURN; END;
  DECLARE @user uniqueidentifier;
  SELECT @user=u.UserId FROM identitydata.Sessions s JOIN identitydata.Users u ON u.UserId=s.UserId
    WHERE s.TokenHash=@TokenHash AND s.RevokedAt IS NULL AND s.ExpiresAt>SYSUTCDATETIME() AND u.DisabledAt IS NULL AND u.EmailVerifiedAt IS NOT NULL;
  SELECT UserId,Email,DisplayName FROM identitydata.Users WHERE UserId=@user;
  SELECT d.OrganizationId,d.DisplayName,m.Role,c.TenantId FROM security.Memberships m
    JOIN security.CustomerDirectory d ON d.OrganizationId=m.OrganizationId
    LEFT JOIN security.EntraConnections c ON c.OrganizationId=m.OrganizationId WHERE m.UserId=@user;
END;
GO
CREATE PROCEDURE security.AuthResolveAudit @TokenHash char(64),@OrganizationId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @user uniqueidentifier,@role varchar(16);
  SELECT @user=u.UserId,@role=m.Role FROM identitydata.Sessions s
    JOIN identitydata.Users u ON u.UserId=s.UserId
    JOIN security.Memberships m ON m.UserId=u.UserId AND m.OrganizationId=@OrganizationId
    WHERE s.TokenHash=@TokenHash AND s.RevokedAt IS NULL AND s.ExpiresAt>SYSUTCDATETIME() AND u.DisabledAt IS NULL AND u.EmailVerifiedAt IS NOT NULL;
  IF @user IS NULL RETURN;
  BEGIN TRY
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    SELECT @user AS UserId,@role AS Role,c.TenantId FROM security.EntraConnections c
      JOIN app.Organizations o ON o.OrganizationId=c.OrganizationId AND o.Status='active'
      WHERE c.OrganizationId=@OrganizationId;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;
END;
GO
GRANT EXECUTE ON security.AuthResolveAudit TO nso_runtime;
GO
