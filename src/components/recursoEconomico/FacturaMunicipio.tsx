import { useMemo } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CONCEPTOS_RETENCION, subtotalFactura, retencionFactura, valorPagoFactura,
  facturaDiligenciada, fmtCOP, fmtPct,
  type EmpresaRecurso, type FacturaMes, type RetencionProyecto,
} from '@/services/recursoEconomico.service';
import type { LiquidacionResultado } from '@/utils/cregCalc';

/**
 * La factura de concesión de **un** municipio en un mes.
 *
 * Se diligencia de a una, como el papel: se escoge municipio y mes de liquidación y se
 * llena esa factura. Mostrar los diez a la vez obligaba a barrer una tabla de doce
 * columnas para escribir tres cifras, y la factura que se tiene delante es siempre una.
 *
 * **Las retenciones no se teclean**: salen del subtotal aplicando los porcentajes de
 * Parámetros → Retención. Se pueden pisar cuando un mes llega distinto, y entonces la
 * casilla queda marcada —una cifra escrita a mano no puede verse igual que una
 * calculada, o nadie sabría cuál va a cambiar al corregir el porcentaje—.
 */

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Casilla de pesos: acepta lo que se teclee y se queda con los dígitos. */
function CampoPesos({ valor, onValor, marcado, placeholder, title }: {
  valor: number | null;
  onValor: (v: number | null) => void;
  marcado?: boolean;
  placeholder?: string;
  title?: string;
}) {
  return (
    <input
      title={title}
      className={
        'w-full h-9 px-3 text-right tabular-nums rounded-md border outline-none '
        + 'focus:border-[hsl(var(--canalco-primary))] '
        + (marcado
          ? 'border-amber-300 bg-amber-50 font-semibold'
          : 'border-[hsl(var(--canalco-neutral-300))] bg-white')
      }
      value={valor != null ? valor.toLocaleString('es-CO') : ''}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        const n = Number(e.target.value.replace(/[^\d]/g, ''));
        // Vaciar la casilla la deja sin valor, que no es lo mismo que un cero.
        onValor(Number.isFinite(n) && n > 0 ? n : null);
      }}
    />
  );
}

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
        className="h-9 px-2 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))] min-w-[150px]"
      >
        {children}
      </select>
    </label>
  );
}

/** Una línea del cuadro: rótulo a la izquierda, cifra a la derecha. */
function Linea({ label, nota, children, fuerte }: {
  label: string;
  nota?: string;
  children: React.ReactNode;
  fuerte?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_170px] items-center gap-4 px-4 py-2 ${fuerte ? 'font-semibold' : ''}`}>
      <div className="text-sm">
        {label}
        {nota && (
          <span className="ml-2 text-xs font-normal text-[hsl(var(--canalco-neutral-500))]">
            {nota}
          </span>
        )}
      </div>
      <div className="text-right tabular-nums">{children}</div>
    </div>
  );
}

const MARCO = 'border border-[hsl(var(--canalco-neutral-200))] rounded-lg overflow-hidden';
const DIVISOR = 'divide-y divide-[hsl(var(--canalco-neutral-200))]';

/** El índice de actualización, con los dos decimales con que lo muestra CREG. */
const fmtIndice = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «valor a pagar $X · ajuste $Y», solo cuando hay ajuste que explicar. */
const notaAjuste = (valor: number, ajuste: number): string | undefined =>
  ajuste ? `valor a pagar ${fmtCOP(Math.round(valor))} · ajuste ${fmtCOP(ajuste)}` : undefined;

/**
 * Lo que la Liquidación CREG dice que se le cobra al municipio ese mes.
 *
 * La factura no se inventa las cifras: el AOM y la inversión se calculan en la
 * Liquidación con el censo, el IPP y los índices de disponibilidad, y de ahí
 * salen. Acá llegan ya repartidas en los tres conceptos de la factura.
 *
 * Se traen con un botón y no se escriben solas: lo que quede facturado tiene que
 * ser algo que alguien puso. Además la factura puede apartarse de la liquidación
 * a propósito —un mes que se cobra partido, una nota crédito—, y sobrescribirlo
 * en silencio borraría esa decisión.
 *
 * Cada concepto viene con su ajuste incorporado, porque el ajuste es parte de lo
 * que se cobra: dejarlo fuera sacaría una factura corta.
 */
function PanelLiquidacion({ liq, cargando, error, mesLabel, factura, onTraer }: {
  liq: LiquidacionResultado | null;
  cargando: boolean;
  error: string | null;
  mesLabel: string;
  factura: FacturaMes;
  onTraer: (patch: Partial<FacturaMes>) => void;
}) {
  const hay = !!liq && liq.hayCenso;

  /*
   * Lo que escribe el botón. «Otros» solo entra cuando la liquidación lo trae
   * —en la 123 no existe—: si no, el botón borraría lo que alguien hubiera
   * anotado ahí, que es justamente el concepto que no sale del cálculo.
   * Un cero se guarda como vacío, igual que al teclear: la casilla en blanco
   * dice «no se facturó», el 0 diría «se facturó en cero».
   */
  const traer: Partial<FacturaMes> = {
    aom: liq?.aom || null,
    inversion: liq?.inversion || null,
    ...(liq?.otros ? { otros: liq.otros } : {}),
  };
  const coincide = !!liq
    && (factura.aom ?? null) === (liq.aom || null)
    && (factura.inversion ?? null) === (liq.inversion || null)
    && (!liq.otros || (factura.otros ?? null) === liq.otros);
  const diferencia = liq ? subtotalFactura(factura) - liq.total : 0;

  return (
    <div className={MARCO}>
      <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
          LIQUIDACIÓN CREG
          <span className="ml-2 font-normal text-[hsl(var(--canalco-neutral-500))]">{mesLabel}</span>
        </span>
        {hay && (
          /*
           * Un mes sin cerrar todavía se puede mover: alguien puede corregir el
           * censo, el IPP o un reporte de falla y la cifra cambia. Facturar sobre
           * eso es lo que después obliga a una nota crédito, así que se avisa.
           */
          liq!.aprobado
            ? <span className="text-[11px] font-medium text-emerald-700">mes cerrado</span>
            : <span className="text-[11px] font-medium text-amber-700">mes sin cerrar</span>
        )}
      </header>

      {cargando ? (
        <p className="px-4 py-3 text-sm text-[hsl(var(--canalco-neutral-500))] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Leyendo la liquidación…
        </p>
      ) : error ? (
        <p className="px-4 py-3 text-sm text-[hsl(var(--canalco-neutral-600))]">
          {error} La factura se puede diligenciar a mano.
        </p>
      ) : !hay ? (
        <p className="px-4 py-3 text-sm text-[hsl(var(--canalco-neutral-600))]">
          No hay liquidación de {mesLabel} para este municipio: el censo no tiene ese mes.
          Se puede facturar a mano.
        </p>
      ) : (
        <>
          {/* El pr-3 alinea estas cifras con el texto de las casillas de abajo. */}
          <div className={DIVISOR}>
            <Linea label="AOM" nota={notaAjuste(liq!.valorAom, liq!.ajusteAom)}>
              <span className="pr-3">{fmtCOP(liq!.aom)}</span>
            </Linea>
            <Linea label="Inversión" nota={notaAjuste(liq!.valorInv, liq!.ajusteInv)}>
              <span className="pr-3">{fmtCOP(liq!.inversion)}</span>
            </Linea>
            {liq!.es101 && (
              <Linea
                label="Otros"
                nota={`ambientales ${fmtCOP(Math.round(liq!.ambMes + liq!.ajusteAmb))}`
                  + (liq!.valorChura ? ` · CVURA ${fmtCOP(liq!.valorChura)}` : '')}
              >
                <span className="pr-3">{fmtCOP(liq!.otros)}</span>
              </Linea>
            )}
            <Linea label="Total del mes" nota={`índice ${fmtIndice(liq!.indice)}`} fuerte>
              <span className="pr-3">{fmtCOP(liq!.total)}</span>
            </Linea>
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[hsl(var(--canalco-neutral-50))]">
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {coincide
                ? 'Lo facturado coincide con la liquidación.'
                : diferencia !== 0 && facturaDiligenciada(factura)
                  ? <>Lo facturado va <strong className="text-amber-700">
                      {fmtCOP(Math.abs(diferencia))} {diferencia > 0 ? 'por encima' : 'por debajo'}
                    </strong> de la liquidación.</>
                  : 'Trae las tres cifras a la factura.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTraer(traer)}
              disabled={coincide}
              className="gap-2"
              title={coincide
                ? 'La factura ya tiene las cifras de la liquidación'
                : 'Escribe AOM, inversión y otros con lo liquidado'}
            >
              <Download className="w-4 h-4" /> Traer a la factura
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function FacturaMunicipio({
  empresas, companyId, setCompanyId, periodo, setPeriodo,
  facturas, retenciones, revisor, onFactura,
  liquidacion, cregCargando, cregError,
}: {
  empresas: EmpresaRecurso[];
  companyId: number | null;
  setCompanyId: (id: number) => void;
  /** 'YYYY-MM'. */
  periodo: string;
  setPeriodo: (p: string) => void;
  facturas: Record<string, Record<string, FacturaMes>>;
  retenciones: Record<string, RetencionProyecto>;
  /** Quién marca el visto bueno: queda estampado en la constancia. */
  revisor: string;
  onFactura: (patch: Partial<FacturaMes>) => void;
  /** Lo que la Liquidación CREG cobra este mes, de donde salen AOM e inversión. */
  liquidacion: LiquidacionResultado | null;
  cregCargando: boolean;
  cregError: string | null;
}) {
  const [anio, mes] = periodo.split('-');
  const delMes = facturas[periodo] ?? {};
  const f: FacturaMes = (companyId != null ? delMes[companyId] : undefined) ?? {};
  const ret = companyId != null ? retenciones[companyId] : undefined;

  const subtotal = subtotalFactura(f);
  const pago = valorPagoFactura(f, ret);
  const totalRetenido = subtotal - pago;
  const visto = f.visto ?? null;

  /** Los años que se ofrecen: los que ya tienen factura, más el actual y el anterior. */
  const anios = useMemo(() => {
    const hoy = new Date().getFullYear();
    const conDatos = Object.keys(facturas).map((p) => p.slice(0, 4));
    return [...new Set([...conDatos, String(hoy - 1), String(hoy), anio])].sort();
  }, [facturas, anio]);

  /**
   * Qué falta por facturar este mes.
   *
   * Al diligenciar de a una se pierde de vista el conjunto, y la pregunta de fin de mes
   * es justamente cuál falta. Se responde acá en una línea en vez de obligar a recorrer
   * los diez municipios del selector.
   */
  const pendientes = useMemo(
    () => empresas.filter((e) => !facturaDiligenciada(delMes[e.companyId])),
    [empresas, delMes],
  );

  const marco = MARCO;
  const divisor = DIVISOR;

  return (
    <div className="p-4 space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <Selector
          label="Municipio"
          value={companyId != null ? String(companyId) : ''}
          onChange={(v) => setCompanyId(Number(v))}
        >
          {empresas.map((e) => (
            <option key={e.companyId} value={e.companyId}>
              {facturaDiligenciada(delMes[e.companyId]) ? '• ' : ''}{e.name}
            </option>
          ))}
        </Selector>

        <Selector label="Año" value={anio} onChange={(v) => setPeriodo(`${v}-${mes}`)}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </Selector>

        <Selector label="Mes de liquidación" value={mes} onChange={(v) => setPeriodo(`${anio}-${v}`)}>
          {MESES.map((nombre, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{nombre}</option>
          ))}
        </Selector>
      </div>

      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
        {pendientes.length === 0
          ? <>Los {empresas.length} municipios ya tienen factura de {MESES[Number(mes) - 1]}.</>
          : <>
              Falta facturar {MESES[Number(mes) - 1]} de {anio} en{' '}
              <strong>{pendientes.map((e) => e.name).join(', ')}</strong>.
            </>}
      </p>

      {companyId == null ? (
        <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
          Escoge un municipio para diligenciar su factura.
        </p>
      ) : (
        <div className="max-w-2xl space-y-5">
          {/* De dónde salen las cifras */}
          <PanelLiquidacion
            liq={liquidacion}
            cargando={cregCargando}
            error={cregError}
            mesLabel={`${MESES[Number(mes) - 1]} de ${anio}`}
            factura={f}
            onTraer={onFactura}
          />

          {/* Lo facturado */}
          <div className={marco}>
            <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
              LO FACTURADO
            </header>
            <div className={divisor}>
              <Linea label="AOM">
                <CampoPesos valor={f.aom ?? null} onValor={(v) => onFactura({ aom: v })} />
              </Linea>
              <Linea label="Inversión">
                <CampoPesos valor={f.inversion ?? null} onValor={(v) => onFactura({ inversion: v })} />
              </Linea>
              <Linea label="Otros" nota="lo que no es AOM ni inversión">
                <CampoPesos valor={f.otros ?? null} onValor={(v) => onFactura({ otros: v })} />
              </Linea>
              <Linea label="Subtotal" fuerte>
                <span className="pr-3">{subtotal > 0 ? fmtCOP(subtotal) : '–'}</span>
              </Linea>
            </div>
          </div>

          {/* Lo retenido */}
          <div className={marco}>
            <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
              RETENCIONES
              <span className="ml-2 font-normal text-[hsl(var(--canalco-neutral-500))]">
                salen del subtotal con los % de Parámetros
              </span>
            </header>
            <div className={divisor}>
              {CONCEPTOS_RETENCION.map((c) => {
                const { valor, manual } = retencionFactura(f, ret, c.key);
                const pct = ret?.[c.key];
                return (
                  <Linea
                    key={c.key}
                    label={c.label}
                    nota={manual ? 'escrito a mano' : pct != null ? fmtPct(pct) : 'no aplica'}
                  >
                    <CampoPesos
                      valor={valor}
                      marcado={manual}
                      placeholder={pct != null ? '0' : 'no aplica'}
                      title={manual
                        ? 'Valor escrito a mano: no sale del porcentaje. Vacíala para volver al cálculo.'
                        : pct != null
                          ? `Calculado: ${fmtPct(pct)} del subtotal`
                          : 'No aplica en este municipio. Se puede escribir un valor si este mes lo trae.'}
                      onValor={(v) => onFactura({ manual: { ...(f.manual ?? {}), [c.key]: v } })}
                    />
                  </Linea>
                );
              })}
              <Linea label="Total retenido" fuerte>
                <span className="pr-3">{totalRetenido > 0 ? `− ${fmtCOP(totalRetenido)}` : '–'}</span>
              </Linea>
            </div>
          </div>

          {/* Lo que se paga */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-primary))]/30">
            <span className="text-sm font-semibold">Valor pago</span>
            <span className="text-lg font-bold tabular-nums">
              {subtotal > 0 ? fmtCOP(pago) : '–'}
            </span>
          </div>

          {/* Constancia */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
            <label className="block">
              <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
                Enlace a la factura
              </span>
              <div className="flex items-center gap-2">
                <input
                  className="w-full h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
                  value={f.link ?? ''}
                  placeholder="factura electrónica o correo de envío"
                  onChange={(e) => onFactura({ link: e.target.value })}
                />
                {f.link?.trim() && (
                  <a
                    href={f.link}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir la factura"
                    className="text-[hsl(var(--canalco-primary))] shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </label>

            {/*
              Se estampa quién y cuándo, no un simple `true`: el visto bueno es la
              constancia de una revisión, y sin nombre ni fecha no se puede decir
              después quién la dio.
            */}
            <label className="flex items-center gap-2 h-9 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!visto}
                onChange={(e) => onFactura({
                  visto: e.target.checked
                    ? { nombre: revisor, fecha: new Date().toISOString().slice(0, 10) }
                    : null,
                })}
                className="accent-[hsl(var(--canalco-primary))]"
              />
              V.º B.º de la Directora
              {visto && (
                <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                  · {visto.nombre}, {visto.fecha}
                </span>
              )}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
