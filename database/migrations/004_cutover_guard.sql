CREATE PROCEDURE security.GetScanStorageState
AS
BEGIN
  SET NOCOUNT ON;
  SELECT Backend FROM dbo.ScanStorageCutover WHERE Id=1;
END;
GO
GRANT EXECUTE ON security.GetScanStorageState TO nso_runtime;
GO
