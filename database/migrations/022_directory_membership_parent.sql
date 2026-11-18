-- Align membership evidence with its Entra group snapshot.
ALTER TABLE app.AuditDirectoryGroupMembers DROP CONSTRAINT FK_AuditDirectoryGroupMembers_Parent;
ALTER TABLE app.AuditDirectoryGroupMembers WITH CHECK ADD CONSTRAINT FK_AuditDirectoryGroupMembers_Parent
  FOREIGN KEY (OrganizationId,TenantId,ScanId,ParentSourceId)
  REFERENCES app.AuditDirectoryGroups(OrganizationId,TenantId,ScanId,SourceId);
GO
