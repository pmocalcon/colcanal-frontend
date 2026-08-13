import api from './api';

/**
 * Talento humano: base de personal, incapacidades y ausentismos.
 *
 * Los **préstamos no están acá**: se piden con el formato de G. de talento humano y viven
 * en `gc_solicitudes`, así que su listado usa `gestionConocimiento.service`.
 */

export interface ThPersona {
  personaId: number;
  estado: string | null;
  tipoContrato: string | null;
  ubicacion: string | null;
  empresaProyecto: string | null;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  operacionFge: string | null;
  centroCosto: string | null;
  tipoGasto: string | null;
  fechaIngreso: string | null;
  escalafon: string | null;
  formacionProfesional: string | null;
  /** Los numéricos llegan como texto: Postgres devuelve `numeric` así. */
  salario: string | null;
  auxilioTransporte: string | null;
  auxilioRodamiento: string | null;
  totalSalarios: string | null;
  cargaPrestacionalPct: string | null;
  cargaPrestacional: string | null;
  costoTotal: string | null;
  anioVigencia: number | null;
  observaciones: string | null;
}

export interface ThIncapacidad {
  incapacidadId: number;
  identificacion: string;
  nombre: string;
  proyecto: string | null;
  salario: string | null;
  tipo: string | null;
  tipoAfectacion: string | null;
  numeroIncapacidad: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  periodoTexto: string | null;
  totalDias: number | null;
  diasEmpresa: number | null;
  diasEntidad: number | null;
  valorAsumidoEmpresa: string | null;
  valorRecobro: string | null;
  valorProyectadoRecuperar: string | null;
  valorRecuperado: string | null;
  entidad: string | null;
  estado: string | null;
  numeroRadicacion: string | null;
  fechaPago: string | null;
  observaciones: string | null;
}

export interface ThAusentismo {
  ausentismoId: number;
  identificacion: string;
  nombre: string;
  /** Cargo, área y contrato **al momento del permiso**: copiados, no consultados. */
  cargo: string | null;
  area: string | null;
  tipoContrato: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  /** «HH:MM» en reloj de doce horas, como se anota en el registro. */
  horaSalida: string | null;
  horaEntrada: string | null;
  horasAusencia: string | null;
  diasPermiso: number | null;
  motivo: string | null;
  soporte: string | null;
  observaciones: string | null;
}

export interface ResumenRecobro {
  estado: string | null;
  cantidad: number;
  proyectado: number;
  recuperado: number;
}

export interface ResumenAusentismo {
  motivo: string | null;
  cantidad: number;
  horas: number;
}

const BASE = '/talento-humano';

const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const talentoHumanoService = {
  // ── Personal ──
  async listPersonal(filtros: { estado?: string; area?: string; empresa?: string; buscar?: string } = {}) {
    const { data } = await api.get<ThPersona[]>(`${BASE}/personal${query(filtros)}`);
    return data;
  },
  async getPersona(id: number) {
    const { data } = await api.get<ThPersona>(`${BASE}/personal/${id}`);
    return data;
  },
  async createPersona(payload: Partial<ThPersona>) {
    const { data } = await api.post<ThPersona>(`${BASE}/personal`, payload);
    return data;
  },
  async updatePersona(id: number, payload: Partial<ThPersona>) {
    const { data } = await api.patch<ThPersona>(`${BASE}/personal/${id}`, payload);
    return data;
  },
  /** No borra: marca la persona como INACTIVO. */
  async inactivarPersona(id: number) {
    const { data } = await api.delete<ThPersona>(`${BASE}/personal/${id}`);
    return data;
  },

  // ── Incapacidades ──
  async listIncapacidades(filtros: { estado?: string; entidad?: string; buscar?: string } = {}) {
    const { data } = await api.get<ThIncapacidad[]>(`${BASE}/incapacidades${query(filtros)}`);
    return data;
  },
  async resumenRecobro() {
    const { data } = await api.get<ResumenRecobro[]>(`${BASE}/incapacidades/resumen`);
    return data;
  },
  async createIncapacidad(payload: Partial<ThIncapacidad>) {
    const { data } = await api.post<ThIncapacidad>(`${BASE}/incapacidades`, payload);
    return data;
  },
  async updateIncapacidad(id: number, payload: Partial<ThIncapacidad>) {
    const { data } = await api.patch<ThIncapacidad>(`${BASE}/incapacidades/${id}`, payload);
    return data;
  },
  async deleteIncapacidad(id: number) {
    await api.delete(`${BASE}/incapacidades/${id}`);
  },

  // ── Ausentismos ──
  async listAusentismos(
    filtros: { motivo?: string; area?: string; desde?: string; buscar?: string; limite?: string } = {},
  ) {
    const { data } = await api.get<ThAusentismo[]>(`${BASE}/ausentismos${query(filtros)}`);
    return data;
  },
  async resumenAusentismos(desde?: string) {
    const { data } = await api.get<ResumenAusentismo[]>(`${BASE}/ausentismos/resumen${query({ desde })}`);
    return data;
  },
  async createAusentismo(payload: Partial<ThAusentismo>) {
    const { data } = await api.post<ThAusentismo>(`${BASE}/ausentismos`, payload);
    return data;
  },
  async updateAusentismo(id: number, payload: Partial<ThAusentismo>) {
    const { data } = await api.patch<ThAusentismo>(`${BASE}/ausentismos/${id}`, payload);
    return data;
  },
  async deleteAusentismo(id: number) {
    await api.delete(`${BASE}/ausentismos/${id}`);
  },
};

/**
 * Quién ve el módulo. **Espejo de `ROLES_TALENTO_HUMANO` del backend**, que es quien de
 * verdad cierra el API: esto solo evita pintar una tarjeta que al abrirse daría 403.
 */
const ROLES = [
  'coordinador talento humano',
  'director financiero y administrativo',
  'analista administrativo',
  'gerencia',
  'director pmo',
  'analista pmo',
];

export const puedeVerTalentoHumano = (nombreRol?: string): boolean =>
  ROLES.includes((nombreRol ?? '').trim().toLowerCase());
