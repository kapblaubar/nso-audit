-- Additive questionnaire storage. Existing app.Answers and scan history are preserved.
CREATE SCHEMA questionnaire;
GO
CREATE TABLE questionnaire.Questions (
  QuestionId varchar(100) NOT NULL,
  Version int NOT NULL CHECK (Version>0),
  TemplateVersion varchar(64) NOT NULL,
  Position int NOT NULL,
  Prompt nvarchar(1000) NOT NULL,
  HelpText nvarchar(2000) NOT NULL DEFAULT N'',
  AnswerType varchar(16) NOT NULL CHECK (AnswerType IN ('yn','status','coverage','select','multi','date','text','number')),
  CONSTRAINT PK_QuestionnaireQuestions PRIMARY KEY (QuestionId,Version),
  CONSTRAINT UQ_QuestionnaireQuestionType UNIQUE (QuestionId,Version,AnswerType)
);
CREATE TABLE questionnaire.QuestionOptions (
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  OptionId varchar(64) NOT NULL,
  Label nvarchar(200) NOT NULL,
  Position int NOT NULL,
  CONSTRAINT PK_QuestionnaireOptions PRIMARY KEY (QuestionId,QuestionVersion,OptionId),
  CONSTRAINT FK_QuestionnaireOptions_Question FOREIGN KEY (QuestionId,QuestionVersion)
    REFERENCES questionnaire.Questions(QuestionId,Version)
);
CREATE TABLE app.QuestionnaireScopes (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  ScopeName nvarchar(200) NOT NULL,
  AssetClass varchar(16) NOT NULL CHECK (AssetClass IN ('END','SRV','DB','SaaS','CLD','NET')),
  TenantId uniqueidentifier NULL, -- Scope metadata, never an authorization boundary.
  Revision int NOT NULL DEFAULT 0 CHECK (Revision>=0),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_QuestionnaireScopes PRIMARY KEY (OrganizationId,AssessmentId),
  CONSTRAINT FK_QuestionnaireScopes_Assessment FOREIGN KEY (OrganizationId,AssessmentId)
    REFERENCES app.Assessments(OrganizationId,AssessmentId)
);
CREATE TABLE app.QuestionnaireAnswers (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  AnswerType varchar(16) NOT NULL,
  AnswerState varchar(16) NOT NULL CHECK (AnswerState IN ('answered','unknown','notApplicable','never')),
  Justification nvarchar(2000) NULL,
  BooleanValue bit NULL,
  TextValue nvarchar(4000) NULL,
  NumberValue decimal(18,4) NULL,
  Unit nvarchar(32) NULL,
  DateValue date NULL,
  SelectedOptionId varchar(64) NULL,
  TotalInScope int NULL,
  TotalCovered int NULL,
  EstimatedPercentage decimal(7,4) NULL,
  MeasurementDate date NULL,
  MeasurementSource nvarchar(500) NULL,
  EvidenceReference nvarchar(2000) NULL,
  UpdatedBy uniqueidentifier NULL REFERENCES identitydata.Users(UserId),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_QuestionnaireAnswers PRIMARY KEY (OrganizationId,AssessmentId,QuestionId),
  CONSTRAINT FK_QuestionnaireAnswers_Scope FOREIGN KEY (OrganizationId,AssessmentId)
    REFERENCES app.QuestionnaireScopes(OrganizationId,AssessmentId),
  CONSTRAINT FK_QuestionnaireAnswers_Type FOREIGN KEY (QuestionId,QuestionVersion,AnswerType)
    REFERENCES questionnaire.Questions(QuestionId,Version,AnswerType),
  CONSTRAINT FK_QuestionnaireAnswers_Option FOREIGN KEY (QuestionId,QuestionVersion,SelectedOptionId)
    REFERENCES questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId),
  CONSTRAINT UQ_QuestionnaireAnswers_Version UNIQUE (OrganizationId,AssessmentId,QuestionId,QuestionVersion),
  CONSTRAINT CK_QuestionnaireAnswers_State CHECK (
    (AnswerState<>'notApplicable' OR (Justification IS NOT NULL AND LEN(LTRIM(RTRIM(Justification)))>0))
    AND (AnswerState<>'never' OR AnswerType='date')),
  -- CHECK explicitly excludes NULL where a value is required (SQL UNKNOWN would otherwise pass).
  CONSTRAINT CK_QuestionnaireAnswers_Types CHECK (
    (BooleanValue IS NULL OR (AnswerState='answered' AND AnswerType='yn')) AND
    (TextValue IS NULL OR (AnswerState='answered' AND AnswerType='text')) AND
    (NumberValue IS NULL OR (AnswerState='answered' AND AnswerType='number')) AND
    (Unit IS NULL OR (AnswerState='answered' AND AnswerType='number')) AND
    (DateValue IS NULL OR (AnswerState='answered' AND AnswerType='date')) AND
    (SelectedOptionId IS NULL OR (AnswerState='answered' AND AnswerType IN ('select','status'))) AND
    (TotalInScope IS NULL OR (AnswerState='answered' AND AnswerType='coverage')) AND
    (TotalCovered IS NULL OR (AnswerState='answered' AND AnswerType='coverage')) AND
    (EstimatedPercentage IS NULL OR (AnswerState='answered' AND AnswerType='coverage')) AND
    (MeasurementDate IS NULL OR (AnswerState='answered' AND AnswerType='coverage')) AND
    (MeasurementSource IS NULL OR (AnswerState='answered' AND AnswerType='coverage')) AND
    (AnswerState<>'answered' OR
      (AnswerType='yn' AND BooleanValue IS NOT NULL) OR
      (AnswerType='text' AND TextValue IS NOT NULL AND LEN(LTRIM(RTRIM(TextValue)))>0) OR
      (AnswerType='number' AND NumberValue IS NOT NULL AND Unit IS NOT NULL AND LEN(LTRIM(RTRIM(Unit)))>0) OR
      (AnswerType='date' AND DateValue IS NOT NULL) OR
      (AnswerType IN ('select','status') AND SelectedOptionId IS NOT NULL) OR
      AnswerType='multi' OR
      (AnswerType='coverage' AND MeasurementDate IS NOT NULL AND MeasurementSource IS NOT NULL
        AND LEN(LTRIM(RTRIM(MeasurementSource)))>0 AND (
          (TotalInScope IS NOT NULL AND TotalCovered IS NOT NULL AND TotalInScope>0
            AND TotalCovered>=0 AND TotalCovered<=TotalInScope AND EstimatedPercentage IS NULL) OR
          (TotalInScope IS NULL AND TotalCovered IS NULL AND EstimatedPercentage IS NOT NULL
            AND EstimatedPercentage>=0 AND EstimatedPercentage<=100)))) )
);
CREATE TABLE app.QuestionnaireAnswerSelections (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  OptionId varchar(64) NOT NULL,
  CONSTRAINT PK_QuestionnaireSelections PRIMARY KEY (OrganizationId,AssessmentId,QuestionId,OptionId),
  CONSTRAINT FK_QuestionnaireSelections_Answer FOREIGN KEY (OrganizationId,AssessmentId,QuestionId,QuestionVersion)
    REFERENCES app.QuestionnaireAnswers(OrganizationId,AssessmentId,QuestionId,QuestionVersion),
  CONSTRAINT FK_QuestionnaireSelections_Option FOREIGN KEY (QuestionId,QuestionVersion,OptionId)
    REFERENCES questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId)
);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireScopes,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireScopes AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireScopes AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswers,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswers AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswers AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswerSelections,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswerSelections AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.QuestionnaireAnswerSelections AFTER UPDATE;
GO
GRANT SELECT ON SCHEMA::questionnaire TO nso_runtime;
DENY INSERT,UPDATE,DELETE ON SCHEMA::questionnaire TO nso_runtime;
GO
CREATE TRIGGER app.ValidateQuestionnaireSelections ON app.QuestionnaireAnswerSelections
AFTER INSERT,UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS(SELECT 1 FROM inserted i JOIN app.QuestionnaireAnswers a
    ON a.OrganizationId=i.OrganizationId AND a.AssessmentId=i.AssessmentId AND a.QuestionId=i.QuestionId
    WHERE a.AnswerType<>'multi' OR a.AnswerState<>'answered')
    THROW 51002,'Selections require an answered multiple-choice question.',1;
  IF EXISTS(SELECT 1 FROM inserted i JOIN app.QuestionnaireAnswerSelections n
    ON n.OrganizationId=i.OrganizationId AND n.AssessmentId=i.AssessmentId AND n.QuestionId=i.QuestionId AND n.OptionId='none'
    JOIN app.QuestionnaireAnswerSelections s
    ON s.OrganizationId=i.OrganizationId AND s.AssessmentId=i.AssessmentId AND s.QuestionId=i.QuestionId AND s.OptionId<>'none')
    THROW 51002,'None cannot be combined with other selections.',1;
END;
GO
-- Live email membership, including organizations with no Microsoft connection.
CREATE PROCEDURE security.AuthResolveQuestionnaire @TokenHash char(64),@OrganizationId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=@OrganizationId;
    SELECT u.UserId,m.Role FROM identitydata.Sessions s
      JOIN identitydata.Users u ON u.UserId=s.UserId
      JOIN security.Memberships m ON m.UserId=u.UserId AND m.OrganizationId=@OrganizationId
      JOIN app.Organizations o ON o.OrganizationId=m.OrganizationId AND o.Status='active'
      WHERE s.TokenHash=@TokenHash AND s.RevokedAt IS NULL AND s.ExpiresAt>SYSUTCDATETIME()
        AND u.DisabledAt IS NULL AND u.EmailVerifiedAt IS NOT NULL;
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key=N'organizationId',@value=NULL;
    THROW;
  END CATCH;
END;
GO
GRANT EXECUTE ON security.AuthResolveQuestionnaire TO nso_runtime;
GO
-- Immutable initial backup template. Add later versions in new migrations; never edit applied migrations.
INSERT questionnaire.Questions(QuestionId,Version,TemplateVersion,Position,Prompt,AnswerType,HelpText) VALUES
('BKP-01',1,'backups-v1',1,N'Do you have a defined backup strategy?','yn',N'Answer for the asset class and environment named in this assessment.'),
('BKP-02',1,'backups-v1',2,N'What proportion is covered by that strategy?','coverage',N'Use counts or an explicitly estimated percentage. Zero assets requires applicability review.'),
('BKP-03',1,'backups-v1',3,N'What proportion currently has successful backups within its required schedule?','coverage',N'Strategy coverage and successful backup coverage may differ.'),
('BKP-04',1,'backups-v1',4,N'How frequently are backups taken?','select',N'For Other, describe the actual interval in the explanation.'),
('BKP-05',1,'backups-v1',5,N'What backup product/service and method are used?','text',N'Distinguish backup from replication, synchronization and retention features.'),
('BKP-06',1,'backups-v1',6,N'What data/system components are included or excluded?','text',N'Explain exclusions and their reasons.'),
('BKP-07',1,'backups-v1',7,N'How long are backups retained?','number',N'Enter a number and unit (days, months or years). Describe additional retention tiers in the explanation.'),
('BKP-08',1,'backups-v1',8,N'What maximum data loss is acceptable to the business (RPO)?','number',N'Enter minutes, hours or days. Identify the approving owner in the explanation.'),
('BKP-09',1,'backups-v1',9,N'What maximum recovery time is acceptable (RTO)?','number',N'Enter minutes, hours or days. Identify the approving owner in the explanation.'),
('BKP-10',1,'backups-v1',10,N'Are backup copies separated from production failure risks?','status',N'Describe location and shared dependencies.'),
('BKP-11',1,'backups-v1',11,N'Are copies protected from alteration or deletion by compromised production administrators?','status',N'Describe the mechanism, protection duration and exceptions.'),
('BKP-12',1,'backups-v1',12,N'Are backup administration privileges restricted and protected with MFA where supported?','status',N'Describe privileged identities and exceptions without credential values.'),
('BKP-13',1,'backups-v1',13,N'Are backups encrypted in transit?','status',N'Describe protection and exceptions.'),
('BKP-13-REST',1,'backups-v1',14,N'Are backups encrypted at rest?','status',N'Describe protection and exceptions.'),
('BKP-13-KEY',1,'backups-v1',15,N'Is encryption key recovery documented?','status',N'Describe custody and recovery without providing keys.'),
('BKP-14',1,'backups-v1',16,N'Are failures monitored, assigned and followed through to resolution?','status',N'Identify owner and alert/review frequency.'),
('BKP-15',1,'backups-v1',17,N'When did you last successfully restore from backup?','date',N'Describe systems/data restored and outcome. A backup job alone does not prove restoration.'),
('BKP-16',1,'backups-v1',18,N'What proportion has a successful restore test within your required testing interval?','coverage',N'Include the required interval and tested scope in the explanation.'),
('BKP-17',1,'backups-v1',19,N'Did tested restoration meet the approved recovery point objective?','status',N'Include the measured result; use Unknown if no target or test exists.'),
('BKP-17-TIME',1,'backups-v1',20,N'Did tested restoration meet the approved recovery time objective?','status',N'Include the measured result; use Unknown if no target or test exists.'),
('BKP-18',1,'backups-v1',21,N'How often do you perform restore tests?','select',N'Describe the actual interval if Other.'),
('BKP-19',1,'backups-v1',22,N'Is a recovery procedure documented and accessible during an outage?','status',N'Identify owner and last review date.'),
('BKP-20',1,'backups-v1',23,N'What gaps, exceptions or planned improvements remain, and who owns them?','text',N'Include owners and target dates; enter None if no known gaps.'),
('BKP-DB-01',1,'backups-db-v1',24,N'What proportion of required databases supports point-in-time restoration?','coverage',N'Describe the recovery window and limitations.'),
('BKP-DB-02',1,'backups-db-v1',25,N'Are backups application-consistent and validated using a database recovery test?','status',N'Include last test date and outcome.');
INSERT questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId,Label,Position)
SELECT QuestionId,Version,o.Id,o.Label,o.Position FROM questionnaire.Questions
CROSS JOIN (VALUES ('inPlace',N'In place',1),('partly',N'Partly in place',2),('notInPlace',N'Not in place',3)) o(Id,Label,Position)
WHERE AnswerType='status';
INSERT questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId,Label,Position) VALUES
('BKP-04',1,'continuous',N'Continuous',1),('BKP-04',1,'hourly',N'Hourly',2),
('BKP-04',1,'daily',N'Daily',3),('BKP-04',1,'weekly',N'Weekly',4),
('BKP-04',1,'monthly',N'Monthly',5),('BKP-04',1,'other',N'Other',6),
('BKP-18',1,'monthly',N'Monthly',1),('BKP-18',1,'quarterly',N'Quarterly',2),
('BKP-18',1,'twiceYearly',N'Twice yearly',3),('BKP-18',1,'annually',N'Annually',4),
('BKP-18',1,'afterChanges',N'After major changes',5),('BKP-18',1,'never',N'Never',6),('BKP-18',1,'other',N'Other',7);
GO

-- Preserve questionnaire answers when the existing Dev-only test-account cleanup removes a login.
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
      UPDATE app.QuestionnaireAnswers SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;
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
