/**
 * El aviso de casillas sin diligenciar, en vivo mientras se llena el formato.
 *
 * El servidor rechaza los formatos incompletos y ese es el control que vale; esto es
 * para no llegar hasta el botón «Enviar» para enterarse. Se actualiza a medida que se
 * escribe, y desaparece solo cuando no falta nada.
 *
 * No bloquea «Guardar»: un borrador a medias es legítimo y se guarda cuantas veces haga
 * falta. Lo que no se puede es enviarlo.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function CamposFaltantes({
  faltan,
  titulo = 'Falta diligenciar para poder enviar',
}: {
  /** Las casillas vacías, con el nombre que tienen en el papel. */
  faltan: string[];
  titulo?: string;
}) {
  if (faltan.length === 0) {
    return (
      <div className="no-print flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>El formato está completo y se puede enviar.</span>
      </div>
    );
  }

  return (
    <div className="no-print rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {titulo} ({faltan.length})
      </p>
      {/* En columnas: una lista de treinta casillas en fila única obliga a recorrer
          media pantalla para saber si falta la que uno está mirando. */}
      <ul className="mt-1.5 columns-2 md:columns-3 gap-x-6 text-xs text-amber-800">
        {faltan.map((f) => (
          <li key={f} className="break-inside-avoid leading-relaxed">
            · {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El borde rojo de una casilla vacía que es obligatoria. */
export const claseFalta = (falta: boolean): string =>
  falta ? 'bg-red-50 ring-1 ring-inset ring-red-300 rounded-[2px]' : '';
