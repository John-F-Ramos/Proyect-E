function normalizeSpaces(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
    const v = normalizeSpaces(value).replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function toInt(value) {
    const n = parseInt(normalizeSpaces(value), 10);
    return Number.isFinite(n) ? n : 0;
}

function splitLine(line) {
    if (line.includes('\t')) {
        return line.split('\t').map((v) => v.trim());
    }
    // Soporta separador por multiples espacios
    return line.split(/\s{2,}/).map((v) => v.trim());
}

function looksLikeHeader(line) {
    const l = (line || '').toLowerCase();
    const hasCampus = l.includes('campus');
    const hasYear = l.includes('año') || l.includes('anio');
    const hasSem = l.includes('semestre');
    const hasCode = l.includes('código') || l.includes('codigo');
    return (
        hasCampus && hasYear && hasSem && hasCode
    );
}

// Formato esperado:
// Campus | Año | Semestre | Módulo | Sección | Código | Materia | Nota | Estado | UV
exports.parseCEUTECFormat = (text) => {
    if (!text || typeof text !== 'string') return [];

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (!lines.length) return [];

    const data = [];

    for (const line of lines) {
        // Saltar encabezados si existen
        if (looksLikeHeader(line)) continue;

        const cols = splitLine(line);
        if (cols.length < 10) {
            // Si no llega el formato completo, se ignora esa fila
            continue;
        }

        const codigoMateria = normalizeSpaces(cols[5]);
        const nombreMateria = normalizeSpaces(cols[6]);
        const estadoRaw = normalizeSpaces(cols[8]);
        const estado = estadoRaw ? estadoRaw.toUpperCase() : 'EN CURSO';
        const nota = estado === 'EQV' ? null : toNumber(cols[7]);
        const uvs = toInt(cols[9]);

        if (!codigoMateria || !nombreMateria) continue;

        data.push({
            codigo_materia: codigoMateria,
            nombre_materia: nombreMateria,
            nota,
            estado,
            uvs
        });
    }

    return data;
};

// Mantener compatibilidad con llamadas existentes
exports.parsePlainText = (text) => {
    return exports.parseCEUTECFormat(text);
};