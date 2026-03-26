const TEMPLATE_TYPES = {
    PENSUM: 'PENSUM',
    REGLAS_EQUIVALENCIA: 'REGLAS_EQUIVALENCIA'
};

const TEMPLATE_DEFINITIONS = {
    [TEMPLATE_TYPES.PENSUM]: {
        // Se soportan 2 formatos:
        // 1) Plantilla interna clásica (ANIO_PLAN, CODIGO_CLASE, NOMBRE_CLASE, UV)
        // 2) Detalle CEUTEC (PLAN_VIGENTE, CODIGO_MATERIA, NOMBRE_MATERIA, UNIDADES_VALORATIVAS)
        requiredHeaderSets: [
            [
                'CODIGO_CARRERA',
                'ANIO_PLAN',
                'CODIGO_CLASE',
                'NOMBRE_CLASE',
                'UV'
            ],
            [
                'CODIGO_CARRERA',
                'PLAN_VIGENTE',
                'CODIGO_MATERIA',
                'NOMBRE_MATERIA',
                'UNIDADES_VALORATIVAS'
            ],
            [
                // Variación reportada por usuario: PLAN_VIGETE
                'CODIGO_CARRERA',
                'PLAN_VIGETE',
                'CODIGO_MATERIA',
                'NOMBRE_MATERIA',
                'UNIDADES_VALORATIVAS'
            ]
        ]
    },
    [TEMPLATE_TYPES.REGLAS_EQUIVALENCIA]: {
        requiredHeaderSets: [[
            'TIPO_EQUIVALENCIA',
            'UNIVERSIDAD_ORIGEN',
            'CODIGO_ORIGEN',
            'CODIGO_DESTINO',
            'CONDICION'
        ]]
    }
};

function normalizeHeader(value) {
    return (value || '')
        .toString()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .toUpperCase();
}

function normalizeCell(value) {
    if (value === null || value === undefined) return '';
    return value.toString().trim();
}

function buildMissingHeaders(requiredHeaders, headers) {
    const headerSet = new Set(headers.map(normalizeHeader));
    return requiredHeaders.filter((h) => !headerSet.has(h));
}

function isPositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0;
}

function normalizePlanYear(rawValue) {
    const raw = (rawValue || '').toString().trim();
    if (!raw) return NaN;
    const year = Number(raw);
    if (!Number.isInteger(year)) return NaN;

    // Convención solicitada: 21 -> 2021
    if (year >= 0 && year <= 99) {
        return 2000 + year;
    }
    return year;
}

function validatePensumRows(rawRows) {
    const errors = [];
    const validRows = [];
    const dedupe = new Set();

    rawRows.forEach((rawRow, idx) => {
        const rowNumber = idx + 2;
        const normalized = {};
        Object.keys(rawRow).forEach((key) => {
            normalized[normalizeHeader(key)] = normalizeCell(rawRow[key]);
        });
        const isDetalleCeutec = Boolean(
            normalized.CAMPUS ||
            normalized.NIVEL ||
            normalized.PLAN_VIGENTE ||
            normalized.PLAN_VIGETE
        );

        const normalizedAnioPlan = normalizePlanYear(
            normalized.ANIO_PLAN || normalized.PLAN_VIGENTE || normalized.PLAN_VIGETE
        );

        const row = {
            codigoCarrera: normalized.CODIGO_CARRERA,
            anioPlan: normalizedAnioPlan,
            codigoClase: normalized.CODIGO_CLASE || normalized.CODIGO_MATERIA,
            nombreClase: normalized.NOMBRE_CLASE || normalized.NOMBRE_MATERIA,
            uv: normalized.UV || normalized.UNIDADES_VALORATIVAS
        };

        // En el detalle CEUTEC pueden venir filas auxiliares sin materia real.
        // Se ignoran silenciosamente para no bloquear la carga.
        if (isDetalleCeutec) {
            const hasCodigo = Boolean((row.codigoClase || '').toString().trim());
            const hasNombre = Boolean((row.nombreClase || '').toString().trim());
            if (!hasCodigo || !hasNombre) {
                return;
            }
        }

        if (!row.codigoCarrera) {
            errors.push({
                rowNumber,
                field: 'Codigo_Carrera',
                code: 'REQUIRED',
                message: 'Codigo_Carrera es obligatorio',
                value: row.codigoCarrera
            });
        }
        if (!isPositiveInt(row.anioPlan)) {
            errors.push({
                rowNumber,
                field: 'Anio_Plan',
                code: 'INVALID_FORMAT',
                message: 'Anio_Plan debe ser entero positivo',
                value: row.anioPlan
            });
        }
        if (!row.codigoClase) {
            errors.push({
                rowNumber,
                field: 'Codigo_Clase',
                code: 'REQUIRED',
                message: 'Codigo_Clase es obligatorio',
                value: row.codigoClase
            });
        }
        if (!row.nombreClase) {
            errors.push({
                rowNumber,
                field: 'Nombre_Clase',
                code: 'REQUIRED',
                message: 'Nombre_Clase es obligatorio',
                value: row.nombreClase
            });
        }
        if (!isNonNegativeInt(row.uv)) {
            errors.push({
                rowNumber,
                field: 'UV',
                code: 'INVALID_FORMAT',
                message: 'UV debe ser entero >= 0',
                value: row.uv
            });
        }

        const key = `${row.codigoCarrera}|${row.anioPlan}|${row.codigoClase}`;
        if (row.codigoCarrera && row.anioPlan && row.codigoClase && dedupe.has(key)) {
            if (!isDetalleCeutec) {
                errors.push({
                    rowNumber,
                    field: 'Codigo_Clase',
                    code: 'DUPLICATE_IN_FILE',
                    message: 'Registro duplicado en plantilla de pensum',
                    value: row.codigoClase
                });
            }
            // Para detalle CEUTEC, ignoramos duplicados por campus/seccion.
            return;
        }
        dedupe.add(key);

        validRows.push({
            codigoCarrera: row.codigoCarrera,
            anioPlan: Number(row.anioPlan),
            codigoClase: row.codigoClase,
            nombreClase: row.nombreClase,
            uv: Number(row.uv)
        });
    });

    return { validRows, errors };
}

function validateReglasRows(rawRows) {
    const errors = [];
    const validRows = [];
    const dedupe = new Set();

    rawRows.forEach((rawRow, idx) => {
        const rowNumber = idx + 2;
        const normalized = {};
        Object.keys(rawRow).forEach((key) => {
            normalized[normalizeHeader(key)] = normalizeCell(rawRow[key]);
        });

        const tipo = (normalized.TIPO_EQUIVALENCIA || '').toUpperCase();
        const universidadOrigen = normalized.UNIVERSIDAD_ORIGEN;
        const codigoOrigen = normalized.CODIGO_ORIGEN;
        const codigoDestino = normalized.CODIGO_DESTINO;
        const condicion = normalized.CONDICION;

        if (!tipo) {
            errors.push({
                rowNumber,
                field: 'Tipo_Equivalencia',
                code: 'REQUIRED',
                message: 'Tipo_Equivalencia es obligatorio',
                value: tipo
            });
        } else if (!['INTERNA', 'EXTERNA'].includes(tipo)) {
            errors.push({
                rowNumber,
                field: 'Tipo_Equivalencia',
                code: 'INVALID_VALUE',
                message: 'Tipo_Equivalencia debe ser INTERNA o EXTERNA',
                value: tipo
            });
        }

        if (tipo === 'EXTERNA' && !universidadOrigen) {
            errors.push({
                rowNumber,
                field: 'Universidad_Origen',
                code: 'REQUIRED',
                message: 'Universidad_Origen es obligatoria para reglas EXTERNAS',
                value: universidadOrigen
            });
        }

        if (!codigoOrigen) {
            errors.push({
                rowNumber,
                field: 'Codigo_Origen',
                code: 'REQUIRED',
                message: 'Codigo_Origen es obligatorio',
                value: codigoOrigen
            });
        }

        if (!codigoDestino) {
            errors.push({
                rowNumber,
                field: 'Codigo_Destino',
                code: 'REQUIRED',
                message: 'Codigo_Destino es obligatorio',
                value: codigoDestino
            });
        }

        const key = `${tipo}|${universidadOrigen}|${codigoOrigen}|${codigoDestino}|${condicion}`;
        if (tipo && codigoOrigen && codigoDestino && dedupe.has(key)) {
            errors.push({
                rowNumber,
                field: 'Codigo_Origen',
                code: 'DUPLICATE_IN_FILE',
                message: 'Registro duplicado en plantilla de reglas',
                value: codigoOrigen
            });
        } else {
            dedupe.add(key);
        }

        validRows.push({
            tipoEquivalencia: tipo,
            universidadOrigen,
            codigoOrigen,
            codigoDestino,
            condicion
        });
    });

    return { validRows, errors };
}

function detectTemplateType(headers) {
    const normalizedHeaders = headers.map(normalizeHeader);
    const hasHeaderSet = (requiredSet) => requiredSet.every((header) => normalizedHeaders.includes(header));

    const hasPensum = TEMPLATE_DEFINITIONS[TEMPLATE_TYPES.PENSUM].requiredHeaderSets
        .some((set) => hasHeaderSet(set));
    const hasReglas = TEMPLATE_DEFINITIONS[TEMPLATE_TYPES.REGLAS_EQUIVALENCIA].requiredHeaderSets
        .some((set) => hasHeaderSet(set));

    if (hasPensum) return TEMPLATE_TYPES.PENSUM;
    if (hasReglas) return TEMPLATE_TYPES.REGLAS_EQUIVALENCIA;
    return null;
}

function validateTemplateHeaders(templateType, headers) {
    const definition = TEMPLATE_DEFINITIONS[templateType];
    if (!definition) {
        return { missingHeaders: ['UNSUPPORTED_TEMPLATE_TYPE'] };
    }

    const requiredSets = definition.requiredHeaderSets || [];
    if (!requiredSets.length) {
        return { missingHeaders: ['UNSUPPORTED_TEMPLATE_TYPE'] };
    }

    const missingBySet = requiredSets.map((set) => buildMissingHeaders(set, headers));
    const best = missingBySet.reduce((acc, curr) => (curr.length < acc.length ? curr : acc), missingBySet[0]);

    return { missingHeaders: best };
}

module.exports = {
    TEMPLATE_TYPES,
    TEMPLATE_DEFINITIONS,
    normalizeHeader,
    detectTemplateType,
    validateTemplateHeaders,
    validatePensumRows,
    validateReglasRows
};
