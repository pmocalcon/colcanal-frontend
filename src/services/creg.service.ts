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
  /** Eficiencia luminosa [Lm/W]: distingue sodio (130) de LED (160) dentro de un grupo. */
  efficiencyLmW: number | null;
  ippFactor: number;
  hasCostSheet: boolean;
  /**
   * Cerrada para edición: tiene hoja de costos y nadie la ha reabierto. La hoja
   * alimenta censo, presupuestos y liquidación, así que solo el Director Técnico
   * puede reabrirla, y al guardar se vuelve a cerrar.
   */
  bloqueada?: boolean;
  reabiertaEn?: string | null;
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
  efficiencyLmW?: number | null;
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

/**
 * Cierre mensual: lo comparten la Liquidación, ID OFF e ID ON. El Director
 * Técnico aprueba un mes y ese mes queda congelado en la base; puede reabrirlo,
 * y cada reapertura deja rastro.
 */
export type CregHojaMensual = 'liquidacion' | 'idd-off' | 'idd-on';

export interface CregMesCerrable {
  aprobado?: boolean;
  aprobadoEn?: string;
  aprobadoPor?: number;
  aprobadoPorNombre?: string | null;
  reaperturas?: {
    aprobadoEn?: string;
    aprobadoPorNombre?: string | null;
    reabiertoEn: string;
    reabiertoPorNombre?: string | null;
    motivo?: string | null;
  }[];
}

/** Datos propios de un mes liquidado (lo demás se calcula del censo + parámetros). */
export interface LiquidacionMes extends CregMesCerrable {
  /** IPP(m-1) usado en el mes. Si no se define, se toma el de Parámetros. */
  ippMes?: number | null;
  ajusteAom?: number | null;
  ajusteInv?: number | null;
  /** Ajuste de costos ambientales y CVURA. Solo aplican en la Res. 101-013. */
  ajusteAmb?: number | null;
  valorChura?: number | null;
  observacion?: string;
}

export interface CregLiquidacion {
  companyId: number;
  projectId: number | null;
  /** { meses: { [YYYY-MM]: LiquidacionMes } } */
  data: { meses?: Record<string, LiquidacionMes> } | null;
  exists: boolean;
}

// ---- IDD OFF: indice de disponibilidad (apagadas) ----

/** Una luminaria fuera de servicio en el periodo. */
export interface IddOffFalla {
  id: string;
  codigo?: string;
  /** Potencia nominal [W]. */
  potencia?: number | null;
  /** Potencia con pérdidas [W]: es la que pesa en Wi × HSSi. */
  potenciaXl?: number | null;
  tecnologia?: string;
  localizacion?: string;
  barrio?: string;
  fechaInicial?: string;
  fechaFinal?: string;
}

/** Horas de operación que se facturan por día (12 h nocturnas). */
export const HORAS_OPERACION_DIA = 12;

/**
 * Horas fuera de servicio. Dos fórmulas conviven según el proyecto, controladas
 * por `sumaMediaNoche`:
 *
 *   sin +12  `=(final − inicial) × 12`        mismo día = 0   (Puerto Asís)
 *   con +12  `=(DIAS(final;inicial)×12) + 12` mismo día = 12  (CT / Op. General)
 *
 * El +12 cuenta la noche del día del reporte como falla completa. Es una regla
 * de negocio por proyecto (interruptor en la página IDD OFF), no global.
 * Verificado: Puerto Asís jun-2026 total = 60 (sin +12); CT jun-2026 = 456 (con).
 */
export const horasFuera = (f: IddOffFalla, sumaMediaNoche = false): number => {
  if (!f.fechaInicial || !f.fechaFinal) return 0;
  const ini = Date.parse(`${f.fechaInicial}T00:00:00`);
  const fin = Date.parse(`${f.fechaFinal}T00:00:00`);
  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin < ini) return 0;
  const dias = Math.round((fin - ini) / 86_400_000);
  return (dias + (sumaMediaNoche ? 1 : 0)) * HORAS_OPERACION_DIA;
};

export interface IddOffMes extends CregMesCerrable {
  /** WT: potencia total instalada del periodo [kW]. */
  wt?: number | null;
  /** T: horas del periodo (p. ej. 30 días × 12 h = 360). */
  t?: number | null;
  fallas: IddOffFalla[];
}

export interface CregIddOff {
  companyId: number;
  projectId: number | null;
  data: {
    meses?: Record<string, IddOffMes>;
    /** Suma la noche del día del reporte (+12 h) en las Horas. Por proyecto. */
    sumaMediaNoche?: boolean;
  } | null;
  exists: boolean;
}

/**
 * Wi × HSSi de una falla, en kWh. Excel: `=+D7/1000*J7`, donde D es la potencia
 * CON PÉRDIDAS (no la nominal) y J las horas fuera de servicio.
 *
 * Si falta la potencia con pérdidas cae a la nominal: dejarla en 0 sacaría una
 * falla real del índice, y eso sube el ID y con él lo que se factura.
 */
export const wiHssi = (f: IddOffFalla, sumaMediaNoche = false): number =>
  ((f.potenciaXl ?? f.potencia ?? 0) / 1000) * horasFuera(f, sumaMediaNoche);

/**
 * Índice de disponibilidad del periodo: ID = 1 − Σ(Wi × HSSi) / (WT × T).
 * Devuelve null si falta WT o T, en vez de un 1 que parecería "todo disponible".
 * Verificado contra el Excel de Puerto Asís (junio 2025): 0,999838634.
 */
export const indiceDisponibilidad = (
  fallas: IddOffFalla[],
  wt: number | null | undefined,
  t: number | null | undefined,
  sumaMediaNoche = false,
): number | null => {
  if (wt == null || t == null || wt <= 0 || t <= 0) return null;
  const suma = fallas.reduce((a, f) => a + wiHssi(f, sumaMediaNoche), 0);
  return 1 - suma / (wt * t);
};

// ---- ID ON: índice de disponibilidad (encendidas) ----

/**
 * Una luminaria prendida cuando debería estar apagada.
 *
 * A diferencia de IddOffFalla trae hora inicial y final: una luminaria prendida
 * de día se mide en horas, no en días completos.
 */
export interface IddOnFalla {
  id: string;
  codigo?: string;
  /** Potencia nominal [W]. */
  potencia?: number | null;
  /** Potencia con pérdidas [W]: es la que pesa en Qi × Ti. */
  potenciaXl?: number | null;
  localizacion?: string;
  barrio?: string;
  fechaInicial?: string;
  fechaFinal?: string;
  /** HH:MM o HH:MM:SS. */
  horaInicial?: string;
  /** HH:MM o HH:MM:SS. */
  horaFinal?: string;
}

/** 'HH:MM' | 'HH:MM:SS' -> horas decimales. Vacío o inválido = 0. */
const horaEnHoras = (hhmm?: string): number => {
  if (!hhmm) return 0;
  const [h, m, s] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return 0;
  return h + (Number.isFinite(m) ? m : 0) / 60 + (Number.isFinite(s) ? s : 0) / 3600;
};

export interface IddOnMes extends CregMesCerrable {
  /** WT: potencia total instalada del periodo [kW]. */
  wt?: number | null;
  /** T: horas del periodo (p. ej. 30 días × 12 h = 360). */
  t?: number | null;
  /** TEEn: tarifa de suministro en nivel de tensión 2 [$/kWh]. */
  teen?: number | null;
  fallas: IddOnFalla[];
}

export interface CregIddOn {
  companyId: number;
  projectId: number | null;
  data: { meses?: Record<string, IddOnMes> } | null;
  exists: boolean;
}

/**
 * Ti: horas encendida = (fechaFinal − fechaInicial) × 12 + (horaFinal − horaInicial).
 *
 * Excel: `=(I6-H6)*12+(K6-J6)*24`. El primer término cuenta 12 horas por cada
 * día completo (las horas de operación, igual que en la hoja de apagadas); el
 * segundo, la diferencia de hora del día. Ojo: NO es la diferencia continua de
 * fecha+hora — un día entero pesa 12 h, no 24.
 *
 * Verificado contra el Excel (jun-2026): 26/05 4:10:00 p.m. → 4:26:49 p.m. da
 * 0,2803 h; con potencia 56 W, Qi×Ti = 0,015696 y VCEEIn = 10,53.
 */
export const horasEncendida = (f: IddOnFalla): number => {
  if (!f.fechaInicial || !f.fechaFinal) return 0;
  const d0 = Date.parse(`${f.fechaInicial}T00:00:00`);
  const d1 = Date.parse(`${f.fechaFinal}T00:00:00`);
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return 0;
  const dias = Math.round((d1 - d0) / 86_400_000);
  const ti = dias * HORAS_OPERACION_DIA + (horaEnHoras(f.horaFinal) - horaEnHoras(f.horaInicial));
  return ti > 0 ? ti : 0;
};

/**
 * Qi × Ti de una encendida, en kWh: potencia con pérdidas × horas / 1000.
 * Mismo armado que Wi × HSSi en la hoja de apagadas.
 */
export const qiTi = (f: IddOnFalla): number =>
  ((f.potenciaXl ?? f.potencia ?? 0) / 1000) * horasEncendida(f);

/**
 * ID de las encendidas: 1 − Σ(Qi × Ti) / (WT × T).
 * Verificado contra el Excel: `=1-L8/(L9*L11)`.
 */
export const indiceDisponibilidadOn = (
  fallas: IddOnFalla[],
  wt: number | null | undefined,
  t: number | null | undefined,
): number | null => {
  if (wt == null || t == null || wt <= 0 || t <= 0) return null;
  const suma = fallas.reduce((a, f) => a + qiTi(f), 0);
  return 1 - suma / (wt * t);
};

/**
 * VCEEIn: valor del consumo de energía de las luminarias por indisponibilidad,
 * en pesos = Σ(Qi × Ti) [kWh] × TEEn [$/kWh].
 *
 * Verificado contra el Excel (jun-2026): 0,015696 kWh × 671,20 $/kWh = 10,53.
 */
export const vceein = (
  fallas: IddOnFalla[],
  teen: number | null | undefined,
): number | null => {
  if (teen == null) return null;
  return fallas.reduce((a, f) => a + qiTi(f), 0) * teen;
};

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

  /**
   * Reabre una UCAP cerrada para poder editarla. Solo el Director Técnico; al
   * guardar la hoja se vuelve a cerrar sola.
   */
  async reabrirUnit(ucapId: number): Promise<CregUnit> {
    const { data } = await api.post<CregUnit>(`${BASE}/units/${ucapId}/reabrir`, {});
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

  /**
   * Serie del IPP mes a mes. No lleva municipio: el índice lo publica el DANE y
   * es el mismo para todos los contratos.
   */
  async getIppMensual(): Promise<Record<string, number>> {
    const { data } = await api.get<{ valores: Record<string, number> }>(`${BASE}/ipp-mensual`);
    return data?.valores ?? {};
  },

  /** Reemplaza la serie completa: un mes ausente se borra. */
  async saveIppMensual(valores: Record<string, number>): Promise<Record<string, number>> {
    const { data } = await api.put<{ valores: Record<string, number> }>(
      `${BASE}/ipp-mensual`,
      { valores },
    );
    return data?.valores ?? {};
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

  /**
   * Aprueba y cierra un mes de cualquiera de las tres hojas mensuales. Solo el
   * Director Técnico; el backend notifica por correo al Director de Proyecto del
   * municipio y devuelve a quiénes alcanzó a avisar.
   */
  async aprobarMes(
    hoja: CregHojaMensual,
    companyId: number,
    ym: string,
    projectId?: number | null,
  ): Promise<{ data: { meses?: Record<string, any> } | null; notificados: string[] }> {
    const { data } = await api.post(
      `${BASE}/${hoja}/${companyId}/aprobar`,
      { ym },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },

  /** Reabre un mes cerrado (solo Director Técnico). Queda en el historial. */
  async reabrirMes(
    hoja: CregHojaMensual,
    companyId: number,
    ym: string,
    projectId?: number | null,
    motivo?: string,
  ): Promise<{ data: { meses?: Record<string, any> } | null }> {
    const { data } = await api.post(
      `${BASE}/${hoja}/${companyId}/reabrir`,
      { ym, motivo },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },

  // ---- IDD OFF ----

  async getIddOff(companyId: number, projectId?: number | null): Promise<CregIddOff> {
    const { data } = await api.get<CregIddOff>(`${BASE}/idd-off/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveIddOff(
    companyId: number,
    payload: { meses: Record<string, IddOffMes>; sumaMediaNoche?: boolean },
    projectId?: number | null,
  ): Promise<CregIddOff> {
    const { data } = await api.put<CregIddOff>(
      `${BASE}/idd-off/${companyId}`,
      { data: payload },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },

  // ---- ID ON ----

  async getIddOn(companyId: number, projectId?: number | null): Promise<CregIddOn> {
    const { data } = await api.get<CregIddOn>(`${BASE}/idd-on/${companyId}`, {
      params: projectId != null ? { projectId } : undefined,
    });
    return data;
  },

  async saveIddOn(
    companyId: number,
    payload: { meses: Record<string, IddOnMes> },
    projectId?: number | null,
  ): Promise<CregIddOn> {
    const { data } = await api.put<CregIddOn>(
      `${BASE}/idd-on/${companyId}`,
      { data: payload },
      { params: projectId != null ? { projectId } : undefined },
    );
    return data;
  },
};
