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
import { claseAnulacion, esAnulado, etiquetaAnulacion } from './anulacionWorkflow';

/** Quien revisa antes que el jefe: la Dirección Administrativa y Financiera. */
const ROL_ADMINISTRATIVA = 'Director Financiero y Administrativo';

export type PermisoEstado =
  | 'borrador'
  | 'pendiente_administrativa'
  | 'pendiente_jefe'
  | 'aprobado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'green';
}

export const PERMISO_ESTADOS: Record<PermisoEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_administrativa: {
    label: 'Pendiente de revisión de la Dir. Administrativa y Financiera',
    sla: 1,
    tone: 'blue',
  },
  pendiente_jefe: { label: 'Pendiente de aprobación del jefe de área', sla: 1, tone: 'amber' },
  aprobado: { label: 'Aprobado', sla: null, tone: 'green' },
};

export interface PermisoTransicion {
  accion: string;
  from: PermisoEstado;
  to: PermisoEstado;
  /** Roles autorizados. Vacío en los pasos que resuelve el jefe del solicitante. */
  roles?: string[];
  soloCreador?: boolean;
  /** El autorizador del creador (su jefe). Se ofrece a quien no es el creador. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const PERMISO_TRANSICIONES: PermisoTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_administrativa', soloCreador: true, label: 'Enviar a revisión', tone: 'primary' },
  { accion: 'revisar_administrativa', from: 'pendiente_administrativa', to: 'pendiente_jefe', roles: [ROL_ADMINISTRATIVA], label: 'Revisar y enviar al jefe inmediato', tone: 'primary' },
  { accion: 'devolver_administrativa', from: 'pendiente_administrativa', to: 'borrador', roles: [ROL_ADMINISTRATIVA], requiereMotivo: true, label: 'Devolver al empleado', tone: 'danger' },
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
    return (t.roles ?? []).includes(nombreRol ?? '');
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
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
};


/**
 * La etiqueta y el distintivo cubren también los estados de anulación, que no son de
 * este flujo sino transversales a los cuatro formatos de Talento Humano.
 * @see anulacionWorkflow
 */
export const estadoLabel = (estado: string) =>
  PERMISO_ESTADOS[estado as PermisoEstado]?.label ?? etiquetaAnulacion(estado) ?? estado;
export const estadoBadgeClass = (estado: string) =>
  claseAnulacion(estado) ?? TONE_CLASSES[PERMISO_ESTADOS[estado as PermisoEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
/** Terminal: no queda nada por hacer. Una anulada tampoco admite más pasos. */
export const esTerminal = (estado: string) => estado === 'aprobado' || esAnulado(estado);

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
