import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import {
  indiceDisponibilidad, indiceDisponibilidadOn,
  type IddOffMes, type IddOnMes, type LiquidacionMes,
} from '@/services/creg.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, AlertCircle, LineChart, Save } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  deriveParams, computeMes, monthsBetween, computeFcm, rollupAnual, emptySupuestos,
  type CellQty, type MesResultado, type FlujoMonthCol, type FlujoSupuestos, type FcmMes, type FcmAnual,
} from '@/utils/cregCalc';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const fmtCOP = (n: number | null) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO');

type Tab = 'supuestos' | 'caom' | 'cinv' | 'energia' | 'fcm' | 'anual';
const TABS: { id: Tab; label: string }[] = [
  { id: 'supuestos', label: 'Supuestos' },
  { id: 'caom', label: 'CAOM' },
  { id: 'cinv', label: 'CINV' },
  { id: 'energia', label: 'ENERGÍA' },
  { id: 'fcm', label: 'FCM' },
  { id: 'anual', label: '5 Flujo Caja Anual' },
];

export default function CregFlujoCajaPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [params, setParams] = useState<Record<string, any>>({});
  const [quantities, setQuantities] = useState<Record<string, Record<string, CellQty | number>>>({});
  const [liqMeses, setLiqMeses] = useState<Record<string, LiquidacionMes>>({});
  const [iddMeses, setIddMeses] = useState<Record<string, IddOffMes>>({});
  const [iddOnMeses, setIddOnMeses] = useState<Record<string, IddOnMes>>({});

  const [supuestos, setSupuestos] = useState<FlujoSupuestos>(emptySupuestos());
  const [tab, setTab] = useState<Tab>('caom');
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((res) => {
        setCompanies(res.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((res) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoading(true);
    setError(null);
    Promise.all([
      surveysService.getUcaps(companyId, projectId ?? undefined),
      cregService.getParametrizacion(companyId, projectId),
      cregService.getCenso(companyId, projectId),
      cregService.getLiquidacion(companyId, projectId),
      cregService.getIddOff(companyId, projectId),
      cregService.getIddOn(companyId, projectId),
    ])
      .then(([ucapsRes, param, censo, liq, idd, iddOn]) => {
        setUcaps(ucapsRes.ucaps);
        setParams(param.data ?? {});
        setSupuestos({ ...emptySupuestos(), ...(param.data?.flujoSupuestos ?? {}) });
        setQuantities(censo.data?.quantities ?? {});
        setLiqMeses(liq.data?.meses ?? {});
        setIddMeses(idd.data?.meses ?? {});
        setIddOnMeses(iddOn.data?.meses ?? {});
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar los datos del flujo'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  const P = useMemo(() => deriveParams(params), [params]);

  const cols = useMemo(
    () => monthsBetween(params.fechaInicio ?? '', params.fechaFinal ?? ''),
    [params.fechaInicio, params.fechaFinal],
  );

  // Un resultado por mes, con ID e IPP del mes (si hay dato) o del parámetro.
  const resultados = useMemo<MesResultado[]>(() => {
    if (cols.length === 0 || ucaps.length === 0) return [];
    return cols.map((col) => {
      const off = iddMeses[col.ym];
      const on = iddOnMeses[col.ym];
      const idApagadas = (off ? indiceDisponibilidad(off.fallas ?? [], off.wt, off.t) : null) ?? P.idApagadas;
      const idEncendidas = (on ? indiceDisponibilidadOn(on.fallas ?? [], on.wt, on.t) : null)
        ?? P.idEncendidasParam ?? 1;
      const ippMes = liqMeses[col.ym]?.ippMes ?? P.ippFinal;
      return computeMes(ucaps, quantities, P, col.ym, { idApagadas, idEncendidas, ippMes });
    });
  }, [cols, ucaps, quantities, P, iddMeses, iddOnMeses, liqMeses]);

  const fcm = useMemo<FcmMes[]>(() => computeFcm(cols, resultados, supuestos), [cols, resultados, supuestos]);
  const anual = useMemo<FcmAnual[]>(() => rollupAnual(fcm), [fcm]);

  // Años del horizonte (para la tabla de Supuestos).
  const years = useMemo(() => {
    const set = new Set<number>();
    cols.forEach((c) => set.add(c.year));
    return [...set].sort((a, b) => a - b);
  }, [cols]);

  const setSupYear = (year: number, field: 'impuestoAP' | 'energia', value: number) =>
    setSupuestos((prev) => ({
      ...prev,
      years: { ...prev.years, [year]: { impuestoAP: 0, energia: 0, ...prev.years[year], [field]: value } },
    }));

  const guardarSupuestos = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      await cregService.saveParametrizacion(
        selectedCompanyId,
        { ...params, flujoSupuestos: supuestos },
        selectedProjectId,
      );
      setParams((p) => ({ ...p, flujoSupuestos: supuestos }));
      toast.success('Supuestos del flujo guardados');
    } catch {
      toast.error('No se pudieron guardar los supuestos');
    } finally {
      setSaving(false);
    }
  };

  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <LineChart className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Flujo de Caja
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Proyección mes a mes: CAOM · CINV · Energía · FCM · Flujo anual
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        {/* Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          {loadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Municipio / empresa</label>
                <Select value={selectedCompanyId ? String(selectedCompanyId) : ''}
                  onValueChange={(val) => { setSelectedCompanyId(Number(val)); setSelectedProjectId(null); }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''} onValueChange={(val) => setSelectedProjectId(Number(val))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {ready && cols.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Horizonte</label>
                  <div className="flex items-center h-10 text-sm font-medium text-[hsl(var(--canalco-neutral-900))] tabular-nums">
                    {cols[0].label} — {cols[cols.length - 1].label} ({cols.length} meses)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <LineChart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {selectedCompanyId && isCanalesContactos
                ? 'Selecciona un proyecto de Canales & Contactos'
                : 'Selecciona una empresa para ver su flujo de caja'}
            </p>
          </div>
        )}

        {ready && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
        )}

        {ready && !loading && cols.length === 0 && (
          <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-base font-medium">Define la fecha de inicio y final en Parámetros para generar el horizonte.</p>
          </div>
        )}

        {ready && !loading && cols.length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            {/* Pestañas */}
            <div className="p-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center gap-2 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    tab === t.id
                      ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                      : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {tab === 'supuestos' && (
                <Button onClick={guardarSupuestos} disabled={saving} className="ml-auto gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar supuestos
                </Button>
              )}
            </div>

            {tab === 'supuestos' && (
              <SupuestosTab years={years} supuestos={supuestos} setSupuestos={setSupuestos} setSupYear={setSupYear} />
            )}
            {(tab === 'caom' || tab === 'cinv') && (
              <MatrizFlujo cols={cols} resultados={resultados} modo={tab} />
            )}
            {tab === 'energia' && <EnergiaTab fcm={fcm} />}
            {tab === 'fcm' && <FcmTab fcm={fcm} />}
            {tab === 'anual' && <AnualTab anual={anual} />}
          </div>
        )}
      </main>
    </div>
  );
}

/** Matriz grupos × meses para CAOM (AOM del mes) o CINV (inversión del mes). */
function MatrizFlujo({ cols, resultados, modo }: {
  cols: FlujoMonthCol[]; resultados: MesResultado[]; modo: 'caom' | 'cinv';
}) {
  const valorGrupo = (r: MesResultado, gi: number): number => {
    const g = r.grupos[gi];
    const base = modo === 'caom' ? g.aomMes : g.invMes;
    return base * (r.indice ?? 1);
  };
  const total = (r: MesResultado): number => (modo === 'caom' ? r.caomMensual : r.cinvMensual);
  const grupos = resultados[0]?.grupos ?? [];
  const totalLabel = modo === 'caom' ? 'CAOM MENSUAL' : 'CINV MENSUAL';

  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[hsl(var(--canalco-neutral-100))]">
            <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[190px]">
              {modo === 'caom' ? 'Grupo de UCAP · AOM del mes' : 'Grupo de UCAP · Inversión del mes'}
            </th>
            {cols.map((c) => (
              <th key={c.ym} className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px] whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, gi) => (
            <tr key={g.grupo} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
              <td className="sticky left-0 z-10 bg-white px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{g.grupo}</td>
              {resultados.map((r) => {
                const v = valorGrupo(r, gi);
                return (
                  <td key={r.ym} className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap">
                    {v ? fmtCOP(v) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
            <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-primary))]/10 px-3 py-1.5 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{totalLabel}</td>
            {resultados.map((r) => (
              <td key={r.ym} className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                {total(r) ? fmtCOP(total(r)) : '–'}
              </td>
            ))}
          </tr>
          <tr className="bg-[hsl(var(--canalco-neutral-100))] text-[10px] text-[hsl(var(--canalco-neutral-500))]">
            <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">Índice actualización (IPP)</td>
            {resultados.map((r) => (
              <td key={r.ym} className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                {r.indice != null ? r.indice.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Supuestos del flujo ─────────────────────── */
const parseNum = (v: string) => { const n = Number(v.replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };

function SupuestosTab({ years, supuestos, setSupuestos, setSupYear }: {
  years: number[];
  supuestos: FlujoSupuestos;
  setSupuestos: React.Dispatch<React.SetStateAction<FlujoSupuestos>>;
  setSupYear: (year: number, field: 'impuestoAP' | 'energia', value: number) => void;
}) {
  const set = (patch: Partial<FlujoSupuestos>) => setSupuestos((p) => ({ ...p, ...patch }));
  return (
    <div className="p-6 space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-2">Ingresos y energía por año</h3>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-3">Valores anuales; el flujo los reparte por mes (÷12). El Impuesto de A.P. es el ingreso; la energía, el costo del consumo.</p>
        <div className="overflow-auto max-h-[45vh] border border-[hsl(var(--canalco-neutral-200))] rounded-md max-w-2xl">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[hsl(var(--canalco-neutral-100))]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))]">Año</th>
                <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))]">Impuesto de A.P. (anual $)</th>
                <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))]">Costo energía (anual $)</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <td className="px-3 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))]">{y}</td>
                  <td className="px-1 py-1 border border-[hsl(var(--canalco-neutral-200))]">
                    <Input value={supuestos.years[y]?.impuestoAP || ''} onChange={(e) => setSupYear(y, 'impuestoAP', parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
                  </td>
                  <td className="px-1 py-1 border border-[hsl(var(--canalco-neutral-200))]">
                    <Input value={supuestos.years[y]?.energia || ''} onChange={(e) => setSupYear(y, 'energia', parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-3">Otros egresos y toggles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 max-w-4xl">
          <ToggleNum label="Gestión ambiental (% del CAOM)" on={supuestos.ambientalOn} onToggle={(v) => set({ ambientalOn: v })} value={supuestos.ambientalPct} onValue={(v) => set({ ambientalPct: v })} suffix="%" />
          <ToggleNum label="SIAP ($ por mes)" on={supuestos.siapOn} onToggle={(v) => set({ siapOn: v })} value={supuestos.siapValor} onValue={(v) => set({ siapValor: v })} />
          <NumField label="Interventoría ($ por mes)" value={supuestos.interventoriaMes} onValue={(v) => set({ interventoriaMes: v })} />
          <NumField label="Gastos fiduciarios ($ por mes)" value={supuestos.fiduciariosMes} onValue={(v) => set({ fiduciariosMes: v })} />
          <NumField label="Expansión navideña (% del impuesto, dic.)" value={supuestos.expNavidenaPct} onValue={(v) => set({ expNavidenaPct: v })} suffix="%" />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-5">
            <input type="checkbox" checked={supuestos.gmf} onChange={(e) => set({ gmf: e.target.checked })} className="w-4 h-4 accent-[hsl(var(--canalco-primary))]" />
            Aplicar GMF 4×1000
          </label>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onValue, suffix }: { label: string; value: number; onValue: (v: number) => void; suffix?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <Input value={value || ''} onChange={(e) => onValue(parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
        {suffix && <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleNum({ label, on, onToggle, value, onValue, suffix }: {
  label: string; on: boolean; onToggle: (v: boolean) => void; value: number; onValue: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 cursor-pointer select-none">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--canalco-primary))]" />
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input value={value || ''} onChange={(e) => onValue(parseNum(e.target.value))} disabled={!on} className="h-8 text-right text-xs disabled:opacity-50" placeholder="0" />
        {suffix && <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{suffix}</span>}
      </div>
    </div>
  );
}

/* ── ENERGÍA / FCM / Anual ─────────────────────── */

interface FlowRow { label: string; values: number[]; kind?: 'head' | 'total' | 'grand' }

function FlowTable({ firstCol, periodLabels, rows }: { firstCol: string; periodLabels: string[]; rows: FlowRow[] }) {
  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[hsl(var(--canalco-neutral-100))]">
            <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[220px]">{firstCol}</th>
            {periodLabels.map((l, i) => (
              <th key={i} className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px] whitespace-nowrap">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            if (r.kind === 'head') {
              return (
                <tr key={ri} className="bg-[hsl(var(--canalco-primary))]/10">
                  <td colSpan={periodLabels.length + 1} className="px-3 py-1 font-semibold uppercase text-[11px] tracking-wide border border-[hsl(var(--canalco-neutral-200))]">{r.label}</td>
                </tr>
              );
            }
            const cls = r.kind === 'grand'
              ? 'bg-[hsl(var(--canalco-primary))]/10 font-bold'
              : r.kind === 'total' ? 'font-semibold bg-[hsl(var(--canalco-neutral-50))]' : '';
            return (
              <tr key={ri} className={cls || 'hover:bg-[hsl(var(--canalco-neutral-50))]'}>
                <td className={`sticky left-0 z-10 px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap ${cls ? cls : 'bg-white'}`}>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap">
                    {v ? fmtCOP(v) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EnergiaTab({ fcm }: { fcm: FcmMes[] }) {
  const labels = fcm.map((m) => `${m.mes}/${String(m.year).slice(2)}`);
  const rows: FlowRow[] = [
    { label: 'Consumo de energía ($)', values: fcm.map((m) => m.energia), kind: 'total' },
  ];
  return (
    <>
      <p className="px-4 pt-3 text-xs text-[hsl(var(--canalco-neutral-500))]">Costo del consumo por mes (del costo anual de Supuestos ÷ 12). El detalle de kWh por potencia instalada queda pendiente (requiere la potencia de las UCAPs).</p>
      <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} />
    </>
  );
}

function FcmTab({ fcm }: { fcm: FcmMes[] }) {
  const labels = fcm.map((m) => `${m.mes}/${String(m.year).slice(2)}`);
  const R = (label: string, get: (m: FcmMes) => number, kind?: FlowRow['kind']): FlowRow => ({ label, values: fcm.map(get), kind });
  const rows: FlowRow[] = [
    { label: 'Ingresos', values: [], kind: 'head' },
    R('Impuesto de A.P.', (m) => m.impuestoAP),
    R('TOTAL INGRESOS', (m) => m.totalIngresos, 'total'),
    { label: 'Egresos operacionales', values: [], kind: 'head' },
    R('Consumo de energía ($)', (m) => m.energia),
    R('Interventoría', (m) => m.interventoria),
    R('Gastos fiduciarios', (m) => m.fiduciarios),
    R('Total egresos operacionales', (m) => m.egresosOper, 'total'),
    { label: 'Pagos al concesionario', values: [], kind: 'head' },
    R('CAOM', (m) => m.caom),
    R('Inversión Modernización (CINV)', (m) => m.cinv),
    R('Gestión ambiental residuos', (m) => m.ambiental),
    R('Sistema de Gestión de Activos (SIAP)', (m) => m.siap),
    R('Expansión alumbrado navideño', (m) => m.expNavidena),
    R('Total pagos concesionario', (m) => m.totalPConcesionario, 'total'),
    { label: 'Impuestos', values: [], kind: 'head' },
    R('GMF 4×1000', (m) => m.gmf),
    R('TOTAL EGRESOS', (m) => m.totalEgresos, 'total'),
    R('SALDO OPERATIVO', (m) => m.saldoOperativo, 'grand'),
    R('SALDO ACUMULADO', (m) => m.saldoAcumulado, 'grand'),
  ];
  return <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} />;
}

function AnualTab({ anual }: { anual: FcmAnual[] }) {
  const labels = anual.map((a) => String(a.year));
  const R = (label: string, get: (a: FcmAnual) => number, kind?: FlowRow['kind']): FlowRow => ({ label, values: anual.map(get), kind });
  const rows: FlowRow[] = [
    R('TOTAL INGRESOS', (a) => a.totalIngresos, 'total'),
    { label: 'Egresos', values: [], kind: 'head' },
    R('Consumo de energía ($)', (a) => a.energia),
    R('Total egresos operacionales', (a) => a.egresosOper, 'total'),
    R('CAOM', (a) => a.caom),
    R('Inversión Modernización (CINV)', (a) => a.cinv),
    R('Gestión ambiental', (a) => a.ambiental),
    R('SIAP', (a) => a.siap),
    R('Expansión navideña', (a) => a.expNavidena),
    R('Total pagos concesionario', (a) => a.totalPConcesionario, 'total'),
    R('TOTAL EGRESOS', (a) => a.totalEgresos, 'total'),
    R('SALDO OPERATIVO', (a) => a.saldoOperativo, 'grand'),
    R('SALDO ACUMULADO', (a) => a.saldoAcumulado, 'grand'),
  ];
  return <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} />;
}
