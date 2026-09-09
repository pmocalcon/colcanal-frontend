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

/**
 * Los directores de proyecto, uno por regional.
 *
 * Van escritos completos porque en la base no existe ningún rol llamado «Director de
 * Proyecto» a secas: son cuatro, cada uno con su regional al final.
 */
export const ROLES_DIRECTOR_PROYECTO: readonly string[] = [
  'Director de Proyecto Antioquia',
  'Director de Proyecto Putumayo',
  'Director de Proyecto Quindío',
  'Director de Proyecto Valle',
];

export const esDirectorProyecto = (nombreRol?: string | null): boolean =>
  ROLES_DIRECTOR_PROYECTO.includes((nombreRol ?? '').trim());

/**
 * Quién ve el módulo de Recurso Económico: solo el PMO.
 *
 * Es el módulo donde se define cuánto vale la interventoría de cada municipio y qué
 * retenciones se le aplican. Eso lo lleva el PMO y no se consulta desde otras áreas, así
 * que la tarjeta no se le pinta a nadie más —ni siquiera apagada: una tarjeta con candado
 * invita a pedir un permiso que no existe—.
 */
export const puedeVerRecursoEconomico = (nombreRol?: string | null): boolean =>
  esRolPmo(nombreRol);

/**
 * Quién entra a contrastar la factura contra lo asentado.
 *
 * Es a propósito más ancho que `puedeVerRecursoEconomico`: el director de proyecto **no
 * ve el módulo** —no diligencia facturas ni toca la interventoría—, pero es quien tiene
 * la factura del municipio en la mano, así que entra a esa pantalla por una tarjeta
 * propia del tablero.
 *
 * Antes se llamaba `puedeValidarFactura` y abría la pantalla de diligenciar, donde el
 * director confirmaba el valor pago. Ese visto bueno ya no existe; contrastar es lo que
 * quedó en su lugar, y no escribe nada.
 *
 * Sigue siendo espejo de `ROLES_FACTURA` en el backend, que es quien autoriza de verdad
 * la lectura del módulo y que además le tiene cerrado el `PUT` del bloque completo.
 */
export const puedeContrastarFactura = (nombreRol?: string | null): boolean =>
  esRolPmo(nombreRol) || esDirectorProyecto(nombreRol);
