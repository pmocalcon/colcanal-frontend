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

const BASE = '/nomina';

export const nominaService = {
  async listPeriodos() {
    const { data } = await api.get<string[]>(`${BASE}/periodos`);
    return data;
  },
  async listNovedades(periodo: string) {
    const { data } = await api.get<ThPersonaConNovedad[]>(`${BASE}/novedades`, { params: { periodo } });
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
