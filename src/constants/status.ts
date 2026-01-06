/**
 * Constantes relacionadas con estados de requisiciones
 */

// Mapeo de códigos de estado a clases de color
export const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-800',
  pendiente_validacion: 'bg-indigo-100 text-indigo-800',
  en_revision: 'bg-blue-100 text-blue-800',
  aprobada_revisor: 'bg-green-100 text-green-800',
  pendiente_autorizacion: 'bg-amber-100 text-amber-800',
  autorizado: 'bg-lime-100 text-lime-800',
  aprobada_gerencia: 'bg-emerald-100 text-emerald-800',
  en_cotizacion: 'bg-cyan-100 text-cyan-800',
  cotizada: 'bg-teal-100 text-teal-800',
  en_orden_compra: 'bg-violet-100 text-violet-800',
  pendiente_recepcion: 'bg-purple-100 text-purple-800',
  en_recepcion: 'bg-fuchsia-100 text-fuchsia-800',
  recepcion_completa: 'bg-green-100 text-green-800',
  rechazada_validador: 'bg-pink-100 text-pink-800',
  rechazada_revisor: 'bg-orange-100 text-orange-800',
  rechazada_autorizador: 'bg-amber-100 text-amber-800',
  rechazada_gerencia: 'bg-red-100 text-red-800',
} as const;

// Estados finales (no se pueden re-revisar)
export const FINAL_STATUSES = [
  'aprobada_gerencia',
  'cotizada',
  'en_orden_compra',
  'pendiente_recepcion',
  'en_recepcion',
  'recepcion_completa',
] as const;

// Estados de rechazo
export const REJECTION_STATUSES = [
  'rechazada_validador',
  'rechazada_revisor',
  'rechazada_autorizador',
  'rechazada_gerencia',
] as const;

// Estados pendientes de accion
export const PENDING_ACTION_STATUSES = [
  'pendiente',
  'pendiente_validacion',
  'en_revision',
  'pendiente_autorizacion',
] as const;

/**
 * Obtiene el color CSS para un código de estado
 */
export function getStatusColor(statusCode: string): string {
  return STATUS_COLORS[statusCode] || 'bg-gray-100 text-gray-800';
}

/**
 * Verifica si un estado es final
 */
export function isFinalStatus(statusCode: string): boolean {
  return FINAL_STATUSES.includes(statusCode as typeof FINAL_STATUSES[number]);
}

/**
 * Verifica si un estado es de rechazo
 */
export function isRejectionStatus(statusCode: string): boolean {
  return REJECTION_STATUSES.includes(statusCode as typeof REJECTION_STATUSES[number]);
}
