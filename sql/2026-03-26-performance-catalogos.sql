-- Mejora de rendimiento para Catálogos Académicos
-- Ejecutar una sola vez en AppEquivalenciasDB.

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Pensum_Materias_CodigoMateria_IdPlan'
      AND object_id = OBJECT_ID('dbo.Pensum_Materias')
)
BEGIN
    CREATE INDEX IX_Pensum_Materias_CodigoMateria_IdPlan
        ON dbo.Pensum_Materias (CodigoMateria, IdPlan);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Pensum_Materias_IdPlan_CodigoMateria'
      AND object_id = OBJECT_ID('dbo.Pensum_Materias')
)
BEGIN
    CREATE INDEX IX_Pensum_Materias_IdPlan_CodigoMateria
        ON dbo.Pensum_Materias (IdPlan, CodigoMateria);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_PlanesEstudio_CodigoCarrera_AnioPlan'
      AND object_id = OBJECT_ID('dbo.PlanesEstudio')
)
BEGIN
    CREATE INDEX IX_PlanesEstudio_CodigoCarrera_AnioPlan
        ON dbo.PlanesEstudio (CodigoCarrera, AnioPlan DESC);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Materias_NombreMateria'
      AND object_id = OBJECT_ID('dbo.Materias')
)
BEGIN
    CREATE INDEX IX_Materias_NombreMateria
        ON dbo.Materias (NombreMateria);
END;

