import { parseLocalDate, getColombianHolidays } from '@/utils/colombianCalendar';
import { getMunicipioName } from '@/utils/departmentMapper';

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function pct(executed: number, planned: number): number {
  if (!planned) return 0;
  return clamp01(executed / planned) * 100;
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeekDays(offset: number): string[] {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Domingo (día no laboral): se marca en rojo y se deshabilita igual que un festivo.
export function isSunday(date: string): boolean {
  return parseLocalDate(date).getDay() === 0;
}

// Sábado (día no laboral): se marca en rojo y se deshabilita igual que el domingo/festivo.
export function isSaturday(date: string): boolean {
  return parseLocalDate(date).getDay() === 6;
}

// Suma N días hábiles (lunes a viernes, sin festivos) a una fecha de inicio.
// Devuelve la fecha (YYYY-MM-DD) del N-ésimo día hábil contando desde el inicio inclusive.
export function addWorkingDays(startStr: string, n: number): string {
  if (!startStr || n <= 0) return '';
  const startYear = parseLocalDate(startStr).getFullYear();
  const holidays = new Set<string>();
  for (let y = startYear - 1; y <= startYear + 4; y++) {
    for (const h of getColombianHolidays(y)) holidays.add(h);
  }
  let count = 0;
  const cur = parseLocalDate(startStr);
  for (let guard = 0; guard < 6000; guard++) {
    const dow = cur.getDay();
    const iso = formatDate(cur);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count++;
    if (count >= n) return iso;
    cur.setDate(cur.getDate() + 1);
  }
  return formatDate(cur);
}

// Ejecuta tareas async con un límite de concurrencia (evita saturar el backend
// cuando un acta tiene muchas obras). Conserva el orden de entrada.
export async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const normalizeLocationName = (name?: string | null) =>
  getMunicipioName(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^union temporal alumbrado publico\s+/i, '')
    .toLowerCase()
    .trim();

export const DEFAULT_ACTIVITY_OPTIONS = [
  'Instalación de sistema puesta tierra',
  'Conexiones eléctricas',
  'Tendido de cableado',
  'Montaje luminaria',
  'Obra civil',
  'Izado de poste',
  'Segmentación de postes',
  'Instalación de ductos excavación y apertura de zanjas',
  'Recepción de material',
  'Excavación y apertura para postes',
  'Construcción de cajas de inspección',
];
