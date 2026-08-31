import api from './api';

/**
 * Nómina: novedades del mes y liquidación. Espeja el Excel "Prueba Nómina.xlsx"
 * (hojas NOVEDADES NÓMINA y NÓMINA).
 */

export interface ThPersonaConNovedad {
  personaId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  empresaProyecto: string | null;
  salario: string | null;
  auxilioRodamiento: string | null;
  /** Tarifa ARL, fracción (0.0435 = 4,35 %). De referencia, no se usa en ningún cálculo. */
  nivelRiesgo: string | null;
  /** La cuota marcada por Contabilidad como "CUOTA A DESCONTAR" para esta nómina. */
  prestamoCuota: number;
  novedad: NovedadNomina | null;
  sugerencias: SugerenciasNovedad;
}

/**
 * Lo que los formatos ya aprobados aportan a la novedad del periodo: horas extras de las
 * planillas GTH-016-F, incapacidad de `th_incapacidades` y vacaciones de los GTH-018-F.
 *
 * `null` es "ningún formato dice nada de esto", que no es lo mismo que cero. Lo que se
 * digite a mano manda sobre esto.
 */
export interface SugerenciasNovedad {
  horasExtrasValor: number | null;
  recargoNocturnoValor: number | null;
  incapacidadEmpresa: number | null;
  incapacidadEmpleado: number | null;
  vacacionesHabiles: number | null;
  /** La cuota de la póliza funeraria que tiene la persona en su ficha de personal. */
  serviciosGruporecordar: number | null;
  /**
   * Días que bajan de los 30 por vacaciones disfrutadas, incapacidad que asume la empresa
   * y permisos no remunerados. Los días trabajados sugeridos son 30 − diasDescontados.
   */
  diasDescontados: number | null;
  /** De dónde salió: "Incapacidades", "Horas extras", "Vacaciones", "Permiso no remunerado", "Póliza funeraria". */
  origen: string[];
}

export interface NovedadNomina {
  novedadId: number;
  periodo: string;
  identificacion: string;
  nombre: string;
  diasTrabajados: number;
  horasExtrasValor: string | null;
  recargoNocturnoValor: string | null;
  bonificaciones: string | null;
  embargo: string | null;
  incapacidadEmpresa: string | null;
  incapacidadEmpleado: string | null;
  incapacidadOtros: string | null;
  vacacionesHabiles: string | null;
  vacacionesNoHabiles: string | null;
  retencionFuente: string | null;
  serviciosGruporecordar: string | null;
  observaciones: string | null;
}

export interface CamposNovedad {
  diasTrabajados?: number;
  horasExtrasValor?: string | number | null;
  recargoNocturnoValor?: string | number | null;
  bonificaciones?: string | number | null;
  embargo?: string | number | null;
  incapacidadEmpresa?: string | number | null;
  incapacidadEmpleado?: string | number | null;
  incapacidadOtros?: string | number | null;
  vacacionesHabiles?: string | number | null;
  vacacionesNoHabiles?: string | number | null;
  retencionFuente?: string | number | null;
  serviciosGruporecordar?: string | number | null;
  observaciones?: string | null;
}

export interface FilaNomina {
  personaId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  proyecto: string | null;
  /** Tiene más de un contrato activo (varias empresas del grupo): el préstamo de esta
   * fila es la cuota completa, sin repartir entre proyectos. */
  multiEmpresa: boolean;
  salarioBasico: number;
  diasTrabajados: number;
  devengadoBasico: number;
  horasExtras: number;
  recargoNocturno: number;
  auxilioRodamiento: number;
  bonificacion: number;
  incapacidadEmpresa: number;
  incapacidadEmpleado: number;
  incapacidadOtros: number;
  vacacionesHabiles: number;
  vacacionesNoHabiles: number;
  auxilioTransporte: number;
  totalDevengado: number;
  ibc: number;
  salud: number;
  pension: number;
  fsp: number;
  retencionFuente: number;
  bonificacionDeduccion: number;
  prestamo: number;
  embargos: number;
  serviciosGruporecordar: number;
  totalDeduccion: number;
  netoPagar: number;
}

export interface ResumenNomina {
  generado: boolean;
  empleados: number;
  totalDevengado: number;
  totalDeduccion: number;
  netoPagar: number;
}

/**
 * Una persona vista desde la validación: lo que el sistema calculó, lo que le falta a su
 * ficha y el visto bueno que ya tenga.
 */
export interface PersonaValidacion {
  personaId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  proyecto: string | null;
  estado: string | null;
  banco: string | null;
  cuenta: string | null;
  tipoCuenta: string | null;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  salario: string | null;
  liquidacion: FilaNomina;
  /** Vacío significa que la ficha está completa. */
  faltantes: string[];
  validacion: ValidacionNomina | null;
  /** true si la nómina cambió después de validarla: el visto bueno quedó viejo. */
  desactualizada: boolean;
}

export interface ValidacionNomina {
  validacionId: number;
  periodo: string;
  personaId: number;
  identificacion: string;
  nombre: string;
  netoCalculado: string;
  netoDigitado: string;
  validadoPor: string | null;
  validadoEn: string | null;
  observaciones: string | null;
}

export interface EnvioNomina {
  envioId: number;
  periodo: string;
  destinatarios: string | null;
  empleados: number;
  totalNeto: string;
  enviadoPor: string | null;
  enviadoEn: string | null;
  correoEnviado: boolean;
}

/** Lo que quedó anotado en la cartera de préstamos al mandar la liquidación. */
export interface CuotasEnCartera {
  /** Cuotas nuevas que se anotaron. */
  creadas: number;
  /** Préstamos que ya tenían la cuota de ese mes y se dejaron como estaban. */
  yaEstaban: number;
  /** Cuánto sumó lo anotado. */
  total: number;
  /** Lo que no se pudo anotar y hay que mirar a mano. */
  avisos: string[];
}

export interface EstadoValidacion {
  periodo: string;
  total: number;
  validadas: number;
  conFaltantes: number;
  desactualizadas: number;
  /** Qué impide mandar la liquidación. Vacío = se puede mandar. */
  bloqueos: string[];
  envio: EnvioNomina | null;
  destinatario: string | null;
  pendientes: Array<{ personaId: number; identificacion: string; nombre: string; motivo: string }>;
  /** Todas las del periodo, en el orden de la liquidación. Es por donde se navega. */
  personas: Array<{
    personaId: number;
    identificacion: string;
    nombre: string;
    cargo: string | null;
    motivo: string;
    validada: boolean;
  }>;
  /** Solo viene al mandar la liquidación; consultando el estado va en `null`. */
  cartera: CuotasEnCartera | null;
}

const BASE = '/nomina';

export const nominaService = {
  // ── Validación antes de mandar a Financiera ──
  async estadoValidacion(periodo: string) {
    const { data } = await api.get<EstadoValidacion>(`${BASE}/validacion/estado`, { params: { periodo } });
    return data;
  },
  /** Devuelve una entrada por contrato: una cédula puede tener varios. */
  async buscarParaValidar(periodo: string, identificacion: string) {
    const { data } = await api.get<PersonaValidacion[]>(`${BASE}/validacion/persona`, {
      params: { periodo, identificacion },
    });
    return data;
  },
  async validarPersona(payload: {
    periodo: string; personaId: number; netoDigitado: number; observaciones?: string | null;
  }) {
    const { data } = await api.post<PersonaValidacion>(`${BASE}/validacion`, payload);
    return data;
  },
  async quitarValidacion(periodo: string, personaId: number) {
    await api.delete(`${BASE}/validacion`, { params: { periodo, personaId } });
  },
  async enviarLiquidacion(periodo: string) {
    const { data } = await api.post<EstadoValidacion>(`${BASE}/validacion/enviar`, { periodo });
    return data;
  },
  async anularEnvioLiquidacion(periodo: string) {
    const { data } = await api.delete<EstadoValidacion>(`${BASE}/validacion/enviar`, { params: { periodo } });
    return data;
  },

  async listPeriodos() {
    const { data } = await api.get<string[]>(`${BASE}/periodos`);
    return data;
  },
  /** `smmlv` solo hace falta para el piso legal de la incapacidad del empleado. */
  async listNovedades(periodo: string, smmlv?: number) {
    const { data } = await api.get<ThPersonaConNovedad[]>(`${BASE}/novedades`, {
      params: { periodo, smmlv },
    });
    return data;
  },
  async guardarNovedad(periodo: string, personaId: number, identificacion: string, nombre: string, campos: CamposNovedad) {
    const { data } = await api.post<NovedadNomina>(`${BASE}/novedades`, {
      periodo, personaId, identificacion, nombre, ...campos,
    });
    return data;
  },
  async getNomina(periodo: string, smmlv?: number, auxTransporte?: number) {
    const { data } = await api.get<{ generado: boolean; filas: FilaNomina[] }>(`${BASE}/liquidacion`, {
      params: { periodo, smmlv, auxTransporte },
    });
    return data;
  },
  async resumenNomina(periodo: string, smmlv?: number, auxTransporte?: number) {
    const { data } = await api.get<ResumenNomina>(`${BASE}/liquidacion/resumen`, {
      params: { periodo, smmlv, auxTransporte },
    });
    return data;
  },
  async generarNomina(periodo: string, smmlv: number, auxTransporte: number) {
    const { data } = await api.post<{ filas: FilaNomina[] }>(`${BASE}/liquidacion/generar`, {
      periodo, smmlv, auxTransporte,
    });
    return data;
  },
  async reabrirNomina(periodo: string) {
    await api.delete(`${BASE}/liquidacion`, { params: { periodo } });
  },
};
