/**
 * Cuánto tardó cada paso, descontando fines de semana y festivos colombianos.
 *
 * Vive aparte porque lo usan las dos vistas de auditoría de compras —la matriz, que
 * muestra el tiempo en una celda apretada, y la línea de tiempo del detalle, que lo
 * cuenta en prosa— y tienen que dar el mismo número. Con una copia en cada una,
 * bastaría con tocar una para que la misma requisición dijera «3d» en un lado y
 * «6 días» en el otro, y nadie sabría cuál creer.
 *
 * El cálculo corre en el navegador y no en el servidor a propósito: los días
 * empiezan y terminan en hora de Colombia, y el backend corre en UTC. Allá, una
 * requisición aprobada un viernes a las 7 de la noche caería en sábado y el reloj
 * se detendría un día antes de lo debido.
 *
 * Los festivos los manda el backend —ver `COLOMBIA_HOLIDAY_DATES`— para que la
 * lista viva en un solo sitio.
 */

/** La fecha como `YYYY-MM-DD` en hora local, para cotejarla con los festivos. */
export const claveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ni sábado, ni domingo, ni festivo colombiano. */
export const esDiaHabil = (d: Date, festivos: Set<string>) => {
  const dia = d.getDay();
  return dia !== 0 && dia !== 6 && !festivos.has(claveDia(d));
};

/**
 * Milisegundos entre dos instantes contando SOLO los días hábiles.
 *
 * Se recorre día a día y se suma nada más el tramo que cae en días laborables,
 * así que un paso dado el viernes por la tarde y resuelto el lunes por la mañana
 * ya no aparece como «3d»: el fin de semana no le corría el reloj a nadie.
 *
 * Se cuentan las 24 horas de cada día hábil, no la jornada de 7:00 a 16:30. Lo
 * que se pidió fue descontar fines de semana y festivos; recortar además a la
 * jornada mediría otra cosa —horas de trabajo, no tiempo transcurrido— y haría
 * los números incomparables con los que ya se venían mirando.
 */
export function msHabiles(desde: Date, hasta: Date, festivos: Set<string>): number {
  if (hasta <= desde) return 0;
  let total = 0;
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  while (cursor.getTime() < hasta.getTime()) {
    const siguiente = new Date(cursor);
    siguiente.setDate(siguiente.getDate() + 1);
    if (esDiaHabil(cursor, festivos)) {
      const ini = Math.max(cursor.getTime(), desde.getTime());
      const fin = Math.min(siguiente.getTime(), hasta.getTime());
      if (fin > ini) total += fin - ini;
    }
    cursor.setTime(siguiente.getTime());
  }
  return total;
}

/** Formato corto, para las celdas de la matriz: `3d 2h`, `5h 20m`, `40m`. */
export function formatElapsed(ms: number): string {
  if (ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

/**
 * Formato en prosa, para la línea de tiempo del detalle, que se lee como una frase.
 *
 * Dice «hábiles» al nombrar los días porque el número ya no es el del calendario:
 * sin la palabra, quien compare las dos fechas de la pantalla creería que la cuenta
 * está mal.
 */
export function formatElapsedLargo(ms: number): string {
  if (ms < 60000) return 'unos segundos';

  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minuto${mins === 1 ? '' : 's'}`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hora${hrs === 1 ? '' : 's'}`;

  const dias = Math.floor(hrs / 24);
  const resto = hrs % 24;
  const texto = `${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'}`;
  return resto > 0 ? `${texto} y ${resto} hora${resto === 1 ? '' : 's'}` : texto;
}
