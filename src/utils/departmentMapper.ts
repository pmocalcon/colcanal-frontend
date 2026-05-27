/**
 * Mapeo de departamentos a empresas y proyectos
 * Agrupa las entidades por departamento geográfico
 */

const normalizeMunicipalityName = (name: string): string =>
  name
    .replace(/^UniÃ³n Temporal Alumbrado PÃºblico\s+/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^union temporal alumbrado publico\s+/i, '')
    .toLowerCase()
    .trim();

export function getMunicipioName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^union temporal alumbrado publico\s+/i, '')
    .trim();
  if (normalized !== name) return normalized || name;
  const prefix = 'Unión Temporal Alumbrado Público ';
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export const DEPARTMENT_MAPPING: Record<string, { companies: string[]; projects: string[] }> = {
  Antioquia: {
    companies: ['Unión Temporal Alumbrado Público Santa Bárbara'],
    projects: ['Jericó', 'Ciudad Bolívar', 'Tarso', 'Pueblo Rico'],
  },
  'Valle del Cauca': {
    companies: [
      'Unión Temporal Alumbrado Público El Cerrito',
      'Unión Temporal Alumbrado Público Guacarí',
    ],
    projects: [],
  },
  Quindío: {
    companies: [
      'Unión Temporal Alumbrado Público Circasia',
      'Unión Temporal Alumbrado Público Quimbaya',
    ],
    projects: [],
  },
  Putumayo: {
    companies: ['Unión Temporal Alumbrado Público Puerto Asís'],
    projects: [],
  },
};

export interface Municipality {
  id: number;
  name: string;
  type: 'company' | 'project';
}

export interface Department {
  name: string;
  companyIds: number[];
  projectIds: number[];
  municipalities: Municipality[];
  /** @deprecated Use municipalities instead */
  companies: Array<{ companyId: number; name: string }>;
  /** @deprecated Use municipalities instead */
  projects: Array<{ projectId: number; name: string; companyId: number }>;
}

export function mapToDepartments(
  companies: Array<{ companyId: number; name: string }>,
  projects: Array<{ projectId: number; name: string; companyId: number }>,
): Department[] {
  const departments: Department[] = [];

  for (const [deptName, mapping] of Object.entries(DEPARTMENT_MAPPING)) {
    const allowedNames = new Set(
      [...mapping.companies, ...mapping.projects].map(normalizeMunicipalityName),
    );
    const deptCompanies = companies.filter((c) => allowedNames.has(normalizeMunicipalityName(c.name)));
    const deptProjects = projects.filter((p) => allowedNames.has(normalizeMunicipalityName(p.name)));

    if (deptCompanies.length === 0 && deptProjects.length === 0) continue;

    const municipalities = [
      ...deptCompanies.map((c) => ({ id: c.companyId, name: c.name, type: 'company' as const })),
      ...deptProjects.map((p) => ({ id: p.projectId, name: p.name, type: 'project' as const })),
    ].filter((municipality, index, all) => {
      const name = normalizeMunicipalityName(municipality.name);
      return all.findIndex((item) => normalizeMunicipalityName(item.name) === name) === index;
    });

    departments.push({
      name: deptName,
      companyIds: deptCompanies.map((c) => c.companyId),
      projectIds: deptProjects.map((p) => p.projectId),
      companies: deptCompanies.map((c) => ({ companyId: c.companyId, name: c.name })),
      projects: deptProjects.map((p) => ({ projectId: p.projectId, name: p.name, companyId: p.companyId })),
      municipalities,
    });
  }

  return departments;
}

/** @deprecated Use mapToDepartments instead */
export function mapCompaniesToDepartments(
  companies: Array<{ companyId: number; name: string }>,
): Department[] {
  return mapToDepartments(companies, []);
}

/** @deprecated Use mapToDepartments instead */
export function mapProjectsToDepartments(
  projects: Array<{ projectId: number; name: string; companyId: number }>,
): Department[] {
  return mapToDepartments([], projects);
}
