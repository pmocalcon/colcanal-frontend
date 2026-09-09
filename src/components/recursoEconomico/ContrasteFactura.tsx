import { useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileUp, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtCOP } from '@/services/recursoEconomico.service';
import {
  FacturaDianError, leerFacturaDian, mismoNombreDeEmpresa, type FacturaDian,
} from '@/utils/facturaDian';

/**
 * La factura electrónica contra lo que armó el sistema.
 *
 * Hasta ahora la comparación la hacía el director con el papel en la mano: leía la
 * factura, miraba la pantalla y decidía si cuadraban. Eso funciona hasta que las cifras
 * se parecen —un dígito cambiado en el AOM no salta a la vista— y obliga a tener el
 * documento delante para poder revisar.
 *
 * Acá se carga el XML de la factura y el sistema hace la comparación renglón por renglón.
 * **No llena ningún campo**: el control existe justamente porque las dos cifras se
 * arman por caminos separados, y traer los valores de la factura a la pantalla acabaría
 * comparando la factura consigo misma. El visto bueno se sigue dando digitando el valor.
 *
 * El archivo no se sube ni se guarda: se lee en el navegador y se olvida al cerrar.
 */

const norm = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A qué concepto del sistema corresponde una retención que trae el XML. */
const CONCEPTOS: { key: string; label: string; casa: (n: string) => boolean }[] = [
  { key: 'rteFte', label: 'RTE. FTE.', casa: (n) => n.includes('fuente') || n.includes('renta') },
  { key: 'rteIca', label: 'RETEICA', casa: (n) => n.includes('ica') || n.includes('industria') },
  { key: 'timbre', label: 'TIMBRE', casa: (n) => n.includes('timbre') },
  { key: 'estampillas', label: 'ESTAMPILLAS', casa: (n) => n.includes('estampilla') },
];

/** El mes que le sigue a un 'YYYY-MM', que es cuando se factura. */
const mesesEntre = (periodo: string, fecha: string): number | null => {
  const [a1, m1] = periodo.split('-').map(Number);
  const [a2, m2] = fecha.split('-').map(Number);
  if (!a1 || !m1 || !a2 || !m2) return null;
  return (a2 - a1) * 12 + (m2 - m1);
};

export interface RetencionEsperada {
  key: string;
  label: string;
  /** `null` es «no aplica en este municipio», que no es lo mismo que cero. */
  valor: number | null;
}

export function ContrasteFactura({
  subtotal, pago, retenciones, empresa, periodo,
}: {
  /** AOM + inversión + otros, como lo tiene el sistema. */
  subtotal: number;
  /** El subtotal menos las retenciones: lo que el director confirma. */
  pago: number;
  retenciones: RetencionEsperada[];
  /** La UT seleccionada, que debería ser quien emite la factura. */
  empresa: string;
  /** 'YYYY-MM' del mes facturado. */
  periodo: string;
}) {
  const [factura, setFactura] = useState<FacturaDian | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    setError(null);
    try {
      setFactura(await leerFacturaDian(file));
    } catch (e) {
      setFactura(null);
      setError(
        e instanceof FacturaDianError
          ? e.message
          : 'No se pudo leer el archivo. Verifique que sea el XML de la factura electrónica.',
      );
    } finally {
      setLeyendo(false);
      // Para que volver a cargar el mismo archivo dispare el evento otra vez.
      if (entrada.current) entrada.current.value = '';
    }
  };

  const limpiar = () => { setFactura(null); setError(null); };

  if (subtotal <= 0) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white">
      <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center justify-between gap-3">
        <span>CONTRASTE CON LA FACTURA ELECTRÓNICA</span>
        {factura && (
          <button
            type="button"
            onClick={limpiar}
            className="font-normal text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))] flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> quitar
          </button>
        )}
      </header>

      <div className="p-4 space-y-3">
        {!factura && (
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            Cargue la factura —el <strong>XML</strong>, su representación en <strong>PDF</strong>,
            o el ZIP en que la mandaron— y el sistema compara sus cifras con estas. El
            archivo se lee acá mismo: no se sube ni queda guardado, y ningún campo se
            llena solo. Si tiene los dos, prefiera el XML: ahí las cifras vienen
            declaradas y del PDF hay que deducirlas de los rótulos impresos.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={entrada}
            type="file"
            accept=".xml,.zip,.pdf,application/xml,text/xml,application/zip,application/pdf"
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
              : <><FileUp className="w-4 h-4 mr-2" /> {factura ? 'Cargar otra factura' : 'Cargar la factura (XML, PDF o ZIP)'}</>}
          </Button>
          {factura && (
            <span className="text-xs text-[hsl(var(--canalco-neutral-500))] truncate max-w-[22rem]">
              {factura.archivo}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}

        {factura && (
          <Resultado
            factura={factura}
            subtotal={subtotal}
            pago={pago}
            retenciones={retenciones}
            empresa={empresa}
            periodo={periodo}
          />
        )}
      </div>
    </div>
  );
}

function Resultado({ factura, subtotal, pago, retenciones, empresa, periodo }: {
  factura: FacturaDian;
  subtotal: number;
  pago: number;
  retenciones: RetencionEsperada[];
  empresa: string;
  periodo: string;
}) {
  const base = factura.baseGravable;
  const difSubtotal = base == null ? null : Math.round(base) - Math.round(subtotal);

  /*
   * La retención la practica quien paga, no quien factura, así que la mayoría de las
   * facturas no la traen. Sin esta distinción la pantalla diría que «no coinciden» en
   * todas las facturas normales, que es la forma más rápida de que nadie le crea.
   */
  const traeRetenciones = factura.retenciones.length > 0;

  const filasRetencion = retenciones.map((r) => {
    const concepto = CONCEPTOS.find((c) => c.key === r.key);
    const enFactura = traeRetenciones && concepto
      ? factura.retenciones.filter((t) => concepto.casa(norm(t.nombre)))
        .reduce((s, t) => s + t.valor, 0)
      : null;
    return { ...r, enFactura: enFactura === 0 && !factura.retenciones.some((t) => concepto?.casa(norm(t.nombre))) ? null : enFactura };
  });

  const avisos: string[] = [];
  if (!mismoNombreDeEmpresa(factura.emisor.nombre, empresa)) {
    avisos.push(
      `La factura la emite «${factura.emisor.nombre || 'sin nombre'}» y en pantalla está `
      + `seleccionado ${empresa}. Revise que sea la factura de este municipio.`,
    );
  }
  if (factura.fechaEmision) {
    const d = mesesEntre(periodo, factura.fechaEmision.slice(0, 7));
    if (d != null && (d < 0 || d > 3)) {
      avisos.push(
        `La factura se emitió el ${factura.fechaEmision} y en pantalla está el periodo ${periodo}. `
        + 'La factura de un mes se emite al mes siguiente; ésta queda muy lejos.',
      );
    }
  }
  if (factura.impuestos.length > 0) {
    const iva = factura.impuestos.reduce((s, t) => s + t.valor, 0);
    avisos.push(
      `La factura trae ${fmtCOP(Math.round(iva))} de impuestos `
      + `(${factura.impuestos.map((t) => t.nombre).join(', ')}). `
      + 'El sistema no los liquida en esta pantalla, así que compárelos aparte.',
    );
  }

  const delPdf = factura.fuente === 'pdf';

  return (
    <div className="space-y-4">
      {/*
        De dónde salieron las cifras. Con el XML no se dice nada —es lo esperado—; con el
        PDF sí, porque ahí las cifras no vienen declaradas sino deducidas de los rótulos
        impresos, y quien aprueba tiene que saber cuál de las dos lecturas está mirando.
      */}
      {delPdf && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Estas cifras se leyeron del <strong>PDF</strong>, buscando los rótulos impresos
            («subtotal», «total a pagar»). Cada proveedor arma el formato a su manera, así
            que revise abajo el texto que se leyó antes de darle peso. Con el XML no hay
            nada que deducir.
          </span>
        </p>
      )}

      {/* Quién, cuándo y cuál factura */}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Dato termino="Factura" valor={factura.numero} />
        <Dato termino="Emitida" valor={factura.fechaEmision ?? '—'} />
        {!delPdf && <Dato termino="Emisor" valor={factura.emisor.nombre || '—'} />}
        {!delPdf && <Dato termino="Adquiriente" valor={factura.adquiriente.nombre || '—'} />}
      </dl>

      {/* La comparación */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            <th className="text-left font-semibold py-1.5">Concepto</th>
            <th className="text-right font-semibold py-1.5">En el sistema</th>
            <th className="text-right font-semibold py-1.5">En la factura</th>
            <th className="text-right font-semibold py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
          <FilaComparada
            concepto="Subtotal facturado"
            sistema={subtotal}
            factura={base}
            nota={base == null ? 'la factura no trae el total de las líneas' : undefined}
            fuerte
          />

          {traeRetenciones
            ? filasRetencion.map((r) => (
              <FilaComparada
                key={r.key}
                concepto={r.label}
                sistema={r.valor}
                factura={r.enFactura}
                nota={r.valor == null ? 'no aplica en este municipio' : undefined}
              />
            ))
            : (
              <tr>
                <td colSpan={4} className="py-2 text-xs text-[hsl(var(--canalco-neutral-600))]">
                  La factura no trae retenciones, que es lo normal: las practica quien paga.
                  Las de esta pantalla salen de los porcentajes de Parámetros y no hay contra
                  qué compararlas.
                </td>
              </tr>
            )}

          {traeRetenciones && (
            <FilaComparada
              concepto="Valor pago"
              sistema={pago}
              factura={factura.totalAPagar}
              fuerte
            />
          )}
        </tbody>
      </table>

      {!traeRetenciones && factura.totalAPagar != null && (
        <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
          La factura pide {fmtCOP(Math.round(factura.totalAPagar))}; el sistema paga{' '}
          {fmtCOP(Math.round(pago))} después de retener {fmtCOP(Math.round(subtotal - pago))}.
          No tienen por qué coincidir.
        </p>
      )}

      {/* Lo que la factura cobra, renglón por renglón */}
      {factura.lineas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[hsl(var(--canalco-neutral-600))] font-medium">
            Los {factura.lineas.length} renglones de la factura
          </summary>
          <ul className="mt-2 space-y-1">
            {factura.lineas.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-dashed border-[hsl(var(--canalco-neutral-200))] pb-1">
                <span className="text-[hsl(var(--canalco-neutral-700))]">{l.descripcion}</span>
                <span className="tabular-nums shrink-0">{fmtCOP(Math.round(l.valor))}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        El texto tal como se leyó. Es la prueba de la interpretación: si el subtotal salió
        raro, acá se ve si fue porque se leyó otro renglón. Sin esto, una lectura mala del
        PDF sería indistinguible de una factura mala.
      */}
      {delPdf && factura.textoLeido && factura.textoLeido.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[hsl(var(--canalco-neutral-600))] font-medium">
            El texto que se leyó del PDF ({factura.textoLeido.length} renglones)
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap bg-[hsl(var(--canalco-neutral-100))] rounded-md p-3 text-[11px] leading-relaxed">
            {factura.textoLeido.join('\n')}
          </pre>
        </details>
      )}

      {/* El veredicto del subtotal, que es la cifra que sí es comparable siempre */}
      {difSubtotal == null && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            No se encontró el subtotal en el archivo, que es la única cifra comparable
            siempre. Sin ella no hay contraste: cargue el XML de la factura.
          </span>
        </p>
      )}

      {difSubtotal != null && (
        difSubtotal === 0 ? (
          <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
            <span>El subtotal de la factura es el mismo que armó el sistema.</span>
          </p>
        ) : (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              El subtotal difiere en <strong>{fmtCOP(Math.abs(difSubtotal))}</strong>: la
              factura cobra {difSubtotal > 0 ? 'más' : 'menos'} que lo que el sistema tiene
              en AOM, inversión y otros. Antes de validar hay que averiguar cuál de las dos
              está mal.
            </span>
          </p>
        )
      )}

      {avisos.map((a) => (
        <p key={a} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{a}</span>
        </p>
      ))}
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

/** Una línea de la comparación, con las dos cifras y si coinciden. */
function FilaComparada({ concepto, sistema, factura, nota, fuerte }: {
  concepto: string;
  sistema: number | null;
  factura: number | null;
  nota?: string;
  fuerte?: boolean;
}) {
  const hayAmbas = sistema != null && factura != null;
  const igual = hayAmbas && Math.round(sistema) === Math.round(factura);

  return (
    <tr className={fuerte ? 'font-semibold' : ''}>
      <td className="py-1.5">
        {concepto}
        {nota && (
          <span className="block text-xs font-normal text-[hsl(var(--canalco-neutral-500))]">
            {nota}
          </span>
        )}
      </td>
      <td className="py-1.5 text-right tabular-nums">
        {sistema == null ? '–' : fmtCOP(Math.round(sistema))}
      </td>
      <td className={
        'py-1.5 text-right tabular-nums '
        + (hayAmbas && !igual ? 'text-red-700' : '')
      }>
        {factura == null ? '–' : fmtCOP(Math.round(factura))}
      </td>
      <td className="py-1.5 text-right">
        {!hayAmbas ? null : igual
          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
          : <AlertTriangle className="w-4 h-4 text-red-600 inline" />}
      </td>
    </tr>
  );
}
