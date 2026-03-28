/**
 * Estados de Historial_Importado que cuentan como materia aprobada/cursada con éxito.
 * EQV (equivalencia) se trata igual que APB/APR/etc. para avance y requisitos.
 */
const ESTADOS_APROBADOS = ['APB', 'APR', 'APROBADO', 'REQ', 'EQV'];

/** Lista literal para SQL IN (...) — valores fijos, no interpolar entrada de usuario. */
const SQL_IN_APROBADOS = "'APB','APR','APROBADO','REQ','EQV'";

/** Incluye REP para promedio (solo filas con Nota numérica cuentan en AVG). */
const SQL_IN_PROMEDIO = "'APB','APR','APROBADO','REQ','EQV','REP'";

/** Orden en listas de historial: aprobadas “normales” + EQV (sin REQ, como antes). */
const SQL_IN_ORDEN_HISTORIAL = "'APB','APR','APROBADO','EQV'";

module.exports = {
    ESTADOS_APROBADOS,
    SQL_IN_APROBADOS,
    SQL_IN_PROMEDIO,
    SQL_IN_ORDEN_HISTORIAL
};
