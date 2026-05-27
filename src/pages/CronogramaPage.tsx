import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments } from '@/utils/departmentMapper';
import { surveysService, type Work } from '@/services/surveys.service';
import { schedulesService, type ScheduleDetail, type DailyPlanEntry, type MaterialLogEntry, type SurveyMaterialItem } from '@/services/schedules.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, ArrowLeft, Save, Search, CalendarRange, ClipboardList, Layers, ChevronDown, ChevronUp, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { workingDayProgress, parseLocalDate, type WorkingDayCount, getColombianHolidays, currentMonthWorkingDays } from '@/utils/colombianCalendar';
import { GanttTimeline, type GanttRow } from '@/components/GanttTimeline';

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function pct(executed: number, planned: number): number {
  if (!planned) return 0;
  return clamp01(executed / planned) * 100;
}

type WorkStatus = 'on-track' | 'at-risk' | 'delayed';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(offset: number): string[] {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ─── sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'primary' }: { value: number; color?: 'primary' | 'green' | 'amber' | 'red' }) {
  const bg: Record<string, string> = {
    primary: 'bg-[hsl(var(--canalco-primary))]',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  const barColor = value >= 100 ? bg.green : value >= 70 ? bg.amber : bg[color];

  return (
    <div className="h-2.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
      <div
        className={`h-2.5 rounded-full transition-all ${barColor}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CronogramaPage() {
  const navigate = useNavigate();
  const { access, loading: accessLoading } = useSurveyAccess();

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const [activeTab, setActiveTab] = useState('');
  const [works, setWorks] = useState<Work[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [contractualStart, setContractualStart] = useState('');
  const [contractualEnd, setContractualEnd] = useState('');
  const [ucapDates, setUcapDates] = useState<Record<number, { start: string; end: string }>>({});
  const [executed, setExecuted] = useState<Record<number, string>>({});
  const [workStatuses, setWorkStatuses] = useState<Record<number, WorkStatus>>({});
  const [weekOffset, setWeekOffset] = useState(0);
  // key: 'YYYY-MM-DD' → ucapId → { planned, executed }
  const [dailyPlans, setDailyPlans] = useState<Record<string, Record<number, { planned: string; executed: string }>>>({});
  const [savingDailyPlans, setSavingDailyPlans] = useState(false);
  const [lastSavedDailyPlan, setLastSavedDailyPlan] = useState<string | null>(null);
  // sum of planned quantities per ucap from all daily plans up to today
  const [planToDateMap, setPlanToDateMap] = useState<Record<number, number>>({});
  const [surveyMaterials, setSurveyMaterials] = useState<SurveyMaterialItem[]>([]);
  // date → materialCode → quantity (holds ALL historical data)
  const [materialDailyMap, setMaterialDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [materialWeekOffset, setMaterialWeekOffset] = useState(0);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);
  const [ucapSectionCollapsed, setUcapSectionCollapsed] = useState(false);

  // ── set active tab on first load
  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  // ── load works when tab changes
  const activeCompanyIds = useMemo(() => {
    const dept = departments.find((d) => d.name === activeTab);
    return dept?.companyIds ?? [];
  }, [activeTab, departments]);

  const loadWorks = useCallback(async () => {
    if (!activeCompanyIds.length) return;
    try {
      setLoadingWorks(true);
      const response = await surveysService.getWorks({ companyId: activeCompanyIds, limit: 500 });
      const data: Work[] = Array.isArray(response) ? response : (response.data ?? []);
      setWorks(data);
    } catch {
      toast.error('Error al cargar las obras');
    } finally {
      setLoadingWorks(false);
    }
  }, [activeCompanyIds]);

  useEffect(() => {
    setSelectedWork(null);
    setSchedule(null);
    setSearch('');
    setWorkStatuses({});
    loadWorks();
  }, [loadWorks]);

  // ── load schedule when work is selected
  const handleSelectWork = useCallback(async (work: Work) => {
    if (isDirty) {
      const ok = window.confirm('Tienes cambios sin guardar. ¿Deseas continuar y perder los cambios?');
      if (!ok) return;
    }
    setSelectedWork(work);
    setSchedule(null);
    try {
      setLoadingSchedule(true);
      const s = await schedulesService.getByWork(work.workId);
      setSchedule(s);
      setStartDate(toDateInput(s.startDate));
      setEndDate(toDateInput(s.endDate));
      setContractualStart(toDateInput(s.contractualStart));
      setContractualEnd(toDateInput(s.contractualEnd));
      const execMap: Record<number, string> = {};
      const datesMap: Record<number, { start: string; end: string }> = {};
      s.items.forEach((item) => {
        execMap[item.ucapId] = String(item.executedQuantity);
        datesMap[item.ucapId] = {
          start: toDateInput(item.ucapStartDate),
          end: toDateInput(item.ucapEndDate),
        };
      });
      setExecuted(execMap);
      setUcapDates(datesMap);
      setWeekOffset(0);
      setDailyPlans({});
      setPlanToDateMap({});
      setLastSavedDailyPlan(null);
      setSurveyMaterials([]);
      setMaterialDailyMap({});
      setMaterialWeekOffset(0);
      setIsDirty(false);
    } catch {
      toast.error('Error al cargar el cronograma');
    } finally {
      setLoadingSchedule(false);
    }
  }, [isDirty]);

  // ── save
  const handleSave = async () => {
    if (!schedule) return;
    try {
      setSaving(true);
      const items = schedule.items.map((item) => ({
        ucapId: item.ucapId,
        executedQuantity: parseFloat(executed[item.ucapId] ?? '0') || 0,
        ucapStartDate: ucapDates[item.ucapId]?.start || null,
        ucapEndDate: ucapDates[item.ucapId]?.end || null,
      }));
      const updated = await schedulesService.update(schedule.scheduleId, {
        startDate: startDate || null,
        endDate: endDate || null,
        contractualStart: contractualStart || null,
        contractualEnd: contractualEnd || null,
        items,
      });
      setSchedule(updated);
      const execMap: Record<number, string> = {};
      const datesMap: Record<number, { start: string; end: string }> = {};
      updated.items.forEach((item) => {
        execMap[item.ucapId] = String(item.executedQuantity);
        datesMap[item.ucapId] = {
          start: toDateInput(item.ucapStartDate),
          end: toDateInput(item.ucapEndDate),
        };
      });
      setExecuted(execMap);
      setUcapDates(datesMap);
      setIsDirty(false);
      toast.success('Cronograma guardado');
    } catch {
      toast.error('Error al guardar el cronograma');
    } finally {
      setSaving(false);
    }
  };

  // ── refresh plan-to-date sums (for expectedByToday calculation)
  const refreshFromDailyPlans = useCallback(async () => {
    if (!schedule) { setPlanToDateMap({}); return; }
    const today = formatDate(new Date());
    try {
      const data = await schedulesService.getDailyPlans(schedule.scheduleId, '2000-01-01', today);
      const planMap: Record<number, number> = {};
      data.plans.forEach((p) => {
        planMap[p.ucapId] = (planMap[p.ucapId] ?? 0) + p.plannedQuantity;
      });
      setPlanToDateMap(planMap);
    } catch {}
  }, [schedule?.scheduleId]);

  useEffect(() => { refreshFromDailyPlans(); }, [refreshFromDailyPlans]);

  // ── load survey materials + material logs when schedule changes
  useEffect(() => {
    if (!schedule) { setSurveyMaterials([]); setMaterialDailyMap({}); return; }
    Promise.all([
      schedulesService.getMaterialLogs(schedule.scheduleId),
      schedulesService.getWorkSurveyMaterials(schedule.workId),
    ]).then(([logsData, materials]) => {
      setSurveyMaterials(materials);
      const map: Record<string, Record<string, number>> = {};
      logsData.logs.forEach((l) => {
        if (!map[l.usageDate]) map[l.usageDate] = {};
        map[l.usageDate][l.materialCode] = (map[l.usageDate][l.materialCode] ?? 0) + l.quantity;
      });
      setMaterialDailyMap(map);
    }).catch(() => {});
  }, [schedule?.scheduleId]);

  // ── load daily plans when schedule or week changes
  useEffect(() => {
    if (!schedule) { setDailyPlans({}); return; }
    const days = getWeekDays(weekOffset);
    schedulesService.getDailyPlans(schedule.scheduleId, days[0], days[6])
      .then((data) => {
        const map: Record<string, Record<number, { planned: string; executed: string }>> = {};
        data.plans.forEach((p) => {
          if (!map[p.planDate]) map[p.planDate] = {};
          map[p.planDate][p.ucapId] = {
            planned: String(p.plannedQuantity),
            executed: String(p.executedQuantity ?? 0),
          };
        });
        setDailyPlans(map);
      })
      .catch(() => {});
  }, [schedule?.scheduleId, weekOffset]);

  // ── save material logs
  const handleSaveMaterials = async () => {
    if (!schedule) return;
    try {
      setSavingMaterials(true);
      const entries: MaterialLogEntry[] = [];
      Object.entries(materialDailyMap).forEach(([date, matMap]) => {
        Object.entries(matMap).forEach(([code, qty]) => {
          if (qty > 0) {
            const mat = surveyMaterials.find((m) => m.materialCode === code);
            entries.push({
              materialCode: code,
              materialDescription: mat?.materialDescription ?? null,
              unitOfMeasure: mat?.unitOfMeasure ?? null,
              quantity: qty,
              usageDate: date,
            });
          }
        });
      });
      await schedulesService.saveMaterialLogs(schedule.scheduleId, entries);
      toast.success('Materiales guardados');
    } catch {
      toast.error('Error al guardar materiales');
    } finally {
      setSavingMaterials(false);
    }
  };

  // ── save daily plans
  const handleSaveDailyPlans = async () => {
    if (!schedule) return;
    try {
      setSavingDailyPlans(true);
      const items: DailyPlanEntry[] = [];
      Object.entries(dailyPlans).forEach(([date, ucapEntries]) => {
        Object.entries(ucapEntries).forEach(([ucapId, entry]) => {
          const pVal = parseFloat(entry.planned) || 0;
          const eVal = parseFloat(entry.executed) || 0;
          items.push({ ucapId: Number(ucapId), planDate: date, plannedQuantity: pVal, executedQuantity: eVal });
        });
      });
      await schedulesService.upsertDailyPlans(schedule.scheduleId, items);
      await refreshFromDailyPlans();
      setLastSavedDailyPlan(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Plan diario guardado');
    } catch {
      toast.error('Error al guardar el plan diario');
    } finally {
      setSavingDailyPlans(false);
    }
  };

  // ── sync executed quantities from daily plan totals
  const handleSyncExecutedFromPlan = async () => {
    if (!schedule) return;
    const today = formatDate(new Date());
    try {
      const data = await schedulesService.getDailyPlans(schedule.scheduleId, '2000-01-01', today);
      const execMap: Record<number, number> = {};
      data.plans.forEach((p) => {
        execMap[p.ucapId] = (execMap[p.ucapId] ?? 0) + (p.executedQuantity ?? 0);
      });
      setExecuted((prev) => {
        const next = { ...prev };
        schedule.items.forEach((item) => {
          next[item.ucapId] = String(execMap[item.ucapId] ?? 0);
        });
        return next;
      });
      setIsDirty(true);
      toast.success('Ejecutado actualizado desde Plan Diario');
    } catch {
      toast.error('Error al sincronizar ejecutados');
    }
  };

  const monthProgress = currentMonthWorkingDays();

  // ── temporal progress in working days (Mon-Fri=1, Sat=0.5, Sun/holiday=0)
  const temporalProgress = useMemo((): {
    contractual: WorkingDayCount | null;
    operational: WorkingDayCount | null;
  } => ({
    contractual: contractualStart && contractualEnd
      ? workingDayProgress(contractualStart, contractualEnd)
      : null,
    operational: startDate && endDate
      ? workingDayProgress(startDate, endDate)
      : null,
  }), [contractualStart, contractualEnd, startDate, endDate]);

  // ── physical progress: sum(executed) / sum(planned) across all UCAPs
  const physicalProgress = useMemo(() => {
    if (!schedule || !schedule.items.length) return null;
    const totalPlanned = schedule.items.reduce((sum, item) => sum + item.plannedQuantity, 0);
    if (!totalPlanned) return null;
    const totalExecuted = schedule.items.reduce(
      (sum, item) => sum + (parseFloat(executed[item.ucapId] ?? '0') || 0),
      0,
    );
    return clamp01(totalExecuted / totalPlanned) * 100;
  }, [schedule, executed]);

  // ── expected progress today: from daily plan sums when available, else linear interpolation
  const expectedByToday = useMemo(() => {
    if (!schedule || !schedule.items.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const hasPlanData = Object.keys(planToDateMap).length > 0;

    let totalExpected = 0;
    let totalPlanned = 0;
    const perUcap: Record<number, number> = {};

    schedule.items.forEach((item) => {
      totalPlanned += item.plannedQuantity;
      if (hasPlanData) {
        const qty = planToDateMap[item.ucapId] ?? 0;
        perUcap[item.ucapId] = qty;
        totalExpected += qty;
      } else {
        const d = ucapDates[item.ucapId];
        if (d?.start && d?.end) {
          const startMs = parseLocalDate(d.start).getTime();
          const endMs = parseLocalDate(d.end).getTime();
          const temporal = endMs === startMs ? 1 : clamp01((todayMs - startMs) / (endMs - startMs));
          const qty = item.plannedQuantity * temporal;
          perUcap[item.ucapId] = qty;
          totalExpected += qty;
        }
      }
    });

    if (!totalPlanned) return null;
    return { totalExpected, totalPlanned, pct: (totalExpected / totalPlanned) * 100, perUcap, fromPlan: hasPlanData };
  }, [schedule, ucapDates, planToDateMap]);

  // ── status: compare primary temporal reference vs physical
  const currentStatus = useMemo((): WorkStatus | null => {
    const temporal = temporalProgress.contractual?.pct ?? temporalProgress.operational?.pct ?? null;
    if (temporal === null || physicalProgress === null) return null;
    const diff = temporal - physicalProgress;
    if (diff <= 5) return 'on-track';
    if (diff <= 20) return 'at-risk';
    return 'delayed';
  }, [temporalProgress, physicalProgress]);

  useEffect(() => {
    if (!selectedWork || !currentStatus) return;
    setWorkStatuses((prev) => ({ ...prev, [selectedWork.workId]: currentStatus }));
  }, [selectedWork, currentStatus]);

  // ── grouping: actas with 2+ works
  const groupedWorksMap = useMemo(() => {
    const map = new Map<string, Work[]>();
    works
      .filter((w) => w.recordNumber)
      .forEach((w) => {
        const key = w.recordNumber!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      });
    map.forEach((ws, key) => { if (ws.length < 2) map.delete(key); });
    return map;
  }, [works]);

  const individualWorks = useMemo(
    () => works.filter((w) => !w.recordNumber || !groupedWorksMap.has(w.recordNumber)),
    [works, groupedWorksMap],
  );

  // ── filtered works
  const filteredGroupedMap = useMemo(() => {
    if (!search.trim()) return groupedWorksMap;
    const q = search.toLowerCase();
    const result = new Map<string, Work[]>();
    groupedWorksMap.forEach((actaWorks, acta) => {
      const matchesActa = acta.toLowerCase().includes(q);
      const matched = actaWorks.filter(
        (w) => matchesActa || w.name.toLowerCase().includes(q) || (w.workCode ?? '').toLowerCase().includes(q),
      );
      if (matched.length) result.set(acta, matched);
    });
    return result;
  }, [search, groupedWorksMap]);

  const filteredIndividualWorks = useMemo(() => {
    if (!search.trim()) return individualWorks;
    const q = search.toLowerCase();
    return individualWorks.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.recordNumber ?? '').toLowerCase().includes(q) ||
        (w.workCode ?? '').toLowerCase().includes(q),
    );
  }, [individualWorks, search]);

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white flex flex-col">
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
            <div className="flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Cronograma de Obras</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        {accessLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            No tienes departamentos asignados.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedWork(null); setSchedule(null); }}>
            <TabsList className="mb-4 flex-wrap h-auto">
              {departments.map((d) => (
                <TabsTrigger key={d.name} value={d.name}>{d.name}</TabsTrigger>
              ))}
            </TabsList>

            {departments.map((dept) => (
              <TabsContent key={dept.name} value={dept.name}>
                <div className="flex gap-6" style={{ minHeight: '70vh' }}>
                  {/* ── Left: work list ── */}
                  <div className="w-64 flex-shrink-0 flex flex-col gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                      <Input
                        placeholder="Buscar obra o acta..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto border border-[hsl(var(--canalco-neutral-300))] rounded-lg bg-white divide-y divide-[hsl(var(--canalco-neutral-200))]">
                      {loadingWorks ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="w-6 h-6 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                        </div>
                      ) : filteredGroupedMap.size === 0 && filteredIndividualWorks.length === 0 ? (
                        <div className="py-10 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                          No hay obras disponibles
                        </div>
                      ) : (
                        <>
                          {/* ── Obras agrupadas por acta ── */}
                          {filteredGroupedMap.size > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-[hsl(var(--canalco-neutral-100))] flex items-center gap-1.5 sticky top-0 z-10">
                                <Layers className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))]" />
                                <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                                  Obras Agrupadas
                                </span>
                              </div>
                              {Array.from(filteredGroupedMap.entries()).map(([acta, actaWorks]) => (
                                <div key={acta}>
                                  <div className="px-4 py-2 bg-[hsl(var(--canalco-neutral-50))] flex items-center gap-2 border-b border-[hsl(var(--canalco-neutral-200))]">
                                    <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                      Acta {acta}
                                    </span>
                                    <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">
                                      ({actaWorks.length} obras)
                                    </span>
                                  </div>
                                  {actaWorks.map((work) => (
                                    <button
                                      key={work.workId}
                                      onClick={() => handleSelectWork(work)}
                                      className={`w-full text-left px-4 py-3 pl-8 hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0 ${
                                        selectedWork?.workId === work.workId
                                          ? 'bg-[hsl(var(--canalco-primary))]/10 border-l-4 border-l-[hsl(var(--canalco-primary))]'
                                          : ''
                                      }`}
                                    >
                                      <div className="flex items-start gap-2 min-w-0">
                                        {workStatuses[work.workId] && (
                                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                                            workStatuses[work.workId] === 'on-track' ? 'bg-green-500' :
                                            workStatuses[work.workId] === 'at-risk' ? 'bg-amber-500' : 'bg-red-500'
                                          }`} />
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))] leading-tight line-clamp-2">
                                            {work.name}
                                          </p>
                                          {work.workCode && (
                                            <p className="text-xs text-[hsl(var(--canalco-primary))] font-mono mt-0.5">
                                              {work.workCode}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </>
                          )}

                          {/* ── Obras individuales ── */}
                          {filteredIndividualWorks.length > 0 && (
                            <>
                              {filteredGroupedMap.size > 0 && (
                                <div className="px-3 py-1.5 bg-[hsl(var(--canalco-neutral-100))] flex items-center gap-1.5 sticky top-0 z-10">
                                  <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                                    Obras Individuales
                                  </span>
                                </div>
                              )}
                              {filteredIndividualWorks.map((work) => (
                                <button
                                  key={work.workId}
                                  onClick={() => handleSelectWork(work)}
                                  className={`w-full text-left px-4 py-3 hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors ${
                                    selectedWork?.workId === work.workId
                                      ? 'bg-[hsl(var(--canalco-primary))]/10 border-l-4 border-l-[hsl(var(--canalco-primary))]'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    {workStatuses[work.workId] && (
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                                        workStatuses[work.workId] === 'on-track' ? 'bg-green-500' :
                                        workStatuses[work.workId] === 'at-risk' ? 'bg-amber-500' : 'bg-red-500'
                                      }`} />
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))] leading-tight line-clamp-2">
                                        {work.name}
                                      </p>
                                      {work.recordNumber && (
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-0.5">
                                          Acta {work.recordNumber}
                                        </p>
                                      )}
                                      {work.workCode && (
                                        <p className="text-xs text-[hsl(var(--canalco-primary))] font-mono">
                                          {work.workCode}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Right: schedule detail ── */}
                  <div className="flex-1 min-w-0">
                    {!selectedWork ? (
                      <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--canalco-neutral-400))] gap-3">
                        <ClipboardList className="w-12 h-12 opacity-40" />
                        <p className="text-sm">Selecciona una obra para ver su cronograma</p>
                      </div>
                    ) : loadingSchedule ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Work title */}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                              {selectedWork.name}
                            </h2>
                            {selectedWork.recordNumber && (
                              <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                                Acta {selectedWork.recordNumber}
                              </p>
                            )}
                          </div>
                          {isDirty && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex-shrink-0 mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                              Cambios sin guardar
                            </span>
                          )}
                        </div>

                        {/* ── Plan Diario ── */}
                        {schedule && schedule.items.length > 0 && (() => {
                          const days = getWeekDays(weekOffset);
                          const today = formatDate(new Date());
                          const weekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                          const weekHolidaySet = new Set(weekYears.flatMap((y) => [...getColombianHolidays(y)]));
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">
                                  Plan Diario
                                </h3>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setWeekOffset((w) => w - 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">‹</button>
                                  <span className="text-xs text-[hsl(var(--canalco-neutral-600))] min-w-[140px] text-center">
                                    {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                    {' – '}
                                    {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                  <button onClick={() => setWeekOffset((w) => w + 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">›</button>
                                  {weekOffset !== 0 && (
                                    <button onClick={() => setWeekOffset(0)} className="text-xs text-[hsl(var(--canalco-primary))] underline ml-1">
                                      Hoy
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse" style={{ minWidth: 620 }}>
                                  <thead>
                                    <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                      <th colSpan={2} className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2 w-40">UCAP</th>
                                      {days.map((date, i) => {
                                        const d = new Date(date + 'T12:00:00');
                                        const isToday = date === today;
                                        const isHoliday = weekHolidaySet.has(date);
                                        const headerCls = isToday
                                          ? 'text-[hsl(var(--canalco-primary))] font-bold'
                                          : isHoliday
                                          ? 'text-red-500 font-semibold'
                                          : 'text-[hsl(var(--canalco-neutral-600))] font-semibold';
                                        return (
                                          <th key={date} className={`text-center text-xs pb-2 w-16 ${headerCls}`}>
                                            <div>{DAY_LABELS[i]}</div>
                                            <div className="font-normal opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                                          </th>
                                        );
                                      })}
                                      <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-12">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {schedule.items.map((item) => {
                                      const rowPlan = days.reduce((s, d) => s + (parseFloat(dailyPlans[d]?.[item.ucapId]?.planned ?? '') || 0), 0);
                                      const rowExec = days.reduce((s, d) => s + (parseFloat(dailyPlans[d]?.[item.ucapId]?.executed ?? '') || 0), 0);
                                      return (
                                        <Fragment key={item.ucapId}>
                                          {/* Plan row */}
                                          <tr>
                                            <td rowSpan={2} className="py-2 pr-1 align-middle border-b border-[hsl(var(--canalco-neutral-100))] w-32">
                                              <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.ucapCode}</p>
                                              <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{item.ucapDescription}</p>
                                            </td>
                                            <td className="pr-1 pt-2 w-8">
                                              <span className="text-[10px] font-semibold text-[hsl(var(--canalco-neutral-400))] uppercase">P</span>
                                            </td>
                                            {days.map((date) => {
                                              const isHoliday = weekHolidaySet.has(date);
                                              return (
                                                <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={dailyPlans[date]?.[item.ucapId]?.planned ?? ''}
                                                    placeholder="0"
                                                    disabled={isHoliday}
                                                    onChange={(e) => setDailyPlans((prev) => ({
                                                      ...prev,
                                                      [date]: {
                                                        ...prev[date],
                                                        [item.ucapId]: { ...prev[date]?.[item.ucapId] ?? { planned: '', executed: '' }, planned: e.target.value },
                                                      },
                                                    }))}
                                                    className="h-7 w-14 text-xs text-center px-1"
                                                  />
                                                </td>
                                              );
                                            })}
                                            <td className="pt-2 text-center">
                                              <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                                {rowPlan > 0 ? rowPlan : '—'}
                                              </span>
                                            </td>
                                          </tr>
                                          {/* Executed row — editable per day */}
                                          <tr className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                            <td className="pr-1 pb-2 w-8">
                                              <span className="text-[10px] font-semibold text-green-600 uppercase">R</span>
                                            </td>
                                            {days.map((date) => {
                                              const isToday = date === today;
                                              const isHoliday = weekHolidaySet.has(date);
                                              const dayExec = parseFloat(dailyPlans[date]?.[item.ucapId]?.executed ?? '') || 0;
                                              const dayPlan = parseFloat(dailyPlans[date]?.[item.ucapId]?.planned ?? '') || 0;
                                              const color = dayPlan > 0
                                                ? dayExec >= dayPlan ? 'border-green-400 text-green-700' : 'border-red-400 text-red-600'
                                                : '';
                                              return (
                                                <td key={date} className={`py-0.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={dailyPlans[date]?.[item.ucapId]?.executed ?? ''}
                                                    placeholder="0"
                                                    disabled={isHoliday}
                                                    onChange={(e) => setDailyPlans((prev) => ({
                                                      ...prev,
                                                      [date]: {
                                                        ...prev[date],
                                                        [item.ucapId]: { ...prev[date]?.[item.ucapId] ?? { planned: '', executed: '' }, executed: e.target.value },
                                                      },
                                                    }))}
                                                    className={`h-7 w-14 text-xs text-center px-1 ${color}`}
                                                  />
                                                </td>
                                              );
                                            })}
                                            <td className="pb-2 text-center">
                                              <span className="text-xs font-semibold text-green-600">
                                                {rowExec > 0 ? rowExec : '—'}
                                              </span>
                                            </td>
                                          </tr>
                                        </Fragment>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                      <td colSpan={2} className="pt-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total plan</td>
                                      {days.map((date) => {
                                        const t = schedule.items.reduce((s, item) => s + (parseFloat(dailyPlans[date]?.[item.ucapId]?.planned ?? '') || 0), 0);
                                        return (
                                          <td key={date} className={`pt-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                            {t > 0 ? t : '—'}
                                          </td>
                                        );
                                      })}
                                      <td className="pt-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                        {(() => { const g = days.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (parseFloat(dailyPlans[d]?.[i.ucapId]?.planned ?? '') || 0), 0), 0); return g > 0 ? g : '—'; })()}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td colSpan={2} className="pt-1 pb-2 text-xs font-semibold text-green-600">Total real</td>
                                      {days.map((date) => {
                                        const isToday = date === today;
                                        const totalExec = schedule.items.reduce((s, i) => s + (parseFloat(dailyPlans[date]?.[i.ucapId]?.executed ?? '') || 0), 0);
                                        const totalPlan = schedule.items.reduce((s, i) => s + (parseFloat(dailyPlans[date]?.[i.ucapId]?.planned ?? '') || 0), 0);
                                        const color = totalPlan > 0
                                          ? totalExec >= totalPlan ? 'text-green-600' : 'text-red-500'
                                          : 'text-green-600';
                                        return (
                                          <td key={date} className={`pt-1 pb-2 text-center text-xs font-bold ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : weekHolidaySet.has(date) ? 'bg-red-50' : ''}`}>
                                            {totalExec > 0
                                              ? <span className={color}>{totalExec}</span>
                                              : <span className="text-[hsl(var(--canalco-neutral-300))]">—</span>
                                            }
                                          </td>
                                        );
                                      })}
                                      <td className="pt-1 pb-2 text-center text-xs font-bold">
                                        {(() => {
                                          const g = days.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (parseFloat(dailyPlans[d]?.[i.ucapId]?.executed ?? '') || 0), 0), 0);
                                          const gp = days.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (parseFloat(dailyPlans[d]?.[i.ucapId]?.planned ?? '') || 0), 0), 0);
                                          if (g <= 0) return <span className="text-[hsl(var(--canalco-neutral-300))]">—</span>;
                                          const color = gp > 0 ? (g >= gp ? 'text-green-600' : 'text-red-500') : 'text-green-600';
                                          return <span className={color}>{g}</span>;
                                        })()}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>

                              <div className="flex justify-end items-center gap-3 mt-4">
                                {lastSavedDailyPlan && (
                                  <span className="text-xs text-green-600 font-medium">
                                    ✓ Guardado a las {lastSavedDailyPlan}
                                  </span>
                                )}
                                <Button onClick={handleSaveDailyPlans} disabled={savingDailyPlans} variant="outline" className="gap-2 text-sm">
                                  <Save className="w-4 h-4" />
                                  {savingDailyPlans ? 'Guardando...' : 'Guardar plan'}
                                </Button>
                              </div>
                            </section>
                          );
                        })()}

                        {/* ── Dates + Progress (merged cards) ── */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Contractual */}
                          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                            <div className="px-5 pt-5 pb-4">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <h3 className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mt-2">
                                  Contractual
                                </h3>
                                <span className="text-4xl font-bold text-[hsl(var(--canalco-primary))] leading-none">
                                  {temporalProgress.contractual !== null ? `${Math.round(temporalProgress.contractual.pct)}%` : '—'}
                                </span>
                              </div>
                              <ProgressBar value={temporalProgress.contractual?.pct ?? 0} color="primary" />
                            </div>
                            <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] flex gap-3">
                              <div className="flex-1">
                                <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Inicio</Label>
                                <Input
                                  type="date"
                                  value={contractualStart}
                                  onChange={(e) => { setContractualStart(e.target.value); setIsDirty(true); }}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Fin</Label>
                                <Input
                                  type="date"
                                  value={contractualEnd}
                                  onChange={(e) => { setContractualEnd(e.target.value); setIsDirty(true); }}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))] space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[hsl(var(--canalco-neutral-400))]">Contrato</span>
                                <span className="font-semibold text-[hsl(var(--canalco-primary))]">
                                  {temporalProgress.contractual !== null
                                    ? `${temporalProgress.contractual.elapsed} / ${temporalProgress.contractual.total} días`
                                    : '—'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                <span className="font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                  {monthProgress.elapsed} / {monthProgress.total} días hábiles
                                </span>
                              </div>
                            </div>
                          </section>

                          {/* Operativo */}
                          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                            <div className="px-5 pt-5 pb-4">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <h3 className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mt-2">
                                  Operativo
                                </h3>
                                <span className="text-4xl font-bold text-[hsl(var(--canalco-primary))] leading-none">
                                  {temporalProgress.operational !== null ? `${Math.round(temporalProgress.operational.pct)}%` : '—'}
                                </span>
                              </div>
                              <ProgressBar value={temporalProgress.operational?.pct ?? 0} color="primary" />
                            </div>
                            <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] flex gap-3">
                              <div className="flex-1">
                                <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Inicio</Label>
                                <Input
                                  type="date"
                                  value={startDate}
                                  onChange={(e) => { setStartDate(e.target.value); setIsDirty(true); }}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Fin</Label>
                                <Input
                                  type="date"
                                  value={endDate}
                                  onChange={(e) => { setEndDate(e.target.value); setIsDirty(true); }}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))] space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[hsl(var(--canalco-neutral-400))]">Operativo</span>
                                <span className="font-semibold text-[hsl(var(--canalco-primary))]">
                                  {temporalProgress.operational !== null
                                    ? `${temporalProgress.operational.elapsed} / ${temporalProgress.operational.total} días`
                                    : '—'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                <span className="font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                  {monthProgress.elapsed} / {monthProgress.total} días hábiles
                                </span>
                              </div>
                            </div>
                          </section>
                        </div>


                        {/* ── Gantt timeline ── */}
                        {schedule && schedule.items.length > 0 && (() => {
                          const ganttMetas = [
                            ...(contractualStart && contractualEnd ? [{ label: 'Contractual', start: contractualStart, end: contractualEnd, color: 'hsl(var(--canalco-primary))' }] : []),
                            ...(startDate && endDate ? [{ label: 'Operativo', start: startDate, end: endDate, color: '#64748b' }] : []),
                          ];
                          const ganttRows: GanttRow[] = schedule.items
                            .filter((item) => ucapDates[item.ucapId]?.start && ucapDates[item.ucapId]?.end)
                            .map((item) => ({
                              id: item.ucapId,
                              code: item.ucapCode,
                              description: item.ucapDescription,
                              start: ucapDates[item.ucapId].start,
                              end: ucapDates[item.ucapId].end,
                              progress: pct(parseFloat(executed[item.ucapId] ?? '0') || 0, item.plannedQuantity),
                            }));
                          if (ganttMetas.length === 0 && ganttRows.length === 0) return null;
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-4 uppercase tracking-wide">
                                Línea de Tiempo
                              </h3>
                              <GanttTimeline metas={ganttMetas} rows={ganttRows} />
                            </section>
                          );
                        })()}

                        {/* ── UCAP progress ── */}
                        <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">
                              Avance por UCAP
                            </h3>
                            <div className="flex items-center gap-2">
                              {schedule && schedule.items.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSyncExecutedFromPlan}
                                  className="h-7 gap-1.5 text-xs"
                                  title="Suma el ejecutado del Plan Diario y lo vuelca aquí"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Actualizar desde Plan Diario
                                </Button>
                              )}
                              <button
                                onClick={() => setUcapSectionCollapsed((v) => !v)}
                                className="p-1 rounded hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))]"
                                title={ucapSectionCollapsed ? 'Expandir' : 'Colapsar'}
                              >
                                {ucapSectionCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {!ucapSectionCollapsed && ((!schedule || schedule.items.length === 0) ? (
                            <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                              Esta obra no tiene UCAPs registradas en sus levantamientos.
                            </p>
                          ) : (
                            <div className="space-y-5">
                              {schedule.items.map((item) => {
                                const execVal = parseFloat(executed[item.ucapId] ?? '0') || 0;
                                const p = pct(execVal, item.plannedQuantity);
                                const d = ucapDates[item.ucapId] ?? { start: '', end: '' };
                                return (
                                  <div key={item.ucapId} className="border border-[hsl(var(--canalco-neutral-200))] rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                      <div className="min-w-0">
                                        <span className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                                          {item.ucapCode}
                                        </span>
                                        <p className="text-sm text-[hsl(var(--canalco-neutral-800))] leading-tight">
                                          {item.ucapDescription}
                                        </p>
                                      </div>
                                      <span className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] flex-shrink-0">
                                        {Math.round(p)}%
                                      </span>
                                    </div>

                                    {/* Per-UCAP date pickers */}
                                    <div className="flex gap-4 mb-3">
                                      <div>
                                        <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Inicio</Label>
                                        <Input
                                          type="date"
                                          value={d.start}
                                          onChange={(e) => { setUcapDates((prev) => ({ ...prev, [item.ucapId]: { ...prev[item.ucapId] ?? { start: '', end: '' }, start: e.target.value } })); setIsDirty(true); }}
                                          className="mt-0.5 w-36 h-8 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Fin</Label>
                                        <Input
                                          type="date"
                                          value={d.end}
                                          onChange={(e) => { setUcapDates((prev) => ({ ...prev, [item.ucapId]: { ...prev[item.ucapId] ?? { start: '', end: '' }, end: e.target.value } })); setIsDirty(true); }}
                                          className="mt-0.5 w-36 h-8 text-sm"
                                        />
                                      </div>
                                    </div>

                                    <ProgressBar value={p} color="primary" />

                                    {(() => {
                                      const expectedQty = expectedByToday?.perUcap[item.ucapId];
                                      if (expectedQty === undefined) return null;
                                      const execVal = parseFloat(executed[item.ucapId] ?? '0') || 0;
                                      const delta = execVal - expectedQty;
                                      return (
                                        <p className="text-xs mt-2">
                                          <span className="text-[hsl(var(--canalco-neutral-500))]">Esperado hoy: </span>
                                          <span className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{expectedQty.toFixed(2)} uds</span>
                                          {delta < -0.01 && (
                                            <span className="ml-2 text-red-500 font-semibold">
                                              ({delta.toFixed(2)} uds)
                                            </span>
                                          )}
                                          {delta >= -0.01 && (
                                            <span className="ml-2 text-green-600 font-semibold">
                                              (+{Math.max(0, delta).toFixed(2)} uds)
                                            </span>
                                          )}
                                        </p>
                                      );
                                    })()}

                                    <div className="flex items-center gap-4 mt-3">
                                      <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--canalco-neutral-600))]">
                                        <span>Programado:</span>
                                        <span className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                                          {item.plannedQuantity} uds
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 text-sm">
                                        <span className="text-[hsl(var(--canalco-neutral-600))]">Ejecutado:</span>
                                        <span className="inline-flex items-center justify-center w-24 h-8 rounded-md border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] select-none">
                                          {executed[item.ucapId] ?? '0'}
                                        </span>
                                        <span className="text-[hsl(var(--canalco-neutral-600))]">uds</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </section>

                        {/* ── Materiales utilizados ── */}
                        {schedule && (() => {
                          const days = getWeekDays(materialWeekOffset);
                          const today = formatDate(new Date());
                          const matWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                          const matWeekHolidaySet = new Set(matWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">
                                  Materiales Utilizados
                                </h3>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setMaterialWeekOffset((w) => w - 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">‹</button>
                                  <span className="text-xs text-[hsl(var(--canalco-neutral-600))] min-w-[140px] text-center">
                                    {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                    {' – '}
                                    {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                  <button onClick={() => setMaterialWeekOffset((w) => w + 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">›</button>
                                  {materialWeekOffset !== 0 && (
                                    <button onClick={() => setMaterialWeekOffset(0)} className="text-xs text-[hsl(var(--canalco-primary))] underline ml-1">
                                      Hoy
                                    </button>
                                  )}
                                </div>
                              </div>

                              {surveyMaterials.length === 0 ? (
                                <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                                  Esta obra no tiene materiales registrados en sus levantamientos.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
                                    <thead>
                                      <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                        <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Material</th>
                                        <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-16">Unidad</th>
                                        <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                                        {days.map((date, i) => {
                                          const d = new Date(date + 'T12:00:00');
                                          const isToday = date === today;
                                          const isHoliday = matWeekHolidaySet.has(date);
                                          const headerCls = isToday
                                            ? 'text-[hsl(var(--canalco-primary))] font-bold'
                                            : isHoliday
                                            ? 'text-red-500 font-semibold'
                                            : 'text-[hsl(var(--canalco-neutral-600))] font-semibold';
                                          return (
                                            <th key={date} className={`text-center text-xs pb-2 w-16 ${headerCls}`}>
                                              <div>{DAY_LABELS[i]}</div>
                                              <div className="font-normal opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                                            </th>
                                          );
                                        })}
                                        <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-14">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {surveyMaterials.map((mat) => {
                                        const weekTotal = days.reduce((s, d) => s + (materialDailyMap[d]?.[mat.materialCode] ?? 0), 0);
                                        return (
                                          <tr key={mat.materialCode} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                            <td className="py-1.5 pr-2">
                                              <p className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">{mat.materialCode}</p>
                                              <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] leading-tight truncate max-w-[200px]">{mat.materialDescription}</p>
                                            </td>
                                            <td className="py-1.5 px-1 text-center text-xs text-[hsl(var(--canalco-neutral-600))]">
                                              {mat.unitOfMeasure ?? '—'}
                                            </td>
                                            <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                              {mat.totalQuantity}
                                            </td>
                                            {days.map((date) => {
                                              const isToday = date === today;
                                              const isHoliday = matWeekHolidaySet.has(date);
                                              const qty = materialDailyMap[date]?.[mat.materialCode] ?? 0;
                                              return (
                                                <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={qty || ''}
                                                    placeholder="0"
                                                    disabled={isHoliday}
                                                    onChange={(e) => {
                                                      const val = parseFloat(e.target.value) || 0;
                                                      setMaterialDailyMap((prev) => ({
                                                        ...prev,
                                                        [date]: { ...prev[date], [mat.materialCode]: val },
                                                      }));
                                                    }}
                                                    className="h-7 w-14 text-xs text-center px-1"
                                                  />
                                                </td>
                                              );
                                            })}
                                            <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                              {weekTotal > 0 ? weekTotal : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                        <td colSpan={2} className="pt-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total día</td>
                                        <td className="pt-2" />
                                        {days.map((date) => {
                                          const isToday = date === today;
                                          const dayTotal = surveyMaterials.reduce((s, mat) => s + (materialDailyMap[date]?.[mat.materialCode] ?? 0), 0);
                                          return (
                                            <td key={date} className={`pt-2 text-center text-xs font-bold ${isToday ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                              {dayTotal > 0 ? dayTotal : '—'}
                                            </td>
                                          );
                                        })}
                                        <td className="pt-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                          {(() => { const g = days.reduce((s, d) => s + surveyMaterials.reduce((ss, mat) => ss + (materialDailyMap[d]?.[mat.materialCode] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}

                              <div className="flex justify-end mt-4">
                                <Button onClick={handleSaveMaterials} disabled={savingMaterials} variant="outline" className="gap-2 text-sm">
                                  <Save className="w-4 h-4" />
                                  {savingMaterials ? 'Guardando...' : 'Guardar materiales'}
                                </Button>
                              </div>
                            </section>
                          );
                        })()}


                        {/* ── Save button ── */}
                        <div className="flex justify-end pb-6">
                          <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 gap-2"
                          >
                            <Save className="w-4 h-4" />
                            {saving ? 'Guardando...' : 'Guardar Cronograma'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </div>
  );
}
