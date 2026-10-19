-- Management is explicitly provisioned, never inferred from an email domain.
CREATE PROCEDURE security.GetManagementRole
  @TenantId uniqueidentifier,
  @ObjectId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  SELECT Role FROM identitydata.ManagementUsers
    WHERE EntraTenantId=@TenantId AND EntraObjectId=@ObjectId AND DisabledAt IS NULL;
END;
GO
GRANT EXECUTE ON security.GetManagementRole TO nso_runtime;
GO
