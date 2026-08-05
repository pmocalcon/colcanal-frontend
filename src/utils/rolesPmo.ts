/**
 * El PMO es el comodín transversal del sistema: puede ejecutar cualquier paso
 * de un flujo sin importar a qué área le corresponda. El Director y el Analista
 * tienen exactamente el mismo alcance, así que los flujos preguntan por el
 * grupo y no por un nombre suelto.
 *
 * Espejo de `ROLES_PMO` en el backend (`common/constants/roles.constants.ts`):
 * acá solo decide qué botones se pintan, la autorización real la hace el backend.
 */
export const ROLES_PMO: readonly string[] = ['Analista PMO', 'Director PMO'];

export const esRolPmo = (nombreRol?: string | null): boolean =>
  ROLES_PMO.includes((nombreRol ?? '').trim());
