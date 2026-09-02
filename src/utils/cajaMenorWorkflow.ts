/**
 * Flujo del Reembolso de Caja Menor (GF-007-F) en el frontend. Espeja la máquina de
 * estados del backend (caja-menor-workflow.ts).
 *
 * Es el bloque de firmas del propio formato, en orden, y después el circuito de pago:
 *   quien elabora → Director de Proyecto → Gerente de Proyecto → Contabilidad (causa)
 *   → Tesorería (repone la caja).
 *
 * La primera firma no lleva rol fijo. La hoja dice «AUXILIAR ADMINISTRATIVO», pero el
 * formato también lo diligencian PQRS y la Coordinadora Financiera, así que el paso va
 * por `soloCreador` y el impreso muestra el cargo real de quien lo elaboró.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */

import { esRolPmo } from './rolesPmo';

export type CajaMenorEstado =
  | 'borrador'
  | 'pendiente_director'
  | 'pendiente_gerente'
  | 'pendiente_contabilidad'
  | 'pendiente_pago'
  | 'pagado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const CAJA_MENOR_ESTADOS: Record<CajaMenorEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_director: {
    label: 'Pendiente de firma del Director de Proyecto',
    sla: null,
    tone: 'amber',
  },
  pendiente_gerente: {
    label: 'Pendiente de firma del Gerente de Proyecto',
    sla: null,
    tone: 'violet',
  },
  pendiente_contabilidad: { label: 'Entregado a Contabilidad', sla: null, tone: 'blue' },
  pendiente_pago: { label: 'Causado · pendiente de pago (Tesorería)', sla: null, tone: 'amber' },
  pagado: { label: 'Pagado (caja repuesta)', sla: null, tone: 'green' },
};

const ROLES_CONTABILIDAD = ['Contabilidad'];
/**
 * Quien repone la caja es Aurora, cuyo rol en el sistema es «Compras» y no
 * «Coordinador Financiero»: el paso de pago se enruta a ese rol, igual que en el
 * anticipo (GF-005-F).
 */
const ROLES_TESORERIA = ['Compras'];
/** El «Gerente de Proyecto» del pie de firmas es la Gerencia de Proyectos. */
const ROLES_GERENTE = ['Gerencia de Proyectos'];
/**
 * Los cuatro directores de proyecto van con su regional al final: en la base no
 * existe ningún rol llamado «Director de Proyecto» a secas.
 */
const ROLES_DIRECTOR = [
  'Director de Proyecto Antioquia',
  'Director de Proyecto Putumayo',
  'Director de Proyecto Quindío',
  'Director de Proyecto Valle',
];

export interface CajaMenorTransicion {
  accion: string;
  from: CajaMenorEstado;
  to: CajaMenorEstado;
  roles: string[];
  soloCreador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const CAJA_MENOR_TRANSICIONES: CajaMenorTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_director', roles: [], soloCreador: true, label: 'Enviar a firma del Director de Proyecto', tone: 'primary' },
  { accion: 'aprobar_director', from: 'pendiente_director', to: 'pendiente_gerente', roles: ROLES_DIRECTOR, label: 'Firmar y enviar al Gerente de Proyecto', tone: 'primary' },
  { accion: 'devolver_director', from: 'pendiente_director', to: 'borrador', roles: ROLES_DIRECTOR, requiereMotivo: true, label: 'Devolver (facturas o valores incorrectos)', tone: 'danger' },
  { accion: 'aprobar_gerente', from: 'pendiente_gerente', to: 'pendiente_contabilidad', roles: ROLES_GERENTE, label: 'Firmar y entregar a Contabilidad', tone: 'primary' },
  { accion: 'devolver_gerente', from: 'pendiente_gerente', to: 'borrador', roles: ROLES_GERENTE, requiereMotivo: true, label: 'Devolver (facturas o valores incorrectos)', tone: 'danger' },
  { accion: 'causar', from: 'pendiente_contabilidad', to: 'pendiente_pago', roles: ROLES_CONTABILIDAD, label: 'Causar y remitir a pagos', tone: 'primary' },
  { accion: 'registrar_pago', from: 'pendiente_pago', to: 'pagado', roles: ROLES_TESORERIA, label: 'Registrar el pago y reponer la caja', tone: 'primary' },
  { accion: 'devolver_contabilidad', from: 'pendiente_contabilidad', to: 'borrador', roles: ROLES_CONTABILIDAD, requiereMotivo: true, label: 'Devolver (falta soporte o registro adecuado)', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre el reembolso. */
export function accionesDisponibles(
  estado: CajaMenorEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): CajaMenorTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return CAJA_MENOR_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.soloCreador) return esCreador;
    return t.roles.includes(rol);
  });
}

const TONE_CLASSES: Record<EstadoMeta['tone'], string> = {
  gray: 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-green-100 text-green-800',
};

export const estadoLabel = (estado: string) =>
  CAJA_MENOR_ESTADOS[estado as CajaMenorEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[CAJA_MENOR_ESTADOS[estado as CajaMenorEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'pagado';
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';

// ---------------------------------------------------------------------------
// Arqueo de la caja
// ---------------------------------------------------------------------------

/** Un renglón de la tabla del formato. */
export interface ItemCajaMenor {
  fecha: string;
  factura: string;
  ccNit: string;
  beneficiario: string;
  detalle: string;
  obra: string;
  valor: string;
}

export interface ArqueoCaja {
  /** Suma de la columna VALOR. Es el TOTAL REEMBOLSO. */
  facturas: number;
  /** Vales provisionales por legalizar. */
  anticipos: number;
  /** Lo que debería quedar físicamente en la caja. Puede ser negativo. */
  saldoEfectivo: number;
  /** True si se gastó por encima del monto fijo. Informativo: no bloquea nada. */
  excedido: boolean;
}

export const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * El recuadro del formato es un arqueo, no cuatro casillas sueltas:
 *
 *   Monto fijo = Facturas y recibos + Anticipos por legalizar + Saldo en efectivo
 *
 * «Facturas y recibos» es la suma de la tabla y «Saldo en efectivo» sale despejando,
 * así que ninguno de los dos se digita. El saldo puede dar negativo —se gastó por
 * encima del monto fijo, que en la práctica ocurre— y eso no impide firmar ni enviar.
 */
export function calcularArqueo(montoFijo: unknown, anticipos: unknown, items: ItemCajaMenor[]): ArqueoCaja {
  const facturas = items.reduce((s, it) => s + num(it.valor), 0);
  const ant = num(anticipos);
  const saldoEfectivo = num(montoFijo) - facturas - ant;
  return { facturas, anticipos: ant, saldoEfectivo, excedido: saldoEfectivo < 0 };
}
