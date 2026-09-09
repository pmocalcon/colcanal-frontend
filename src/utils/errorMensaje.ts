/**
 * El mensaje que el servidor manda dentro de un error de Axios.
 *
 * El patrón estaba copiado a mano en una veintena de páginas, casi siempre como
 * `catch (err: any)` seguido de `err.response?.data?.message`. Escrito así, `any` apaga
 * el compilador en todo el bloque: si dentro del `catch` alguien lee `err.mensaje` o
 * llama a `err.toString(42)`, nadie avisa. Acá el argumento entra como `unknown` y se
 * abre paso comprobando la forma, que es lo que de verdad se sabe de él.
 *
 * NestJS responde `{ message: string }` o `{ message: string[] }` —lo segundo cuando
 * falla la validación del DTO y hay varios reparos—, así que se contemplan los dos.
 */
export function mensajeDeError(error: unknown, porDefecto: string): string {
  const cuerpo = (
    error as { response?: { data?: { message?: string | string[] } } } | null
  )?.response?.data?.message;

  if (Array.isArray(cuerpo)) {
    const limpio = cuerpo.filter((m) => typeof m === 'string' && m.trim());
    if (limpio.length > 0) return limpio.join(', ');
  } else if (typeof cuerpo === 'string' && cuerpo.trim()) {
    return cuerpo;
  }

  return porDefecto;
}
