/**
 * Mapeo de departamentos a empresas
 * Agrupa las empresas por departamento geográfico
 */

export const DEPARTMENT_MAPPING: Record<string, string[]> = {
  Antioquia: ['Jericó', 'Ciudad Bolívar', 'Tarso', 'Pueblo Rico', 'Santa Bárbara'],
  'Valle del Cauca': ['El Cerrito', 'Guacarí'],
  Quindío: ['Circasia', 'Quimbaya'],
  Putumayo: ['Puerto Asís'],
};

export interface Department {
  name: string;
  companyIds: number[];
  companies: Array<{ companyId: number; name: string }>;
}

/**
 * Mapea una lista de empresas a departamentos
 * Solo retorna departamentos donde el usuario tiene al menos una empresa
 *
 * @param companies - Lista de empresas a las que el usuario tiene acceso
 * @returns Array de departamentos con sus empresas asociadas
 */
export function mapCompaniesToDepartments(
  companies: Array<{ companyId: number; name: string }>
): Department[] {
  const departments: Department[] = [];

  for (const [deptName, companyNames] of Object.entries(DEPARTMENT_MAPPING)) {
    // Filtrar empresas que pertenecen a este departamento
    const deptCompanies = companies.filter((c) =>
      companyNames.includes(c.name)
    );

    // Solo agregar departamento si el usuario tiene acceso a al menos una empresa
    if (deptCompanies.length > 0) {
      departments.push({
        name: deptName,
        companyIds: deptCompanies.map((c) => c.companyId),
        companies: deptCompanies,
      });
    }
  }

  return departments;
}
