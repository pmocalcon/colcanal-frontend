import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  cregService,
  qiTi,
  horasEncendida,
  indiceDisponibilidadOn,
  vceein,
  HORAS_OPERACION_DIA,
  type IddOnFalla,
  type IddOnMes,
} from '@/services/creg.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Save, Power, AlertCircle, Plus, Trash2, Info, Upload, Download } from 'lucide-react';
import { buildXlsxBlob, downloadBlob } from '@/utils/xlsxWriter';
import type { XlsxRow, XlsxStyle } from '@/utils/xlsxWriter';
import { agregarFirmas } from '@/utils/cregFirmasXlsx';
import { CierreMes } from '@/components/creg/CierreMes';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { parseFallas } from '@/utils/iddOffImport';
import { readXlsxToText } from '@/utils/xlsxReader';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const monthLongLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return !y || !m ? ym : `${MONTH_NAMES[m - 1]} de ${y}`;
};

const fmtNum = (n: number | null, dec = 2) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPesos = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

/**
 * Meses desde el mes actual hacia atrás (más reciente primero) hasta un piso
 * fijo, para elegir periodo sin depender del censo. El piso se fija en enero de
 * 2018 para poder capturar periodos históricos (antes la lista era una ventana
 * de 36 meses, así que no dejaba retroceder más allá de ~3 años).
 */
const PERIODO_MIN = { y: 2018, m: 1 };
const monthOptions = (): string[] => {
  const out: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1..12
  while (y > PERIODO_MIN.y || (y === PERIODO_MIN.y && m >= PERIODO_MIN.m)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m--; if (m < 1) { m = 12; y--; }
  }
  return out;
};

const diasDelMes = (ym: string): number => {
  const [y, m] = ym.split('-').map(Number);
  return !y || !m ? 0 : new Date(y, m, 0).getDate();
};

/** T por defecto: días del mes × 12 h/día. Verificado contra el Excel: `=12*30`. */
const horasDelMes = (ym: string): number => diasDelMes(ym) * HORAS_OPERACION_DIA;

const emptyMes = (ym: string): IddOnMes => ({ wt: null, t: horasDelMes(ym), teen: null, fallas: [] });

const newFalla = (): IddOnFalla => ({
  id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  codigo: '', potencia: null, potenciaXl: null,
  localizacion: '', barrio: '',
  fechaInicial: '', fechaFinal: '', horaInicial: '', horaFinal: '',
});

export default function CregIddOnPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [meses, setMeses] = useState<Record<string, IddOnMes>>({});
  const [selYm, setSelYm] = useState<string>(() => monthOptions()[0]);
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
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const ready = !!selectedCompanyId && (!isCanalesContactos || !!selectedProjectId);

  useEffect(() => {
    if (!ready || !selectedCompanyId) { setMeses({}); return; }
    setLoading(true);
    setError(null);
    cregService.getIddOn(selectedCompanyId, selectedProjectId)
      .then((res) => setMeses(res.data?.meses ?? {}))
      .catch(() => setError('Error al cargar el ID ON'))
      .finally(() => setLoading(false));
  }, [ready, selectedCompanyId, selectedProjectId]);

  // Solo para el pie de firmas del Excel: los nombres viven en Parámetros.
  const [firmas, setFirmas] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!ready || !selectedCompanyId) { setFirmas({}); return; }
    cregService.getParametrizacion(selectedCompanyId, selectedProjectId)
      .then((res) => setFirmas(res.data ?? {}))
      .catch(() => setFirmas({}));
  }, [ready, selectedCompanyId, selectedProjectId]);

  const mes: IddOnMes = meses[selYm] ?? emptyMes(selYm);
  const fallas = mes.fallas ?? [];

  // Un mes aprobado no se toca. Se corta aquí, en los dos setters, y no solo
  // deshabilitando controles: así ninguna ruta de edición se escapa.
  const setMes = useCallback((patch: Partial<IddOnMes>) => {
    setMeses((prev) => {
      const base = prev[selYm] ?? emptyMes(selYm);
      if (base.aprobado) return prev;
      return { ...prev, [selYm]: { ...base, ...patch } };
    });
  }, [selYm]);

  const setFalla = useCallback((id: string, patch: Partial<IddOnFalla>) => {
    setMeses((prev) => {
      const base = prev[selYm] ?? emptyMes(selYm);
      if (base.aprobado) return prev;
      return {
        ...prev,
        [selYm]: { ...base, fallas: (base.fallas ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)) },
      };
    });
  }, [selYm]);

  const addFalla = () => setMes({ fallas: [...fallas, newFalla()] });
  const removeFalla = (id: string) => setMes({ fallas: fallas.filter((f) => f.id !== id) });

  // ---- Importar (pegado desde Excel o archivo CSV) ----
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importModo, setImportModo] = useState<'reemplazar' | 'agregar'>('reemplazar');

  const preview = useMemo(
    () => (importText.trim() ? parseFallas(importText, { soloEstado: 'ENCENDIDA DE DIA' }) : null),
    [importText],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        setImportText(await readXlsxToText(file));
      } else if (/\.xls$/i.test(file.name)) {
        toast.error('El formato .xls antiguo no se lee: guárdalo como .xlsx o CSV.');
      } else {
        setImportText(await file.text());
      }
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'formato no válido'}`);
    }
  };

  const confirmImport = () => {
    if (!preview || preview.error || preview.fallas.length === 0) return;
    setMes({ fallas: importModo === 'reemplazar' ? preview.fallas : [...fallas, ...preview.fallas] });
    toast.success(`${preview.fallas.length} fila(s) importadas`);
    setImportOpen(false);
    setImportText('');
  };

  const totalHoras = useMemo(() => fallas.reduce((a, f) => a + horasEncendida(f), 0), [fallas]);
  const totalQiTi = useMemo(() => fallas.reduce((a, f) => a + qiTi(f), 0), [fallas]);
  const id = useMemo(() => indiceDisponibilidadOn(fallas, mes.wt, mes.t), [fallas, mes.wt, mes.t]);
  const valorConsumo = useMemo(() => vceein(fallas, mes.teen), [fallas, mes.teen]);

  /** Un mes aprobado queda cerrado: no se edita ni se guarda encima. */
  const mesAprobado = !!mes.aprobado;

  const guardar = () =>
    cregService.saveIddOn(selectedCompanyId!, { meses }, selectedProjectId);

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    try {
      setSaving(true);
      await guardar();
      toast.success('ID ON guardado');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Excel de la hoja tal como se ve: encabezado con los indicadores, la tabla de
   * fallas con su total y el pie de firmas.
   */
  const [exportando, setExportando] = useState(false);
  const handleExcel = async () => {
    setExportando(true);
    try {
      const COLS = 12;
      const rows: XlsxRow[] = [];
      const merges: string[] = [];
      const blank = (): XlsxRow => Array.from({ length: COLS }, () => ({ v: '' as string }));
      const proyecto = projects.find((p) => p.projectId === selectedProjectId)?.name;
      const municipio = [selectedCompany?.name, proyecto].filter(Boolean).join(' — ');

      const fTitulo = rows.length + 1;
      rows.push([{ v: `CÁLCULO DE ÍNDICE DE DISPONIBILIDAD ENCENDIDAS — ${monthLongLabel(selYm).toUpperCase()}`, s: 'title' }]);
      merges.push(`A${fTitulo}:L${fTitulo}`);
      const fMuni = rows.length + 1;
      rows.push([{ v: municipio, s: 'labelBold' }]);
      merges.push(`A${fMuni}:L${fMuni}`);
      rows.push(blank());

      // Indicadores, en pares etiqueta/valor. La etiqueta ocupa A:D y el valor
      // E:G — en una sola columna la etiqueta se cortaba contra el valor.
      const par = (label: string, valor: string | number, s: XlsxStyle): XlsxRow => {
        const r = blank();
        r[0] = { v: label, s: 'cardLabel' };
        r[4] = { v: valor, s };
        return r;
      };
      const fIni = rows.length + 1;
      rows.push(par('WT — potencia total instalada (kW)', mes.wt ?? '', 'value2'));
      rows.push(par('T — horas del periodo', mes.t ?? '', 'valueInt'));
      rows.push(par('TEEn — tarifa nivel 2 ($/kWh)', mes.teen ?? '', 'value1'));
      rows.push(par('Total horas indisponibilidad', totalHoras, 'value1'));
      rows.push(par('Σ (Qi × Ti)', totalQiTi, 'value2'));
      rows.push(par('ID — índice de disponibilidad', id ?? '', 'value8'));
      rows.push(par('VCEEIn — valor del consumo', valorConsumo ?? '', 'value'));
      for (let f = fIni; f < fIni + 7; f++) merges.push(`A${f}:D${f}`, `E${f}:G${f}`);
      rows.push(blank());

      const header = ['Ítem', 'Código', 'Potencia lum [W]', 'Potencia+XL', 'Localización', 'Barrio',
        'Fecha inicial', 'Fecha final', 'Hora inicial', 'Hora final', 'Horas (Ti)', 'Qi × Ti'];
      rows.push(header.map((h) => ({ v: h, s: 'header' as const })));

      fallas.forEach((f, i) => {
        rows.push([
          { v: i + 1, s: 'qty' },
          { v: f.codigo ?? '', s: 'text' },
          { v: f.potencia ?? '', s: 'qty' },
          { v: f.potenciaXl ?? '', s: 'qty' },
          { v: f.localizacion ?? '', s: 'text' },
          { v: f.barrio ?? '', s: 'text' },
          { v: f.fechaInicial ?? '', s: 'text' },
          { v: f.fechaFinal ?? '', s: 'text' },
          { v: f.horaInicial ?? '', s: 'text' },
          { v: f.horaFinal ?? '', s: 'text' },
          { v: Number(horasEncendida(f).toFixed(1)), s: 'num1' },
          { v: Number(qiTi(f).toFixed(4)), s: 'num2' },
        ]);
      });

      rows.push([
        { v: 'TOTAL HORAS INDISPONIBILIDAD LUMINARIA', s: 'totalText' },
        ...Array.from({ length: 9 }, () => ({ v: '', s: 'totalText' as const })),
        { v: Number(totalHoras.toFixed(1)), s: 'totalNum1' },
        { v: Number(totalQiTi.toFixed(4)), s: 'totalNum2' },
      ]);
      const fTot = rows.length;
      merges.push(`A${fTot}:J${fTot}`);

      agregarFirmas(rows, merges, {
        columnas: COLS,
        interventoria: firmas.firmaInterventoria,
        representanteLegal: firmas.firmaRepresentanteLegal,
        empresa: selectedCompany?.name,
      });

      const fileMuni = (selectedCompany?.name || 'idd-on')
        .replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
      const blob = await buildXlsxBlob(
        `ID ON ${selYm}`, rows,
        [7, 16, 15, 12, 26, 18, 13, 13, 11, 11, 11, 12],
        merges, [], undefined,
      );
      downloadBlob(blob, `ID_ON_${fileMuni}_${selYm}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-[95rem] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Power className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> ID ON
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Índice de disponibilidad de las encendidas — prendidas cuando deben estar apagadas
            </p>
          </div>
          {ready && (
            <div className="flex items-center gap-2">
              <CierreMes
                hoja="idd-on"
                companyId={selectedCompanyId}
                projectId={selectedProjectId}
                ym={selYm}
                mesLabel={monthLongLabel(selYm)}
                municipio={[selectedCompany?.name, projects.find((p) => p.projectId === selectedProjectId)?.name].filter(Boolean).join(' — ')}
                mes={mes}
                resumen={id != null ? `ID ${fmtNum(id, 8)}` : undefined}
                queSeBloquea="la potencia instalada (WT), las horas del periodo (T), la tarifa (TEEn) y las encendidas"
                onGuardar={async () => { await guardar(); }}
                onActualizado={(m) => setMeses(m)}
                disabled={saving}
              />
              <Button variant="outline" onClick={handleExcel} disabled={exportando} className="border-green-600 text-green-700 hover:bg-green-50">
                {exportando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Excel
              </Button>
              <Button onClick={handleSave} disabled={saving || mesAprobado}
                title={mesAprobado ? 'El mes está aprobado: no admite cambios.' : undefined}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[95rem] mx-auto px-6 py-8 space-y-6">
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
                  onValueChange={(v) => { setSelectedCompanyId(Number(v)); setSelectedProjectId(null); }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''} onValueChange={(v) => setSelectedProjectId(Number(v))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {ready && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Periodo</label>
                  <Select value={selYm} onValueChange={setSelYm}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions().map((ym) => (<SelectItem key={ym} value={ym}>{monthLongLabel(ym)}</SelectItem>))}
                    </SelectContent>
                  </Select>
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

        {ready && loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        )}

        {ready && !loading && (
          <>
            {/* Fórmulas verificadas contra el Excel de jun-2026. */}
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-sky-900">
                <strong>Horas (Ti)</strong> = (fecha final − inicial) × 12 + (hora final − inicial);
                un día completo pesa 12 h. <strong>Qi × Ti</strong> = Pot+XL/1000 × Ti.
                <strong> VCEEIn</strong> = Σ(Qi × Ti) × TEEn. Las tres se calculan solas.
              </p>
            </div>

            {/* Resultado del periodo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  WT — potencia total instalada (kW)
                </label>
                <Input type="number" step="0.001" placeholder="186,011" value={mes.wt ?? ''}
                  onChange={(e) => setMes({ wt: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  disabled={mesAprobado} className="h-9 disabled:bg-[hsl(var(--canalco-neutral-100))]" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  T — horas del periodo
                </label>
                <Input type="number" value={mes.t ?? ''}
                  onChange={(e) => setMes({ t: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  disabled={mesAprobado} className="h-9 disabled:bg-[hsl(var(--canalco-neutral-100))]" />
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                  Sugerido: {horasDelMes(selYm)} h ({diasDelMes(selYm)} días × 12 h)
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  TEEn — tarifa nivel 2 ($/kWh)
                </label>
                <Input type="number" step="0.1" placeholder="955,1" value={mes.teen ?? ''}
                  onChange={(e) => setMes({ teen: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  disabled={mesAprobado} className="h-9 disabled:bg-[hsl(var(--canalco-neutral-100))]" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Total horas indisponibilidad</p>
                <p className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mt-1 tabular-nums">{fmtNum(totalHoras, 1)}</p>
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">Σ Qi × Ti = {fmtNum(totalQiTi)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg shadow-sm border-2 border-emerald-300 p-4">
                <p className="text-xs font-semibold text-emerald-800">ID — índice de disponibilidad</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{fmtNum(id, 8)}</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  {id == null ? 'Falta WT o T' : '1 − Σ(Qi×Ti) / (WT×T)'}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">VCEEIn — valor del consumo</p>
                <p className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mt-1 tabular-nums">{fmtPesos(valorConsumo)}</p>
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                  {valorConsumo == null ? 'Falta TEEn' : 'Σ(Qi×Ti) × TEEn'}
                </p>
              </div>
            </div>

            {/* Tabla de encendidas */}
            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="bg-[hsl(var(--canalco-primary))]/10 px-4 py-2.5 border-b border-[hsl(var(--canalco-neutral-300))] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[hsl(var(--canalco-neutral-900))] uppercase tracking-wide">
                  Cálculo de ID. encendidas de la infraestructura — {monthLongLabel(selYm)}
                </h2>
                <div className="flex items-center gap-2">
                  {mesAprobado ? (
                    <span className="text-[11px] font-semibold text-emerald-700">Mes aprobado · solo lectura</span>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-xs">
                        <Upload className="w-3.5 h-3.5 mr-1" /> Importar
                      </Button>
                      <Button size="sm" variant="outline" onClick={addFalla} className="h-7 text-xs">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {fallas.length === 0 ? (
                <div className="py-14 text-center text-[hsl(var(--canalco-neutral-600))]">
                  <p className="text-sm">Sin encendidas registradas en este periodo.</p>
                  <p className="text-xs mt-1">Con cero filas el ID es 1 (disponibilidad total) y VCEEIn es 0.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                        <Th className="w-10">Ítem</Th>
                        <Th>Código</Th>
                        <Th>Potencia lum [W]</Th>
                        <Th>Potencia+XL</Th>
                        <Th className="text-left">Localización</Th>
                        <Th className="text-left">Barrio</Th>
                        <Th>Fecha inicial</Th>
                        <Th>Fecha final</Th>
                        <Th>Hora inicial</Th>
                        <Th>Hora final</Th>
                        <Th title="(fecha final − inicial) × 12 + (hora final − inicial)">Horas (Ti)</Th>
                        <Th className="bg-[hsl(var(--canalco-primary))]/20" title="Potencia+XL / 1000 × Ti">Qi × Ti</Th>
                        <Th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {fallas.map((f, i) => (
                        <tr key={f.id} className={i % 2 ? 'bg-[hsl(var(--canalco-neutral-50))]' : 'bg-white'}>
                          <Td className="text-center text-[hsl(var(--canalco-neutral-500))]">{i + 1}</Td>
                          <Td><Cell value={f.codigo ?? ''} onChange={(v) => setFalla(f.id, { codigo: v })} /></Td>
                          <Td><CellNum value={f.potencia} onChange={(v) => setFalla(f.id, { potencia: v })} /></Td>
                          <Td><CellNum value={f.potenciaXl} onChange={(v) => setFalla(f.id, { potenciaXl: v })} /></Td>
                          <Td><Cell value={f.localizacion ?? ''} onChange={(v) => setFalla(f.id, { localizacion: v })} className="text-left" /></Td>
                          <Td><Cell value={f.barrio ?? ''} onChange={(v) => setFalla(f.id, { barrio: v })} className="text-left" /></Td>
                          <Td><CellDate value={f.fechaInicial ?? ''} onChange={(v) => setFalla(f.id, { fechaInicial: v })} /></Td>
                          <Td><CellDate value={f.fechaFinal ?? ''} onChange={(v) => setFalla(f.id, { fechaFinal: v })} /></Td>
                          <Td><CellTime value={f.horaInicial ?? ''} onChange={(v) => setFalla(f.id, { horaInicial: v })} /></Td>
                          <Td><CellTime value={f.horaFinal ?? ''} onChange={(v) => setFalla(f.id, { horaFinal: v })} /></Td>
                          {/* Calculadas: no se escriben. */}
                          <Td className="text-center tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtNum(horasEncendida(f), 1)}</Td>
                          <Td className="text-right tabular-nums font-semibold bg-[hsl(var(--canalco-primary))]/5">{fmtNum(qiTi(f))}</Td>
                          <Td className="text-center">
                            <button onClick={() => removeFalla(f.id)} className="text-[hsl(var(--canalco-neutral-400))] hover:text-red-600 transition-colors" title="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[hsl(var(--canalco-neutral-200))] font-semibold border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                        <Td colSpan={10} className="text-right pr-3">TOTAL HORAS INDISPONIBILIDAD LUMINARIA</Td>
                        <Td className="text-right tabular-nums">{fmtNum(totalHoras, 1)}</Td>
                        <Td className="text-right tabular-nums bg-[hsl(var(--canalco-primary))]/20">{fmtNum(totalQiTi)}</Td>
                        <Td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-lg font-medium">
              {isCanalesContactos ? 'Selecciona un proyecto de Canales & Contactos' : 'Selecciona una empresa para empezar'}
            </p>
          </div>
        )}
      </main>

      {/* Importar: pegado desde Excel (TSV) o CSV. Nunca se importa a ciegas:
          primero se muestra qué se entendió. */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportText(''); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar encendidas — {monthLongLabel(selYm)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Carga el <strong>.xlsx</strong> (p. ej. la Operación General), o copia las filas desde Excel
              <strong> con la fila de títulos</strong> y pégalas. Reconoce las columnas <code>S_*</code> del
              export de mantenimiento; las horas (Ti) y Qi × Ti se calculan.
            </p>

            <input
              type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="block w-full text-xs text-[hsl(var(--canalco-neutral-600))] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-[hsl(var(--canalco-neutral-300))] file:bg-white file:text-xs file:cursor-pointer hover:file:bg-[hsl(var(--canalco-neutral-100))]"
            />

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'CÓDIGO\tPOTENCIA\tPOTENCIA+XL\tLOCALIZACION\tBARRIO\tFECHA INICIAL\tFECHA FINAL\tHORA INICIAL\tHORA FINAL\n3146024\t35\t35\tLUIS CARLOS GALAN\tLUIS CARLOS GALAN\t7/06/2025\t7/06/2025\t08:00\t14:30'}
              className="w-full h-40 text-xs font-mono border border-[hsl(var(--canalco-neutral-300))] rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
            />

            {preview?.error && (
              <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-800">{preview.error}</div>
            )}

            {preview && !preview.error && (
              <div className="space-y-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs text-emerald-900">
                  <strong>{preview.fallas.length} fila(s)</strong> · columnas reconocidas: {preview.columnas.join(', ')}
                </div>
                {preview.avisos.map((a) => (
                  <div key={a} className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-900">{a}</div>
                ))}
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={importModo === 'reemplazar'} onChange={() => setImportModo('reemplazar')} />
                    Reemplazar las {fallas.length} existentes
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={importModo === 'agregar'} onChange={() => setImportModo('agregar')} />
                    Agregar a las existentes
                  </label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportText(''); }}>Cancelar</Button>
            <Button
              onClick={confirmImport}
              disabled={!preview || !!preview.error || preview.fallas.length === 0}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
            >
              Importar {preview && !preview.error ? `${preview.fallas.length} fila(s)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, className = '', title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return <th title={title} className={`px-2 py-2 font-semibold text-center border-b border-[hsl(var(--canalco-neutral-300))] ${className}`}>{children}</th>;
}
function Td({ children, className = '', colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-2 py-1 border-b border-[hsl(var(--canalco-neutral-100))] ${className}`}>{children}</td>;
}

function Cell({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full min-w-[80px] bg-transparent px-1 py-0.5 text-center rounded focus:outline-none focus:ring-1 focus:ring-[hsl(var(--canalco-primary))] ${className}`}
    />
  );
}
function CellNum({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      className="w-full min-w-[64px] bg-transparent px-1 py-0.5 text-center tabular-nums rounded focus:outline-none focus:ring-1 focus:ring-[hsl(var(--canalco-primary))]"
    />
  );
}
function CellDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[120px] bg-transparent px-1 py-0.5 text-center rounded focus:outline-none focus:ring-1 focus:ring-[hsl(var(--canalco-primary))]"
    />
  );
}
function CellTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      step="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[110px] bg-transparent px-1 py-0.5 text-center tabular-nums rounded focus:outline-none focus:ring-1 focus:ring-[hsl(var(--canalco-primary))]"
    />
  );
}
