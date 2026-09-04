/**
 * El aviso de la compuerta: por qué el formato está cerrado y qué hacer para abrirlo.
 *
 * Un formato entero bloqueado sin explicación se lee como una pantalla rota. Esto dice
 * en una línea que falta la cédula, que se está buscando, o que esa cédula no tiene
 * ficha —que es lo único que hay que resolver para poder seguir—.
 */

import { AlertTriangle, Loader2, IdCard } from 'lucide-react';

export function AvisoCedula({
  buscando,
  sinFicha,
  etiqueta = 'la casilla de la cédula',
}: {
  buscando: boolean;
  sinFicha: boolean;
  /** Cómo se llama la casilla en este formato, para señalar la correcta. */
  etiqueta?: string;
}) {
  if (buscando) {
    return (
      <div className="no-print flex items-center gap-2 rounded-lg border border-[#e6e6f0] bg-[#f7f7fb] px-3 py-2 text-xs text-[#4a4a63]">
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        <span>Buscando la ficha…</span>
      </div>
    );
  }

  if (sinFicha) {
    return (
      <div className="no-print flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
        <span>
          <b>Esa cédula no está en la ficha de personal.</b> Revísala, o pide a Talento
          Humano que cargue la ficha antes de continuar.
        </span>
      </div>
    );
  }

  return (
    <div className="no-print flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <IdCard className="w-4 h-4 shrink-0 mt-px" />
      <span>
        <b>Empieza por la cédula.</b> Digítala en {etiqueta} y sal de la casilla: el
        encabezado se llena solo y se abre el resto del formato.
      </span>
    </div>
  );
}
