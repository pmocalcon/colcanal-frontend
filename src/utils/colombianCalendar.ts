// Anonymous Gregorian algorithm for Easter Sunday
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Move to the following Monday (or keep if already Monday) — "traslado de festivo"
function toNextMonday(d: Date): Date {
  const diff = (8 - d.getDay()) % 7; // 0 if Monday, otherwise days until next Monday
  return addDays(d, diff);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getColombianHolidays(year: number): Set<string> {
  const h = new Set<string>();
  const add = (d: Date) => h.add(dateKey(d));
  const puente = (d: Date) => add(toNextMonday(d));

  const easter = easterDate(year);

  // Fixed holidays
  add(new Date(year, 0, 1));    // Año nuevo
  add(new Date(year, 4, 1));    // Día del trabajo
  add(new Date(year, 6, 20));   // Independencia
  add(new Date(year, 7, 7));    // Batalla de Boyacá
  add(new Date(year, 11, 8));   // Inmaculada Concepción
  add(new Date(year, 11, 25));  // Navidad

  // Semana Santa (fixed relative to Easter, not puente)
  add(addDays(easter, -3));  // Jueves Santo
  add(addDays(easter, -2));  // Viernes Santo
  puente(addDays(easter, 68));  // Sagrado Corazón

  // Puente holidays
  puente(new Date(year, 0, 6));    // Reyes Magos
  puente(new Date(year, 2, 19));   // San José
  puente(addDays(easter, 39));     // Ascensión
  puente(addDays(easter, 60));     // Corpus Christi
  puente(new Date(year, 5, 29));   // San Pedro y San Pablo
  puente(new Date(year, 7, 15));   // Asunción de la Virgen
  puente(new Date(year, 9, 12));   // Día de la Raza
  puente(new Date(year, 10, 1));   // Todos los Santos
  puente(new Date(year, 10, 11));  // Independencia de Cartagena

  return h;
}

// Parses "YYYY-MM-DD" as a local (not UTC) date
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface WorkingDayCount {
  pct: number;    // 0-100 progress
  elapsed: number;
  total: number;
}

const holidayCache = new Map<number, Set<string>>();

function holidays(year: number): Set<string> {
  if (!holidayCache.has(year)) holidayCache.set(year, getColombianHolidays(year));
  return holidayCache.get(year)!;
}

// Counts working days from start to end inclusive.
// Mon-Fri (non-holiday) = 1,  Saturday (non-holiday) = 0.5,  Sunday / holiday = 0
function countDays(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(0, 0, 0, 0);

  while (cur <= endNorm) {
    const dow = cur.getDay();
    if (dow !== 0 && !holidays(cur.getFullYear()).has(dateKey(cur))) {
      count += dow === 6 ? 0.5 : 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function currentMonthWorkingDays(): { elapsed: number; total: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const total = countDays(start, end);
  const elapsed = Math.min(countDays(start, today), total);
  return {
    elapsed: Math.round(elapsed * 2) / 2,
    total: Math.round(total * 2) / 2,
  };
}

export function workingDayProgress(startStr: string, endStr: string): WorkingDayCount | null {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  const total = countDays(s, e);
  if (!total) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.min(countDays(s, today), total);

  return {
    pct: (elapsed / total) * 100,
    elapsed: Math.round(elapsed * 2) / 2, // round to nearest 0.5
    total: Math.round(total * 2) / 2,
  };
}
