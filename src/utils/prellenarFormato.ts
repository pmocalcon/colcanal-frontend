/**
 * Prellenar un formato de Talento Humano con lo que ya está en la ficha de personal.
 *
 * Se escribe la cédula y el resto del encabezado —nombre partido en cuatro casillas,
 * tipo de documento, estado civil, cargo, área— llega solo. Es a la vez menos trabajo y
 * menos errores: digitar el nombre en cada solicitud es como acaba habiendo una cédula
 * bien con un nombre mal, o un cargo de hace dos ascensos.
 *
 * Vive aparte porque son tres formatos —préstamo, permiso y vacaciones— y cada uno llama
 * a sus campos distinto. Lo común es de dónde sale el dato y cómo se traduce; el reparto
 * en casillas lo hace cada página, que es la que sabe cómo se llama cada una.
 */
import {
  gestionConocimientoService,
  type FichaFormato,
} from '@/services/gestionConocimiento.service';

/** Sin tildes, sin puntuación y en mayúsculas, para comparar contra la base. */
const clave = (v: string | null | undefined): string =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, '')
    .trim()
    .toUpperCase();

/**
 * El estado civil de la ficha, en el código que usan las casillas del papel.
 *
 * La ficha lo guarda como «SOLTERO(A)» y el formato marca una casilla llamada `soltero`.
 * Se compara por el comienzo para que «CASADO», «CASADA» y «CASADO(A)» caigan en la
 * misma casilla. Lo que no reconozca vuelve vacío: mejor una casilla sin marcar que una
 * marcada mal.
 */
export const estadoCivilDeFicha = (
  v: string | null | undefined,
): 'soltero' | 'casado' | 'union-libre' | 'viudo' | 'separado' | '' => {
  const k = clave(v);
  if (k.startsWith('SOLTER')) return 'soltero';
  if (k.startsWith('CASAD')) return 'casado';
  if (k.startsWith('UNION')) return 'union-libre';
  if (k.startsWith('VIUD')) return 'viudo';
  // Divorciado no tiene casilla propia en el formato: el papel solo trae «Separado».
  if (k.startsWith('SEPARAD') || k.startsWith('DIVORCIAD')) return 'separado';
  return '';
};

/**
 * El tipo de documento de la ficha.
 *
 * Vacío se lee como C.C., que es lo que es casi toda la base: el campo existe sobre todo
 * por el archivo del banco y en la mayoría de las fichas nunca se digitó.
 */
export const tipoDocumentoDeFicha = (v: string | null | undefined): 'CC' | 'TI' | 'CE' => {
  const k = clave(v);
  if (k === 'TI') return 'TI';
  if (k === 'CE') return 'CE';
  return 'CC';
};

/** El nombre completo como lo pide un formato que lo lleva en una sola casilla. */
export const nombreDeFicha = (ficha: FichaFormato): string =>
  [ficha.primerNombre, ficha.segundoNombre, ficha.primerApellido, ficha.segundoApellido]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ') || ficha.nombre;

/**
 * Busca la ficha de una cédula. Nulo si no está o si la cédula viene vacía.
 *
 * No lanza: que una cédula no esté en personal no puede trancar una solicitud —alguien
 * recién contratado puede no tener ficha todavía— y el formato se sigue diligenciando a
 * mano. Si la consulta falla, se comporta igual que si no hubiera ficha.
 */
export async function buscarFicha(identificacion: string): Promise<FichaFormato | null> {
  const cedula = (identificacion ?? '').trim();
  if (!cedula) return null;
  try {
    return await gestionConocimientoService.fichaDeCedula(cedula);
  } catch {
    return null;
  }
}

/**
 * Mezcla lo que trae la ficha **sin pisar lo que ya está escrito**.
 *
 * Prellenar es ayudar, no corregir: si alguien escribió algo distinto a lo que dice la
 * ficha, puede ser que la ficha esté desactualizada —un traslado que Talento Humano
 * todavía no registró— y sobrescribirlo le borraría el trabajo delante de los ojos.
 */
export function llenarVacios<T extends Record<string, unknown>>(
  actual: T,
  propuesto: Partial<T>,
): T {
  const salida = { ...actual };
  for (const [k, v] of Object.entries(propuesto)) {
    if (v == null || v === '') continue;
    const yaHay = String(actual[k as keyof T] ?? '').trim();
    if (yaHay) continue;
    salida[k as keyof T] = v as T[keyof T];
  }
  return salida;
}
