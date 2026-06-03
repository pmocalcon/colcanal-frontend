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
  munPosesionFecha: string;
  conNombre: string;
  conCc: string;
  conCcCiudad: string;
  conEmpresa: string;
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

export interface ActaConfig {
  docFields: ActaDocFields;
  consideraciones: string[];
  clausulas: Clausula[];
  encabezadoTabla?: EncabezadoTablaRow[];
  logoUrl?: string;
  hideMunicipioBanner?: boolean;
  printConfig?: ActaPrintConfig;
}
