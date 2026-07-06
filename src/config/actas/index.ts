import type { ActaConfig } from './types';
import { guacariConfig } from './guacari';
import { circasiaConfig } from './circasia';
import { cerritoConfig } from './cerrito';
import { quimbayaConfig } from './quimbaya';
import { jericoConfig } from './jerico';
import { ciudadBolivarConfig } from './ciudadbolivar';
import { pueblorricoConfig } from './pueblorrico';
import { tarsoConfig } from './tarso';

// Clave compuesta "companyId:projectId" — usar cuando un companyId se comparte entre proyectos.
// Clave simple "companyId:" — para UTAPs con companyId único por municipio.
const registry = new Map<string, ActaConfig>([
  ['1:2',  ciudadBolivarConfig], // Canales & Contactos, proyecto Ciudad Bolívar
  ['14:',  jericoConfig],        // Canales & Contactos, proyecto Jericó
  ['1:4',  pueblorricoConfig],   // Canales & Contactos, proyecto Pueblorrico
  ['1:5',  tarsoConfig],          // Canales & Contactos, proyecto Tarso
  ['4:',   guacariConfig],
  ['3:',   circasiaConfig],
  ['2:',   cerritoConfig],
  ['7:',   quimbayaConfig],
]);

export function getActaConfig(companyId?: number, projectId?: number): ActaConfig {
  if (companyId !== undefined) {
    const compound = `${companyId}:${projectId ?? ''}`;
    if (registry.has(compound)) return registry.get(compound)!;
    const simple = `${companyId}:`;
    if (registry.has(simple)) return registry.get(simple)!;
  }
  return guacariConfig;
}

export type { ActaConfig };
export type { ActaDocFields, Clausula } from './types';
