const ExcelJS = require('exceljs');
const { parseExcelBuffer } = require('../services/excelProcessor');

describe('excelProcessor', () => {
    it('should correctly parse an Excel buffer into a JSON array', async () => {
        // 1. Crear un workbook y worksheet en memoria usando exceljs
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Planes de Estudio');

        // 2. Agregar encabezados y datos de prueba
        worksheet.addRow(['Codigo', 'Asignatura', 'UV', 'Requisitos']);
        worksheet.addRow(['MAT101', 'Matemáticas I', 4, 'Ninguno']);
        worksheet.addRow(['PRG101', 'Programación I', 4, 'MAT101']);

        // 3. Escribir a un buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // 4. Ejecutar el servicio con el buffer
        const result = await parseExcelBuffer(buffer);

        // 5. Validar los resultados
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2); // Dos filas de datos (excluyendo el header)

        // Validar el contenido de la primera fila
        expect(result[0]).toHaveProperty('Codigo', 'MAT101');
        expect(result[0]).toHaveProperty('Asignatura', 'Matemáticas I');
        expect(result[0]).toHaveProperty('UV', '4'); // Usualmente exceljs lee numeros como numeros o texto, nuestro procesador usa .text
        expect(result[0]).toHaveProperty('Requisitos', 'Ninguno');

        // Validar el contenido de la segunda fila
        expect(result[1]).toHaveProperty('Codigo', 'PRG101');
        expect(result[1]).toHaveProperty('Asignatura', 'Programación I');
    });

    it('should return an empty array if excel has only headers', async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Empty');
        worksheet.addRow(['Col1', 'Col2']);

        const buffer = await workbook.xlsx.writeBuffer();
        const result = await parseExcelBuffer(buffer);

        expect(result).toEqual([]);
    });
});
