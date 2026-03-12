// services/textParser.js

/**
 * Parsea texto plano con formato de columnas separadas por tabs
 * SOLO toma las columnas: Código, Materia, Nota, Estado, UV
 * Maneja estados vacíos como "En Curso"
 */
exports.parsePlainText = (text) => {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // Dividir por líneas y filtrar vacías
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length < 2) {
        return [];
    }

    // Detectar separador (tabulación)
    const separator = lines[0].includes('\t') ? '\t' : /\s{2,}/;
    
    // La primera línea son los encabezados
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
    console.log('Headers detectados:', headers);

    // Mapeo estricto de columnas que nos interesan
    let codigoIndex = -1;
    let materiaIndex = -1;
    let notaIndex = -1;
    let estadoIndex = -1;
    let uvIndex = -1;

    headers.forEach((header, index) => {
        if (header.includes('código') || header.includes('codigo') || header === 'cod' || header === 'materia') {
            codigoIndex = index;
        } else if (header.includes('nombre') || header.includes('materia') || header === 'asignatura') {
            materiaIndex = index;
        } else if (header.includes('nota') || header.includes('calificacion')) {
            notaIndex = index;
        } else if (header.includes('estado') || header.includes('resultado')) {
            estadoIndex = index;
        } else if (header.includes('uv') || header.includes('uvs') || header.includes('u.v.')) {
            uvIndex = index;
        }
    });

    // Verificar que tenemos al menos código y materia
    if (codigoIndex === -1 || materiaIndex === -1) {
        console.error('No se encontraron columnas requeridas (Código y Materia)');
        return [];
    }

    const data = [];
    
    // Procesar cada línea de datos
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        const values = line.split(separator).map(v => v.trim());
        
        // Extraer solo las columnas que nos interesan
        const codigo = values[codigoIndex] || 'S/D';
        let materia = values[materiaIndex] || 'S/D';
        
        // Extraer nota (valor exacto, sin tolerancias)
        let nota = 0;
        if (notaIndex !== -1 && values[notaIndex] && values[notaIndex] !== 'N/A') {
            const notaStr = values[notaIndex].replace(',', '.');
            nota = parseFloat(notaStr) || 0;
        }
        
        // Extraer estado - MANEJO ESPECIAL PARA VACÍO
        let estado = 'S/D';
        if (estadoIndex !== -1) {
            estado = values[estadoIndex] || '';
            
            // Si el estado está vacío, significa "En Curso"
            if (estado === '' || estado === null) {
                estado = 'EN CURSO';
            }
        }
        
        // Extraer UVs
        let uvs = 0;
        if (uvIndex !== -1 && values[uvIndex] && values[uvIndex] !== 'N/A') {
            uvs = parseInt(values[uvIndex]) || 0;
        }

        // Limpiar materia si tiene formato especial (saltos de línea, dos puntos)
        if (materia.includes('\n') || materia.includes(':')) {
            // Tomar la primera parte significativa
            const parts = materia.split('\n')[0].split(':');
            materia = parts[parts.length - 1].trim();
        }

        // Limpiar materia de caracteres extraños
        materia = materia.replace(/\s+/g, ' ').trim();

        // Crear registro SOLO con los datos necesarios
        const record = {
            codigo_materia: codigo,
            nombre_materia: materia,
            nota: nota,
            estado: estado,
            uvs: uvs
        };

        // Solo agregar si tenemos código válido
        if (record.codigo_materia && record.codigo_materia !== 'S/D') {
            data.push(record);
            console.log(`[Parser] ${codigo} - ${materia} - Nota: ${nota} - Estado: "${estado}" - UV: ${uvs}`);
        }
    }
    
    console.log(`Parser generó ${data.length} registros válidos`);
    return data;
};