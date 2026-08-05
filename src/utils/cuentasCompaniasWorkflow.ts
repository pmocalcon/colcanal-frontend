/**
 * Flujo de la Autorización de pago mediante cuentas entre compañías (GF-004-F5) en el
 * frontend. Espeja la máquina de estados del backend (cuentas-companias-workflow.ts).
 *
 * No tiene pasos de aprobación: la autorización previa de las dos Gerencias Generales
 * (sección 2) se firma en papel. El sistema custodia el documento y exige el control
 * posterior — la conciliación mensual de la sección 3, que cierra Contabilidad.
 *
 * @see rolesPmo — el PMO (Analista y Director) puede ejecutar cualquier paso.
 */

import { esRolPmo } from './rolesPmo';

export type CuentasEstado = 'borrador' | 'pendiente_conciliacion' | 'conciliado';

interface EstadoMeta {
  label: string;
  sla: number | null;
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const CUENTAS_ESTADOS: Record<CuentasEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_conciliacion: {
    label: 'Autorizado · pendiente de conciliación (Contabilidad)',
    sla: null,
    tone: 'blue',
  },
  conciliado: { label: 'Conciliado (cerrado)', sla: null, tone: 'green' },
};

const ROLES_CONTABILIDAD = ['Contabilidad'];

export interface CuentasTransicion {
  accion: string;
  from: CuentasEstado;
  to: CuentasEstado;
  roles: string[];
  soloCreador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const CUENTAS_TRANSICIONES: CuentasTransicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_conciliacion', roles: [], soloCreador: true, label: 'Firmado por ambas gerencias · enviar a Contabilidad', tone: 'primary' },
  { accion: 'conciliar', from: 'pendiente_conciliacion', to: 'conciliado', roles: ROLES_CONTABILIDAD, label: 'Conciliar y cerrar', tone: 'primary' },
  { accion: 'devolver_contabilidad', from: 'pendiente_conciliacion', to: 'borrador', roles: ROLES_CONTABILIDAD, requiereMotivo: true, label: 'Devolver (falta información o soporte)', tone: 'danger' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre el formato. */
export function accionesDisponibles(
  estado: CuentasEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): CuentasTransicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return CUENTAS_TRANSICIONES.filter((t) => {
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
  CUENTAS_ESTADOS[estado as CuentasEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[CUENTAS_ESTADOS[estado as CuentasEstado]?.tone ?? 'gray'];

/** Estado terminal del flujo. */
export const esTerminal = (estado: string) => estado === 'conciliado';
/** Solo se puede editar el formato mientras está en borrador. */
export const esEditable = (estado: string | null | undefined) => !estado || estado === 'borrador';
