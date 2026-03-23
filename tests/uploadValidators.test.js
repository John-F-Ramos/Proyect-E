const {
    TEMPLATE_TYPES,
    detectTemplateType,
    validateTemplateHeaders,
    validatePensumRows,
    validateReglasRows
} = require('../services/uploadValidators');

describe('uploadValidators', () => {
    test('detectTemplateType identifies pensum template', () => {
        const type = detectTemplateType([
            'Codigo_Carrera',
            'Anio_Plan',
            'Codigo_Clase',
            'Nombre_Clase',
            'UV'
        ]);
        expect(type).toBe(TEMPLATE_TYPES.PENSUM);
    });

    test('validateTemplateHeaders reports missing headers', () => {
        const { missingHeaders } = validateTemplateHeaders(TEMPLATE_TYPES.PENSUM, [
            'Codigo_Carrera',
            'Anio_Plan'
        ]);
        expect(missingHeaders).toContain('CODIGO_CLASE');
        expect(missingHeaders).toContain('NOMBRE_CLASE');
        expect(missingHeaders).toContain('UV');
    });

    test('validatePensumRows validates required fields and duplicates', () => {
        const { errors, validRows } = validatePensumRows([
            {
                Codigo_Carrera: 'I-06',
                Anio_Plan: '2023',
                Codigo_Clase: 'CCC104',
                Nombre_Clase: 'PROGRAMACION I',
                UV: '4'
            },
            {
                Codigo_Carrera: 'I-06',
                Anio_Plan: '2023',
                Codigo_Clase: 'CCC104',
                Nombre_Clase: 'PROGRAMACION I',
                UV: '4'
            }
        ]);

        expect(validRows).toHaveLength(2);
        expect(errors.some((e) => e.code === 'DUPLICATE_IN_FILE')).toBe(true);
    });

    test('validateReglasRows enforces EXTERNA universidad and valid type', () => {
        const { errors } = validateReglasRows([
            {
                Tipo_Equivalencia: 'EXTERNA',
                Universidad_Origen: '',
                Codigo_Origen: 'MAT-101',
                Codigo_Destino: 'MAT101',
                Condicion: '1:1'
            },
            {
                Tipo_Equivalencia: 'OTRA',
                Universidad_Origen: 'UNAH',
                Codigo_Origen: 'X',
                Codigo_Destino: 'Y',
                Condicion: ''
            }
        ]);

        expect(errors.some((e) => e.field === 'Universidad_Origen')).toBe(true);
        expect(errors.some((e) => e.code === 'INVALID_VALUE')).toBe(true);
    });
});
