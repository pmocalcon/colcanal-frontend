import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSearch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/ui/footer';
import { useAuth } from '@/contexts/AuthContext';
import { puedeContrastarFactura } from '@/utils/rolesPmo';
import { useRecursoEconomico } from '@/hooks/useRecursoEconomico';
import { ContrasteFactura } from '@/components/recursoEconomico/ContrasteFactura';
import { ContrasteOrdenPago } from '@/components/recursoEconomico/ContrasteOrdenPago';
import {
  CONCEPTOS_RETENCION, facturaDiligenciada, fmtCOP, retencionFactura,
  subtotalFactura, valorPagoFactura, type FacturaMes,
} from '@/services/recursoEconomico.service';

/**
 * Contrastar la factura electrónica contra lo que el sistema tiene asentado.
 *
 * Vive aparte de la pantalla donde se diligencia, y no es un detalle de acomodo: allá
 * las cifras están en las casillas mientras alguien las escribe, y contrastar contra eso
 * es compararse con números que nadie ha guardado. Acá se lee **lo asentado**, que es lo
 * que de verdad se le va a cobrar al municipio.
 *
 * Además se revisa por otro camino: se escoge municipio y mes sin entrar a diligenciar
 * nada, y así se pueden repasar varias facturas seguidas —o una de hace tres meses—
 * sin riesgo de tocar una casilla al pasar.
 *
 * El archivo no se sube ni se guarda: se lee en el navegador y se olvida al salir.
 */

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** 'YYYY-MM' del mes anterior: la factura de un mes se liquida al mes siguiente. */
const periodoPorDefecto = (): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function Selector({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))] min-w-[12rem]"
      >
        {children}
      </select>
    </label>
  );
}

export default function ContrasteFacturaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEntrar = puedeContrastarFactura(user?.nombreRol);

  const { datos, empresas, loading } = useRecursoEconomico(puedeEntrar);

  const [periodo, setPeriodo] = useState<string>(periodoPorDefecto);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [anio, mes] = periodo.split('-');
  // Memorizado porque alimenta el useMemo de los años: sin esto sería un objeto nuevo
  // en cada render y la lista se recalcularía todas las veces.
  const facturas = useMemo(() => datos.facturas ?? {}, [datos]);
  const delMes: Record<string, FacturaMes> = facturas[periodo] ?? {};
  const f: FacturaMes = (companyId != null ? delMes[companyId] : undefined) ?? {};
  const ret = companyId != null ? datos.retenciones?.[companyId] : undefined;

  const subtotal = subtotalFactura(f);
  const pago = valorPagoFactura(f, ret);

  /** Los años con factura, más el actual y el anterior: los mismos que ofrece Factura. */
  const anios = useMemo(() => {
    const hoy = new Date().getFullYear();
    const conDatos = Object.keys(facturas).map((p) => p.slice(0, 4));
    return [...new Set([...conDatos, String(hoy - 1), String(hoy), anio])].sort();
  }, [facturas, anio]);

  const empresa = empresas.find((e) => e.companyId === companyId);

  if (!puedeEntrar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">
            Contraste de factura
          </h1>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Esta pantalla es del PMO y de los directores de proyecto. Si necesitas
            consultarla, pídesela al Analista o al Director de PMO.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--canalco-neutral-50))]">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/recurso-economico')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              Contraste de factura
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              La factura y la orden de pago contra lo que el sistema tiene asentado
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando las facturas…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 items-end">
              <Selector
                label="Municipio"
                value={companyId != null ? String(companyId) : ''}
                onChange={(v) => setCompanyId(v ? Number(v) : null)}
              >
                <option value="">Escoge un municipio…</option>
                {empresas.map((e) => (
                  <option key={e.companyId} value={e.companyId}>
                    {/* El punto marca los que ya tienen factura de ese mes: sin él habría
                        que entrar uno por uno para saber cuál se puede contrastar. */}
                    {facturaDiligenciada(delMes[e.companyId]) ? '• ' : ''}{e.name}
                  </option>
                ))}
              </Selector>

              <Selector label="Año" value={anio} onChange={(v) => setPeriodo(`${v}-${mes}`)}>
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </Selector>

              <Selector
                label="Mes de liquidación"
                value={mes}
                onChange={(v) => setPeriodo(`${anio}-${v}`)}
              >
                {MESES.map((nombre, i) => (
                  <option key={i} value={String(i + 1).padStart(2, '0')}>{nombre}</option>
                ))}
              </Selector>
            </div>

            {companyId == null ? (
              <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                Escoge un municipio para contrastar su factura.
              </p>
            ) : subtotal <= 0 ? (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {empresa?.name} no tiene factura asentada de {MESES[Number(mes) - 1]} de {anio}.
                Hay que diligenciarla y guardarla en <strong>Factura</strong> antes de poder
                contrastarla: sin cifras guardadas no hay contra qué comparar el archivo.
              </p>
            ) : (
              <>
                {/*
                  Lo asentado, a la vista y en el mismo orden que el contraste de abajo.
                  Quien contrasta tiene que poder ver contra qué está comparando sin
                  cambiar de pantalla.
                */}
                <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white">
                  <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                    LO ASENTADO · {empresa?.name} · {MESES[Number(mes) - 1]} de {anio}
                  </header>
                  <dl className="divide-y divide-[hsl(var(--canalco-neutral-200))] text-sm">
                    <Linea termino="AOM" valor={f.aom} />
                    <Linea termino="Inversión" valor={f.inversion} />
                    <Linea termino="Otros" valor={f.otros} />
                    <Linea termino="Subtotal" valor={subtotal} fuerte />
                    {CONCEPTOS_RETENCION.map((c) => {
                      const { valor, manual } = retencionFactura(f, ret, c.key);
                      return (
                        <Linea
                          key={c.key}
                          termino={c.label}
                          nota={manual ? 'escrito a mano' : undefined}
                          valor={valor}
                        />
                      );
                    })}
                    <Linea termino="Valor pago" valor={pago} fuerte />
                  </dl>
                </div>

                <ContrasteFactura
                  subtotal={subtotal}
                  pago={pago}
                  retenciones={CONCEPTOS_RETENCION.map((c) => ({
                    key: c.key,
                    label: c.label,
                    valor: retencionFactura(f, ret, c.key).valor,
                  }))}
                  empresa={empresa?.name ?? ''}
                  periodo={periodo}
                />

                {/*
                  Los dos extremos del ciclo, en la misma pantalla: la factura dice lo que
                  se cobró y la orden de pago lo que el municipio manda girar. Entre las
                  dos está lo que se retiene, que la factura no trae y la orden sí.
                */}
                <ContrasteOrdenPago
                  subtotal={subtotal}
                  pago={pago}
                  retenciones={CONCEPTOS_RETENCION.map((c) => ({
                    key: c.key,
                    label: c.label,
                    valor: retencionFactura(f, ret, c.key).valor,
                  }))}
                  periodo={periodo}
                />
              </>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

/** Una línea de «lo asentado». El nulo es «no aplica» y no se pinta como cero. */
function Linea({ termino, valor, nota, fuerte }: {
  termino: string;
  valor: number | null | undefined;
  nota?: string;
  fuerte?: boolean;
}) {
  return (
    <div className={'flex items-baseline justify-between gap-4 px-4 py-2 ' + (fuerte ? 'font-semibold' : '')}>
      <dt>
        {termino}
        {nota && (
          <span className="ml-2 text-xs font-normal text-[hsl(var(--canalco-neutral-500))]">
            {nota}
          </span>
        )}
      </dt>
      <dd className="tabular-nums">
        {valor == null || valor === 0 ? '–' : fmtCOP(Math.round(valor))}
      </dd>
    </div>
  );
}
