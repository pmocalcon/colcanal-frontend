/**
 * Flujo de la Solicitud de Permiso (GTH-009-F) en el frontend. Espeja la máquina de
 * estados del backend (permiso-workflow.ts).
 *
 * Quien aprueba es el **jefe de área** del solicitante, y eso no se sabe por el rol sino
 * por la tabla de autorizaciones: al Analista PMO lo aprueba el Director PMO, al Analista
 * Comercial la Directora Comercial. Como es dinámico, aquí el botón se le ofrece a quien
 * no sea el creador y el backend valida que de verdad sea su autorizador.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */
import { sumarDiasHabiles, diasHabilesEntre } from './juridicaWorkflow';
import { esRolPmo } from './rolesPmo';

export type PermisoEstado = 'borrador' | 'pendiente_jefe' | 'aprobado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'green';
}

export const PERMISO_ESTADOS: Record<PermisoEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_jefe: { label: 'Pendiente de aprobación del jefe de área', sla: 1, tone: 'amber' },
  aprobado: { label: 'Aprobado', sla: null, tone: 'green' },
};

export interface PermisoTransicion {
  accion: string;
  from: PermisoEstado;
  to: PermisoEstado;
  soloCreador?: boolean;
  /** El autorizador del creador (su jefe). Se ofrece a quien no es el creador. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const PERMISO_TRANSICIONES: PermisoTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_jefe', soloCreador: true, label: 'Enviar a aprobación', tone: 'primary' },
  { accion: 'aprobar_jefe', from: 'pendiente_jefe', to: 'aprobado', jefeAutorizador: true, label: 'Aprobar el permiso', tone: 'primary' },
  { accion: 'rechazar_jefe', from: 'pendiente_jefe', to: 'borrador', jefeAutorizador: true, requiereMotivo: true, label: 'Negar el permiso', tone: 'danger' },
];

/** Acciones que el usuario puede ejecutar sobre un permiso en cierto estado. */
export function accionesDisponibles(
  estado: PermisoEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): PermisoTransicion[] {
  const esPmo = esRolPmo(nombreRol ?? '');
  return PERMISO_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.soloCreador) return esCreador;
    if (t.jefeAutorizador) return !esCreador; // el backend valida que sea el autorizador
    return false;
  });
}

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  diasHabiles: number;
  restantes: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: PermisoEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = PERMISO_ESTADOS[estado]?.sla;
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
  green: 'bg-green-100 text-green-800',
};

export const estadoLabel = (estado: string) => PERMISO_ESTADOS[estado as PermisoEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[PERMISO_ESTADOS[estado as PermisoEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'aprobado';

/**
 * El formato tiene dos zonas con dueños distintos, y por eso dos permisos y no uno:
 *
 * - Lo de arriba (proyecto, nombre, motivo, horario…) lo diligencia **el solicitante**,
 *   y solo mientras la solicitud es borrador.
 * - El cuadro «Aprobación interna» lo diligencia **el jefe**, y solo mientras la
 *   solicitud está en su bandeja. El solicitante nunca lo toca.
 */
export const puedeEditarSolicitud = (estado: string | null | undefined) =>
  !estado || estado === 'borrador';

export const puedeEditarAprobacion = (
  estado: string | null | undefined,
  nombreRol: string | undefined,
  esCreador: boolean,
) =>
  estado === 'pendiente_jefe' &&
  accionesDisponibles('pendiente_jefe', nombreRol, esCreador).length > 0;
