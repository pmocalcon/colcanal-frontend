/**
 * Lista de Verificación de Garantías y Matriz resumen de riesgo contractual
 * (política de contratación). Alimentan `VerificacionGarantiasPage`, el paso que va
 * entre el pago de la póliza y la designación del supervisor.
 */

export interface ItemVerificacionGarantias {
  /** Clave estable de guardado: el texto puede corregirse sin perder lo marcado. */
  key: string;
  label: string;
}

/**
 * Los 17 ítems, en el orden del formato. Se leen en tres bloques aunque el formato no
 * los separe: identidad de la póliza (1-5), amparos contratados (6-11) y suficiencia
 * y formalidad (12-17).
 */
export const ITEMS_VERIFICACION_GARANTIAS: ItemVerificacionGarantias[] = [
  { key: 'contrato-modificaciones', label: 'Contrato y modificaciones disponibles' },
  { key: 'tomador', label: 'Tomador correcto' },
  { key: 'asegurado', label: 'Asegurado/beneficiario correcto' },
  { key: 'objeto', label: 'Objeto coincidente' },
  { key: 'valor-contractual', label: 'Valor contractual correcto' },
  { key: 'amparo-cumplimiento', label: 'Amparo de cumplimiento' },
  { key: 'amparo-laboral', label: 'Amparo laboral, si aplica' },
  { key: 'amparo-anticipo', label: 'Amparo de anticipo, si aplica' },
  { key: 'calidad', label: 'Calidad, si aplica' },
  { key: 'estabilidad', label: 'Estabilidad, si aplica' },
  { key: 'rce', label: 'RCE, si aplica' },
  { key: 'valores-asegurados', label: 'Valores asegurados suficientes' },
  { key: 'vigencias', label: 'Vigencias suficientes' },
  { key: 'prima-pagada', label: 'Prima pagada' },
  { key: 'condiciones-particulares', label: 'Condiciones particulares anexas' },
  { key: 'autenticidad', label: 'Autenticidad verificada' },
  { key: 'aprobacion-juridica', label: 'Aprobación jurídica emitida' },
];

/** Escala de probabilidad e impacto de la matriz de riesgo. */
export const PROBABILIDAD_IMPACTO = ['Baja', 'Media', 'Alta'] as const;

/**
 * Nivel resultante de cada fila de la matriz. Lo escribe Jurídica al clasificar ese
 * riesgo en concreto; no existe una clasificación de riesgo a nivel de contrato.
 */
export const NIVELES_RIESGO_MATRIZ = ['Bajo', 'Medio', 'Alto'] as const;
