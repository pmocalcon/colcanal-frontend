import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { esRolPmo } from '@/utils/rolesPmo';
import {
  recursoEconomicoService, valorInterventoria, totalRetenciones, IVA,
  type RecursoEconomicoData, type EmpresaRecurso,
  type ProyectoAnio, type RetencionProyecto,
} from '@/services/recursoEconomico.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Footer } from '@/components/ui/footer';
import { ArrowLeft, Loader2, Save, Wallet, Plus, Copy } from 'lucide-react';

/**
 * Recurso Económico.
 *
 * Dos tablas que viven juntas porque describen el mismo contrato desde los dos
 * lados del dinero:
 *
 *   Interventoría — cuánto se paga al interventor de cada proyecto. Cambia cada
 *                   año, así que la tabla es por vigencia: el SMLV del contrato
 *                   y el salario mínimo del año dan el valor.
 *   Retenciones   — qué descuentos lleva la orden de pago de la factura de
 *                   concesión en cada municipio.
 *
 * Módulo del PMO. El backend lo cierra por rol; acá se repite la verificación
 * para no pintar una página que después no va a cargar.
 */

type Tab = 'interventoria' | 'retenciones';

const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** '4', '4,5', '8/1000' -> 4 | 4.5 | 0.8. Vacío -> null (no aplica). */
const parsePct = (texto: string): number | null => {
  const limpio = texto.trim().replace(',', '.');
  if (!limpio) return null;
  // Las estampillas y el ICA se pactan en milésimas ("8/1000") tal como quedan
  // escritas en el contrato; se guardan siempre como porcentaje.
  const fraccion = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(limpio);
  if (fraccion) {
    const n = Number(fraccion[1]), d = Number(fraccion[2]);
    return d > 0 ? (n / d) * 100 : null;
  }
  const n = Number(limpio.replace('%', ''));
  return Number.isFinite(n) ? n : null;
};

const fmtPct = (n: number | null | undefined): string => {
  if (n == null) return '';
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: 3 })}%`;
};

export default function RecursoEconomicoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esPmo = esRolPmo(user?.nombreRol);

  const [datos, setDatos] = useState<RecursoEconomicoData>({});
  const [guardado, setGuardado] = useState<RecursoEconomicoData>({});
  const [empresas, setEmpresas] = useState<EmpresaRecurso[]>([]);
  /** Proyectos del cuadro que no existen como empresa: no se pueden guardar. */
  const [sinEmpresa, setSinEmpresa] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('interventoria');
  const [anio, setAnio] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!esPmo) { setLoading(false); return; }
    recursoEconomicoService.get()
      .then(({ data, empresas: e, sinEmpresa: falta }) => {
        setDatos(data); setGuardado(data); setEmpresas(e); setSinEmpresa(falta);
        // Se abre en el año más reciente que ya tenga datos, no en el actual:
        // si el año todavía no se ha cargado, la tabla saldría vacía.
        const anios = Object.keys(data.anios ?? {}).sort();
        if (anios.length) setAnio(anios[anios.length - 1]);
      })
      .catch(() => toast.error('No se pudo cargar Recurso Económico'))
      .finally(() => setLoading(false));
  }, [esPmo]);

  const sinGuardar = useMemo(
    () => JSON.stringify(datos) !== JSON.stringify(guardado),
    [datos, guardado],
  );

  // Aviso del navegador al cerrar con cambios pendientes.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sinGuardar]);

  const guardar = useCallback(async () => {
    setSaving(true);
    try {
      const fresco = await recursoEconomicoService.save(datos);
      setGuardado(fresco); setDatos(fresco);
      toast.success('Recurso Económico guardado');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [datos]);

  const anios = useMemo(() => Object.keys(datos.anios ?? {}).sort(), [datos.anios]);
  const anioActual = datos.anios?.[anio];
  const smmlv = anioActual?.smmlv ?? null;

  const setAnioCampo = (patch: Partial<{ smmlv: number | null; smmlvHeredado: boolean }>) =>
    setDatos((d) => ({
      ...d,
      anios: {
        ...(d.anios ?? {}),
        [anio]: { proyectos: {}, ...(d.anios?.[anio] ?? {}), ...patch },
      },
    }));

  const setProyecto = (companyId: number, patch: Partial<ProyectoAnio>) =>
    setDatos((d) => {
      const a = d.anios?.[anio] ?? { proyectos: {} };
      return {
        ...d,
        anios: {
          ...(d.anios ?? {}),
          [anio]: {
            ...a,
            proyectos: {
              ...(a.proyectos ?? {}),
              [companyId]: { ...(a.proyectos?.[companyId] ?? {}), ...patch },
            },
          },
        },
      };
    });

  const setRetencion = (companyId: number, patch: Partial<RetencionProyecto>) =>
    setDatos((d) => ({
      ...d,
      retenciones: {
        ...(d.retenciones ?? {}),
        [companyId]: { ...(d.retenciones?.[companyId] ?? {}), ...patch },
      },
    }));

  /** Abre un año nuevo. Copiar el anterior evita re-teclear diez contratos. */
  const nuevoAnio = (copiar: boolean) => {
    const propuesto = anios.length ? String(Number(anios[anios.length - 1]) + 1) : anio;
    const texto = window.prompt('¿Qué año se abre?', propuesto);
    if (!texto) return;
    const y = texto.trim();
    if (!/^\d{4}$/.test(y)) { toast.error('El año va en cuatro dígitos'); return; }
    if (datos.anios?.[y]) { toast.error(`El año ${y} ya existe`); setAnio(y); return; }
    const base = copiar && anios.length ? datos.anios?.[anios[anios.length - 1]] : undefined;
    setDatos((d) => ({
      ...d,
      anios: {
        ...(d.anios ?? {}),
        // El SMMLV se hereda para que la tabla calcule desde el primer momento,
        // pero queda marcado: en enero todavía es el salario del año pasado y
        // hay que reemplazarlo cuando salga el decreto.
        [y]: {
          smmlv: base?.smmlv ?? null,
          smmlvHeredado: base?.smmlv != null,
          proyectos: base ? JSON.parse(JSON.stringify(base.proyectos ?? {})) : {},
        },
      },
    }));
    setAnio(y);
    toast.success(copiar ? `Año ${y} creado con los contratos del anterior` : `Año ${y} creado`);
  };

  if (!esPmo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">
            Recurso Económico
          </h1>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Este módulo es del PMO. Si necesitas consultarlo, pídeselo al Analista o al
            Director de PMO.
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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost" size="icon"
            onClick={() => {
              if (sinGuardar && !window.confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return;
              navigate('/dashboard');
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Wallet className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Recurso Económico
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Interventoría por año · Retenciones de la orden de pago
            </p>
          </div>
          <Button
            onClick={guardar}
            disabled={saving || !sinGuardar}
            title={sinGuardar ? 'Guardar los cambios' : 'No hay cambios por guardar'}
            className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </Button>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-lg">
            {sinEmpresa.length > 0 && (
              <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Sin empresa registrada: <strong>{sinEmpresa.join(', ')}</strong>. Esas filas no
                aparecen porque no hay contra qué guardarlas; hay que crear la empresa primero.
              </div>
            )}
            <div className="flex gap-1 px-4 pt-3 border-b border-[hsl(var(--canalco-neutral-200))]">
              {([
                ['interventoria', 'Interventoría'],
                ['retenciones', 'Retención'],
              ] as [Tab, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${
                    tab === k
                      ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                      : 'border-transparent text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-neutral-900))]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'interventoria' && (
              <TablaInterventoria
                empresas={empresas}
                anios={anios}
                anio={anio}
                setAnio={setAnio}
                smmlv={smmlv}
                smmlvHeredado={!!anioActual?.smmlvHeredado}
                proyectos={anioActual?.proyectos ?? {}}
                // Escribirlo a mano deja de ser heredado: ya es el del decreto.
                onSmmlv={(v) => setAnioCampo({ smmlv: v, smmlvHeredado: false })}
                onProyecto={setProyecto}
                onNuevoAnio={nuevoAnio}
              />
            )}
            {tab === 'retenciones' && (
              <TablaRetenciones
                empresas={empresas}
                retenciones={datos.retenciones ?? {}}
                onRetencion={setRetencion}
              />
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ── Interventoría ─────────────────────────────── */

function TablaInterventoria({
  empresas, anios, anio, setAnio, smmlv, smmlvHeredado, proyectos, onSmmlv, onProyecto, onNuevoAnio,
}: {
  empresas: EmpresaRecurso[];
  anios: string[];
  anio: string;
  setAnio: (y: string) => void;
  smmlv: number | null;
  smmlvHeredado: boolean;
  proyectos: Record<string, ProyectoAnio>;
  onSmmlv: (v: number | null) => void;
  onProyecto: (companyId: number, patch: Partial<ProyectoAnio>) => void;
  onNuevoAnio: (copiar: boolean) => void;
}) {
  const conContrato = empresas.filter((e) => {
    const p = proyectos[e.companyId];
    return p && (p.smlv != null || p.firma || p.valorManual != null);
  });
  const total = conContrato.reduce(
    (a, e) => a + (valorInterventoria(proyectos[e.companyId], smmlv) ?? 0), 0,
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
            Vigencia
          </label>
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white min-w-[110px]"
          >
            {(anios.length ? anios : [anio]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
            SMMLV de {anio} ($)
            {!smmlv && <span className="ml-1 text-red-600 font-bold">· falta</span>}
            {smmlvHeredado && <span className="ml-1 text-amber-700">· heredado</span>}
          </label>
          <Input
            // Sin este dato la columna del valor queda en blanco entera, así que
            // la casilla vacía se marca en rojo y no como un campo más.
            className={`h-9 w-44 text-sm tabular-nums ${
              !smmlv
                ? 'border-red-400 ring-2 ring-red-100'
                : smmlvHeredado ? 'border-amber-400 bg-amber-50' : ''
            }`}
            value={smmlv != null ? smmlv.toLocaleString('es-CO') : ''}
            placeholder="escríbelo aquí"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ''));
              onSmmlv(n > 0 ? n : null);
            }}
          />
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => onNuevoAnio(true)}>
          <Copy className="w-4 h-4" /> Nuevo año copiando este
        </Button>
        <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => onNuevoAnio(false)}>
          <Plus className="w-4 h-4" /> Nuevo año en blanco
        </Button>
      </div>

      <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
        El valor sale de <strong>SMLV × SMMLV del año</strong>, más IVA donde el contrato lo
        lleva. Cambiar el SMMLV actualiza los {empresas.length} proyectos de una vez. Si un
        contrato quedó pactado en firme, se escribe el valor y ese manda.
      </p>

      {!smmlv && (
        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
          <strong>Falta el SMMLV de {anio}.</strong> Por eso la columna del valor está
          vacía: el SMLV de cada contrato ya está, pero no hay por cuánto multiplicarlo.
          Escríbelo arriba y los {empresas.length} valores salen solos.
        </div>
      )}
      {smmlv != null && smmlvHeredado && (
        <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
          El SMMLV de {anio} viene <strong>heredado del año anterior</strong>, así que la tabla
          ya calcula pero con el salario viejo. Reemplázalo cuando salga el decreto.
        </div>
      )}

      <div className="overflow-auto border border-[hsl(var(--canalco-neutral-200))] rounded-md">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[hsl(var(--canalco-neutral-100))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[160px]">PROYECTO</th>
              <th className="px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[260px]">INTERVENTORÍA</th>
              <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] w-24">SMLV</th>
              <th className="px-3 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] w-20">IVA</th>
              <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[150px]">VALOR ACTUAL</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const p = proyectos[e.companyId] ?? {};
              const valor = valorInterventoria(p, smmlv);
              const manual = typeof p.valorManual === 'number' && p.valorManual > 0;
              return (
                <tr key={e.companyId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                  <td className="px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] font-medium whitespace-nowrap">
                    {e.name}
                  </td>
                  <td className="p-0 border border-[hsl(var(--canalco-neutral-200))]">
                    <input
                      className="w-full px-3 py-1.5 bg-transparent outline-none focus:bg-[hsl(var(--canalco-primary))]/10"
                      value={p.firma ?? ''}
                      placeholder="firma interventora"
                      onChange={(ev) => onProyecto(e.companyId, { firma: ev.target.value })}
                    />
                  </td>
                  <td className="p-0 border border-[hsl(var(--canalco-neutral-200))]">
                    <input
                      className="w-full px-3 py-1.5 text-right tabular-nums bg-transparent outline-none focus:bg-[hsl(var(--canalco-primary))]/10"
                      value={p.smlv ?? ''}
                      placeholder="–"
                      onChange={(ev) => {
                        const n = Number(ev.target.value.replace(/[^\d.,]/g, '').replace(',', '.'));
                        onProyecto(e.companyId, { smlv: ev.target.value.trim() && Number.isFinite(n) ? n : null });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1 text-center border border-[hsl(var(--canalco-neutral-200))]">
                    <input
                      type="checkbox"
                      checked={!!p.iva}
                      title={`Suma el ${IVA * 100}% al valor`}
                      onChange={(ev) => onProyecto(e.companyId, { iva: ev.target.checked })}
                      className="accent-[hsl(var(--canalco-primary))]"
                    />
                  </td>
                  <td
                    className={`p-0 border border-[hsl(var(--canalco-neutral-200))] ${manual ? 'bg-amber-50' : ''}`}
                    title={manual
                      ? 'Valor escrito a mano: no sale de SMLV × SMMLV'
                      : 'Calculado con el SMLV y el SMMLV del año'}
                  >
                    <input
                      className={`w-full px-3 py-1.5 text-right tabular-nums bg-transparent outline-none focus:bg-[hsl(var(--canalco-primary))]/10 ${manual ? 'font-semibold' : ''}`}
                      value={valor != null ? valor.toLocaleString('es-CO') : ''}
                      // Un contrato con SMLV pero sin valor solo puede ser por el
                      // SMMLV: decirlo aquí ahorra buscar la causa.
                      placeholder={p.smlv != null && !smmlv ? 'falta el SMMLV' : '–'}
                      onChange={(ev) => {
                        const n = Number(ev.target.value.replace(/[^\d]/g, ''));
                        // Borrar la celda devuelve el valor al cálculo.
                        onProyecto(e.companyId, { valorManual: n > 0 ? n : null });
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
              <td className="px-3 py-1.5 border border-[hsl(var(--canalco-neutral-200))]" colSpan={4}>
                Total {conContrato.length} contrato(s) de {anio}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))]">
                {total > 0 ? fmtCOP(total) : '–'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── Retenciones ───────────────────────────────── */

const COLS_RETENCION: { key: keyof RetencionProyecto; label: string }[] = [
  { key: 'rteFte', label: 'RTE FTE' },
  { key: 'rteIca', label: 'RTE ICA' },
  { key: 'timbre', label: 'IMPTO TIMBRE' },
  { key: 'estampillas', label: 'ESTAMPILLAS' },
];

function TablaRetenciones({ empresas, retenciones, onRetencion }: {
  empresas: EmpresaRecurso[];
  retenciones: Record<string, RetencionProyecto>;
  onRetencion: (companyId: number, patch: Partial<RetencionProyecto>) => void;
}) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">
          Descuentos aplicados a órdenes de pago de factura Concesión
        </h3>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
          Una casilla <strong>vacía</strong> es una retención que <strong>no aplica</strong> en ese
          municipio, y no entra al total; un <strong>0</strong> escrito es una retención que aplica
          en cero. Se puede escribir en milésimas como en el contrato —<code>8/1000</code>— y
          queda guardada como porcentaje.
        </p>
      </div>

      <div className="overflow-auto border border-[hsl(var(--canalco-neutral-200))] rounded-md">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[hsl(var(--canalco-neutral-100))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[160px]">PROYECTO</th>
              {COLS_RETENCION.map((c) => (
                <th key={c.key} className="px-3 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[120px]">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[100px]">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const r = retenciones[e.companyId] ?? {};
              const total = totalRetenciones(r);
              return (
                <tr key={e.companyId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                  <td className="px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] font-medium whitespace-nowrap">
                    {e.name}
                  </td>
                  {COLS_RETENCION.map((c) => {
                    const v = r[c.key];
                    const noAplica = v == null;
                    return (
                      <td
                        key={c.key}
                        title={noAplica ? 'No aplica en este municipio' : undefined}
                        className={`p-0 border border-[hsl(var(--canalco-neutral-200))] ${
                          noAplica ? 'bg-[hsl(var(--canalco-neutral-100))]' : ''
                        }`}
                      >
                        <CeldaPct
                          valor={v ?? null}
                          onValor={(n) => onRetencion(e.companyId, { [c.key]: n } as Partial<RetencionProyecto>)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1 text-center tabular-nums font-semibold border border-[hsl(var(--canalco-neutral-200))]">
                    {total != null ? fmtPct(total) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Celda de porcentaje. Mientras se edita muestra el número crudo; al salir, con
 * el signo. Formatear durante la escritura mueve el cursor y "4%" no vuelve a
 * parsear como número.
 */
function CeldaPct({ valor, onValor }: {
  valor: number | null;
  onValor: (v: number | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  return (
    <input
      className="w-full px-3 py-1.5 text-center tabular-nums bg-transparent outline-none focus:bg-[hsl(var(--canalco-primary))]/10"
      value={editando ? texto : fmtPct(valor)}
      placeholder="no aplica"
      onFocus={() => { setTexto(valor != null ? String(valor).replace('.', ',') : ''); setEditando(true); }}
      onBlur={() => setEditando(false)}
      onChange={(e) => { setTexto(e.target.value); onValor(parsePct(e.target.value)); }}
    />
  );
}
