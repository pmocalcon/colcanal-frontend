import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtCOP } from '@/services/recursoEconomico.service';
import { leerOrdenPagoPdf, type LecturaOrdenPago } from '@/utils/ordenPago';
import { FilaComparada, type RetencionEsperada } from './ContrasteFactura';

/**
 * La orden de pago del municipio contra lo que el sistema tiene asentado.
 *
 * Es el otro extremo del ciclo. La factura dice **lo que se cobró**; la orden de pago
 * dice **lo que el municipio manda girar**, y entre las dos está lo que se retiene. Por
 * eso este contraste hace lo que el de la factura no puede: la factura casi nunca trae
 * las retenciones —las practica quien paga, no quien factura—, y acá sí están, con su
 * tarifa. Cotejarlas es la única forma de saber si el municipio retuvo lo que se
 * esperaba, antes de que el dinero llegue y no cuadre.
 *
 * La orden no es una tabla sino una carta a la fiduciaria, con las cifras metidas en las
 * frases; de leerla se encarga `utils/ordenPago`. Acá solo se enfrentan sus cifras con
 * las asentadas.
 *
 * Como todo en esta pantalla: el archivo se lee en el navegador, no se sube ni se
 * guarda, y no llena ningún campo.
 */

/**
 * Lo que se perdona al comparar.
 *
 * El sistema redondea cada retención al peso —es lo que va a la orden de pago— y la
 * carta del municipio las trae con centavos: $ 348.363.979,60 contra $ 348.363.979. Con
 * dos retenciones redondeadas, la diferencia acumulada no pasa de dos pesos, y ese es el
 * tope. Sin esta holgura toda orden correcta se pintaría en rojo, y a fuerza de alarmas
 * falsas nadie mira las ciertas.
 */
const TOLERANCIA = 2;

export function ContrasteOrdenPago({
  subtotal, pago, retenciones, periodo,
}: {
  /** AOM + inversión + otros, como lo tiene el sistema. */
  subtotal: number;
  /** El subtotal menos las retenciones: lo que se espera recibir. */
  pago: number;
  retenciones: RetencionEsperada[];
  /** 'YYYY-MM' del mes facturado. */
  periodo: string;
}) {
  const [orden, setOrden] = useState<LecturaOrdenPago | null>(null);
  const [archivo, setArchivo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    setError(null);
    try {
      setOrden(await leerOrdenPagoPdf(await file.arrayBuffer()));
      setArchivo(file.name);
    } catch (e) {
      setOrden(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer el PDF de la orden de pago.');
    } finally {
      setLeyendo(false);
      // Para que volver a cargar el mismo archivo dispare el evento otra vez.
      if (entrada.current) entrada.current.value = '';
    }
  };

  if (subtotal <= 0) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white">
      <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center justify-between gap-3">
        <span>CONTRASTE CON LA ORDEN DE PAGO</span>
        {orden && (
          <button
            type="button"
            onClick={() => { setOrden(null); setError(null); }}
            className="font-normal text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))] flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> quitar
          </button>
        )}
      </header>

      <div className="p-4 space-y-3">
        {!orden && (
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            Cargue el <strong>PDF</strong> de la orden de pago —la carta con que el municipio
            le pide a la fiduciaria que gire— y el sistema compara el valor presentado, cada
            retención y el neto a girar con lo asentado. Es donde se puede revisar si
            retuvieron lo que correspondía: la factura no trae las retenciones.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={entrada}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void cargar(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={leyendo}
            onClick={() => entrada.current?.click()}
          >
            {leyendo
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Leyendo…</>
              : <><FileUp className="w-4 h-4 mr-2" /> {orden ? 'Cargar otra orden' : 'Cargar la orden de pago (PDF)'}</>}
          </Button>
          {orden && (
            <span className="text-xs text-[hsl(var(--canalco-neutral-500))] truncate max-w-[22rem]">
              {archivo}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}

        {orden && (
          <Resultado
            orden={orden}
            subtotal={subtotal}
            pago={pago}
            retenciones={retenciones}
            periodo={periodo}
          />
        )}
      </div>
    </div>
  );
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function Resultado({ orden, subtotal, pago, retenciones, periodo }: {
  orden: LecturaOrdenPago;
  subtotal: number;
  pago: number;
  retenciones: RetencionEsperada[];
  periodo: string;
}) {
  const totalRetenidoSistema = subtotal - pago;

  /** Lo que la orden retuvo por cada concepto del sistema. */
  const enLaOrden = (key: string): number | null =>
    orden.retenciones.find((r) => r.key === key)?.valor ?? null;

  const porcentajeEnLaOrden = (key: string): number | null =>
    orden.retenciones.find((r) => r.key === key)?.porcentaje ?? null;

  /*
   * El total de descuentos se toma de la propia carta si lo dice, y si no se suma lo que
   * se le encontró. No es lo mismo: si la carta declara un total que no cuadra con sus
   * propias retenciones, eso es un hallazgo —y se avisa aparte—, no algo que se deba
   * tapar sumando por nuestra cuenta.
   */
  const sumaRetenciones = orden.retenciones.reduce((s, r) => s + r.valor, 0);
  const totalOrden = orden.totalDescuentos ?? (orden.retenciones.length > 0 ? sumaRetenciones : null);

  const avisos: string[] = [];

  if (orden.totalDescuentos != null && orden.retenciones.length > 0
      && Math.abs(orden.totalDescuentos - sumaRetenciones) > TOLERANCIA) {
    avisos.push(
      `La orden no cuadra consigo misma: dice descontar ${fmtCOP(Math.round(orden.totalDescuentos))} `
      + `pero sus retenciones suman ${fmtCOP(Math.round(sumaRetenciones))}.`,
    );
  }

  if (orden.valorPresentado != null && orden.valorNeto != null && totalOrden != null
      && Math.abs(orden.valorPresentado - totalOrden - orden.valorNeto) > TOLERANCIA) {
    avisos.push(
      'En la orden, el valor presentado menos los descuentos no da el neto a girar. '
      + 'Revise el documento antes de darlo por bueno.',
    );
  }

  if (orden.mesServicio) {
    const mesPantalla = MESES[Number(periodo.split('-')[1]) - 1];
    if (orden.mesServicio !== mesPantalla) {
      avisos.push(
        `La orden habla del servicio de ${orden.mesServicio} y en pantalla está `
        + `${mesPantalla}. Revise que sea la orden de este mes.`,
      );
    }
  }

  // Las retenciones que el municipio practicó y el sistema no esperaba.
  for (const r of orden.retenciones) {
    const esperada = retenciones.find((x) => x.key === r.key);
    if (esperada && esperada.valor == null) {
      avisos.push(
        `El municipio descontó ${r.nombre} por ${fmtCOP(Math.round(r.valor))}, y en `
        + 'Parámetros ese concepto está como «no aplica» para este municipio.',
      );
    }
  }

  const difNeto = orden.valorNeto == null ? null : Math.round(orden.valorNeto) - Math.round(pago);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Dato termino="Factura que manda pagar" valor={orden.numeroFactura ?? '—'} />
        <Dato termino="Oficio" valor={orden.oficio ?? '—'} />
        <Dato termino="Municipio" valor={orden.municipio ?? '—'} />
        <Dato termino="Servicio del mes" valor={orden.mesServicio ?? '—'} />
      </dl>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            <th className="text-left font-semibold py-1.5">Concepto</th>
            <th className="text-right font-semibold py-1.5">En el sistema</th>
            <th className="text-right font-semibold py-1.5">En la orden</th>
            <th className="text-right font-semibold py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
          <FilaComparada
            concepto="Valor presentado"
            sistema={subtotal}
            documento={orden.valorPresentado}
            tolerancia={TOLERANCIA}
            fuerte
          />

          {retenciones.map((r) => {
            const pct = porcentajeEnLaOrden(r.key);
            return (
              <FilaComparada
                key={r.key}
                concepto={r.label}
                sistema={r.valor}
                documento={enLaOrden(r.key)}
                tolerancia={TOLERANCIA}
                nota={
                  r.valor == null && enLaOrden(r.key) == null
                    ? 'no aplica en este municipio'
                    : pct != null ? `la orden retiene al ${pct}%` : undefined
                }
              />
            );
          })}

          <FilaComparada
            concepto="Total retenido"
            sistema={totalRetenidoSistema > 0 ? totalRetenidoSistema : null}
            documento={totalOrden}
            tolerancia={TOLERANCIA}
          />

          <FilaComparada
            concepto="Neto a girar"
            sistema={pago}
            documento={orden.valorNeto}
            tolerancia={TOLERANCIA}
            fuerte
          />
        </tbody>
      </table>

      {/* El veredicto es el neto: es la plata que de verdad va a entrar. */}
      {difNeto == null ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>La orden no dice cuánto se gira: sin esa cifra no hay contraste del neto.</span>
        </p>
      ) : Math.abs(difNeto) <= TOLERANCIA ? (
        <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>
            El municipio gira lo que el sistema esperaba.
            {difNeto !== 0 && ` La diferencia de ${fmtCOP(Math.abs(difNeto))} es el redondeo al peso.`}
          </span>
        </p>
      ) : (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El neto a girar difiere en <strong>{fmtCOP(Math.abs(difNeto))}</strong>: el
            municipio va a girar {difNeto > 0 ? 'más' : 'menos'} de lo que el sistema
            esperaba. Mire arriba en cuál renglón se abre la diferencia.
          </span>
        </p>
      )}

      {avisos.map((a) => (
        <p key={a} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{a}</span>
        </p>
      ))}

      {/*
        El texto leído. La orden es una carta y las cifras se sacan de sus frases: si algo
        sale raro, acá se ve si fue porque se leyó otro número.
      */}
      <details className="text-xs">
        <summary className="cursor-pointer text-[hsl(var(--canalco-neutral-600))] font-medium">
          El texto que se leyó de la orden ({orden.lineas.length} renglones)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap bg-[hsl(var(--canalco-neutral-100))] rounded-md p-3 text-[11px] leading-relaxed">
          {orden.lineas.join('\n')}
        </pre>
      </details>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[hsl(var(--canalco-neutral-500))]">{termino}</dt>
      <dd className="font-medium text-[hsl(var(--canalco-neutral-800))] truncate" title={valor}>
        {valor}
      </dd>
    </div>
  );
}
