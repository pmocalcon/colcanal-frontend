/**
 * Catálogo de empresas y sus centros de costo (centros de operación reales del sistema).
 * Fuente: tablas `companies` + `operation_centers` (prod). Se usa en la Solicitud GTH-002-F
 * para escoger la empresa y autocompletar el CENTRO DE COSTO con su código.
 *
 * Canales & Contactos maneja un código por proyecto (5); las demás empresas tienen uno solo.
 * Las UT sin centro de operación (Pueblorrico/Cd. Bolívar/Tarso/Jericó como compañía) se
 * omiten porque no tienen centro de costo.
 */

export interface CentroOperacion {
  /** Código del centro de costo/operación, p. ej. "963". */
  code: string;
  /** Nombre del proyecto (solo aplica a Canales & Contactos). */
  proyecto?: string;
}

export interface EmpresaOption {
  companyId: number;
  nombre: string;
  centros: CentroOperacion[];
}

export const EMPRESAS: EmpresaOption[] = [
  {
    companyId: 1,
    nombre: 'Canales & Contactos',
    centros: [
      { code: '008', proyecto: 'Oficina Principal' },
      { code: '960', proyecto: 'Jericó' },
      { code: '961', proyecto: 'Ciudad Bolívar' },
      { code: '962', proyecto: 'Pueblo Rico' },
      { code: '963', proyecto: 'Tarso' },
    ],
  },
  { companyId: 9, nombre: 'Uniones y Alianzas', centros: [{ code: '009' }] },
  { companyId: 10, nombre: 'Inversiones Garcés Escalante', centros: [{ code: '010' }] },
  { companyId: 3, nombre: 'Unión Temporal Alumbrado Público Circasia', centros: [{ code: '001' }] },
  { companyId: 2, nombre: 'Unión Temporal Alumbrado Público El Cerrito', centros: [{ code: '002' }] },
  { companyId: 4, nombre: 'Unión Temporal Alumbrado Público Guacarí', centros: [{ code: '003' }] },
  { companyId: 5, nombre: 'Unión Temporal Alumbrado Público Jamundí', centros: [{ code: '004' }] },
  { companyId: 6, nombre: 'Unión Temporal Alumbrado Público Puerto Asís', centros: [{ code: '005' }] },
  { companyId: 7, nombre: 'Unión Temporal Alumbrado Público Quimbaya', centros: [{ code: '006' }] },
  { companyId: 8, nombre: 'Unión Temporal Alumbrado Público Santa Bárbara', centros: [{ code: '007' }] },
];

/** Busca la empresa por su nombre exacto. */
export const getEmpresa = (nombre: string): EmpresaOption | undefined =>
  EMPRESAS.find((e) => e.nombre === nombre);
