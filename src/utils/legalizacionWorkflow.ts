/**
 * Flujo de la Legalización de anticipos (GCT-006-F) en el frontend: metadatos de
 * estados, acciones disponibles por rol/estado y SLA en días hábiles. Espeja la
 * máquina de estados del backend (legalizacion-workflow.ts).
 *
 * El paso "aprueba el jefe" lo hace el autorizador del creador (como en el anticipo
 * y en Compras). Como es dinámico, el botón se ofrece a quien no es el creador y el
 * backend valida que realmente sea su autorizador.
 *
 * Excepción (igual que en el anticipo): si el creador es un **Director de Área**, ese
 * paso lo aprueba la **Gerencia** (Dra. Gloria).
 */
import { sumarDiasHabiles } from './juridicaWorkflow';

export type LegalizacionEstado =
  | 'borrador'
  | 'pendiente_aprobacion_jefe'
  | 'pendiente_contabilidad'
  | 'causada';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const LEGALIZACION_ESTADOS: Record<LegalizacionEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: 3, tone: 'gray' },
  pendiente_aprobacion_jefe: {
    label: 'Pendiente de aprobación del jefe (valida recibos y valores)',
    sla: 1,
    tone: 'amber',
  },
  pendiente_contabilidad: { label: 'Entregada a Contabilidad', sla: 2, tone: 'blue' },
  causada: { label: 'Causada (legalización cerrada)', sla: null, tone: 'green' },
};

const ROLES_CONTABILIDAD = ['Contabilidad'];
const ROL_PMO = 'Analista PMO';

/** Plazo máximo para legalizar: 3 días calendario tras finalizar la actividad. */
export const LEGALIZACION_PLAZO_DIAS = 3;
/** La legalización se recibe dentro de los 5 primeros días del mes (informativo). */
export const LEGALIZACION_CORTE_DIA_MES = 5;

export interface LegalizacionTransicion {
  accion: string;
  from: LegalizacionEstado;
  to: LegalizacionEstado;
  roles: string[];
  soloCreador?: boolean;
  /** El autorizador del creador (su jefe). Se ofrece a quien no es el creador. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const LEGALIZACION_TRANSICIONES: LegalizacionTransicion[] = [
  // Un Director de Área salta el paso del jefe (lo resuelve el backend).
  { accion: 'enviar', from: 'borrador', to: 'pendiente_aprobacion_jefe', roles: [], soloCreador: true, label: 'Enviar a aprobación', tone: 'primary' },
  { accion: 'aprobar_jefe', from: 'pendiente_aprobacion_jefe', to: 'pendiente_contabilidad', roles: [], jefeAutorizador: true, label: 'Recibos y valores validados · entregar a Contabilidad', tone: 'primary' },
  { accion: 'rechazar_jefe', from: 'pendiente_aprobacion_jefe', to: 'borrador', roles: [], jefeAutorizador: true, requiereMotivo: true, label: 'Devolver (recibos o valores incorrectos)', tone: 'danger' },
  { accion: 'causar', from: 'pendiente_contabilidad', to: 'causada', roles: ROLES_CONTABILIDAD, label: 'Causar y cerrar la legalización', tone: 'primary' },
  { accion: 'devolver_contabilidad', from: 'pendiente_contabilidad', to: 'borrador', roles: ROLES_CONTABILIDAD, requiereMotivo: true, label: 'Devolver (falta soporte o registro adecuado)', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre la legalización. */
export function accionesDisponibles(
  estado: LegalizacionEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): LegalizacionTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = rol === ROL_PMO;
  return LEGALIZACION_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.soloCreador) return esCreador;
    if (t.jefeAutorizador) return !esCreador; // el backend valida que sea el autorizador
    return t.roles.includes(rol);
  });
}

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  diasHabiles: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: LegalizacionEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = LEGALIZACION_ESTADOS[estado]?.sla;
  if (!sla || !estadoDesde) return null;
  const vence = sumarDiasHabiles(new Date(estadoDesde), sla);
  vence.setHours(23, 59, 59, 999);
  return { vence, vencida: new Date() > vence, diasHabiles: sla };
}

const TONE_CLASSES: Record<EstadoMeta['tone'], string> = {
  gray: 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-green-100 text-green-800',
};

export const estadoLabel = (estado: string) =>
  LEGALIZACION_ESTADOS[estado as LegalizacionEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[LEGALIZACION_ESTADOS[estado as LegalizacionEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'causada';
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';

/** True si hoy ya pasó el corte de los 5 primeros días del mes. */
export const fueraDeCorte = (d: Date = new Date()) => d.getDate() > LEGALIZACION_CORTE_DIA_MES;
