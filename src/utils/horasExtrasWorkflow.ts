/**
 * Flujo de la planilla de Horas Extras (GTH-016-F) en el frontend. Espeja la máquina de
 * estados del backend (horas-extras-workflow.ts).
 *
 * Cuatro manos, porque la planilla acaba en nómina: la llena el PQRS, la revisa el
 * Director de Proyecto que lo tiene a cargo, la valida Dirección Técnica y la aprueba
 * Gerencia de Proyectos.
 *
 * El primer paso combina rol y jerarquía: no lo revisa cualquier Director de Proyecto
 * sino el de esa persona. Como la jerarquía es dinámica, aquí el botón se le ofrece a
 * todo Director de Proyecto que no sea el creador y el backend valida que de verdad lo
 * tenga a cargo.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */
import { sumarDiasHabiles, diasHabilesEntre } from './juridicaWorkflow';
import { esRolPmo } from './rolesPmo';

export type HorasExtrasEstado =
  | 'borrador'
  | 'pendiente_director_proyecto'
  | 'pendiente_direccion_tecnica'
  | 'pendiente_gerencia_proyectos'
  | 'aprobado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const HORAS_EXTRAS_ESTADOS: Record<HorasExtrasEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_director_proyecto: { label: 'Pendiente de revisión del Director de Proyecto', sla: 2, tone: 'amber' },
  pendiente_direccion_tecnica: { label: 'Pendiente de revisión de Dirección Técnica', sla: 2, tone: 'blue' },
  pendiente_gerencia_proyectos: { label: 'Pendiente de aprobación de Gerencia de Proyectos', sla: 2, tone: 'violet' },
  aprobado: { label: 'Aprobada', sla: null, tone: 'green' },
};

const ROLES_DIRECTOR_PROYECTO = [
  'Director de Proyecto Antioquia',
  'Director de Proyecto Quindío',
  'Director de Proyecto Valle',
  'Director de Proyecto Putumayo',
];
const ROLES_DIRECCION_TECNICA = ['Director Técnico']; // Andrés Gómez
const ROLES_GERENCIA_PROYECTOS = ['Gerencia de Proyectos']; // Lorena Martínez

export interface HorasExtrasTransicion {
  accion: string;
  from: HorasExtrasEstado;
  to: HorasExtrasEstado;
  roles: string[];
  soloCreador?: boolean;
  /** Además del rol, hay que tener a cargo al creador. Lo valida el backend. */
  jefeAutorizador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const HORAS_EXTRAS_TRANSICIONES: HorasExtrasTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_director_proyecto', roles: [], soloCreador: true, label: 'Enviar a revisión', tone: 'primary' },
  { accion: 'revisar_director', from: 'pendiente_director_proyecto', to: 'pendiente_direccion_tecnica', roles: ROLES_DIRECTOR_PROYECTO, jefeAutorizador: true, label: 'Revisar y enviar a Dirección Técnica', tone: 'primary' },
  { accion: 'devolver_director', from: 'pendiente_director_proyecto', to: 'borrador', roles: ROLES_DIRECTOR_PROYECTO, jefeAutorizador: true, requiereMotivo: true, label: 'Devolver para corrección', tone: 'danger' },
  { accion: 'revisar_tecnica', from: 'pendiente_direccion_tecnica', to: 'pendiente_gerencia_proyectos', roles: ROLES_DIRECCION_TECNICA, label: 'Revisar y enviar a Gerencia de Proyectos', tone: 'primary' },
  { accion: 'devolver_tecnica', from: 'pendiente_direccion_tecnica', to: 'borrador', roles: ROLES_DIRECCION_TECNICA, requiereMotivo: true, label: 'Devolver la planilla', tone: 'danger' },
  { accion: 'aprobar_gp', from: 'pendiente_gerencia_proyectos', to: 'aprobado', roles: ROLES_GERENCIA_PROYECTOS, label: 'Aprobar la planilla', tone: 'primary' },
  { accion: 'rechazar_gp', from: 'pendiente_gerencia_proyectos', to: 'borrador', roles: ROLES_GERENCIA_PROYECTOS, requiereMotivo: true, label: 'Devolver la planilla', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre la planilla en cierto estado. */
export function accionesDisponibles(
  estado: HorasExtrasEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): HorasExtrasTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return HORAS_EXTRAS_TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.soloCreador) return esCreador;
    if (!t.roles.includes(rol)) return false;
    // El backend comprueba que sea el Director de Proyecto de esa persona.
    return t.jefeAutorizador ? !esCreador : true;
  });
}

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  diasHabiles: number;
  restantes: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: HorasExtrasEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = HORAS_EXTRAS_ESTADOS[estado]?.sla;
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

export const estadoLabel = (estado: string) =>
  HORAS_EXTRAS_ESTADOS[estado as HorasExtrasEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[HORAS_EXTRAS_ESTADOS[estado as HorasExtrasEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'aprobado';
/** La planilla solo se diligencia en borrador: después es lo que revisaron y avalaron. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';
