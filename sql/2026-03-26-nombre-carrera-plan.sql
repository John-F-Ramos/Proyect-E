/*
    Migracion robusta para NombreCarreraPlan:
    - Detecta automaticamente el esquema de PlanesEstudio/Carreras
    - Falla con mensaje claro si no encuentra las tablas
*/

DECLARE @schemaPlanes sysname;
DECLARE @schemaCarreras sysname;
DECLARE @sql nvarchar(max);

SELECT TOP (1) @schemaPlanes = s.name
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name = 'PlanesEstudio'
ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name;

SELECT TOP (1) @schemaCarreras = s.name
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name = 'Carreras'
ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name;

IF @schemaPlanes IS NULL OR @schemaCarreras IS NULL
BEGIN
    THROW 50001, 'No se encontraron las tablas PlanesEstudio/Carreras en la BD actual. Verifica que estas usando USE AppEquivalenciasDB.', 1;
END;

IF COL_LENGTH(QUOTENAME(@schemaPlanes) + '.PlanesEstudio', 'NombreCarreraPlan') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + QUOTENAME(@schemaPlanes) + N'.PlanesEstudio ADD NombreCarreraPlan VARCHAR(150) NULL;';
    EXEC sp_executesql @sql;
END;

SET @sql = N'
UPDATE p
SET p.NombreCarreraPlan = c.NombreCarrera
FROM ' + QUOTENAME(@schemaPlanes) + N'.PlanesEstudio p
INNER JOIN ' + QUOTENAME(@schemaCarreras) + N'.Carreras c ON c.CodigoCarrera = p.CodigoCarrera
WHERE p.NombreCarreraPlan IS NULL OR LTRIM(RTRIM(p.NombreCarreraPlan)) = '''';
';
EXEC sp_executesql @sql;

SET @sql = N'
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(''' + QUOTENAME(@schemaPlanes) + N'.PlanesEstudio'')
      AND name = ''IX_PlanesEstudio_CodigoCarrera_AnioPlan''
)
BEGIN
    CREATE INDEX IX_PlanesEstudio_CodigoCarrera_AnioPlan
    ON ' + QUOTENAME(@schemaPlanes) + N'.PlanesEstudio (CodigoCarrera, AnioPlan);
END;
';
EXEC sp_executesql @sql;
