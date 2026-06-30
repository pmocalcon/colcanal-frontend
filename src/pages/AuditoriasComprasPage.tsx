import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditService } from '@/services/audit.service';
import type { AuditLog, MatrixResponse, AuditStats } from '@/services/audit.service';
import { usersService } from '@/services/users.service';
import type { User } from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Home, Menu, AlertCircle, ArrowLeft, Eye, Search, X, LayoutList, Grid3x3, BarChart2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from 'recharts';

const STATE_LINE_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#10b981', '#f97316', '#a855f7', '#6366f1', '#0ea5e9', '#14b8a6', '#eab308', '#ec4899', '#64748b', '#f59e0b'];
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort } from '@/utils/dateUtils';

const MATRIX_ACTION_LABELS: Record<string, string> = {
  crear_requisicion: 'Creación',
  revisar_aprobar: 'Revisión ✓',
  revisar_rechazar: 'Revisión ✗',
  autorizar_aprobar: 'Autorización ✓',
  autorizar_rechazar: 'Autorización ✗',
  aprobar_gerencia: 'Gerencia ✓',
  rechazar_gerencia: 'Gerencia ✗',
  correccion_estado: 'Corrección',
  gestionar_cotizacion: 'Cotización',
  crear_ordenes_compra: 'Crear OC',
  aprobar_todas_ordenes_compra: 'Aprobar OC',
  registrar_recepcion: 'Recepción',
  anular_requisicion: 'Anulación',
};

const MATRIX_ACTION_COLORS: Record<string, string> = {
  crear_requisicion: 'bg-blue-100 text-blue-800',
  revisar_aprobar: 'bg-green-100 text-green-800',
  revisar_rechazar: 'bg-red-100 text-red-800',
  autorizar_aprobar: 'bg-emerald-100 text-emerald-800',
  autorizar_rechazar: 'bg-red-100 text-red-800',
  aprobar_gerencia: 'bg-emerald-100 text-emerald-800',
  rechazar_gerencia: 'bg-red-100 text-red-800',
  correccion_estado: 'bg-amber-100 text-amber-800',
  gestionar_cotizacion: 'bg-purple-100 text-purple-800',
  crear_ordenes_compra: 'bg-indigo-100 text-indigo-800',
  aprobar_todas_ordenes_compra: 'bg-indigo-100 text-indigo-800',
  registrar_recepcion: 'bg-teal-100 text-teal-800',
  anular_requisicion: 'bg-slate-100 text-slate-800',
};

function formatMatrixDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

function formatElapsed(ms: number): string {
  if (ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function getElapsedFromPrev(
  events: Record<string, string>,
  actions: string[],
  currentIdx: number,
): string | null {
  const currentDate = events[actions[currentIdx]];
  if (!currentDate) return null;
  for (let i = currentIdx - 1; i >= 0; i--) {
    const prevDate = events[actions[i]];
    if (prevDate) {
      const diff = new Date(currentDate).getTime() - new Date(prevDate).getTime();
      return diff > 0 ? formatElapsed(diff) : null;
    }
  }
  return null;
}

interface GroupedRequisition {
  requisitionId: number;
  requisitionNumber: string;
  companyName: string;
  actionCount: number;
  lastAction: string;
  lastActionDate: string;
  lastUser: string;
}

interface FilterForm {
  requisitionNumber: string;
  companyName: string;
  userName: string;
  fromDate: string;
  toDate: string;
  action: string;
}

const EMPTY_FILTERS: FilterForm = {
  requisitionNumber: '',
  companyName: '',
  userName: '',
  fromDate: '',
  toDate: '',
  action: '',
};

const ACTION_LABELS: Record<string, string> = {
  crear: 'Creada',
  revisar: 'Revisada',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada',
  registrar_cotizacion: 'Cotización Registrada',
  crear_ordenes_compra: 'Órdenes de Compra Generadas',
  registrar_recepcion: 'Recepción Registrada',
  editar_requisicion: 'Requisición Editada',
  aprobar_gerencia: 'Aprobada por Gerencia',
  aprobar_todas_ordenes_compra: 'Todas las OC Aprobadas',
  autorizar: 'Autorizada',
  rechazar_autorizador: 'Rechazada por Autorizador',
};

const ACTION_COLORS: Record<string, string> = {
  crear: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  revisar: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  aprobar: 'bg-green-500/10 text-green-700 border-green-500/20',
  rechazar: 'bg-red-500/10 text-red-700 border-red-500/20',
  registrar_cotizacion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  crear_ordenes_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  registrar_recepcion: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
  editar_requisicion: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  aprobar_gerencia: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
  aprobar_todas_ordenes_compra: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  autorizar: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  rechazar_autorizador: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
};

export default function AuditoriasComprasPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'registros' | 'matriz' | 'graficos'>('registros');

  // ── Registros state ──
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [groupedRequisitions, setGroupedRequisitions] = useState<GroupedRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // ── Stats state ──
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);

  // ── Matriz state ──
  const [matrixData, setMatrixData] = useState<MatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixLoaded, setMatrixLoaded] = useState(false);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixFromDate, setMatrixFromDate] = useState('2026-01-10');
  const [matrixToDate, setMatrixToDate] = useState('');
  const [matrixCompany, setMatrixCompany] = useState('');
  const [matrixStateFilter, setMatrixStateFilter] = useState('');
  // Filtros del tab Gráficos (empresa + material + fechas)
  const [graphCompany, setGraphCompany] = useState('');
  const [graphMaterial, setGraphMaterial] = useState('');
  const [graphRequester, setGraphRequester] = useState('');
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [requesterLoading, setRequesterLoading] = useState(false);
  const [graphFrom, setGraphFrom] = useState('2026-01-10');
  const [graphTo, setGraphTo] = useState('');
  const [matrixApplied, setMatrixApplied] = useState<{ search: string; from: string; to: string; company: string }>({ search: '', from: '2026-01-10', to: '', company: '' });

  // Filter state: form values (what user types) vs applied (what was last searched)
  const [filterForm, setFilterForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>(EMPTY_FILTERS);

  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;

  const groupLogsByRequisition = (auditLogs: AuditLog[]): GroupedRequisition[] => {
    const grouped = new Map<number, GroupedRequisition>();

    auditLogs.forEach(log => {
      const reqId = log.requisition.requisitionId;

      if (!grouped.has(reqId)) {
        grouped.set(reqId, {
          requisitionId: reqId,
          requisitionNumber: log.requisition.requisitionNumber,
          companyName: log.requisition.operationCenter?.company?.name || '-',
          actionCount: 1,
          lastAction: log.action,
          lastActionDate: log.createdAt,
          lastUser: log.user.nombre,
        });
      } else {
        const existing = grouped.get(reqId)!;
        existing.actionCount += 1;
        if (new Date(log.createdAt) > new Date(existing.lastActionDate)) {
          existing.lastAction = log.action;
          existing.lastActionDate = log.createdAt;
          existing.lastUser = log.user.nombre;
        }
      }
    });

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.lastActionDate).getTime() - new Date(a.lastActionDate).getTime()
    );
  };

  const loadAuditLogs = useCallback(async (currentPage: number, filters: FilterForm) => {
    try {
      setLoading(true);
      setError(null);
      const response = await auditService.getAuditLogs({
        page: currentPage,
        limit,
        requisitionNumber: filters.requisitionNumber || undefined,
        companyName: filters.companyName || undefined,
        userName: filters.userName || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        action: filters.action || undefined,
      });
      setLogs(response.data);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setGroupedRequisitions(groupLogsByRequisition(response.data));
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Error al cargar los registros de auditoría');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLogs(page, appliedFilters);
  }, [page, appliedFilters, loadAuditLogs]);

  const handleSearch = () => {
    setPage(1);
    setAppliedFilters({ ...filterForm });
  };

  const handleClear = () => {
    setFilterForm(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const loadMatrix = useCallback(async (filters: { search: string; from: string; to: string; company: string; material?: string; requester?: string }) => {
    try {
      setMatrixLoading(true);
      const data = await auditService.getMatrix({
        requisitionNumber: filters.search || undefined,
        fromDate: filters.from || undefined,
        toDate: filters.to || undefined,
        companyName: filters.company || undefined,
        materialCode: filters.material || undefined,
        requesterName: filters.requester || undefined,
      });
      setMatrixData(data);
      setMatrixLoaded(true);
    } catch {
      setError('Error al cargar la matriz');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  // Filtro por persona del gráfico de materiales: recarga silenciosa (no oculta el tab).
  const applyRequester = useCallback(async (requester: string) => {
    try {
      setRequesterLoading(true);
      const data = await auditService.getMatrix({
        fromDate: graphFrom || undefined,
        toDate: graphTo || undefined,
        companyName: graphCompany || undefined,
        materialCode: graphMaterial || undefined,
        requesterName: requester || undefined,
      });
      setMatrixData(data);
    } catch {
      /* sin interrumpir el resto del tab */
    } finally {
      setRequesterLoading(false);
    }
  }, [graphFrom, graphTo, graphCompany, graphMaterial]);

  useEffect(() => {
    if ((activeTab === 'matriz' || activeTab === 'graficos') && !matrixLoaded) {
      loadMatrix({ search: '', from: '2026-01-10', to: '', company: '' });
    }
    if ((activeTab === 'graficos' || activeTab === 'matriz') && !auditStats) {
      auditService.getStats().then(setAuditStats).catch(() => {});
    }
    if (activeTab === 'graficos' && systemUsers.length === 0) {
      usersService.getAllActive()
        .then((u) => setSystemUsers([...u].sort((a, b) => a.nombre.localeCompare(b.nombre))))
        .catch(() => {});
    }
  }, [activeTab, matrixLoaded, loadMatrix, auditStats, systemUsers.length]);

  const monthlyChartData = useMemo(() => {
    if (!matrixData) return [];
    const MONTH_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const blank = () => ({ requisiciones: 0, cotizaciones: 0, reqConOC: 0, ordenesCompra: 0, anuladas: 0, ocValor: 0, facturacionValor: 0 });
    const counts: Record<string, ReturnType<typeof blank>> = {};

    matrixData.rows.forEach((row) => {
      const creacion = row.events['crear_requisicion'] || row.events['crear_requisicion_directo_gerencia'];
      if (!creacion) return;
      const d = new Date(creacion);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!counts[key]) counts[key] = blank();
      counts[key].requisiciones += 1;
      if (row.events['gestionar_cotizacion']) counts[key].cotizaciones += 1;
      if (row.events['crear_ordenes_compra']) counts[key].reqConOC += 1;
    });

    // Merge real OC counts from backend
    (matrixData.purchaseOrdersByMonth ?? []).forEach(({ year, month, count }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!counts[key]) counts[key] = blank();
      counts[key].ordenesCompra = count;
    });

    (matrixData.voidedRequisitionsByMonth ?? []).forEach(({ year, month, count }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!counts[key]) counts[key] = blank();
      counts[key].anuladas = count;
    });

    // Montos por mes
    (matrixData.purchaseOrderValueByMonth ?? []).forEach(({ year, month, value }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!counts[key]) counts[key] = blank();
      counts[key].ocValor = value;
    });
    (matrixData.invoiceValueByMonth ?? []).forEach(({ year, month, value }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!counts[key]) counts[key] = blank();
      counts[key].facturacionValor = value;
    });

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [year, month] = key.split('-');
        return { mes: `${MONTH_ES[Number(month) - 1]} ${year}`, ...val };
      });
  }, [matrixData]);

  // Promedio de tiempo entre estados, agrupado por mes (mes del estado alcanzado).
  const stateAvgData = useMemo(() => {
    if (!matrixData) return [];
    const MONTH_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const actions = matrixData.actions;
    const DAY = 86400000;
    const round1 = (ms: number, n: number) => (n > 0 ? Math.round(ms / n / DAY * 10) / 10 : 0);
    const tsOf = (action: string, ev: Record<string, string>) => {
      const v = ev[action];
      if (!v) return NaN;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? NaN : t;
    };
    // Acumuladores: proceso total + fases del flujo.
    type Acc = { total: number; nTotal: number; cg: number; nCg: number; go: number; nGo: number; rec: number; nRec: number; rc: number; nRc: number };
    const sums: Record<string, Acc> = {};
    const blank = (): Acc => ({ total: 0, nTotal: 0, cg: 0, nCg: 0, go: 0, nGo: 0, rec: 0, nRec: 0, rc: 0, nRc: 0 });
    matrixData.rows.forEach((row) => {
      const ev = row.events;
      const times = actions
        .map((action) => ev[action])
        .filter((d): d is string => !!d)
        .map((d) => new Date(d).getTime())
        .filter((t) => !Number.isNaN(t));
      if (times.length < 2) return; // necesita al menos inicio y fin
      const start = Math.min(...times);
      const d = new Date(start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!sums[key]) sums[key] = blank();
      const acc = sums[key];
      // Proceso total: primera → última acción.
      const totalDiff = Math.max(...times) - start;
      if (totalDiff > 0) { acc.total += totalDiff; acc.nTotal += 1; }
      // Fase Creación → Gerencia.
      const creacion = tsOf('crear_requisicion', ev);
      const gerencia = tsOf('aprobar_gerencia', ev);
      const oc = tsOf('aprobar_todas_ordenes_compra', ev);
      const recepcion = tsOf('registrar_recepcion', ev);
      const facturaContab = tsOf('factura_contabilidad', ev);
      if (!Number.isNaN(creacion) && !Number.isNaN(gerencia) && gerencia > creacion) { acc.cg += gerencia - creacion; acc.nCg += 1; }
      if (!Number.isNaN(gerencia) && !Number.isNaN(oc) && oc > gerencia) { acc.go += oc - gerencia; acc.nGo += 1; }
      if (!Number.isNaN(oc) && !Number.isNaN(recepcion) && recepcion > oc) { acc.rec += recepcion - oc; acc.nRec += 1; }
      // Fase Aprobar OC → Factura enviada a contabilidad.
      if (!Number.isNaN(oc) && !Number.isNaN(facturaContab) && facturaContab > oc) { acc.rc += facturaContab - oc; acc.nRc += 1; }
    });
    return Object.entries(sums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => {
        const [year, month] = key.split('-');
        return {
          mes: `${MONTH_ES[Number(month) - 1]} ${year}`,
          dias: round1(v.total, v.nTotal),
          cg: round1(v.cg, v.nCg),
          go: round1(v.go, v.nGo),
          rec: round1(v.rec, v.nRec),
          rc: round1(v.rc, v.nRc),
          n: v.nTotal,
          nCg: v.nCg,
          nGo: v.nGo,
          nRec: v.nRec,
          nRc: v.nRc,
        };
      });
  }, [matrixData]);

  // Materiales más pedidos (Top 20) por dinero (valor en órdenes de compra), mayor a menor.
  const topMaterialsData = useMemo(() => {
    if (!matrixData?.topMaterials) return [];
    return matrixData.topMaterials
      .slice(0, 20)
      .map((m) => ({
        label: m.description || m.code || '—',
        code: m.code,
        reqCount: m.reqCount,
        totalQuantity: Math.round(m.totalQuantity * 10) / 10,
        totalAmount: Math.round(m.totalAmount),
      }));
  }, [matrixData]);

  // Materiales más pedidos por mes: pivota el Top 6 de materiales en series por mes.
  const materialsByMonthData = useMemo(() => {
    const rows = matrixData?.topMaterialsByMonth;
    if (!rows || rows.length === 0) return { data: [] as any[], series: [] as { key: string; label: string; color: string }[] };
    const MONTH_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const PALETTE = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#14b8a6', '#ef4444', '#6366f1', '#ec4899', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#84cc16', '#e11d48'];
    // Top 15 materiales por valor total en órdenes de compra.
    const totals = new Map<string, { label: string; total: number }>();
    rows.forEach((r) => {
      const label = r.description || r.code || '—';
      const cur = totals.get(label) || { label, total: 0 };
      cur.total += r.totalAmount;
      totals.set(label, cur);
    });
    const topLabels = Array.from(totals.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
      .map((t) => t.label);
    const series = topLabels.map((label, i) => ({ key: label, label, color: PALETTE[i % PALETTE.length] }));
    const topSet = new Set(topLabels);
    // Acumula por mes solo los materiales del Top (valor en OC).
    const byMonth = new Map<string, any>();
    rows.forEach((r) => {
      const label = r.description || r.code || '—';
      if (!topSet.has(label)) return;
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
      if (!byMonth.has(key)) {
        const base: any = { key, mes: `${MONTH_ES[r.month - 1]} ${r.year}` };
        topLabels.forEach((l) => { base[l] = 0; });
        byMonth.set(key, base);
      }
      byMonth.get(key)[label] += Math.round(r.totalAmount);
    });
    const data = Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
    return { data, series };
  }, [matrixData]);

  const handleMatrixSearch = () => {
    const filters = { search: matrixSearch, from: matrixFromDate, to: matrixToDate, company: matrixCompany };
    setMatrixApplied(filters);
    loadMatrix(filters);
  };

  const handleMatrixClear = () => {
    setMatrixSearch('');
    setMatrixFromDate('2026-01-10');
    setMatrixToDate('');
    setMatrixCompany('');
    setMatrixStateFilter('');
    const filters = { search: '', from: '2026-01-10', to: '', company: '' };
    setMatrixApplied(filters);
    loadMatrix(filters);
  };

  const getActionLabel = (action: string) => ACTION_LABELS[action] || action;
  const getActionColor = (action: string) => ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';

  const handleViewDetail = (requisitionId: number) => {
    navigate(`/dashboard/auditorias/compras/detalle/${requisitionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/auditorias')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Auditorías"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Auditorías - Compras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Registro de Actividades del Módulo de Compras
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
              Auditorías - Compras
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start bg-[hsl(var(--canalco-primary))]/10"
                onClick={() => setSidebarOpen(false)}
              >
                Registros
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/auditorias');
                  setSidebarOpen(false);
                }}
              >
                Volver a Gestiones
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          <Button
            variant={activeTab === 'registros' ? 'default' : 'outline'}
            onClick={() => setActiveTab('registros')}
            className={activeTab === 'registros' ? 'bg-[hsl(var(--canalco-primary))] text-white' : ''}
          >
            <LayoutList className="w-4 h-4 mr-2" />
            Registros
          </Button>
          <Button
            variant={activeTab === 'matriz' ? 'default' : 'outline'}
            onClick={() => setActiveTab('matriz')}
            className={activeTab === 'matriz' ? 'bg-[hsl(var(--canalco-primary))] text-white' : ''}
          >
            <Grid3x3 className="w-4 h-4 mr-2" />
            Matriz de Estados
          </Button>
          <Button
            variant={activeTab === 'graficos' ? 'default' : 'outline'}
            onClick={() => setActiveTab('graficos')}
            className={activeTab === 'graficos' ? 'bg-[hsl(var(--canalco-primary))] text-white' : ''}
          >
            <BarChart2 className="w-4 h-4 mr-2" />
            Gráficos
          </Button>
        </div>

        {/* ── REGISTROS TAB ── */}
        {activeTab === 'registros' && <>

        {/* Info Message */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Aquí puedes consultar todos los registros de actividad del módulo de compras. Haz clic en "Ver detalle" para información completa. La información es de solo lectura.
          </p>
        </div>

        {/* Filter Panel */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="w-4 h-4 text-[hsl(var(--canalco-neutral-600))] flex-shrink-0" />
            <Input
              placeholder="N° Requisición"
              value={filterForm.requisitionNumber}
              onChange={(e) => setFilterForm(f => ({ ...f, requisitionNumber: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm w-36"
            />
            <Input
              placeholder="Empresa / Proyecto"
              value={filterForm.companyName}
              onChange={(e) => setFilterForm(f => ({ ...f, companyName: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm flex-1 min-w-36"
            />
            <Input
              placeholder="Usuario"
              value={filterForm.userName}
              onChange={(e) => setFilterForm(f => ({ ...f, userName: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm w-40"
            />
            <Select
              value={filterForm.action}
              onValueChange={(val) => setFilterForm(f => ({ ...f, action: val === '_all' ? '' : val }))}
            >
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue placeholder="Estado / Acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterForm.fromDate}
              onChange={(e) => setFilterForm(f => ({ ...f, fromDate: e.target.value }))}
              className="h-9 text-sm w-36"
            />
            <Input
              type="date"
              value={filterForm.toDate}
              onChange={(e) => setFilterForm(f => ({ ...f, toDate: e.target.value }))}
              className="h-9 text-sm w-36"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white h-9 px-5 flex-shrink-0"
            >
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={loading}
                className="h-9 px-3 text-[hsl(var(--canalco-neutral-700))] flex-shrink-0"
                title="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            {activeFilterCount > 0 && (
              <Badge className="bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] border-[hsl(var(--canalco-primary))]/20 text-xs flex-shrink-0">
                {activeFilterCount} activo{activeFilterCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                    <TableHead className="font-semibold">N° Requisición</TableHead>
                    <TableHead className="font-semibold">Empresa/Proyecto</TableHead>
                    <TableHead className="font-semibold">Acciones Registradas</TableHead>
                    <TableHead className="font-semibold">Última Acción</TableHead>
                    <TableHead className="font-semibold">Fecha Última Acción</TableHead>
                    <TableHead className="font-semibold">Usuario</TableHead>
                    <TableHead className="font-semibold text-center">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedRequisitions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-[hsl(var(--canalco-neutral-600))]">
                        {activeFilterCount > 0
                          ? 'No se encontraron registros con los filtros aplicados.'
                          : 'No hay registros de auditoría disponibles.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedRequisitions.map((requisition) => (
                      <TableRow
                        key={requisition.requisitionId}
                        className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors"
                      >
                        <TableCell className="font-medium">{requisition.requisitionNumber}</TableCell>
                        <TableCell>{requisition.companyName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                            {requisition.actionCount} {requisition.actionCount === 1 ? 'acción' : 'acciones'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${getActionColor(requisition.lastAction)} border`}
                          >
                            {getActionLabel(requisition.lastAction)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatDateShort(requisition.lastActionDate)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{requisition.lastUser}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetail(requisition.requisitionId)}
                              className="hover:bg-blue-50 text-blue-600"
                              title="Ver detalle completo"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver detalle
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="border-t border-[hsl(var(--canalco-neutral-300))] p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                {activeFilterCount > 0
                  ? `${groupedRequisitions.length} ${groupedRequisitions.length === 1 ? 'requisición encontrada' : 'requisiciones encontradas'} (${total} ${total === 1 ? 'registro' : 'registros'})`
                  : `${groupedRequisitions.length} ${groupedRequisitions.length === 1 ? 'requisición' : 'requisiciones'} (${total} ${total === 1 ? 'registro' : 'registros'} en total)`
                }
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        </>}

        {/* ── MATRIZ TAB ── */}
        {activeTab === 'matriz' && (
          <div>
            {/* Summary counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Requisiciones en vista', value: matrixData?.rows.length ?? '—', color: 'border-[hsl(var(--canalco-primary))] bg-orange-50 text-orange-800' },
                { label: 'Actividad últ. 7 días', value: auditStats?.recentLogs ?? '—', color: 'border-orange-400 bg-orange-50 text-orange-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-lg border-l-4 p-3 ${color}`}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="mb-4 bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 text-[hsl(var(--canalco-neutral-600))] flex-shrink-0" />
                <Input
                  placeholder="N° Requisición"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMatrixSearch()}
                  className="h-9 text-sm w-36"
                />
                <Input
                  placeholder="Empresa / Proyecto"
                  value={matrixCompany}
                  onChange={(e) => setMatrixCompany(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMatrixSearch()}
                  className="h-9 text-sm w-44"
                />
                <Select
                  value={matrixStateFilter}
                  onValueChange={(val) => setMatrixStateFilter(val === '_all' ? '' : val)}
                >
                  <SelectTrigger className="h-9 text-sm w-44">
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos los estados</SelectItem>
                    {(matrixData?.actions ?? []).map((action) => (
                      <SelectItem key={action} value={action}>
                        {MATRIX_ACTION_LABELS[action] || action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={matrixFromDate}
                  onChange={(e) => setMatrixFromDate(e.target.value)}
                  className="h-9 text-sm w-36"
                />
                <Input
                  type="date"
                  value={matrixToDate}
                  onChange={(e) => setMatrixToDate(e.target.value)}
                  className="h-9 text-sm w-36"
                />
                <Button
                  onClick={handleMatrixSearch}
                  disabled={matrixLoading}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white h-9 px-5"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Buscar
                </Button>
                {(matrixApplied.search || matrixApplied.from || matrixApplied.to || matrixApplied.company || matrixStateFilter) && (
                  <Button variant="outline" onClick={handleMatrixClear} disabled={matrixLoading} className="h-9 px-3" title="Limpiar filtros">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Loading */}
            {matrixLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
              </div>
            )}

            {/* Matrix table */}
            {!matrixLoading && matrixData && (() => {
              const visibleRows = matrixStateFilter
                ? matrixData.rows.filter((r) => !!r.events[matrixStateFilter])
                : matrixData.rows;
              return (
              <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                    <thead>
                      <tr className="bg-[hsl(var(--canalco-primary))] text-white">
                        <th
                          style={{ left: 0, minWidth: 120 }}
                          className="sticky z-20 bg-[hsl(var(--canalco-primary))] px-3 py-2 text-left font-semibold border-r border-white/20"
                        >
                          N° Requisición
                        </th>
                        <th
                          style={{ left: 120, minWidth: 140 }}
                          className="sticky z-20 bg-[hsl(var(--canalco-primary))] px-3 py-2 text-left font-semibold border-r border-white/20"
                        >
                          Empresa
                        </th>
                        {matrixData.actions.map((action) => (
                          <th
                            key={action}
                            className="px-2 py-2 text-center font-semibold border-r border-white/20 whitespace-nowrap"
                            style={{ minWidth: 130 }}
                          >
                            {MATRIX_ACTION_LABELS[action] || action}
                          </th>
                        ))}
                        <th
                          className="px-3 py-2 text-center font-semibold border-r border-white/20 whitespace-nowrap"
                          style={{ minWidth: 140 }}
                        >
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIdx) => {
                        const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]';
                        return (
                          <tr
                            key={row.requisitionId}
                            className={`group border-b border-[hsl(var(--canalco-neutral-200))] cursor-pointer hover:bg-blue-50 ${rowBg}`}
                            onClick={() => navigate(`/dashboard/auditorias/compras/detalle/${row.requisitionId}`)}
                          >
                            <td
                              style={{ left: 0, minWidth: 120 }}
                              className={`sticky z-10 px-3 py-1.5 font-medium text-[hsl(var(--canalco-primary))] border-r border-[hsl(var(--canalco-neutral-200))] group-hover:bg-blue-50 ${rowBg}`}
                            >
                              {row.requisitionNumber}
                            </td>
                            <td
                              style={{ left: 120, minWidth: 140 }}
                              className={`sticky z-10 px-3 py-1.5 text-[hsl(var(--canalco-neutral-700))] border-r border-[hsl(var(--canalco-neutral-200))] group-hover:bg-blue-50 truncate max-w-[140px] ${rowBg}`}
                            >
                              {row.companyName}
                            </td>
                            {matrixData.actions.map((action, actionIdx) => {
                              const date = row.events[action];
                              const elapsed = date
                                ? getElapsedFromPrev(row.events, matrixData.actions, actionIdx)
                                : null;
                              const colorClass = MATRIX_ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';
                              return (
                                <td
                                  key={action}
                                  className="px-2 py-1.5 text-center border-r border-[hsl(var(--canalco-neutral-100))]"
                                  style={{ minWidth: 130 }}
                                >
                                  {date ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`inline-block rounded px-1.5 py-0.5 font-medium text-[11px] ${colorClass}`}>
                                        {formatMatrixDate(date)}
                                      </span>
                                      {elapsed && (
                                        <span className="text-[10px] text-[hsl(var(--canalco-neutral-500))]">
                                          ▲ {elapsed}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[hsl(var(--canalco-neutral-300))]">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td
                              className="px-2 py-2 text-center border-r border-[hsl(var(--canalco-neutral-100))]"
                              style={{ minWidth: 180 }}
                            >
                              {row.currentStatus ? (
                                <span
                                  className="inline-block rounded px-2 py-1 font-medium text-[11px] text-white leading-tight"
                                  style={{ backgroundColor: row.currentStatus.color || '#6b7280', maxWidth: 170, wordBreak: 'break-word' }}
                                >
                                  {row.currentStatus.name}
                                </span>
                              ) : (
                                <span className="text-[hsl(var(--canalco-neutral-300))]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 text-sm text-[hsl(var(--canalco-neutral-600))] flex items-center justify-between">
                  <span>
                    {visibleRows.length}{matrixStateFilter && visibleRows.length !== matrixData.rows.length ? ` de ${matrixData.rows.length}` : ''} requisiciones · {matrixData.actions.length} estados visibles
                    {matrixStateFilter && <span className="ml-2 text-[hsl(var(--canalco-primary))] font-medium">· con {MATRIX_ACTION_LABELS[matrixStateFilter] || matrixStateFilter}</span>}
                  </span>
                  <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">▲ = tiempo desde estado anterior · Clic en fila para ver detalle</span>
                </div>
              </div>
              );
            })()}
          </div>
        )}

        {/* ── GRÁFICOS TAB ── */}
        {activeTab === 'graficos' && (
          <div>
            {matrixLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
              </div>
            )}

            {!matrixLoading && (
              <>
                {/* Filtros: empresa + material */}
                <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-4 mb-6 flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">Empresa</label>
                    <input
                      type="text"
                      value={graphCompany}
                      onChange={(e) => setGraphCompany(e.target.value)}
                      placeholder="Todas"
                      className="h-9 w-56 rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">Material</label>
                    <input
                      type="text"
                      value={graphMaterial}
                      onChange={(e) => setGraphMaterial(e.target.value)}
                      placeholder="Código o descripción"
                      className="h-9 w-56 rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">Desde</label>
                    <input
                      type="date"
                      value={graphFrom}
                      onChange={(e) => setGraphFrom(e.target.value)}
                      className="h-9 w-40 rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">Hasta</label>
                    <input
                      type="date"
                      value={graphTo}
                      onChange={(e) => setGraphTo(e.target.value)}
                      className="h-9 w-40 rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMatrix({ search: '', from: graphFrom, to: graphTo, company: graphCompany, material: graphMaterial, requester: graphRequester })}
                    className="h-9 px-4 rounded-md bg-[hsl(var(--canalco-primary))] text-white text-sm font-semibold hover:opacity-90"
                  >
                    Aplicar
                  </button>
                  {(graphCompany || graphMaterial || graphRequester || graphFrom !== '2026-01-10' || graphTo) && (
                    <button
                      type="button"
                      onClick={() => { setGraphCompany(''); setGraphMaterial(''); setGraphRequester(''); setGraphFrom('2026-01-10'); setGraphTo(''); loadMatrix({ search: '', from: '2026-01-10', to: '', company: '', material: '', requester: '' }); }}
                      className="h-9 px-4 rounded-md border border-[hsl(var(--canalco-neutral-300))] text-sm font-medium text-[hsl(var(--canalco-neutral-600))] hover:bg-[hsl(var(--canalco-neutral-50))]"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Stat cards */}
                {(() => {
                  const cotizaciones = matrixData?.rows.filter((r) => r.events['gestionar_cotizacion']).length ?? 0;
                  const ordenesCompra = matrixData?.totalPurchaseOrders ?? 0;
                  const anuladas = matrixData?.totalVoidedRequisitions ?? 0;
                  const cards = [
                    {
                      label: 'N° Requisiciones',
                      value: matrixData?.rows.length ?? '—',
                      sub: 'en el período mostrado',
                      color: 'border-blue-400 bg-blue-50 text-blue-800',
                    },
                    {
                      label: 'N° Cotizaciones',
                      value: cotizaciones,
                      sub: 'en el período mostrado',
                      color: 'border-purple-400 bg-purple-50 text-purple-800',
                    },
                    {
                      label: 'N° Órdenes de Compra',
                      value: ordenesCompra,
                      sub: 'en el período mostrado',
                      color: 'border-indigo-400 bg-indigo-50 text-indigo-800',
                    },
                    {
                      label: 'N° Requisiciones Anuladas',
                      value: anuladas,
                      sub: 'en el período mostrado',
                      color: 'border-slate-400 bg-slate-50 text-slate-800',
                    },
                  ];
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      {cards.map(({ label, value, sub, color }) => (
                        <div key={label} className={`rounded-lg border-l-4 p-4 ${color}`}>
                          <p className="text-3xl font-bold">{value}</p>
                          <p className="text-sm font-medium mt-0.5">{label}</p>
                          <p className="text-xs opacity-60 mt-0.5">{sub}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Bar chart */}
                <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">
                    Actividad por mes
                  </h3>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-6">
                    Basado en los datos cargados en la matriz · desde 10/01/2026
                  </p>

                  {monthlyChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[hsl(var(--canalco-neutral-500))] text-sm">
                      No hay datos suficientes para mostrar el gráfico.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={monthlyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          cursor={{ fill: '#f9fafb' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Bar dataKey="requisiciones" name="Requisiciones" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cotizaciones" name="Cotizaciones" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="ordenesCompra" name="Órdenes de Compra" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="anuladas" name="Req. anuladas" fill="#64748b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Órdenes de compra y facturación (en pesos) */}
                <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mt-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">
                    Órdenes de compra y facturación por mes
                  </h3>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-6">
                    Valor en pesos de las órdenes de compra emitidas y de la facturación recibida.
                  </p>
                  {monthlyChartData.every((m) => !m.ocValor && !m.facturacionValor) ? (
                    <div className="flex items-center justify-center h-48 text-[hsl(var(--canalco-neutral-500))] text-sm">
                      No hay datos de OC ni facturación para mostrar.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={monthlyChartData} margin={{ top: 16, right: 12, left: 12, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`)}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          cursor={{ fill: '#f9fafb' }}
                          formatter={(v: number, name) => [`$${Number(v).toLocaleString('es-CO')}`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Bar dataKey="ocValor" name="Órdenes de Compra $" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar dataKey="facturacionValor" name="Facturación $" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Promedio por mes */}
                <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mt-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">
                    Tiempo promedio de proceso por mes
                  </h3>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-6">
                    Días promedio por mes: proceso total (primera → última acción) y por fase del flujo.
                  </p>
                  {stateAvgData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[hsl(var(--canalco-neutral-500))] text-sm">
                      No hay datos suficientes para mostrar el gráfico.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={360}>
                      <BarChart data={stateAvgData} margin={{ top: 16, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}d`}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          cursor={{ fill: '#f9fafb' }}
                          formatter={(v: number, name: any, item: any) => {
                            const nMap: Record<string, string> = { dias: 'n', cg: 'nCg', go: 'nGo', rec: 'nRec', rc: 'nRc' };
                            const count = item?.payload?.[nMap[item?.dataKey]] ?? 0;
                            return [`${v} días (${count})`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="dias" name="Proceso total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="dias" position="top" formatter={(v: number) => (v ? `${v}d` : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#4f46e5' }} />
                        </Bar>
                        <Bar dataKey="cg" name="Creación → Gerencia" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="cg" position="top" formatter={(v: number) => (v ? `${v}d` : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#0369a1' }} />
                        </Bar>
                        <Bar dataKey="go" name="Gerencia → Aprobar OC" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="go" position="top" formatter={(v: number) => (v ? `${v}d` : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#b45309' }} />
                        </Bar>
                        <Bar dataKey="rec" name="Recepción (OC → recepción)" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="rec" position="top" formatter={(v: number) => (v ? `${v}d` : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#0f766e' }} />
                        </Bar>
                        <Bar dataKey="rc" name="Aprobar OC → Factura a contabilidad" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={36}>
                          <LabelList dataKey="rc" position="top" formatter={(v: number) => (v ? `${v}d` : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#be185d' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Materiales más pedidos */}
                <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mt-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">
                    Materiales más pedidos
                  </h3>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-4">
                    Top 20 materiales por valor en órdenes de compra.
                  </p>
                  {/* Filtro por persona — aplica solo a este gráfico (recarga silenciosa) */}
                  <div className="flex flex-wrap items-end gap-2 mb-6">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">Persona (solicitante)</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={graphRequester}
                          onChange={(e) => {
                            const value = e.target.value;
                            setGraphRequester(value);
                            applyRequester(value);
                          }}
                          className="h-9 w-64 rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
                        >
                          <option value="">Todas las personas</option>
                          {systemUsers.map((u) => (
                            <option key={u.userId} value={u.nombre}>{u.nombre}</option>
                          ))}
                        </select>
                        {requesterLoading && (
                          <div className="animate-spin w-4 h-4 border-2 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
                        )}
                      </div>
                    </div>
                  </div>
                  {topMaterialsData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[hsl(var(--canalco-neutral-500))] text-sm">
                      No hay datos suficientes para mostrar el gráfico.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={420}>
                      <BarChart data={topMaterialsData} margin={{ top: 24, right: 20, left: 8, bottom: 96 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          interval={0}
                          angle={-45}
                          textAnchor="end"
                          height={96}
                          tick={{ fontSize: 10, fill: '#374151' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => `$${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          cursor={{ fill: '#f9fafb' }}
                          formatter={(v: number, _n, item: any) => [`$${Number(v).toLocaleString('es-CO')} (${item?.payload?.reqCount ?? 0} req.)`, item?.payload?.code || 'Material']}
                          labelFormatter={(label: string) => label}
                        />
                        <Bar dataKey="totalAmount" name="Valor en OC" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Materiales más pedidos por mes */}
                <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mt-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">
                    Materiales más pedidos por mes
                  </h3>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-6">
                    Valor en órdenes de compra por material (Top 15), por mes de creación.
                  </p>
                  {materialsByMonthData.data.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[hsl(var(--canalco-neutral-500))] text-sm">
                      No hay datos suficientes para mostrar el gráfico.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={360}>
                      <BarChart data={materialsByMonthData.data} margin={{ top: 16, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => `$${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`}
                        />
                        <Tooltip
                          cursor={{ fill: '#f9fafb' }}
                          content={({ active, payload, label }: any) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const all = payload
                              .filter((p: any) => Number(p.value) > 0)
                              .sort((a: any, b: any) => Number(b.value) - Number(a.value));
                            if (all.length === 0) return null;
                            const total = all.reduce((s: number, p: any) => s + Number(p.value), 0);
                            const MAX = 12;
                            const items = all.slice(0, MAX);
                            const restCount = all.length - items.length;
                            const restValue = all.slice(MAX).reduce((s: number, p: any) => s + Number(p.value), 0);
                            return (
                              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 12, width: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                                {items.map((p: any) => (
                                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                    </span>
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>${Number(p.value).toLocaleString('es-CO')}</span>
                                  </div>
                                ))}
                                {restCount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', color: '#6b7280' }}>
                                    <span>+{restCount} más</span>
                                    <span style={{ whiteSpace: 'nowrap' }}>${restValue.toLocaleString('es-CO')}</span>
                                  </div>
                                )}
                                <div style={{ borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                  <span>Total</span>
                                  <span>${total.toLocaleString('es-CO')}</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, maxHeight: 72, overflowY: 'auto' }} />
                        {materialsByMonthData.series.map((s) => (
                          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="mat" fill={s.color} maxBarSize={48} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
