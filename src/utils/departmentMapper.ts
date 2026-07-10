/**
 * Mapeo de departamentos a empresas y proyectos
 * Agrupa las entidades por departamento geográfico
 */

const normalizeMunicipalityName = (name: string): string =>
  name
    .replace(/^Unión Temporal Alumbrado Público\s+/i, '')
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
    // Antioquia se opera bajo Canales & Contactos (proyectos: Ciudad Bolívar,
    // Jericó, Tarso, Pueblo Rico). Las UT propias de esos municipios son
    // duplicados sin uso y no se incluyen.
    companies: ['Canales & Contactos'],
    projects: [],
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
  /** Parent company ID — only set for project-type municipalities */
  companyId?: number;
  /** When a company-type municipality also has a same-named project, this holds that project's ID */
  linkedProjectId?: number;
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

  // Merge same-name entries: company wins, but keeps the project's ID for cross-filtering
  const buildMunicipalities = (
    deptCompanies: Array<{ companyId: number; name: string }>,
    deptProjects: Array<{ projectId: number; name: string; companyId: number }>,
  ): Municipality[] => {
    const rawMunicipalities: Municipality[] = [
      ...deptCompanies.map((c) => ({ id: c.companyId, name: c.name, type: 'company' as const })),
      ...deptProjects.map((p) => ({ id: p.projectId, name: p.name, type: 'project' as const, companyId: p.companyId })),
    ];
    const seen = new Map<string, Municipality>();
    for (const muni of rawMunicipalities) {
      const key = normalizeMunicipalityName(muni.name);
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        if (existing.type === 'company' && muni.type === 'project') {
          existing.linkedProjectId = muni.id;
        }
      } else {
        seen.set(key, { ...muni });
      }
    }
    return [...seen.values()];
  };

  for (const [deptName, mapping] of Object.entries(DEPARTMENT_MAPPING)) {
    const allowedNames = new Set(
      [...mapping.companies, ...mapping.projects].map(normalizeMunicipalityName),
    );
    const deptCompanies = companies.filter((c) => allowedNames.has(normalizeMunicipalityName(c.name)));
    const deptProjects = projects.filter((p) => allowedNames.has(normalizeMunicipalityName(p.name)));

    if (deptCompanies.length === 0 && deptProjects.length === 0) continue;

    departments.push({
      name: deptName,
      companyIds: deptCompanies.map((c) => c.companyId),
      projectIds: deptProjects.map((p) => p.projectId),
      companies: deptCompanies.map((c) => ({ companyId: c.companyId, name: c.name })),
      projects: deptProjects.map((p) => ({ projectId: p.projectId, name: p.name, companyId: p.companyId })),
      municipalities: buildMunicipalities(deptCompanies, deptProjects),
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
