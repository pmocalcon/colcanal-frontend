import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, Save, ClipboardList, AlertCircle,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fmtCOP = (n: number) =>
  '$' + (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtQty = (n: number) => (n || 0).toLocaleString('es-CO');

/** 'YYYY-MM' -> 'nov-24' */
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${MONTH_ABBR[m - 1]}-${String(y).slice(2)}`;
};

interface MonthCol { ym: string; label: string; mes: number; }

function monthsBetween(start: string, end: string, mesInicial: number): MonthCol[] {
  if (!start || !end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const cols: MonthCol[] = [];
  let y = sy, m = sm, guard = 0, i = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    cols.push({ ym, label: `${MONTH_ABBR[m - 1]}-${String(y).slice(2)}`, mes: mesInicial + i });
    m++; if (m > 12) { m = 1; y++; }
    guard++; i++;
  }
  return cols;
}

export default function CregCensoPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFinal, setFechaFinal] = useState('');
  const [mesInicial, setMesInicial] = useState(1);
  // { [ucapId]: { [ym]: number } }
  const [quantities, setQuantities] = useState<Record<string, Record<string, number>>>({});

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
      cregService.getCenso(companyId, projectId),
      cregService.getParametrizacion(companyId, projectId),
    ])
      .then(([ucapsRes, censo, param]) => {
        setUcaps(ucapsRes.ucaps);
        const d = censo.data;
        const p = param.data;
        // El rango de meses lo define la hoja de Parámetros; los censos
        // guardados antes de ese cambio conservan su propia copia.
        setFechaInicio(p?.fechaInicio ?? d?.fechaInicio ?? '');
        setFechaFinal(p?.fechaFinal ?? d?.fechaFinal ?? '');
        setMesInicial(typeof d?.mesInicial === 'number' ? d.mesInicial : 1);
        setQuantities(d?.quantities ?? {});
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar el censo'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  const cols = useMemo(
    () => monthsBetween(fechaInicio, fechaFinal, mesInicial),
    [fechaInicio, fechaFinal, mesInicial],
  );

  const getQty = (ucapId: number, ym: string): number => quantities[String(ucapId)]?.[ym] ?? 0;
  const setQty = (ucapId: number, ym: string, value: number) => {
    setQuantities((q) => {
      const key = String(ucapId);
      const row = { ...(q[key] ?? {}) };
      if (!value) delete row[ym]; else row[ym] = value;
      return { ...q, [key]: row };
    });
  };

  // Totales por mes
  const totalsByYm = useMemo(() => {
    const qty: Record<string, number> = {};
    const cost: Record<string, number> = {};
    for (const col of cols) {
      let q = 0, c = 0;
      for (const u of ucaps) {
        const n = getQty(u.ucapId, col.ym);
        q += n;
        c += n * (u.value || 0);
      }
      qty[col.ym] = q;
      cost[col.ym] = c;
    }
    return { qty, cost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, ucaps, quantities]);

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      await cregService.saveCenso(
        selectedCompanyId,
        { fechaInicio, fechaFinal, mesInicial, quantities },
        selectedProjectId,
      );
      toast.success('Censo guardado');
    } catch {
      toast.error('Error al guardar el censo');
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
              <ClipboardList className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Censo físico
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Cantidad de UCAPs instaladas por mes (Res. CREG 123 de 2011)
            </p>
          </div>
          {ready && (
            <Button onClick={handleSave} disabled={saving || loading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        {/* Selector + fechas */}
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
              {ready && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Periodo</label>
                    <div className="flex items-center h-10">
                      {fechaInicio && fechaFinal ? (
                        <span className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))] tabular-nums">
                          {monthLabel(fechaInicio)} — {monthLabel(fechaFinal)}
                        </span>
                      ) : (
                        <span className="text-sm text-[hsl(var(--canalco-neutral-500))]">Sin definir</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">N° mes inicial</label>
                    <Input type="number" min="1" value={mesInicial}
                      onChange={(e) => setMesInicial(parseInt(e.target.value) || 1)} className="w-28" />
                  </div>
                </>
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
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {selectedCompanyId && isCanalesContactos
                ? 'Selecciona un proyecto de Canales & Contactos'
                : 'Selecciona una empresa para ver / editar su censo'}
            </p>
          </div>
        )}

        {ready && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
        )}

        {ready && !loading && cols.length === 0 && (
          <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-base font-medium">Define la fecha de inicio y la fecha final para generar los meses.</p>
          </div>
        )}

        {ready && !loading && cols.length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                    <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">ITEM</th>
                    <th className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[220px]">DESCRIPCIÓN</th>
                    {cols.map((col) => (
                      <th key={col.ym} className="px-2 py-1 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[72px]">
                        MES {col.mes}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                    <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))]" />
                    <th className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))]" />
                    {cols.map((col) => (
                      <th key={col.ym} className="px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-600))] border border-[hsl(var(--canalco-neutral-200))]">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ucaps.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length + 2} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                        Este municipio no tiene UCAPs registradas.
                      </td>
                    </tr>
                  ) : (
                    ucaps.map((u) => (
                      <tr key={u.ucapId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                        <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{u.code}</td>
                        <td className="sticky left-[80px] z-10 bg-white px-2 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{u.description}</td>
                        {cols.map((col) => {
                          const val = getQty(u.ucapId, col.ym);
                          return (
                            <td key={col.ym} className="p-0 border border-[hsl(var(--canalco-neutral-100))]">
                              <input
                                type="number"
                                min="0"
                                value={val || ''}
                                placeholder="-"
                                onChange={(e) => setQty(u.ucapId, col.ym, e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                                className="w-full h-7 text-center text-xs bg-transparent outline-none focus:bg-orange-50 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {ucaps.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
                      <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))]">TOTAL</td>
                      <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))]" />
                      {cols.map((col) => (
                        <td key={col.ym} className="px-2 py-1.5 text-center border border-[hsl(var(--canalco-neutral-200))]">
                          {fmtQty(totalsByYm.qty[col.ym])}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
                      <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-primary))]/10 px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">SUB TOTAL COSTO</td>
                      <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-neutral-200))]" />
                      {cols.map((col) => (
                        <td key={col.ym} className="px-2 py-1.5 text-right border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                          {fmtCOP(totalsByYm.cost[col.ym])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
