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
  intNombre: string;
  intCc: string;
  intCcCiudad: string;
  intEmpresa: string;
  intCargo?: string;
}

export interface Clausula {
  title: string;
  content: string;
}

export interface ActaConfig {
  docFields: ActaDocFields;
  consideraciones: string[];
  clausulas: Clausula[];
  logoUrl?: string;
}
