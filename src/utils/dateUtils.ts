/**
 * Utilidades para manejo de fechas en zona horaria de Colombia (America/Bogota - GMT-5)
 */

/**
 * Formatea una fecha en formato largo para Colombia
 * Ejemplo: "9 de noviembre de 2025, 16:05"
 * Usa Intl.DateTimeFormat para manejo robusto de zona horaria
 */
export function formatDate(dateString: string | Date): string {
  if (!dateString) return '-';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '-';

  // Usar Intl.DateTimeFormat con zona horaria explícita de Colombia
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Formatea una fecha en formato corto para Colombia
 * Ejemplo: "09/11/2025"
 * Usa Intl.DateTimeFormat para manejo robusto de zona horaria
 */
export function formatDateShort(dateString: string | Date): string {
  if (!dateString) return '-';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '-';

  // Usar Intl.DateTimeFormat con zona horaria explícita de Colombia
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Formatea solo la hora para Colombia
 * Ejemplo: "16:05"
 * Usa Intl.DateTimeFormat para manejo robusto de zona horaria
 */
export function formatTime(dateString: string | Date): string {
  if (!dateString) return '-';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '-';

  // Usar Intl.DateTimeFormat con zona horaria explícita de Colombia
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Formatea una fecha en formato ISO para inputs de tipo date
 * Ejemplo: "2025-11-09"
 * Usa zona horaria de Colombia para asegurar la fecha correcta
 */
export function formatDateForInput(dateString: string | Date): string {
  if (!dateString) return '';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '';

  // Obtener la fecha en zona horaria de Colombia
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // El formato 'en-CA' produce formato YYYY-MM-DD directamente
  return formatter.format(date);
}

/**
 * Obtiene la fecha actual en zona horaria de Colombia
 */
export function getNowInColombia(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
}

/**
 * Formatea una fecha relativa (hace X tiempo)
 * Ejemplo: "hace 2 horas", "hace 3 días"
 * Calcula diferencias de tiempo correctamente independiente de zona horaria
 */
export function formatRelativeTime(dateString: string | Date): string {
  if (!dateString) return '-';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '-';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'hace unos segundos';
  } else if (diffMinutes < 60) {
    return `hace ${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    return `hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
  } else if (diffDays < 7) {
    return `hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `hace ${weeks} semana${weeks !== 1 ? 's' : ''}`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `hace ${months} mes${months !== 1 ? 'es' : ''}`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `hace ${years} año${years !== 1 ? 's' : ''}`;
  }
}

/**
 * Formatea un número como moneda colombiana (COP)
 * Ejemplo: 150000 -> "$150.000"
 */
export function formatCurrency(amount: number): string {
  if (amount === null || amount === undefined) return '$0';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
