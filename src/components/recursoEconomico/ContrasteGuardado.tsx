import { AlertTriangle, CheckCircle2, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  contrasteDesactualizado, fmtCOP,
  type BloqueContraste, type FilaContraste,
} from '@/services/recursoEconomico.service';

/**
 * Lo que queda de un contraste cuando se cierra la pantalla.
 *
 * El archivo nunca se sube: se lee en el navegador y se olvida. Lo que sí se guarda es el
 * **veredicto** —qué decía el documento, qué decía el sistema, si cuadraron, y quién lo
 * revisó—, que es lo que alguien necesita tres meses después cuando la pregunta es «¿esta
 * factura ya se revisó y contra qué?».
 *
 * Lo comparten el bloque de la factura y el de la orden de pago porque los dos guardan lo
 * mismo y se leen igual. Lo único que cambia es de qué documento se habla.
 */

/** Redondeadas al peso: es como se guardan y como se comparan. */
const iguales = (a: number | null, b: number | null): boolean =>
  a != null && b != null && Math.round(a) === Math.round(b);

/** El botón de guardar, con la constancia de que ya se guardó. */
export function GuardarContraste({ onGuardar, guardando, guardado, etiqueta }: {
  onGuardar: () => void;
  guardando: boolean;
  /** El bloque que ya está guardado, si lo hay. */
  guardado: BloqueContraste | undefined;
  /** Cómo se llama lo que se guarda: 'el contraste de la factura'. */
  etiqueta: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Button type="button" size="sm" onClick={onGuardar} disabled={guardando}>
        {guardando
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
          : <><Save className="w-4 h-4 mr-2" /> {guardado ? 'Volver a guardar' : `Guardar ${etiqueta}`}</>}
      </Button>
      <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
        {guardado
          ? 'Ya hay un contraste guardado de este mes; al guardar se reemplaza.'
          : 'Queda el resultado y quién lo revisó. El archivo no se guarda.'}
      </span>
    </div>
  );
}

/**
 * El contraste que ya estaba guardado, cuando se abre el mes sin cargar ningún archivo.
 *
 * Muestra las mismas cifras que se compararon, no un sello de «revisado». Un sello obliga
 * a confiar; las cifras se pueden mirar.
 */
export function SelloContraste({
  bloque, quien, ahora, documento, onBorrar, borrando,
}: {
  bloque: BloqueContraste;
  quien: { nombre: string; rol?: string; fecha: string } | undefined;
  /** Los renglones de hoy, para saber si lo guardado quedó viejo. */
  ahora: FilaContraste[];
  /** De qué documento se habla: 'la factura', 'la orden de pago'. */
  documento: string;
  onBorrar: () => void;
  borrando: boolean;
}) {
  const viejo = contrasteDesactualizado(bloque, ahora);
  const cuando = quien?.fecha
    ? new Date(quien.fecha).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : null;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${
          bloque.cuadra
            ? 'bg-green-50 border-green-200 text-green-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        {bloque.cuadra
          ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
        <span>
          {bloque.cuadra
            ? `Ya se contrastó con ${documento} y cuadró.`
            : `Ya se contrastó con ${documento} y algo no cuadró.`}
          {quien && (
            <>
              {' '}Lo revisó <strong>{quien.nombre}</strong>
              {quien.rol ? ` (${quien.rol})` : ''}{cuando ? ` el ${cuando}` : ''}.
            </>
          )}
        </span>
      </div>

      {/*
        Lo importante no es que el mes esté revisado sino que esté revisado *esto*. Si
        alguien corrigió el AOM después, el sello sigue ahí y ya no dice nada.
      */}
      {viejo && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Las cifras del sistema cambiaron después de este contraste.</strong> Lo
            que se revisó ya no es lo que hay asentado hoy, así que hay que volver a cargar
            {' '}{documento} y contrastar otra vez.
          </span>
        </p>
      )}

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Dato termino="Archivo" valor={bloque.archivo} />
        {bloque.referencia && <Dato termino="Documento" valor={bloque.referencia} />}
        {bloque.fecha && <Dato termino="Fecha" valor={bloque.fecha} />}
        <Dato termino="Leído de" valor={bloque.fuente.toUpperCase()} />
      </dl>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            <th className="text-left font-semibold py-1.5">Concepto</th>
            <th className="text-right font-semibold py-1.5">En el sistema</th>
            <th className="text-right font-semibold py-1.5">En el documento</th>
            <th className="text-right font-semibold py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
          {bloque.filas.map((f) => {
            const comparable = f.sistema != null && f.documento != null;
            const ok = iguales(f.sistema, f.documento);
            return (
              <tr key={f.key}>
                <td className="py-1.5">{f.label}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {f.sistema == null ? '–' : fmtCOP(Math.round(f.sistema))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {f.documento == null ? '–' : fmtCOP(Math.round(f.documento))}
                </td>
                <td className="py-1.5 text-right">
                  {comparable && (ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-600 inline" />
                    : <AlertTriangle className="w-4 h-4 text-amber-600 inline" />)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {bloque.avisos.length > 0 && (
        <ul className="space-y-1">
          {bloque.avisos.map((a, i) => (
            <li
              key={i}
              className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
            >
              {a}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onBorrar}
        disabled={borrando}
        className="text-xs text-red-700 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
      >
        {borrando
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Trash2 className="w-3 h-3" />}
        Borrar este contraste
      </button>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div>
      <dt className="text-[hsl(var(--canalco-neutral-500))]">{termino}</dt>
      <dd className="font-medium text-[hsl(var(--canalco-neutral-800))] break-words">{valor}</dd>
    </div>
  );
}
