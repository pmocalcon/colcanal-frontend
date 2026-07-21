import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  cregService,
  wiHssi,
  horasFuera,
  indiceDisponibilidad,
  HORAS_OPERACION_DIA,
  type IddOffFalla,
  type IddOffMes,
} from '@/services/creg.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Save, PowerOff, AlertCircle, Plus, Trash2, Info, Upload } from 'lucide-react';
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

/** Meses del año en curso hacia atrás, para elegir periodo sin depender del censo. */
const monthOptions = (): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const diasDelMes = (ym: string): number => {
  const [y, m] = ym.split('-').map(Number);
  return !y || !m ? 0 : new Date(y, m, 0).getDate();
};

/** T por defecto: días del mes × las mismas 12 h/día que usan las horas de falla. */
const horasDelMes = (ym: string): number => diasDelMes(ym) * HORAS_OPERACION_DIA;

const emptyMes = (ym: string): IddOffMes => ({ wt: null, t: horasDelMes(ym), fallas: [] });

const newFalla = (): IddOffFalla => ({
  id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  codigo: '', potencia: null, potenciaXl: null, tecnologia: '',
  localizacion: '', barrio: '', fechaInicial: '', fechaFinal: '',
});

export default function CregIddOffPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [meses, setMeses] = useState<Record<string, IddOffMes>>({});
  // +12 h de la noche del día del reporte: regla por proyecto (Puerto Asís no lo
  // usa; CT / Operación General sí). Se guarda con el módulo.
  const [sumaMediaNoche, setSumaMediaNoche] = useState(false);
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
    if (!ready || !selectedCompanyId) { setMeses({}); setSumaMediaNoche(false); return; }
    setLoading(true);
    setError(null);
    cregService.getIddOff(selectedCompanyId, selectedProjectId)
      .then((res) => {
        setMeses(res.data?.meses ?? {});
        setSumaMediaNoche(res.data?.sumaMediaNoche ?? false);
      })
      .catch(() => setError('Error al cargar el IDD OFF'))
      .finally(() => setLoading(false));
  }, [ready, selectedCompanyId, selectedProjectId]);

  const mes: IddOffMes = meses[selYm] ?? emptyMes(selYm);
  const fallas = mes.fallas ?? [];

  const setMes = useCallback((patch: Partial<IddOffMes>) => {
    setMeses((prev) => {
      const base = prev[selYm] ?? emptyMes(selYm);
      return { ...prev, [selYm]: { ...base, ...patch } };
    });
  }, [selYm]);

  const setFalla = useCallback((id: string, patch: Partial<IddOffFalla>) => {
    setMeses((prev) => {
      const base = prev[selYm] ?? emptyMes(selYm);
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
    () => (importText.trim() ? parseFallas(importText, { soloEstado: ['APAGADA', 'INTERMITENTE'] }) : null),
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
    toast.success(`${preview.fallas.length} falla(s) importadas`);
    setImportOpen(false);
    setImportText('');
  };

  const totalHoras = useMemo(() => fallas.reduce((a, f) => a + horasFuera(f, sumaMediaNoche), 0), [fallas, sumaMediaNoche]);
  const totalWiHssi = useMemo(() => fallas.reduce((a, f) => a + wiHssi(f, sumaMediaNoche), 0), [fallas, sumaMediaNoche]);
  const id = useMemo(() => indiceDisponibilidad(fallas, mes.wt, mes.t, sumaMediaNoche), [fallas, mes.wt, mes.t, sumaMediaNoche]);

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    try {
      setSaving(true);
      await cregService.saveIddOff(selectedCompanyId, { meses, sumaMediaNoche }, selectedProjectId);
      toast.success('IDD OFF guardado');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
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
              <PowerOff className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> IDD OFF
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Índice de disponibilidad de las apagadas de la infraestructura en el periodo
            </p>
          </div>
          {ready && (
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
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
              {ready && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Fórmula de horas</label>
                  <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-[hsl(var(--canalco-neutral-300))] bg-white cursor-pointer select-none"
                    title="Con la casilla marcada, el día del reporte cuenta la noche completa (+12 h): mismo día = 12. Sin marcar (Puerto Asís): mismo día = 0.">
                    <input type="checkbox" checked={sumaMediaNoche}
                      onChange={(e) => setSumaMediaNoche(e.target.checked)}
                      className="w-4 h-4 accent-[hsl(var(--canalco-primary))]" />
                    <span className="text-sm text-[hsl(var(--canalco-neutral-800))]">Sumar 12 h de la media noche</span>
                  </label>
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
            {/* El origen previsto es SharePoint; hoy se captura a mano. */}
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-sky-900">
                <p className="font-semibold">Las fallas se capturan a mano por ahora</p>
                <p className="text-xs mt-1 text-sky-800">
                  La carga automática desde SharePoint está pendiente de que un administrador conceda
                  permiso de lectura a la aplicación de Microsoft Graph. El cálculo ya es el definitivo:
                  al conectarla, solo cambia de dónde salen estas filas.
                  Las <strong>horas</strong> y <strong>Wi × HSSi</strong> se calculan solas, como en el Excel.
                </p>
              </div>
            </div>

            {/* Resultado del periodo */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  WT — potencia total instalada (kW)
                </label>
                <Input type="number" step="0.001" placeholder="189,011" value={mes.wt ?? ''}
                  onChange={(e) => setMes({ wt: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  className="h-9" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  T — horas del periodo
                </label>
                <Input type="number" value={mes.t ?? ''}
                  onChange={(e) => setMes({ t: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  className="h-9" />
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                  Sugerido: {horasDelMes(selYm)} h ({new Date(Number(selYm.split('-')[0]), Number(selYm.split('-')[1]), 0).getDate()} días × 12 h)
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
                <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Total horas fuera de servicio</p>
                <p className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mt-1 tabular-nums">{fmtNum(totalHoras, 0)}</p>
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">Σ Wi × HSSi = {fmtNum(totalWiHssi)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg shadow-sm border-2 border-emerald-300 p-4">
                <p className="text-xs font-semibold text-emerald-800">ID — índice de disponibilidad</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{fmtNum(id, 8)}</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  {id == null ? 'Falta WT o T' : '1 − Σ(Wi×HSSi) / (WT×T)'}
                </p>
              </div>
            </div>

            {/* Tabla de fallas */}
            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="bg-[hsl(var(--canalco-primary))]/10 px-4 py-2.5 border-b border-[hsl(var(--canalco-neutral-300))] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[hsl(var(--canalco-neutral-900))] uppercase tracking-wide">
                  Cálculo de índice de disponibilidad apagadas — {monthLongLabel(selYm)}
                </h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-xs">
                    <Upload className="w-3.5 h-3.5 mr-1" /> Importar
                  </Button>
                  <Button size="sm" variant="outline" onClick={addFalla} className="h-7 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar falla
                  </Button>
                </div>
              </div>

              {fallas.length === 0 ? (
                <div className="py-14 text-center text-[hsl(var(--canalco-neutral-600))]">
                  <p className="text-sm">Sin fallas registradas en este periodo.</p>
                  <p className="text-xs mt-1">Con cero fallas el ID es 1 (disponibilidad total).</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                        <Th className="w-10">Ítem</Th>
                        <Th>Código</Th>
                        <Th>Potencia</Th>
                        <Th>Potencia+XL</Th>
                        <Th>Tecnología</Th>
                        <Th className="text-left">Localización</Th>
                        <Th className="text-left">Barrio</Th>
                        <Th>Fecha inicial</Th>
                        <Th>Fecha final</Th>
                        <Th title={sumaMediaNoche ? `(final − inicial + 1) × ${HORAS_OPERACION_DIA}` : `(final − inicial) × ${HORAS_OPERACION_DIA}`}>Horas</Th>
                        <Th className="bg-[hsl(var(--canalco-primary))]/20" title="Potencia+XL / 1000 × horas">Wi × HSSi</Th>
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
                          <Td><Cell value={f.tecnologia ?? ''} onChange={(v) => setFalla(f.id, { tecnologia: v })} /></Td>
                          <Td><Cell value={f.localizacion ?? ''} onChange={(v) => setFalla(f.id, { localizacion: v })} className="text-left" /></Td>
                          <Td><Cell value={f.barrio ?? ''} onChange={(v) => setFalla(f.id, { barrio: v })} className="text-left" /></Td>
                          <Td><CellDate value={f.fechaInicial ?? ''} onChange={(v) => setFalla(f.id, { fechaInicial: v })} /></Td>
                          <Td><CellDate value={f.fechaFinal ?? ''} onChange={(v) => setFalla(f.id, { fechaFinal: v })} /></Td>
                          {/* Calculada: (final − inicial [+1 si suma media noche]) × 12. No se escribe. */}
                          <Td className="text-center tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtNum(horasFuera(f, sumaMediaNoche), 0)}</Td>
                          <Td className="text-right tabular-nums font-semibold bg-[hsl(var(--canalco-primary))]/5">{fmtNum(wiHssi(f, sumaMediaNoche))}</Td>
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
                        <Td colSpan={9} className="text-right pr-3">TOTAL HORAS FUERA DE SERVICIO</Td>
                        <Td className="text-right tabular-nums">{fmtNum(totalHoras, 0)}</Td>
                        <Td className="text-right tabular-nums bg-[hsl(var(--canalco-primary))]/20">{fmtNum(totalWiHssi)}</Td>
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
            <DialogTitle>Importar fallas — {monthLongLabel(selYm)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Carga el <strong>.xlsx</strong> (p. ej. la Operación General), o copia las filas desde Excel
              <strong> con la fila de títulos</strong> y pégalas. Reconoce las columnas <code>S_*</code> del
              export de mantenimiento; las horas y Wi × HSSi se calculan.
            </p>

            <input
              type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="block w-full text-xs text-[hsl(var(--canalco-neutral-600))] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-[hsl(var(--canalco-neutral-300))] file:bg-white file:text-xs file:cursor-pointer hover:file:bg-[hsl(var(--canalco-neutral-100))]"
            />

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'CÓDIGO\tPOTENCIA\tPOTENCIA+XL\tTECNOLOGIA\tLOCALIZACION\tBARRIO\tFECHA INICIAL\tFECHA FINAL\n3146024\t35\t35\tLED\tLUIS CARLOS GALAN\tLUIS CARLOS GALAN\t7/06/2025\t7/06/2025'}
              className="w-full h-40 text-xs font-mono border border-[hsl(var(--canalco-neutral-300))] rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
            />

            {preview?.error && (
              <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-800">{preview.error}</div>
            )}

            {preview && !preview.error && (
              <div className="space-y-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs text-emerald-900">
                  <strong>{preview.fallas.length} falla(s)</strong> · columnas reconocidas: {preview.columnas.join(', ')}
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
              Importar {preview && !preview.error ? `${preview.fallas.length} falla(s)` : ''}
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
