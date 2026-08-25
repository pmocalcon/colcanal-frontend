import api from './api';

/**
 * Talento humano: personal, incapacidades, ausentismos y préstamos.
 *
 * Ojo con los préstamos, que son dos cosas distintas con el mismo nombre: el **formato**
 * de solicitud de G. de talento humano vive en `gc_solicitudes` y es el papel con el que
 * se pide uno nuevo; `th_prestamos` es la **cartera** —lo prestado, lo descontado por
 * nómina y el saldo—, y es lo que se consulta acá.
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

export interface ThPrestamoPago {
  pagoId: number;
  prestamoId: number;
  anio: number;
  mes: number;
  valor: string;
}

export interface ThPrestamo {
  prestamoId: number;
  numero: number | null;
  nombre: string;
  /** Casi siempre null: la hoja de préstamos no trae cédula, solo el nombre. */
  identificacion: string | null;
  proyecto: string | null;
  pagare: string | null;
  mesInicio: string | null;
  numeroCuotas: number | null;
  fechaVencimiento: string | null;
  valorPrestamo: string | null;
  valorCuota: string | null;
  valorCancelado: string | null;
  saldo: string | null;
  observaciones: string | null;
  /** Solo viene en el detalle; el listado no las trae. */
  pagos?: ThPrestamoPago[];
}

export interface ResumenPrestamos {
  prestamos: number;
  activos: number;
  prestado: number;
  cancelado: number;
  saldo: number;
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

export interface ThHorasExtraDetalle {
  detalleId: number;
  horasExtraId: number;
  fecha: string | null;
  proyecto: string | null;
  region: string | null;
  horaEntrada: string | null;
  horaSalida: string | null;
  almuerzo: string | null;
  codigoLabor: string | null;
  labor: string | null;
  diurna: string | null;
  recargoNocturno: string | null;
  nocturna: string | null;
  diurnaFestiva: string | null;
  nocturnaFestiva: string | null;
  liquidacion: string | null;
}

export interface ThHorasExtra {
  horasExtraId: number;
  identificacion: string | null;
  nombre: string;
  cargo: string | null;
  salario: string | null;
  periodo: string | null;
  valorHora: string | null;
  totalHoras: string | null;
  totalLiquidacion: string | null;
  observaciones: string | null;
  /** Solo viene en el detalle; el listado no lo trae. */
  detalle?: ThHorasExtraDetalle[];
}

export interface ResumenHorasExtras {
  planillas: number;
  totalHoras: number;
  totalLiquidacion: number;
}

export interface ThVacacion {
  vacacionId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  fechaIngreso: string | null;
  periodoCausado: string | null;
  fechaInicio: string | null;
  fechaFinal: string | null;
  diasDisfrutar: number | null;
  diasCompensar: number | null;
  diasPendientes: number | null;
  valorPrima: string | null;
  valorAnticipo: string | null;
  fechaPago: string | null;
  fechaAprobacion: string | null;
  observaciones: string | null;
}

export interface ResumenVacaciones {
  registros: number;
  diasDisfrutar: number;
  diasCompensar: number;
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

  // ── Préstamos ──
  async listPrestamos(filtros: { proyecto?: string; conSaldo?: string; buscar?: string } = {}) {
    const { data } = await api.get<ThPrestamo[]>(`${BASE}/prestamos${query(filtros)}`);
    return data;
  },
  async resumenPrestamos() {
    const { data } = await api.get<ResumenPrestamos>(`${BASE}/prestamos/resumen`);
    return data;
  },
  /** Trae el préstamo con su historia de descuentos. */
  async getPrestamo(id: number) {
    const { data } = await api.get<ThPrestamo>(`${BASE}/prestamos/${id}`);
    return data;
  },
  async createPrestamo(payload: Partial<ThPrestamo>) {
    const { data } = await api.post<ThPrestamo>(`${BASE}/prestamos`, payload);
    return data;
  },
  async updatePrestamo(id: number, payload: Partial<ThPrestamo>) {
    const { data } = await api.patch<ThPrestamo>(`${BASE}/prestamos/${id}`, payload);
    return data;
  },
  async registrarPago(id: number, payload: { anio: number; mes: number; valor: number }) {
    const { data } = await api.post<ThPrestamoPago>(`${BASE}/prestamos/${id}/pagos`, payload);
    return data;
  },
  async deletePrestamo(id: number) {
    await api.delete(`${BASE}/prestamos/${id}`);
  },

  // ── Horas extras ──
  async listHorasExtras(filtros: { buscar?: string } = {}) {
    const { data } = await api.get<ThHorasExtra[]>(`${BASE}/horas-extras${query(filtros)}`);
    return data;
  },
  async resumenHorasExtras() {
    const { data } = await api.get<ResumenHorasExtras>(`${BASE}/horas-extras/resumen`);
    return data;
  },
  /** Trae la planilla con su detalle día a día. */
  async getHorasExtra(id: number) {
    const { data } = await api.get<ThHorasExtra>(`${BASE}/horas-extras/${id}`);
    return data;
  },
  async updateHorasExtra(id: number, payload: Partial<ThHorasExtra>) {
    const { data } = await api.patch<ThHorasExtra>(`${BASE}/horas-extras/${id}`, payload);
    return data;
  },
  async deleteHorasExtra(id: number) {
    await api.delete(`${BASE}/horas-extras/${id}`);
  },

  // ── Vacaciones ──
  async listVacaciones(filtros: { buscar?: string; anio?: string } = {}) {
    const { data } = await api.get<ThVacacion[]>(`${BASE}/vacaciones${query(filtros)}`);
    return data;
  },
  async resumenVacaciones(anio?: string) {
    const { data } = await api.get<ResumenVacaciones>(`${BASE}/vacaciones/resumen${query({ anio })}`);
    return data;
  },
  async updateVacacion(id: number, payload: Partial<ThVacacion>) {
    const { data } = await api.patch<ThVacacion>(`${BASE}/vacaciones/${id}`, payload);
    return data;
  },
  async deleteVacacion(id: number) {
    await api.delete(`${BASE}/vacaciones/${id}`);
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
