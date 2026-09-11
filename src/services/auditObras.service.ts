import api from './api';

/**
 * De dónde sale un movimiento de la línea de tiempo.
 *
 * `registrado` lo anotó la bitácora en el momento en que ocurrió: responde por su fecha
 * y por su autor. `reconstruido` se dedujo de las columnas de la fila porque es anterior
 * a la bitácora; la fecha es buena, pero de cada carril solo sobrevivió el último
 * movimiento —los intermedios se pisaron al cambiar de estado— y de algunos no se sabe
 * quién. La pantalla tiene que mostrar la diferencia: una auditoría que afirma con el
 * mismo aplomo lo que le consta y lo que dedujo no sirve para auditar.
 */
export type OrigenMovimiento = 'registrado' | 'reconstruido';

export interface MovimientoObra {
  logId: number | null;
  fecha: string;
  ambito: 'obra' | 'levantamiento' | 'acta';
  eje: string | null;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  comments: string | null;
  usuario: { userId: number; nombre: string; cargo: string | null } | null;
  origen: OrigenMovimiento;
  workId: number | null;
  obra: string | null;
}

export interface EjeActa {
  eje: 'acta' | 'presupuesto' | 'cronograma' | 'rq_anticipada';
  titulo: string;
  estado: string;
  /** Null cuando la columna no guarda fecha. No es un error: es lo que hay. */
  desde: string | null;
  quien: string | null;
  motivo: string | null;
}

export interface ResumenRecorrido {
  inicio: string;
  ultimo: string;
  movimientos: number;
  registrados: number;
  reconstruidos: number;
  personas: number;
}

export interface FilaActa {
  actaId: number;
  companyId: number;
  projectId: number | null;
  actaNumber: string;
  estado: string;
  presupuesto: string;
  cronograma: string;
  compraAnticipada: string;
  provisional: boolean;
  codigoContabilidad: string | null;
  creada: string;
  revisada: string | null;
  aprobada: string | null;
  municipio: string | null;
  proyecto: string | null;
  creadaPor: string | null;
  obras: number;
  valor: number;
  ultimoMovimiento: string | null;
  movimientos: number;
}

export interface FilaObra {
  workId: number;
  codigo: string | null;
  nombre: string;
  acta: string | null;
  tipoSolicitud: string | null;
  creada: string;
  municipio: string | null;
  proyecto: string | null;
  creadaPor: string | null;
  surveyId: number | null;
  levantamiento: string | null;
  revisado: string | null;
  revisadoPor: string | null;
  bloquesAprobados: number | null;
  valor: number;
  actaId: number | null;
  estadoActa: string | null;
  ultimoMovimiento: string | null;
  movimientos: number;
}

export interface ActaDetalle {
  acta: {
    actaId: number;
    actaNumber: string;
    companyId: number;
    projectId: number | null;
    municipio: string | null;
    proyecto: string | null;
    estado: string;
    provisional: boolean;
    codigoContabilidad: string | null;
    creada: string;
    creadaPor: string | null;
  };
  ejes: EjeActa[];
  obras: Array<{
    workId: number;
    codigo: string | null;
    nombre: string;
    direccion: string | null;
    tipoSolicitud: string | null;
    creada: string;
    surveyId: number | null;
    levantamiento: string | null;
    valor: number;
  }>;
  valor: number;
  movimientos: MovimientoObra[];
  resumen: ResumenRecorrido | null;
  holidays: string[];
}

export interface LevantamientoDetalle {
  surveyId: number;
  codigo: string | null;
  estado: string;
  creado: string;
  revisado: string | null;
  ipp: string | number | null;
  motivo: string | null;
  creadoPor: string | null;
  revisadoPor: string | null;
  revisorAsignado: string | null;
  bloqueInformacion: string | null;
  reparoInformacion: string | null;
  bloquePresupuesto: string | null;
  reparoPresupuesto: string | null;
  bloqueInversion: string | null;
  reparoInversion: string | null;
  bloqueMateriales: string | null;
  reparoMateriales: string | null;
  bloqueViaticos: string | null;
  reparoViaticos: string | null;
}

export interface ObraDetalle {
  obra: {
    workId: number;
    codigo: string | null;
    nombre: string;
    direccion: string | null;
    barrio: string | null;
    sector: string | null;
    zona: string | null;
    tipoSolicitud: string | null;
    acta: string | null;
    entidadSolicitante: string | null;
    creada: string;
    actualizada: string;
    municipio: string | null;
    proyecto: string | null;
    creadaPor: string | null;
    actaId: number | null;
    estadoActa: string | null;
    codigoContabilidad: string | null;
    valor: number;
  };
  levantamientos: LevantamientoDetalle[];
  movimientos: MovimientoObra[];
  resumen: ResumenRecorrido | null;
  holidays: string[];
}

export interface StatsObras {
  actas: {
    total: number;
    borrador: number;
    enRevision: number;
    enAprobacion: number;
    aprobadas: number;
    provisionales: number;
    presupuestoEnRevision: number;
    cronogramaEnRevision: number;
    anticipadaPendiente: number;
  };
  obras: { total: number; sinActa: number };
  levantamientos: Array<{ estado: string; n: number }>;
  porAccion: Array<{ accion: string; n: number }>;
  bitacora: { total: number; desde: string | null; ultimos7dias: number };
}

/** Los estados con el nombre que usa la gente, no el del código. */
export const ESTADO_ACTA: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión del Director Técnico',
  en_aprobacion: 'Pendiente de Gerencia de Proyectos',
  aprobada: 'Aprobada',
};

export const ESTADO_PRESUPUESTO: Record<string, string> = {
  pendiente: 'Sin enviar',
  en_revision: 'En revisión de la Dirección Financiera',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export const ESTADO_CRONOGRAMA: Record<string, string> = {
  pendiente: 'Sin enviar',
  en_revision: 'En revisión del Director Técnico',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export const ESTADO_ANTICIPADA: Record<string, string> = {
  no_aplica: 'No se pidió',
  pendiente: 'Pendiente de Gerencia',
  aprobada: 'Autorizada',
  rechazada: 'Negada',
};

export const ESTADO_LEVANTAMIENTO: Record<string, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export const ESTADO_BLOQUE: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

/** Qué se hizo, dicho como lo diría quien lo hizo. */
export const ACCION_OBRA: Record<string, string> = {
  crear: 'Creación',
  editar: 'Edición',
  cambiar_acta: 'Cambio de acta',
  agrupar_acta_provisional: 'Agrupada en acta provisional',
  quitar_acta_provisional: 'Retirada del acta provisional',
  enviar_revision: 'Enviada a revisión',
  revisar: 'Revisada por el Director Técnico',
  devolver: 'Devuelta por el Director Técnico',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada',
  aprobar_bloque: 'Bloque aprobado',
  rechazar_bloque: 'Bloque rechazado',
  aprobar_todo: 'Levantamiento aprobado completo',
  reabrir: 'Reabierta para edición',
  enviar_presupuesto: 'Presupuesto enviado a la Dirección Financiera',
  aprobar_presupuesto: 'Presupuesto aprobado',
  rechazar_presupuesto: 'Presupuesto rechazado',
  cerrar_presupuesto: 'Presupuesto cerrado',
  reabrir_presupuesto: 'Presupuesto reabierto',
  enviar_cronograma: 'Cronograma enviado a revisión',
  aprobar_cronograma: 'Cronograma aprobado',
  rechazar_cronograma: 'Cronograma rechazado',
  solicitar_compra_anticipada: 'Compra anticipada solicitada',
  autorizar_compra_anticipada: 'Compra anticipada autorizada',
  negar_compra_anticipada: 'Compra anticipada negada',
};

/** El bloque del levantamiento, cuando el movimiento es de uno solo. */
export const BLOQUE_LEVANTAMIENTO: Record<string, string> = {
  work_info: 'Información de la obra',
  budget: 'Presupuesto',
  investment: 'Inversión',
  materials: 'Materiales',
  travel_expenses: 'Viáticos',
};

export const CARRIL_ACTA: Record<string, string> = {
  acta: 'Acta',
  presupuesto: 'Presupuesto',
  cronograma: 'Cronograma',
  rq_anticipada: 'Compra anticipada',
};

/**
 * El nombre de un estado, venga del carril que venga.
 *
 * La bitácora guarda el código crudo (`en_revision`, `approved`, `no_aplica`) porque es lo
 * que dice la columna, y eso está bien para guardar: el día que cambie una etiqueta, lo
 * anotado sigue siendo cierto. Traducirlo es trabajo de la pantalla. Los diccionarios se
 * recorren en orden y gana el primero que lo reconozca; los códigos no chocan entre sí
 * salvo `pendiente`/`aprobado`, que significan lo mismo en presupuesto y en cronograma.
 *
 * Un código que nadie reconoce se muestra tal cual, sin guiones: enseñar el código crudo
 * es feo, pero inventarle un nombre a un estado desconocido es peor.
 */
export const nombreEstado = (codigo: string | null | undefined): string => {
  if (!codigo) return '—';
  for (const dicc of [
    ESTADO_ACTA,
    ESTADO_LEVANTAMIENTO,
    ESTADO_PRESUPUESTO,
    ESTADO_ANTICIPADA,
  ]) {
    if (dicc[codigo]) return dicc[codigo];
  }
  return codigo.replace(/_/g, ' ');
};

/**
 * Verde solo cuando algo quedó aprobado; ámbar mientras alguien lo tiene en la mano;
 * rojo cuando se devolvió. Un estado sin color propio se queda gris antes que mentir.
 */
export const colorEstado = (estado: string | null | undefined): string => {
  switch (estado) {
    case 'aprobada':
    case 'aprobado':
    case 'approved':
      return 'bg-green-500/10 text-green-700 border-green-500/20';
    case 'en_revision':
    case 'en_aprobacion':
    case 'in_review':
    case 'pendiente':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'rechazada':
    case 'rechazado':
    case 'rejected':
      return 'bg-red-500/10 text-red-700 border-red-500/20';
    case 'borrador':
    case 'pending':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    default:
      return 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))]';
  }
};

export const fmtCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0);

export interface FiltroActas {
  page?: number;
  limit?: number;
  companyName?: string;
  actaNumber?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

export interface FiltroObras extends Omit<FiltroActas, 'actaNumber'> {
  actaNumber?: string;
  busqueda?: string;
}

/**
 * Quita del query string lo que no filtra nada.
 *
 * Un `companyName=` vacío llegaría al servidor como `ILIKE '%%'`, que sí filtra: deja
 * fuera las filas con el municipio nulo. Un filtro que el usuario no puso no puede
 * esconderle filas.
 */
const limpiar = (filtros: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== undefined && v !== '' && v !== 'todos'),
  );

export const auditObrasService = {
  async getActas(filtros: FiltroActas = {}) {
    const { data } = await api.get('/audit/obras/actas', { params: limpiar(filtros) });
    return data as { actas: FilaActa[]; total: number; page: number; totalPages: number };
  },

  async getObras(filtros: FiltroObras = {}) {
    const { data } = await api.get('/audit/obras/obras', { params: limpiar(filtros) });
    return data as { obras: FilaObra[]; total: number; page: number; totalPages: number };
  },

  async getActaDetalle(actaId: number) {
    const { data } = await api.get(`/audit/obras/acta/${actaId}`);
    return data as ActaDetalle | null;
  },

  async getObraDetalle(workId: number) {
    const { data } = await api.get(`/audit/obras/obra/${workId}`);
    return data as ObraDetalle | null;
  },

  async getStats() {
    const { data } = await api.get('/audit/obras/stats');
    return data as StatsObras;
  },
};
