import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService, UCAP_GRUPOS } from '@/services/creg.service';
import type { CregItemSection } from '@/services/creg.service';
import { materialsService } from '@/services/materials.service';
import type { Material } from '@/services/materials.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Plus, Trash2, Loader2, Save, Search, X, Package,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

let keyCounter = 0;
const nextKey = () => `row-${++keyCounter}`;

interface FormItem {
  key: string;
  itemId?: number;
  section: CregItemSection;
  materialId: number | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

const fmtCOP = (n: number) =>
  '$' + (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const SECTIONS: { key: CregItemSection; title: string; subtitle: string; catalog: boolean }[] = [
  { key: 'material', title: '1. Costo del suministro en sitio', subtitle: 'Materiales del elemento', catalog: true },
  { key: 'transporte', title: 'Transporte herramienta y equipo en sitio de trabajo', subtitle: 'Parte del suministro en sitio (unidad GL)', catalog: false },
  { key: 'obra_civil', title: '2. Costo de la obra civil', subtitle: 'Obra civil', catalog: false },
  { key: 'montaje', title: '3. Costo del montaje (mano de obra)', subtitle: 'Liniero, ingeniero coordinador, etc.', catalog: false },
];

const defaultUnitFor = (section: CregItemSection) =>
  section === 'montaje' ? 'HORA' : section === 'transporte' ? 'GL' : 'UND';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CregUnitFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id && id !== 'nueva';

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [hasCostSheet, setHasCostSheet] = useState(false);
  const [items, setItems] = useState<FormItem[]>([]);
  const [pct, setPct] = useState({
    transport: 0, engineering: 15, administration: 2, inspection: 7, interventoria: 7,
    retieRetilap: 0, financial: 11.3, environmental: 0,
  });
  const [ippBase, setIppBase] = useState<number | null>(null);
  const [ippCurrent, setIppCurrent] = useState<number | null>(null);
  // IPP inicial propio de la UCAP (columna "IPP inicial" de la lista).
  const [initialIpp, setInitialIpp] = useState<number | null>(null);
  // Valor manual: solo aplica mientras la hoja no tenga líneas.
  const [manualValue, setManualValue] = useState(0);
  const [ucapMonth, setUcapMonth] = useState<number | null>(null);
  const [ucapYear, setUcapYear] = useState<number | null>(null);
  const [powerNominal, setPowerNominal] = useState<number | null>(null);
  const [powerLosses, setPowerLosses] = useState<number | null>(null);
  const [efficiencyLmW, setEfficiencyLmW] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Catálogo de materiales
  const [showCatalog, setShowCatalog] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // ---- Carga inicial ----
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const companies: Company[] = await masterDataService.getCompanies();
        if (isEdit) {
          const unit = await cregService.getUnit(Number(id));
          const cfg = await cregService.getConfig(unit.companyId, unit.projectId);
          setCompanyId(unit.companyId);
          setProjectId(unit.projectId);
          setCompanyName(companies.find((c) => c.companyId === unit.companyId)?.name ?? '');
          setName(unit.name);
          setCode(unit.code ?? '');
          setGrupo(unit.grupo ?? null);
          setHasCostSheet(unit.hasCostSheet);
          setManualValue(unit.value);
          setInitialIpp(unit.initialIpp ?? cfg.companyIppBase);
          setPct({
            transport: unit.pct.transport ?? cfg.pctTransport,
            engineering: unit.pct.engineering ?? cfg.pctEngineering,
            administration: unit.pct.administration ?? cfg.pctAdministration,
            inspection: unit.pct.inspection ?? cfg.pctInspection,
            interventoria: unit.pct.interventoria ?? cfg.pctInterventoria,
            retieRetilap: unit.pct.retieRetilap ?? cfg.pctRetieRetilap,
            financial: unit.pct.financial ?? cfg.pctFinancial,
            environmental: unit.pct.environmental ?? cfg.pctEnvironmental,
          });
          setIppBase(unit.ippBase ?? cfg.companyIppBase);
          setIppCurrent(unit.ippCurrent ?? cfg.ippCurrent);
          setUcapMonth(unit.ucapMonth);
          setUcapYear(unit.ucapYear);
          setPowerNominal(unit.powerNominal);
          setPowerLosses(unit.powerLosses);
          setEfficiencyLmW(unit.efficiencyLmW);
          setItems(unit.items.map((it) => ({
            key: nextKey(), itemId: it.itemId, section: it.section, materialId: it.materialId ?? null,
            name: it.name, unit: it.unit, quantity: it.quantity, unitPrice: it.unitPrice,
          })));
        } else {
          const cid = Number(searchParams.get('company'));
          if (!cid) { toast.error('Falta el municipio'); navigate('/dashboard/creg/unidades'); return; }
          const pidRaw = searchParams.get('project');
          const pid = pidRaw ? Number(pidRaw) : null;
          const cfg = await cregService.getConfig(cid, pid);
          setCompanyId(cid);
          setProjectId(pid);
          setCompanyName(companies.find((c) => c.companyId === cid)?.name ?? '');
          // Los % arrancan con los de la hoja de Parámetros del municipio.
          setPct({
            transport: cfg.pctTransport,
            engineering: cfg.pctEngineering,
            administration: cfg.pctAdministration,
            inspection: cfg.pctInspection,
            interventoria: cfg.pctInterventoria,
            retieRetilap: cfg.pctRetieRetilap,
            financial: cfg.pctFinancial,
            environmental: cfg.pctEnvironmental,
          });
          setIppBase(cfg.companyIppBase);
          setIppCurrent(cfg.ippCurrent);
          setInitialIpp(cfg.companyIppBase);
        }
      } catch {
        toast.error('Error al cargar la unidad');
        navigate('/dashboard/creg/unidades');
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Volver a la lista conservando el municipio/proyecto seleccionado.
  const listUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (companyId) p.set('company', String(companyId));
    if (projectId) p.set('project', String(projectId));
    const qs = p.toString();
    return `/dashboard/creg/unidades${qs ? `?${qs}` : ''}`;
  }, [companyId, projectId]);

  // ---- Manejo de filas ----
  const addRow = (section: CregItemSection, patch?: Partial<FormItem>) =>
    setItems((prev) => [...prev, {
      key: nextKey(), section, materialId: null, name: '', unit: defaultUnitFor(section),
      quantity: 1, unitPrice: 0, ...patch,
    }]);

  const updateRow = (key: string, patch: Partial<FormItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const removeRow = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  // ---- Catálogo de materiales ----
  const openCatalog = () => {
    setShowCatalog(true);
    if (materials.length === 0) {
      setLoadingMaterials(true);
      materialsService.getMaterials('active')
        .then((data) => setMaterials(data))
        .catch(() => toast.error('Error al cargar materiales'))
        .finally(() => setLoadingMaterials(false));
    }
  };

  const addMaterialFromCatalog = async (m: Material) => {
    let price = 0;
    try {
      const prices = await materialsService.getLastPrices([m.materialId]);
      price = prices.find((p) => p.materialId === m.materialId)?.lastPrice ?? 0;
    } catch { /* precio queda en 0 */ }
    addRow('material', { materialId: m.materialId, name: m.description, unit: 'UND', unitPrice: price });
    setShowCatalog(false);
    setMaterialSearch('');
  };

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 50);
    return materials.filter((m) =>
      m.description.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)).slice(0, 50);
  }, [materials, materialSearch]);

  // ---- Cálculos (espejo del backend) ----
  const totals = useMemo(() => {
    // Espejo del backend (computeTotals): como en el Excel, nada se redondea en
    // el camino. Las líneas conservan su producto exacto y el redondeo se aplica
    // una sola vez, al final, con round (no floor).
    const sum = (s: CregItemSection) =>
      items.filter((it) => it.section === s).reduce((a, it) => a + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const subtotalMaterials = sum('material');
    const subtotalTransporte = sum('transporte');
    const subtotalObraCivil = sum('obra_civil');
    const subtotalMontaje = sum('montaje');
    const subtotalDirectos = subtotalMaterials + subtotalTransporte + subtotalObraCivil + subtotalMontaje;
    const indirect = {
      transport: subtotalDirectos * (pct.transport / 100),
      engineering: subtotalDirectos * (pct.engineering / 100),
      administration: subtotalDirectos * (pct.administration / 100),
      inspection: subtotalDirectos * (pct.inspection / 100),
      interventoria: subtotalDirectos * (pct.interventoria / 100),
      retieRetilap: subtotalDirectos * (pct.retieRetilap / 100),
      financial: subtotalDirectos * (pct.financial / 100),
      environmental: subtotalDirectos * (pct.environmental / 100),
    };
    const totalIndirectos = indirect.transport + indirect.engineering + indirect.administration + indirect.inspection
      + indirect.interventoria + indirect.retieRetilap + indirect.financial + indirect.environmental;
    const totalUnit = Math.round(subtotalDirectos + totalIndirectos);
    const ippFactor = ippBase && ippCurrent && ippBase !== 0 ? ippCurrent / ippBase : 1;
    const finalValue = Math.round(totalUnit * ippFactor);
    return { subtotalMaterials, subtotalObraCivil, subtotalMontaje, subtotalDirectos, indirect, totalIndirectos, totalUnit, ippFactor, finalValue };
  }, [items, pct, ippBase, ippCurrent]);

  // ---- Guardar: la UCAP y su hoja de costos, en una sola operación ----
  const handleSave = async () => {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode) { toast.error('El código es obligatorio'); return; }
    if (!trimmedName) { toast.error('La descripción es obligatoria'); return; }

    const payload = {
      code: trimmedCode,
      description: trimmedName,
      grupo,
      initialIpp,
      // El valor solo se escribe a mano mientras no haya líneas de costos.
      roundedValue: items.length === 0 ? manualValue : undefined,
      pctEngineering: pct.engineering, pctAdministration: pct.administration, pctInspection: pct.inspection,
      pctInterventoria: pct.interventoria, pctFinancial: pct.financial,
      pctTransport: pct.transport, pctRetieRetilap: pct.retieRetilap, pctEnvironmental: pct.environmental,
      ippCurrent, ucapMonth, ucapYear, powerNominal, powerLosses, efficiencyLmW,
      items: items.map((it, idx) => ({
        section: it.section, materialId: it.materialId, name: it.name.trim() || '(sin nombre)',
        unit: it.unit || 'UND', quantity: it.quantity || 0, unitPrice: it.unitPrice || 0, sortOrder: idx,
      })),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await cregService.saveSheet(Number(id), payload);
        toast.success('UCAP actualizada');
      } else {
        await cregService.createUnit({
          ...payload,
          companyId: companyId!,
          projectId,
          code: trimmedCode,
          description: trimmedName,
        });
        toast.success('UCAP creada');
      }
      navigate(listUrl);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const setPctField = useCallback((k: keyof typeof pct, v: number) => setPct((p) => ({ ...p, [k]: v })), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  // ===== UCAP + su hoja de costos (crear y editar en el mismo formulario) =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white pb-32">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(listUrl)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
              {!isEdit ? 'Nueva UCAP' : hasCostSheet ? `Editar UCAP — ${code}` : `UCAP ${code} · hoja de costos`}
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{companyName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Datos de la UCAP */}
        <section className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">Unidad constructiva</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                Código <span className="text-red-500">*</span>
              </label>
              <Input autoFocus={!isEdit} placeholder="Ej: UCAP 110" value={code}
                onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                Descripción <span className="text-red-500">*</span>
              </label>
              <Input placeholder="Ej: LUMINARIA LED 80 W" value={name}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">IPP inicial</label>
              <Input type="number" step="0.01" min="0" placeholder="—" value={initialIpp ?? ''}
                onChange={(e) => setInitialIpp(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Grupo</label>
              <Select
                value={grupo ?? '__none__'}
                onValueChange={(v) => setGrupo(v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="— Sin grupo —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin grupo —</SelectItem>
                  {UCAP_GRUPOS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Valor</label>
              {items.length > 0 ? (
                <>
                  <Input disabled className="bg-[hsl(var(--canalco-neutral-100))] font-medium"
                    value={fmtCOP(totals.totalUnit)} />
                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Total c/indirectos de la hoja de costos.
                  </p>
                </>
              ) : (
                <>
                  <Input type="number" min="0" step="0.01" placeholder="0" value={manualValue || ''}
                    onChange={(e) => setManualValue(parseFloat(e.target.value) || 0)} />
                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Se calcula solo al agregar líneas de costos.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Mes/año de creación + potencias */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Mes de creación</label>
              <Select value={ucapMonth ? String(ucapMonth) : ''} onValueChange={(v) => setUcapMonth(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Año de creación</label>
              <Input type="number" placeholder="2026" value={ucapYear ?? ''}
                onChange={(e) => setUcapYear(e.target.value === '' ? null : parseInt(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Potencia nominal (W)</label>
              <Input type="number" min="0" placeholder="70" value={powerNominal ?? ''}
                onChange={(e) => setPowerNominal(e.target.value === '' ? null : parseInt(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Potencia pérdidas (W)</label>
              <Input type="number" min="0" placeholder="11" value={powerLosses ?? ''}
                onChange={(e) => setPowerLosses(e.target.value === '' ? null : parseInt(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Potencia con pérdidas (W)</label>
              <Input type="number" disabled className="bg-[hsl(var(--canalco-neutral-100))]"
                value={powerNominal != null || powerLosses != null ? (powerNominal ?? 0) + (powerLosses ?? 0) : ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">Eficiencia (Lm/W)</label>
              <Input type="number" min="0" placeholder="160" value={efficiencyLmW ?? ''}
                onChange={(e) => setEfficiencyLmW(e.target.value === '' ? null : parseInt(e.target.value))} />
              <p className="mt-1 text-xs text-[hsl(var(--canalco-neutral-500))]">
                La liquidación la usa para la anualidad de inversión: 130 sodio, 160 LED.
              </p>
            </div>
          </div>
        </section>

        {/* Secciones de líneas */}
        {SECTIONS.map((sec) => {
          const rows = items.filter((it) => it.section === sec.key);
          const subtotal = rows.reduce((a, it) => a + Math.round((it.quantity || 0) * (it.unitPrice || 0)), 0);
          return (
            <section key={sec.key} className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">{sec.title}</h2>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{sec.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sec.catalog && (
                    <Button size="sm" variant="outline" onClick={openCatalog} className="gap-1">
                      <Package className="w-4 h-4" /> Del catálogo
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => addRow(sec.key)} className="gap-1">
                    <Plus className="w-4 h-4" /> Fila
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-xs text-[hsl(var(--canalco-neutral-600))]">
                      <th className="px-3 py-2 font-semibold">Descripción</th>
                      <th className="px-3 py-2 font-semibold w-24">Unidad</th>
                      <th className="px-3 py-2 font-semibold w-28 text-right">Cantidad</th>
                      <th className="px-3 py-2 font-semibold w-36 text-right">Precio unitario</th>
                      <th className="px-3 py-2 font-semibold w-36 text-right">Precio total</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-[hsl(var(--canalco-neutral-500))]">
                        {sec.catalog ? 'Sin materiales. Agrega desde el catálogo o crea una fila.' : 'Sin líneas. Agrega una fila.'}
                      </td></tr>
                    ) : rows.map((it) => (
                      <tr key={it.key} className="border-t border-[hsl(var(--canalco-neutral-100))]">
                        <td className="px-3 py-1.5">
                          {/* Las filas del catálogo tienen descripción fija; las libres son editables. */}
                          {it.materialId != null ? (
                            <span className="block px-1 text-sm text-[hsl(var(--canalco-neutral-900))]">{it.name}</span>
                          ) : (
                            <Input className="h-8" value={it.name} placeholder="Descripción"
                              onChange={(e) => updateRow(it.key, { name: e.target.value })} />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input className="h-8" value={it.unit}
                            onChange={(e) => updateRow(it.key, { unit: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input className="h-8 text-right" type="number" step="0.001" min="0" value={it.quantity || ''}
                            onChange={(e) => updateRow(it.key, { quantity: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input className="h-8 text-right" type="number" step="0.01" min="0" value={it.unitPrice || ''}
                            onChange={(e) => updateRow(it.key, { unitPrice: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                          {fmtCOP((it.quantity || 0) * (it.unitPrice || 0))}
                        </td>
                        <td className="px-3 py-1.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-[hsl(var(--canalco-neutral-500))] hover:text-red-600"
                            onClick={() => removeRow(it.key)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))]">
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Subtotal</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtCOP(subtotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })}

        {/* Costos indirectos + IPP */}
        <section className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">Costos indirectos</h2>
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mb-4">
            Se aplican sobre el subtotal de costos directos ({fmtCOP(totals.subtotalDirectos)}). Prellenados desde la
            hoja de <strong>Parámetros</strong> del municipio; edítalos si esta unidad varía.
          </p>
          <div className="divide-y divide-[hsl(var(--canalco-neutral-200))] border-y border-[hsl(var(--canalco-neutral-200))]">
            <PctInput label="Costo transporte" value={pct.transport} onChange={(v) => setPctField('transport', v)} amount={totals.indirect.transport} />
            <PctInput label="Costo ingeniería" value={pct.engineering} onChange={(v) => setPctField('engineering', v)} amount={totals.indirect.engineering} />
            <PctInput label="Costo administración" value={pct.administration} onChange={(v) => setPctField('administration', v)} amount={totals.indirect.administration} />
            <PctInput label="Costo inspectores de obra" value={pct.inspection} onChange={(v) => setPctField('inspection', v)} amount={totals.indirect.inspection} />
            <PctInput label="Costo interventoría" value={pct.interventoria} onChange={(v) => setPctField('interventoria', v)} amount={totals.indirect.interventoria} />
            <PctInput label="Costos RETIE y RETILAP" value={pct.retieRetilap} onChange={(v) => setPctField('retieRetilap', v)} amount={totals.indirect.retieRetilap} />
            <PctInput label="Costos financieros" value={pct.financial} onChange={(v) => setPctField('financial', v)} amount={totals.indirect.financial} />
            <PctInput label="Costos ambientales de disposición" value={pct.environmental} onChange={(v) => setPctField('environmental', v)} amount={totals.indirect.environmental} />
          </div>
          <div className="flex items-center justify-between pt-3 text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
            <span>Total costos indirectos</span>
            <span className="tabular-nums">{fmtCOP(totals.totalIndirectos)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-[hsl(var(--canalco-neutral-200))] max-w-md">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">IPP base (del municipio)</label>
              <Input type="number" value={ippBase ?? ''} disabled placeholder="—"
                className="bg-[hsl(var(--canalco-neutral-100))]" />
              {/* No confundir con el "IPP inicial" de la UCAP, que se edita arriba. */}
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">IPP actual</label>
              <Input type="number" step="0.01" placeholder="183.09" value={ippCurrent ?? ''}
                onChange={(e) => setIppCurrent(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-2">
            Factor IPP = IPP actual / IPP base = <strong>{totals.ippFactor.toLocaleString('es-CO', { maximumFractionDigits: 5 })}</strong>
          </p>
        </section>
      </main>

      {/* Barra fija de totales + guardar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[hsl(var(--canalco-neutral-300))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2 justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-[hsl(var(--canalco-neutral-600))]">Directos: <strong className="text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(totals.subtotalDirectos)}</strong></span>
            <span className="text-[hsl(var(--canalco-neutral-600))]">Total c/indirectos → UCAP: <strong className="text-[hsl(var(--canalco-primary))] text-base">{fmtCOP(totals.totalUnit)}</strong></span>
            <span className="text-[hsl(var(--canalco-neutral-600))]">Precio actualizado (IPP): <strong className="text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(totals.finalValue)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(listUrl)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Guardar cambios' : 'Crear UCAP'}
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog catálogo de materiales */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar material del catálogo</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <Input autoFocus placeholder="Buscar por descripción o código..." value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)} className="pl-8" />
            {materialSearch && (
              <button onClick={() => setMaterialSearch('')} className="absolute right-2.5 top-2.5">
                <X className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto border border-[hsl(var(--canalco-neutral-200))] rounded-md divide-y divide-[hsl(var(--canalco-neutral-100))]">
            {loadingMaterials ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
            ) : filteredMaterials.length === 0 ? (
              <div className="py-10 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">Sin resultados.</div>
            ) : filteredMaterials.map((m) => (
              <button key={m.materialId} onClick={() => addMaterialFromCatalog(m)}
                className="w-full text-left px-3 py-2 hover:bg-[hsl(var(--canalco-neutral-100))] flex items-center justify-between gap-3">
                <span className="text-sm text-[hsl(var(--canalco-neutral-900))]">{m.description}</span>
                <span className="text-xs font-mono text-[hsl(var(--canalco-neutral-500))] flex-shrink-0">{m.code}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PctInput({ label, value, onChange, amount }: { label: string; value: number; onChange: (v: number) => void; amount: number }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <label className="flex-1 text-sm text-[hsl(var(--canalco-neutral-700))]">{label}</label>
      <div className="relative w-28 flex-shrink-0">
        <Input type="number" step="0.001" min="0" value={value} className="h-8 pr-6 text-sm text-right"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
        <span className="absolute right-2 top-2 text-xs text-[hsl(var(--canalco-neutral-500))]">%</span>
      </div>
      <span className="w-32 flex-shrink-0 text-right text-sm text-[hsl(var(--canalco-neutral-600))] tabular-nums">{fmtCOP(amount)}</span>
    </div>
  );
}
