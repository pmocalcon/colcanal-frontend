import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { surveysService, type Work } from '@/services/surveys.service';
import { directorBudgetsService, type DirectorBudget } from '@/services/director-budgets.service';
import { useAuth } from '@/contexts/AuthContext';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Home, ArrowLeft, Save, Search, AlertCircle, CalendarDays, CheckSquare, Square, Layers, X } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { Alert, AlertDescription } from '@/components/ui/alert';

const VIEW_ONLY_ROLES = ['Director Técnico', 'Gerencia de Proyectos'];

export default function PlanAnualPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReadOnly = VIEW_ONLY_ROLES.includes(user?.nombreRol ?? '');
  const { access, loading: accessLoading, error: accessError } = useSurveyAccess();

  const [activeTab, setActiveTab] = useState('');
  const [selectedMunicipioId, setSelectedMunicipioId] = useState<number | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedActas, setSelectedActas] = useState<Set<string>>(new Set());

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const companyIdToMunicipio = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => dept.companies.forEach((c) => map.set(c.companyId, getMunicipioName(c.name))));
    return map;
  }, [departments]);

  const activeCompanyIds = useMemo(() => {
    const dept = departments.find((d) => d.name === activeTab);
    return dept?.companyIds || [];
  }, [activeTab, departments]);

  const allCompanyIds = useMemo(
    () => departments.flatMap((d) => d.companyIds),
    [departments],
  );

  const [allWorks, setAllWorks] = useState<Work[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allBudgets, setAllBudgets] = useState<DirectorBudget[]>([]);

  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  useEffect(() => {
    if (user?.userId && activeCompanyIds.length > 0) {
      loadWorks();
    }
  }, [user?.userId, activeCompanyIds]);

  useEffect(() => {
    if (activeTab !== '__resumen__' || allCompanyIds.length === 0) return;
    const load = async () => {
      try {
        setLoadingAll(true);
        const [worksResponse, budgetsResponse] = await Promise.all([
          surveysService.getWorks({ companyId: allCompanyIds }),
          directorBudgetsService.getAll({ companyId: allCompanyIds.join(','), limit: 500 }),
        ]);
        const data = Array.isArray(worksResponse) ? worksResponse : (worksResponse.data || []);
        setAllWorks(data.filter((w: Work) => w.annualPlan != null));
        setAllBudgets(budgetsResponse.data);
      } catch {
        toast.error('Error al cargar el resumen de planes');
      } finally {
        setLoadingAll(false);
      }
    };
    load();
  }, [activeTab, allCompanyIds]);

  // When works or selected year changes, pre-select works already assigned to that year
  useEffect(() => {
    const year = parseInt(selectedYear, 10);
    if (!isNaN(year) && works.length > 0) {
      // Build true acta groups (only record numbers with 2+ works qualify)
      const actaMap = new Map<string, Work[]>();
      works.forEach((w) => {
        if (w.recordNumber) {
          if (!actaMap.has(w.recordNumber)) actaMap.set(w.recordNumber, []);
          actaMap.get(w.recordNumber)!.push(w);
        }
      });
      actaMap.forEach((ws, key) => { if (ws.length < 2) actaMap.delete(key); });

      // Individual = no recordNumber OR singleton acta
      const preselected = new Set(
        works
          .filter((w) => (!w.recordNumber || !actaMap.has(w.recordNumber)) && w.annualPlan === year)
          .map((w) => w.workId),
      );
      setSelectedIds(preselected);

      // Acta groups — pre-select if ALL works in the acta are assigned to this year
      const preselectedActas = new Set<string>();
      actaMap.forEach((actaWorks, recordNumber) => {
        if (actaWorks.every((w) => w.annualPlan === year)) preselectedActas.add(recordNumber);
      });
      setSelectedActas(preselectedActas);
    } else {
      setSelectedIds(new Set());
      setSelectedActas(new Set());
    }
  }, [works, selectedYear]);

  const loadWorks = async () => {
    try {
      setLoading(true);
      const response = await surveysService.getWorks({ companyId: activeCompanyIds });
      const worksData = Array.isArray(response) ? response : (response.data || []);
      setWorks(worksData);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al cargar las obras');
    } finally {
      setLoading(false);
    }
  };

  const filteredWorks = useMemo(() => {
    const year = parseInt(selectedYear, 10);
    const actaCounts = new Map<string, number>();
    works.forEach((w) => {
      if (w.recordNumber) actaCounts.set(w.recordNumber, (actaCounts.get(w.recordNumber) ?? 0) + 1);
    });
    let result = works.filter((w) => !w.recordNumber || (actaCounts.get(w.recordNumber!) ?? 0) < 2);

    if (!isNaN(year)) {
      result = result.filter((w) => !w.annualPlan || w.annualPlan === year);
    }

    if (selectedMunicipioId !== null) {
      result = result.filter((w) => w.companyId === selectedMunicipioId);
    }

    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(
      (w) =>
        w.name?.toLowerCase().includes(term) ||
        w.workCode?.toLowerCase().includes(term) ||
        w.address?.toLowerCase().includes(term),
    );
  }, [works, searchTerm, selectedYear, selectedMunicipioId]);

  const groupedActas = useMemo(() => {
    const year = parseInt(selectedYear, 10);
    const map = new Map<string, Work[]>();
    works.forEach((w) => {
      if (!w.recordNumber) return;
      if (!map.has(w.recordNumber)) map.set(w.recordNumber, []);
      map.get(w.recordNumber)!.push(w);
    });

    // Only include true actas (2+ works)
    map.forEach((ws, key) => { if (ws.length < 2) map.delete(key); });

    let result = Array.from(map.entries()).map(([recordNumber, actaWorks]) => {
      const firstPlan = actaWorks[0].annualPlan;
      const allSame = actaWorks.every((w) => w.annualPlan === firstPlan);
      return {
        recordNumber,
        works: actaWorks,
        planActual: allSame ? (firstPlan ?? undefined) : undefined,
        mixed: !allSame && actaWorks.some((w) => w.annualPlan != null),
      };
    });

    // Exclude actas fully assigned to a different year
    if (!isNaN(year)) {
      result = result.filter((a) => a.works.some((w) => !w.annualPlan || w.annualPlan === year));
    }

    if (selectedMunicipioId !== null) {
      result = result.filter((a) => a.works.some((w) => w.companyId === selectedMunicipioId));
    }

    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((a) => a.recordNumber.toLowerCase().includes(term));
  }, [works, selectedYear, searchTerm, selectedMunicipioId]);

  const workIdToBudgetValue = useMemo(() => {
    const map = new Map<number, number>();
    const byWork = new Map<number, DirectorBudget[]>();
    allBudgets.forEach((b) => {
      if (b.workId == null) return;
      if (!byWork.has(b.workId)) byWork.set(b.workId, []);
      byWork.get(b.workId)!.push(b);
    });
    const statusOrder: Record<string, number> = { final: 0, en_revision: 1, draft: 2 };
    byWork.forEach((budgets, workId) => {
      const best = [...budgets].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))[0];
      const subTotal = (best.items ?? []).reduce((acc, item) => {
        const cant = Number(item.cantidad) || 0;
        const vr = Number(item.vrUnitario) || 0;
        return acc + cant * vr * (item.hasIva ? 1.19 : 1);
      }, 0);
      const total = subTotal + (Number(best.manoDeObra) || 0);
      if (total > 0) map.set(workId, total);
    });
    return map;
  }, [allBudgets]);

  const worksByMunicipio = useMemo(() => {
    const actaCounts = new Map<string, number>();
    allWorks.forEach((w) => {
      if (w.recordNumber) actaCounts.set(w.recordNumber, (actaCounts.get(w.recordNumber) ?? 0) + 1);
    });

    // key: `${year}__${municipio}`
    const map = new Map<string, { year: number; municipio: string; individual: Work[]; actas: Map<string, Work[]> }>();

    allWorks.forEach((w) => {
      if (!w.annualPlan) return;
      const municipio = companyIdToMunicipio.get(w.companyId) ?? (w.company ? getMunicipioName(w.company.name) : 'Sin municipio');
      const key = `${w.annualPlan}__${municipio}`;
      if (!map.has(key)) map.set(key, { year: w.annualPlan, municipio, individual: [], actas: new Map() });
      const entry = map.get(key)!;
      const isGrouped = w.recordNumber && (actaCounts.get(w.recordNumber) ?? 0) >= 2;
      if (isGrouped) {
        if (!entry.actas.has(w.recordNumber!)) entry.actas.set(w.recordNumber!, []);
        entry.actas.get(w.recordNumber!)!.push(w);
      } else {
        entry.individual.push(w);
      }
    });

    return Array.from(map.values())
      .sort((a, b) => b.year - a.year || a.municipio.localeCompare(b.municipio))
      .map((entry) => {
        const allWorksInEntry = [...entry.individual, ...Array.from(entry.actas.values()).flat()];
        const totalValue = allWorksInEntry.reduce((sum, w) => sum + (workIdToBudgetValue.get(w.workId) ?? 0), 0);
        return {
          year: entry.year,
          municipio: entry.municipio,
          individual: entry.individual,
          actas: Array.from(entry.actas.entries()).map(([recordNumber, works]) => ({ recordNumber, works })),
          total: entry.individual.length + Array.from(entry.actas.values()).reduce((s, ws) => s + ws.length, 0),
          totalValue,
        };
      });
  }, [allWorks, companyIdToMunicipio, workIdToBudgetValue]);

  const toggleSelect = (workId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(workId) ? next.delete(workId) : next.add(workId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWorks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWorks.map((w) => w.workId)));
    }
  };

  const toggleSelectActa = (recordNumber: string) => {
    setSelectedActas((prev) => {
      const next = new Set(prev);
      next.has(recordNumber) ? next.delete(recordNumber) : next.add(recordNumber);
      return next;
    });
  };

  const toggleSelectAllActas = () => {
    if (selectedActas.size === groupedActas.length && groupedActas.length > 0) {
      setSelectedActas(new Set());
    } else {
      setSelectedActas(new Set(groupedActas.map((a) => a.recordNumber)));
    }
  };

  const handleSave = async () => {
    const year = parseInt(selectedYear, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      toast.error('Ingrese un año válido (ej: 2026)');
      return;
    }

    try {
      setSaving(true);

      // Individual works to assign/unassign
      const toAssign = filteredWorks.filter(
        (w) => selectedIds.has(w.workId) && w.annualPlan !== year,
      );
      const toUnassign = filteredWorks.filter(
        (w) => !selectedIds.has(w.workId) && w.annualPlan === year,
      );

      // Acta works to assign/unassign
      const actaToAssign: Work[] = [];
      const actaToUnassign: Work[] = [];
      groupedActas.forEach((acta) => {
        acta.works.forEach((w) => {
          if (selectedActas.has(acta.recordNumber) && w.annualPlan !== year) {
            actaToAssign.push(w);
          } else if (!selectedActas.has(acta.recordNumber) && w.annualPlan === year) {
            actaToUnassign.push(w);
          }
        });
      });

      await Promise.all([
        ...toAssign.map((w) => surveysService.updateWork(w.workId, { annualPlan: year } as any)),
        ...toUnassign.map((w) => surveysService.updateWork(w.workId, { annualPlan: null } as any)),
        ...actaToAssign.map((w) => surveysService.updateWork(w.workId, { annualPlan: year } as any)),
        ...actaToUnassign.map((w) => surveysService.updateWork(w.workId, { annualPlan: null } as any)),
      ]);

      const totalAssigned = toAssign.length + actaToAssign.length;
      const totalUnassigned = toUnassign.length + actaToUnassign.length;
      toast.success(
        `Plan Anual ${year} guardado: ${totalAssigned} asignada(s), ${totalUnassigned} removida(s)`,
      );
      await loadWorks();
    } catch {
      toast.error('Error al guardar el plan anual');
    } finally {
      setSaving(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchTerm('');
    setSelectedMunicipioId(null);
  };

  const handleRemoveFromPlan = async (workIds: number[]) => {
    try {
      await Promise.all(
        workIds.map((id) => surveysService.updateWork(id, { annualPlan: null } as any)),
      );
      toast.success(workIds.length === 1 ? 'Obra removida del plan' : `${workIds.length} obras removidas del plan`);
      await loadWorks();
    } catch {
      toast.error('Error al remover la obra del plan');
    }
  };

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando accesos...</p>
        </div>
      </div>
    );
  }

  if (accessError || departments.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Alert className="max-w-md border-amber-500 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            {accessError || 'No tienes acceso a ningún departamento. Contacta al administrador.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const assignedCount =
    filteredWorks.filter((w) => selectedIds.has(w.workId)).length +
    groupedActas
      .filter((a) => selectedActas.has(a.recordNumber))
      .reduce((sum, a) => sum + a.works.length, 0);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
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
                onClick={() => navigate('/dashboard/levantamiento-obras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Plan Anual de Obras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Asignar obras al plan de año correspondiente
              </p>
            </div>

            <div className="w-32" />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Year selector + save */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Año del Plan Anual
              </Label>
              {isReadOnly ? (
                <span className="w-32 text-center text-lg font-bold text-[hsl(var(--canalco-neutral-900))] py-2">
                  {selectedYear || '—'}
                </span>
              ) : (
                <Input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-32 text-center text-lg font-bold"
                  min={2000}
                  max={2100}
                  placeholder="2026"
                />
              )}
            </div>

            <div className="flex flex-col gap-1 sm:ml-auto text-right">
              <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                {assignedCount} obra(s) asignadas al año{' '}
                <strong>{selectedYear || '—'}</strong>
              </span>
              {!isReadOnly && (
                <Button
                  onClick={handleSave}
                  disabled={saving || !selectedYear}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Guardar Plan {selectedYear}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Works table by department */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="__resumen__" className="text-sm">
              Resumen Plan
            </TabsTrigger>
            {departments.map((dept) => (
              <TabsTrigger key={dept.name} value={dept.name} className="text-sm">
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Resumen tab */}
          <TabsContent value="__resumen__">
            {loadingAll ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-10 h-10 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
              </div>
            ) : worksByMunicipio.length === 0 ? (
              <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No hay obras asignadas a ningún plan anual todavía.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {worksByMunicipio.map(({ year, municipio, individual, actas, total, totalValue }) => (
                  <div
                    key={`${year}__${municipio}`}
                    className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] overflow-hidden flex flex-col"
                  >
                    {/* Card header */}
                    <div className="bg-[hsl(var(--canalco-primary))] px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Plan Anual {year}</p>
                        <p className="text-white text-2xl font-bold leading-tight">{municipio}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-2xl font-bold">{total}</p>
                        <p className="text-white/70 text-xs">obra{total !== 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    {/* Value strip */}
                    {totalValue > 0 && (
                      <div className="bg-[hsl(var(--canalco-primary))]/80 px-5 py-1.5 flex items-center justify-between">
                        <span className="text-white/70 text-xs">Total presupuestado</span>
                        <span className="text-white text-sm font-bold">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalValue)}
                        </span>
                      </div>
                    )}

                    {/* Card body */}
                    <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto max-h-80">
                      {/* Individual works */}
                      {individual.length > 0 && (
                        <ul className="space-y-1">
                          {individual.map((w) => (
                            <li key={w.workId} className="flex items-start gap-2 text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
                              <span className="text-[hsl(var(--canalco-neutral-800))] leading-snug">
                                {w.name}
                                {w.workCode && (
                                  <span className="ml-1 text-xs text-[hsl(var(--canalco-neutral-400))] font-mono">
                                    ({w.workCode})
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Acta groups */}
                      {actas.length > 0 && (
                        <ul className="space-y-2">
                          {actas.map((acta) => (
                            <li key={acta.recordNumber} className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] px-3 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Layers className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))] flex-shrink-0" />
                                <span className="text-sm font-medium text-[hsl(var(--canalco-neutral-800))]">
                                  {acta.recordNumber}
                                </span>
                                <span className="ml-auto text-xs text-[hsl(var(--canalco-neutral-400))]">
                                  {acta.works.length} obra{acta.works.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <ul className="pl-5 space-y-0.5">
                                {acta.works.map((w) => (
                                  <li key={w.workId} className="text-xs text-[hsl(var(--canalco-neutral-600))] leading-snug">
                                    {w.name}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {departments.map((dept) => (
            <TabsContent key={dept.name} value={dept.name}>
              {/* Municipality chips */}
              {dept.companies.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setSelectedMunicipioId(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedMunicipioId === null
                        ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                        : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                    }`}
                  >
                    Todos los municipios
                  </button>
                  {dept.companies.map((c) => (
                    <button
                      key={c.companyId}
                      onClick={() => setSelectedMunicipioId(c.companyId === selectedMunicipioId ? null : c.companyId)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selectedMunicipioId === c.companyId
                          ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                          : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                      }`}
                    >
                      {getMunicipioName(c.name)}
                    </button>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar obra..."
                    className="pl-9 h-9"
                  />
                </div>
                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2"
                  >
                    {selectedIds.size === filteredWorks.length && filteredWorks.length > 0 ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {selectedIds.size === filteredWorks.length && filteredWorks.length > 0
                      ? 'Deseleccionar todo'
                      : 'Seleccionar todo'}
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin w-10 h-10 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
                </div>
              ) : filteredWorks.length === 0 ? (
                <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
                  No hay obras registradas{searchTerm ? ' con ese criterio de búsqueda' : ''}.
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                        {!isReadOnly && (
                          <TableHead className="w-12">
                            <button onClick={toggleSelectAll} className="flex items-center justify-center">
                              {selectedIds.size === filteredWorks.length && filteredWorks.length > 0 ? (
                                <CheckSquare className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                              ) : (
                                <Square className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                              )}
                            </button>
                          </TableHead>
                        )}
                        <TableHead className="font-semibold">Cód. Obra</TableHead>
                        <TableHead className="font-semibold">Nombre de la Obra</TableHead>
                        <TableHead className="font-semibold">Dirección</TableHead>
                        <TableHead className="font-semibold">No. Acta</TableHead>
                        <TableHead className="font-semibold">Plan Actual</TableHead>
                        {!isReadOnly && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorks.map((work) => {
                        const isSelected = selectedIds.has(work.workId);
                        const year = parseInt(selectedYear, 10);
                        const isAssignedToYear = work.annualPlan === year;
                        return (
                          <TableRow
                            key={work.workId}
                            className={`transition-colors ${
                              isReadOnly
                                ? 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                : `cursor-pointer ${isSelected
                                    ? 'bg-[hsl(var(--canalco-primary))]/5 hover:bg-[hsl(var(--canalco-primary))]/10'
                                    : 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                  }`
                            }`}
                            onClick={() => !isReadOnly && toggleSelect(work.workId)}
                          >
                            {!isReadOnly && (
                              <TableCell>
                                <div className="flex items-center justify-center">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                                  )}
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="font-mono text-xs text-[hsl(var(--canalco-neutral-600))]">
                              {work.workCode || '—'}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{work.name}</TableCell>
                            <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                              {work.address || '—'}
                            </TableCell>
                            <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                              {work.recordNumber || '—'}
                            </TableCell>
                            <TableCell>
                              {work.annualPlan ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {work.annualPlan}
                                </span>
                              ) : (
                                <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">Sin asignar</span>
                              )}
                            </TableCell>
                            {!isReadOnly && (
                              <TableCell>
                                {isAssignedToYear && (
                                  <button
                                    title="Quitar del plan"
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromPlan([work.workId]); }}
                                    className="p-1 rounded text-[hsl(var(--canalco-neutral-400))] hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Grouped works by acta */}
              {groupedActas.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-800))] flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                      Obras Agrupadas por Acta
                      <span className="text-sm font-normal text-[hsl(var(--canalco-neutral-500))]">
                        ({groupedActas.length} acta{groupedActas.length !== 1 ? 's' : ''})
                      </span>
                    </h3>
                    {!isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleSelectAllActas}
                        className="flex items-center gap-2"
                      >
                        {selectedActas.size === groupedActas.length && groupedActas.length > 0 ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        {selectedActas.size === groupedActas.length && groupedActas.length > 0
                          ? 'Deseleccionar todo'
                          : 'Seleccionar todo'}
                      </Button>
                    )}
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                          {!isReadOnly && (
                            <TableHead className="w-12">
                              <button onClick={toggleSelectAllActas} className="flex items-center justify-center">
                                {selectedActas.size === groupedActas.length && groupedActas.length > 0 ? (
                                  <CheckSquare className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                                ) : (
                                  <Square className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                                )}
                              </button>
                            </TableHead>
                          )}
                          <TableHead className="font-semibold">No. Acta</TableHead>
                          <TableHead className="font-semibold">No. Obras</TableHead>
                          <TableHead className="font-semibold">Obras incluidas</TableHead>
                          <TableHead className="font-semibold">Plan Actual</TableHead>
                          {!isReadOnly && <TableHead className="w-10" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedActas.map((acta) => {
                          const isSelected = selectedActas.has(acta.recordNumber);
                          const year = parseInt(selectedYear, 10);
                          const isAssignedToYear = acta.planActual === year;
                          return (
                            <TableRow
                              key={acta.recordNumber}
                              className={`transition-colors ${
                                isReadOnly
                                  ? 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                  : `cursor-pointer ${isSelected
                                      ? 'bg-[hsl(var(--canalco-primary))]/5 hover:bg-[hsl(var(--canalco-primary))]/10'
                                      : 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                    }`
                              }`}
                              onClick={() => !isReadOnly && toggleSelectActa(acta.recordNumber)}
                            >
                              {!isReadOnly && (
                                <TableCell>
                                  <div className="flex items-center justify-center">
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                                    ) : (
                                      <Square className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-sm">{acta.recordNumber}</TableCell>
                              <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                {acta.works.length} obra{acta.works.length !== 1 ? 's' : ''}
                              </TableCell>
                              <TableCell className="text-xs text-[hsl(var(--canalco-neutral-500))] max-w-xs">
                                {acta.works.slice(0, 3).map((w) => w.name).join(', ')}
                                {acta.works.length > 3 && (
                                  <span className="text-[hsl(var(--canalco-neutral-400))]">
                                    {' '}+{acta.works.length - 3} más
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {acta.planActual ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {acta.planActual}
                                  </span>
                                ) : acta.mixed ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    Mixto
                                  </span>
                                ) : (
                                  <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">Sin asignar</span>
                                )}
                              </TableCell>
                              {!isReadOnly && (
                                <TableCell>
                                  {isAssignedToYear && (
                                    <button
                                      title="Quitar acta del plan"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveFromPlan(acta.works.map((w) => w.workId)); }}
                                      className="p-1 rounded text-[hsl(var(--canalco-neutral-400))] hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
