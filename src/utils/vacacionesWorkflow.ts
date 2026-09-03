/**
 * Flujo de la Solicitud de Vacaciones (GTH-018-F) en el frontend. Espeja la máquina de
 * estados del backend (vacaciones-workflow.ts).
 *
 * Los cuatro pasos son los cuatro recuadros del bloque "APROBACIÓN" del propio papel:
 * la firma del empleado, el Vo.Bo. del jefe inmediato, el Vo.Bo. de Talento Humano y la
 * fecha de aprobación que estampa Gerencia.
 *
 * Quien da el Vo.Bo. del jefe inmediato no es un rol fijo sino el autorizador del
 * solicitante en la tabla de autorizaciones, igual que en el permiso: el botón se le
 * ofrece a quien no sea el creador y el backend valida que de verdad sea su autorizador.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */
import { sumarDiasHabiles, diasHabilesEntre } from './juridicaWorkflow';
import { esRolPmo } from './rolesPmo';
import { claseAnulacion, esAnulado, etiquetaAnulacion } from './anulacionWorkflow';

export type VacacionesEstado =
  | 'borrador'
  | 'pendiente_jefe'
  | 'pendiente_talento_humano'
  | 'pendiente_gerencia'
  | 'aprobado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const VACACIONES_ESTADOS: Record<VacacionesEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_jefe: { label: 'Pendiente de Vo.Bo. del jefe inmediato', sla: 2, tone: 'amber' },
  pendiente_talento_humano: { label: 'Pendiente de Vo.Bo. de Talento Humano', sla: 2, tone: 'blue' },
  pendiente_gerencia: { label: 'Pendiente de aprobación de Gerencia', sla: 1, tone: 'violet' },
  aprobado: { label: 'Aprobada', sla: null, tone: 'green' },
};

/** Quien da el Vo.Bo. de Talento Humano (tercer recuadro del papel). */
const ROL_TALENTO_HUMANO = 'Coordinador Talento Humano';
const ROL_GERENCIA = 'Gerencia';

export interface VacacionesTransicion {
  accion: string;
  from: VacacionesEstado;
  to: VacacionesEstado;
  roles: string[];
  soloCreador?: boolean;
  /** El autorizador del creador (su jefe). Se ofrece a quien no es el creador. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const VACACIONES_TRANSICIONES: VacacionesTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_jefe', roles: [], soloCreador: true, label: 'Firmar y enviar a aprobación', tone: 'primary' },
  { accion: 'aprobar_jefe', from: 'pendiente_jefe', to: 'pendiente_talento_humano', roles: [], jefeAutorizador: true, label: 'Dar Vo.Bo. y enviar a Talento Humano', tone: 'primary' },
  { accion: 'rechazar_jefe', from: 'pendiente_jefe', to: 'borrador', roles: [], jefeAutorizador: true, requiereMotivo: true, label: 'Devolver al empleado', tone: 'danger' },
  { accion: 'aprobar_th', from: 'pendiente_talento_humano', to: 'pendiente_gerencia', roles: [ROL_TALENTO_HUMANO], label: 'Dar Vo.Bo. y enviar a Gerencia', tone: 'primary' },
  { accion: 'rechazar_th', from: 'pendiente_talento_humano', to: 'borrador', roles: [ROL_TALENTO_HUMANO], requiereMotivo: true, label: 'Devolver al empleado', tone: 'danger' },
  { accion: 'aprobar_gerencia', from: 'pendiente_gerencia', to: 'aprobado', roles: [ROL_GERENCIA], label: 'Aprobar las vacaciones', tone: 'primary' },
  { accion: 'rechazar_gerencia', from: 'pendiente_gerencia', to: 'borrador', roles: [ROL_GERENCIA], requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre la solicitud en cierto estado. */
export function accionesDisponibles(
  estado: VacacionesEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): VacacionesTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return VACACIONES_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.jefeAutorizador) return !esCreador; // el backend valida que sea el autorizador
    if (t.soloCreador) return esCreador;
    return t.roles.includes(rol);
  });
}

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  diasHabiles: number;
  restantes: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: VacacionesEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = VACACIONES_ESTADOS[estado]?.sla;
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


/**
 * La etiqueta y el distintivo cubren también los estados de anulación, que no son de
 * este flujo sino transversales a los cuatro formatos de Talento Humano.
 * @see anulacionWorkflow
 */
export const estadoLabel = (estado: string) =>
  VACACIONES_ESTADOS[estado as VacacionesEstado]?.label ?? etiquetaAnulacion(estado) ?? estado;
export const estadoBadgeClass = (estado: string) =>
  claseAnulacion(estado) ?? TONE_CLASSES[VACACIONES_ESTADOS[estado as VacacionesEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
/** Terminal: no queda nada por hacer. Una anulada tampoco admite más pasos. */
export const esTerminal = (estado: string) => estado === 'aprobado' || esAnulado(estado);
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';
