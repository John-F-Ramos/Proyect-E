SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.AuditoriaRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaRoles (
        IdAuditoria BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IdAdminActor INT NOT NULL,
        IdUsuarioObjetivo INT NOT NULL,
        RolAnterior INT NULL,
        RolNuevo INT NULL,
        EstadoAnterior BIT NULL,
        EstadoNuevo BIT NULL,
        Motivo NVARCHAR(300) NULL,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_AuditoriaRoles_Fecha DEFAULT (SYSDATETIME()),
        IpOrigen VARCHAR(64) NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_AuditoriaRoles_AdminActor_Usuarios'
)
BEGIN
    ALTER TABLE dbo.AuditoriaRoles
    ADD CONSTRAINT FK_AuditoriaRoles_AdminActor_Usuarios
        FOREIGN KEY (IdAdminActor) REFERENCES dbo.Usuarios(IdUsuario);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_AuditoriaRoles_UsuarioObjetivo_Usuarios'
)
BEGIN
    ALTER TABLE dbo.AuditoriaRoles
    ADD CONSTRAINT FK_AuditoriaRoles_UsuarioObjetivo_Usuarios
        FOREIGN KEY (IdUsuarioObjetivo) REFERENCES dbo.Usuarios(IdUsuario);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_AuditoriaRoles_IdUsuarioObjetivo_Fecha'
      AND object_id = OBJECT_ID('dbo.AuditoriaRoles')
)
BEGIN
    CREATE INDEX IX_AuditoriaRoles_IdUsuarioObjetivo_Fecha
        ON dbo.AuditoriaRoles(IdUsuarioObjetivo, Fecha DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_AuditoriaRoles_Fecha'
      AND object_id = OBJECT_ID('dbo.AuditoriaRoles')
)
BEGIN
    CREATE INDEX IX_AuditoriaRoles_Fecha
        ON dbo.AuditoriaRoles(Fecha DESC);
END;
GO
