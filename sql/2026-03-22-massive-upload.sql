/*
    Migration: Massive upload foundation for Pensum and Reglas de Equivalencia
    Target DB: AppEquivalenciasDB (SQL Server)
    Safe to run multiple times (idempotent).
*/

-- 1) Audit table for upload batches
IF OBJECT_ID('dbo.CargaLote', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CargaLote (
        IdLote INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TipoCarga VARCHAR(50) NOT NULL,
        NombreArchivo VARCHAR(255) NOT NULL,
        Estado VARCHAR(30) NOT NULL,
        FilasLeidas INT NOT NULL DEFAULT (0),
        FilasInsertadas INT NULL,
        FilasRechazadas INT NULL,
        MensajeError VARCHAR(MAX) NULL,
        FechaInicio DATETIME NOT NULL DEFAULT (GETDATE()),
        FechaFin DATETIME NULL
    );
END;
GO

-- 2) Staging tables for bulk upload
IF OBJECT_ID('dbo.stg_Pensum', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.stg_Pensum (
        IdStgPensum INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IdLote INT NOT NULL,
        CodigoCarrera VARCHAR(20) NOT NULL,
        AnioPlan INT NOT NULL,
        CodigoClase VARCHAR(20) NOT NULL,
        NombreClase VARCHAR(150) NOT NULL,
        UV INT NOT NULL,
        FechaCarga DATETIME NOT NULL DEFAULT (GETDATE())
    );
END;
GO

IF OBJECT_ID('dbo.stg_ReglasEquivalencia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.stg_ReglasEquivalencia (
        IdStgRegla INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IdLote INT NOT NULL,
        TipoEquivalencia VARCHAR(20) NOT NULL,
        UniversidadOrigen VARCHAR(150) NULL,
        CodigoOrigen VARCHAR(50) NOT NULL,
        CodigoDestino VARCHAR(20) NOT NULL,
        Condicion VARCHAR(255) NULL,
        FechaCarga DATETIME NOT NULL DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.ReglasEquivalencia', 'Condicion') IS NULL
BEGIN
    ALTER TABLE dbo.ReglasEquivalencia
    ADD Condicion VARCHAR(255) NULL;
END;
GO

-- 3) Support indexes
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CargaLote')
      AND name = 'IX_CargaLote_Estado_FechaInicio'
)
BEGIN
    CREATE INDEX IX_CargaLote_Estado_FechaInicio
    ON dbo.CargaLote (Estado, FechaInicio DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.stg_Pensum')
      AND name = 'IX_stg_Pensum_IdLote'
)
BEGIN
    CREATE INDEX IX_stg_Pensum_IdLote
    ON dbo.stg_Pensum (IdLote);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.stg_ReglasEquivalencia')
      AND name = 'IX_stg_ReglasEquivalencia_IdLote'
)
BEGIN
    CREATE INDEX IX_stg_ReglasEquivalencia_IdLote
    ON dbo.stg_ReglasEquivalencia (IdLote);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.PlanesEstudio')
      AND name = 'IX_PlanesEstudio_Carrera_Anio'
)
BEGIN
    CREATE INDEX IX_PlanesEstudio_Carrera_Anio
    ON dbo.PlanesEstudio (CodigoCarrera, AnioPlan);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Pensum_Materias')
      AND name = 'IX_Pensum_Materias_CodigoMateria'
)
BEGIN
    CREATE INDEX IX_Pensum_Materias_CodigoMateria
    ON dbo.Pensum_Materias (CodigoMateria);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Regla_MateriaOrigen')
      AND name = 'IX_Regla_MateriaOrigen_IdRegla_Codigo'
)
BEGIN
    CREATE INDEX IX_Regla_MateriaOrigen_IdRegla_Codigo
    ON dbo.Regla_MateriaOrigen (IdRegla, CodigoCursada);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Regla_MateriaDestino')
      AND name = 'IX_Regla_MateriaDestino_IdRegla_Codigo'
)
BEGIN
    CREATE INDEX IX_Regla_MateriaDestino_IdRegla_Codigo
    ON dbo.Regla_MateriaDestino (IdRegla, CodigoOtorgada);
END;
GO

-- 4) Stored procedure: apply pensum upload (staging -> final)
CREATE OR ALTER PROCEDURE dbo.usp_AplicarCargaPensum
    @IdLote INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.stg_Pensum WHERE IdLote = @IdLote)
    BEGIN
        THROW 50001, 'El lote no tiene filas en stg_Pensum.', 1;
    END;

    -- Ensure careers exist (placeholder name when unknown).
    INSERT INTO dbo.Carreras (CodigoCarrera, NombreCarrera)
    SELECT DISTINCT s.CodigoCarrera, CONCAT('Carrera ', s.CodigoCarrera)
    FROM dbo.stg_Pensum s
    WHERE s.IdLote = @IdLote
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.Carreras c
            WHERE c.CodigoCarrera = s.CodigoCarrera
      );

    -- Ensure subjects exist; update names/UV when already present.
    MERGE dbo.Materias AS target
    USING (
        SELECT DISTINCT
            CodigoClase,
            NombreClase,
            UV
        FROM dbo.stg_Pensum
        WHERE IdLote = @IdLote
    ) AS source
    ON target.CodigoMateria = source.CodigoClase
    WHEN MATCHED THEN
        UPDATE SET
            target.NombreMateria = source.NombreClase,
            target.UVS = source.UV
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (CodigoMateria, NombreMateria, UVS)
        VALUES (source.CodigoClase, source.NombreClase, source.UV);

    ;WITH DistinctPlans AS (
        SELECT DISTINCT
            CodigoCarrera,
            AnioPlan,
            CONCAT('Plan ', CAST(AnioPlan AS VARCHAR(4))) AS NombrePlan
        FROM dbo.stg_Pensum
        WHERE IdLote = @IdLote
    )
    INSERT INTO dbo.PlanesEstudio (CodigoCarrera, AnioPlan, NombrePlan)
    SELECT dp.CodigoCarrera, dp.AnioPlan, dp.NombrePlan
    FROM DistinctPlans dp
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.PlanesEstudio p
        WHERE p.CodigoCarrera = dp.CodigoCarrera
          AND p.AnioPlan = dp.AnioPlan
          AND p.NombrePlan = dp.NombrePlan
    );

    ;WITH PlanMap AS (
        SELECT
            s.CodigoCarrera,
            s.AnioPlan,
            p.IdPlan
        FROM (
            SELECT DISTINCT CodigoCarrera, AnioPlan
            FROM dbo.stg_Pensum
            WHERE IdLote = @IdLote
        ) s
        JOIN dbo.PlanesEstudio p
          ON p.CodigoCarrera = s.CodigoCarrera
         AND p.AnioPlan = s.AnioPlan
         AND p.NombrePlan = CONCAT('Plan ', CAST(s.AnioPlan AS VARCHAR(4)))
    )
    INSERT INTO dbo.Pensum_Materias (IdPlan, CodigoMateria, Semestre)
    SELECT DISTINCT
        pm.IdPlan,
        s.CodigoClase,
        NULL
    FROM dbo.stg_Pensum s
    JOIN PlanMap pm
      ON pm.CodigoCarrera = s.CodigoCarrera
     AND pm.AnioPlan = s.AnioPlan
    WHERE s.IdLote = @IdLote
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.Pensum_Materias pmat
            WHERE pmat.IdPlan = pm.IdPlan
              AND pmat.CodigoMateria = s.CodigoClase
      );
END;
GO

-- 5) Stored procedure: apply equivalence rules upload
CREATE OR ALTER PROCEDURE dbo.usp_AplicarCargaReglasEquivalencia
    @IdLote INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.stg_ReglasEquivalencia WHERE IdLote = @IdLote)
    BEGIN
        THROW 50002, 'El lote no tiene filas en stg_ReglasEquivalencia.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.stg_ReglasEquivalencia s
        WHERE s.IdLote = @IdLote
          AND UPPER(ISNULL(s.TipoEquivalencia, '')) NOT IN ('INTERNA', 'EXTERNA')
    )
    BEGIN
        THROW 50003, 'Hay filas con TipoEquivalencia invalido.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.stg_ReglasEquivalencia s
        WHERE s.IdLote = @IdLote
          AND UPPER(s.TipoEquivalencia) = 'EXTERNA'
          AND ISNULL(LTRIM(RTRIM(s.UniversidadOrigen)), '') = ''
    )
    BEGIN
        THROW 50004, 'UniversidadOrigen es obligatoria para reglas EXTERNAS.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.stg_ReglasEquivalencia s
        WHERE s.IdLote = @IdLote
          AND NOT EXISTS (
                SELECT 1
                FROM dbo.Materias m
                WHERE m.CodigoMateria = s.CodigoDestino
          )
    )
    BEGIN
        THROW 50005, 'Hay CodigoDestino que no existe en Materias.', 1;
    END;

    -- Insert header rules when missing.
    INSERT INTO dbo.ReglasEquivalencia (Tipo, InstitucionOrigen, Condicion, Observaciones)
    SELECT DISTINCT
        UPPER(s.TipoEquivalencia) AS Tipo,
        NULLIF(LTRIM(RTRIM(s.UniversidadOrigen)), '') AS InstitucionOrigen,
        NULLIF(LTRIM(RTRIM(s.Condicion)), '') AS Condicion,
        'Carga masiva'
    FROM dbo.stg_ReglasEquivalencia s
    WHERE s.IdLote = @IdLote
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.ReglasEquivalencia r
            WHERE r.Tipo = UPPER(s.TipoEquivalencia)
              AND ISNULL(r.InstitucionOrigen, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.UniversidadOrigen)), ''), '')
              AND ISNULL(r.Condicion, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.Condicion)), ''), '')
      );

    ;WITH RuleMap AS (
        SELECT
            s.IdStgRegla,
            r.IdRegla,
            s.CodigoOrigen,
            s.CodigoDestino
        FROM dbo.stg_ReglasEquivalencia s
        JOIN dbo.ReglasEquivalencia r
          ON r.Tipo = UPPER(s.TipoEquivalencia)
         AND ISNULL(r.InstitucionOrigen, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.UniversidadOrigen)), ''), '')
         AND ISNULL(r.Condicion, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.Condicion)), ''), '')
        WHERE s.IdLote = @IdLote
    )
    INSERT INTO dbo.Regla_MateriaOrigen (IdRegla, CodigoCursada, NombreCursada)
    SELECT DISTINCT
        rm.IdRegla,
        rm.CodigoOrigen,
        rm.CodigoOrigen
    FROM RuleMap rm
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Regla_MateriaOrigen o
        WHERE o.IdRegla = rm.IdRegla
          AND o.CodigoCursada = rm.CodigoOrigen
    );

    ;WITH RuleMap AS (
        SELECT
            r.IdRegla,
            s.CodigoDestino
        FROM dbo.stg_ReglasEquivalencia s
        JOIN dbo.ReglasEquivalencia r
          ON r.Tipo = UPPER(s.TipoEquivalencia)
         AND ISNULL(r.InstitucionOrigen, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.UniversidadOrigen)), ''), '')
         AND ISNULL(r.Condicion, '') = ISNULL(NULLIF(LTRIM(RTRIM(s.Condicion)), ''), '')
        WHERE s.IdLote = @IdLote
    )
    INSERT INTO dbo.Regla_MateriaDestino (IdRegla, CodigoOtorgada)
    SELECT DISTINCT
        rm.IdRegla,
        rm.CodigoDestino
    FROM RuleMap rm
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Regla_MateriaDestino d
        WHERE d.IdRegla = rm.IdRegla
          AND d.CodigoOtorgada = rm.CodigoDestino
    );
END;
GO
