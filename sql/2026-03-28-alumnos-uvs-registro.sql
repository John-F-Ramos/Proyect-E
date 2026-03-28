-- Total de UV aprobadas según registro (columna uvs_tot del Excel de importación).
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Alumnos')
      AND name = N'UVsTotalesRegistro'
)
BEGIN
    ALTER TABLE dbo.Alumnos ADD UVsTotalesRegistro INT NULL;
END
GO
