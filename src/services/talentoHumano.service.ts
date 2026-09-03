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
  /** La fecha, no la edad: la edad la calcula el backend al leerla. */
  fechaNacimiento: string | null;
  correo: string | null;
  sexo: string | null;
  estadoCivil: string | null;
  hijos: number | null;
  operacionFge: string | null;
  centroCosto: string | null;
  tipoGasto: string | null;
  fechaIngreso: string | null;
  /** Solo tiene valor en término fijo y prestación de servicios: un indefinido no vence. */
  fechaVencimientoContrato: string | null;
  /** Nulo es «sin revisar», que no es lo mismo que «sin firmar». */
  contratoFirmado: boolean | null;
  /** Otrosí y modificatorios. */
  otroSi: string | null;
  escalafon: string | null;
  formacionProfesional: string | null;
  /** Los numéricos llegan como texto: Postgres devuelve `numeric` así. */
  salario: string | null;
  auxilioTransporte: string | null;
  auxilioRodamiento: string | null;
  totalSalarios: string | null;
  /** Cuota mensual de la póliza funeraria. Es un descuento: no suma al total de salarios. */
  polizaFuneraria: string | null;
  /** "SI" / "NO" / vacío para que lo decida el IBC del mes. Solo dice si aplica, no cuánto. */
  fspModo: string | null;
  /** Si se le descuenta el 4 % de salud y el 4 % de pensión. Por defecto, sí. */
  aportaSalud: boolean;
  aportaPension: boolean;
  /** Cuándo dejó de trabajar. Solo aplica cuando el estado es INACTIVO. */
  fechaSalida: string | null;
  tipoId: string | null;
  nombres: string | null;
  apellidos: string | null;
  /** Cuenta para el pago de la nómina. */
  banco: string | null;
  /** Texto, no número: los números de cuenta empiezan por cero con frecuencia. */
  cuenta: string | null;
  /** AHORROS o CORRIENTE. */
  tipoCuenta: string | null;
  cargaPrestacionalPct: string | null;
  cargaPrestacional: string | null;
  costoTotal: string | null;
  anioVigencia: number | null;
  observaciones: string | null;
  /** Tarifa ARL. Fracción: 0.0435 es el 4,35 %. */
  nivelRiesgo: string | null;
  /** La clase del decreto 1607, de I a V. No es la tarifa. */
  claseRiesgo: string | null;
  arl: string | null;
  eps: string | null;
  afp: string | null;
  ccf: string | null;
  trabajoAltura: string | null;
  diasVacacionesPendientes: number | null;

  // ── Calculados: llegan del backend y no se editan ──
  /** Años cumplidos, de la fecha de nacimiento. */
  edad?: number | null;
  /** Días de incapacidad registrados este año. */
  diasIncapacidad?: number;
  /** Días de permiso este año, contando las horas sueltas como días de ocho. */
  diasPermiso?: number;
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
  /** "CUOTA" es el descuento pactado; "ABONO" es un pago extraordinario. */
  tipo: string;
  /** "NOMINA" se descuenta del pago del mes; "DIRECTO" es por fuera y solo baja el saldo. */
  medio: string;
  fecha: string | null;
  observaciones: string | null;
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

/**
 * Una línea del cierre del mes. Espeja `FilaCierre` del backend.
 *
 * `disponible` es el tope: el saldo más lo que ya se haya registrado de ese mismo mes.
 * Se manda calculado desde el servidor para que la pantalla no tenga que sumarlo —y para
 * que apague el guardado por la misma cuenta con la que el servidor lo rechazaría—.
 */
export interface FilaCierrePrestamo {
  prestamoId: number;
  nombre: string;
  identificacion: string | null;
  proyecto: string | null;
  nombreNomina: string | null;
  valorPrestamo: string | null;
  valorCuota: string | null;
  cuotaDescontar: string | null;
  /** Lo último que se le descontó. Es la cuota de los préstamos que vienen sin una. */
  ultimaCuota: number;
  saldo: string | null;
  disponible: number;
  yaDescontado: number;
  abonos: number;
  sugerido: number;
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

/**
 * Las cifras que el Gobierno decreta cada año y que la nómina necesita para liquidar.
 * Una fila por año: la nómina de un periodo usa la del año de ese periodo.
 */
export interface ThParametroNomina {
  parametroId: number;
  anio: number;
  smmlv: string;
  auxilioTransporte: string;
  /** UVT del año. Sin ella no hay retención en la fuente que calcular. */
  uvt: string;
  observaciones: string | null;
}

/** Lo que cada persona puede restar de su base gravable durante el año. */
export interface ThRetencionFicha {
  retencionId: number;
  personaId: number;
  anio: number;
  /** «FIJO» es la cifra del certificado; «PORCENTAJE» liquida contra lo devengado del mes. */
  viviendaModo: 'FIJO' | 'PORCENTAJE';
  viviendaValor: string;
  viviendaPorcentaje: string;
  dependientes: string;
  medicinaPrepagada: string;
  pensionesVoluntarias: string;
  afc: string;
  sujeto: boolean;
  observaciones: string | null;
}

/** Una fila de la tabla de retenciones: la persona y su ficha, si ya la tiene. */
export interface ThRetencionFila {
  personaId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  empresaProyecto: string | null;
  salario: string | null;
  ficha: ThRetencionFicha | null;
}

/**
 * Una entidad financiera y el código con que la identifica el archivo plano que se sube
 * al portal bancario. El código lo define el banco pagador, no nosotros.
 */
export interface ThBanco {
  bancoId: number;
  codigo: number;
  nombre: string;
  activo: boolean;
}

/** El documento con el que se le pide a Tesorería que disperse. */
export interface ThSolicitudPago {
  solicitudId: number;
  fecha: string;
  concepto: string;
  periodo: string | null;
  estado: string;
  observaciones: string | null;
  creadoPor: string | null;
}

export interface ThSolicitudPagoResumen extends ThSolicitudPago {
  lineas: number;
  total: number;
}

export interface ThSolicitudPagoLinea {
  lineaId: number;
  solicitudId: number;
  orden: number;
  personaId: number | null;
  tipoId: string;
  identificacion: string;
  nombre: string;
  nombres: string | null;
  apellidos: string | null;
  proyecto: string | null;
  valor: string;
  banco: string | null;
  bancoCodigo: number | null;
  tipoCuenta: string | null;
  cuenta: string | null;
  observacion: string | null;
  /** Qué le impide salir en el archivo del banco. Vacío = lista para subir. */
  faltantes: string[];
}

export interface ThSolicitudPagoDetalle {
  solicitud: ThSolicitudPago;
  lineas: ThSolicitudPagoLinea[];
  total: number;
  incompletas: number;
}

/** Una fila del archivo plano, ya con los códigos que espera el portal. */
export interface FilaArchivoBanco {
  tipoId: number;
  identificacion: string;
  nombres: string;
  apellidos: string;
  codigoBanco: number;
  tipoProducto: string;
  numeroProducto: string;
  valor: number;
}

export interface ArchivoBanco {
  solicitud: ThSolicitudPago;
  filas: FilaArchivoBanco[];
  total: number;
  excluidas: Array<{ nombre: string; faltantes: string[] }>;
}

const BASE = '/talento-humano';
const PAGOS = '/pagos';

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

  /** Registra la cuota del mes o un abono extraordinario. Mueve lo descontado y el saldo. */
  async registrarPago(prestamoId: number, payload: {
    anio: number; mes: number; valor: number | string;
    tipo?: string; medio?: string; fecha?: string | null; observaciones?: string | null;
  }) {
    const { data } = await api.post<ThPrestamoPago>(`${BASE}/prestamos/${prestamoId}/pagos`, payload);
    return data;
  },
  /** Borra un pago y le devuelve la plata al saldo. */
  async eliminarPago(prestamoId: number, pagoId: number) {
    await api.delete(`${BASE}/prestamos/${prestamoId}/pagos/${pagoId}`);
  },

  // ── Parámetros de nómina ──
  async listParametros() {
    const { data } = await api.get<ThParametroNomina[]>(`${BASE}/parametros`);
    return data;
  },
  /** `null` si ese año todavía no se ha cargado. */
  async getParametros(anio: number) {
    const { data } = await api.get<ThParametroNomina | null>(`${BASE}/parametros/${anio}`);
    return data;
  },
  async guardarParametros(payload: Partial<ThParametroNomina>) {
    const { data } = await api.post<ThParametroNomina>(`${BASE}/parametros`, payload);
    return data;
  },
  async borrarParametros(anio: number) {
    await api.delete(`${BASE}/parametros/${anio}`);
  },

  // ── Tabla de retenciones ──
  /** Todo el personal activo del año, con su ficha de deducciones si la tiene. */
  async listRetenciones(anio: number) {
    const { data } = await api.get<ThRetencionFila[]>(`${BASE}/retenciones/${anio}`);
    return data;
  },
  async guardarRetencion(payload: Partial<ThRetencionFicha> & { personaId: number; anio: number }) {
    const { data } = await api.post<ThRetencionFicha>(`${BASE}/retenciones`, payload);
    return data;
  },
  async borrarRetencion(anio: number, personaId: number) {
    await api.delete(`${BASE}/retenciones/${anio}/${personaId}`);
  },

  // ── Catálogo de bancos ──
  async listBancos() {
    const { data } = await api.get<ThBanco[]>(`${BASE}/bancos`);
    return data;
  },
  async guardarBanco(payload: { codigo: number; nombre: string; activo?: boolean }) {
    const { data } = await api.post<ThBanco>(`${BASE}/bancos`, payload);
    return data;
  },
  async borrarBanco(codigo: number) {
    await api.delete(`${BASE}/bancos/${codigo}`);
  },

  // ── Solicitudes de pago ──
  async listSolicitudesPago() {
    const { data } = await api.get<ThSolicitudPagoResumen[]>(`${PAGOS}/solicitudes`);
    return data;
  },
  async getSolicitudPago(id: number) {
    const { data } = await api.get<ThSolicitudPagoDetalle>(`${PAGOS}/solicitudes/${id}`);
    return data;
  },
  async crearSolicitudPago(payload: {
    fecha?: string;
    concepto?: string;
    periodo?: string | null;
    observaciones?: string | null;
  }) {
    const { data } = await api.post<ThSolicitudPagoDetalle>(`${PAGOS}/solicitudes`, payload);
    return data;
  },
  async actualizarSolicitudPago(
    id: number,
    payload: { fecha?: string; concepto?: string; estado?: string; observaciones?: string | null },
  ) {
    const { data } = await api.patch<ThSolicitudPagoDetalle>(`${PAGOS}/solicitudes/${id}`, payload);
    return data;
  },
  async regenerarSolicitudPago(id: number) {
    const { data } = await api.post<ThSolicitudPagoDetalle>(`${PAGOS}/solicitudes/${id}/regenerar`, {});
    return data;
  },
  /** Completa lo que faltaba leyendo otra vez las fichas, sin botar lo editado a mano. */
  async refrescarBancariosSolicitud(id: number) {
    const { data } = await api.post<ThSolicitudPagoDetalle>(
      `${PAGOS}/solicitudes/${id}/refrescar-bancarios`, {},
    );
    return data;
  },
  async guardarLineaPago(id: number, payload: Partial<ThSolicitudPagoLinea> & { lineaId?: number }) {
    const { data } = await api.post<ThSolicitudPagoDetalle>(`${PAGOS}/solicitudes/${id}/lineas`, payload);
    return data;
  },
  async borrarLineaPago(id: number, lineaId: number) {
    const { data } = await api.delete<ThSolicitudPagoDetalle>(
      `${PAGOS}/solicitudes/${id}/lineas/${lineaId}`,
    );
    return data;
  },
  async borrarSolicitudPago(id: number) {
    await api.delete(`${PAGOS}/solicitudes/${id}`);
  },
  async archivoBanco(id: number) {
    const { data } = await api.get<ArchivoBanco>(`${PAGOS}/solicitudes/${id}/archivo-banco`);
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
  /** Lo que hay que descontarle este mes a cada préstamo que todavía debe. */
  async cierrePrestamos(anio: number, mes: number) {
    const { data } = await api.get<FilaCierrePrestamo[]>(
      `${BASE}/prestamos/cierre?anio=${anio}&mes=${mes}`,
    );
    return data;
  },
  /** Guarda el mes entero. El servidor lo hace en una sola transacción. */
  async guardarCierrePrestamos(
    anio: number,
    mes: number,
    filas: { prestamoId: number; valor: number }[],
  ) {
    const { data } = await api.post<{ anio: number; mes: number; prestamos: number; total: number }>(
      `${BASE}/prestamos/cierre`,
      { anio, mes, filas },
    );
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

/**
 * Quién ve **Solicitudes de pago**, que es más cerrado que el resto del módulo.
 *
 * Ahí está el archivo que se sube al portal bancario, con la cuenta de cada empleado y lo
 * que se le gira. Lo ve quien hace el giro —la Coordinación Financiera que recibe la
 * liquidación— y el PMO, que es quien arma el documento.
 *
 * Se compara por rol **y por nombre** porque hay dos usuarias con el rol de Coordinación
 * Financiera y la nómina es de una sola. Espejo de `PagosAccesoGuard` en el backend, que
 * es quien de verdad cierra el API: esto solo evita pintar una tarjeta que daría 403.
 */
const PAGOS_ROL_FINANCIERO = 'coordinador financiero';
const PAGOS_NOMBRE_CONTIENE = 'osorio';

export const puedeVerSolicitudesPago = (
  nombreRol?: string | null,
  nombre?: string | null,
): boolean => {
  const rol = (nombreRol ?? '').trim().toLowerCase();
  if (rol === 'analista pmo' || rol === 'director pmo') return true;
  return (
    rol === PAGOS_ROL_FINANCIERO &&
    (nombre ?? '').toLowerCase().includes(PAGOS_NOMBRE_CONTIENE)
  );
};
