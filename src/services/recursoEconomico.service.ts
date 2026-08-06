import api from './api';

/**
 * Recurso Económico: interventoría por año y retenciones por proyecto.
 *
 * Los proyectos son las empresas que ya existen en el sistema; el módulo no
 * lleva su propia lista de municipios.
 */

const BASE = '/recurso-economico';

/** Un proyecto dentro de un año de interventoría. */
export interface ProyectoAnio {
  /** Firma interventora de ese año. */
  firma?: string;
  /** Salarios mínimos del contrato. */
  smlv?: number | null;
  /** El contrato se factura con IVA. */
  iva?: boolean;
  /**
   * Valor escrito a mano, para el contrato que no sale de SMLV × SMMLV.
   * Vacío = se calcula.
   */
  valorManual?: number | null;
}

export interface AnioInterventoria {
  /** Salario mínimo mensual legal vigente del año. */
  smmlv?: number | null;
  /**
   * true cuando el SMMLV se trajo del año anterior al abrir la vigencia. Sirve
   * para avisar que todavía no es el del decreto: la tabla ya calcula, pero con
   * el salario viejo. Se apaga en cuanto alguien lo escribe.
   */
  smmlvHeredado?: boolean;
  /** companyId -> datos del proyecto ese año. */
  proyectos: Record<string, ProyectoAnio>;
}

/**
 * Retenciones de un proyecto, en %.
 *
 * `null` (o ausente) es **no aplica** —la celda negra del archivo— y 0 es
 * "aplica, en cero". Son cosas distintas: la primera no entra en el total.
 */
export interface RetencionProyecto {
  rteFte?: number | null;
  rteIca?: number | null;
  timbre?: number | null;
  estampillas?: number | null;
}

export interface RecursoEconomicoData {
  /** 'YYYY' -> año de interventoría. */
  anios?: Record<string, AnioInterventoria>;
  /** companyId -> retenciones. No van por año: cambian por acuerdo, no por vigencia. */
  retenciones?: Record<string, RetencionProyecto>;
}

export interface EmpresaRecurso {
  companyId: number;
  name: string;
}

/** IVA colombiano vigente, con el que se calcula el valor de interventoría. */
export const IVA = 0.19;

/**
 * Valor de interventoría del proyecto: SMLV × SMMLV, con IVA si el contrato lo
 * lleva. El valor escrito a mano manda sobre el cálculo.
 *
 * Redondeado al peso: es el valor que va a la orden de pago y no admite
 * centavos.
 */
export const valorInterventoria = (
  p: ProyectoAnio | undefined,
  smmlv: number | null | undefined,
): number | null => {
  if (!p) return null;
  if (typeof p.valorManual === 'number' && Number.isFinite(p.valorManual) && p.valorManual > 0) {
    return p.valorManual;
  }
  const smlv = typeof p.smlv === 'number' && Number.isFinite(p.smlv) ? p.smlv : null;
  if (smlv == null || !smmlv) return null;
  return Math.round(smlv * smmlv * (p.iva ? 1 + IVA : 1));
};

/**
 * Total de retenciones de un proyecto, en %. Solo suma las que aplican: una
 * retención que no rige en el municipio no es un 0, no entra.
 */
export const totalRetenciones = (r: RetencionProyecto | undefined): number | null => {
  if (!r) return null;
  const partes = [r.rteFte, r.rteIca, r.timbre, r.estampillas]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (partes.length === 0) return null;
  // Se suma en milésimas para que 0,05 % + 4 % no arrastre el error del binario.
  return partes.reduce((a, v) => a + Math.round(v * 1000), 0) / 1000;
};

export const recursoEconomicoService = {
  /**
   * `empresas` son los diez proyectos del cuadro, en su orden y con su nombre
   * corto; `sinEmpresa` lista los que el backend no pudo emparejar con ninguna
   * empresa registrada.
   */
  async get(): Promise<{
    data: RecursoEconomicoData;
    empresas: EmpresaRecurso[];
    sinEmpresa: string[];
  }> {
    const { data } = await api.get<{
      data: RecursoEconomicoData; empresas: EmpresaRecurso[]; sinEmpresa?: string[];
    }>(BASE);
    return {
      data: data?.data ?? {},
      empresas: data?.empresas ?? [],
      sinEmpresa: data?.sinEmpresa ?? [],
    };
  },

  /**
   * Valor mensual de interventoría por año y proyecto: 'YYYY' -> companyId -> $.
   * Lo consume el Flujo de Caja; no requiere ser PMO, solo ver la liquidación.
   */
  async getInterventoria(): Promise<Record<string, Record<string, number>>> {
    const { data } = await api.get<Record<string, Record<string, number>>>(`${BASE}/interventoria`);
    return data ?? {};
  },

  async save(payload: RecursoEconomicoData): Promise<RecursoEconomicoData> {
    const { data } = await api.put<{ data: RecursoEconomicoData }>(BASE, { data: payload });
    return data?.data ?? {};
  },
};
