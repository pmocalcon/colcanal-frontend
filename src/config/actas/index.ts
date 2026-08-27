import type { ActaConfig } from './types';
import { guacariConfig } from './guacari';
import { circasiaConfig } from './circasia';
import { cerritoConfig } from './cerrito';
import { quimbayaConfig } from './quimbaya';
import { jericoConfig } from './jerico';
import { ciudadBolivarConfig } from './ciudadbolivar';
import { pueblorricoConfig } from './pueblorrico';
import { tarsoConfig } from './tarso';
import { santabarbaraConfig } from './santabarbara';
import { puertoasisConfig } from './puertoasis';

// Clave compuesta "companyId:projectId" — usar cuando un companyId se comparte entre proyectos.
// Clave simple "companyId:" — para UTAPs con companyId único por municipio.
const registry = new Map<string, ActaConfig>([
  ['1:2',  ciudadBolivarConfig], // Canales & Contactos, proyecto Ciudad Bolívar
  ['1:4',  pueblorricoConfig],   // Canales & Contactos, proyecto Pueblorrico
  ['1:5',  tarsoConfig],         // Canales & Contactos, proyecto Tarso
  ['14:',  jericoConfig],        // UT Alumbrado Público Jericó (empresa propia, sin proyecto)
  ['4:',   guacariConfig],
  ['3:',   circasiaConfig],
  ['2:',   cerritoConfig],
  ['7:',   quimbayaConfig],
  ['8:',   santabarbaraConfig], // UT Alumbrado Público Santa Bárbara
  ['6:',   puertoasisConfig],   // UT Alumbrado Público Puerto Asís (contratante EAAAP E.S.P.)
]);

/**
 * ¿El registro tiene una configuración propia para esta empresa?
 *
 * `getActaConfig` siempre devuelve algo —cae en Guacarí— y eso está bien para el Acta de
 * Obra, que se abre desde una obra que ya existe. No sirve donde el respaldo sería una
 * afirmación falsa: un escrito judicial con el membrete del municipio equivocado.
 */
export function hasActaConfig(companyId?: number, projectId?: number): boolean {
  if (companyId === undefined) return false;
  return registry.has(`${companyId}:${projectId ?? ''}`) || registry.has(`${companyId}:`);
}

export function getActaConfig(companyId?: number, projectId?: number): ActaConfig {
  if (companyId !== undefined) {
    const compound = `${companyId}:${projectId ?? ''}`;
    if (registry.has(compound)) return registry.get(compound)!;
    const simple = `${companyId}:`;
    if (registry.has(simple)) return registry.get(simple)!;
  }
  return guacariConfig;
}

/**
 * El dato de la contratista que **todas** las configuraciones de esa empresa comparten.
 *
 * Una empresa puede estar registrada varias veces, una por proyecto: Canales & Contactos
 * aparece en Ciudad Bolívar, Pueblorrico y Tarso. El NIT es el mismo en las tres —es la
 * misma persona jurídica— pero la sede no, y de ahí la regla: se devuelve el valor solo si
 * las configuraciones coinciden. Donde discrepan no hay un dato «de la empresa» que
 * devolver, y quien lo pida debe preguntarlo.
 *
 * `getActaConfig` no sirve para esto porque cae en Guacarí cuando no conoce la clave: para
 * una empresa sin registro propio devolvería, muy convencido, el NIT de otra UTAP.
 */
export function datoContratista(
  companyId: number | undefined,
  campo: 'conNit' | 'conEmpresa' | 'conDireccion',
): string | undefined {
  if (companyId === undefined) return undefined;
  const valores = new Set<string>();
  for (const [clave, cfg] of registry) {
    if (clave.slice(0, clave.indexOf(':')) !== String(companyId)) continue;
    const v = cfg.docFields[campo];
    if (v) valores.add(v);
  }
  return valores.size === 1 ? [...valores][0] : undefined;
}

export type { ActaConfig };
export type { ActaDocFields, Clausula } from './types';
