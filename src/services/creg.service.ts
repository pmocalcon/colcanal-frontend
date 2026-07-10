import api from './api';

// ============ TIPOS ============

export type CregItemSection = 'material' | 'transporte' | 'obra_civil' | 'montaje';

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

  async clearSheet(ucapId: number): Promise<{ message: string }> {
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
};
