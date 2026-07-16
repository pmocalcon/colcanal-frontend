import api from './api';

/**
 * Lista fija de grupos/categorías de UCAP, en el orden en que se muestran.
 * (Confirmar/completar con el listado oficial del negocio.)
 */
export const UCAP_GRUPOS = [
  'LUMINARIAS',
  'FOTOCONTROLES',
  'ELEMENTOS DE SOPORTE',
  'BOMBILLAS',
  'POSTES',
  'REDES',
  'CANALIZACIONES',
  'TRANSFORMADORES',
  'MEDIDORES',
  'PUESTA A TIERRA',
  'TELEGESTIÓN',
] as const;

// ============ TIPOS ============

export type CregItemSection = 'material' | 'transporte' | 'obra_civil' | 'montaje';

/** Apellido/variante de una UCAP. */
export interface UcapApellido {
  apellidoId: number;
  ucapId?: number;
  apellido: string;
  sortOrder?: number;
}

export interface CregConfig {
  configId?: number;
  companyId: number;
  projectId?: number | null;
  pctTransport: number;
  pctEngineering: number;
  pctAdministration: number;
  pctInspection: number;
  pctInterventoria: number;
  pctFinancial: number;
  pctRetieRetilap: number;
  pctEnvironmental: number;
  ippBase: number | null;
  ippCurrent: number | null;
  /** IPP base del municipio/proyecto (company.ippInitialValue). No editable. */
  companyIppBase: number | null;
  /** true si los % provienen de la hoja de Parámetros del municipio. */
  fromParametros: boolean;
  exists: boolean;
}

export interface UpsertCregConfigPayload {
  pctEngineering: number;
  pctAdministration: number;
  pctInspection: number;
  pctInterventoria: number;
  pctFinancial: number;
  ippBase?: number | null;
  ippCurrent?: number | null;
}

export interface CregUnitItem {
  itemId?: number;
  section: CregItemSection;
  materialId?: number | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total?: number;
  sortOrder?: number;
}

export interface CregUnitTotals {
  subtotalMaterials: number;
  subtotalTransporte: number;
  subtotalObraCivil: number;
  subtotalMontaje: number;
  subtotalDirectos: number;
  indirect: {
    transport: number;
    engineering: number;
    administration: number;
    inspection: number;
    interventoria: number;
    retieRetilap: number;
    financial: number;
    environmental: number;
  };
  totalIndirectos: number;
  totalUnit: number;
  ippFactor: number;
  finalValue: number;
}

/** Hoja de costos CREG guardada dentro de una UCAP. */
export interface CregUnit {
  ucapId: number;
  companyId: number;
  projectId: number | null;
  code: string;
  name: string;
  /** Grupo/categoría de la UCAP (para agrupar en las tablas). */
  grupo: string | null;
  /** Apellidos/variantes de la UCAP (mismo nombre base, distinto origen). */
  apellidos: UcapApellido[];
  value: number;
  /** IPP inicial propio de la UCAP (columna "IPP inicial" de la lista). */
  initialIpp: number | null;
  pct: {
    transport: number | null;
    engineering: number | null;
    administration: number | null;
    inspection: number | null;
    interventoria: number | null;
    financial: number | null;
    retieRetilap: number | null;
    environmental: number | null;
  };
  ippBase: number | null;
  ippCurrent: number | null;
  ucapMonth: number | null;
  ucapYear: number | null;
  powerNominal: number | null;
  powerLosses: number | null;
  powerWithLosses: number | null;
  ippFactor: number;
  hasCostSheet: boolean;
  items: CregUnitItem[];
  totals: CregUnitTotals;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveUcapCostSheetPayload {
  /** Datos de la propia UCAP, editables desde la hoja de costos. */
  code?: string;
  description?: string;
  grupo?: string | null;
  initialIpp?: number | null;
  /** Solo se usa cuando la hoja no tiene líneas. */
  roundedValue?: number | null;
  pctEngineering: number;
  pctAdministration: number;
  pctInspection: number;
  pctInterventoria: number;
  pctFinancial: number;
  pctTransport?: number;
  pctRetieRetilap?: number;
  pctEnvironmental?: number;
  ippCurrent?: number | null;
  ucapMonth?: number | null;
  ucapYear?: number | null;
  powerNominal?: number | null;
  powerLosses?: number | null;
  items: Array<Omit<CregUnitItem, 'itemId' | 'total'>>;
}

/** Crea la UCAP y su hoja de costos en una sola llamada. */
export interface CreateCregUnitPayload extends SaveUcapCostSheetPayload {
  companyId: number;
  projectId?: number | null;
  code: string;
  description: string;
}

// ============ Parametrizacion por municipio ============

export interface CregParametrizacion {
  companyId: number;
  projectId: number | null;
  /** JSON libre con todos los parametros (ver defaults en CregParametrosPage). */
  data: Record<string, any> | null;
  exists: boolean;
}

export interface CregCenso {
  companyId: number;
  projectId: number | null;
  /** { fechaInicio, fechaFinal, mesInicial, quantities: { [ucapId]: { [YYYY-MM]: number } } } */
  data: Record<string, any> | null;
  exists: boolean;
}

/** Datos propios de un mes liquidado (lo demás se calcula del censo + parámetros). */
export interface LiquidacionMes {
  /** IPP(m-1) usado en el mes. Si no se define, se toma el de Parámetros. */
  ippMes?: number | null;
  ajusteAom?: number | null;
  ajusteInv?: number | null;
  observacion?: string;
}

export interface CregLiquidacion {
  companyId: number;
  projectId: number | null;
  /** { meses: { [YYYY-MM]: LiquidacionMes } } */
  data: { meses?: Record<string, LiquidacionMes> } | null;
  exists: boolean;
}

export interface CregSummaryMunicipio {
  companyId: number;
  projectId: number | null;
  name: string;
  count: number;
  value: number;
}

export interface CregSummary {
  totalUcapsAll: number;
  totalUcaps: number;
  totalValue: number;
  municipios: number;
  byMunicipio: CregSummaryMunicipio[];
}

// ============ SERVICIO ============

const BASE = '/creg';

export const cregService = {
  async getConfig(companyId: number, projectId?: number | null): Promise<CregConfig> {
    const { data } = await api.get<CregConfig>(`${BASE}/config/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveConfig(companyId: number, payload: UpsertCregConfigPayload, projectId?: number | null): Promise<CregConfig> {
    const { data } = await api.put<CregConfig>(`${BASE}/config/${companyId}`, payload, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async getUnits(companyId: number, projectId?: number | null): Promise<CregUnit[]> {
    const { data } = await api.get<CregUnit[]>(`${BASE}/units`, {
      params: projectId != null ? { companyId, projectId } : { companyId },
    });
    return data;
  },

  async getUnit(ucapId: number): Promise<CregUnit> {
    const { data } = await api.get<CregUnit>(`${BASE}/units/${ucapId}`);
    return data;
  },

  async createUnit(payload: CreateCregUnitPayload): Promise<CregUnit> {
    const { data } = await api.post<CregUnit>(`${BASE}/units`, payload);
    return data;
  },

  async saveSheet(ucapId: number, payload: SaveUcapCostSheetPayload): Promise<CregUnit> {
    const { data } = await api.put<CregUnit>(`${BASE}/units/${ucapId}`, payload);
    return data;
  },

  // ---- Apellidos/variantes de una UCAP ----

  async getApellidos(ucapId: number): Promise<UcapApellido[]> {
    const { data } = await api.get<UcapApellido[]>(`${BASE}/units/${ucapId}/apellidos`);
    return data;
  },

  /** Agrega un apellido/variante a la UCAP. */
  async addApellido(ucapId: number, apellido: string): Promise<UcapApellido> {
    const { data } = await api.post<UcapApellido>(`${BASE}/units/${ucapId}/apellidos`, { apellido });
    return data;
  },

  /** Renombra un apellido/variante. */
  async renameApellido(apellidoId: number, apellido: string): Promise<UcapApellido> {
    const { data } = await api.patch<UcapApellido>(`${BASE}/apellidos/${apellidoId}`, { apellido });
    return data;
  },

  /** Elimina un apellido/variante (idempotente: 'alreadyGone' si ya no existía). */
  async deleteApellido(apellidoId: number): Promise<{ message: string; apellidoId: number; ucapId: number | null; alreadyGone?: boolean }> {
    const { data } = await api.delete<{ message: string; apellidoId: number; ucapId: number | null; alreadyGone?: boolean }>(`${BASE}/apellidos/${apellidoId}`);
    return data;
  },

  /** Borra solo la hoja de costos, dejando la UCAP. */
  async clearSheet(ucapId: number): Promise<{ message: string }> {
    const { data } = await api.delete<{ message: string }>(`${BASE}/units/${ucapId}/sheet`);
    return data;
  },

  /** Elimina la UCAP por completo (libera el código). Falla si está en uso. */
  async deleteUnit(ucapId: number): Promise<{ message: string }> {
    const { data } = await api.delete<{ message: string }>(`${BASE}/units/${ucapId}`);
    return data;
  },

  async getParametrizacion(companyId: number, projectId?: number | null): Promise<CregParametrizacion> {
    const { data } = await api.get<CregParametrizacion>(`${BASE}/parametrizacion/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveParametrizacion(
    companyId: number,
    payload: Record<string, any>,
    projectId?: number | null,
  ): Promise<CregParametrizacion> {
    const { data } = await api.put<CregParametrizacion>(
      `${BASE}/parametrizacion/${companyId}`,
      { data: payload },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },

  async getSummary(): Promise<CregSummary> {
    const { data } = await api.get<CregSummary>(`${BASE}/summary`);
    return data;
  },

  async getCenso(companyId: number, projectId?: number | null): Promise<CregCenso> {
    const { data } = await api.get<CregCenso>(`${BASE}/censo/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveCenso(
    companyId: number,
    payload: Record<string, any>,
    projectId?: number | null,
  ): Promise<CregCenso> {
    const { data } = await api.put<CregCenso>(
      `${BASE}/censo/${companyId}`,
      { data: payload },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },

  // ---- Liquidacion mensual ----

  async getLiquidacion(companyId: number, projectId?: number | null): Promise<CregLiquidacion> {
    const { data } = await api.get<CregLiquidacion>(`${BASE}/liquidacion/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveLiquidacion(
    companyId: number,
    payload: { meses: Record<string, LiquidacionMes> },
    projectId?: number | null,
  ): Promise<CregLiquidacion> {
    const { data } = await api.put<CregLiquidacion>(
      `${BASE}/liquidacion/${companyId}`,
      { data: payload },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },
};
