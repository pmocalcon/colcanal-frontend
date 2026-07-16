import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService, UCAP_GRUPOS } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, Save, ClipboardList, AlertCircle, Plus, Trash2,
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

/**
 * Fila del censo: cada UCAP se despliega en una fila por apellido/variante.
 * Si la UCAP no tiene apellidos, se muestra una sola fila "base" con la clave = ucapId.
 * La clave (`key`) es la que indexa las cantidades capturadas.
 */
interface CensoRow {
  key: string;
  ucap: Ucap;
  apellidoId: number | null;
  apellido: string | null;
}

const rowsForUcap = (u: Ucap): CensoRow[] =>
  u.apellidos.length === 0
    ? [{ key: String(u.ucapId), ucap: u, apellidoId: null, apellido: null }]
    : u.apellidos.map((a) => ({
        key: `${u.ucapId}:${a.apellidoId}`,
        ucap: u,
        apellidoId: a.apellidoId,
        apellido: a.apellido,
      }));

/** Etiqueta de la fila para las vistas de solo lectura (descripción + apellido). */
const rowLabel = (row: CensoRow) =>
  row.apellido ? `${row.ucap.description} — ${row.apellido}` : row.ucap.description;

/**
 * Cantidad de una celda (UCAP/apellido × mes), desglosada por origen/financiación.
 * El total instalado es la suma de las tres categorías.
 */
interface CellQty {
  inv: number; // Inversión inicial
  mun: number; // Municipios y terceros
  con: number; // Concesionario
}

const EMPTY_CELL: CellQty = { inv: 0, mun: 0, con: 0 };

/** Categorías del desglose, en el orden en que se muestran. */
const BUCKETS: { key: keyof CellQty; label: string }[] = [
  { key: 'inv', label: 'Inversión inicial' },
  { key: 'mun', label: 'Municipios y terceros' },
  { key: 'con', label: 'Concesionario' },
];

/**
 * Normaliza el valor guardado de una celda. Compatibilidad hacia atrás: los
 * censos viejos guardaban un número (el total) → se coloca en "Inversión inicial".
 */
const normalizeCell = (raw: CellQty | number | undefined | null): CellQty => {
  if (raw == null) return EMPTY_CELL;
  if (typeof raw === 'number') return { inv: raw, mun: 0, con: 0 };
  return { inv: raw.inv || 0, mun: raw.mun || 0, con: raw.con || 0 };
};

const cellTotal = (c: CellQty) => c.inv + c.mun + c.con;

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
  // { [rowKey]: { [ym]: CellQty } }   (rowKey = ucapId o `${ucapId}:${apellidoId}`)
  // Los censos viejos pueden traer un número en vez de CellQty (compat en normalizeCell).
  const [quantities, setQuantities] = useState<Record<string, Record<string, CellQty | number>>>({});
  // Vista: formulario por mes (edición) | cantidades (solo lectura) | resumen valorizado (solo lectura).
  const [view, setView] = useState<'cantidades' | 'formulario' | 'valorizado'>('formulario');
  // Mes seleccionado en el formulario por mes.
  const [formMonthYm, setFormMonthYm] = useState<string | null>(null);

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // UCAP a la que se le está agregando un apellido (spinner del botón +).
  const [apBusyId, setApBusyId] = useState<number | null>(null);
  // Apellidos con un borrado en curso (evita doble clic / peticiones duplicadas).
  const [deletingApIds, setDeletingApIds] = useState<Set<number>>(new Set());

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

  // Refresca solo la lista de UCAPs (con sus apellidos), conservando las
  // cantidades sin guardar del censo.
  const refreshUcaps = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { ucaps: fresh } = await surveysService.getUcaps(selectedCompanyId, selectedProjectId ?? undefined);
    setUcaps(fresh);
  }, [selectedCompanyId, selectedProjectId]);

  // ---- Gestión de apellidos/variantes (desde el propio censo) ----

  const handleAddApellido = async (u: Ucap) => {
    setApBusyId(u.ucapId);
    const wasEmpty = u.apellidos.length === 0;
    try {
      const created = await cregService.addApellido(u.ucapId, `Variante ${u.apellidos.length + 1}`);
      setUcaps((prev) => prev.map((x) =>
        x.ucapId === u.ucapId ? { ...x, apellidos: [...x.apellidos, created] } : x));
      // Si era la primera variante, traslada las cantidades de la fila base a ella
      // (para no perder lo ya capturado al pasar de "sin apellido" a variantes).
      if (wasEmpty) {
        setQuantities((q) => {
          const baseKey = String(u.ucapId);
          if (!q[baseKey]) return q;
          const next = { ...q };
          next[`${u.ucapId}:${created.apellidoId}`] = q[baseKey];
          delete next[baseKey];
          return next;
        });
      }
      toast.success('Apellido agregado · renómbralo');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al agregar el apellido');
      refreshUcaps();
    } finally {
      setApBusyId(null);
    }
  };

  const handleRenameApellido = async (u: Ucap, apellidoId: number, raw: string) => {
    const value = raw.trim();
    const current = u.apellidos.find((a) => a.apellidoId === apellidoId)?.apellido ?? '';
    if (!value || value === current) return;
    // Optimista.
    setUcaps((prev) => prev.map((x) =>
      x.ucapId === u.ucapId
        ? { ...x, apellidos: x.apellidos.map((a) => (a.apellidoId === apellidoId ? { ...a, apellido: value } : a)) }
        : x));
    try {
      await cregService.renameApellido(apellidoId, value);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al renombrar el apellido');
      refreshUcaps();
    }
  };

  const handleDeleteApellido = async (u: Ucap, apellidoId: number) => {
    if (deletingApIds.has(apellidoId)) return; // ya hay un borrado en curso
    setDeletingApIds((s) => new Set(s).add(apellidoId));
    // Quita la fila de la UI y sus cantidades de una vez (idempotente en el back).
    const removeFromState = () => {
      setUcaps((prev) => prev.map((x) =>
        x.ucapId === u.ucapId
          ? { ...x, apellidos: x.apellidos.filter((a) => a.apellidoId !== apellidoId) }
          : x));
      setQuantities((q) => { const next = { ...q }; delete next[`${u.ucapId}:${apellidoId}`]; return next; });
    };
    try {
      const res = await cregService.deleteApellido(apellidoId);
      removeFromState();
      toast.success(res.alreadyGone ? 'Apellido eliminado (ya no existía)' : 'Apellido eliminado');
    } catch (err: any) {
      // Si el back respondiera 404 (versión vieja), igual lo quitamos de la UI.
      if (err?.response?.status === 404) {
        removeFromState();
        toast.success('Apellido eliminado');
      } else {
        toast.error(err?.response?.data?.message || 'Error al eliminar el apellido');
      }
    } finally {
      setDeletingApIds((s) => { const next = new Set(s); next.delete(apellidoId); return next; });
    }
  };

  const cols = useMemo(
    () => monthsBetween(fechaInicio, fechaFinal, mesInicial),
    [fechaInicio, fechaFinal, mesInicial],
  );

  // Todas las filas del censo (una por UCAP sin apellido, o una por apellido).
  const allRows = useMemo(() => ucaps.flatMap(rowsForUcap), [ucaps]);

  // Mantener un mes válido seleccionado en el formulario por mes.
  useEffect(() => {
    if (cols.length === 0) { setFormMonthYm(null); return; }
    setFormMonthYm((cur) => (cur && cols.some((c) => c.ym === cur) ? cur : cols[0].ym));
  }, [cols]);

  // Al elegir un mes vacío, tomar como base los datos del mes anterior
  // (el censo arrastra la base instalada; luego se ajusta lo que cambió).
  useEffect(() => {
    if (!formMonthYm) return;
    const idx = cols.findIndex((c) => c.ym === formMonthYm);
    if (idx <= 0) return; // sin mes anterior del cual copiar
    const prevYm = cols[idx - 1].ym;
    const selYm = formMonthYm;
    setQuantities((q) => {
      const rows = ucaps.flatMap(rowsForUcap);
      // Si el mes seleccionado ya tiene algún dato, no se toca.
      const hasData = rows.some((r) => cellTotal(normalizeCell(q[r.key]?.[selYm])) > 0);
      if (hasData) return q;
      let changed = false;
      const next = { ...q };
      for (const r of rows) {
        const prevCell = q[r.key]?.[prevYm];
        if (prevCell && cellTotal(normalizeCell(prevCell)) > 0) {
          next[r.key] = { ...(next[r.key] ?? {}), [selYm]: prevCell };
          changed = true;
        }
      }
      return changed ? next : q;
    });
  }, [formMonthYm, cols, ucaps]);

  // UCAPs agrupadas por grupo, en el orden de la lista fija (los sin grupo, al final).
  const groupedUcaps = useMemo(() => {
    const order = new Map<string, number>();
    UCAP_GRUPOS.forEach((g, i) => order.set(g, i));
    const byGroup = new Map<string, Ucap[]>();
    for (const u of ucaps) {
      const key = u.grupo?.trim() || 'Sin grupo';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(u);
    }
    const rank = (k: string) => (order.has(k) ? order.get(k)! : k === 'Sin grupo' ? 9999 : 5000);
    return [...byGroup.keys()]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((grupo) => ({ grupo, items: byGroup.get(grupo)! }));
  }, [ucaps]);

  // Celda desglosada (para el formulario de captura).
  const getCell = (key: string, ym: string): CellQty => normalizeCell(quantities[key]?.[ym]);
  // Total instalado de una celda (para cantidades, valorizado y totales).
  const getQty = (key: string, ym: string): number => cellTotal(getCell(key, ym));
  // Actualiza una categoría del mes; si la celda queda en cero, se elimina.
  const setBucket = (key: string, ym: string, bucket: keyof CellQty, value: number) => {
    setQuantities((q) => {
      const nextCell: CellQty = { ...normalizeCell(q[key]?.[ym]), [bucket]: value };
      const row = { ...(q[key] ?? {}) };
      if (cellTotal(nextCell) === 0) delete row[ym]; else row[ym] = nextCell;
      return { ...q, [key]: row };
    });
  };

  // Totales por mes
  const totalsByYm = useMemo(() => {
    const qty: Record<string, number> = {};
    const cost: Record<string, number> = {};
    for (const col of cols) {
      let q = 0, c = 0;
      for (const r of allRows) {
        const n = getQty(r.key, col.ym);
        q += n;
        c += n * (r.ucap.value || 0);
      }
      qty[col.ym] = q;
      cost[col.ym] = c;
    }
    return { qty, cost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, allRows, quantities]);

  // Totales por mes desglosados por categoría: cantidad y costo (cantidad × valor).
  type BucketTotal = CellQty & { total: number };
  const bucketTotalsByYm = useMemo(() => {
    const out: Record<string, { qty: BucketTotal; cost: BucketTotal }> = {};
    for (const col of cols) {
      let qi = 0, qm = 0, qc = 0, ci = 0, cm = 0, cc = 0;
      for (const r of allRows) {
        const cell = getCell(r.key, col.ym);
        const v = r.ucap.value || 0;
        qi += cell.inv; qm += cell.mun; qc += cell.con;
        ci += cell.inv * v; cm += cell.mun * v; cc += cell.con * v;
      }
      out[col.ym] = {
        qty: { inv: qi, mun: qm, con: qc, total: qi + qm + qc },
        cost: { inv: ci, mun: cm, con: cc, total: ci + cm + cc },
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, allRows, quantities]);

  // Costo total del censo valorizado (suma de los subtotales por mes).
  const grandTotalCost = useMemo(
    () => Object.values(totalsByYm.cost).reduce((a, c) => a + c, 0),
    [totalsByYm],
  );

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
            {/* Toggle: formulario (edición) / cantidades (solo lectura) / resumen valorizado (solo lectura) */}
            <div className="p-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center gap-2">
              <button
                onClick={() => setView('formulario')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  view === 'formulario'
                    ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                    : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                }`}
              >
                Formulario por mes
              </button>
              <button
                onClick={() => setView('cantidades')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  view === 'cantidades'
                    ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                    : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                }`}
              >
                Cantidades
              </button>
              <button
                onClick={() => setView('valorizado')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  view === 'valorizado'
                    ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                    : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                }`}
              >
                Resumen valorizado
              </button>
              {view === 'cantidades' && (
                <span className="text-xs text-[hsl(var(--canalco-neutral-500))] ml-1">
                  Solo lectura. Edita las cantidades en «Formulario por mes».
                </span>
              )}
              {view === 'valorizado' && (
                <span className="text-xs text-[hsl(var(--canalco-neutral-500))] ml-1">
                  Cantidad × valor de cada UCAP. Solo lectura.
                </span>
              )}
            </div>

            {view === 'cantidades' && (
            <div className="overflow-auto max-h-[70vh]">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                    <th rowSpan={2} className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">CÓDIGO</th>
                    <th rowSpan={2} className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[260px]">UCAP</th>
                    {cols.map((col) => (
                      <th key={col.ym} colSpan={4} className="px-2 py-1 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))]">
                        MES {col.mes} · {col.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                    {cols.map((col) => (
                      <Fragment key={col.ym}>
                        {BUCKETS.map((b) => (
                          <th key={`${col.ym}-${b.key}`} className="px-2 py-1 text-center font-medium text-[10px] leading-tight text-[hsl(var(--canalco-neutral-600))] border border-[hsl(var(--canalco-neutral-200))] min-w-[64px]">
                            {b.label}
                          </th>
                        ))}
                        <th className="px-2 py-1 text-center font-semibold text-[10px] text-[hsl(var(--canalco-neutral-700))] border border-[hsl(var(--canalco-neutral-200))] min-w-[64px]">Total</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ucaps.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length * 4 + 2} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                        Este municipio no tiene UCAPs registradas.
                      </td>
                    </tr>
                  ) : (
                    groupedUcaps.map((g) => (
                      <Fragment key={g.grupo}>
                        <tr className="bg-[hsl(var(--canalco-primary))]/10">
                          <td colSpan={cols.length * 4 + 2} className="p-0 border border-[hsl(var(--canalco-neutral-200))]">
                            <div className="sticky left-0 inline-block px-2 py-1.5 font-semibold text-[hsl(var(--canalco-neutral-800))] uppercase text-[11px] tracking-wide">
                              {g.grupo}
                            </div>
                          </td>
                        </tr>
                        {g.items.flatMap(rowsForUcap).map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{row.ucap.code}</td>
                            <td className="sticky left-[80px] z-10 bg-white px-2 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{rowLabel(row)}</td>
                            {cols.map((col) => {
                              const cell = getCell(row.key, col.ym);
                              const tot = cellTotal(cell);
                              return (
                                <Fragment key={col.ym}>
                                  {BUCKETS.map((b) => (
                                    <td key={`${col.ym}-${b.key}`} className="px-2 py-1 text-center text-xs tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap">
                                      {cell[b.key] ? fmtQty(cell[b.key]) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                    </td>
                                  ))}
                                  <td className="px-2 py-1 text-center text-xs tabular-nums font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04] whitespace-nowrap">
                                    {tot ? fmtQty(tot) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                  </td>
                                </Fragment>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
                {ucaps.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
                      <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))]">TOTAL</td>
                      <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))]" />
                      {cols.map((col) => {
                        const t = bucketTotalsByYm[col.ym]?.qty;
                        return (
                          <Fragment key={col.ym}>
                            {BUCKETS.map((b) => (
                              <td key={`${col.ym}-${b.key}`} className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))]">
                                {t && t[b.key] ? fmtQty(t[b.key]) : '–'}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04]">
                              {t && t.total ? fmtQty(t.total) : '–'}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                    <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
                      <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-primary))]/10 px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">SUB TOTAL COSTO</td>
                      <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-neutral-200))]" />
                      {cols.map((col) => {
                        const t = bucketTotalsByYm[col.ym]?.cost;
                        return (
                          <Fragment key={col.ym}>
                            {BUCKETS.map((b) => (
                              <td key={`${col.ym}-${b.key}`} className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap text-[10px]">
                                {t && t[b.key] ? fmtCOP(t[b.key]) : '–'}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04] whitespace-nowrap">
                              {t && t.total ? fmtCOP(t.total) : '–'}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            )}

            {/* ── Vista: formulario por mes (todas las UCAPs; mes anterior + mes elegido) ── */}
            {view === 'formulario' && (() => {
              const selIdx = cols.findIndex((c) => c.ym === formMonthYm);
              const selCol = selIdx >= 0 ? cols[selIdx] : null;
              const prevCol = selIdx > 0 ? cols[selIdx - 1] : null;
              // Totales por categoría (inv / mun / con) + total, para el pie.
              const prevTotals = prevCol ? bucketTotalsByYm[prevCol.ym]?.qty ?? null : null;
              const selTotals = selCol ? bucketTotalsByYm[selCol.ym]?.qty ?? null : null;
              return (
              <div className="p-6 space-y-5">
                {/* Selector de mes */}
                <div className="max-w-xs">
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                    Mes a diligenciar
                  </label>
                  <Select value={formMonthYm ?? ''} onValueChange={(v) => setFormMonthYm(v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un mes" /></SelectTrigger>
                    <SelectContent>
                      {cols.map((col) => (
                        <SelectItem key={col.ym} value={col.ym}>MES {col.mes} · {col.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Captura la cantidad del mes en las 3 categorías (Inversión inicial · Municipios y terceros · Concesionario);
                    el <strong>Total</strong> se calcula solo. Un mes vacío se pre-carga con el mes anterior; ajusta solo lo que cambió.
                    Cada UCAP se despliega en una fila por apellido; usa <Plus className="inline w-3 h-3" /> para agregar variantes.
                  </p>
                </div>

                {ucaps.length === 0 ? (
                  <div className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                    Este municipio no tiene UCAPs registradas.
                  </div>
                ) : selCol && (
                  <div className="overflow-auto max-h-[65vh] border border-[hsl(var(--canalco-neutral-200))] rounded-md">
                    <table className="text-xs border-collapse w-full">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                          <th rowSpan={2} className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">CÓDIGO</th>
                          <th rowSpan={2} className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[220px]">UCAP</th>
                          <th rowSpan={2} className="px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[220px]">Apellido / variante</th>
                          <th colSpan={4} className="px-3 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-500))]">
                            {prevCol
                              ? <>MES {prevCol.mes} · {prevCol.label} · anterior</>
                              : 'Mes anterior'}
                          </th>
                          <th colSpan={4} className="px-3 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10">
                            MES {selCol.mes} · {selCol.label}
                          </th>
                        </tr>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                          {/* Sub-columnas del mes anterior (solo lectura) */}
                          {BUCKETS.map((b) => (
                            <th key={`ph-${b.key}`} className="px-2 py-1 text-center font-medium text-[10px] leading-tight text-[hsl(var(--canalco-neutral-500))] border border-[hsl(var(--canalco-neutral-200))] min-w-[74px]">
                              {b.label}
                            </th>
                          ))}
                          <th className="px-2 py-1 text-center font-semibold text-[10px] text-[hsl(var(--canalco-neutral-600))] border border-[hsl(var(--canalco-neutral-200))] min-w-[70px]">Total</th>
                          {/* Sub-columnas del mes seleccionado (editables) */}
                          {BUCKETS.map((b) => (
                            <th key={`sh-${b.key}`} className="px-2 py-1 text-center font-medium text-[10px] leading-tight text-[hsl(var(--canalco-neutral-700))] border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.06] min-w-[86px]">
                              {b.label}
                            </th>
                          ))}
                          <th className="px-2 py-1 text-center font-semibold text-[10px] text-[hsl(var(--canalco-neutral-800))] border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10 min-w-[74px]">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedUcaps.map((g) => (
                          <Fragment key={g.grupo}>
                            <tr className="bg-[hsl(var(--canalco-primary))]/10">
                              <td colSpan={11} className="px-2 py-1.5 font-semibold text-[hsl(var(--canalco-neutral-800))] uppercase text-[11px] tracking-wide border border-[hsl(var(--canalco-neutral-200))]">
                                {g.grupo}
                              </td>
                            </tr>
                            {g.items.map((u) => {
                              const rows = rowsForUcap(u);
                              return (
                                <Fragment key={u.ucapId}>
                                  {rows.map((row, ri) => (
                                    <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                      <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                                        {ri === 0 ? row.ucap.code : ''}
                                      </td>
                                      <td className="sticky left-[80px] z-10 bg-white px-2 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                                        {ri === 0
                                          ? row.ucap.description
                                          : <span className="text-[hsl(var(--canalco-neutral-300))] pl-2">↳</span>}
                                      </td>
                                      <td className="px-2 py-1 border border-[hsl(var(--canalco-neutral-100))]">
                                        <div className="flex items-center gap-1">
                                          {row.apellidoId != null ? (
                                            <>
                                              <Input
                                                key={`ap-${row.apellidoId}-${row.apellido ?? ''}`}
                                                defaultValue={row.apellido ?? ''}
                                                placeholder="Nombre de la variante"
                                                onBlur={(e) => handleRenameApellido(u, row.apellidoId!, e.target.value)}
                                                onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                                                className="h-7 text-xs w-44"
                                                title="Escribe el nombre y sal del campo (o Enter) para guardar"
                                              />
                                              <button
                                                type="button"
                                                title="Eliminar este apellido (y sus cantidades)"
                                                disabled={deletingApIds.has(row.apellidoId!)}
                                                onClick={() => handleDeleteApellido(u, row.apellidoId!)}
                                                className="text-[hsl(var(--canalco-neutral-400))] hover:text-red-600 disabled:opacity-50"
                                              >
                                                {deletingApIds.has(row.apellidoId!)
                                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                  : <Trash2 className="w-3.5 h-3.5" />}
                                              </button>
                                            </>
                                          ) : (
                                            <span className="text-[hsl(var(--canalco-neutral-400))] italic">Sin apellido</span>
                                          )}
                                          {ri === 0 && (
                                            <button
                                              type="button"
                                              title="Agregar un apellido/variante a esta UCAP"
                                              disabled={apBusyId === u.ucapId}
                                              onClick={() => handleAddApellido(u)}
                                              className="ml-1 inline-flex items-center gap-0.5 text-[hsl(var(--canalco-primary))] hover:underline disabled:opacity-50"
                                            >
                                              {apBusyId === u.ucapId
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Plus className="w-3.5 h-3.5" />}
                                              {row.apellidoId == null && <span className="text-[11px]">apellido</span>}
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                      {/* Mes anterior: desglose (solo lectura) + total */}
                                      {BUCKETS.map((b) => {
                                        const v = prevCol ? getCell(row.key, prevCol.ym)[b.key] : 0;
                                        return (
                                          <td key={`p-${b.key}`} className="px-2 py-1 text-center tabular-nums text-[hsl(var(--canalco-neutral-500))] border border-[hsl(var(--canalco-neutral-100))]">
                                            {v ? fmtQty(v) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                          </td>
                                        );
                                      })}
                                      <td className="px-2 py-1 text-center tabular-nums font-semibold text-[hsl(var(--canalco-neutral-600))] border border-[hsl(var(--canalco-neutral-200))]">
                                        {prevCol && getQty(row.key, prevCol.ym)
                                          ? fmtQty(getQty(row.key, prevCol.ym))
                                          : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                      </td>
                                      {/* Mes seleccionado: 3 casillas editables + total calculado */}
                                      {BUCKETS.map((b) => (
                                        <td key={`s-${b.key}`} className="px-1.5 py-1 text-center border border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-primary))]/[0.03]">
                                          <Input
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={getCell(row.key, selCol.ym)[b.key] || ''}
                                            onChange={(e) => setBucket(row.key, selCol.ym, b.key, e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                                            className="w-[76px] mx-auto text-right h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          />
                                        </td>
                                      ))}
                                      <td className="px-2 py-1 text-center tabular-nums font-semibold text-[hsl(var(--canalco-neutral-900))] border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10">
                                        {getQty(row.key, selCol.ym)
                                          ? fmtQty(getQty(row.key, selCol.ym))
                                          : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-10">
                        <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
                          <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))]">TOTAL</td>
                          <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))]" />
                          <td className="border border-[hsl(var(--canalco-neutral-200))]" />
                          {/* Totales mes anterior */}
                          {BUCKETS.map((b) => (
                            <td key={`pt-${b.key}`} className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-500))]">
                              {prevTotals && prevTotals[b.key] ? fmtQty(prevTotals[b.key]) : '–'}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-600))]">
                            {prevTotals && prevTotals.total ? fmtQty(prevTotals.total) : '–'}
                          </td>
                          {/* Totales mes seleccionado */}
                          {BUCKETS.map((b) => (
                            <td key={`st-${b.key}`} className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.06]">
                              {selTotals && selTotals[b.key] ? fmtQty(selTotals[b.key]) : '–'}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10">
                            {selTotals ? fmtQty(selTotals.total) : '–'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              );
            })()}

            {/* ── Vista: resumen valorizado (solo lectura) ── */}
            {view === 'valorizado' && (
            <div className="overflow-auto max-h-[70vh]">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                    <th rowSpan={2} className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">CÓDIGO</th>
                    <th rowSpan={2} className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-neutral-100))] px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[260px]">UCAP</th>
                    <th rowSpan={2} className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[96px] whitespace-nowrap">VALOR UNIT.</th>
                    {cols.map((col) => (
                      <th key={col.ym} colSpan={4} className="px-2 py-1 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))]">
                        MES {col.mes} · {col.label}
                      </th>
                    ))}
                    <th rowSpan={2} className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10 min-w-[110px] whitespace-nowrap">TOTAL UCAP</th>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                    {cols.map((col) => (
                      <Fragment key={col.ym}>
                        {BUCKETS.map((b) => (
                          <th key={`${col.ym}-${b.key}`} className="px-2 py-1 text-center font-medium text-[10px] leading-tight text-[hsl(var(--canalco-neutral-600))] border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">
                            {b.label}
                          </th>
                        ))}
                        <th className="px-2 py-1 text-center font-semibold text-[10px] text-[hsl(var(--canalco-neutral-700))] border border-[hsl(var(--canalco-neutral-200))] min-w-[80px]">Total</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ucaps.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length * 4 + 4} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                        Este municipio no tiene UCAPs registradas.
                      </td>
                    </tr>
                  ) : (
                    groupedUcaps.map((g) => {
                      const groupRows = g.items.flatMap(rowsForUcap);
                      const groupTotal = groupRows.reduce(
                        (a, row) => a + cols.reduce((s, col) => s + getQty(row.key, col.ym) * (row.ucap.value || 0), 0),
                        0,
                      );
                      // Subtotal del grupo por mes y categoría (costo = cantidad × valor).
                      const groupBucketCost = (ym: string) => {
                        let inv = 0, mun = 0, con = 0;
                        for (const row of groupRows) {
                          const c = getCell(row.key, ym);
                          const v = row.ucap.value || 0;
                          inv += c.inv * v; mun += c.mun * v; con += c.con * v;
                        }
                        return { inv, mun, con, total: inv + mun + con };
                      };
                      return (
                        <Fragment key={g.grupo}>
                          <tr className="bg-[hsl(var(--canalco-primary))]/10">
                            <td colSpan={cols.length * 4 + 4} className="p-0 border border-[hsl(var(--canalco-neutral-200))]">
                              <div className="sticky left-0 inline-block px-2 py-1.5 font-semibold text-[hsl(var(--canalco-neutral-800))] uppercase text-[11px] tracking-wide">
                                {g.grupo}
                              </div>
                            </td>
                          </tr>
                          {groupRows.map((row) => {
                            const rowTotal = cols.reduce((a, col) => a + getQty(row.key, col.ym) * (row.ucap.value || 0), 0);
                            const v = row.ucap.value || 0;
                            return (
                              <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{row.ucap.code}</td>
                                <td className="sticky left-[80px] z-10 bg-white px-2 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{rowLabel(row)}</td>
                                <td className="px-2 py-1 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))] border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap">{fmtCOP(v)}</td>
                                {cols.map((col) => {
                                  const cell = getCell(row.key, col.ym);
                                  const totVal = cellTotal(cell) * v;
                                  return (
                                    <Fragment key={col.ym}>
                                      {BUCKETS.map((b) => {
                                        const cv = cell[b.key] * v;
                                        return (
                                          <td key={`${col.ym}-${b.key}`} className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap text-[10px]">
                                            {cv ? fmtCOP(cv) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                          </td>
                                        );
                                      })}
                                      <td className="px-2 py-1 text-right tabular-nums font-medium border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04] whitespace-nowrap">
                                        {totVal ? fmtCOP(totVal) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                      </td>
                                    </Fragment>
                                  );
                                })}
                                <td className="px-2 py-1 text-right tabular-nums font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/5 whitespace-nowrap">{fmtCOP(rowTotal)}</td>
                              </tr>
                            );
                          })}
                          {/* Subtotal del grupo */}
                          <tr className="bg-[hsl(var(--canalco-neutral-100))] font-medium">
                            <td colSpan={3} className="sticky left-0 z-10 bg-[hsl(var(--canalco-neutral-100))] px-2 py-1.5 text-right border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">
                              Subtotal {g.grupo}
                            </td>
                            {cols.map((col) => {
                              const sub = groupBucketCost(col.ym);
                              return (
                                <Fragment key={col.ym}>
                                  {BUCKETS.map((b) => (
                                    <td key={`${col.ym}-${b.key}`} className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap text-[10px]">
                                      {sub[b.key] ? fmtCOP(sub[b.key]) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                    </td>
                                  ))}
                                  <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04] whitespace-nowrap">
                                    {sub.total ? fmtCOP(sub.total) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                                  </td>
                                </Fragment>
                              );
                            })}
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/10 whitespace-nowrap">{fmtCOP(groupTotal)}</td>
                          </tr>
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
                {ucaps.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
                      <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-primary))]/10 px-2 py-1.5 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">SUB TOTAL COSTO</td>
                      <td className="sticky left-[80px] z-20 bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-neutral-200))]" />
                      <td className="bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-neutral-200))]" />
                      {cols.map((col) => {
                        const t = bucketTotalsByYm[col.ym]?.cost;
                        return (
                          <Fragment key={col.ym}>
                            {BUCKETS.map((b) => (
                              <td key={`${col.ym}-${b.key}`} className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap text-[10px]">
                                {t && t[b.key] ? fmtCOP(t[b.key]) : '–'}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.06] whitespace-nowrap">
                              {t && t.total ? fmtCOP(t.total) : '–'}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/20 whitespace-nowrap">
                        {fmtCOP(grandTotalCost)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
