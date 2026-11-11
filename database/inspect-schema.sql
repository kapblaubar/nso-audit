-- Read-only SSMS companion to data-dictionary.md.
-- Select the intended database in SSMS before running. No customer rows, secrets,
-- session-context changes, schema changes, or writes are performed.
-- Metadata visibility depends on your existing SQL permissions.
SET NOCOUNT ON;

SELECT DB_NAME() AS ConnectedDatabase, SYSUTCDATETIME() AS InspectedAtUtc;

-- 1. Tables, existing SSMS descriptions, approximate stored-row counts and RLS coverage.
-- Counts are storage metadata, NOT a tenant-filtered audit result or collection success.
SELECT s.name AS SchemaName, t.name AS TableName,
  CONVERT(nvarchar(4000),ep.value) AS TableDescription,
  COALESCE(p.ApproximateRows,0) AS ApproximateStoredRows,
  (SELECT COUNT(*) FROM sys.security_predicates sp WHERE sp.target_object_id=t.object_id) AS SecurityPredicateCount
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
LEFT JOIN sys.extended_properties ep ON ep.class=1 AND ep.major_id=t.object_id
  AND ep.minor_id=0 AND ep.name=N'MS_Description'
OUTER APPLY (SELECT SUM(p.rows) AS ApproximateRows FROM sys.partitions p
  WHERE p.object_id=t.object_id AND p.index_id IN (0,1)) p
WHERE t.is_ms_shipped=0
ORDER BY s.name,t.name;

-- 2. Actual current columns (including alterations after CREATE TABLE).
SELECT s.name AS SchemaName,t.name AS TableName,c.column_id AS Position,c.name AS ColumnName,
  ty.name AS DataType,c.max_length AS MaxLengthBytes,c.precision AS NumericPrecision,c.scale AS NumericScale,
  c.is_nullable AS IsNullable,c.is_identity AS IsIdentity,c.is_computed AS IsComputed,
  dc.definition AS DefaultExpression,cc.definition AS ComputedExpression,
  CONVERT(nvarchar(4000),ep.value) AS ColumnDescription
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
LEFT JOIN sys.extended_properties ep ON ep.class=1 AND ep.major_id=t.object_id
  AND ep.minor_id=c.column_id AND ep.name=N'MS_Description'
WHERE t.is_ms_shipped=0
ORDER BY s.name,t.name,c.column_id;

-- 3. Primary/unique keys and other indexes; one row per index column.
SELECT s.name AS SchemaName,t.name AS TableName,i.name AS IndexName,
  i.is_primary_key AS IsPrimaryKey,i.is_unique AS IsUnique,i.type_desc AS IndexType,
  c.name AS ColumnName,ic.key_ordinal AS KeyOrdinal,ic.is_included_column AS IsIncludedColumn,
  i.filter_definition AS FilterExpression,i.is_disabled AS IsDisabled
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.indexes i ON i.object_id=t.object_id
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.is_ms_shipped=0 AND i.index_id>0
ORDER BY s.name,t.name,i.name,ic.index_column_id;

-- 4. Foreign-key joins: retain all component columns when joining tenant data.
SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id) AS ChildSchema,
  OBJECT_NAME(fk.parent_object_id) AS ChildTable,fk.name AS ForeignKeyName,
  fkc.constraint_column_id AS JoinPosition,COL_NAME(fkc.parent_object_id,fkc.parent_column_id) AS ChildColumn,
  OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS ParentSchema,OBJECT_NAME(fk.referenced_object_id) AS ParentTable,
  COL_NAME(fkc.referenced_object_id,fkc.referenced_column_id) AS ParentColumn,
  fk.delete_referential_action_desc AS OnDelete,fk.is_disabled AS IsDisabled,fk.is_not_trusted AS IsNotTrusted
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
ORDER BY ChildSchema,ChildTable,fk.name,fkc.constraint_column_id;

-- 5. Domain constraints and isolation rules.
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS SchemaName,OBJECT_NAME(parent_object_id) AS TableName,
  name AS ConstraintName,definition,is_disabled,is_not_trusted
FROM sys.check_constraints ORDER BY SchemaName,TableName,ConstraintName;
SELECT OBJECT_SCHEMA_NAME(sp.target_object_id) AS SchemaName,OBJECT_NAME(sp.target_object_id) AS TableName,
  p.name AS PolicyName,p.is_enabled AS IsEnabled,sp.predicate_type_desc,sp.operation_desc,sp.predicate_definition
FROM sys.security_predicates sp JOIN sys.security_policies p ON p.object_id=sp.object_id
ORDER BY SchemaName,TableName,PolicyName;

-- 6. SQL object references. This does not detect TypeScript/dynamic SQL or classify reads/writes.
SELECT OBJECT_SCHEMA_NAME(d.referenced_id) AS ReferencedSchema,OBJECT_NAME(d.referenced_id) AS ReferencedTable,
  OBJECT_SCHEMA_NAME(d.referencing_id) AS ReferencingSchema,OBJECT_NAME(d.referencing_id) AS ReferencingObject,
  o.type_desc AS ReferencingObjectType
FROM sys.sql_expression_dependencies d JOIN sys.objects o ON o.object_id=d.referencing_id
WHERE d.referenced_id IN (SELECT object_id FROM sys.tables WHERE is_ms_shipped=0)
GROUP BY d.referenced_id,d.referencing_id,o.type_desc
ORDER BY ReferencedSchema,ReferencedTable,ReferencingSchema,ReferencingObject;
