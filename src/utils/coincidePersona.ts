/**
 * Si una persona pasa el filtro de búsqueda de nómina.
 *
 * La cédula se compara sin puntos ni espacios para que dé igual escribirla como se lee
 * («1.053.791») o como está guardada; el nombre, sin tildes y sin importar mayúsculas.
 *
 * Vive acá y no dentro de una pantalla porque lo usan las cuatro pestañas de Nómina, y
 * dos copias de esta regla terminarían encontrando personas distintas con lo mismo
 * escrito.
 */
const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function coincidePersona(filtro: string, identificacion: string, nombre: string): boolean {
  const q = filtro.trim();
  if (!q) return true;
  const soloDigitos = q.replace(/\D/g, '');
  if (soloDigitos && (identificacion ?? '').replace(/\D/g, '').includes(soloDigitos)) return true;
  return sinTildes(nombre ?? '').includes(sinTildes(q));
}
