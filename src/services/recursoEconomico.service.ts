import api from './api';

/**
 * Recurso Económico: interventoría por año, retenciones por proyecto y la factura de
 * concesión de cada municipio, mes a mes.
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

/** Los cuatro descuentos, en el orden en que van en la orden de pago. */
export const CONCEPTOS_RETENCION = [
  { key: 'rteFte', label: 'RTE. FTE.' },
  { key: 'rteIca', label: 'RETEICA' },
  { key: 'timbre', label: 'TIMBRE' },
  { key: 'estampillas', label: 'ESTAMPILLAS' },
] as const;

export type ConceptoRetencion = (typeof CONCEPTOS_RETENCION)[number]['key'];

/**
 * La factura de concesión de un municipio en un mes.
 *
 * Los tres conceptos son los mismos de la factura electrónica: AOM, inversión y lo que
 * no cae en ninguno de los dos —la CVURA de Puerto Asís, por ejemplo—.
 *
 * Las retenciones **no se guardan**: salen del subtotal por los porcentajes que ya
 * están en la pestaña Retención. Solo se guarda el valor cuando alguien lo escribe
 * distinto, y entonces ese manda. Es el mismo trato que el `valorManual` de
 * interventoría, y por la misma razón: cambiar un porcentaje debe corregir todos los
 * meses que no se hayan tocado, no dejarlos con la cifra vieja.
 */
export interface FacturaMes {
  aom?: number | null;
  inversion?: number | null;
  otros?: number | null;
  /** Retención escrita a mano. Vacío = se calcula con el % del proyecto. */
  manual?: Partial<Record<ConceptoRetencion, number | null>>;
  /** Enlace a la factura electrónica o al correo con que se envió. */
  link?: string;
  /**
   * Visto bueno del director de proyecto.
   *
   * No es un «sí»: se estampa cuando el director **digita el valor pago** y coincide con
   * el que calculó el sistema —el subtotal menos las retenciones—. Por eso guarda
   * `valor`: sin él no habría cómo saber si el visto sigue siendo sobre la cifra de hoy,
   * y una factura corregida después de validarla se vería igual que una revisada.
   */
  visto?: { nombre: string; rol?: string; fecha: string; valor?: number } | null;
}

export interface RecursoEconomicoData {
  /** 'YYYY' -> año de interventoría. */
  anios?: Record<string, AnioInterventoria>;
  /** companyId -> retenciones. No van por año: cambian por acuerdo, no por vigencia. */
  retenciones?: Record<string, RetencionProyecto>;
  /**
   * 'YYYY-MM' -> companyId -> factura de ese mes.
   *
   * La llave es el periodo y no el año porque así se consulta: se escoge un mes y se
   * miran los diez municipios de una vez, igual que las otras dos tablas.
   */
  facturas?: Record<string, Record<string, FacturaMes>>;
  /** 'YYYY-MM' -> companyId -> lo que quedó del contraste de ese mes. */
  contrastes?: Record<string, Record<string, ContrasteGuardado>>;
}

/**
 * Un renglón del contraste, como quedó guardado.
 *
 * `null` no es cero: en `sistema` significa «no aplica en este municipio» y en
 * `documento`, «el documento no trae esa cifra».
 */
export interface FilaContraste {
  key: string;
  label: string;
  sistema: number | null;
  documento: number | null;
}

/** Lo que quedó de contrastar un documento. El archivo no se guarda; esto sí. */
export interface BloqueContraste {
  archivo: string;
  /** De dónde salieron las cifras: 'xml', 'pdf', 'texto' u 'ocr'. */
  fuente: string;
  /** El consecutivo de la factura, o el oficio de la orden. */
  referencia: string | null;
  /** La fecha de emisión, o el mes del servicio que paga la orden. */
  fecha: string | null;
  filas: FilaContraste[];
  cuadra: boolean;
  avisos: string[];
}

export interface ContrasteGuardado {
  factura?: BloqueContraste;
  orden?: BloqueContraste;
  quien: { nombre: string; rol?: string; fecha: string };
}

/**
 * Los renglones que el sistema tiene hoy, con los que se coteja lo guardado.
 *
 * Viven acá y no junto a cada pantalla por una razón práctica: las claves (`subtotal`,
 * `neto`, `rteFte`…) son lo que empareja un contraste guardado con las cifras actuales,
 * así que si las dos listas se escriben en sitios distintos acaban discrepando y el
 * cotejo deja de encontrar nada —sin fallar, que es lo peor—.
 */
export const filasDelSistema = (
  subtotal: number,
  pago: number,
  retenciones: { key: string; label: string; valor: number | null }[],
): FilaContraste[] => [
  { key: 'subtotal', label: 'Subtotal facturado', sistema: subtotal, documento: null },
  ...retenciones.map((r) => ({ key: r.key, label: r.label, sistema: r.valor, documento: null })),
  { key: 'pago', label: 'Valor pago', sistema: pago, documento: null },
];

/** Lo mismo para la orden de pago, que compara otros renglones. */
export const filasDeLaOrden = (
  subtotal: number,
  pago: number,
  retenciones: { key: string; label: string; valor: number | null }[],
): FilaContraste[] => [
  { key: 'presentado', label: 'Valor presentado', sistema: subtotal, documento: null },
  ...retenciones.map((r) => ({ key: r.key, label: r.label, sistema: r.valor, documento: null })),
  { key: 'retenido', label: 'Total retenido', sistema: subtotal - pago, documento: null },
  { key: 'neto', label: 'Neto a girar', sistema: pago, documento: null },
];

/**
 * Si el contraste se hizo contra cifras que ya no son las de hoy.
 *
 * Es la pregunta que de verdad importa al volver a un mes revisado: no «¿se revisó?»
 * sino «¿se revisó esto?». Si alguien corrigió el AOM después de contrastar, el sello
 * sigue ahí pero ya no dice nada de las cifras actuales.
 */
export const contrasteDesactualizado = (
  bloque: BloqueContraste | undefined,
  ahora: FilaContraste[],
): boolean => {
  if (!bloque) return false;
  return bloque.filas.some((guardada) => {
    const hoy = ahora.find((f) => f.key === guardada.key);
    if (!hoy) return false;
    // Se compara al peso: las cifras se guardan redondeadas y el sistema las arma con
    // decimales, así que exigir igualdad exacta marcaría como viejo un mes intacto.
    return Math.round(hoy.sistema ?? 0) !== Math.round(guardada.sistema ?? 0);
  });
};

/** AOM + inversión + otros: la base sobre la que se calculan las retenciones. */
export const subtotalFactura = (f: FacturaMes | undefined): number => {
  if (!f) return 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return n(f.aom) + n(f.inversion) + n(f.otros);
};

/**
 * Cuánto se retiene por un concepto.
 *
 * Devuelve también de dónde salió, porque la pantalla lo distingue: una cifra escrita
 * a mano no puede verse igual que una calculada, o nadie sabría cuál va a cambiar
 * cuando se corrija el porcentaje.
 *
 * Se redondea al peso: es lo que va a la orden de pago.
 */
export const retencionFactura = (
  f: FacturaMes | undefined,
  ret: RetencionProyecto | undefined,
  concepto: ConceptoRetencion,
): { valor: number | null; manual: boolean } => {
  const escrito = f?.manual?.[concepto];
  if (typeof escrito === 'number' && Number.isFinite(escrito)) {
    return { valor: escrito, manual: true };
  }
  const pct = ret?.[concepto];
  // `null` es "no aplica", no "cero por ciento": no se retiene nada y la celda queda
  // vacía en vez de mostrar $0, que se leería como una retención que sí rige.
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return { valor: null, manual: false };

  // Sin factura no hay nada que retener. Sin esto la columna se llenaba de ceros antes
  // de que nadie hubiera escrito una cifra, como si ya estuviera liquidada en cero.
  const base = subtotalFactura(f);
  if (base <= 0) return { valor: null, manual: false };

  return { valor: Math.round((base * pct) / 100), manual: false };
};

/** Lo que de verdad se paga: el subtotal menos todo lo retenido. */
export const valorPagoFactura = (
  f: FacturaMes | undefined,
  ret: RetencionProyecto | undefined,
): number => {
  const descontado = CONCEPTOS_RETENCION.reduce(
    (s, c) => s + (retencionFactura(f, ret, c.key).valor ?? 0),
    0,
  );
  return subtotalFactura(f) - descontado;
};

/** Una factura cuenta como diligenciada cuando tiene algún valor. */
export const facturaDiligenciada = (f: FacturaMes | undefined): boolean =>
  subtotalFactura(f) > 0;

/**
 * Qué impide guardar la factura del mes, si algo lo impide.
 *
 * Devuelve el motivo y no un booleano porque el botón de guardar tiene que poder decir
 * por qué está apagado: un botón gris sin explicación se lee como que el sistema se
 * dañó.
 *
 * Lo que se exige es **el enlace a la factura**. Las cifras de esta pantalla salen de la
 * liquidación CREG y de los porcentajes de Parámetros, pero lo que el municipio recibe es
 * un documento, y sin el enlace no queda dicho cuál: seis meses después nadie puede
 * empatar estas cifras con la factura que se radicó. Un mes guardado sin enlace es un
 * número sin respaldo.
 *
 * Solo se exige cuando la factura tiene cifras: una vacía no tiene nada que respaldar.
 */
export const bloqueoDeFactura = (f: FacturaMes | undefined): string | null => {
  if (!facturaDiligenciada(f)) return null;
  // No se valida que sea una URL: el campo admite también el correo con que se envió,
  // y rechazar eso obligaría a inventarse un enlace para poder guardar.
  if (!f?.link?.trim()) return 'Falta el enlace a la factura.';
  return null;
};

export interface EmpresaRecurso {
  companyId: number;
  name: string;
}

/** IVA colombiano vigente, con el que se calcula el valor de interventoría. */
export const IVA = 0.19;

/*
 * Los dos formatos del módulo viven acá y no en la pantalla porque los usan las tres
 * tablas, y una de ellas está en otro archivo. Dos copias de «$ 1.234» acaban
 * discrepando en los decimales, que es justo donde se nota.
 */

export const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const fmtPct = (n: number | null | undefined): string =>
  n == null ? '' : `${n.toLocaleString('es-CO', { maximumFractionDigits: 3 })}%`;

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

  /**
   * El visto bueno de una factura, por su propio endpoint.
   *
   * El director de proyecto no puede guardar el módulo —el `PUT` es del PMO—, así que su
   * visto no puede ir como un cambio más del bloque. Manda el municipio, el mes y el valor
   * que leyó; el nombre de quien firma lo pone el servidor con quien está conectado.
   */
  async validarFactura(periodo: string, companyId: number, valor: number): Promise<RecursoEconomicoData> {
    const { data } = await api.post<{ data: RecursoEconomicoData }>(`${BASE}/factura/visto`, {
      periodo, companyId, valor,
    });
    return data?.data ?? {};
  },

  async quitarVistoFactura(periodo: string, companyId: number): Promise<RecursoEconomicoData> {
    const { data } = await api.delete<{ data: RecursoEconomicoData }>(`${BASE}/factura/visto`, {
      params: { periodo, companyId },
    });
    return data?.data ?? {};
  },

  /**
   * Guarda lo que dio el contraste de un mes: la factura, la orden, o las dos.
   *
   * Se manda un bloque a la vez y el servidor conserva el otro. La orden de pago llega
   * semanas después de la factura, así que quien contrasta la segunda no tiene por qué
   * volver a cargar la primera para no borrarla.
   */
  async guardarContraste(
    periodo: string,
    companyId: number,
    bloques: { factura?: BloqueContraste; orden?: BloqueContraste },
  ): Promise<RecursoEconomicoData> {
    const { data } = await api.put<{ data: RecursoEconomicoData }>(`${BASE}/contraste`, {
      periodo, companyId, ...bloques,
    });
    return data?.data ?? {};
  },

  async borrarContraste(
    periodo: string,
    companyId: number,
    bloque?: 'factura' | 'orden',
  ): Promise<RecursoEconomicoData> {
    const { data } = await api.delete<{ data: RecursoEconomicoData }>(`${BASE}/contraste`, {
      params: { periodo, companyId, bloque },
    });
    return data?.data ?? {};
  },
};
