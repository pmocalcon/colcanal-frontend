/**
 * Catálogo de tipos de contrato de Jurídica, extraído del formato
 * "19. Listado de Chequeo contratos" (hoja BASE DE DATOS).
 *
 * Cada tipo define, por sección, los ítems que aplican. Alimenta la Lista de Chequeo
 * (GA-25-F); los ítems se filtran además por tipo de persona (natural/jurídica).
 */

export interface SeccionMeta {
  key: SeccionKey;
  label: string;
  /** Si false, la sección solo tiene columnas de la etapa Jurídica (sin "Presenta"). */
  administrativo: boolean;
}

export type SeccionKey =
  | 'documentos'
  | 'antecedentes'
  | 'tecnicos'
  | 'contractual'
  | 'ejecucion'
  | 'expGeneral'
  | 'expEspecificos';

export interface TipoContrato {
  key: string;
  nombre: string;
  secciones: Record<SeccionKey, string[]>;
}

// Orden de las secciones tal como aparecen en el formato GA-25-F.
export const SECCIONES: SeccionMeta[] = [
  { key: 'documentos', label: 'Documentos requeridos', administrativo: true },
  { key: 'antecedentes', label: 'Verificación de antecedentes', administrativo: false },
  { key: 'tecnicos', label: 'Requisitos técnicos', administrativo: true },
  { key: 'contractual', label: 'Contractual', administrativo: true },
  { key: 'ejecucion', label: 'Ejecución', administrativo: true },
  { key: 'expGeneral', label: 'Requisitos de experiencia general', administrativo: true },
  { key: 'expEspecificos', label: 'Requisitos de experiencia específicos', administrativo: true },
];

export const CONTRATANTES: string[] = [
  'CANALES Y CONTACTOS S.A.S',
  'UNION TEMPORAL ALUMBRADO PUBLICO GUACARÍ',
  'UNION TEMPORAL ALUMBRADO PUBLICO CERRITO',
  'UNION TEMPORAL ALUMBRADO PUBLICO SANTA BARBARA',
  'UNION TEMPORAL ALUMBRADO PUBLICO PUERTO ASIS',
  'UNION TEMPORAL ALUMBRADO PUBLICO CIRCASIA',
  'UNION TEMPORAL ALUMBRADO PUBLICO QUIMBAYA',
  'INVERSIONES GARCESCALANTE S.A.S',
  'UNIONES Y ALIANZAS S.A.S',
];

export const TIPOS_CONTRATO: TipoContrato[] = [
  {
    key: 'prestacion-de-servicios-profesionales',
    nombre: 'Prestación de servicios Profesionales',
    secciones: {
      documentos: ['Propuesta', 'Requisición', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional.', 'Procesos Judiciales_ Rama Judicial.', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil.', 'Concepto de verificación de antecedentes.'],
      tecnicos: ['Otras certificaciones', 'Tener definida situación militar', 'Tarjeta Profesional - Certificación de vigencia y consulta de antecedentes.', 'Requisición', 'Afiliación al sistema de seguridad social (ARL,EPS,AFP,CCF).'],
      contractual: ['Contrato firmado.', 'Pólizas', 'Aprobación de pólizas'],
      ejecucion: ['Designación de supervisor', 'Acta de Inicio', 'Informes de supervisión para pagos', 'Acta de recibido de la obra y/o producto final.'],
      expGeneral: [],
      expEspecificos: [],
    },
  },
  {
    key: 'termino-fijo',
    nombre: 'Término Fijo',
    secciones: {
      documentos: ['Requisición', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional.', 'Procesos Judiciales-Rama Judicial.', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil', 'Concepto de Verificación de Antecedentes.'],
      tecnicos: ['Certificaciones trabajo en alturas', 'Certificaciones trabajo con alta tensión', 'Otras Certificaciones', 'Tener definida la situación militar', 'Licencia de conducción', 'Tarjeta Profesional-Certificado de vigencia y consulta de antecedentes, disciplinarios.', 'Requisición', 'Afiliación al sistema de seguridad social (ARL, EPS, AFP, CCF)'],
      contractual: ['Contrato firmado.'],
      ejecucion: [],
      expGeneral: [],
      expEspecificos: [],
    },
  },
  {
    key: 'termino-indefinido',
    nombre: 'Término indefinido',
    secciones: {
      documentos: ['Requisición', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional.', 'Procesos Judiciales-Rama Judicial.', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil', 'Concepto de Verificación de Antecedentes.'],
      tecnicos: ['Certificaciones trabajo en alturas', 'Certificaciones trabajo con alta tensión', 'Otras Certificaciones', 'Tener definida la situación militar', 'Licencia de conducción', 'Tarjeta Profesional-Certificado de vigencia y consulta de antecedentes, disciplinarios.', 'Requisición', 'Afiliación al sistema de seguridad social (ARL, EPS, AFP, CCF)'],
      contractual: ['Contrato firmado.'],
      ejecucion: [],
      expGeneral: [],
      expEspecificos: [],
    },
  },
  {
    key: 'obra-labor',
    nombre: 'Obra labor',
    secciones: {
      documentos: ['Requisición', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional.', 'Procesos Judiciales-Rama Judicial.', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil', 'Concepto de Verificación de Antecedentes.'],
      tecnicos: ['Certificaciones trabajo en alturas', 'Certificaciones trabajo con alta tensión', 'Otras Certificaciones', 'Tener definida la situación militar', 'Licencia de conducción', 'Tarjeta Profesional-Certificado de vigencia y consulta de antecedentes, disciplinarios.', 'Requisición', 'Afiliación al sistema de seguridad social (ARL, EPS, AFP, CCF)'],
      contractual: ['Contrato firmado.'],
      ejecucion: [],
      expGeneral: [],
      expEspecificos: [],
    },
  },
  {
    key: 'pasantias',
    nombre: 'Pasantías',
    secciones: {
      documentos: ['Requisición', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional.', 'Procesos Judiciales-Rama Judicial.', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil', 'Concepto de Verificación de Antecedentes.'],
      tecnicos: ['Certificaciones trabajo en alturas', 'Certificaciones trabajo con alta tensión', 'Otras Certificaciones', 'Tener definida la situación militar', 'Licencia de conducción', 'Tarjeta Profesional-Certificado de vigencia y consulta de antecedentes, disciplinarios.', 'Requisición', 'Afiliación al sistema de seguridad social (ARL, EPS, AFP, CCF)'],
      contractual: ['Contrato firmado.'],
      ejecucion: [],
      expGeneral: [],
      expEspecificos: [],
    },
  },
  {
    key: 'prestacion-de-servicios',
    nombre: 'Prestación de servicios',
    secciones: {
      documentos: ['Solicitud Cotización', 'Propuesta', 'Cotización', 'Cédula', 'Rut (actualizado)', 'Certificado bancario'],
      antecedentes: ['Procuraduría', 'Contraloría', 'Policía Nacional', 'Medidas Correctivas-Policía Nacional', 'Procesos Judiciales-Rama Judicial', 'Consulta Registro Unico Tributario (RUES)', 'Estado de la cédula-Registraduría Nacional del estado civil', 'Concepto de Verificación de Antecedentes.'],
      tecnicos: ['Certificaciones trabajo en alturas', 'Certificaciones trabajo con alta tensión', 'Otras certificaciones', 'Tener definida la situación militar', 'Licencia de conducción', 'Afiliación al sistema de seguridad social (ARL,EPS,AFP,CCF).', 'Manual de funciones'],
      contractual: ['Contrato firmado.', 'Pólizas', 'Aprobación de pólizas'],
      ejecucion: ['Designación del supervisor', 'Acta de inicio', 'Informes de supervisión para pagos', 'Acta de recibido de la obra y/o producto final.'],
      expGeneral: ['Certificado de existencia y representación (cuando aplique)', 'Certificado de matrícula mercantil (Persona Natural)-cuando aplique'],
      expEspecificos: ['Contratos ejecutados por el contratista, relacionados con el objeto a contratar'],
    },
  },
];

export const getTipo = (key: string | undefined | null): TipoContrato | undefined =>
  TIPOS_CONTRATO.find((t) => t.key === key);

// ============================================================================
// CONSECUTIVO Y VENCIMIENTO
// (espejo de juridica-contratos.ts en el backend, que es quien los emite)
// ============================================================================

/** Sigla del consecutivo por tipo de contrato: "PS - 0001". */
export const SIGLA_CONTRATO: Record<string, string> = {
  'prestacion-de-servicios-profesionales': 'PP',
  'prestacion-de-servicios': 'PS',
  'termino-fijo': 'TF',
  'termino-indefinido': 'TI',
  'obra-labor': 'OL',
  pasantias: 'PA',
};

/** Sigla de respaldo cuando la solicitud no tiene tipo de contrato. */
export const SIGLA_SIN_TIPO = 'CT';

/** Días de anticipación con que se avisa el vencimiento. */
export const DIAS_ALERTA_VENCIMIENTO = 15;

/** Tipos que no vencen: no tienen terminación pactada. */
export const TIPOS_SIN_VENCIMIENTO = new Set(['termino-indefinido']);

/** Estados en los que el contrato ya existe y corre. Antes no hay nada que venza. */
export const ESTADOS_CONTRATO_VIGENTE = new Set([
  'contrato_firmado', 'en_solicitud_polizas', 'en_aprobacion_polizas',
  'en_pago_polizas', 'en_verificacion_garantias', 'en_designacion_supervisor',
  'en_acta_inicio', 'finalizado',
]);

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const armar = (anio: number, mes: number, dia: number): Date | null => {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(anio, mes - 1, dia);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia
    ? d : null;
};

/**
 * Fecha escrita a mano → Date. null si no se entiende.
 *
 * Las fechas del formato son texto libre (el placeholder dice "dd/mm/aaaa"), así que
 * se acepta lo que la gente escribe: 31/12/2026, 31-12-2026, 2026-12-31 y
 * "31 de diciembre de 2026". El día va primero salvo en ISO, que es la convención
 * del país: 05/03/2026 es 5 de marzo.
 */
export const parsearFecha = (valor: unknown): Date | null => {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return armar(+iso[1], +iso[2], +iso[3]);
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    const anio = +dmy[3];
    return armar(anio < 100 ? 2000 + anio : anio, +dmy[2], +dmy[1]);
  }
  const t = /^(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})$/i
    .exec(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (t) {
    const mes = MESES.indexOf(t[2]);
    if (mes >= 0) return armar(+t[3], mes + 1, +t[1]);
  }
  return null;
};

/** Días calendario de hoy a la fecha. Negativo = ya pasó. */
export const diasHasta = (fecha: Date, hoy = new Date()): number => {
  const a = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

export interface Vencimiento {
  /** La terminación tal como la escribió Jurídica. */
  texto: string;
  fecha: Date | null;
  dias: number | null;
  /** Entró en la ventana de aviso o ya se pasó. */
  enVentana: boolean;
  /** La fecha está escrita pero no se puede leer: no habrá alerta automática. */
  ilegible: boolean;
}

/**
 * Vencimiento del contrato de una solicitud, o null si no aplica: término
 * indefinido, contrato aún sin firmar, o terminación en blanco.
 *
 * Manda la cláusula del contrato, no la fecha del acta de inicio: el acta puede no
 * existir y, cuando existe, quien fija el plazo es el contrato.
 */
export const vencimientoDe = (
  estado: string | undefined | null,
  data: Record<string, any> | null | undefined,
  hoy = new Date(),
): Vencimiento | null => {
  if (!ESTADOS_CONTRATO_VIGENTE.has(estado ?? '')) return null;
  if (TIPOS_SIN_VENCIMIENTO.has(String(data?.tipoContrato ?? ''))) return null;
  const texto = String(data?.contrato?.terminacion ?? '').trim();
  if (!texto) return null;
  const fecha = parsearFecha(texto);
  const dias = fecha ? diasHasta(fecha, hoy) : null;
  return {
    texto,
    fecha,
    dias,
    enVentana: dias !== null && dias <= DIAS_ALERTA_VENCIMIENTO,
    ilegible: fecha === null,
  };
};

export type TipoPersona = 'natural' | 'juridica';

// ============================================================================
// DOCUMENTOS HABILITANTES (política de contratación, sección 9)
// ============================================================================

/**
 * Documento habilitante: lo mismo se pide a persona natural que a jurídica, pero **el
 * soporte cambia**. Por eso la fila es el tipo de documento y el requisito depende de la
 * naturaleza del contratista.
 */
export interface DocumentoHabilitante {
  /** Clave estable. NO se deriva del texto: cambiar de persona no puede perder lo marcado. */
  key: string;
  /** Tipo de documento — la fila de la tabla. */
  tipo: string;
  /** Requisito para persona natural. `null` = no aplica. */
  natural: string | null;
  /** Requisito para persona jurídica. `null` = no aplica. */
  juridica: string | null;
  observaciones: string;
}

/**
 * «Los documentos habilitantes se solicitarán de acuerdo con la naturaleza del
 * contratista y el nivel de riesgo. La siguiente relación constituye un **mínimo** y
 * podrá ampliarse mediante requerimiento de la Dirección Jurídica.»
 *
 * Es un mínimo transversal: aplica a **todos** los tipos de contrato, a diferencia de
 * `TIPOS_CONTRATO`, cuyos ítems dependen del tipo elegido.
 *
 * El «según riesgo» de los antecedentes queda como texto: los niveles de riesgo
 * (sección 8 de la política) todavía no están en el sistema.
 */
export const DOCUMENTOS_HABILITANTES: DocumentoHabilitante[] = [
  {
    key: 'identificacion',
    tipo: 'Identificación',
    natural: 'Cédula',
    juridica: 'Cédula del representante legal',
    observaciones: 'Copia legible y vigente.',
  },
  {
    key: 'existencia-representacion',
    tipo: 'Existencia y representación',
    natural: null,
    juridica: 'Certificado de Cámara de Comercio',
    observaciones: 'Expedición reciente.',
  },
  {
    key: 'rut',
    tipo: 'RUT',
    natural: 'Sí',
    juridica: 'Sí',
    observaciones: 'Actividad económica coherente.',
  },
  {
    key: 'antecedentes',
    tipo: 'Antecedentes',
    natural: 'Según riesgo',
    juridica: 'Representante legal y sociedad, según aplique',
    observaciones: 'Consultas permitidas por ley.',
  },
  {
    key: 'seguridad-social',
    tipo: 'Seguridad social',
    natural: 'Planilla o certificación',
    juridica: 'Certificación de revisor fiscal o representante legal y contador, según corresponda',
    observaciones: 'Previo a pagos.',
  },
  {
    key: 'experiencia-capacidad',
    tipo: 'Experiencia y capacidad',
    natural: 'Soportes contractuales o certificaciones',
    juridica: 'Estados financieros, certificaciones y experiencia',
    observaciones: 'Según cuantía y objeto.',
  },
  {
    key: 'cuenta-bancaria',
    tipo: 'Cuenta bancaria',
    natural: 'Certificación bancaria',
    juridica: 'Certificación bancaria',
    observaciones: 'Titularidad del contratista.',
  },
  {
    key: 'polizas',
    tipo: 'Pólizas',
    natural: 'Según exigencia',
    juridica: 'Según exigencia',
    observaciones: 'Aprobadas antes del inicio.',
  },
];

export interface HabilitanteResuelto extends DocumentoHabilitante {
  /** El requisito que corresponde a la persona elegida, ya resuelto para mostrar. */
  requisito: string;
}

/**
 * Los habilitantes que aplican a un tipo de persona, con el requisito ya resuelto.
 * Sin persona definida devuelve las dos columnas, para que se vea qué falta por decidir.
 * Las filas que no aplican a esa persona (existencia y representación en natural) se
 * omiten: pedirle a alguien un documento marcado «No aplica» solo genera ruido.
 */
export const habilitantesPara = (persona?: string): HabilitanteResuelto[] => {
  if (persona !== 'natural' && persona !== 'juridica') {
    return DOCUMENTOS_HABILITANTES.map((d) => ({
      ...d,
      requisito: `Natural: ${d.natural ?? 'No aplica'} · Jurídica: ${d.juridica ?? 'No aplica'}`,
    }));
  }
  return DOCUMENTOS_HABILITANTES.filter((d) => d[persona] !== null).map((d) => ({
    ...d,
    requisito: d[persona] as string,
  }));
};

/**
 * Ítems que solo aplican a un tipo de persona. Base: la única distinción natural/jurídica
 * que trae el formato GA-25-F está en "Requisitos de experiencia general":
 *  - Certificado de existencia y representación → persona jurídica.
 *  - Certificado de matrícula mercantil (Persona Natural) → persona natural.
 * Ampliable si aparecen más ítems por persona.
 */
export const ITEMS_SOLO_PERSONA: Record<string, TipoPersona> = {
  'Certificado de existencia y representación (cuando aplique)': 'juridica',
  'Certificado de matrícula mercantil (Persona Natural)-cuando aplique': 'natural',
};

/** Filtra los ítems de una sección según el tipo de persona (sin filtro si no está definido). */
export const filtrarPorPersona = (items: string[], persona?: string): string[] => {
  if (persona !== 'natural' && persona !== 'juridica') return items;
  return items.filter((it) => {
    const solo = ITEMS_SOLO_PERSONA[it];
    return !solo || solo === persona;
  });
};

/**
 * Compara ítems del formato ignorando tildes, mayúsculas, puntuación y espacios. Los
 * ítems son texto suelto del GA-25-F y la misma cosa aparece escrita distinto entre
 * tipos de contrato: «(ARL,EPS,AFP,CCF).» y «(ARL, EPS, AFP, CCF)» son el mismo
 * documento.
 */
const claveDeItem = (s: string): string =>
  // NFD separa la tilde de la letra y el filtro final se la lleva junto con la
  // puntuación y los espacios: 'Cédula' y 'CEDULA.' quedan iguales.
  s.normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Qué ítem del GA-25-F cubre cada habilitante.
 *
 * Manda el tipo de contrato: cuando su lista ya pide el documento, el habilitante no
 * se repite. Si no, quien revisa marcaría dos veces el mismo papel en dos filas que
 * pueden terminar contradiciéndose —una en «Sí» y otra en «No»—.
 */
const CUBRE_HABILITANTE: Record<string, string[]> = {
  identificacion: ['Cédula'],
  'existencia-representacion': ['Certificado de existencia y representación (cuando aplique)'],
  rut: ['Rut (actualizado)'],
  // La sección de antecedentes desglosa las consultas; el concepto es su cierre.
  antecedentes: ['Concepto de verificación de antecedentes.'],
  'seguridad-social': ['Afiliación al sistema de seguridad social (ARL,EPS,AFP,CCF).'],
  'experiencia-capacidad': ['Contratos ejecutados por el contratista, relacionados con el objeto a contratar'],
  'cuenta-bancaria': ['Certificado bancario'],
  polizas: ['Pólizas'],
};

/**
 * Los habilitantes que el tipo de contrato **no** pide ya. Son el complemento: lo que
 * la política exige como mínimo y el formato no cubre.
 *
 * Sin tipo de contrato devuelve todos, que es el mínimo transversal.
 */
export const habilitantesNoCubiertos = (
  persona?: string,
  tipo?: TipoContrato,
): HabilitanteResuelto[] => {
  const base = habilitantesPara(persona);
  if (!tipo) return base;
  const pedidos = new Set(
    Object.values(tipo.secciones)
      .flatMap((items) => filtrarPorPersona(items, persona))
      .map(claveDeItem),
  );
  return base.filter(
    (h) => !(CUBRE_HABILITANTE[h.key] ?? []).some((t) => pedidos.has(claveDeItem(t))),
  );
};

// ============================================================================
// GARANTÍAS (política de contratación, secciones 10 y 11)
// ============================================================================

/**
 * Régimen general (sección 10). Se muestra como encabezado de la matriz: sin esto, las
 * celdas «Según riesgo» o «Si aplica» no se entienden.
 */
export const REGIMEN_GARANTIAS: string[] = [
  'La garantía será exigida cuando resulte necesaria para proteger a la compañía frente al incumplimiento, la pérdida de recursos, daños a terceros, obligaciones laborales, defectos de calidad, inestabilidad de obras u otros riesgos identificados.',
  'La inexistencia de una garantía no libera al contratista de responsabilidad. Cuando la póliza no sea suficiente, podrán exigirse garantías bancarias, fiducias, retenciones, pagarés, hipotecas, prendas u otros mecanismos jurídicamente admisibles.',
];

export type AmparoKey =
  | 'cumplimiento'
  | 'salarios'
  | 'anticipo'
  | 'calidad'
  | 'estabilidad'
  | 'rce';

export const AMPAROS: { key: AmparoKey; label: string }[] = [
  { key: 'cumplimiento', label: 'Cumplimiento' },
  { key: 'salarios', label: 'Salarios' },
  { key: 'anticipo', label: 'Anticipo' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'estabilidad', label: 'Estabilidad' },
  { key: 'rce', label: 'RCE' },
];

/**
 * Qué dice cada celda de la matriz. Se distinguen tres clases porque se leen distinto:
 * `si`/`no` son decisiones tomadas, y todo lo demás queda **condicionado** a algo que
 * define Jurídica (el objeto, el riesgo, el bien, o que el contrato lo contemple).
 */
export type ExigenciaClase = 'si' | 'no' | 'condicional';

export interface Exigencia {
  /** Texto tal como aparece en la política. */
  texto: string;
  clase: ExigenciaClase;
}

const SI: Exigencia = { texto: 'Sí', clase: 'si' };
const NO: Exigencia = { texto: 'No', clase: 'no' };
const SI_APLICA: Exigencia = { texto: 'Si aplica', clase: 'condicional' };
const SEGUN_RIESGO: Exigencia = { texto: 'Según riesgo', clase: 'condicional' };
const SEGUN_OBJETO: Exigencia = { texto: 'Según objeto', clase: 'condicional' };
const SEGUN_BIEN: Exigencia = { texto: 'Según bien', clase: 'condicional' };

export interface FilaGarantias {
  key: string;
  contrato: string;
  amparos: Record<AmparoKey, Exigencia>;
}

/**
 * Matriz general de garantías (sección 11).
 *
 * ⚠️ Sus categorías **no son** las de `TIPOS_CONTRATO`: aquélla clasifica por vínculo
 * laboral (término fijo, obra labor, pasantías) y ésta por naturaleza del objeto
 * (suministro, obra/EPC, arrendamiento). No hay correspondencia automática entre las
 * dos, así que la matriz se muestra completa y es Jurídica quien elige la fila.
 */
export const MATRIZ_GARANTIAS: FilaGarantias[] = [
  {
    key: 'servicios-profesionales',
    contrato: 'Servicios profesionales',
    amparos: { cumplimiento: SI, salarios: SI_APLICA, anticipo: SI_APLICA, calidad: SEGUN_OBJETO, estabilidad: NO, rce: SEGUN_RIESGO },
  },
  {
    key: 'servicios-operativos',
    contrato: 'Servicios operativos/AOM',
    amparos: { cumplimiento: SI, salarios: SI, anticipo: SI_APLICA, calidad: SI, estabilidad: NO, rce: SI },
  },
  {
    key: 'suministro',
    contrato: 'Suministro',
    amparos: { cumplimiento: SI, salarios: NO, anticipo: SI_APLICA, calidad: SI, estabilidad: NO, rce: SEGUN_RIESGO },
  },
  {
    key: 'obra-epc',
    contrato: 'Obra/EPC',
    amparos: { cumplimiento: SI, salarios: SI, anticipo: SI_APLICA, calidad: SI, estabilidad: SI, rce: SI },
  },
  {
    key: 'arrendamiento',
    contrato: 'Arrendamiento',
    amparos: { cumplimiento: SEGUN_RIESGO, salarios: NO, anticipo: NO, calidad: SEGUN_BIEN, estabilidad: NO, rce: SEGUN_RIESGO },
  },
  {
    key: 'tecnologia',
    contrato: 'Tecnología/licenciamiento',
    amparos: { cumplimiento: SI, salarios: SI_APLICA, anticipo: SI_APLICA, calidad: SI, estabilidad: NO, rce: SEGUN_RIESGO },
  },
];
