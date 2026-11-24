-- Partner users require explicit tenant assignments in addition to their client grant.
CREATE TABLE security.PartnerAuditTenantAssignments (
  EntraTenantId uniqueidentifier NOT NULL,
  EntraObjectId uniqueidentifier NOT NULL,
  OrganizationId uniqueidentifier NOT NULL,
  TenantId uniqueidentifier NOT NULL,
  RevokedAt datetime2 NULL,
  CONSTRAINT PK_PartnerAuditTenantAssignments PRIMARY KEY (EntraTenantId,EntraObjectId,OrganizationId,TenantId),
  CONSTRAINT FK_PartnerAuditTenantAssignments_Client FOREIGN KEY (EntraTenantId,EntraObjectId,OrganizationId)
    REFERENCES security.PartnerAuditAssignments(EntraTenantId,EntraObjectId,OrganizationId),
  CONSTRAINT FK_PartnerAuditTenantAssignments_Connection FOREIGN KEY (OrganizationId,TenantId)
    REFERENCES security.EntraConnections(OrganizationId,TenantId)
);
GO
ALTER PROCEDURE security.ResolvePartnerAudit
  @EntraTenantId uniqueidentifier, @EntraObjectId uniqueidentifier,
  @OrganizationId uniqueidentifier=NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @role varchar(16);
  SELECT @role=Role FROM identitydata.PartnerAuditUsers
    WHERE EntraTenantId=@EntraTenantId AND EntraObjectId=@EntraObjectId;
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
    WHERE @role='partnerAdmin' OR EXISTS(
      SELECT 1 FROM security.PartnerAuditTenantAssignments t
      WHERE t.EntraTenantId=@EntraTenantId AND t.EntraObjectId=@EntraObjectId
        AND t.OrganizationId=v.OrganizationId AND t.TenantId=c.TenantId AND t.RevokedAt IS NULL
    )
    ORDER BY d.DisplayName,v.OrganizationId,c.TenantId;
END;
GO
