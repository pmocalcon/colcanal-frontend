import type { Module } from '@/services/modules.service';

/**
 * Cómo se presentan los módulos del sistema: cuáles se muestran, con qué nombre y en
 * qué orden.
 *
 * Vive aparte porque lo usan dos sitios —el dashboard y la barra lateral— y son la
 * misma lista vista de dos maneras. Duplicado, una pantalla mostraría un módulo que
 * la otra esconde, y nadie sabría cuál de las dos tiene razón.
 */

/** Se muestran dentro de Compras, no como módulo suelto. */
const DENTRO_DE_COMPRAS = ['proveedores', 'materiales', 'inventarios', 'auditorias'];

/**
 * Módulos que el backend devuelve pero que no se muestran.
 *
 * Se ocultan aquí y no quitándoles el permiso en la base: el permiso decide quién
 * puede entrar, esto decide qué se ofrece. Quitarlo de la tabla `gestiones` habría
 * obligado a tocar las tablas de permisos —que tienen las secuencias desalineadas—
 * y dejaría sin acceso a quien todavía llegue por un enlace guardado.
 */
const OCULTOS = ['dashboard'];

/**
 * Módulos que se pintan como tarjeta fija del frontend (Aprobaciones, Gestión del
 * conocimiento, Talento Humano, Recurso Económico) y que además ya existen como
 * gestión en la tabla. Se excluyen de `prepararModulos` para no pintarlos dos veces:
 * su tarjeta la pone el frontend y su acceso lo resuelve `accesoModuloHibrido`.
 */
const FIJOS_HIBRIDOS = [
  'aprobaciones',
  'gestion-conocimiento',
  'talento-humano',
  'recurso-economico',
];

/**
 * Acceso a un módulo fijo. Prefiere la asignación por rol de la tabla `gestiones`
 * (el checklist de administración); si esa gestión todavía no existe en lo que
 * devuelve el backend —p. ej. antes de correr el script que las crea—, cae al
 * gateo por rol de siempre, para que nadie pierda el módulo en el intervalo.
 */
export const accesoModuloHibrido = (
  slug: string,
  modules: Module[],
  gatePorRol: boolean,
): boolean => {
  const m = modules.find((x) => x.slug === slug);
  return m ? m.hasAccess : gatePorRol;
};

/** Orden de presentación. Lo que no está listado va al final. */
const ORDEN = [
  'compras',
  'levantamiento-obras',
  'usuarios',
  'notificaciones',
];

/** Slugs viejos que el backend todavía devuelve. */
const SLUGS: Record<string, string> = {
  inventarios: 'materiales',
  reportes: 'levantamiento-obras',
};

/** Nombres que se muestran distinto a como vienen del backend. */
const NOMBRES: Record<string, string> = {
  'levantamiento-obras': 'Obras',
};

/**
 * Bandeja única de Gerencia. No viene del backend porque no es una gestión con
 * permisos propios: es una vista de lo que ya existe en otros módulos, abierta a
 * Gerencia y al PMO. Crear una gestión en la base solo para esto habría exigido
 * tocar las tablas de permisos —que tienen las secuencias desalineadas— sin ganar
 * nada: no hay nada que graduar, se entra o no se entra.
 *
 * Por eso se pinta con las demás tarjetas fijas del frontend —Gestión del
 * conocimiento, Talento Humano, Recurso Económico— y no dentro de la lista que
 * ordena `prepararModulos`: esas fijas van después de los módulos del backend, y
 * metida en la lista quedaría siempre antes de ellas.
 */
export const APROBACIONES = {
  slug: 'aprobaciones',
  nombre: 'Aprobaciones',
  icono: 'Stamp',
};

const ROLES_APROBACIONES = ['Gerencia', 'Analista PMO', 'Director PMO'];

/**
 * Quién ve la bandeja. Vive aquí —y no en cada pantalla— para que el dashboard y
 * la barra lateral no puedan contradecirse sobre a quién se le muestra.
 */
export const puedeVerAprobaciones = (rol?: string | null): boolean =>
  ROLES_APROBACIONES.includes((rol ?? '').trim());

export const prepararModulos = (modules: Module[]): Module[] =>
  modules
    .map((m) => {
      const slug = SLUGS[m.slug] || m.slug;
      return { ...m, slug, nombre: NOMBRES[slug] || m.nombre };
    })
    .filter(
      (m) =>
        !DENTRO_DE_COMPRAS.includes(m.slug) &&
        !OCULTOS.includes(m.slug) &&
        !FIJOS_HIBRIDOS.includes(m.slug),
    )
    .sort((a, b) => {
      const ia = ORDEN.indexOf(a.slug);
      const ib = ORDEN.indexOf(b.slug);
      return (ia === -1 ? ORDEN.length : ia) - (ib === -1 ? ORDEN.length : ib);
    });

/**
 * Secciones de un módulo, para desplegarlas bajo su entrada cuando se está dentro.
 *
 * Las claves se anidan: al estar en G. jurídica manda `gestion-conocimiento/juridica`,
 * y al estar en la portada del módulo, `gestion-conocimiento`. Gana la más larga que
 * cubra la ruta —ver `seccionesDe`—, así que la barra muestra siempre lo de dentro.
 *
 * Compras y Obras no están: sus secciones se habilitan una por una según los permisos
 * del rol, y esa comprobación vive en sus portadas. Repetirla acá acabaría ofreciendo
 * enlaces que al abrirlos dicen «no tiene permisos». Entran por su portada hasta que
 * ese cálculo se pueda compartir.
 */
export interface Seccion { to: string; label: string }

export const SECCIONES_MODULO: Record<string, Seccion[]> = {
  // Solo las gestiones construidas. Las demás existen en la portada como tarjetas
  // apagadas —para que se vea el mapa completo del sistema de gestión—, pero en la barra
  // serían entradas que no llevan a ninguna parte.
  'recurso-economico': [
    { to: '/dashboard/recurso-economico/parametros', label: 'Parámetros' },
    { to: '/dashboard/recurso-economico/factura', label: 'Factura' },
  ],
  'talento-humano': [
    { to: '/dashboard/talento-humano/personal', label: 'Personal' },
    { to: '/dashboard/talento-humano/prestamos', label: 'Prestamos' },
    { to: '/dashboard/talento-humano/incapacidades', label: 'Incapacidades' },
    { to: '/dashboard/talento-humano/ausentismos', label: 'Ausentismos' },
  ],
  'gestion-conocimiento': [
    { to: '/dashboard/gestion-conocimiento/contable', label: 'G. contable y tributaria' },
    { to: '/dashboard/gestion-conocimiento/juridica', label: 'G. jurídica' },
    { to: '/dashboard/gestion-conocimiento/talento-humano', label: 'G. de talento humano' },
  ],
  'gestion-conocimiento/juridica': [
    { to: '/dashboard/gestion-conocimiento/juridica/contratos', label: 'Trámite de contratación' },
    { to: '/dashboard/gestion-conocimiento/juridica/tutela', label: 'Contestación de tutela' },
    { to: '/dashboard/gestion-conocimiento/juridica/matriz', label: 'Matriz de contratos' },
    { to: '/dashboard/gestion-conocimiento/juridica/nueva', label: 'Nueva solicitud' },
  ],
  'gestion-conocimiento/talento-humano': [
    { to: '/dashboard/gestion-conocimiento/talento-humano/prestamo', label: 'Solicitud de préstamo' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/permiso', label: 'Solicitud de permiso' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/vacaciones', label: 'Solicitud de vacaciones' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/horas-extras', label: 'Horas extras' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/terminacion', label: 'Terminación anticipada' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/otrosi-salarial', label: 'Otrosí de modificación salarial' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/sustitucion-empleador', label: 'Sustitución de empleador' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/peticion-incapacidad', label: 'Derecho de petición — incapacidad' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/constancia-terminacion-sjc', label: 'Constancia de terminación sin justa causa' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/notificacion-terminacion-jc', label: 'Notificación de terminación con justa causa' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/terminacion-periodo-prueba', label: 'Terminación en período de prueba' },
    { to: '/dashboard/gestion-conocimiento/talento-humano/terminacion-anticipada-unilateral', label: 'Terminación anticipada unilateral (prestación)' },
  ],
  'gestion-conocimiento/contable': [
    { to: '/dashboard/gestion-conocimiento/contable/anticipos', label: 'Anticipos' },
    { to: '/dashboard/gestion-conocimiento/contable/legalizaciones', label: 'Legalizaciones' },
    { to: '/dashboard/gestion-conocimiento/contable/cuentas-companias', label: 'Cuentas de compañías' },
  ],
};

/**
 * Las secciones que corresponden a una ruta: la clave más específica que la cubra.
 * Con «la primera que coincida» bastaría con que alguien reordenara el objeto para que
 * dentro de G. jurídica se mostraran las gestiones del módulo en vez de las suyas.
 */
export const seccionesDe = (ruta: string) => {
  const clave = Object.keys(SECCIONES_MODULO)
    .filter((k) => ruta.startsWith(`/dashboard/${k}`))
    .sort((a, b) => b.length - a.length)[0];
  return clave ? SECCIONES_MODULO[clave] : null;
};
