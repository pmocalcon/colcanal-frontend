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
 * (suministro, obra/EPC, arrendamiento). Por eso la matriz se muestra completa y las
 * filas que coinciden con la solicitud solo se **resaltan** — ver `garantiasSugeridas`.
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

/** Lo que la solicitud marca en «Prestación de servicios / Alquiler / Suministro / Obra». */
export interface NaturalezaSolicitud {
  prestacion?: boolean;
  alquiler?: boolean;
  suministro?: boolean;
  obra?: boolean;
  /** Clave de `TIPOS_CONTRATO`, para desempatar entre servicios profesionales y operativos. */
  tipoContrato?: string;
}

/**
 * Filas de la matriz que corresponden a lo marcado en la solicitud. Es una **sugerencia**:
 * la política clasifica por naturaleza del objeto y el formato solo tiene cuatro casillas.
 *
 * «Prestación de servicios» no basta para saber si son profesionales u operativos, así
 * que solo se resuelve cuando el tipo de contrato lo dice; si no, se sugieren las dos y
 * que Jurídica elija. «Tecnología/licenciamiento» no tiene casilla en el formato.
 */
export const garantiasSugeridas = (n: NaturalezaSolicitud): string[] => {
  const keys: string[] = [];
  if (n.prestacion) {
    if (n.tipoContrato === 'prestacion-de-servicios-profesionales') keys.push('servicios-profesionales');
    else keys.push('servicios-profesionales', 'servicios-operativos');
  }
  if (n.suministro) keys.push('suministro');
  if (n.obra) keys.push('obra-epc');
  if (n.alquiler) keys.push('arrendamiento');
  return keys;
};
