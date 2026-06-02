import type { ActaConfig } from './types';
import { guacariConfig } from './guacari';
import { circasiaConfig } from './circasia';
import { cerritoConfig } from './cerrito';
import { quimbayaConfig } from './quimbaya';

// Agregar cada municipio aquí: [companyId, config]
// El companyId se encuentra en la tabla companies de la base de datos.
const registry = new Map<number, ActaConfig>([
  [4, guacariConfig],
  [3, circasiaConfig],
  [2, cerritoConfig],
  [7, quimbayaConfig],
]);

export function getActaConfig(companyId?: number): ActaConfig {
  if (companyId !== undefined && registry.has(companyId)) {
    return registry.get(companyId)!;
  }
  return guacariConfig;
}

export type { ActaConfig };
export type { ActaDocFields, Clausula } from './types';
