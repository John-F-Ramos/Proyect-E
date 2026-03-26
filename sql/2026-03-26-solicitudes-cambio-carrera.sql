-- Tabla para almacenar solicitudes de cambio de carrera
-- Se construye NumeroCuenta con el mismo tipo/longitud que Alumnos.NumeroCuenta
-- para evitar errores de FK por mismatch de tamaño.
IF OBJECT_ID('dbo.SolicitudesCambioCarrera', 'U') IS NULL
BEGIN
    DECLARE @numeroCuentaType NVARCHAR(64);
    DECLARE @sql NVARCHAR(MAX);

    SELECT TOP 1
        @numeroCuentaType =
            UPPER(t.name) +
            CASE
                WHEN t.name IN ('varchar', 'char') THEN
                    '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS VARCHAR(10)) END + ')'
                WHEN t.name IN ('nvarchar', 'nchar') THEN
                    '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / 2 AS VARCHAR(10)) END + ')'
                ELSE ''
            END
    FROM sys.columns c
    INNER JOIN sys.types t
        ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.Alumnos')
      AND c.name = 'NumeroCuenta';

    IF @numeroCuentaType IS NULL
        SET @numeroCuentaType = 'VARCHAR(20)';

    SET @sql = N'
        CREATE TABLE dbo.SolicitudesCambioCarrera (
            IdSolicitud          INT IDENTITY(1,1) PRIMARY KEY,
            NumeroCuenta         ' + @numeroCuentaType + N' NOT NULL,
            IdPlanActual         INT           NOT NULL,
            IdPlanDestino        INT           NOT NULL,
            Motivo               NVARCHAR(500) NULL,
            Estado               VARCHAR(20)   NOT NULL DEFAULT ''PENDIENTE'',
            -- Snapshot de la simulación al momento de la solicitud
            MateriasEquivalentes INT           NULL,
            UVSEquivalentes      INT           NULL,
            MateriasFaltantes    INT           NULL,
            UVSFaltantes         INT           NULL,
            PorcentajeAvance     DECIMAL(5,2)  NULL,
            -- Resolución
            IdUsuarioRevisor     INT           NULL,
            MotivoResolucion     NVARCHAR(500) NULL,
            FechaResolucion      DATETIME      NULL,
            -- Auditoría
            FechaCreacion        DATETIME      NOT NULL DEFAULT GETDATE(),
            FechaActualizacion   DATETIME      NOT NULL DEFAULT GETDATE(),

            CONSTRAINT FK_SCC_Alumno       FOREIGN KEY (NumeroCuenta)     REFERENCES dbo.Alumnos(NumeroCuenta),
            CONSTRAINT FK_SCC_PlanActual   FOREIGN KEY (IdPlanActual)     REFERENCES dbo.PlanesEstudio(IdPlan),
            CONSTRAINT FK_SCC_PlanDestino  FOREIGN KEY (IdPlanDestino)    REFERENCES dbo.PlanesEstudio(IdPlan),
            CONSTRAINT FK_SCC_Revisor      FOREIGN KEY (IdUsuarioRevisor) REFERENCES dbo.Usuarios(IdUsuario),
            CONSTRAINT CK_SCC_Estado       CHECK (Estado IN (''PENDIENTE'', ''APROBADA'', ''RECHAZADA''))
        );
    ';

    EXEC sp_executesql @sql;

    CREATE INDEX IX_SCC_NumeroCuenta ON dbo.SolicitudesCambioCarrera(NumeroCuenta);
    CREATE INDEX IX_SCC_Estado       ON dbo.SolicitudesCambioCarrera(Estado);
END;
