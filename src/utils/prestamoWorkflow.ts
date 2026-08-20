/**
 * Flujo de la Solicitud de Préstamo (GTH-007-F) en el frontend: metadatos de estados,
 * acciones disponibles por rol/estado y SLA en días hábiles. Espeja la máquina de
 * estados del backend (prestamo-workflow.ts).
 *
 * Los pasos son las tres firmas del propio formato: el empleado envía, Dirección
 * Administrativa firma y Gerencia aprueba fijando el valor del bloque 3.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */
import { sumarDiasHabiles, diasHabilesEntre } from './juridicaWorkflow';
import { esRolPmo } from './rolesPmo';

export type PrestamoEstado =
  | 'borrador'
  | 'pendiente_administrativa'
  | 'pendiente_gerencia'
  | 'aprobado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'green';
}

export const PRESTAMO_ESTADOS: Record<PrestamoEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_administrativa: { label: 'Pendiente de firma de Dirección Administrativa', sla: 2, tone: 'amber' },
  pendiente_gerencia: { label: 'Pendiente de aprobación de Gerencia', sla: 2, tone: 'blue' },
  aprobado: { label: 'Aprobado', sla: null, tone: 'green' },
};

const ROLES_ADMINISTRATIVA = ['Director Financiero y Administrativo'];
const ROLES_GERENCIA = ['Gerencia']; // Dra. Gloria

export interface PrestamoTransicion {
  accion: string;
  from: PrestamoEstado;
  to: PrestamoEstado;
  roles: string[];
  soloCreador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const PRESTAMO_TRANSICIONES: PrestamoTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_administrativa', roles: [], soloCreador: true, label: 'Enviar a Dirección Administrativa', tone: 'primary' },
  { accion: 'aprobar_administrativa', from: 'pendiente_administrativa', to: 'pendiente_gerencia', roles: ROLES_ADMINISTRATIVA, label: 'Firmar y enviar a Gerencia', tone: 'primary' },
  { accion: 'rechazar_administrativa', from: 'pendiente_administrativa', to: 'borrador', roles: ROLES_ADMINISTRATIVA, requiereMotivo: true, label: 'Devolver al empleado', tone: 'danger' },
  { accion: 'aprobar_gerencia', from: 'pendiente_gerencia', to: 'aprobado', roles: ROLES_GERENCIA, label: 'Aprobar el préstamo', tone: 'primary' },
  { accion: 'rechazar_gerencia', from: 'pendiente_gerencia', to: 'borrador', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre un préstamo en cierto estado. */
export function accionesDisponibles(
  estado: PrestamoEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): PrestamoTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return PRESTAMO_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
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
export function calcularSla(estado: PrestamoEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = PRESTAMO_ESTADOS[estado]?.sla;
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

export const estadoLabel = (estado: string) => PRESTAMO_ESTADOS[estado as PrestamoEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[PRESTAMO_ESTADOS[estado as PrestamoEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'aprobado';
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';
