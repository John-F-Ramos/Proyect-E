const ExcelJS = require('exceljs');

/**
 * Lee un archivo excel desde un buffer y lo convierte a JSON estructurado.
 * Asumimos por MVP que la primera hoja contiene los planes de estudio
 * con columnas: Codigo, Asignatura, UV, Requisitos.
 */
exports.parseExcelBuffer = async (buffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0]; // TODO: DEUDA TÉCNICA - [Selección de Hoja] Escoger la hoja específica o iterar por todas si hay múltiples carreras.

    const planesEstudio = [];

    // Asumimos que la fila 1 es el header
    const headers = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value ? cell.value.toString().trim() : `Col_${colNumber}`;
    });

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rowData = {};
        row.eachCell((cell, colNumber) => {
            const isDate = cell.type === ExcelJS.ValueType.Date;
            rowData[headers[colNumber]] = isDate ? cell.value.toISOString() : cell.text;
        });

        // Add only if it has data
        if (Object.keys(rowData).length > 0) {
            planesEstudio.push(rowData);
        }
    });

    return planesEstudio;
};
