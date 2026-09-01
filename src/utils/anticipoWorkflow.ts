/**
 * Flujo de la Solicitud de Anticipo (GF-005-F) en el frontend: metadatos de estados,
 * acciones disponibles por rol/estado, y SLA en días hábiles. Espeja la máquina de
 * estados del backend (anticipo-workflow.ts).
 *
 * El paso "Aprueba Jefe" lo hace el autorizador del solicitante (su jefe, como en
 * Compras). Como es dinámico, el botón se ofrece a quien no es el creador y el backend
 * valida que realmente sea el autorizador.
 *
 * Excepción: si quien solicita es un **Director de Área**, ese paso lo aprueba la
 * **Gerencia** (Dra. Gloria), porque su jefe inmediato es ella. Lo resuelve el backend
 * (`puedeAprobarComoJefe`); aquí el botón ya le aparece por no ser la creadora.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */
import { sumarDiasHabiles, diasHabilesEntre } from './juridicaWorkflow';
import { esRolPmo } from './rolesPmo';

export type AnticipoEstado =
  | 'borrador'
  | 'pendiente_aprobacion_jefe'
  | 'pendiente_aprobacion_gp'
  | 'pendiente_aprobacion_gerencia'
  | 'pendiente_pago'
  | 'pagado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const ANTICIPO_ESTADOS: Record<AnticipoEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_aprobacion_jefe: { label: 'Pendiente de aprobación del jefe', sla: 1, tone: 'amber' },
  pendiente_aprobacion_gp: { label: 'Pendiente de aprobación (Gerencia de Proyectos)', sla: 1, tone: 'amber' },
  pendiente_aprobacion_gerencia: { label: 'Pendiente de aprobación de Gerencia (Dra. Gloria)', sla: 1, tone: 'amber' },
  pendiente_pago: { label: 'Entrega y pago (Tesorería)', sla: 1, tone: 'blue' },
  pagado: { label: 'Pagado', sla: null, tone: 'green' },
};

const ROLES_GERENCIA_PROYECTOS = ['Gerencia de Proyectos']; // Lorena
const ROLES_GERENCIA = ['Gerencia']; // Dra. Gloria
const ROLES_TESORERIA = ['Compras']; // Aurora (su rol en el sistema es Compras)

export interface AnticipoTransicion {
  accion: string;
  from: AnticipoEstado;
  to: AnticipoEstado;
  roles: string[];
  soloCreador?: boolean;
  /** El autorizador del creador (su jefe). Se ofrece a quien no es el creador. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const ANTICIPO_TRANSICIONES: AnticipoTransicion[] = [
  // Un Director de Área salta el paso del jefe (lo resuelve el backend), por eso el
  // rótulo no promete a quién llega.
  { accion: 'enviar', from: 'borrador', to: 'pendiente_aprobacion_jefe', roles: [], soloCreador: true, label: 'Enviar a aprobación', tone: 'primary' },
  { accion: 'aprobar_jefe', from: 'pendiente_aprobacion_jefe', to: 'pendiente_aprobacion_gp', roles: [], jefeAutorizador: true, label: 'Aprobar y enviar a Gerencia de Proyectos', tone: 'primary' },
  { accion: 'rechazar_jefe', from: 'pendiente_aprobacion_jefe', to: 'borrador', roles: [], jefeAutorizador: true, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
  { accion: 'aprobar_gp', from: 'pendiente_aprobacion_gp', to: 'pendiente_aprobacion_gerencia', roles: ROLES_GERENCIA_PROYECTOS, label: 'Aprobar y enviar a Gerencia', tone: 'primary' },
  { accion: 'rechazar_gp', from: 'pendiente_aprobacion_gp', to: 'borrador', roles: ROLES_GERENCIA_PROYECTOS, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
  { accion: 'aprobar_gerencia', from: 'pendiente_aprobacion_gerencia', to: 'pendiente_pago', roles: ROLES_GERENCIA, label: 'Aprobar y remitir a Tesorería', tone: 'primary' },
  { accion: 'rechazar_gerencia', from: 'pendiente_aprobacion_gerencia', to: 'borrador', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
  { accion: 'registrar_pago', from: 'pendiente_pago', to: 'pagado', roles: ROLES_TESORERIA, label: 'Registrar pago y finalizar', tone: 'primary' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre un anticipo en cierto estado. */
export function accionesDisponibles(
  estado: AnticipoEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): AnticipoTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return ANTICIPO_TRANSICIONES.filter((t) => {
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
  /** El plazo del estado: cuántos días hábiles se dieron. */
  diasHabiles: number;
  /** Cuántos faltan desde hoy. Negativo si ya se pasó. */
  restantes: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: AnticipoEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = ANTICIPO_ESTADOS[estado]?.sla;
  if (!sla || !estadoDesde) return null;
  const vence = sumarDiasHabiles(new Date(estadoDesde), sla);
  vence.setHours(23, 59, 59, 999);
  const ahora = new Date();
  return {
    vence,
    vencida: ahora > vence,
    diasHabiles: sla,
    restantes: diasHabilesEntre(ahora, vence),
  };
}

const TONE_CLASSES: Record<EstadoMeta['tone'], string> = {
  gray: 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-green-100 text-green-800',
};

export const estadoLabel = (estado: string) => ANTICIPO_ESTADOS[estado as AnticipoEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[ANTICIPO_ESTADOS[estado as AnticipoEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'pagado';
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';
