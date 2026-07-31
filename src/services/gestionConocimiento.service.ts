import api from './api';

export interface GcHistorialEntry {
  estado: string;
  accion: string;
  fecha: string;
  userId: number;
  userName: string | null;
  motivo?: string;
}

export interface GcSolicitud {
  solicitudId: number;
  gestion: string;
  formato: string;
  estado: string;
  estadoDesde: string | null;
  historial: GcHistorialEntry[] | null;
  data: Record<string, any> | null;
  createdBy: number | null;
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

export const gestionConocimientoService = {
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

  async transition(
    id: number,
    payload: { accion: string; motivo?: string; data?: Record<string, any> },
  ): Promise<GcSolicitud> {
    const { data } = await api.patch<GcSolicitud>(`${BASE}/${id}/transicion`, payload);
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
