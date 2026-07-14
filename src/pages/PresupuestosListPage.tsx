import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Home, ArrowLeft, Plus, FileText, Pencil, Clock, CheckCircle, XCircle, Eye } from 'lucide-react';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import {
  directorBudgetsService,
  type DirectorBudget,
} from '@/services/director-budgets.service';
import { surveysService, type PendingBudgetActa } from '@/services/surveys.service';

const fmt = (value: number | null): string => {
  if (value == null || value === 0) return '-';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const getMunicipality = (companyName: string | null | undefined): string => {
  if (!companyName) return '-';
  return companyName.replace(/^Uni[oó]n Temporal Alumbrado P[uú]blico\s+/i, '').trim() || companyName;
};

export default function PresupuestosListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = useGranularPermissions();
  const isAnalistaPMO = user?.nombreRol === 'Analista PMO';
  const canEditBudget = hasPermission('levantamientos:crear') || isAnalistaPMO;
  const isGerencia = hasPermission('levantamientos:aprobar') || isAnalistaPMO;
  // Solo la Directora Financiera (o Analista PMO) revisa el presupuesto del ACTA.
  const canReviewActaBudget = user?.nombreRol === 'Director Financiero y Administrativo' || isAnalistaPMO;
  const { access, loading: accessLoading } = useSurveyAccess();
  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const [activeTab, setActiveTab] = useState('');
  const [viewMode, setViewMode] = useState<'todos' | 'aprobados'>('todos');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [budgets, setBudgets] = useState<DirectorBudget[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingBudgets, setPendingBudgets] = useState<DirectorBudget[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [allBudgets, setAllBudgets] = useState<DirectorBudget[]>([]);
  const [allBudgetsLoading, setAllBudgetsLoading] = useState(false);

  // Bandeja de actas con presupuesto en revisión (Directora Financiera)
  const [pendingActas, setPendingActas] = useState<PendingBudgetActa[]>([]);
  const [pendingActasLoading, setPendingActasLoading] = useState(false);
  const [reviewingActa, setReviewingActa] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ companyId: number; projectId: number | null; actaNumber: string } | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');

  const actaKey = (companyId: number, projectId: number | null, actaNumber: string) =>
    `${companyId}:${projectId ?? 0}:${actaNumber}`;

  const loadPendingActas = async () => {
    try {
      setPendingActasLoading(true);
      setPendingActas(await surveysService.getActasPendingBudget());
    } catch {
      setPendingActas([]);
    } finally {
      setPendingActasLoading(false);
    }
  };

  useEffect(() => {
    if (accessLoading || !canReviewActaBudget) return;
    loadPendingActas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, canReviewActaBudget]);

  const handleApproveActaBudget = async (companyId: number, projectId: number | null, actaNumber: string) => {
    const key = actaKey(companyId, projectId, actaNumber);
    try {
      setReviewingActa(key);
      await surveysService.reviewActaBudget(companyId, projectId, actaNumber, 'aprobado');
      setPendingActas((prev) => prev.filter((a) => actaKey(a.companyId, a.projectId, a.actaNumber) !== key));
      toast.success('Presupuesto del acta aprobado. Se notificó al Director Técnico.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al aprobar el presupuesto del acta');
    } finally {
      setReviewingActa(null);
    }
  };

  const handleRejectActaBudget = async () => {
    if (!rejectDialog) return;
    const { companyId, projectId, actaNumber } = rejectDialog;
    const key = actaKey(companyId, projectId, actaNumber);
    try {
      setReviewingActa(key);
      await surveysService.reviewActaBudget(companyId, projectId, actaNumber, 'rechazado', rejectMotivo.trim());
      setPendingActas((prev) => prev.filter((a) => actaKey(a.companyId, a.projectId, a.actaNumber) !== key));
      toast.success('Presupuesto del acta rechazado. Se notificó al Director Técnico.');
      setRejectDialog(null);
      setRejectMotivo('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al rechazar el presupuesto del acta');
    } finally {
      setReviewingActa(null);
    }
  };

  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  useEffect(() => {
    setSelectedCompanyId(null);
  }, [activeTab]);

  // Para usuarios sin departamentos asignados (ej. Director Financiero): cargar todos los presupuestos
  useEffect(() => {
    if (accessLoading || departments.length > 0) return;
    if (!hasPermission('levantamientos:autorizar') && !hasPermission('levantamientos:aprobar') && !hasPermission('levantamientos:presupuesto') && !hasPermission('levantamientos:ver')) return;
    const load = async () => {
      try {
        setAllBudgetsLoading(true);
        const res = await directorBudgetsService.getAll({ limit: 500 });
        setAllBudgets(res.data);
      } catch {
        setAllBudgets([]);
      } finally {
        setAllBudgetsLoading(false);
      }
    };
    load();
  }, [accessLoading, departments.length, hasPermission]);

  const activeDept = useMemo(
    () => departments.find((d) => d.name === activeTab),
    [departments, activeTab],
  );

  useEffect(() => {
    if (departments.length === 0) return;
    const load = async () => {
      try {
        setPendingLoading(true);
        const results = await Promise.all(
          departments.map((d) =>
            directorBudgetsService.getAll({
              companyId: d.companyIds.join(','),
              departmentName: d.name,
              status: 'en_revision',
              limit: 200,
            }),
          ),
        );
        const all = results.flatMap((r) => r.data);
        const unique = Array.from(new Map(all.map((b) => [b.budgetId, b])).values());
        setPendingBudgets(unique);
      } catch {
        setPendingBudgets([]);
      } finally {
        setPendingLoading(false);
      }
    };
    load();
  }, [departments]);

  useEffect(() => {
    if (!activeDept) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await directorBudgetsService.getAll({
          companyId: activeDept.companyIds.join(','),
          departmentName: activeDept.name,
          limit: 200,
        });
        setBudgets(res.data);
      } catch {
        setBudgets([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeDept]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-full px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl shadow-md p-2 w-12 h-12 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img src="/assets/images/logo-canalco.png" alt="Canalco" className="w-full h-full object-contain" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/levantamiento-obras')} title="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">
                Presupuestos Director de Proyectos
              </h1>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--canalco-neutral-300))]">
              <button
                onClick={() => setViewMode('todos')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'todos'
                    ? 'bg-[hsl(var(--canalco-primary))] text-white'
                    : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setViewMode('aprobados')}
                className={`px-3 py-1.5 text-sm font-medium border-l border-[hsl(var(--canalco-neutral-300))] transition-colors ${
                  viewMode === 'aprobados'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                }`}
              >
                Aprobados
              </button>
            </div>
            {canEditBudget && (
              <Button
                size="sm"
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
                onClick={() => navigate('/dashboard/levantamiento-obras/presupuesto')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Presupuesto
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Actas pendientes de presupuesto — Directora Financiera */}
        {canReviewActaBudget && !accessLoading && (
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-purple-100 border-b border-purple-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-purple-800 text-sm">Actas pendientes de presupuesto</span>
              {!pendingActasLoading && pendingActas.length > 0 && (
                <Badge className="ml-1 bg-purple-500 text-white hover:bg-purple-500 text-xs">
                  {pendingActas.length}
                </Badge>
              )}
            </div>
            {pendingActasLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
              </div>
            ) : pendingActas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-purple-600 italic">Sin actas pendientes de presupuesto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-purple-200">
                    <th className="px-4 py-2 text-left font-medium text-purple-700">N° Acta</th>
                    <th className="px-4 py-2 text-left font-medium text-purple-700">Municipio / Empresa</th>
                    <th className="px-4 py-2 text-center font-medium text-purple-700">Obras</th>
                    <th className="px-4 py-2 text-center font-medium text-purple-700">Última edición</th>
                    <th className="px-4 py-2 text-right font-medium text-purple-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingActas.map((a) => {
                    const key = actaKey(a.companyId, a.projectId, a.actaNumber);
                    const busy = reviewingActa === key;
                    return (
                      <tr key={key} className="border-b border-purple-100 hover:bg-purple-100/50 transition-colors">
                        <td className="px-4 py-2 font-mono font-semibold text-purple-900">{a.actaNumber}</td>
                        <td className="px-4 py-2 text-purple-700">{getMunicipality(a.companyName)}</td>
                        <td className="px-4 py-2 text-center text-purple-700">{a.worksCount}</td>
                        <td className="px-4 py-2 text-center text-xs text-purple-600">{fmtDate(a.updatedAt)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
                              onClick={() =>
                                navigate(
                                  `/dashboard/levantamiento-obras/acta/${encodeURIComponent(a.actaNumber)}?company=${a.companyId}`,
                                )
                              }
                              title="Ver detalle del acta"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Ver detalle
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleApproveActaBudget(a.companyId, a.projectId, a.actaNumber)}
                              disabled={busy}
                            >
                              {busy
                                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />
                                : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-50"
                              onClick={() => { setRejectDialog({ companyId: a.companyId, projectId: a.projectId, actaNumber: a.actaNumber }); setRejectMotivo(''); }}
                              disabled={busy}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Rechazar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {accessLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
          </div>
        ) : departments.length === 0 ? (
          allBudgetsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden shadow-sm">
              {allBudgets.length === 0 ? (
                <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay presupuestos registrados.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Obra</th>
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Municipio</th>
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Departamento</th>
                      <th className="px-4 py-3 text-right font-semibold text-[hsl(var(--canalco-neutral-700))]">Total Obra</th>
                      <th className="px-4 py-3 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado</th>
                      <th className="px-4 py-3 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Última edición</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {allBudgets
                      .filter((b) => viewMode === 'aprobados' ? b.status === 'final' : b.status !== 'final')
                      .map((b) => (
                        <tr key={b.budgetId} className="border-b border-[hsl(var(--canalco-neutral-100))] hover:bg-[hsl(var(--canalco-neutral-50))] transition-colors">
                          <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-500))]">{b.budgetId}</td>
                          <td className="px-4 py-2 font-medium">{b.workName || b.work?.name || <span className="italic text-[hsl(var(--canalco-neutral-400))]">Sin obra</span>}</td>
                          <td className="px-4 py-2">{getMunicipality(b.companyName ?? b.work?.company?.name)}</td>
                          <td className="px-4 py-2">{b.departmentName ?? '-'}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt((b.manoDeObra ?? 0) + (b.materialesInventario ?? 0) + (b.valorFacturado ?? 0) + (b.otrosCostos ?? 0) + (b.leg ?? 0))}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${b.status === 'final' ? 'bg-green-100 text-green-700' : b.status === 'en_revision' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {b.status === 'final' ? 'Aprobado' : b.status === 'en_revision' ? 'En revisión' : 'Borrador'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center text-xs text-[hsl(var(--canalco-neutral-500))]">{fmtDate(b.updatedAt)}</td>
                          <td className="px-4 py-2 text-center">
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/levantamiento-obras/presupuesto/${b.budgetId}`)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div className="w-56">
                <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Departamento</label>
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {activeDept && activeDept.companies.length > 1 && (
                <div className="w-56">
                  <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                  <Select
                    value={selectedCompanyId === null ? 'all' : String(selectedCompanyId)}
                    onValueChange={(val) => setSelectedCompanyId(val === 'all' ? null : Number(val))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Municipio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los municipios</SelectItem>
                      {activeDept.companies.map((c) => (
                        <SelectItem key={c.companyId} value={String(c.companyId)}>
                          {getMunicipioName(c.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Pendiente por Autorización — Gerencia y Analista PMO */}
            {(isGerencia || isAnalistaPMO) && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold text-amber-800 text-sm">Pendiente por Autorización</span>
                  {!pendingLoading && pendingBudgets.length > 0 && (
                    <Badge className="ml-1 bg-amber-500 text-white hover:bg-amber-500 text-xs">
                      {pendingBudgets.length}
                    </Badge>
                  )}
                </div>
                {pendingLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : pendingBudgets.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-amber-600 italic">Sin presupuestos pendientes de autorización.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-amber-200">
                        <th className="px-4 py-2 text-left font-medium text-amber-700">#</th>
                        <th className="px-4 py-2 text-left font-medium text-amber-700">Obra</th>
                        <th className="px-4 py-2 text-left font-medium text-amber-700">Municipio</th>
                        <th className="px-4 py-2 text-left font-medium text-amber-700">Departamento</th>
                        <th className="px-4 py-2 text-center font-medium text-amber-700">Última edición</th>
                        <th className="px-4 py-2 w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBudgets.map((b) => (
                        <tr
                          key={b.budgetId}
                          className="border-b border-amber-100 hover:bg-amber-100/60 transition-colors"
                        >
                          <td className="px-4 py-2 text-amber-600">{b.budgetId}</td>
                          <td className="px-4 py-2 font-medium text-amber-900">
                            {b.workName || b.work?.name || <span className="italic text-amber-400">Sin obra</span>}
                          </td>
                          <td className="px-4 py-2 text-amber-700">
                            {getMunicipality(b.companyName ?? b.work?.company?.name)}
                          </td>
                          <td className="px-4 py-2 text-amber-700">{b.departmentName ?? '-'}</td>
                          <td className="px-4 py-2 text-center text-xs text-amber-600">{fmtDate(b.updatedAt)}</td>
                          <td className="px-4 py-2 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ver / Autorizar"
                              onClick={() =>
                                navigate(`/dashboard/levantamiento-obras/presupuesto/${b.budgetId}`)
                              }
                            >
                              <Pencil className="w-4 h-4 text-amber-600" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {departments.map((d) => (
              <TabsContent key={d.name} value={d.name}>
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                  </div>
                ) : budgets.filter((b) => {
                    const statusOk = viewMode === 'aprobados' ? b.status === 'final' : b.status !== 'final';
                    const municipioOk = selectedCompanyId === null || b.companyName === activeDept?.companies.find((c) => c.companyId === selectedCompanyId)?.name || b.work?.company?.companyId === selectedCompanyId;
                    return statusOk && municipioOk;
                  }).length === 0 ? (
                  <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{viewMode === 'aprobados' ? `No hay presupuestos aprobados para ${d.name}.` : `No hay presupuestos pendientes para ${d.name}.`}</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => navigate('/dashboard/levantamiento-obras/presupuesto')}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Crear primer presupuesto
                    </Button>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                          <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">#</th>
                          <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Obra</th>
                          <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Municipio</th>
                          <th className="px-4 py-3 text-right font-semibold text-[hsl(var(--canalco-neutral-700))]">Total Obra</th>
                          <th className="px-4 py-3 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado</th>
                          <th className="px-4 py-3 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Última edición</th>
                          <th className="px-4 py-3 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Creado por</th>
                          <th className="px-4 py-3 w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {budgets.filter((b) => {
                    const statusOk = viewMode === 'aprobados' ? b.status === 'final' : b.status !== 'final';
                    const municipioOk = selectedCompanyId === null || b.companyName === activeDept?.companies.find((c) => c.companyId === selectedCompanyId)?.name || b.work?.company?.companyId === selectedCompanyId;
                    return statusOk && municipioOk;
                  }).map((b, i) => {
                          const subTotal = (b.items ?? []).reduce((acc, item) => {
                            const cant = Number(item.cantidad) || 0;
                            const vr = Number(item.vrUnitario) || 0;
                            return acc + cant * vr * 1.19;
                          }, 0);
                          const totalObra = subTotal + (Number(b.manoDeObra) || 0);
                          return (
                            <tr
                              key={b.budgetId}
                              className={`border-b border-[hsl(var(--canalco-neutral-100))] hover:bg-[hsl(var(--canalco-neutral-50))] transition-colors ${
                                i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
                              }`}
                            >
                              <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-500))]">{b.budgetId}</td>
                              <td className="px-4 py-3 font-medium text-[hsl(var(--canalco-neutral-900))]">
                                {b.workName || b.work?.name || <span className="text-[hsl(var(--canalco-neutral-400))] italic">Sin obra</span>}
                              </td>
                              <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                                {getMunicipality(b.companyName ?? b.work?.company?.name)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">{fmt(totalObra)}</td>
                              <td className="px-4 py-3 text-center">
                                <Badge
                                  variant="secondary"
                                  className={
                                    b.status === 'final'
                                      ? 'bg-green-100 text-green-800 hover:bg-green-100'
                                      : b.status === 'en_revision'
                                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-100'
                                  }
                                >
                                  {b.status === 'final' ? 'Ppto Final' : b.status === 'en_revision' ? 'En Revisión' : 'Borrador de Ppto'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center text-[hsl(var(--canalco-neutral-500))] text-xs">
                                {fmtDate(b.updatedAt)}
                              </td>
                              <td className="px-4 py-3 text-center text-[hsl(var(--canalco-neutral-500))] text-xs">
                                {b.creator?.nombre ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver / Editar"
                                  onClick={() =>
                                    navigate(`/dashboard/levantamiento-obras/presupuesto/${b.budgetId}`)
                                  }
                                >
                                  <Pencil className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      {/* Diálogo de rechazo del presupuesto del acta — motivo obligatorio */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open) { setRejectDialog(null); setRejectMotivo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar presupuesto — Acta {rejectDialog?.actaNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-700))] block">
              Motivo del rechazo (obligatorio)
            </label>
            <textarea
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              placeholder="Explique por qué se rechaza el presupuesto del acta..."
              className="w-full text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md p-2 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectMotivo(''); }}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRejectActaBudget}
              disabled={!rejectMotivo.trim() || (rejectDialog ? reviewingActa === actaKey(rejectDialog.companyId, rejectDialog.projectId, rejectDialog.actaNumber) : false)}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Rechazar presupuesto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
