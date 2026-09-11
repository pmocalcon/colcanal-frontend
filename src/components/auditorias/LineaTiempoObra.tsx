/**
 * La línea de tiempo de una obra o de un acta: qué pasó, quién lo hizo y cuánto se tardó.
 *
 * ## Lo que distingue a esta de la de compras
 *
 * Compras lee una bitácora que existe desde siempre, así que cada renglón le consta.
 * Obras no tenía ninguna: el estado vivía en una columna y cambiarlo pisaba el anterior.
 * Desde ahora se anota, pero **todo lo de antes hay que deducirlo** de las fechas que
 * quedaron sueltas en la fila (`approved_at`, `review_date`…).
 *
 * Por eso cada paso dice de dónde sale. Un paso **deducido** tiene la fecha bien, pero es
 * el único que sobrevivió de su carril: si un acta se devolvió tres veces antes de
 * aprobarse, solo se ve la aprobación. Pintarlo igual que uno anotado sería decirle a
 * quien audita que ese acta pasó limpia a la primera.
 *
 * El tiempo entre pasos se cuenta en días hábiles con los festivos que manda el servidor,
 * igual que en compras: si las dos auditorías midieran distinto, la misma demora saldría
 * de dos tamaños según la pantalla.
 */

import { Fragment } from 'react';
import { FileText, Hammer, ClipboardList, User, Info } from 'lucide-react';
import { msHabiles, formatElapsedLargo } from '@/utils/tiempoHabil';
import { formatDate, formatDateShort } from '@/utils/dateUtils';
import {
  ACCION_OBRA,
  BLOQUE_LEVANTAMIENTO,
  CARRIL_ACTA,
  nombreEstado,
  type MovimientoObra,
} from '@/services/auditObras.service';

const ICONO_AMBITO = {
  obra: Hammer,
  levantamiento: ClipboardList,
  acta: FileText,
} as const;

const NOMBRE_AMBITO = {
  obra: 'Obra',
  levantamiento: 'Levantamiento',
  acta: 'Acta',
} as const;

/** El carril del acta o el bloque del levantamiento, en el nombre que usa la gente. */
const etiquetaEje = (m: MovimientoObra): string | null => {
  if (!m.eje) return null;
  if (m.ambito === 'levantamiento') return BLOQUE_LEVANTAMIENTO[m.eje] ?? m.eje;
  return CARRIL_ACTA[m.eje] ?? m.eje;
};

export function LineaTiempoObra({
  movimientos,
  holidays,
  /** Desde cuándo se anota. Null si todavía no hay nada anotado. */
  bitacoraDesde,
}: {
  movimientos: MovimientoObra[];
  holidays: string[];
  bitacoraDesde?: string | null;
}) {
  if (movimientos.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
        No hay movimientos registrados.
      </p>
    );
  }

  const festivos = new Set(holidays);
  const deducidos = movimientos.filter((m) => m.origen === 'reconstruido').length;

  return (
    <div className="space-y-4">
      {deducidos > 0 && (
        <p className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {deducidos === movimientos.length
              ? 'Todo este recorrido está deducido'
              : `${deducidos} de estos ${movimientos.length} pasos están deducidos`}{' '}
            de las fechas que quedaron en la ficha, porque son anteriores a la bitácora
            {bitacoraDesde ? ` (que empezó el ${formatDateShort(bitacoraDesde)})` : ''}.
            {' '}De cada frente solo sobrevivió el último movimiento: si algo se devolvió y
            se volvió a enviar, esos pasos intermedios ya no existen en ninguna parte.
          </span>
        </p>
      )}

      <ol className="relative">
        {movimientos.map((m, i) => {
          const siguiente = movimientos[i + 1];
          const Icono = ICONO_AMBITO[m.ambito] ?? FileText;
          const eje = etiquetaEje(m);
          const deducido = m.origen === 'reconstruido';
          const transcurrido = siguiente
            ? msHabiles(new Date(m.fecha), new Date(siguiente.fecha), festivos)
            : null;

          return (
            <Fragment key={`${m.logId ?? 'r'}-${m.fecha}-${i}`}>
              <li className="flex gap-3 pb-1">
                <div className="flex flex-col items-center shrink-0">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                      deducido
                        ? 'bg-[hsl(var(--canalco-neutral-100))] border-dashed border-[hsl(var(--canalco-neutral-400))] text-[hsl(var(--canalco-neutral-500))]'
                        : 'bg-white border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                    }`}
                  >
                    <Icono className="w-4 h-4" />
                  </span>
                  {siguiente && (
                    <span className="w-px flex-1 min-h-[1.5rem] bg-[hsl(var(--canalco-neutral-300))]" />
                  )}
                </div>

                <div className="pb-4 flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                      {ACCION_OBRA[m.action] ?? m.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                      {NOMBRE_AMBITO[m.ambito]}
                      {eje ? ` · ${eje}` : ''}
                    </span>
                    {deducido && (
                      // La marca va en cada paso y no solo en el aviso de arriba: quien
                      // mira un renglón suelto tiene que poder saber si le consta.
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-dashed border-[hsl(var(--canalco-neutral-400))] text-[hsl(var(--canalco-neutral-500))]">
                        Deducido
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{formatDate(m.fecha)}</span>
                    {m.usuario ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {m.usuario.nombre}
                        {m.usuario.cargo ? ` · ${m.usuario.cargo}` : ''}
                      </span>
                    ) : (
                      // No se pone «Sistema» ni se deja en blanco: en un movimiento
                      // deducido el autor puede haberse perdido, y eso hay que decirlo.
                      <span className="italic">Sin autor registrado</span>
                    )}
                    {m.obra && m.ambito !== 'acta' && (
                      <span className="truncate max-w-[16rem]">{m.obra}</span>
                    )}
                  </div>

                  {(m.previousStatus || m.newStatus) && (
                    <div className="text-xs text-[hsl(var(--canalco-neutral-700))] mt-1">
                      {m.previousStatus && (
                        <>
                          <span className="line-through opacity-60">{nombreEstado(m.previousStatus)}</span>
                          {' → '}
                        </>
                      )}
                      <span className="font-medium">{nombreEstado(m.newStatus)}</span>
                    </div>
                  )}

                  {m.comments && (
                    <p className="text-sm mt-1.5 px-3 py-2 rounded-md bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-800))] whitespace-pre-wrap break-words">
                      {m.comments}
                    </p>
                  )}
                </div>
              </li>

              {siguiente && transcurrido != null && (
                <li className="flex gap-3 -mt-3 pb-3">
                  <div className="w-8 shrink-0 flex justify-center">
                    <span className="w-px h-full bg-[hsl(var(--canalco-neutral-300))]" />
                  </div>
                  <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                    {formatElapsedLargo(transcurrido)} hasta el paso siguiente
                  </span>
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
