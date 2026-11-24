-- Explicit portal assignments for verified Entra principals.
CREATE TABLE identitydata.PartnerAuditUsers (
  EntraTenantId uniqueidentifier NOT NULL,
  EntraObjectId uniqueidentifier NOT NULL,
  Role varchar(16) NOT NULL CHECK (Role IN ('partnerAdmin','partnerUser')),
  DisabledAt datetime2 NULL,
  CONSTRAINT PK_PartnerAuditUsers PRIMARY KEY (EntraTenantId,EntraObjectId)
);

CREATE TABLE security.PartnerAuditAssignments (
  EntraTenantId uniqueidentifier NOT NULL,
  EntraObjectId uniqueidentifier NOT NULL,
  OrganizationId uniqueidentifier NOT NULL REFERENCES security.CustomerDirectory(OrganizationId),
  RevokedAt datetime2 NULL,
  CONSTRAINT PK_PartnerAuditAssignments PRIMARY KEY (EntraTenantId,EntraObjectId,OrganizationId),
  CONSTRAINT FK_PartnerAuditAssignments_User FOREIGN KEY (EntraTenantId,EntraObjectId)
    REFERENCES identitydata.PartnerAuditUsers(EntraTenantId,EntraObjectId)
);
GO
CREATE PROCEDURE security.ResolvePartnerAudit
  @EntraTenantId uniqueidentifier, @EntraObjectId uniqueidentifier,
  @OrganizationId uniqueidentifier=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT Role, DisabledAt FROM identitydata.PartnerAuditUsers
    WHERE EntraTenantId=@EntraTenantId AND EntraObjectId=@EntraObjectId;

  DECLARE @visible TABLE (OrganizationId uniqueidentifier PRIMARY KEY);
  DECLARE @scope uniqueidentifier;
  DECLARE scopes CURSOR LOCAL FAST_FORWARD FOR
    SELECT a.OrganizationId FROM security.PartnerAuditAssignments a
    JOIN identitydata.PartnerAuditUsers u
      ON u.EntraTenantId=a.EntraTenantId AND u.EntraObjectId=a.EntraObjectId
    WHERE a.EntraTenantId=@EntraTenantId AND a.EntraObjectId=@EntraObjectId
      AND u.DisabledAt IS NULL AND a.RevokedAt IS NULL
      AND (@OrganizationId IS NULL OR a.OrganizationId=@OrganizationId);

  BEGIN TRY
    OPEN scopes;
    FETCH NEXT FROM scopes INTO @scope;
    WHILE @@FETCH_STATUS=0
    BEGIN
      EXEC sys.sp_set_session_context @key=N'organizationId',@value=@scope;
      INSERT @visible SELECT OrganizationId FROM app.Organizations
        WHERE OrganizationId=@scope AND Status='active';
      FETCH NEXT FROM scopes INTO @scope;
    END;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    CLOSE scopes;
    DEALLOCATE scopes;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;

  SELECT v.OrganizationId,d.DisplayName,c.TenantId
    FROM @visible v JOIN security.CustomerDirectory d ON d.OrganizationId=v.OrganizationId
    JOIN security.EntraConnections c ON c.OrganizationId=v.OrganizationId
    ORDER BY d.DisplayName,v.OrganizationId,c.TenantId;
END;
GO
GRANT EXECUTE ON OBJECT::security.ResolvePartnerAudit TO nso_runtime;
GRANT EXECUTE ON OBJECT::security.ResolvePartnerAudit TO nso_compare_reader;

GO
ALTER PROCEDURE security.AuthResolveAudit @TokenHash char(64),@OrganizationId uniqueidentifier,@TenantId uniqueidentifier=NULL
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
      WHERE c.OrganizationId=@OrganizationId AND (@TenantId IS NULL OR c.TenantId=@TenantId)
      ORDER BY c.TenantId;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;
END;
GO
