/**
 * Montos en letras, como los exige un contrato: «UN MILLÓN QUINIENTOS MIL PESOS M/CTE».
 *
 * Va en mayúsculas porque así se escribe en los formatos de Jurídica, y sin el número
 * entre paréntesis: el número ya está en su propio campo, al lado.
 */

// Hasta el 29 se dice de corrido; de ahí en adelante es «DECENA Y UNIDAD».
const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0 a 999. */
function seccion(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN'; // 100 es CIEN; 101 en adelante, CIENTO UNO
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena) partes.push(CENTENAS[centena]);
  if (resto < 30) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const decena = Math.floor(resto / 10);
    const unidad = resto % 10;
    partes.push(unidad ? `${DECENAS[decena]} Y ${UNIDADES[unidad]}` : DECENAS[decena]);
  }
  return partes.join(' ');
}

/** «UNO» se apocopa delante de MIL y MILLONES: UN MIL, VEINTIÚN MILLONES. */
const apocopar = (s: string) => s.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/(^|\s)UNO$/, '$1UN');

/** 0 a 999.999. */
function grupoDeMiles(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push('MIL'); // «MIL», no «UN MIL»
  else if (miles > 1) partes.push(`${apocopar(seccion(miles))} MIL`);
  if (resto) partes.push(seccion(resto));
  return partes.join(' ');
}

/** Entero a letras. Cubre hasta 999.999 millones, de sobra para un contrato. */
export function numeroALetras(n: number): string {
  const entero = Math.floor(Math.abs(n));
  if (!Number.isFinite(entero)) return '';
  if (entero === 0) return 'CERO';
  const millones = Math.floor(entero / 1_000_000);
  const resto = entero % 1_000_000;
  const partes: string[] = [];
  if (millones === 1) partes.push('UN MILLÓN');
  else if (millones > 1) partes.push(`${apocopar(grupoDeMiles(millones))} MILLONES`);
  if (resto) partes.push(grupoDeMiles(resto));
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Lee un monto escrito a mano: «$1.500.000», «1500000», «1.500,50».
 *
 * Convención colombiana: el **punto separa miles** y la **coma, decimales**. No se
 * adivina por la cantidad de dígitos, porque el campo se lee mientras se escribe y a
 * mitad de «1.500.000» se pasa por «1.5», que no es un peso con cincuenta.
 */
export function parsearMonto(v: string): number | null {
  const s = (v ?? '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const coma = s.indexOf(',');
  const enteros = (coma >= 0 ? s.slice(0, coma) : s).replace(/\./g, '');
  const decimales = coma >= 0 ? s.slice(coma + 1).replace(/[.,]/g, '') : '';
  if (!enteros && !decimales) return null;
  const n = Number(`${enteros || '0'}.${decimales || '0'}`);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pone el punto de miles mientras se escribe: «1500000» → «1.500.000». Conserva la coma
 * decimal (máximo dos dígitos) y descarta cualquier otro carácter, así que sirve tanto
 * para lo que se teclea como para reformatear lo que ya estaba guardado.
 */
export function formatearMiles(v: string): string {
  const s = (v ?? '').replace(/[^\d,]/g, '');
  if (!s) return '';
  const coma = s.indexOf(',');
  const enteros = (coma >= 0 ? s.slice(0, coma) : s).replace(/\D/g, '');
  const decimales = coma >= 0 ? s.slice(coma + 1).replace(/\D/g, '').slice(0, 2) : null;
  const agrupado = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales === null ? agrupado : `${agrupado},${decimales}`;
}

/** Monto en letras listo para el formato. Cadena vacía si no hay un número que leer. */
export function valorEnLetras(texto: string): string {
  const n = parsearMonto(texto);
  if (n === null) return '';
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);

  // «UNO» también se apocopa delante del sustantivo: CIENTO UN PESOS, TREINTA Y UN PESOS.
  const letras = apocopar(numeroALetras(entero));
  // Los millones exactos piden «de»: UN MILLÓN DE PESOS. Con algo detrás, no:
  // UN MILLÓN QUINIENTOS MIL PESOS.
  const de = entero >= 1_000_000 && entero % 1_000_000 === 0 ? ' DE' : '';

  const pesos = entero === 1 ? 'PESO' : 'PESOS'; // solo el uno va en singular
  if (centavos <= 0) return `${letras}${de} ${pesos} M/CTE`;
  const enCentavos = centavos === 1 ? 'UN CENTAVO' : `${apocopar(numeroALetras(centavos))} CENTAVOS`;
  return `${letras}${de} ${pesos} CON ${enCentavos} M/CTE`;
}
