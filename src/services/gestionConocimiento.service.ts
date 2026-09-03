import api from './api';

export interface GcHistorialEntry {
  estado: string;
  accion: string;
  fecha: string;
  /** null en las entradas que no las escribe una persona (avisos automáticos). */
  userId: number | null;
  userName: string | null;
  motivo?: string;
  // ── Solo en las alertas de vencimiento (accion: 'alerta_vencimiento') ──
  /** Fecha de terminación que disparó el aviso, tal como está en el contrato. */
  vence?: string;
  /** Días que faltaban ese día; negativo si el contrato ya se había vencido. */
  diasRestantes?: number;
  /** Correos a los que se avisó, para poder auditar que salió. */
  notificados?: string[];
  /** Número de la RQ creada a pedido (accion: 'solicitud_rq_poliza'). */
  requisicion?: string;
  /**
   * A quién no se le pudo avisar y por qué (accion: 'notificacion_inicio_contrato').
   * Un supervisor sin usuario o un contratista sin correo: hay que avisarle a mano.
   */
  pendientes?: string[];
}

export interface GcSolicitud {
  solicitudId: number;
  /**
   * El consecutivo **dentro del formato**, que es el número con el que se llama al
   * documento. No es `solicitudId`: ese lo comparten todos los formatos y se gasta en
   * cada borrador descartado. Va en nulo mientras sea borrador.
   */
  numero?: number | null;
  gestion: string;
  formato: string;
  estado: string;
  estadoDesde: string | null;
  historial: GcHistorialEntry[] | null;
  data: Record<string, any> | null;
  createdBy: number | null;
  /**
   * Nombre de quien la creó. La creación no deja entrada en el historial —la
   * solicitud nace con él vacío—, así que la primera línea de la bitácora se
   * arma con esto.
   */
  creadorNombre?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Acciones del flujo que el usuario autenticado puede ejecutar sobre esta
   * solicitud ahora mismo. Lo calcula el backend (conoce la jerarquía de
   * autorizaciones); vacío = no le toca actuar.
   */
  accionesPendientes?: string[];
}

export interface CreateSolicitudPayload {
  gestion: string;
  formato?: string;
  estado?: string;
  data?: Record<string, any>;
}

export interface UpdateSolicitudPayload {
  estado?: string;
  data?: Record<string, any>;
}

const BASE = '/gestion-conocimiento/solicitudes';

/**
 * Lo que ya sabemos de una persona, para no volver a digitarlo en cada formato.
 *
 * `salario` llega en nulo salvo para quien ya ve la nómina: el prellenado está abierto a
 * cualquiera con sesión —los formatos los diligencia todo el mundo— y devolverlo siempre
 * haría de la casilla de la cédula un consultor de sueldos ajenos.
 */
export interface FichaFormato {
  personaId: number;
  identificacion: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string;
  primerNombre: string;
  segundoNombre: string;
  tipoId: string | null;
  estadoCivil: string | null;
  correo: string | null;
  cargo: string | null;
  area: string | null;
  empresaProyecto: string | null;
  fechaIngreso: string | null;
  diasVacacionesPendientes: number | null;
  salario: string | null;
}

export const gestionConocimientoService = {
  /** La ficha de una cédula. Nulo si no está: el formato se sigue llenando a mano. */
  async fichaDeCedula(identificacion: string): Promise<FichaFormato | null> {
    const { data } = await api.get<FichaFormato | null>(`${BASE}/ficha`, {
      params: { identificacion },
    });
    return data ?? null;
  },

  async create(payload: CreateSolicitudPayload): Promise<GcSolicitud> {
    const { data } = await api.post<GcSolicitud>(BASE, payload);
    return data;
  },

  async list(params?: { gestion?: string; mine?: boolean }): Promise<GcSolicitud[]> {
    const q = new URLSearchParams();
    if (params?.gestion) q.set('gestion', params.gestion);
    if (params?.mine) q.set('mine', '1');
    const { data } = await api.get<GcSolicitud[]>(`${BASE}?${q.toString()}`);
    return data;
  },

  async get(id: number): Promise<GcSolicitud> {
    const { data } = await api.get<GcSolicitud>(`${BASE}/${id}`);
    return data;
  },

  async update(id: number, payload: UpdateSolicitudPayload): Promise<GcSolicitud> {
    const { data } = await api.put<GcSolicitud>(`${BASE}/${id}`, payload);
    return data;
  },

  /**
   * Guarda el formato: lo crea si aún no existe, lo actualiza si ya existe.
   *
   * Existe para que la solicitud NO se cree al pulsar «Nueva solicitud» sino al
   * guardar por primera vez. Creándola antes, quien abría el formato y se
   * arrepentía dejaba una fila vacía —«Sin diligenciar»— y gastaba un número de
   * solicitud, que es un contador que no se recicla.
   *
   * Devuelve la solicitud para que la pantalla se quede con su id: sin eso, el
   * segundo guardado crearía una segunda fila.
   */
  async guardar(
    id: number | null,
    payload: { gestion: string; formato: string; data: Record<string, any> },
  ): Promise<GcSolicitud> {
    if (id === null) {
      return this.create({
        gestion: payload.gestion,
        formato: payload.formato,
        data: payload.data,
      });
    }
    return this.update(id, { data: payload.data });
  },

  async transition(
    id: number,
    payload: { accion: string; motivo?: string; data?: Record<string, any> },
  ): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/transicion`, payload);
    return data;
  },

  /**
   * Adjunta el enlace de un soporte cuando el formato ya salió del borrador.
   *
   * El resto del documento sigue cerrado —lo que se avaló debe ser lo que se paga—, pero
   * el pagaré del préstamo y el soporte del permiso se firman después de radicar, así que
   * tienen su propia puerta. El servidor comprueba el campo, quién lo escribe y que el
   * enlace sea http(s).
   */
  async saveEnlaceSoporte(id: number, campo: string, url: string): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/enlace-soporte`, { campo, url });
    return data;
  },

  async saveChecklist(id: number, checklist: Record<string, any>): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/checklist`, { checklist });
    return data;
  },

  /** Guarda un documento de fase 2 (key: 'designacionSupervisor' | 'actaInicio'). */
  async saveDocumento(id: number, key: string, doc: Record<string, any>): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/documento`, { key, data: doc });
    return data;
  },

  /**
   * Crea la requisición de la póliza a pedido, sin mover el flujo. Para los
   * contratos ya firmados que pasaron de "Contrato firmado" sin RQ.
   */
  async solicitarRequisicionPoliza(id: number): Promise<GcSolicitud> {
    const { data } = await api.post<GcSolicitud>(`${BASE}/${id}/requisicion-poliza`);
    return data;
  },

  /** Aprueba o rechaza la requisición de la póliza (solo Dir. Administrativa y Financiera). */
  async resolverPoliza(
    id: number,
    payload: { decision: 'aprobar' | 'rechazar'; comentario?: string },
  ): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/poliza`, payload);
    return data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
