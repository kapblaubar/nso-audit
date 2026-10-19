-- Ownership nominations do not grant access. Completion requires a verified client account.
CREATE TABLE security.WorkspaceOwnershipRequests (
  OrganizationId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES app.Organizations(OrganizationId),
  PreviousClientEmail nvarchar(254) NOT NULL,
  TargetClientEmail nvarchar(254) NOT NULL,
  RequestedByTenantId uniqueidentifier NOT NULL,
  RequestedByObjectId uniqueidentifier NOT NULL,
  RequestedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CompletedAt datetime2 NULL,
  CompletedUserId uniqueidentifier NULL REFERENCES identitydata.Users(UserId),
  CONSTRAINT CK_OwnershipCompletion CHECK (
    (CompletedAt IS NULL AND CompletedUserId IS NULL) OR
    (CompletedAt IS NOT NULL AND CompletedUserId IS NOT NULL))
);
GO
-- No runtime table grants: client onboarding must validate identity and explicitly consume
-- this request through an authorized workflow before granting workspace membership.
