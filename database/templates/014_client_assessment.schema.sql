-- Additive full-client questionnaire. Existing backup assessments and answers remain unchanged.
-- Catalog definitions are immutable; subsequent changes use a new template and migration.
DECLARE @constraint sysname;
SELECT @constraint=name FROM sys.check_constraints
WHERE parent_object_id=OBJECT_ID('questionnaire.Questions') AND definition LIKE '%AnswerType%';
IF @constraint IS NULL THROW 51000,'Question answer-type constraint not found.',1;
DECLARE @dropConstraint nvarchar(500)='ALTER TABLE questionnaire.Questions DROP CONSTRAINT '+QUOTENAME(@constraint);
EXEC sys.sp_executesql @dropConstraint;
ALTER TABLE questionnaire.Questions ADD CONSTRAINT CK_ClientQuestionTypes CHECK
  (AnswerType IN ('yn','status','coverage','select','multi','date','text','number','records'));

CREATE TABLE questionnaire.ClientSections (
  TemplateVersion varchar(64) NOT NULL,
  SectionId varchar(32) NOT NULL,
  Position int NOT NULL,
  Title nvarchar(200) NOT NULL,
  Repeatable bit NOT NULL,
  DefinitionJson nvarchar(max) NOT NULL CHECK (ISJSON(DefinitionJson)=1),
  CONSTRAINT PK_ClientSections PRIMARY KEY (TemplateVersion,SectionId)
);
CREATE TABLE questionnaire.ClientQuestionDefinitions (
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  TemplateVersion varchar(64) NOT NULL,
  SectionId varchar(32) NOT NULL,
  SourceQuestionId varchar(100) NOT NULL,
  DefinitionJson nvarchar(max) NOT NULL CHECK (ISJSON(DefinitionJson)=1),
  CONSTRAINT PK_ClientQuestionDefinitions PRIMARY KEY (QuestionId,QuestionVersion),
  CONSTRAINT FK_ClientQuestionDefinitions_Question FOREIGN KEY (QuestionId,QuestionVersion) REFERENCES questionnaire.Questions(QuestionId,Version),
  CONSTRAINT FK_ClientQuestionDefinitions_Section FOREIGN KEY (TemplateVersion,SectionId) REFERENCES questionnaire.ClientSections(TemplateVersion,SectionId)
);
CREATE TABLE app.ClientAssessmentDetails (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  Name nvarchar(200) NOT NULL,
  AnswerOwner nvarchar(200) NULL,
  Reviewer nvarchar(200) NULL,
  Revision int NOT NULL DEFAULT 0 CHECK (Revision>=0),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ClientAssessmentDetails PRIMARY KEY (OrganizationId,AssessmentId),
  CONSTRAINT FK_ClientAssessmentDetails_Assessment FOREIGN KEY (OrganizationId,AssessmentId) REFERENCES app.Assessments(OrganizationId,AssessmentId)
);
CREATE TABLE app.ClientAssessmentGroups (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  GroupId uniqueidentifier NOT NULL,
  TemplateVersion varchar(64) NOT NULL,
  SectionId varchar(32) NOT NULL,
  Name nvarchar(200) NOT NULL,
  ContextJson nvarchar(2000) NOT NULL DEFAULT N'{}' CHECK (ISJSON(ContextJson)=1),
  CONSTRAINT PK_ClientAssessmentGroups PRIMARY KEY (OrganizationId,AssessmentId,GroupId),
  CONSTRAINT FK_ClientAssessmentGroups_Assessment FOREIGN KEY (OrganizationId,AssessmentId) REFERENCES app.ClientAssessmentDetails(OrganizationId,AssessmentId),
  CONSTRAINT FK_ClientAssessmentGroups_Section FOREIGN KEY (TemplateVersion,SectionId) REFERENCES questionnaire.ClientSections(TemplateVersion,SectionId)
);
CREATE UNIQUE INDEX UX_ClientAssessmentSingletonGroups ON app.ClientAssessmentGroups(OrganizationId,AssessmentId,SectionId)
  WHERE SectionId IN ('company','network','data','response','governance','profiles');
CREATE TABLE app.ClientAssessmentAnswers (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  GroupId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  AnswerType varchar(16) NOT NULL,
  AnswerState varchar(16) NOT NULL CHECK (AnswerState IN ('answered','unknown','notApplicable','never')),
  Justification nvarchar(2000) NULL,
  EvidenceReference nvarchar(2000) NULL,
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
  RecordsJson nvarchar(max) NULL CHECK (RecordsJson IS NULL OR (ISJSON(RecordsJson)=1 AND LEFT(LTRIM(RecordsJson),1)='[')),
  UpdatedBy uniqueidentifier NULL REFERENCES identitydata.Users(UserId),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ClientAssessmentAnswers PRIMARY KEY (OrganizationId,AssessmentId,GroupId,QuestionId),
  CONSTRAINT UQ_ClientAssessmentAnswerVersion UNIQUE (OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion),
  CONSTRAINT FK_ClientAssessmentAnswers_Group FOREIGN KEY (OrganizationId,AssessmentId,GroupId) REFERENCES app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId),
  CONSTRAINT FK_ClientAssessmentAnswers_Type FOREIGN KEY (QuestionId,QuestionVersion,AnswerType) REFERENCES questionnaire.Questions(QuestionId,Version,AnswerType),
  CONSTRAINT FK_ClientAssessmentAnswers_Definition FOREIGN KEY (QuestionId,QuestionVersion) REFERENCES questionnaire.ClientQuestionDefinitions(QuestionId,QuestionVersion),
  CONSTRAINT FK_ClientAssessmentAnswers_Option FOREIGN KEY (QuestionId,QuestionVersion,SelectedOptionId) REFERENCES questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId),
  CONSTRAINT CK_ClientAssessmentAnswerState CHECK
    ((AnswerState<>'notApplicable' OR (Justification IS NOT NULL AND LEN(LTRIM(RTRIM(Justification)))>0)) AND
     (AnswerState<>'never' OR AnswerType='date')),
  CONSTRAINT CK_ClientAssessmentAnswerTypes CHECK (
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
    (RecordsJson IS NULL OR (AnswerState='answered' AND AnswerType='records')) AND
    (AnswerState<>'answered' OR
      (AnswerType='yn' AND BooleanValue IS NOT NULL) OR
      (AnswerType='text' AND TextValue IS NOT NULL AND LEN(LTRIM(RTRIM(TextValue)))>0) OR
      (AnswerType='number' AND NumberValue IS NOT NULL AND NumberValue>=0 AND Unit IS NOT NULL AND LEN(LTRIM(RTRIM(Unit)))>0) OR
      (AnswerType='date' AND DateValue IS NOT NULL) OR
      (AnswerType IN ('select','status') AND SelectedOptionId IS NOT NULL) OR
      AnswerType='multi' OR
      (AnswerType='records' AND RecordsJson IS NOT NULL AND LEN(RecordsJson)>2) OR
      (AnswerType='coverage' AND MeasurementDate IS NOT NULL AND MeasurementSource IS NOT NULL
        AND LEN(LTRIM(RTRIM(MeasurementSource)))>0 AND (
          (TotalInScope IS NOT NULL AND TotalCovered IS NOT NULL AND TotalInScope>0 AND TotalCovered>=0 AND TotalCovered<=TotalInScope AND EstimatedPercentage IS NULL) OR
          (TotalInScope IS NULL AND TotalCovered IS NULL AND EstimatedPercentage IS NOT NULL AND EstimatedPercentage>=0 AND EstimatedPercentage<=100)))) )
);
CREATE TABLE app.ClientAssessmentSelections (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  GroupId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  OptionId varchar(64) NOT NULL,
  CONSTRAINT PK_ClientAssessmentSelections PRIMARY KEY (OrganizationId,AssessmentId,GroupId,QuestionId,OptionId),
  CONSTRAINT FK_ClientAssessmentSelections_Answer FOREIGN KEY (OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion) REFERENCES app.ClientAssessmentAnswers(OrganizationId,AssessmentId,GroupId,QuestionId,QuestionVersion),
  CONSTRAINT FK_ClientAssessmentSelections_Option FOREIGN KEY (QuestionId,QuestionVersion,OptionId) REFERENCES questionnaire.QuestionOptions(QuestionId,QuestionVersion,OptionId)
);
CREATE TABLE app.ClientAssessmentReviews (
  OrganizationId uniqueidentifier NOT NULL,
  AssessmentId uniqueidentifier NOT NULL,
  GroupId uniqueidentifier NOT NULL,
  QuestionId varchar(100) NOT NULL,
  QuestionVersion int NOT NULL,
  Conclusion varchar(24) NOT NULL CHECK (Conclusion IN ('inPlace','partly','gap','unknown','notApplicable')),
  EvidenceState varchar(24) NOT NULL CHECK (EvidenceState IN ('declared','observed','checked','missing','conflicting')),
  CollectionState varchar(24) NOT NULL CHECK (CollectionState IN ('complete','partial','failed','notConnected','unsupported','notRequested')),
  Notes nvarchar(2000) NOT NULL,
  ActionOwner nvarchar(200) NULL,
  TargetDate date NULL,
  UpdatedBy uniqueidentifier NULL REFERENCES identitydata.Users(UserId),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ClientAssessmentReviews PRIMARY KEY (OrganizationId,AssessmentId,GroupId,QuestionId),
  CONSTRAINT FK_ClientAssessmentReviews_Group FOREIGN KEY (OrganizationId,AssessmentId,GroupId) REFERENCES app.ClientAssessmentGroups(OrganizationId,AssessmentId,GroupId),
  CONSTRAINT FK_ClientAssessmentReviews_Question FOREIGN KEY (QuestionId,QuestionVersion) REFERENCES questionnaire.ClientQuestionDefinitions(QuestionId,QuestionVersion)
);
GO
ALTER SECURITY POLICY security.OrganizationIsolation
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentDetails,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentDetails AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentDetails AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentGroups,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentGroups AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentGroups AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentAnswers,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentAnswers AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentAnswers AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentSelections,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentSelections AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentSelections AFTER UPDATE,
ADD FILTER PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentReviews,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentReviews AFTER INSERT,
ADD BLOCK PREDICATE security.OrganizationPredicate(OrganizationId) ON app.ClientAssessmentReviews AFTER UPDATE;
GO
CREATE TRIGGER app.ValidateClientSelections ON app.ClientAssessmentSelections AFTER INSERT,UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS(SELECT 1 FROM inserted i JOIN app.ClientAssessmentAnswers a ON a.OrganizationId=i.OrganizationId AND a.AssessmentId=i.AssessmentId AND a.GroupId=i.GroupId AND a.QuestionId=i.QuestionId WHERE a.AnswerType<>'multi' OR a.AnswerState<>'answered')
    THROW 51002,'Selections require an answered multiple-choice question.',1;
  IF EXISTS(SELECT 1 FROM inserted i JOIN app.ClientAssessmentSelections n ON n.OrganizationId=i.OrganizationId AND n.AssessmentId=i.AssessmentId AND n.GroupId=i.GroupId AND n.QuestionId=i.QuestionId AND n.OptionId='none'
    JOIN app.ClientAssessmentSelections s ON s.OrganizationId=i.OrganizationId AND s.AssessmentId=i.AssessmentId AND s.GroupId=i.GroupId AND s.QuestionId=i.QuestionId AND s.OptionId<>'none')
    THROW 51002,'None cannot be combined with other selections.',1;
END;
GO
-- Preserve declarations/reviews during the existing explicitly confirmed Dev login cleanup.
-- The procedure already visits every private-directory organization with scoped RLS context.
DECLARE @procedure nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID('security.ManagementDeleteAccount'));
IF @procedure IS NULL OR @procedure NOT LIKE '%UPDATE app.QuestionnaireAnswers SET UpdatedBy=NULL%'
  THROW 51000,'Expected migration-013 account cleanup procedure not found.',1;
SET @procedure=REPLACE(@procedure,'CREATE PROCEDURE','ALTER PROCEDURE');
IF @procedure NOT LIKE '%UPDATE app.ClientAssessmentAnswers SET UpdatedBy=NULL%'
SET @procedure=REPLACE(@procedure,
  'UPDATE app.QuestionnaireAnswers SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;',
  'UPDATE app.QuestionnaireAnswers SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;
   UPDATE app.ClientAssessmentAnswers SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;
   UPDATE app.ClientAssessmentReviews SET UpdatedBy=NULL WHERE OrganizationId=@org AND UpdatedBy=@UserId;');
EXEC sys.sp_executesql @procedure;
