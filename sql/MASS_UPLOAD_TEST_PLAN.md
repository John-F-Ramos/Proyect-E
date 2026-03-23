# Massive Upload Test Plan

## Preconditions
- SQL migration executed: `sql/2026-03-22-massive-upload.sql`.
- API running on local environment.
- Use multipart field name `archivoCatalogo`.

## 1) Commit path (valid Pensum file)
- Endpoint: `POST /api/catalogos/upload/pensum`
- File headers: `Codigo_Carrera,Anio_Plan,Codigo_Clase,Nombre_Clase,UV`
- Expected:
  - HTTP `200`
  - Response includes `idLote` and `filasProcesadas`.
  - `CargaLote.Estado = 'APLICADO'`
  - New rows in `stg_Pensum`, `Materias`, `PlanesEstudio`, `Pensum_Materias` as needed.

## 2) Rollback path (invalid row in middle)
- Endpoint: `POST /api/catalogos/upload/pensum`
- Use a row with invalid `UV` (`-1` or non-integer).
- Expected:
  - HTTP `400` with `VALIDATION_FAILED`.
  - No changes in final tables (`Materias`, `PlanesEstudio`, `Pensum_Materias`).
  - No `APLICADO` lote for that file.

## 3) Header rejection path
- Endpoint: `POST /api/catalogos/upload/reglas-equivalencia`
- Send file with missing mandatory header (e.g. remove `Codigo_Destino`).
- Expected:
  - HTTP `400` with `missingHeaders`.
  - No insert in staging or final rules tables.

## 4) Rules upload success
- Endpoint: `POST /api/catalogos/upload/reglas-equivalencia`
- Valid headers: `Tipo_Equivalencia,Universidad_Origen,Codigo_Origen,Codigo_Destino,Condicion`
- Ensure `Codigo_Destino` exists in `Materias`.
- Expected:
  - HTTP `200`
  - Rows applied to `ReglasEquivalencia`, `Regla_MateriaOrigen`, `Regla_MateriaDestino`.

