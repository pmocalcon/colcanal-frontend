/**
 * Mapeo de departamentos a empresas
 * Agrupa las empresas por departamento geográfico
 */

export const DEPARTMENT_MAPPING: Record<string, string[]> = {
  Antioquia: [
    'Jericó',
    'Ciudad Bolívar',
    'Tarso',
    'Pueblo Rico',
    'Unión Temporal Alumbrado Público Santa Bárbara'
  ],
  'Valle del Cauca': [
    'Unión Temporal Alumbrado Público El Cerrito',
    'Unión Temporal Alumbrado Público Guacarí',
    'Unión Temporal Alumbrado Público Jamundí'
  ],
  Quindío: [
    'Unión Temporal Alumbrado Público Circasia',
    'Unión Temporal Alumbrado Público Quimbaya'
  ],
  Putumayo: [
    'Unión Temporal Alumbrado Público Puerto Asís'
  ],
};

export interface Department {
  name: string;
  companyIds: number[];
  companies: Array<{ companyId: number; name: string }>;
  projectIds?: number[];
  projects?: Array<{ projectId: number; name: string; companyId: number }>;
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
  console.log('🔍 [departmentMapper] Empresas recibidas:', companies);
  console.log('🔍 [departmentMapper] Mapeo de departamentos:', DEPARTMENT_MAPPING);

  const departments: Department[] = [];

  for (const [deptName, companyNames] of Object.entries(DEPARTMENT_MAPPING)) {
    // Filtrar empresas que pertenecen a este departamento
    const deptCompanies = companies.filter((c) =>
      companyNames.includes(c.name)
    );

    console.log(`🔍 [departmentMapper] ${deptName}:`, {
      expectedCompanies: companyNames,
      foundCompanies: deptCompanies,
      allCompanyNames: companies.map(c => c.name),
      comparisons: companies.map(c => ({
        name: c.name,
        matchesAny: companyNames.some(expected => {
          const match = expected === c.name;
          console.log(`  "${expected}" === "${c.name}" ? ${match}`);
          return match;
        })
      }))
    });

    // Solo agregar departamento si el usuario tiene acceso a al menos una empresa
    if (deptCompanies.length > 0) {
      departments.push({
        name: deptName,
        companyIds: deptCompanies.map((c) => c.companyId),
        companies: deptCompanies,
      });
    }
  }

  console.log('🔍 [departmentMapper] Departamentos finales:', departments);
  return departments;
}

/**
 * Mapea una lista de proyectos a departamentos
 * Solo retorna departamentos donde el usuario tiene al menos un proyecto
 *
 * @param projects - Lista de proyectos a los que el usuario tiene acceso
 * @returns Array de departamentos con sus proyectos asociados
 */
export function mapProjectsToDepartments(
  projects: Array<{ projectId: number; name: string; companyId: number }>
): Department[] {
  const departments: Department[] = [];

  for (const [deptName, locationNames] of Object.entries(DEPARTMENT_MAPPING)) {
    // Filtrar proyectos que pertenecen a este departamento
    const deptProjects = projects.filter((p) =>
      locationNames.includes(p.name)
    );

    // Solo agregar departamento si el usuario tiene acceso a al menos un proyecto
    if (deptProjects.length > 0) {
      departments.push({
        name: deptName,
        companyIds: [],
        companies: [],
        projectIds: deptProjects.map((p) => p.projectId),
        projects: deptProjects,
      });
    }
  }

  return departments;
}
