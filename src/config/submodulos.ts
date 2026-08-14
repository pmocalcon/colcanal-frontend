import type { Module, ModulePermissions } from '@/services/modules.service';

/**
 * Los submódulos de Compras y de Obras: qué son, a dónde llevan y quién puede abrirlos.
 *
 * Vive aparte porque lo usan dos sitios que tienen que decir lo mismo: la portada del
 * módulo, que los pinta como tarjetas, y la barra lateral, que los despliega para saltar
 * entre ellos sin volver atrás. Con una copia en cada uno, la barra acabaría ofreciendo
 * enlaces que al abrirlos dicen «no tiene permisos» —o escondiendo alguno que sí—, y no
 * habría forma de saber cuál de las dos tiene razón.
 */

export interface SubModulo {
  slug: string;
  nombre: string;
  icono: string;
  /** A dónde lleva. Antes vivía en un switch dentro de cada portada. */
  to: string;
}

/* ── Compras ─────────────────────────────────────────────────────────── */

export const SUBMODULOS_COMPRAS: SubModulo[] = [
  { slug: 'requisiciones', nombre: 'Requisiciones', icono: 'FileText', to: '/dashboard/compras/requisiciones' },
  { slug: 'revision', nombre: 'Revisión', icono: 'ClipboardCheck', to: '/dashboard/compras/requisiciones/revisar' },
  { slug: 'autorizacion', nombre: 'Autorización', icono: 'Shield', to: '/dashboard/compras/requisiciones/autorizar' },
  // Revisión y Aprobación comparten pantalla: la misma lista, con acciones distintas
  // según el permiso. Así estaba antes en la portada y no se cambia aquí.
  { slug: 'aprobacion', nombre: 'Aprobar Requisiciones', icono: 'CheckCircle2', to: '/dashboard/compras/requisiciones/revisar' },
  { slug: 'cotizaciones', nombre: 'Cotizaciones', icono: 'DollarSign', to: '/dashboard/compras/cotizaciones' },
  { slug: 'ordenes-compra', nombre: 'Órdenes de Compra', icono: 'ShoppingBag', to: '/dashboard/compras/ordenes' },
  { slug: 'aprobacion-ordenes', nombre: 'Aprobar Órdenes de Compra', icono: 'CheckCheck', to: '/dashboard/compras/ordenes-compra/aprobar' },
  { slug: 'recepciones', nombre: 'Recepciones', icono: 'PackageCheck', to: '/dashboard/compras/recepciones' },
  { slug: 'facturas', nombre: 'Gestión de Facturas', icono: 'FileText', to: '/dashboard/compras/facturas' },
  { slug: 'recepcion-contabilidad', nombre: 'Recepción Contabilidad', icono: 'Calculator', to: '/dashboard/compras/recepcion-contabilidad' },
  { slug: 'proveedores', nombre: 'Proveedores', icono: 'Building2', to: '/dashboard/proveedores' },
  { slug: 'materiales', nombre: 'Materiales', icono: 'Package', to: '/dashboard/materiales' },
  { slug: 'auditorias', nombre: 'Auditorías', icono: 'ClipboardList', to: '/dashboard/auditorias' },
];

/** Los que no son de Compras: se muestran dentro pero son módulos con permiso propio. */
const AJENOS_A_COMPRAS = new Set(['proveedores', 'materiales', 'auditorias']);

/**
 * Quién puede abrir cada submódulo de Compras.
 *
 *   Requisiciones y Recepciones → crear (quien pide también recibe)
 *   Revisión → revisar · Autorización → autorizar
 *   Aprobar requisiciones y órdenes → aprobar
 *   Cotizaciones, órdenes y facturas → cotizar
 *   Recepción Contabilidad → solo el rol Contabilidad
 */
export const accesoCompras = (
  slug: string,
  permisos: ModulePermissions | null | undefined,
  rol: string | undefined,
  modules: Module[],
): boolean => {
  if (AJENOS_A_COMPRAS.has(slug)) {
    // `inventarios` es el slug viejo de materiales en el backend.
    const slugs = slug === 'materiales' ? [slug, 'inventarios'] : [slug];
    return modules.some((m) => slugs.includes(m.slug) && m.hasAccess === true);
  }
  if (!permisos) return false;
  switch (slug) {
    case 'requisiciones': return permisos.crear === true;
    case 'validacion-obra': return permisos.validar === true;
    case 'revision': return permisos.revisar === true;
    case 'autorizacion': return permisos.autorizar === true;
    case 'aprobacion':
    case 'aprobacion-ordenes': return permisos.aprobar === true;
    case 'cotizaciones':
    case 'ordenes-compra':
    case 'facturas': return permisos.cotizar === true;
    case 'recepciones': return permisos.crear === true;
    case 'recepcion-contabilidad': return rol === 'Contabilidad';
    default: return false;
  }
};

/* ── CREG ────────────────────────────────────────────────────────────── */

/** Submódulo cuyo acceso es un permiso granular y nada más. */
export interface SubModuloConPermiso extends SubModulo {
  permiso: string;
}

/**
 * Los submódulos de CREG. Aquí el acceso no necesita función: cada uno se abre con su
 * permiso granular, sin excepciones por rol.
 *
 * IPP comparte permiso con Parámetros —es una parametrización más, la serie del DANE—
 * y Factura de energía y Flujo de Caja comparten el de Liquidación: los tres son el
 * mismo cálculo visto por partes.
 */
export const SUBMODULOS_CREG: SubModuloConPermiso[] = [
  { slug: 'unidades', nombre: 'Unidades constructivas', icono: 'Boxes', to: '/dashboard/creg/unidades', permiso: 'creg:unidades' },
  { slug: 'resumen', nombre: 'Resumen UCAP', icono: 'Table2', to: '/dashboard/creg/resumen', permiso: 'creg:resumen' },
  { slug: 'parametros', nombre: 'Parámetros', icono: 'SlidersHorizontal', to: '/dashboard/creg/parametros', permiso: 'creg:parametros' },
  { slug: 'ipp', nombre: 'IPP por mes', icono: 'TrendingUp', to: '/dashboard/creg/ipp', permiso: 'creg:parametros' },
  { slug: 'censo', nombre: 'Censo físico', icono: 'ClipboardList', to: '/dashboard/creg/censo', permiso: 'creg:censo' },
  { slug: 'factura-energia', nombre: 'Factura de energía', icono: 'Receipt', to: '/dashboard/creg/factura-energia', permiso: 'creg:liquidacion' },
  { slug: 'idd-off', nombre: 'ID OFF', icono: 'PowerOff', to: '/dashboard/creg/idd-off', permiso: 'creg:iddoff' },
  { slug: 'idd-on', nombre: 'ID ON', icono: 'Power', to: '/dashboard/creg/idd-on', permiso: 'creg:iddon' },
  { slug: 'liquidacion', nombre: 'Liquidación', icono: 'Receipt', to: '/dashboard/creg/liquidacion', permiso: 'creg:liquidacion' },
  { slug: 'flujo-caja', nombre: 'Flujo de Caja', icono: 'LineChart', to: '/dashboard/creg/flujo-caja', permiso: 'creg:liquidacion' },
  // Control de energía se entra solo por acá: ya no es una pestaña del flujo de caja.
  // Por dentro sigue siendo esa pantalla —comparte censo, UCAP y supuestos, y cargarla
  // aparte sería traerlo todo dos veces—, abierta en su vista y sin la tira de pestañas.
  { slug: 'control-energia', nombre: 'Control de energía', icono: 'Zap', to: '/dashboard/creg/flujo-caja?vista=energia', permiso: 'creg:liquidacion' },
];

/* ── Obras ───────────────────────────────────────────────────────────── */

export const SUBMODULOS_OBRAS: SubModulo[] = [
  { slug: 'crear-obra', nombre: 'Nueva Obra', icono: 'Plus', to: '/dashboard/levantamiento-obras/obras/crear' },
  { slug: 'levantamientos', nombre: 'Levantamientos', icono: 'ClipboardList', to: '/dashboard/levantamiento-obras/levantamientos' },
  { slug: 'obras', nombre: 'Obras', icono: 'Building2', to: '/dashboard/levantamiento-obras/obras' },
  { slug: 'presupuesto', nombre: 'Presupuesto', icono: 'Calculator', to: '/dashboard/levantamiento-obras/presupuesto' },
  { slug: 'presupuestos-list', nombre: 'Ver Presupuestos', icono: 'FolderOpen', to: '/dashboard/levantamiento-obras/presupuestos' },
  { slug: 'plan-anual', nombre: 'Plan Anual', icono: 'CalendarDays', to: '/dashboard/levantamiento-obras/plan-anual' },
  { slug: 'cronograma', nombre: 'Cronograma', icono: 'CalendarRange', to: '/dashboard/levantamiento-obras/cronograma' },
];

/** Quién puede abrir cada submódulo de Obras. Corre sobre los permisos granulares. */
export const accesoObras = (
  slug: string,
  tienePermiso: (permiso: string) => boolean,
  rol: string | undefined,
): boolean => {
  const esDirectorTecnico = rol === 'Director Técnico';
  switch (slug) {
    case 'obras': return tienePermiso('levantamientos:obras');
    case 'crear-obra': return tienePermiso('levantamientos:nueva-obra') || esDirectorTecnico;
    case 'levantamientos': return tienePermiso('levantamientos:levantamientos');
    case 'ucaps': return tienePermiso('levantamientos:ucaps');
    case 'presupuesto': return tienePermiso('levantamientos:presupuesto');
    // El Director Técnico elabora presupuestos pero no consulta los guardados.
    case 'presupuestos-list':
      return !esDirectorTecnico
        && (tienePermiso('levantamientos:presupuesto') || tienePermiso('levantamientos:aprobar'));
    case 'plan-anual':
      return tienePermiso('levantamientos:plan-anual') || tienePermiso('levantamientos:autorizar');
    case 'cronograma': return tienePermiso('levantamientos:cronograma');
    default: return false;
  }
};
