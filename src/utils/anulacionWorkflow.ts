/**
 * Anulación de los formatos de Talento Humano (préstamo, permiso, vacaciones y horas
 * extras). Espeja `anulacion-workflow.ts` del backend.
 *
 * No es un paso de ningún flujo sino un camino transversal: se puede tomar desde
 * cualquier estado, incluido el aprobado. Por eso vive en un archivo aparte y los cuatro
 * formatos lo suman a sus propias acciones en vez de tenerlo repetido cuatro veces.
 *
 *   cualquier estado ──solicitar anulación──▶ pendiente_anulacion ──anular──▶ anulado
 *          └──────────────anular (Talento Humano)───────────────────────────────┘
 *   pendiente_anulacion ──rechazar──▶ vuelve al estado en que estaba
 *
 * Anular un formato ya aprobado **borra lo que dejó en nómina**: el préstamo, el
 * ausentismo, la planilla o las vacaciones que se crearon al aprobarlo. La decisión y su
 * motivo quedan en el documento; el registro derivado desaparece para que la liquidación
 * deje de contarlo.
 */

import { esRolPmo } from './rolesPmo';

export type AnulacionEstado = 'pendiente_anulacion' | 'anulado';

/** Quién anula sin pedir permiso. El resto solicita y Talento Humano resuelve. */
const ROLES_ANULAN = ['Coordinador Talento Humano'];

const ETIQUETAS: Record<AnulacionEstado, string> = {
  pendiente_anulacion: 'Pendiente de aprobación de la anulación',
  anulado: 'Anulado',
};

const CLASES: Record<AnulacionEstado, string> = {
  pendiente_anulacion: 'bg-orange-100 text-orange-800',
  anulado: 'bg-red-100 text-red-800',
};

export interface AccionAnulacion {
  accion: 'solicitar_anulacion' | 'anular' | 'rechazar_anulacion';
  label: string;
  tone: 'primary' | 'danger';
  requiereMotivo: true;
}

export const esAnulado = (estado: string | null | undefined) => estado === 'anulado';
export const esperaAnulacion = (estado: string | null | undefined) =>
  estado === 'pendiente_anulacion';

/** La etiqueta del estado, si es uno de anulación. Null si no lo es. */
export const etiquetaAnulacion = (estado: string): string | null =>
  ETIQUETAS[estado as AnulacionEstado] ?? null;

/** La clase del distintivo, si el estado es uno de anulación. Null si no lo es. */
export const claseAnulacion = (estado: string): string | null =>
  CLASES[estado as AnulacionEstado] ?? null;

/**
 * Las acciones de anulación que este usuario puede ejecutar sobre el documento.
 *
 * Se calculan aparte de las del flujo porque no dependen del estado de origen sino de
 * quién es el usuario: Talento Humano y el PMO anulan desde donde sea, y quien hizo la
 * solicitud puede pedir que se anule.
 *
 * `puedeSolicitar` lo decide la página: es el creador, o su jefe. El backend lo vuelve a
 * validar —acá no se conoce la tabla de autorizaciones—, así que un botón de más se
 * traduce en un mensaje claro y no en una anulación indebida.
 */
export function accionesAnulacion(
  estado: string,
  nombreRol: string | undefined,
  puedeSolicitar: boolean,
): AccionAnulacion[] {
  if (esAnulado(estado)) return [];
  const rol = nombreRol ?? '';
  const resuelve = esRolPmo(rol) || ROLES_ANULAN.includes(rol);

  if (esperaAnulacion(estado)) {
    return resuelve
      ? [
          { accion: 'anular', label: 'Confirmar la anulación', tone: 'danger', requiereMotivo: true },
          { accion: 'rechazar_anulacion', label: 'Rechazar la anulación', tone: 'primary', requiereMotivo: true },
        ]
      : [];
  }

  const acciones: AccionAnulacion[] = [];
  if (resuelve) {
    acciones.push({ accion: 'anular', label: 'Anular', tone: 'danger', requiereMotivo: true });
  } else if (puedeSolicitar) {
    acciones.push({
      accion: 'solicitar_anulacion',
      label: 'Solicitar anulación',
      tone: 'danger',
      requiereMotivo: true,
    });
  }
  return acciones;
}
