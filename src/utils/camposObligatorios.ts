/**
 * Qué casillas no pueden ir vacías en los cuatro formatos de Talento Humano.
 *
 * Espeja `campos-obligatorios.ts` del backend, que es quien manda: acá esto sirve para
 * avisar **mientras se llena** el formato —marcando en rojo lo que falta— en vez de
 * hacerlo al pulsar «Enviar», cuando ya hay que devolverse a buscar.
 *
 * Si las dos listas se separan, la del servidor gana y el usuario ve un error al enviar
 * que la pantalla no había anunciado. Al tocar una, tocar la otra.
 *
 * Las tres clases de excepción están explicadas en el archivo del backend; acá se
 * repiten solo las condiciones, que son las que cambian el comportamiento en pantalla.
 */

export interface CampoExigido {
  /** Clave en el estado del formato. Admite rutas con punto: «periodoDe.mes». */
  campo: string;
  /** Cómo se llama la casilla en el papel. */
  etiqueta: string;
  si?: (d: Record<string, any>) => boolean;
}

const valorDe = (d: Record<string, any>, ruta: string): unknown =>
  ruta.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), d);

/** El cero no es vacío: «0 días a compensar» es una respuesta, no una casilla en blanco. */
const vacio = (v: unknown): boolean =>
  v === null || v === undefined || String(v).trim() === '';

export const PRESTAMO_OBLIGATORIOS: CampoExigido[] = [
  { campo: 'primerApellido', etiqueta: 'Primer apellido' },
  { campo: 'primerNombre', etiqueta: 'Primer nombre' },
  { campo: 'estadoCivil', etiqueta: 'Estado civil' },
  { campo: 'tipoDocumento', etiqueta: 'Tipo de documento' },
  { campo: 'numero', etiqueta: 'Número de documento' },
  { campo: 'expedida', etiqueta: 'Expedida en' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'barrio', etiqueta: 'Barrio' },
  { campo: 'municipio', etiqueta: 'Municipio' },
  { campo: 'departamento', etiqueta: 'Departamento' },
  { campo: 'celular', etiqueta: 'Celular' },
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'area', etiqueta: 'Área' },
  { campo: 'salario', etiqueta: 'Salario' },
  { campo: 'valorSolicitado', etiqueta: 'Valor solicitado' },
  { campo: 'motivo', etiqueta: 'Motivo del préstamo' },
];

/** Las horas solo importan si el permiso ocurre dentro de un mismo día. */
const permisoDeUnDia = (d: Record<string, any>): boolean => {
  const desde = String(d.desde ?? '').trim();
  const hasta = String(d.hasta ?? '').trim();
  return !!desde && (!hasta || desde === hasta);
};

export const PERMISO_OBLIGATORIOS: CampoExigido[] = [
  { campo: 'proyecto', etiqueta: 'Proyecto' },
  { campo: 'nombre', etiqueta: 'Nombre del colaborador' },
  { campo: 'identificacion', etiqueta: 'Identificación' },
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'jefeInmediato', etiqueta: 'Jefe inmediato' },
  { campo: 'desde', etiqueta: 'Desde' },
  { campo: 'hasta', etiqueta: 'Hasta' },
  { campo: 'horaDesde', etiqueta: 'Hora desde', si: permisoDeUnDia },
  { campo: 'horaHasta', etiqueta: 'Hora hasta', si: permisoDeUnDia },
  { campo: 'remuneracion', etiqueta: 'Remuneración' },
  { campo: 'descripcionMotivo', etiqueta: 'Descripción del motivo' },
  { campo: 'anexaSoporte', etiqueta: 'Anexa soporte' },
  { campo: 'tipoSoporte', etiqueta: 'Tipo de soporte', si: (d) => d.anexaSoporte === 'si' },
  { campo: 'soporteLink', etiqueta: 'Soporte de permiso (enlace)', si: (d) => d.anexaSoporte === 'si' },
];

export const VACACIONES_OBLIGATORIOS: CampoExigido[] = [
  { campo: 'nombres', etiqueta: 'Nombres y apellidos' },
  { campo: 'tipoDocumento', etiqueta: 'Tipo de documento' },
  { campo: 'documento', etiqueta: 'Documento de identidad' },
  { campo: 'cargo', etiqueta: 'Denominación del cargo' },
  { campo: 'areaCargo', etiqueta: 'Área del cargo' },
  { campo: 'fechaIngreso.dia', etiqueta: 'Fecha de ingreso · día' },
  { campo: 'fechaIngreso.mes', etiqueta: 'Fecha de ingreso · mes' },
  { campo: 'fechaIngreso.anio', etiqueta: 'Fecha de ingreso · año' },
  { campo: 'periodoDe.mes', etiqueta: 'Periodo · de (mes)' },
  { campo: 'periodoDe.anio', etiqueta: 'Periodo · de (año)' },
  { campo: 'periodoA.mes', etiqueta: 'Periodo · a (mes)' },
  { campo: 'periodoA.anio', etiqueta: 'Periodo · a (año)' },
  { campo: 'fechaInicio.dia', etiqueta: 'Fecha inicio · día' },
  { campo: 'fechaInicio.mes', etiqueta: 'Fecha inicio · mes' },
  { campo: 'fechaInicio.anio', etiqueta: 'Fecha inicio · año' },
  { campo: 'fechaFinal.dia', etiqueta: 'Fecha final · día' },
  { campo: 'fechaFinal.mes', etiqueta: 'Fecha final · mes' },
  { campo: 'fechaFinal.anio', etiqueta: 'Fecha final · año' },
  { campo: 'diasDisfrutar', etiqueta: 'Días a disfrutar' },
  { campo: 'diasCompensar', etiqueta: 'Días a compensar' },
  { campo: 'rhFechaRecibido.dia', etiqueta: 'Fecha recibido · día' },
  { campo: 'rhFechaRecibido.mes', etiqueta: 'Fecha recibido · mes' },
  { campo: 'rhFechaRecibido.anio', etiqueta: 'Fecha recibido · año' },
  { campo: 'rhFechaInicio.dia', etiqueta: 'Fecha inicio concedida · día' },
  { campo: 'rhFechaInicio.mes', etiqueta: 'Fecha inicio concedida · mes' },
  { campo: 'rhFechaInicio.anio', etiqueta: 'Fecha inicio concedida · año' },
  { campo: 'rhFechaFinal.dia', etiqueta: 'Fecha final concedida · día' },
  { campo: 'rhFechaFinal.mes', etiqueta: 'Fecha final concedida · mes' },
  { campo: 'rhFechaFinal.anio', etiqueta: 'Fecha final concedida · año' },
  { campo: 'rhDiasDisfrutar', etiqueta: 'Días a disfrutar (RR. HH.)' },
  { campo: 'rhDiasCompensar', etiqueta: 'Días a compensar (RR. HH.)' },
  { campo: 'rhDiasPendientes', etiqueta: 'Días pendientes' },
];

export const HORAS_EXTRAS_OBLIGATORIOS: CampoExigido[] = [
  { campo: 'nombre', etiqueta: 'Nombre' },
  { campo: 'cedula', etiqueta: 'Cédula' },
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'mes', etiqueta: 'Mes' },
  { campo: 'anio', etiqueta: 'Año' },
  { campo: 'ciudad', etiqueta: 'Ciudad' },
];

/** Las casillas del encabezado que están vacías, como conjunto de claves. */
export function camposFaltantes(
  exigidos: CampoExigido[],
  data: Record<string, any>,
): Set<string> {
  return new Set(
    exigidos
      .filter((c) => (c.si ? c.si(data) : true))
      .filter((c) => vacio(valorDe(data, c.campo)))
      .map((c) => c.campo),
  );
}

/** Lo mismo, pero con las etiquetas del papel, para enumerarlo en pantalla. */
export function etiquetasFaltantes(
  exigidos: CampoExigido[],
  data: Record<string, any>,
): string[] {
  return exigidos
    .filter((c) => (c.si ? c.si(data) : true))
    .filter((c) => vacio(valorDe(data, c.campo)))
    .map((c) => c.etiqueta);
}

// ── Renglones de la planilla de horas extras ────────────────────────────

const TIPOS_HORA = ['diurna', 'recargoNocturno', 'nocturna', 'diurnaFestiva', 'nocturnaFestiva'];

export interface FaltaEnFila {
  fila: number;
  campos: Set<string>;
  /** El renglón no tiene horas en ninguna de las cinco columnas. */
  sinHoras: boolean;
}

/**
 * Revisa renglón por renglón. Las cinco columnas de horas no se exigen todas —un día se
 * trabaja una clase de hora, no las cinco—, pero un renglón sin ninguna no es un
 * registro incompleto sino un renglón que no debería existir.
 *
 * Los renglones **en blanco no cuentan**: la planilla nace con doce para poder escribir
 * de corrido, y no se guardan. Marcarlos en rojo llenaría la hoja de avisos por casillas
 * que nadie pensaba llenar.
 */
export function filasFaltantes(filas: Record<string, any>[]): FaltaEnFila[] {
  const salida: FaltaEnFila[] = [];
  filas.forEach((fila, i) => {
    const horas = (fila?.horas ?? {}) as Record<string, unknown>;
    const algoEscrito =
      ['fecha', 'proyecto', 'region', 'horaEntrada', 'horaSalida', 'almuerzo', 'codigoLabor', 'labor']
        .some((k) => !vacio(fila?.[k])) || TIPOS_HORA.some((t) => !vacio(horas[t]));
    if (!algoEscrito) return;

    const campos = new Set<string>();
    for (const k of ['fecha', 'proyecto', 'region', 'horaEntrada', 'horaSalida', 'labor']) {
      if (vacio(fila?.[k])) campos.add(k);
    }
    const sinHoras = !TIPOS_HORA.some((t) => !vacio(horas[t]) && Number(horas[t]) > 0);
    if (campos.size > 0 || sinHoras) salida.push({ fila: i, campos, sinHoras });
  });
  return salida;
}
