export interface ActaDocFields {
  municipio: string;
  municipioNombreCompleto?: string;
  municipioNit: string;
  contrato: string;
  tipoActa: string;
  actaYear: string;
  actaFecha: string;
  actaNumero: string;
  actaReferenciaAnterior: string;
  smmlvPresupuesto: string;
  munNombre: string;
  munCc: string;
  munCcCiudad: string;
  munCargo: string;
  munCargoFirma?: string;
  munPosesionFecha: string;
  munEntidad?: string;
  conNombre: string;
  conCc: string;
  conCcCiudad: string;
  conCargoFirma?: string;
  conEmpresa: string;
  conEmpresaFirma?: string;
  conNit: string;
  munDireccion?: string;
  conDireccion?: string;
  intNombre: string;
  intCc: string;
  intCcCiudad: string;
  intEmpresa: string;
  intNit?: string;
  intDireccion?: string;
  intCargo?: string;
  supNombre?: string;
  supCc?: string;
  supCargo?: string;
  supRol?: string;
  supEntidad?: string;
}

export interface Clausula {
  title: string;
  content: string;
}

export interface ActaPrintSignatureRow {
  label: string;
  value: string;
  fecha: string;
}

export interface ActaPrintConfig {
  municipioNombre: string;
  municipioRegion: string;
  nit: string;
  oficina: string;
  codigo?: string;
  version?: string;
  trd?: string;
  footerSignatureRows?: ActaPrintSignatureRow[];
  footerContactLines?: string[];
}

export interface EncabezadoTablaRow {
  label: string;
  value: string;
}

/** Una fila de la tabla de amparos de la garantía de cumplimiento. */
export interface GarantiaAmparo {
  amparo: string;
  porcentaje: string;
  vigencia: string;
}

export interface ActaConfig {
  docFields: ActaDocFields;
  consideraciones: string[];
  clausulas: Clausula[];
  tituloLineas?: string[];
  encabezadoTabla?: EncabezadoTablaRow[];
  partesIntro?: string;
  partesIntroTemplate?: string;
  preAcuerdanText?: string;
  insertTablesAfterClauseTitle?: string;
  consideracionNumeracion?: 'roman' | 'decimalDash' | 'decimal' | 'alpha';
  logoUrl?: string;
  hideMunicipioBanner?: boolean;
  /**
   * Filas de amparos de la garantía de cumplimiento. Sin esto se usan las dos de
   * siempre, redactadas sobre el acta de autorización; hay municipios que amparan
   * contra el contrato y con otra vigencia, y ahí el texto por defecto diría algo
   * que la póliza no dice.
   */
  garantiaAmparos?: GarantiaAmparo[];
  /**
   * Si el acta lleva garantía de responsabilidad civil extracontractual.
   * Pueblorrico no la exige: su acta cierra en la tabla de cumplimiento.
   */
  showGarantiaRce?: boolean;
  showGarantiaRceExtraParagraphs?: boolean;
  garantiaCumplimientoTitle?: string;
  garantiaRceTitle?: string;
  printConfig?: ActaPrintConfig;
}
