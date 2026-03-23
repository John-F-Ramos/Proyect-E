function normalizeWhitespace(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCode(value) {
    return normalizeWhitespace(value)
        .toUpperCase()
        .replace(/[–—]/g, '-')
        .replace(/^[^A-Z0-9]+/, '')
        .replace(/\s+/g, '');
}

function isNoiseLine(line) {
    return /^(\-\-\s*\d+\s+of\s+\d+\s*\-\-|PLAN(?:\s+DE\s+ESTUDIOS)?|TOTAL|U\.?\s*V\.?|UV|CR[EÉ]DITOS?|HORAS|PER[ÍI]ODO|SEMESTRE|BLOQUES?|REQUISITO|EJE)/i.test(
        normalizeWhitespace(line)
    );
}

function looksLikeCodeLine(line) {
    const value = normalizeWhitespace(line).toUpperCase().replace(/[–—]/g, '-');
    const sanitized = normalizeCode(value);
    if (!value) return false;
    if (sanitized.length > 24) return false;
    if (!/\d/.test(sanitized)) return false;
    if (
        /^(PLAN|TOTAL|U\.?V\.?|UV|CR[EÉ]DITOS?|VMI|FACULTAD|PERFIL|BLOQUES|PER[ÍI]ODO|SEMESTRE|EJE|HORAS|REQUISITO)/i.test(
            value
        )
    ) {
        return false;
    }
    if (!/^[^A-Z0-9]*[A-Z0-9\/\-\s\.]+$/.test(value)) return false;
    return true;
}

function isUvLine(line) {
    const value = normalizeWhitespace(line);
    return (
        /^u\.?\s*v\.?/i.test(value) ||
        /^\d+\s*U\.?\s*V\.?/i.test(value) ||
        /^\d+\s*C\.?/i.test(value) ||
        /^\w\s*C\.?/i.test(value) ||
        /CR[EÉ]DITOS?\s*[:|]?\s*\d+/i.test(value)
    );
}

function extractUv(line) {
    const value = normalizeWhitespace(line);

    // Formato típico: "u.v. 4 (4-0)"
    let match = value.match(/u\.?\s*v\.?\s*\.?\s*([0-9]+)/i);
    if (match) {
        const uv = Number(match[1]);
        if (Number.isInteger(uv) && uv >= 0) return uv;
    }

    // Formato típico en pensums: "4 C. (4-0)" o "4 C.(4-0)"
    match = value.match(/^([0-9]+)\s*C\.?/i);
    if (match) {
        const uv = Number(match[1]);
        if (Number.isInteger(uv) && uv >= 0) return uv;
    }

    // Formato frecuente: "4 U.V. (4-0)" o "4 U.V"
    match = value.match(/^([0-9]+)\s*U\.?\s*V\.?/i);
    if (match) {
        const uv = Number(match[1]);
        if (Number.isInteger(uv) && uv >= 0) return uv;
    }

    // Formato técnico: "Horas: 90 | Créditos 6"
    match = value.match(/CR[EÉ]DITOS?\s*[:|]?\s*([0-9]+)/i);
    if (match) {
        const uv = Number(match[1]);
        if (Number.isInteger(uv) && uv >= 0) return uv;
    }

    // OCR defectuoso: "a C. (4-0)" o similar -> tomar primer número disponible.
    match = value.match(/\(([0-9]+)\s*-\s*[0-9]+\)/);
    if (match) {
        const uv = Number(match[1]);
        if (Number.isInteger(uv) && uv >= 0) return uv;
    }

    return null;
}

function extractCarreraAndAnio(text) {
    const content = text || '';
    const normalized = content.replace(/[–—]/g, '-');
    const carreraMatch = normalized.match(/\b([A-Z]{1,3})\s*-\s*(\d{2})\b/i);
    const anioMatch = normalized.match(/PLAN(?:\s+DE\s+ESTUDIOS)?\s*([12]\d{3})/i);

    return {
        codigoCarrera: carreraMatch ? `${carreraMatch[1].toUpperCase()}-${carreraMatch[2]}` : null,
        anioPlan: anioMatch ? Number(anioMatch[1]) : null
    };
}

function looksLikeNameLine(line) {
    const value = normalizeWhitespace(line);
    if (!value) return false;
    if (isNoiseLine(value)) return false;
    if (looksLikeCodeLine(value)) return false;
    if (isUvLine(value)) return false;
    return /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(value);
}

function parsePensumPdfText(text) {
    const lines = (text || '')
        .split(/\r?\n/)
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean);

    const materias = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Patron A: CODIGO -> NOMBRE -> UV
        if (looksLikeCodeLine(line)) {
            const code = normalizeCode(line);
            const nameParts = [];
            let uv = null;

            for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                const current = lines[j];

                if (looksLikeCodeLine(current)) {
                    break;
                }

                if (isUvLine(current)) {
                    uv = extractUv(current);
                    i = j; // Advance cursor after uv line
                    break;
                }

                if (!isNoiseLine(current)) {
                    nameParts.push(current);
                }
            }

            const nombre = normalizeWhitespace(nameParts.join(' '));
            if (!nombre || uv === null || seen.has(code)) {
                continue;
            }

            seen.add(code);
            materias.push({
                codigoClase: code,
                nombreClase: nombre,
                uv
            });
            continue;
        }

        // Patron B: NOMBRE -> UV -> CODIGO (frecuente en planes tecnicos)
        if (!looksLikeNameLine(line)) continue;

        const nameParts = [line];
        let uv = null;
        let code = null;
        let reachedUv = false;

        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
            const current = lines[j];

            if (!reachedUv && isUvLine(current)) {
                uv = extractUv(current);
                reachedUv = true;
                for (let k = j + 1; k < Math.min(j + 4, lines.length); k++) {
                    if (looksLikeCodeLine(lines[k])) {
                        code = normalizeCode(lines[k]);
                        i = k; // Advance cursor after code line
                        break;
                    }
                }
                break;
            }

            if (looksLikeCodeLine(current)) {
                break;
            }

            if (!isNoiseLine(current) && !isUvLine(current)) {
                nameParts.push(current);
            }
        }

        if (!code || uv === null || seen.has(code)) continue;

        const nombre = normalizeWhitespace(nameParts.join(' '));
        if (!nombre) continue;

        seen.add(code);
        materias.push({
            codigoClase: code,
            nombreClase: nombre,
            uv
        });
    }

    return materias;
}

module.exports = {
    extractCarreraAndAnio,
    parsePensumPdfText
};
