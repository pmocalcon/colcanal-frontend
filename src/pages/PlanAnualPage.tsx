import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { surveysService, type Work } from '@/services/surveys.service';
import { schedulesService } from '@/services/schedules.service';
import { useAuth } from '@/contexts/AuthContext';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Home, ArrowLeft, Save, Search, AlertCircle, CalendarDays, CheckSquare, Square, Layers, X, ChevronRight, Percent } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { Alert, AlertDescription } from '@/components/ui/alert';

const VIEW_ONLY_ROLES = ['Director Técnico', 'Gerencia de Proyectos'];

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

// El número de acta (recordNumber) se reutiliza entre municipios; la identidad real del acta
// es (empresa, número). Las actas se agrupan/seleccionan por esta clave compuesta.
const makeActaKey = (companyId: number | undefined | null, recordNumber: string) =>
  `${companyId ?? 0}:${recordNumber}`;

type ExecutedWork = Work & {
  municipio: string;
  value: number;
};

type ExecutionYearSummary = {
  year: number;
  inActa: ExecutedWork[];
  outActa: ExecutedWork[];
  inActaValue: number;
  outActaValue: number;
};

type SummaryExecutionFilter = 'all' | 'with' | 'without';

type IppDialogTarget = {
  type: 'work' | 'acta';
  title: string;
  subtitle: string;
  workIds: number[];
};

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
  const [expandedSummary, setExpandedSummary] = useState<Set<string>>(new Set());
  const [summaryYearFilter, setSummaryYearFilter] = useState<string>('all');
  const [summaryMunicipioFilter, setSummaryMunicipioFilter] = useState<string>('all');
  const [summaryExecutionFilter, setSummaryExecutionFilter] = useState<SummaryExecutionFilter>('all');
  const [quickAssigningKey, setQuickAssigningKey] = useState<string | null>(null);
  const [ippDialog, setIppDialog] = useState<IppDialogTarget | null>(null);
  const [ippValue, setIppValue] = useState('');
  const [ippLoading, setIppLoading] = useState(false);
  const [ippSaving, setIppSaving] = useState(false);

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const companyIdToMunicipio = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => dept.companies.forEach((c) => map.set(c.companyId, getMunicipioName(c.name))));
    return map;
  }, [departments]);

  const activeDept = useMemo(
    () => departments.find((d) => d.name === activeTab),
    [activeTab, departments],
  );

  const activeCompanyIds = useMemo(() => activeDept?.companyIds || [], [activeDept]);

  const allCompanyIds = useMemo(
    () => departments.flatMap((d) => d.companyIds),
    [departments],
  );

  const [allWorks, setAllWorks] = useState<Work[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [workValues, setWorkValues] = useState<Map<number, number>>(new Map());
  const [executedWorkIds, setExecutedWorkIds] = useState<Set<number>>(new Set());
  const [expandedExec, setExpandedExec] = useState<Set<string>>(new Set());

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

  const loadPlanSummary = async () => {
    if (allCompanyIds.length === 0) return;

    try {
      setLoadingAll(true);
      const worksResponse = await surveysService.getWorks({ companyId: allCompanyIds });
      const data = Array.isArray(worksResponse) ? worksResponse : (worksResponse.data || []);
      const planWorks = data.filter((w: Work) => w.annualPlan != null);
      setAllWorks(planWorks);

      // Valor autoritativo por obra (Valor Total con IPP), igual que en la lista de obras.
      const ids = planWorks.map((w: Work) => w.workId);
      if (ids.length > 0) {
        try {
          const [values, execStatus] = await Promise.all([
            surveysService.getWorksValue(ids),
            schedulesService.getWorksExecutionStatus(ids),
          ]);
          setWorkValues(new Map(values.map((v) => [v.workId, v.value])));
          setExecutedWorkIds(new Set(execStatus.filter((e) => e.hasExecution).map((e) => e.workId)));
        } catch {
          setWorkValues(new Map());
          setExecutedWorkIds(new Set());
        }
      } else {
        setWorkValues(new Map());
        setExecutedWorkIds(new Set());
      }
    } catch {
      toast.error('Error al cargar el resumen de planes');
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    if (activeTab !== '__resumen__' || allCompanyIds.length === 0) return;
    loadPlanSummary();
  }, [activeTab, allCompanyIds]);

  // When works or selected year changes, pre-select works already assigned to that year
  useEffect(() => {
    const year = parseInt(selectedYear, 10);
    if (!isNaN(year) && works.length > 0) {
      // Agrupar actas por (empresa, número) — el número se reutiliza entre municipios.
      const actaMap = new Map<string, Work[]>();
      works.forEach((w) => {
        if (w.recordNumber) {
          const key = makeActaKey(w.companyId, w.recordNumber);
          if (!actaMap.has(key)) actaMap.set(key, []);
          actaMap.get(key)!.push(w);
        }
      });
      actaMap.forEach((ws, key) => { if (ws.length < 1) actaMap.delete(key); });

      // Individual = no recordNumber OR singleton acta
      const preselected = new Set(
        works
          .filter((w) => (!w.recordNumber || !actaMap.has(makeActaKey(w.companyId, w.recordNumber))) && w.annualPlan === year)
          .map((w) => w.workId),
      );
      setSelectedIds(preselected);

      // Acta groups — pre-select if ALL works in the acta are assigned to this year
      const preselectedActas = new Set<string>();
      actaMap.forEach((actaWorks, key) => {
        if (actaWorks.every((w) => w.annualPlan === year)) preselectedActas.add(key);
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
    let result = works.filter((w) => !w.recordNumber || (actaCounts.get(w.recordNumber!) ?? 0) < 1);

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
      const key = makeActaKey(w.companyId, w.recordNumber);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });

    map.forEach((ws, key) => { if (ws.length < 1) map.delete(key); });

    let result = Array.from(map.entries()).map(([key, actaWorks]) => {
      const firstPlan = actaWorks[0].annualPlan;
      const allSame = actaWorks.every((w) => w.annualPlan === firstPlan);
      return {
        key,
        recordNumber: actaWorks[0].recordNumber!,
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

  const summaryYears = useMemo(
    () =>
      Array.from(
        new Set(
          allWorks
            .map((w) => w.annualPlan)
            .filter((year): year is number => typeof year === 'number'),
        ),
      ).sort((a, b) => b - a),
    [allWorks],
  );

  const summaryMunicipios = useMemo(
    () =>
      Array.from(
        new Set(
          allWorks.map((w) =>
            companyIdToMunicipio.get(w.companyId) ??
            (w.company ? getMunicipioName(w.company.name) : 'Sin municipio'),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [allWorks, companyIdToMunicipio],
  );

  const filteredSummaryWorks = useMemo(() => {
    const yearFilter = summaryYearFilter === 'all' ? null : Number(summaryYearFilter);

    return allWorks.filter((w) => {
      if (yearFilter !== null && w.annualPlan !== yearFilter) return false;

      const municipio =
        companyIdToMunicipio.get(w.companyId) ??
        (w.company ? getMunicipioName(w.company.name) : 'Sin municipio');
      if (summaryMunicipioFilter !== 'all' && municipio !== summaryMunicipioFilter) return false;

      const hasExecution = executedWorkIds.has(w.workId);
      if (summaryExecutionFilter === 'with' && !hasExecution) return false;
      if (summaryExecutionFilter === 'without' && hasExecution) return false;

      return true;
    });
  }, [
    allWorks,
    companyIdToMunicipio,
    executedWorkIds,
    summaryExecutionFilter,
    summaryMunicipioFilter,
    summaryYearFilter,
  ]);

  const worksByMunicipio = useMemo(() => {
    // Contar por (empresa, número de acta): el número se reutiliza entre municipios.
    const actaCounts = new Map<string, number>();
    allWorks.forEach((w) => {
      if (w.recordNumber) {
        const k = makeActaKey(w.companyId, w.recordNumber);
        actaCounts.set(k, (actaCounts.get(k) ?? 0) + 1);
      }
    });

    // key: `${year}__${municipio}`
    const map = new Map<string, { year: number; municipio: string; individual: Work[]; actas: Map<string, Work[]> }>();

    filteredSummaryWorks.forEach((w) => {
      if (!w.annualPlan) return;
      const municipio = companyIdToMunicipio.get(w.companyId) ?? (w.company ? getMunicipioName(w.company.name) : 'Sin municipio');
      const key = `${w.annualPlan}__${municipio}`;
      if (!map.has(key)) map.set(key, { year: w.annualPlan, municipio, individual: [], actas: new Map() });
      const entry = map.get(key)!;
      const isGrouped = w.recordNumber && (actaCounts.get(makeActaKey(w.companyId, w.recordNumber)) ?? 0) >= 2;
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
        const totalValue = allWorksInEntry.reduce((sum, w) => sum + (workValues.get(w.workId) ?? 0), 0);
        return {
          year: entry.year,
          municipio: entry.municipio,
          individual: entry.individual,
          actas: Array.from(entry.actas.entries()).map(([recordNumber, works]) => ({ recordNumber, works })),
          total: entry.individual.length + Array.from(entry.actas.values()).reduce((s, ws) => s + ws.length, 0),
          totalValue,
        };
      });
  }, [allWorks, companyIdToMunicipio, filteredSummaryWorks, workValues]);

  // Ejecución por año del plan anual: obras con ejecución registrada en cronograma,
  // separadas en "dentro del acta" (agrupadas con N° de acta) vs "fuera del acta".
  const executionSummaries = useMemo<ExecutionYearSummary[]>(() => {
    const actaCounts = new Map<string, number>();
    allWorks.forEach((w) => {
      if (w.recordNumber) {
        const k = makeActaKey(w.companyId, w.recordNumber);
        actaCounts.set(k, (actaCounts.get(k) ?? 0) + 1);
      }
    });

    const enrich = (w: Work) => ({
      ...w,
      municipio: companyIdToMunicipio.get(w.companyId) ?? (w.company ? getMunicipioName(w.company.name) : 'Sin municipio'),
      value: workValues.get(w.workId) ?? 0,
    });

    const summaries = new Map<number, { year: number; inActa: ExecutedWork[]; outActa: ExecutedWork[] }>();
    const getSummary = (year: number) => {
      if (!summaries.has(year)) {
        summaries.set(year, { year, inActa: [], outActa: [] });
      }
      return summaries.get(year)!;
    };

    filteredSummaryWorks.forEach((w) => {
      if (!w.annualPlan) return;
      const summary = getSummary(w.annualPlan);
      if (!executedWorkIds.has(w.workId)) return;
      const isGrouped = w.recordNumber && (actaCounts.get(makeActaKey(w.companyId, w.recordNumber)) ?? 0) >= 2;
      (isGrouped ? summary.inActa : summary.outActa).push(enrich(w));
    });

    const byMunicipio = (a: { municipio: string; name: string }, b: { municipio: string; name: string }) =>
      a.municipio.localeCompare(b.municipio) || a.name.localeCompare(b.name);

    const sumVal = (ws: { value: number }[]) => ws.reduce((s, w) => s + w.value, 0);
    return Array.from(summaries.values())
      .sort((a, b) => b.year - a.year)
      .map((summary) => {
        summary.inActa.sort(byMunicipio);
        summary.outActa.sort(byMunicipio);
        return {
          ...summary,
          inActaValue: sumVal(summary.inActa),
          outActaValue: sumVal(summary.outActa),
        };
      });
  }, [allWorks, companyIdToMunicipio, filteredSummaryWorks, workValues, executedWorkIds]);

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

  const toggleSelectActa = (actaKey: string) => {
    setSelectedActas((prev) => {
      const next = new Set(prev);
      next.has(actaKey) ? next.delete(actaKey) : next.add(actaKey);
      return next;
    });
  };

  const toggleSelectAllActas = () => {
    if (selectedActas.size === groupedActas.length && groupedActas.length > 0) {
      setSelectedActas(new Set());
    } else {
      setSelectedActas(new Set(groupedActas.map((a) => a.key)));
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
          if (selectedActas.has(acta.key) && w.annualPlan !== year) {
            actaToAssign.push(w);
          } else if (!selectedActas.has(acta.key) && w.annualPlan === year) {
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

  const handleQuickAssignToPlan = async (workIds: number[], key: string) => {
    const year = parseInt(selectedYear, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      toast.error('Ingrese un año válido para asignar el plan');
      return;
    }

    try {
      setQuickAssigningKey(key);
      await Promise.all(
        workIds.map((id) => surveysService.updateWork(id, { annualPlan: year } as any)),
      );
      toast.success(
        workIds.length === 1
          ? `Obra asignada al Plan ${year}`
          : `${workIds.length} obras asignadas al Plan ${year}`,
      );
      await loadWorks();
    } catch {
      toast.error('Error al asignar al plan anual');
    } finally {
      setQuickAssigningKey(null);
    }
  };

  const closeIppDialog = () => {
    if (ippSaving) return;
    setIppDialog(null);
    setIppValue('');
  };

  const openIppDialog = async (target: IppDialogTarget) => {
    const nextTarget = {
      ...target,
      workIds: Array.from(new Set(target.workIds)),
    };

    setIppDialog(nextTarget);
    setIppValue('');
    setIppLoading(true);

    try {
      const currentIpps: number[] = [];
      for (const workId of nextTarget.workIds) {
        const survey = await surveysService.getLatestSurveyForWork(workId);
        if (typeof survey?.previousMonthIpp === 'number') {
          currentIpps.push(survey.previousMonthIpp);
        }
      }

      const uniqueIpps = Array.from(new Set(currentIpps.map((value) => String(value))));
      if (uniqueIpps.length === 1) {
        setIppValue(uniqueIpps[0]);
      }
    } catch {
      toast.error('No se pudo consultar el IPP actual');
    } finally {
      setIppLoading(false);
    }
  };

  const handleSaveIpp = async () => {
    if (!ippDialog) return;

    const value = Number(ippValue.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Ingrese un IPP válido mayor a cero');
      return;
    }

    try {
      setIppSaving(true);
      let updated = 0;
      let missing = 0;

      for (const workId of ippDialog.workIds) {
        const survey = await surveysService.getLatestSurveyForWork(workId);
        if (!survey?.surveyId) {
          missing += 1;
          continue;
        }

        await surveysService.updateSurveyIpp(survey.surveyId, value);
        updated += 1;
      }

      if (updated === 0) {
        toast.error('No se encontró ningún levantamiento para actualizar');
        return;
      }

      toast.success(
        missing > 0
          ? `IPP actualizado en ${updated} obra(s). ${missing} obra(s) no tenían levantamiento.`
          : `IPP actualizado en ${updated} obra(s)`,
      );
      setIppDialog(null);
      setIppValue('');

      if (activeTab === '__resumen__') {
        await loadPlanSummary();
      } else {
        await loadWorks();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al actualizar el IPP');
    } finally {
      setIppSaving(false);
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
      .filter((a) => selectedActas.has(a.key))
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
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="w-56">
              <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Departamento</label>
              <Select value={activeTab} onValueChange={handleTabChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__resumen__">Resumen Plan</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.name} value={dept.name}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeDept && activeDept.companies.length > 1 && (
              <div className="w-56">
                <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                <Select
                  value={selectedMunicipioId === null ? 'all' : String(selectedMunicipioId)}
                  onValueChange={(val) => setSelectedMunicipioId(val === 'all' ? null : Number(val))}
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

          {/* Resumen tab */}
          <TabsContent value="__resumen__">
            {loadingAll ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-10 h-10 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
              </div>
            ) : allWorks.length === 0 ? (
              <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No hay obras asignadas a ningún plan anual todavía.</p>
              </div>
            ) : (
              <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Año</label>
                    <Select value={summaryYearFilter} onValueChange={setSummaryYearFilter}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Año" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los años</SelectItem>
                        {summaryYears.map((year) => (
                          <SelectItem key={year} value={String(year)}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                    <Select value={summaryMunicipioFilter} onValueChange={setSummaryMunicipioFilter}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Municipio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los municipios</SelectItem>
                        {summaryMunicipios.map((municipio) => (
                          <SelectItem key={municipio} value={municipio}>
                            {municipio}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Ejecución</label>
                    <Select
                      value={summaryExecutionFilter}
                      onValueChange={(value) => setSummaryExecutionFilter(value as SummaryExecutionFilter)}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Ejecución" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las obras</SelectItem>
                        <SelectItem value="with">Con ejecución</SelectItem>
                        <SelectItem value="without">Sin ejecución</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={
                      summaryYearFilter === 'all' &&
                      summaryMunicipioFilter === 'all' &&
                      summaryExecutionFilter === 'all'
                    }
                    onClick={() => {
                      setSummaryYearFilter('all');
                      setSummaryMunicipioFilter('all');
                      setSummaryExecutionFilter('all');
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Limpiar filtros
                  </Button>
                </div>
              </div>

              {worksByMunicipio.length === 0 ? (
                <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-6 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                  No hay obras que coincidan con los filtros seleccionados.
                </div>
              ) : (
              <>
              <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))] border-0">
                      <TableHead className="w-10" />
                      <TableHead className="text-white font-semibold">Municipio</TableHead>
                      <TableHead className="text-white font-semibold w-24">Año</TableHead>
                      <TableHead className="text-white font-semibold text-center w-28">N° obras</TableHead>
                      <TableHead className="text-white font-semibold text-right w-52">Total presupuestado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {worksByMunicipio.map(({ year, municipio, individual, actas, total, totalValue }) => {
                      const rowKey = `${year}__${municipio}`;
                      const isOpen = expandedSummary.has(rowKey);
                      return (
                        <Fragment key={rowKey}>
                          <TableRow
                            className="cursor-pointer hover:bg-[hsl(var(--canalco-neutral-50))]"
                            onClick={() =>
                              setExpandedSummary((prev) => {
                                const next = new Set(prev);
                                next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
                                return next;
                              })
                            }
                          >
                            <TableCell className="py-2.5">
                              <ChevronRight
                                className={`w-4 h-4 text-[hsl(var(--canalco-neutral-500))] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                            </TableCell>
                            <TableCell className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{municipio}</TableCell>
                            <TableCell className="text-[hsl(var(--canalco-neutral-600))]">{year}</TableCell>
                            <TableCell className="text-center font-medium text-[hsl(var(--canalco-neutral-800))]">{total}</TableCell>
                            <TableCell className="text-right font-semibold text-[hsl(var(--canalco-neutral-800))]">
                              {totalValue > 0 ? fmtCOP(totalValue) : '—'}
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell className="p-0" />
                              <TableCell colSpan={4} className="bg-[hsl(var(--canalco-neutral-50))] py-3 pr-4">
                                <div className="flex flex-col gap-3">
                                  {/* Individual works */}
                                  {individual.length > 0 && (
                                    <ul className="space-y-1">
                                      {individual.map((w) => (
                                        <li key={w.workId} className="flex items-start gap-2 text-sm">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
                                          <span className="text-[hsl(var(--canalco-neutral-800))] leading-snug flex-1">
                                            {w.name}
                                            {w.workCode && (
                                              <span className="ml-1 text-xs text-[hsl(var(--canalco-neutral-400))] font-mono">
                                                ({w.workCode})
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] whitespace-nowrap flex-shrink-0 pl-2">
                                            {(workValues.get(w.workId) ?? 0) > 0 ? fmtCOP(workValues.get(w.workId)!) : '—'}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}

                                  {/* Acta groups */}
                                  {actas.length > 0 && (
                                    <ul className="space-y-2">
                                      {actas.map((acta) => (
                                        <li key={acta.recordNumber} className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-white px-3 py-2">
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
                                              <li key={w.workId} className="text-xs text-[hsl(var(--canalco-neutral-600))] leading-snug flex items-start justify-between gap-2">
                                                <span>{w.name}</span>
                                                <span className="font-medium whitespace-nowrap flex-shrink-0">
                                                  {(workValues.get(w.workId) ?? 0) > 0 ? fmtCOP(workValues.get(w.workId)!) : '—'}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}

                    {/* Grand total */}
                    <TableRow className="bg-[hsl(var(--canalco-neutral-100))] hover:bg-[hsl(var(--canalco-neutral-100))] font-bold">
                      <TableCell className="p-0" />
                      <TableCell className="text-[hsl(var(--canalco-neutral-800))]" colSpan={2}>Total general</TableCell>
                      <TableCell className="text-center text-[hsl(var(--canalco-neutral-800))]">
                        {worksByMunicipio.reduce((s, m) => s + m.total, 0)}
                      </TableCell>
                      <TableCell className="text-right text-[hsl(var(--canalco-neutral-800))]">
                        {fmtCOP(worksByMunicipio.reduce((s, m) => s + m.totalValue, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Ejecución por año: dentro vs fuera del acta */}
              <div className="space-y-5">
                {executionSummaries.map((summary) => {
                  const hasExecution = summary.inActa.length > 0 || summary.outActa.length > 0;
                  return (
                    <div key={summary.year}>
                      <h3 className="text-lg font-bold text-[hsl(var(--canalco-neutral-800))]">Ejecución {summary.year}</h3>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-3">
                        Obras con ejecución registrada en cronograma, separadas dentro y fuera del acta.
                      </p>
                      {!hasExecution ? (
                        <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-6 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                          Ninguna obra del plan {summary.year} tiene ejecución registrada todavía.
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))] border-0">
                                <TableHead className="w-10" />
                                <TableHead className="text-white font-semibold">Categoría ({summary.year})</TableHead>
                                <TableHead className="text-white font-semibold text-center w-28">N° obras</TableHead>
                                <TableHead className="text-white font-semibold text-right w-52">Valor total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {[
                                { key: `${summary.year}:in`, label: 'Ejecutadas dentro del acta', works: summary.inActa, value: summary.inActaValue, showActa: true },
                                { key: `${summary.year}:out`, label: 'Ejecutadas fuera del acta', works: summary.outActa, value: summary.outActaValue, showActa: false },
                              ].map((cat) => {
                                const isOpen = expandedExec.has(cat.key);
                                return (
                                  <Fragment key={cat.key}>
                                    <TableRow
                                      className="cursor-pointer hover:bg-[hsl(var(--canalco-neutral-50))]"
                                      onClick={() =>
                                        setExpandedExec((prev) => {
                                          const next = new Set(prev);
                                          next.has(cat.key) ? next.delete(cat.key) : next.add(cat.key);
                                          return next;
                                        })
                                      }
                                    >
                                      <TableCell className="py-2.5">
                                        <ChevronRight
                                          className={`w-4 h-4 text-[hsl(var(--canalco-neutral-500))] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                        />
                                      </TableCell>
                                      <TableCell className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{cat.label}</TableCell>
                                      <TableCell className="text-center font-medium text-[hsl(var(--canalco-neutral-800))]">{cat.works.length}</TableCell>
                                      <TableCell className="text-right font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                        {cat.value > 0 ? fmtCOP(cat.value) : '—'}
                                      </TableCell>
                                    </TableRow>
                                    {isOpen && (
                                      <TableRow className="hover:bg-transparent">
                                        <TableCell className="p-0" />
                                        <TableCell colSpan={3} className="bg-[hsl(var(--canalco-neutral-50))] py-3 pr-4">
                                          {cat.works.length === 0 ? (
                                            <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">Sin obras en esta categoría.</p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {cat.works.map((w) => (
                                                <li key={w.workId} className="flex items-start gap-2 text-sm">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
                                                  <span className="flex-1 leading-snug text-[hsl(var(--canalco-neutral-800))]">
                                                    <span className="text-xs text-[hsl(var(--canalco-neutral-400))] mr-1.5">{w.municipio}</span>
                                                    {w.name}
                                                    {cat.showActa && w.recordNumber && (
                                                      <span className="ml-1.5 text-xs text-[hsl(var(--canalco-primary))] font-mono">[Acta {w.recordNumber}]</span>
                                                    )}
                                                  </span>
                                                  <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] whitespace-nowrap flex-shrink-0 pl-2">
                                                    {w.value > 0 ? fmtCOP(w.value) : '—'}
                                                  </span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Fragment>
                                );
                              })}

                              {/* Total */}
                              <TableRow className="bg-[hsl(var(--canalco-neutral-100))] hover:bg-[hsl(var(--canalco-neutral-100))] font-bold">
                                <TableCell className="p-0" />
                                <TableCell className="text-[hsl(var(--canalco-neutral-800))]">Total ejecutadas</TableCell>
                                <TableCell className="text-center text-[hsl(var(--canalco-neutral-800))]">
                                  {summary.inActa.length + summary.outActa.length}
                                </TableCell>
                                <TableCell className="text-right text-[hsl(var(--canalco-neutral-800))]">
                                  {fmtCOP(summary.inActaValue + summary.outActaValue)}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
              )}
              </div>
            )}
          </TabsContent>

          {departments.map((dept) => (
            <TabsContent key={dept.name} value={dept.name}>
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
                        {!isReadOnly && <TableHead className="w-56 text-right">Acción</TableHead>}
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
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openIppDialog({
                                        type: 'work',
                                        title: work.name,
                                        subtitle: work.workCode || work.recordNumber || 'Obra individual',
                                        workIds: [work.workId],
                                      });
                                    }}
                                    className="h-8"
                                  >
                                    <Percent className="w-3.5 h-3.5 mr-1.5" />
                                    IPP
                                  </Button>
                                  {isAssignedToYear ? (
                                    <button
                                      title="Quitar del plan"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveFromPlan([work.workId]); }}
                                      className="p-1 rounded text-[hsl(var(--canalco-neutral-400))] hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  ) : !work.annualPlan ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={quickAssigningKey === `work:${work.workId}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickAssignToPlan([work.workId], `work:${work.workId}`);
                                      }}
                                      className="h-8"
                                    >
                                      <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                                      Asignar
                                    </Button>
                                  ) : null}
                                </div>
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
                          {!isReadOnly && <TableHead className="w-56 text-right">Acción</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedActas.map((acta) => {
                          const isSelected = selectedActas.has(acta.key);
                          const year = parseInt(selectedYear, 10);
                          const isAssignedToYear = acta.planActual === year;
                          return (
                            <TableRow
                              key={acta.key}
                              className={`transition-colors ${
                                isReadOnly
                                  ? 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                  : `cursor-pointer ${isSelected
                                      ? 'bg-[hsl(var(--canalco-primary))]/5 hover:bg-[hsl(var(--canalco-primary))]/10'
                                      : 'hover:bg-[hsl(var(--canalco-neutral-50))]'
                                    }`
                              }`}
                              onClick={() => !isReadOnly && toggleSelectActa(acta.key)}
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
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openIppDialog({
                                          type: 'acta',
                                          title: `Acta ${acta.recordNumber}`,
                                          subtitle: `${acta.works.length} obra${acta.works.length !== 1 ? 's' : ''}`,
                                          workIds: acta.works.map((w) => w.workId),
                                        });
                                      }}
                                      className="h-8"
                                    >
                                      <Percent className="w-3.5 h-3.5 mr-1.5" />
                                      IPP
                                    </Button>
                                    {isAssignedToYear ? (
                                      <button
                                        title="Quitar acta del plan"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveFromPlan(acta.works.map((w) => w.workId)); }}
                                        className="p-1 rounded text-[hsl(var(--canalco-neutral-400))] hover:text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    ) : !acta.planActual && !acta.mixed ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={quickAssigningKey === `acta:${acta.key}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickAssignToPlan(
                                            acta.works.map((w) => w.workId),
                                            `acta:${acta.key}`,
                                          );
                                        }}
                                        className="h-8"
                                      >
                                        <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                                        Asignar
                                      </Button>
                                    ) : null}
                                  </div>
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

      <Dialog open={!!ippDialog} onOpenChange={(open) => { if (!open) closeIppDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar IPP</DialogTitle>
            <DialogDescription>
              {ippDialog
                ? `Se actualizará el IPP para ${ippDialog.type === 'acta' ? 'el acta seleccionada' : 'la obra seleccionada'}.`
                : 'Actualiza el IPP del levantamiento.'}
            </DialogDescription>
          </DialogHeader>

          {ippDialog && (
            <div className="space-y-4">
              <div className="rounded-md border border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-50))] p-3">
                <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">{ippDialog.title}</p>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">{ippDialog.subtitle}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="annual-plan-ipp">IPP Mes Anterior</Label>
                <Input
                  id="annual-plan-ipp"
                  type="number"
                  min="0"
                  step="0.01"
                  value={ippValue}
                  onChange={(e) => setIppValue(e.target.value)}
                  disabled={ippLoading || ippSaving}
                  placeholder={ippLoading ? 'Consultando IPP actual...' : 'Ej: 184.47'}
                />
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                  {ippDialog.type === 'acta'
                    ? 'Este valor se aplicará a todas las obras del acta que tengan levantamiento.'
                    : 'Este valor se aplicará al levantamiento de esta obra.'}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeIppDialog} disabled={ippSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveIpp}
              disabled={!ippDialog || ippLoading || ippSaving}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-dark))] text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {ippSaving ? 'Guardando...' : 'Guardar IPP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
