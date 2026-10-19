-- Forward migration. Run through scripts/database.mjs, never as runtime application identity.
CREATE SCHEMA security;
GO
CREATE SCHEMA identitydata;
GO
CREATE SCHEMA app;
GO

CREATE TABLE identitydata.Users (
  UserId uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
  Email nvarchar(254) NOT NULL,
  NormalizedEmail nvarchar(254) NOT NULL,
  DisplayName nvarchar(150) NOT NULL,
  PasswordHash nvarchar(512) NOT NULL,
  EmailVerifiedAt datetime2 NULL,
  DisabledAt datetime2 NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Users_Email UNIQUE (NormalizedEmail)
);

CREATE TABLE identitydata.RegistrationRequests (
  RequestId uniqueidentifier NOT NULL CONSTRAINT PK_RegistrationRequests PRIMARY KEY DEFAULT NEWID(),
  UserId uniqueidentifier NOT NULL REFERENCES identitydata.Users(UserId),
  CompanyName nvarchar(200) NOT NULL,
  ProfileJson nvarchar(max) NOT NULL DEFAULT N'{}' CHECK (ISJSON(ProfileJson) = 1),
  Status varchar(24) NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending','needsInformation','approved','rejected')),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ReviewedAt datetime2 NULL,
  ReviewedByTenantId uniqueidentifier NULL,
  ReviewedByObjectId uniqueidentifier NULL
);

CREATE TABLE identitydata.Sessions (
  TokenHash char(64) NOT NULL CONSTRAINT PK_Sessions PRIMARY KEY,
  UserId uniqueidentifier NOT NULL REFERENCES identitydata.Users(UserId),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ExpiresAt datetime2 NOT NULL,
  RevokedAt datetime2 NULL
);
CREATE INDEX IX_Sessions_User ON identitydata.Sessions(UserId);

CREATE TABLE identitydata.AccountTokens (
  TokenHash char(64) NOT NULL CONSTRAINT PK_AccountTokens PRIMARY KEY,
  UserId uniqueidentifier NOT NULL REFERENCES identitydata.Users(UserId),
  Purpose varchar(16) NOT NULL CHECK (Purpose IN ('verifyEmail','resetPassword')),
  ExpiresAt datetime2 NOT NULL,
  UsedAt datetime2 NULL
);

CREATE TABLE identitydata.ManagementUsers (
  EntraTenantId uniqueidentifier NOT NULL,
  EntraObjectId uniqueidentifier NOT NULL,
  Role varchar(24) NOT NULL CHECK (Role IN ('setupAdmin','platformAdmin')),
  DisabledAt datetime2 NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ManagementUsers PRIMARY KEY (EntraTenantId, EntraObjectId)
);

CREATE TABLE app.Organizations (
  OrganizationId uniqueidentifier NOT NULL CONSTRAINT PK_Organizations PRIMARY KEY DEFAULT NEWID(),
  DisplayName nvarchar(200) NOT NULL,
  Status varchar(16) NOT NULL DEFAULT 'active' CHECK (Status IN ('active','suspended')),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Memberships are a security catalog: only controlled procedures may mutate them.
CREATE TABLE security.Memberships (
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  UserId uniqueidentifier NOT NULL REFERENCES identitydata.Users(UserId),
  Role varchar(16) NOT NULL CHECK (Role IN ('owner','admin','contributor','viewer')),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Memberships PRIMARY KEY (OrganizationId, UserId)
);

CREATE TABLE app.Assessments (
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  AssessmentId uniqueidentifier NOT NULL DEFAULT NEWID(),
  TemplateVersion varchar(64) NOT NULL,
  Status varchar(16) NOT NULL DEFAULT 'draft' CHECK (Status IN ('draft','review','complete')),
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Assessments PRIMARY KEY (OrganizationId, AssessmentId)
);

CREATE TABLE app.Answers (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  AnswerJson nvarchar(max) NOT NULL CHECK (ISJSON(AnswerJson) = 1),
  UpdatedBy uniqueidentifier NOT NULL REFERENCES identitydata.Users(UserId),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Answers PRIMARY KEY (OrganizationId, AssessmentId, QuestionId),
  CONSTRAINT FK_Answers_Assessment FOREIGN KEY (OrganizationId, AssessmentId)
    REFERENCES app.Assessments(OrganizationId, AssessmentId)
);

CREATE TABLE app.AuditEvents (
  OrganizationId uniqueidentifier NOT NULL REFERENCES app.Organizations(OrganizationId),
  EventId uniqueidentifier NOT NULL DEFAULT NEWID(),
  ActorType varchar(16) NOT NULL,
  ActorId nvarchar(100) NOT NULL,
  Action varchar(100) NOT NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_AuditEvents PRIMARY KEY (OrganizationId, EventId)
);
GO

-- Both reads and writes fail closed if the trusted API has not supplied organization context.
CREATE FUNCTION security.OrganizationPredicate(@OrganizationId uniqueidentifier)
RETURNS TABLE WITH SCHEMABINDING AS
RETURN SELECT 1 AS Allowed WHERE @OrganizationId = TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'organizationId'));
GO
CREATE SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Organizations,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Organizations AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Organizations AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Assessments,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Assessments AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Assessments AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Answers,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Answers AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.Answers AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEvents,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEvents AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.AuditEvents AFTER UPDATE
WITH (STATE = ON);
GO

CREATE ROLE nso_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::app TO nso_runtime;
-- Audit events are append-only to the runtime identity.
DENY UPDATE, DELETE ON app.AuditEvents TO nso_runtime;
-- Auth access will be granted through narrow procedures in a later migration, not schema-wide.
GRANT SELECT ON security.Memberships TO nso_runtime;
GO
