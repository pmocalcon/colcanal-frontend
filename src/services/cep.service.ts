import api from './api';

/**
 * Control de Excedentes (CEP), órdenes de pago e Informe Financiero (GC-001-F).
 *
 * **Acá no se calcula nada.** Todos los totales vienen del servidor ya resueltos, y no
 * por comodidad: son veinticinco fórmulas encadenadas sobre la plata de un municipio, y
 * tenerlas en dos sitios es tenerlas distintas el día que alguien corrija una sola.
 * La pantalla pinta lo que le llega y manda lo que se digita.
 */

const BASE = '/recurso-economico/cep';

/** Quién le consigna a la fiducia. Lo manda el servidor: la lista es del formato. */
export interface Pagador {
  clave: string;
  etiqueta: string;
}

/** Lo que se digita del extracto. Todo lo demás sale de acá. */
export interface CepCapturado {
  ingresos: Record<string, number>;
  energiaAforo: number;
  caom: number;
  cinv: number;
  comision: number;
  gmf: number;
  otrosEgresos: number;
  interventoriaCausada: number;
  pendienteEnergia: number;
  pendienteInterventoria: number;
  pendienteObras: number;
  pendienteNavideno: number;
  pendienteOtros: number;
  rendimientos: number;
  saldoFiducia: number;
}

/** Lo que las órdenes del mes dicen que salió, ya sumado por concepto. */
export interface GirosDelMes {
  energiaMedicion: number;
  interventoria: number;
  obras: number;
  navideno: number;
  caomCinv: number;
}

export type EstadoCep = 'Excedente' | 'Déficit' | 'En cero';
export type ValidacionCep = 'Conciliado' | 'Revisar';

export interface CepMesCalculado {
  periodo: string;
  capturado: CepCapturado;
  giros: GirosDelMes;
  totalIngresos: number;
  ingresoFiducia: number;
  energia: number;
  interventoria: number;
  concesion: number;
  obras: number;
  navideno: number;
  totalEgresos: number;
  otrosGirosConcesion: number;
  giroFiduciaConcesion: number;
  derechosConcesionarioEnFiducia: number;
  saldo: number;
  saldoAcumulado: number;
  pendienteCaom: number;
  pendienteCinv: number;
  pendienteConcesion: number;
  pendienteComision: number;
  egresosCancelados: number;
  totalEgresosPendientes: number;
  egresosPendientesAcumulado: number;
  saldoFinal: number;
  saldoFinalAcumulado: number;
  estado: EstadoCep;
  recursosDelImpuesto: number;
  rendimientosAcumulados: number;
  saldoRecursosDelImpuesto: number;
  saldoFiducia: number;
  saldoFiduciaValidado: number;
  control: number;
  validacion: ValidacionCep;
}

export interface ArranqueCep {
  saldoAcumulado: number;
  egresosPendientesAcumulado: number;
  saldoFinalAcumulado: number;
  rendimientosAcumulados: number;
  saldoFiduciaAnterior: number;
}

export interface CepAnio {
  anio: string;
  arranque: { desde: string | null; saldos: ArranqueCep };
  meses: CepMesCalculado[];
  notas: Record<string, string | null>;
}

export interface OrdenPago {
  ordenId: number;
  companyId: number;
  periodo: string;
  fecha: string;
  valor: string | number;
  concepto: string;
  tipo: string | null;
  numeroOrden: string | null;
  detalle: string | null;
  tercero: string | null;
  numeroOrdenMunicipio: string | null;
  fechaOrden: string | null;
  fechaRecepcion: string | null;
  fechaIngresoCuenta: string | null;
}

export interface FilaInforme {
  clave: string;
  etiqueta: string;
  nivel: 0 | 1 | 2;
  total?: boolean;
  valores: number[];
}

export interface InformeFinanciero {
  anio: string;
  periodos: string[];
  filas: FilaInforme[];
}

export const cepService = {
  catalogo: () =>
    api.get<{ pagadores: Pagador[]; conceptos: string[]; tipos: string[] }>(`${BASE}/catalogo`)
      .then((r) => r.data),

  anios: (companyId: number) =>
    api.get<string[]>(`${BASE}/${companyId}/anios`).then((r) => r.data),

  cep: (companyId: number, anio: string) =>
    api.get<CepAnio>(`${BASE}/${companyId}`, { params: { anio } }).then((r) => r.data),

  informe: (companyId: number, anio: string) =>
    api.get<InformeFinanciero>(`${BASE}/${companyId}/informe`, { params: { anio } })
      .then((r) => r.data),

  guardarMes: (companyId: number, periodo: string, capturado: CepCapturado, nota?: string | null) =>
    api.put<CepMesCalculado>(`${BASE}/mes`, { companyId, periodo, capturado, nota: nota ?? undefined })
      .then((r) => r.data),

  guardarArranque: (companyId: number, desde: string, saldos: ArranqueCep) =>
    api.put(`${BASE}/arranque`, { companyId, desde, ...saldos }).then((r) => r.data),

  ordenes: (companyId: number, anio: string) =>
    api.get<OrdenPago[]>(`${BASE}/${companyId}/ordenes`, { params: { anio } }).then((r) => r.data),

  crearOrden: (orden: Partial<OrdenPago>) =>
    api.post<OrdenPago>(`${BASE}/ordenes`, orden).then((r) => r.data),

  actualizarOrden: (ordenId: number, orden: Partial<OrdenPago>) =>
    api.put<OrdenPago>(`${BASE}/ordenes/${ordenId}`, orden).then((r) => r.data),

  borrarOrden: (ordenId: number) =>
    api.delete(`${BASE}/ordenes/${ordenId}`).then((r) => r.data),
};

/** Los doce meses, para los selectores y los encabezados. */
export const MESES_CEP = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** '2026-08' → 'Agosto 2026'. */
export const nombreDePeriodo = (periodo: string): string => {
  const [anio, mes] = periodo.split('-');
  return `${MESES_CEP[Number(mes) - 1] ?? mes} ${anio}`;
};

/**
 * Pesos, sin decimales y con el signo cuando es negativo.
 *
 * En el CEP el negativo no es un error sino un hecho corriente —un mes con déficit, un
 * giro de más al concesionario—, así que se pinta como número y no como alarma. Quien
 * decide si preocuparse es la columna «Estado».
 */
export const fmtCep = (v: number | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '–';
  return n.toLocaleString('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });
};
