import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { useAuth } from '@/contexts/AuthContext';
import { mapToDepartments, getMunicipioName, type Municipality } from '@/utils/departmentMapper';
import { surveysService, type Work, type WorkActa } from '@/services/surveys.service';
import { schedulesService, type ScheduleDetail, type DailyPlanEntry, type MaterialLogEntry, type SurveyMaterialItem, type DailyExecutionEntry, type ExecutionItem, type PurchaseComparisonItem } from '@/services/schedules.service';
import { directorBudgetsService, type DirectorBudget } from '@/services/director-budgets.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { materialsService, type Material } from '@/services/materials.service';
import { Home, ArrowLeft, Save, Search, CalendarRange, ClipboardList, Layers, Plus, X, Trash2, MapPin, TrendingUp, TrendingDown, Activity, Package, BarChart3, Clock, ShoppingCart } from 'lucide-react';
import { workingDayProgress, parseLocalDate, type WorkingDayCount, getColombianHolidays, currentMonthWorkingDays } from '@/utils/colombianCalendar';
import { GanttTimeline, type GanttRow } from '@/components/GanttTimeline';
import { ActaGantt, buildActaGanttObras, type ActaGanttObra } from '@/components/ActaGantt';
import { ResponsiveContainer, ComposedChart, Area, Line as RLine, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, PieChart, Pie, Cell, BarChart, Bar, Legend, LabelList } from 'recharts';

import { clamp01, toDateInput, pct, formatDate, getWeekDays, DAY_LABELS, isSunday, isSaturday, addWorkingDays, mapWithLimit, normalizeLocationName, DEFAULT_ACTIVITY_OPTIONS } from './cronograma/helpers';
import type { WorkStatus, DailyPlanCell, DailyPlanMap, ActaScheduleRow, ActaDailyPlanMap, NumberDailyMap, ActaMaterialRow, ActaActivityRowsMap, ActaNumberDailyMap, ActaPurchaseComparisonMap } from './cronograma/types';
import { WeekNav } from './cronograma/components/WeekNav';
import { ProgressBar } from './cronograma/components/ProgressBar';

// ─── main component ──────────────────────────────────────────────────────────

export default function CronogramaPage() {
  const navigate = useNavigate();
  const { access, loading: accessLoading } = useSurveyAccess();

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapToDepartments(access.companies, access.projects || []);
  }, [access]);

  const [activeTab, setActiveTab] = useState('');
  const [activeMunicipality, setActiveMunicipality] = useState<Municipality | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);

  // ── Vista de acta (Gantt de todas las obras del acta)
  const [selectedActa, setSelectedActa] = useState<string | null>(null);
  // Flujo de revisión del Plan del cronograma (Director de Proyecto → Director Técnico).
  const [actaCronograma, setActaCronograma] = useState<WorkActa | null>(null);
  const [actaCompanyId, setActaCompanyId] = useState<number | null>(null);
  const [cronogramaActionLoading, setCronogramaActionLoading] = useState(false);
  const [cronogramaRejectOpen, setCronogramaRejectOpen] = useState(false);
  const [cronogramaRejectMotivo, setCronogramaRejectMotivo] = useState('');
  const [actaGanttObras, setActaGanttObras] = useState<ActaGanttObra[]>([]);
  const [actaScheduleRows, setActaScheduleRows] = useState<ActaScheduleRow[]>([]);
  const [actaDailyPlans, setActaDailyPlans] = useState<ActaDailyPlanMap>({});
  const [actaContractualDates, setActaContractualDates] = useState<Record<number, { start: string; end: string }>>({});
  const [actaMaterialRows, setActaMaterialRows] = useState<ActaMaterialRow[]>([]);
  const [actaMaterialDailyMap, setActaMaterialDailyMap] = useState<ActaNumberDailyMap>({});
  const [actaActivityRows, setActaActivityRows] = useState<ActaActivityRowsMap>({});
  const [actaActivityDailyMap, setActaActivityDailyMap] = useState<ActaNumberDailyMap>({});
  const [actaExecMaterialDailyMap, setActaExecMaterialDailyMap] = useState<ActaNumberDailyMap>({});
  const [actaExecActivityRows, setActaExecActivityRows] = useState<ActaActivityRowsMap>({});
  const [actaExecActivityDailyMap, setActaExecActivityDailyMap] = useState<ActaNumberDailyMap>({});
  const [actaPurchaseComparisonMap, setActaPurchaseComparisonMap] = useState<ActaPurchaseComparisonMap>({});
  const [actaDirectorBudgets, setActaDirectorBudgets] = useState<DirectorBudget[]>([]);
  const [purchaseChartView, setPurchaseChartView] = useState<'quantities' | 'values'>('quantities');
  const [loadingActa, setLoadingActa] = useState(false);
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
  const [savingActaDailyPlans, setSavingActaDailyPlans] = useState(false);
  const [lastSavedActaDailyPlan, setLastSavedActaDailyPlan] = useState<string | null>(null);
  const [savingActaContractual, setSavingActaContractual] = useState(false);
  const [lastSavedActaContractual, setLastSavedActaContractual] = useState<string | null>(null);
  const [actaContractualDays, setActaContractualDays] = useState('');
  const [savingActaMaterials, setSavingActaMaterials] = useState(false);
  const [lastSavedActaMaterials, setLastSavedActaMaterials] = useState<string | null>(null);
  const [savingActaActivities, setSavingActaActivities] = useState(false);
  const [lastSavedActaActivities, setLastSavedActaActivities] = useState<string | null>(null);
  const [savingActaExecUcaps, setSavingActaExecUcaps] = useState(false);
  const [lastSavedActaExecUcaps, setLastSavedActaExecUcaps] = useState<string | null>(null);
  const [savingActaExecMaterials, setSavingActaExecMaterials] = useState(false);
  const [lastSavedActaExecMaterials, setLastSavedActaExecMaterials] = useState<string | null>(null);
  const [savingActaExecActivities, setSavingActaExecActivities] = useState(false);
  const [lastSavedActaExecActivities, setLastSavedActaExecActivities] = useState<string | null>(null);
  // sum of planned quantities per ucap from all daily plans up to today
  const [planToDateMap, setPlanToDateMap] = useState<Record<number, number>>({});
  const [surveyMaterials, setSurveyMaterials] = useState<SurveyMaterialItem[]>([]);
  // date → materialCode → quantity (holds ALL historical data)
  const [materialDailyMap, setMaterialDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [materialWeekOffset, setMaterialWeekOffset] = useState(0);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);
  const [activityWeekOffset, setActivityWeekOffset] = useState(0);
  const [cronogramaTab, setCronogramaTab] = useState('plan');
  const [activityRows, setActivityRows] = useState<Array<{ id: string; name: string }>>([]);
  const [customActivityOptions, setCustomActivityOptions] = useState<string[]>([]);
  const [newCustomActivity, setNewCustomActivity] = useState('');
  const [showAddActivityInput, setShowAddActivityInput] = useState(false);
  const [activityDailyMap, setActivityDailyMap] = useState<Record<string, Record<string, number>>>({});

  // ── Ejecución states
  const [execWeekOffset, setExecWeekOffset] = useState(0);
  const [execMaterialWeekOffset, setExecMaterialWeekOffset] = useState(0);
  const [execActivityWeekOffset, setExecActivityWeekOffset] = useState(0);
  const [execDailyMap, setExecDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [execMaterialDailyMap, setExecMaterialDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [execMaterialUnitPrices, setExecMaterialUnitPrices] = useState<Record<string, string>>({});
  // materiales agregados manualmente a la ejecución (no estaban en el levantamiento)
  const [extraExecMaterials, setExtraExecMaterials] = useState<Array<{ id: string; code: string; description: string; unitOfMeasure: string | null; budgetQty: number; budgetValue: number }>>([]);
  // metadatos (label/UM/presupuesto) por itemKey traídos de la ejecución guardada — para reconstruir filas extra
  const [execMaterialMeta, setExecMaterialMeta] = useState<Record<string, { label: string | null; unitOfMeasure: string | null; budgetQty: number; budgetValue: number }>>({});
  const [materialCatalog, setMaterialCatalog] = useState<Material[]>([]);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  // Materiales extra agregados manualmente en la ejecución consolidada del acta.
  const [actaExtraExecMaterials, setActaExtraExecMaterials] = useState<Array<{ code: string; description: string; unitOfMeasure: string | null }>>([]);
  const [execActivityRows, setExecActivityRows] = useState<Array<{ id: string; name: string }>>([]);
  const [execActivityDailyMap, setExecActivityDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [purchaseComparison, setPurchaseComparison] = useState<PurchaseComparisonItem[]>([]);

  // Todas las fechas con datos (plan y ejecución), para que la columna "Total"
  // muestre el acumulado de todo el cronograma y no solo la semana visible.
  const allDataDates = useMemo(() => {
    const set = new Set<string>();
    const addWorkMap = (m: Record<number, Record<string, unknown>>) => {
      for (const wid in m) for (const d in m[wid]) set.add(d);
    };
    const addDateMap = (m: Record<string, unknown>) => {
      for (const d in m) set.add(d);
    };
    addWorkMap(actaDailyPlans as any);
    addWorkMap(actaMaterialDailyMap as any);
    addWorkMap(actaActivityDailyMap as any);
    addWorkMap(actaExecMaterialDailyMap as any);
    addWorkMap(actaExecActivityDailyMap as any);
    addDateMap(dailyPlans);
    addDateMap(materialDailyMap);
    addDateMap(activityDailyMap);
    addDateMap(execDailyMap);
    addDateMap(execMaterialDailyMap);
    addDateMap(execActivityDailyMap);
    return Array.from(set);
  }, [actaDailyPlans, actaMaterialDailyMap, actaActivityDailyMap, actaExecMaterialDailyMap, actaExecActivityDailyMap, dailyPlans, materialDailyMap, activityDailyMap, execDailyMap, execMaterialDailyMap, execActivityDailyMap]);

  // ── Informe: full daily-history for the S-curve
  const [reportPlans, setReportPlans] = useState<DailyPlanEntry[]>([]);

  // ── Informe Operativo: ucapId → unit value (COP)
  const [ucapValueMap, setUcapValueMap] = useState<Map<number, number>>(new Map());

  // ── Permisos por rol en el Cronograma
  //   PQRS y "Director de Proyecto" son familias de roles (por municipio/región) → match por prefijo.
  const { user } = useAuth();
  const role = user?.nombreRol ?? '';
  const isPQRS = role.startsWith('PQRS');
  const isDirectorProyecto = role.startsWith('Director de Proyecto');
  const isGerencia = role === 'Gerencia';
  const isGerenciaProyectos = role === 'Gerencia de Proyectos';
  const isDirectorTecnico = role === 'Director Técnico';
  // Usuarios maestros (PMO / Super Admin): acceso total al cronograma (ven y editan todo)
  const isMaster = role === 'Super Admin' || role === 'Analista PMO' || role === 'Director PMO';
  // ── Estado del flujo de revisión del Plan del cronograma
  const cronogramaStatus = actaCronograma?.cronogramaStatus ?? 'pendiente';
  // El plan queda bloqueado mientras está en revisión o ya fue aprobado.
  const planLocked = cronogramaStatus === 'en_revision' || cronogramaStatus === 'aprobado';
  // Ejecución/Informe/Operativo se habilitan solo cuando el plan está aprobado.
  const cronogramaApproved = cronogramaStatus === 'aprobado';
  // Analista PMO, Director PMO y Super Admin navegan libremente sin esperar la aprobación del plan.
  const canNavigateFreely = role === 'Analista PMO' || role === 'Director PMO' || role === 'Super Admin';
  // Acceso a otras pestañas: plan aprobado, o rol con navegación libre.
  const canAccessOtherTabs = cronogramaApproved || canNavigateFreely;
  const canSubmitCronograma = (isDirectorProyecto || isMaster) && (cronogramaStatus === 'pendiente' || cronogramaStatus === 'rechazado');
  const canReviewCronograma = (isDirectorTecnico || isMaster) && cronogramaStatus === 'en_revision';
  // Plan: edita Director de Proyecto · los demás solo ven · bloqueado en revisión/aprobado
  const canEditPlan = (isDirectorProyecto || isMaster) && !planLocked;
  // Ejecución: editan PQRS y Director de Proyecto · los demás solo ven
  const canEditEjecucion = isPQRS || isDirectorProyecto || isMaster;
  // Informe: solo Gerencia · Operativo: Director de Proyecto, Gerencia de Proyectos y Director Técnico
  const canSeeInforme = isGerencia || isMaster;
  const canSeeOperativo = isDirectorProyecto || isGerenciaProyectos || isDirectorTecnico || isMaster;
  // Edición del presupuesto de materiales extra (dentro de Operativo): dueño del dato + maestros
  const canEditOperativo = isDirectorProyecto || isMaster;

  // ── set active tab on first load
  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  // ── si la pestaña activa deja de ser accesible para el rol, volver a Plan
  useEffect(() => {
    if ((cronogramaTab === 'informe' && !canSeeInforme) || ((cronogramaTab === 'operativo' || cronogramaTab === 'graficos') && !canSeeOperativo)) {
      setCronogramaTab('plan');
    }
  }, [cronogramaTab, canSeeInforme, canSeeOperativo]);

  // ── Ejecución/Informe/Operativo solo si el Plan del cronograma está aprobado.
  useEffect(() => {
    if (!canAccessOtherTabs && cronogramaTab !== 'plan') {
      setCronogramaTab('plan');
    }
  }, [canAccessOtherTabs, cronogramaTab]);

  // ── active department + auto-select its first municipality when the tab changes
  const activeDept = useMemo(() => departments.find((d) => d.name === activeTab), [activeTab, departments]);

  useEffect(() => {
    if (activeDept && activeDept.municipalities.length > 0) {
      setActiveMunicipality(activeDept.municipalities[0]);
    } else {
      setActiveMunicipality(null);
    }
  }, [activeDept]);

  // ── load works when tab changes
  //    incluye el companyId del departamento + el companyId padre de sus proyectos
  //    (ej. Ciudad Bolívar / Pueblorrico son proyectos de "Canales & Contactos" → trae sus obras)
  const activeCompanyIds = useMemo(() => {
    if (!activeDept) return [];
    const ids = new Set<number>(activeDept.companyIds);
    activeDept.projects.forEach((p) => { if (p.companyId) ids.add(p.companyId); });
    return [...ids];
  }, [activeDept]);

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
    setSelectedActa(null);
    setActaGanttObras([]);
    setActaScheduleRows([]);
    setActaDailyPlans({});
    setLastSavedActaDailyPlan(null);
    setActaContractualDates({});
    setLastSavedActaContractual(null);
    setActaMaterialRows([]);
    setActaMaterialDailyMap({});
    setLastSavedActaMaterials(null);
    setActaActivityRows({});
    setActaActivityDailyMap({});
    setLastSavedActaActivities(null);
    setActaExecMaterialDailyMap({});
    setActaExtraExecMaterials([]);
    setActaExecActivityRows({});
    setActaExecActivityDailyMap({});
    setActaPurchaseComparisonMap({});
    setLastSavedActaExecUcaps(null);
    setLastSavedActaExecMaterials(null);
    setLastSavedActaExecActivities(null);
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
    setSelectedActa(null);
    setActaGanttObras([]);
    setActaScheduleRows([]);
    setActaDailyPlans({});
    setLastSavedActaDailyPlan(null);
    setActaContractualDates({});
    setLastSavedActaContractual(null);
    setActaMaterialRows([]);
    setActaMaterialDailyMap({});
    setLastSavedActaMaterials(null);
    setActaActivityRows({});
    setActaActivityDailyMap({});
    setLastSavedActaActivities(null);
    setActaExecMaterialDailyMap({});
    setActaExtraExecMaterials([]);
    setActaExecActivityRows({});
    setActaExecActivityDailyMap({});
    setActaPurchaseComparisonMap({});
    setLastSavedActaExecUcaps(null);
    setLastSavedActaExecMaterials(null);
    setLastSavedActaExecActivities(null);
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
      setActivityWeekOffset(0);
      setActivityRows([]);
      setActivityDailyMap({});
      setExecWeekOffset(0);
      setExecActivityWeekOffset(0);
      setExecDailyMap({});
      setExecMaterialDailyMap({});
      setExecMaterialUnitPrices({});
      setExecMaterialWeekOffset(0);
      setExecActivityRows([]);
      setExecActivityDailyMap({});
      setUcapValueMap(new Map());
      setIsDirty(false);
      // Fetch UCAP unit values for the Informe Operativo (company-wide catalog, no projectId filter)
      surveysService.getUcaps(work.companyId).then(({ ucaps }) => {
        const vmap = new Map<number, number>();
        ucaps.forEach((u) => vmap.set(u.ucapId, Number(u.value) || 0));
        setUcapValueMap(vmap);
      }).catch(() => { /* ucap values not available */ });
    } catch {
      toast.error('Error al cargar el cronograma');
    } finally {
      setLoadingSchedule(false);
    }
  }, [isDirty]);

  // ── select an acta → load all its works' schedules and build the Gantt rows
  const handleSelectActa = useCallback(async (acta: string, actaWorks: Work[]) => {
    if (isDirty) {
      const ok = window.confirm('Tienes cambios sin guardar. ¿Deseas continuar y perder los cambios?');
      if (!ok) return;
    }
    setSelectedWork(null);
    setSchedule(null);
    setIsDirty(false);
    setSelectedActa(acta);
    // Estado del flujo de revisión del Plan para esta acta (empresa = la de sus obras).
    const actaCompany = actaWorks[0]?.companyId ?? null;
    setActaCompanyId(actaCompany);
    setActaCronograma(null);
    setActaDirectorBudgets([]);
    if (actaCompany != null) {
      surveysService.getWorkActa(actaCompany, acta)
        .then((wa) => setActaCronograma(wa))
        .catch(() => setActaCronograma(null));
    }
    setActaGanttObras([]);
    setActaScheduleRows([]);
    setActaDailyPlans({});
    setLastSavedActaDailyPlan(null);
    setActaContractualDates({});
    setLastSavedActaContractual(null);
    setActaMaterialRows([]);
    setActaMaterialDailyMap({});
    setLastSavedActaMaterials(null);
    setActaActivityRows({});
    setActaActivityDailyMap({});
    setLastSavedActaActivities(null);
    setActaExecMaterialDailyMap({});
    setActaExtraExecMaterials([]);
    setActaExecActivityRows({});
    setActaExecActivityDailyMap({});
    setActaPurchaseComparisonMap({});
    setLastSavedActaExecUcaps(null);
    setLastSavedActaExecMaterials(null);
    setLastSavedActaExecActivities(null);
    setWeekOffset(0);
    setCronogramaTab('plan');
    try {
      setLoadingActa(true);
      const extraMatMetaAccum = new Map<string, { description: string; unitOfMeasure: string | null }>();
      const results = await mapWithLimit(actaWorks, 5, async (w): Promise<{
        work: Work;
        schedule: ScheduleDetail;
        plans: DailyPlanEntry[];
        materials: SurveyMaterialItem[];
        materialLogs: MaterialLogEntry[];
        purchaseComparison: PurchaseComparisonItem[];
        activityRows: Array<{ id: string; name: string }>;
        activityMap: NumberDailyMap;
        execMaterialMap: NumberDailyMap;
        execActivityRows: Array<{ id: string; name: string }>;
        execActivityMap: NumberDailyMap;
      }> => {
        try {
          const s = await schedulesService.getByWork(w.workId);
          let plans: DailyPlanEntry[] = [];
          let materials: SurveyMaterialItem[] = [];
          let materialLogs: MaterialLogEntry[] = [];
          let purchaseComparison: PurchaseComparisonItem[] = [];
          let storedActivityRows: Array<{ id: string; name: string }> = [];
          let storedActivityMap: NumberDailyMap = {};
          let execMaterialMap: NumberDailyMap = {};
          let execActivityRows: Array<{ id: string; name: string }> = [];
          let execActivityMap: NumberDailyMap = {};
          // Ejecutado real = suma de la ejecución diaria registrada por UCAP
          // (misma fuente que usa el Informe), no schedule_items.
          const execByUcap = new Map<number, number>();
          // Rango del plan diario por UCAP (primera/última fecha con planeado > 0)
          const planByUcap = new Map<number, { start: string; end: string }>();
          if (s.items.length > 0) {
            try {
              const dp = await schedulesService.getDailyPlans(s.scheduleId, '2020-01-01', '2035-12-31');
              plans = dp.plans;
              for (const p of plans) {
                execByUcap.set(p.ucapId, (execByUcap.get(p.ucapId) ?? 0) + (p.executedQuantity ?? 0));
                if ((p.plannedQuantity ?? 0) > 0) {
                  const cur = planByUcap.get(p.ucapId);
                  if (!cur) planByUcap.set(p.ucapId, { start: p.planDate, end: p.planDate });
                  else {
                    if (p.planDate < cur.start) cur.start = p.planDate;
                    if (p.planDate > cur.end) cur.end = p.planDate;
                  }
                }
              }
            } catch { /* sin plan/ejecución diaria */ }
          }
          try {
            const [workMaterials, logsData, comparison] = await Promise.all([
              schedulesService.getWorkSurveyMaterials(w.workId),
              schedulesService.getMaterialLogs(s.scheduleId),
              schedulesService.getWorkPurchaseComparison(w.workId),
            ]);
            materials = workMaterials;
            materialLogs = logsData.logs;
            purchaseComparison = comparison;
          } catch { /* sin materiales del acta */ }
          try {
            const storedRows = localStorage.getItem(`activity-rows-${s.scheduleId}`);
            const storedMap = localStorage.getItem(`activity-map-${s.scheduleId}`);
            if (storedRows) storedActivityRows = JSON.parse(storedRows);
            if (storedMap) storedActivityMap = JSON.parse(storedMap);
          } catch { /* sin actividades locales */ }
          try {
            const execMaterials = await schedulesService.getExecutions(s.scheduleId, 'material');
            execMaterialMap = {};
            execMaterials.items.forEach((it) => {
              if (it.itemKey && !extraMatMetaAccum.has(it.itemKey)) {
                extraMatMetaAccum.set(it.itemKey, { description: it.label ?? '', unitOfMeasure: it.unitOfMeasure ?? null });
              }
              if (!it.executionDate || it.quantity <= 0) return;
              if (!execMaterialMap[it.executionDate]) execMaterialMap[it.executionDate] = {};
              execMaterialMap[it.executionDate][it.itemKey] = (execMaterialMap[it.executionDate][it.itemKey] ?? 0) + it.quantity;
            });
          } catch { /* sin ejecucion de materiales */ }
          try {
            const execActivities = await schedulesService.getExecutions(s.scheduleId, 'activity');
            const names = new Map<string, string>();
            const dmap: NumberDailyMap = {};
            execActivities.items.forEach((it) => {
              if (!names.has(it.itemKey)) names.set(it.itemKey, it.label ?? '');
              if (it.executionDate) {
                if (!dmap[it.executionDate]) dmap[it.executionDate] = {};
                dmap[it.executionDate][it.itemKey] = it.quantity;
              }
            });
            execActivityRows = [...names.entries()].map(([id, name]) => ({ id, name }));
            execActivityMap = dmap;
          } catch { /* sin ejecucion de actividades */ }
          const execActivityNames = new Set(execActivityRows.map((row) => row.name.trim()).filter(Boolean));
          storedActivityRows.forEach((row) => {
            const name = row.name.trim();
            if (!name || execActivityNames.has(name)) return;
            execActivityNames.add(name);
            execActivityRows.push({ id: `exec-act-plan-${s.scheduleId}-${name}`, name });
          });

          const enriched: ScheduleDetail = {
            ...s,
            items: s.items.map((it) => {
              const plan = planByUcap.get(it.ucapId);
              return {
                ...it,
                executedQuantity: execByUcap.get(it.ucapId) ?? it.executedQuantity,
                // Barra de la UCAP posicionada por el plan diario (si existe).
                ucapStartDate: plan?.start ?? it.ucapStartDate,
                ucapEndDate: plan?.end ?? it.ucapEndDate,
              };
            }),
          };
          return {
            work: w,
            schedule: enriched,
            plans,
            materials,
            materialLogs,
            purchaseComparison,
            activityRows: storedActivityRows,
            activityMap: storedActivityMap,
            execMaterialMap,
            execActivityRows,
            execActivityMap,
          };
        } catch {
          // Si falla la carga, igual incluimos la obra (en 0%) para no descuadrar
          // el conteo del acta.
          return {
            work: w,
            schedule: {
              scheduleId: 0,
              workId: w.workId,
              startDate: null,
              endDate: null,
              contractualStart: null,
              contractualEnd: null,
              ippFactor: 0,
              items: [],
            },
            plans: [],
            materials: [],
            materialLogs: [],
            purchaseComparison: [],
            activityRows: [],
            activityMap: {},
            execMaterialMap: {},
            execActivityRows: [],
            execActivityMap: {},
          };
        }
      });
      setActaGanttObras(buildActaGanttObras(results));
      setActaScheduleRows(results.map(({ work, schedule }) => ({ work, schedule })));
      setActaMaterialRows(results.map(({ work, schedule, materials }) => ({ work, schedule, materials })));
      const planMap: ActaDailyPlanMap = {};
      const contractualMap: Record<number, { start: string; end: string }> = {};
      const materialMap: ActaNumberDailyMap = {};
      const activityRowsMap: ActaActivityRowsMap = {};
      const activityDailyMap: ActaNumberDailyMap = {};
      const execMaterialDailyMap: ActaNumberDailyMap = {};
      const execActivityRowsMap: ActaActivityRowsMap = {};
      const execActivityDailyMap: ActaNumberDailyMap = {};
      const purchaseComparisonMap: ActaPurchaseComparisonMap = {};
      results.forEach(({ work, plans }) => {
        const workPlans: DailyPlanMap = {};
        plans.forEach((plan) => {
          if (!workPlans[plan.planDate]) workPlans[plan.planDate] = {};
          workPlans[plan.planDate][plan.ucapId] = {
            planned: String(plan.plannedQuantity ?? 0),
            executed: String(plan.executedQuantity ?? 0),
          };
        });
        planMap[work.workId] = workPlans;
      });
      setActaDailyPlans(planMap);
      results.forEach(({ work, schedule, materialLogs, purchaseComparison, activityRows, activityMap, execMaterialMap, execActivityRows, execActivityMap }) => {
        contractualMap[work.workId] = {
          start: toDateInput(schedule.contractualStart),
          end: toDateInput(schedule.contractualEnd),
        };
        const workMaterialMap: NumberDailyMap = {};
        materialLogs.forEach((log) => {
          if (!workMaterialMap[log.usageDate]) workMaterialMap[log.usageDate] = {};
          workMaterialMap[log.usageDate][log.materialCode] = (workMaterialMap[log.usageDate][log.materialCode] ?? 0) + log.quantity;
        });
        materialMap[work.workId] = workMaterialMap;
        activityRowsMap[work.workId] = activityRows;
        activityDailyMap[work.workId] = activityMap;
        execMaterialDailyMap[work.workId] = execMaterialMap;
        execActivityRowsMap[work.workId] = execActivityRows;
        execActivityDailyMap[work.workId] = execActivityMap;
        purchaseComparisonMap[work.workId] = purchaseComparison;
      });
      setActaContractualDates(contractualMap);
      setActaMaterialDailyMap(materialMap);
      setActaActivityRows(activityRowsMap);
      setActaActivityDailyMap(activityDailyMap);
      setActaExecMaterialDailyMap(execMaterialDailyMap);
      // Reconstruir materiales extra (ejecutados con un código que no está en los levantamientos).
      const surveyCodes = new Set<string>();
      results.forEach(({ materials }) => materials.forEach((m) => surveyCodes.add(m.materialCode)));
      const execCodes = new Set<string>();
      Object.values(execMaterialDailyMap).forEach((dm) =>
        Object.values(dm).forEach((day) => Object.keys(day).forEach((c) => execCodes.add(c))),
      );
      setActaExtraExecMaterials(
        [...extraMatMetaAccum.entries()]
          .filter(([code]) => !surveyCodes.has(code) && execCodes.has(code))
          .map(([code, meta]) => ({ code, description: meta.description, unitOfMeasure: meta.unitOfMeasure })),
      );
      setActaExecActivityRows(execActivityRowsMap);
      setActaExecActivityDailyMap(execActivityDailyMap);
      setActaPurchaseComparisonMap(purchaseComparisonMap);
    } catch {
      toast.error('Error al cargar el cronograma del acta');
    } finally {
      setLoadingActa(false);
    }
  }, [isDirty]);

  // ── Flujo de revisión del Plan del cronograma
  const handleSubmitCronograma = useCallback(async () => {
    if (!selectedActa || actaCompanyId == null) return;
    try {
      setCronogramaActionLoading(true);
      const wa = await surveysService.submitActaCronograma(actaCompanyId, selectedActa);
      setActaCronograma(wa);
      toast.success('Plan enviado a revisión del Director Técnico');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo enviar a revisión');
    } finally {
      setCronogramaActionLoading(false);
    }
  }, [selectedActa, actaCompanyId]);

  const handleReviewCronograma = useCallback(async (decision: 'aprobado' | 'rechazado', motivo?: string) => {
    if (!selectedActa || actaCompanyId == null) return;
    try {
      setCronogramaActionLoading(true);
      const wa = await surveysService.reviewActaCronograma(actaCompanyId, selectedActa, decision, motivo);
      setActaCronograma(wa);
      setCronogramaRejectOpen(false);
      setCronogramaRejectMotivo('');
      toast.success(decision === 'aprobado' ? 'Plan aprobado. Ejecución habilitada.' : 'Plan devuelto al Director de Proyecto');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo completar la revisión');
    } finally {
      setCronogramaActionLoading(false);
    }
  }, [selectedActa, actaCompanyId]);

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

  // ── load survey materials + material logs + purchase comparison when schedule changes
  useEffect(() => {
    if (!schedule) { setSurveyMaterials([]); setMaterialDailyMap({}); setPurchaseComparison([]); return; }
    Promise.all([
      schedulesService.getMaterialLogs(schedule.scheduleId),
      schedulesService.getWorkSurveyMaterials(schedule.workId),
      schedulesService.getWorkPurchaseComparison(schedule.workId),
    ]).then(([logsData, materials, comparison]) => {
      setSurveyMaterials(materials);
      setPurchaseComparison(comparison);
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
        setDailyPlans((prev) => {
          const next = { ...prev };
          days.forEach((d) => { next[d] = map[d] ?? {}; });
          return next;
        });
      })
      .catch(() => {});
  }, [schedule?.scheduleId, weekOffset]);

  // ── load full daily-plan history for the Informe S-curve
  useEffect(() => {
    if (!schedule) { setReportPlans([]); return; }
    schedulesService.getDailyPlans(schedule.scheduleId, '2000-01-01', '2100-12-31')
      .then((data) => setReportPlans(data.plans))
      .catch(() => setReportPlans([]));
  }, [schedule?.scheduleId, lastSavedDailyPlan]);

  // ── load Ejecución (UCAPs, materiales, actividades) from backend when schedule changes
  useEffect(() => {
    if (!schedule) {
      setExecDailyMap({}); setExecMaterialDailyMap({}); setExecMaterialUnitPrices({}); setExecMaterialMeta({}); setExtraExecMaterials([]); setExecActivityRows([]); setExecActivityDailyMap({});
      return;
    }
    const sid = schedule.scheduleId;
    // Ejecución UCAPs → executed_quantity del plan diario
    schedulesService.getDailyPlans(sid, '2000-01-01', '2100-12-31')
      .then((data) => {
        const map: Record<string, Record<string, number>> = {};
        data.plans.forEach((p) => {
          if ((p.executedQuantity ?? 0) !== 0) {
            if (!map[p.planDate]) map[p.planDate] = {};
            map[p.planDate][p.ucapId] = p.executedQuantity ?? 0;
          }
        });
        setExecDailyMap(map);
      }).catch(() => {});
    // Ejecución materiales → map diario + filas activas + precios + metadatos
    schedulesService.getExecutions(sid, 'material')
      .then((data) => {
        const map: Record<string, Record<string, number>> = {};
        const prices: Record<string, string> = {};
        const meta: Record<string, { label: string | null; unitOfMeasure: string | null; budgetQty: number; budgetValue: number }> = {};
        data.items.forEach((it) => {
          if (it.executionDate && it.quantity > 0) {
            if (!map[it.executionDate]) map[it.executionDate] = {};
            map[it.executionDate][it.itemKey] = (map[it.executionDate][it.itemKey] ?? 0) + it.quantity;
          }
          if (it.unitPrice != null && prices[it.itemKey] === undefined) prices[it.itemKey] = String(it.unitPrice);
          // marker (executionDate null): lleva el presupuesto del material extra (cantidad/valor)
          if (it.executionDate == null) {
            meta[it.itemKey] = { label: it.label ?? null, unitOfMeasure: it.unitOfMeasure ?? null, budgetQty: it.quantity ?? 0, budgetValue: it.unitPrice ?? 0 };
          } else if (meta[it.itemKey] === undefined) {
            meta[it.itemKey] = { label: it.label ?? null, unitOfMeasure: it.unitOfMeasure ?? null, budgetQty: 0, budgetValue: 0 };
          }
        });
        setExecMaterialDailyMap(map);
        setExecMaterialUnitPrices(prices);
        setExecMaterialMeta(meta);
      }).catch(() => {});
    // Ejecución actividades (reconstruye filas + mapa diario)
    schedulesService.getExecutions(sid, 'activity')
      .then((data) => {
        const names = new Map<string, string>();
        const dmap: Record<string, Record<string, number>> = {};
        data.items.forEach((it) => {
          if (it.label && !names.get(it.itemKey)) names.set(it.itemKey, it.label);
          else if (!names.has(it.itemKey)) names.set(it.itemKey, it.label ?? '');
          if (it.executionDate) {
            if (!dmap[it.executionDate]) dmap[it.executionDate] = {};
            dmap[it.executionDate][it.itemKey] = it.quantity;
          }
        });
        setExecActivityRows([...names.entries()].map(([id, name]) => ({ id, name })));
        setExecActivityDailyMap(dmap);
      }).catch(() => {});
  }, [schedule?.scheduleId]);

  // ── load material catalog once (for the "Agregar material" picker)
  useEffect(() => {
    materialsService.getMaterials().then(setMaterialCatalog).catch(() => {});
  }, []);

  // ── reconstruct extra material rows: executions whose itemKey is not a survey material
  useEffect(() => {
    const surveyCodes = new Set(surveyMaterials.map((m) => m.materialCode));
    const extras = Object.entries(execMaterialMeta)
      .filter(([code]) => !surveyCodes.has(code))
      .map(([code, m]) => ({ id: `extra-${code}`, code, description: m.label ?? '', unitOfMeasure: m.unitOfMeasure ?? null, budgetQty: m.budgetQty ?? 0, budgetValue: m.budgetValue ?? 0 }));
    setExtraExecMaterials(extras);
  }, [surveyMaterials, execMaterialMeta]);

  useEffect(() => {
    if (!selectedActa || !activeTab) {
      setActaDirectorBudgets([]);
      return;
    }
    let cancelled = false;
    directorBudgetsService.getAll({ departmentName: activeTab, page: 1, limit: 500 })
      .then((response) => {
        if (cancelled) return;
        const directBudgets = response.data
          .filter((item) => item.workId == null && item.workName === selectedActa)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        if (directBudgets.length > 0) {
          setActaDirectorBudgets([directBudgets[0]]);
          return;
        }

        const actaWorkIds = new Set(actaScheduleRows.map(({ work }) => work.workId));
        const actaWorkNames = new Set(actaScheduleRows.map(({ work }) => work.name?.trim()).filter(Boolean));
        const projectBudgets = response.data
          .filter((item) => (
            (item.workId != null && actaWorkIds.has(item.workId)) ||
            (!!item.workName && actaWorkNames.has(item.workName.trim()))
          ))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const latestByWork = new Map<string, DirectorBudget>();
        projectBudgets.forEach((budget) => {
          const key = budget.workId != null ? `id-${budget.workId}` : `name-${budget.workName ?? budget.budgetId}`;
          if (!latestByWork.has(key)) latestByWork.set(key, budget);
        });
        setActaDirectorBudgets([...latestByWork.values()]);
      })
      .catch(() => {
        if (!cancelled) setActaDirectorBudgets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedActa, activeTab, actaScheduleRows]);

  const addExtraMaterial = (mat: Material) => {
    setExtraExecMaterials((prev) => prev.some((r) => r.code === mat.code) ? prev : [...prev, { id: `extra-${mat.code}`, code: mat.code, description: mat.description, unitOfMeasure: null, budgetQty: 0, budgetValue: 0 }]);
    setAddMaterialOpen(false);
  };

  const addActaExtraMaterial = (mat: Material) => {
    setActaExtraExecMaterials((prev) => prev.some((r) => r.code === mat.code) ? prev : [...prev, { code: mat.code, description: mat.description, unitOfMeasure: null }]);
    setAddMaterialOpen(false);
  };

  const removeActaExtraMaterial = (code: string) => {
    setActaExtraExecMaterials((prev) => prev.filter((r) => r.code !== code));
    setActaExecMaterialDailyMap((prev) => {
      const next: ActaNumberDailyMap = {};
      Object.entries(prev).forEach(([wid, dm]) => {
        const ndm: NumberDailyMap = {};
        Object.entries(dm).forEach(([date, day]) => {
          const nd = { ...day };
          delete nd[code];
          ndm[date] = nd;
        });
        next[Number(wid)] = ndm;
      });
      return next;
    });
  };

  const updateActaExtraMaterial = (code: string, patch: Partial<{ unitOfMeasure: string | null }>) => {
    setActaExtraExecMaterials((prev) => prev.map((r) => r.code === code ? { ...r, ...patch } : r));
  };

  const updateExtraMaterial = (id: string, patch: Partial<{ unitOfMeasure: string | null; budgetQty: number; budgetValue: number }>) => {
    setExtraExecMaterials((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const removeExtraMaterial = (id: string) => {
    const row = extraExecMaterials.find((r) => r.id === id);
    setExtraExecMaterials((prev) => prev.filter((r) => r.id !== id));
    if (row?.code) {
      setExecMaterialDailyMap((dm) => {
        const next: Record<string, Record<string, number>> = {};
        Object.entries(dm).forEach(([date, m]) => { const mm = { ...m }; delete mm[row.code]; next[date] = mm; });
        return next;
      });
    }
  };

  // ── load activity rows from localStorage when schedule changes
  useEffect(() => {
    if (!schedule) { setActivityRows([]); setActivityDailyMap({}); return; }
    try {
      const storedRows = localStorage.getItem(`activity-rows-${schedule.scheduleId}`);
      if (storedRows) setActivityRows(JSON.parse(storedRows));
      const storedMap = localStorage.getItem(`activity-map-${schedule.scheduleId}`);
      if (storedMap) setActivityDailyMap(JSON.parse(storedMap));
    } catch {}
  }, [schedule?.scheduleId]);

  // ── Las actividades del Plan Diario también aparecen en Ejecución (para registrar su
  //    avance), aunque todavía no tengan ejecución en el backend. Se siembran por NOMBRE
  //    (que es como el Informe empareja Plan↔Ejecución). Es idempotente: si no hay nada
  //    nuevo que agregar devuelve la misma referencia y no re-renderiza (sin bucles), y
  //    se reaplica si la carga async del backend reemplaza las filas de ejecución.
  useEffect(() => {
    if (!schedule) return;
    const planNames = [...new Set(activityRows.map((r) => r.name.trim()).filter(Boolean))];
    if (planNames.length === 0) return;
    setExecActivityRows((prev) => {
      const existing = new Set(prev.map((r) => r.name.trim()).filter(Boolean));
      const toAdd = planNames
        .filter((name) => !existing.has(name))
        .map((name) => ({ id: `exec-act-plan-${schedule.scheduleId}-${name}`, name }));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, [activityRows, execActivityRows, schedule?.scheduleId]);

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

  // ── activity row handlers
  const addActivityRow = () => {
    setActivityRows((prev) => [...prev, { id: `act-${Date.now()}`, name: '' }]);
  };

  const removeActivityRow = (id: string) => {
    setActivityRows((prev) => prev.filter((r) => r.id !== id));
    setActivityDailyMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((date) => {
        const { [id]: _, ...rest } = next[date];
        next[date] = rest;
      });
      return next;
    });
  };

  const handleSaveActivities = () => {
    if (!schedule) return;
    localStorage.setItem(`activity-rows-${schedule.scheduleId}`, JSON.stringify(activityRows));
    localStorage.setItem(`activity-map-${schedule.scheduleId}`, JSON.stringify(activityDailyMap));
    toast.success('Actividades guardadas');
  };

  // ── ejecución handlers (persisten en backend)
  const handleSaveExecUcaps = async () => {
    if (!schedule) return;
    try {
      const items: DailyExecutionEntry[] = [];
      Object.entries(execDailyMap).forEach(([date, ucapMap]) => {
        Object.entries(ucapMap).forEach(([ucapId, qty]) => {
          items.push({ ucapId: Number(ucapId), planDate: date, executedQuantity: qty || 0 });
        });
      });
      await schedulesService.saveDailyExecution(schedule.scheduleId, items);
      toast.success('Ejecución UCAPs guardada');
    } catch {
      toast.error('Error al guardar la ejecución de UCAPs');
    }
  };

  const handleSaveExecMaterials = async () => {
    if (!schedule) return;
    try {
      const items: ExecutionItem[] = [];
      // metadatos por código: levantamiento (precio de ejecución) + agregados manualmente (presupuesto editable)
      const metaByCode = new Map<string, { label: string | null; unitOfMeasure: string | null; isExtra: boolean; budgetQty: number; budgetValue: number }>();
      surveyMaterials.forEach((m) => metaByCode.set(m.materialCode, { label: m.materialDescription ?? null, unitOfMeasure: m.unitOfMeasure ?? null, isExtra: false, budgetQty: 0, budgetValue: 0 }));
      extraExecMaterials.filter((r) => r.code).forEach((r) => metaByCode.set(r.code, { label: r.description || null, unitOfMeasure: r.unitOfMeasure ?? null, isExtra: true, budgetQty: r.budgetQty || 0, budgetValue: r.budgetValue || 0 }));
      // Marker por fila (executionDate null). Extra: cantidad=Ppto, unitPrice=Ppto.$ · Levantamiento: precio de ejecución
      metaByCode.forEach((meta, code) => {
        if (meta.isExtra) {
          items.push({ itemKey: code, label: meta.label, unitOfMeasure: meta.unitOfMeasure, executionDate: null, quantity: meta.budgetQty, unitPrice: meta.budgetValue > 0 ? meta.budgetValue : null });
        } else {
          const upStr = execMaterialUnitPrices[code] ?? '';
          const up = upStr ? parseFloat(upStr) : null;
          items.push({ itemKey: code, label: meta.label, unitOfMeasure: meta.unitOfMeasure, executionDate: null, quantity: 0, unitPrice: up && up > 0 ? up : null });
        }
      });
      // Daily quantities
      Object.entries(execMaterialDailyMap).forEach(([date, matMap]) => {
        Object.entries(matMap).forEach(([code, qty]) => {
          if (qty > 0) {
            const meta = metaByCode.get(code);
            const upStr = execMaterialUnitPrices[code] ?? '';
            const up = meta?.isExtra ? null : (upStr ? parseFloat(upStr) : null);
            items.push({
              itemKey: code,
              label: meta?.label ?? null,
              unitOfMeasure: meta?.unitOfMeasure ?? null,
              executionDate: date,
              quantity: qty,
              unitPrice: up && up > 0 ? up : null,
            });
          }
        });
      });
      await schedulesService.saveExecutions(schedule.scheduleId, 'material', items);
      toast.success('Ejecución materiales guardada');
    } catch {
      toast.error('Error al guardar la ejecución de materiales');
    }
  };

  const handleSaveExecActivities = async () => {
    if (!schedule) return;
    try {
      const items: ExecutionItem[] = [];
      // fila "etiqueta" por actividad para conservar nombre/id aunque no tenga cantidades
      execActivityRows.forEach((row) => {
        items.push({ itemKey: row.id, label: row.name, executionDate: null, quantity: 0 });
      });
      Object.entries(execActivityDailyMap).forEach(([date, rowMap]) => {
        Object.entries(rowMap).forEach(([rowId, qty]) => {
          if (qty > 0) {
            const row = execActivityRows.find((r) => r.id === rowId);
            items.push({ itemKey: rowId, label: row?.name ?? null, executionDate: date, quantity: qty });
          }
        });
      });
      await schedulesService.saveExecutions(schedule.scheduleId, 'activity', items);
      toast.success('Ejecución actividades guardada');
    } catch {
      toast.error('Error al guardar la ejecución de actividades');
    }
  };

  const removeExecActivityRow = (id: string) => {
    setExecActivityRows((prev) => prev.filter((r) => r.id !== id));
    setExecActivityDailyMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((date) => { const d = { ...next[date] }; delete d[id]; next[date] = d; });
      return next;
    });
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

  const handleSaveActaDailyPlans = async () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaDailyPlans(true);
      await Promise.all(rowsWithSchedule.map(({ work, schedule }) => {
        const items: DailyPlanEntry[] = [];
        Object.entries(actaDailyPlans[work.workId] ?? {}).forEach(([date, ucapEntries]) => {
          Object.entries(ucapEntries).forEach(([ucapId, entry]) => {
            const plannedQuantity = parseFloat(entry.planned) || 0;
            const executedQuantity = parseFloat(entry.executed) || 0;
            items.push({
              ucapId: Number(ucapId),
              planDate: date,
              plannedQuantity,
              executedQuantity,
            });
          });
        });
        return schedulesService.upsertDailyPlans(schedule.scheduleId, items);
      }));
      setLastSavedActaDailyPlan(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Plan diario del acta guardado');
    } catch {
      toast.error('Error al guardar el plan diario del acta');
    } finally {
      setSavingActaDailyPlans(false);
    }
  };

  const handleSaveActaExecUcaps = async () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaExecUcaps(true);
      await Promise.all(rowsWithSchedule.map(({ work, schedule }) => {
        const items: DailyExecutionEntry[] = [];
        Object.entries(actaDailyPlans[work.workId] ?? {}).forEach(([date, ucapEntries]) => {
          Object.entries(ucapEntries).forEach(([ucapId, entry]) => {
            items.push({
              ucapId: Number(ucapId),
              planDate: date,
              executedQuantity: parseFloat(entry.executed) || 0,
            });
          });
        });
        return schedulesService.saveDailyExecution(schedule.scheduleId, items);
      }));
      setLastSavedActaExecUcaps(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Ejecución UCAPs del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecución de UCAPs del acta');
    } finally {
      setSavingActaExecUcaps(false);
    }
  };

  const handleSaveActaExecMaterials = async () => {
    const rowsWithSchedule = actaMaterialRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaExecMaterials(true);
      const extraMetaByCode = new Map(actaExtraExecMaterials.map((r) => [r.code, r]));
      const extraMarkerWorkId = rowsWithSchedule[0]?.work.workId;
      await Promise.all(rowsWithSchedule.map(({ work, schedule, materials }) => {
        const items: ExecutionItem[] = [];
        const metaByCode = new Map<string, SurveyMaterialItem>();
        materials.forEach((mat) => {
          metaByCode.set(mat.materialCode, mat);
          items.push({
            itemKey: mat.materialCode,
            label: mat.materialDescription ?? null,
            unitOfMeasure: mat.unitOfMeasure ?? null,
            executionDate: null,
            quantity: 0,
            unitPrice: null,
          });
        });
        if (work.workId === extraMarkerWorkId) {
          actaExtraExecMaterials.forEach((extra) => {
            items.push({
              itemKey: extra.code,
              label: extra.description || null,
              unitOfMeasure: extra.unitOfMeasure ?? null,
              executionDate: null,
              quantity: 0,
              unitPrice: null,
            });
          });
        }
        Object.entries(actaExecMaterialDailyMap[work.workId] ?? {}).forEach(([date, matMap]) => {
          Object.entries(matMap).forEach(([code, qty]) => {
            if (qty > 0) {
              const mat = metaByCode.get(code);
              const extra = extraMetaByCode.get(code);
              items.push({
                itemKey: code,
                label: mat?.materialDescription ?? extra?.description ?? null,
                unitOfMeasure: mat?.unitOfMeasure ?? extra?.unitOfMeasure ?? null,
                executionDate: date,
                quantity: qty,
                unitPrice: null,
              });
            }
          });
        });
        return schedulesService.saveExecutions(schedule.scheduleId, 'material', items);
      }));
      setLastSavedActaExecMaterials(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Ejecución de materiales del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecución de materiales del acta');
    } finally {
      setSavingActaExecMaterials(false);
    }
  };

  const handleSaveActaExecActivities = async () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaExecActivities(true);
      await Promise.all(rowsWithSchedule.map(({ work, schedule }) => {
        const rows = actaExecActivityRows[work.workId] ?? [];
        const items: ExecutionItem[] = [];
        rows.forEach((row) => {
          items.push({ itemKey: row.id, label: row.name, executionDate: null, quantity: 0 });
        });
        Object.entries(actaExecActivityDailyMap[work.workId] ?? {}).forEach(([date, rowMap]) => {
          Object.entries(rowMap).forEach(([rowId, qty]) => {
            if (qty > 0) {
              const row = rows.find((r) => r.id === rowId);
              items.push({ itemKey: rowId, label: row?.name ?? null, executionDate: date, quantity: qty });
            }
          });
        });
        return schedulesService.saveExecutions(schedule.scheduleId, 'activity', items);
      }));
      setLastSavedActaExecActivities(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Ejecución de actividades del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecución de actividades del acta');
    } finally {
      setSavingActaExecActivities(false);
    }
  };

  const handleSaveActaContractual = async () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaContractual(true);
      const updatedSchedules = await Promise.all(rowsWithSchedule.map(({ work, schedule }) => {
        const dates = actaContractualDates[work.workId] ?? { start: '', end: '' };
        return schedulesService.update(schedule.scheduleId, {
          contractualStart: dates.start || null,
          contractualEnd: dates.end || null,
        });
      }));
      const updatedById = new Map(updatedSchedules.map((updated) => [updated.scheduleId, updated]));
      setActaScheduleRows((prev) => prev.map((row) => ({
        ...row,
        schedule: updatedById.get(row.schedule.scheduleId) ?? row.schedule,
      })));
      setActaMaterialRows((prev) => prev.map((row) => ({
        ...row,
        schedule: updatedById.get(row.schedule.scheduleId) ?? row.schedule,
      })));
      setLastSavedActaContractual(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Fechas contractuales del acta guardadas');
    } catch {
      toast.error('Error al guardar las fechas contractuales del acta');
    } finally {
      setSavingActaContractual(false);
    }
  };

  const handleSaveActaMaterials = async () => {
    const rowsWithSchedule = actaMaterialRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaMaterials(true);
      await Promise.all(rowsWithSchedule.map(({ work, schedule, materials }) => {
        const entries: MaterialLogEntry[] = [];
        Object.entries(actaMaterialDailyMap[work.workId] ?? {}).forEach(([date, matMap]) => {
          Object.entries(matMap).forEach(([code, qty]) => {
            if (qty > 0) {
              const mat = materials.find((m) => m.materialCode === code);
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
        return schedulesService.saveMaterialLogs(schedule.scheduleId, entries);
      }));
      setLastSavedActaMaterials(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Materiales del acta guardados');
    } catch {
      toast.error('Error al guardar los materiales del acta');
    } finally {
      setSavingActaMaterials(false);
    }
  };

  const handleSaveActaActivities = () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaActivities(true);
      rowsWithSchedule.forEach(({ work, schedule }) => {
        localStorage.setItem(`activity-rows-${schedule.scheduleId}`, JSON.stringify(actaActivityRows[work.workId] ?? []));
        localStorage.setItem(`activity-map-${schedule.scheduleId}`, JSON.stringify(actaActivityDailyMap[work.workId] ?? {}));
      });
      setLastSavedActaActivities(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Actividades del acta guardadas');
    } catch {
      toast.error('Error al guardar las actividades del acta');
    } finally {
      setSavingActaActivities(false);
    }
  };

  const renderActaExecutionTab = () => {
    const renderUcaps = () => {
      if (actaScheduleRows.length === 0) return null;
      const days = getWeekDays(execWeekOffset);
      const today = formatDate(new Date());
      const weekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
      const holidaySet = new Set(weekYears.flatMap((y) => [...getColombianHolidays(y)]));
      const rowsWithItems = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0 && schedule.items.length > 0);
      const getExecuted = (workId: number, date: string, ucapId: number) =>
        parseFloat(actaDailyPlans[workId]?.[date]?.[ucapId]?.executed ?? '') || 0;
      const getWorkDateTotal = (workId: number, items: ScheduleDetail['items'], date: string) =>
        items.reduce((sum, item) => sum + getExecuted(workId, date, item.ucapId), 0);

      return (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecución UCAPs
            </h3>
            <WeekNav days={days} offset={execWeekOffset} onPrev={() => setExecWeekOffset((w) => w - 1)} onNext={() => setExecWeekOffset((w) => w + 1)} onToday={() => setExecWeekOffset(0)} />
          </div>

          {rowsWithItems.length === 0 ? (
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
              No hay UCAPs registradas en los proyectos de esta acta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                    <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Proyecto / UCAP</th>
                    <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                    {days.map((date, i) => {
                      const d = new Date(date + 'T12:00:00');
                      const isToday = date === today;
                      const isHoliday = holidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                  {rowsWithItems.map(({ work, schedule }) => {
                    const workTotal = allDataDates.reduce((sum, date) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
                    return (
                      <Fragment key={work.workId}>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t border-[hsl(var(--canalco-neutral-200))]">
                          <td colSpan={2} className="py-2 pr-2 align-middle">
                            <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{work.name}</p>
                            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{work.workCode || 'Sin codigo'}</p>
                          </td>
                          {days.map((date) => {
                            const dateTotal = getWorkDateTotal(work.workId, schedule.items, date);
                            return (
                              <td key={date} className={`py-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                {dateTotal > 0 ? dateTotal : '-'}
                              </td>
                            );
                          })}
                          <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                            {workTotal > 0 ? workTotal : '-'}
                          </td>
                        </tr>
                        {schedule.items.map((item) => {
                          const weekTotal = allDataDates.reduce((sum, date) => sum + getExecuted(work.workId, date, item.ucapId), 0);
                          return (
                            <tr key={`${work.workId}-${item.ucapId}`} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                              <td className="py-1.5 pr-2 pl-4">
                                <p className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">{item.ucapCode}</p>
                                <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] leading-tight truncate max-w-[260px]">{item.ucapDescription}</p>
                              </td>
                              <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                {item.plannedQuantity}
                              </td>
                              {days.map((date) => {
                                const isToday = date === today;
                                const isHoliday = holidaySet.has(date) || isSunday(date) || isSaturday(date);
                                const val = getExecuted(work.workId, date, item.ucapId);
                                return (
                                  <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={val || ''}
                                      placeholder="0"
                                      disabled={isHoliday || !canEditEjecucion}
                                      onChange={(e) => setActaDailyPlans((prev) => {
                                        const workPlans = prev[work.workId] ?? {};
                                        const datePlans = workPlans[date] ?? {};
                                        const cell = datePlans[item.ucapId] ?? { planned: '', executed: '' };
                                        return {
                                          ...prev,
                                          [work.workId]: {
                                            ...workPlans,
                                            [date]: {
                                              ...datePlans,
                                              [item.ucapId]: { ...cell, executed: e.target.value },
                                            },
                                          },
                                        };
                                      })}
                                      className="h-7 w-14 text-xs text-center px-1"
                                    />
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                {weekTotal > 0 ? weekTotal : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                    <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                    <td className="pt-2" />
                    {days.map((date) => {
                      const dayTotal = rowsWithItems.reduce((sum, { work, schedule }) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
                      return (
                        <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                          {dayTotal > 0 ? dayTotal : '-'}
                        </td>
                      );
                    })}
                    <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                      {(() => {
                        const total = allDataDates.reduce((sum, date) => (
                          sum + rowsWithItems.reduce((workSum, { work, schedule }) => workSum + getWorkDateTotal(work.workId, schedule.items, date), 0)
                        ), 0);
                        return total > 0 ? total : '-';
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {canEditEjecucion && (
            <div className="flex justify-end items-center gap-3 mt-4">
              {lastSavedActaExecUcaps && (
                <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaExecUcaps}</span>
              )}
              <Button onClick={handleSaveActaExecUcaps} disabled={savingActaExecUcaps} variant="outline" className="gap-2 text-sm">
                <Save className="w-4 h-4" />
                {savingActaExecUcaps ? 'Guardando...' : 'Guardar ejecución'}
              </Button>
            </div>
          )}
        </section>
      );
    };

    const renderMaterials = () => {
      if (actaMaterialRows.length === 0) return null;
      const days = getWeekDays(execMaterialWeekOffset);
      const today = formatDate(new Date());
      const matWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
      const matWeekHolidaySet = new Set(matWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
      const rowsWithMaterials = actaMaterialRows.filter(({ schedule, materials }) => schedule.scheduleId > 0 && materials.length > 0);
      const getMaterialQty = (workId: number, date: string, code: string) =>
        actaExecMaterialDailyMap[workId]?.[date]?.[code] ?? 0;
      const getWorkMaterialDateTotal = (workId: number, materials: SurveyMaterialItem[], date: string) =>
        materials.reduce((sum, mat) => sum + getMaterialQty(workId, date, mat.materialCode), 0);

      // ── Consolidación general por material: un renglón por código sumando todos
      //    los proyectos del acta. La ejecución diaria es general (suma de todos los
      //    proyectos que tienen ese material); al editar se atribuye al primer proyecto
      //    (repWorkId) y se deja en 0 en los demás, para que la suma cuadre y se guarde
      //    bien contra el schedule de cada obra.
      type ConsolidatedMat = {
        code: string;
        description: string | null;
        unit: string | null;
        totalQuantity: number;
        workIds: number[];
        repWorkId: number;
        isExtra?: boolean;
      };
      const consolidatedMap = new Map<string, ConsolidatedMat>();
      rowsWithMaterials.forEach(({ work, materials }) => {
        materials.forEach((mat) => {
          const existing = consolidatedMap.get(mat.materialCode);
          if (existing) {
            existing.totalQuantity += mat.totalQuantity;
            if (!existing.workIds.includes(work.workId)) existing.workIds.push(work.workId);
          } else {
            consolidatedMap.set(mat.materialCode, {
              code: mat.materialCode,
              description: mat.materialDescription ?? null,
              unit: mat.unitOfMeasure ?? null,
              totalQuantity: mat.totalQuantity,
              workIds: [work.workId],
              repWorkId: work.workId,
            });
          }
        });
      });
      // Materiales extra del acta: se atribuyen al primer proyecto con cronograma.
      const repWorkId = rowsWithMaterials[0]?.work.workId
        ?? actaMaterialRows.find((r) => r.schedule.scheduleId > 0)?.work.workId;
      if (repWorkId !== undefined) {
        actaExtraExecMaterials.forEach((ex) => {
          if (consolidatedMap.has(ex.code)) return;
          consolidatedMap.set(ex.code, {
            code: ex.code,
            description: ex.description || null,
            unit: ex.unitOfMeasure ?? null,
            totalQuantity: 0,
            workIds: [repWorkId],
            repWorkId,
            isExtra: true,
          });
        });
      }
      const consolidatedMaterials = [...consolidatedMap.values()];
      const getConsolidatedQty = (cm: ConsolidatedMat, date: string) =>
        cm.workIds.reduce((sum, wid) => sum + getMaterialQty(wid, date, cm.code), 0);
      const setConsolidatedQty = (cm: ConsolidatedMat, date: string, val: number) => {
        setActaExecMaterialDailyMap((prev) => {
          const next = { ...prev };
          cm.workIds.forEach((wid) => {
            const workMap = { ...(next[wid] ?? {}) };
            const dateMap = { ...(workMap[date] ?? {}) };
            dateMap[cm.code] = wid === cm.repWorkId ? val : 0;
            workMap[date] = dateMap;
            next[wid] = workMap;
          });
          return next;
        });
      };

      return (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecución Materiales
            </h3>
            <WeekNav days={days} offset={execMaterialWeekOffset} onPrev={() => setExecMaterialWeekOffset((w) => w - 1)} onNext={() => setExecMaterialWeekOffset((w) => w + 1)} onToday={() => setExecMaterialWeekOffset(0)} />
          </div>

          {rowsWithMaterials.length === 0 ? (
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
              Los proyectos de esta acta no tienen materiales registrados en sus levantamientos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                    <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Material</th>
                    <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-16">Unidad</th>
                    {days.map((date, i) => {
                      const d = new Date(date + 'T12:00:00');
                      const isToday = date === today;
                      // Sábados, domingos y festivos se marcan en rojo (indicador visual).
                      const isHoliday = matWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                  {consolidatedMaterials.map((cm) => {
                    const weekTotal = allDataDates.reduce((sum, date) => sum + getConsolidatedQty(cm, date), 0);
                    return (
                      <tr key={cm.code} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">{cm.code}</p>
                            {cm.isExtra && (
                              <span className="text-[9px] font-semibold uppercase tracking-wide rounded px-1 py-0.5 bg-amber-100 text-amber-700">Extra</span>
                            )}
                            {cm.isExtra && canEditEjecucion && (
                              <button
                                type="button"
                                onClick={() => removeActaExtraMaterial(cm.code)}
                                title="Eliminar material extra"
                                className="text-[hsl(var(--canalco-neutral-400))] hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] leading-tight truncate max-w-[260px]">{cm.description}</p>
                        </td>
                        <td className="py-1.5 px-1 text-center text-xs text-[hsl(var(--canalco-neutral-600))]">
                          {cm.isExtra && canEditEjecucion ? (
                            <Input
                              value={cm.unit ?? ''}
                              placeholder="U/M"
                              onChange={(e) => updateActaExtraMaterial(cm.code, { unitOfMeasure: e.target.value || null })}
                              className="h-7 w-16 text-xs text-center px-1 mx-auto"
                            />
                          ) : (
                            cm.unit ?? '-'
                          )}
                        </td>
                        {days.map((date) => {
                          const isToday = date === today;
                          // En materiales solo el domingo es no laboral; sábados y festivos se pueden registrar.
                          const isBlocked = isSunday(date);
                          const qty = getConsolidatedQty(cm, date);
                          return (
                            <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isBlocked ? 'bg-red-100' : ''}`}>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={qty || ''}
                                placeholder="0"
                                disabled={isBlocked || !canEditEjecucion}
                                onChange={(e) => setConsolidatedQty(cm, date, parseFloat(e.target.value) || 0)}
                                className="h-7 w-14 text-xs text-center px-1"
                              />
                            </td>
                          );
                        })}
                        <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                          {weekTotal > 0 ? weekTotal : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                    <td colSpan={2} className="pt-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                    {days.map((date) => {
                      const dayTotal = rowsWithMaterials.reduce((sum, { work, materials }) => sum + getWorkMaterialDateTotal(work.workId, materials, date), 0);
                      return (
                        <td key={date} className={`pt-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                          {dayTotal > 0 ? dayTotal : '-'}
                        </td>
                      );
                    })}
                    <td className="pt-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                      {(() => {
                        const total = allDataDates.reduce((sum, date) => (
                          sum + rowsWithMaterials.reduce((workSum, { work, materials }) => workSum + getWorkMaterialDateTotal(work.workId, materials, date), 0)
                        ), 0);
                        return total > 0 ? total : '-';
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {canEditEjecucion && (
            <div className="flex justify-between items-center gap-3 mt-4">
              <Popover open={addMaterialOpen} onOpenChange={setAddMaterialOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" />Agregar material</Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Buscar material..." className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="py-4 text-xs text-[hsl(var(--canalco-neutral-500))]">Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {materialCatalog
                          .filter((m) => !actaMaterialRows.some(({ materials }) => materials.some((s) => s.materialCode === m.code)) && !actaExtraExecMaterials.some((r) => r.code === m.code))
                          .map((m) => (
                            <CommandItem key={m.materialId} value={`${m.code} ${m.description}`} onSelect={() => addActaExtraMaterial(m)} className="text-xs gap-2">
                              <span className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">{m.code}</span>
                              <span className="truncate text-[hsl(var(--canalco-neutral-700))]">{m.description}</span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-3">
                {lastSavedActaExecMaterials && (
                  <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaExecMaterials}</span>
                )}
                <Button onClick={handleSaveActaExecMaterials} disabled={savingActaExecMaterials} variant="outline" className="gap-2 text-sm">
                  <Save className="w-4 h-4" />
                  {savingActaExecMaterials ? 'Guardando...' : 'Guardar ejecución'}
                </Button>
              </div>
            </div>
          )}
        </section>
      );
    };

    const renderActivities = () => {
      if (actaScheduleRows.length === 0) return null;
      const days = getWeekDays(execActivityWeekOffset);
      const today = formatDate(new Date());
      const actWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
      const actWeekHolidaySet = new Set(actWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
      const activityWorks = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
      const getActivityQty = (workId: number, date: string, rowId: string) =>
        actaExecActivityDailyMap[workId]?.[date]?.[rowId] ?? 0;
      const activityGroupMap = new Map<string, {
        key: string;
        name: string;
        entries: Array<{ work: Work; schedule: ScheduleDetail; row: { id: string; name: string }; source: 'plan' | 'exec' }>;
        dayTotals: Record<string, number>;
        total: number;
      }>();
      activityWorks.forEach(({ work, schedule }) => {
        const execRows = actaExecActivityRows[work.workId] ?? [];
        const plannedRows = actaActivityRows[work.workId] ?? [];
        const execNames = new Set(execRows.map((row) => row.name.trim().toLocaleLowerCase('es-CO')).filter(Boolean));
        const rows = [
          ...execRows.map((row) => ({ row, source: 'exec' as const })),
          ...plannedRows
            .map((row) => ({ row, name: row.name.trim() }))
            .filter(({ name }) => name && !execNames.has(name.toLocaleLowerCase('es-CO')))
            .map(({ row, name }) => ({
              row: { id: `exec-act-plan-${schedule.scheduleId}-${name.toLocaleLowerCase('es-CO')}`, name },
              source: 'plan' as const,
            })),
        ];
        rows.forEach((row) => {
          const name = row.row.name.trim();
          const key = name ? name.toLocaleLowerCase('es-CO') : `__blank-${work.workId}-${row.row.id}`;
          const group = activityGroupMap.get(key) ?? {
            key,
            name,
            entries: [],
            dayTotals: {},
            total: 0,
          };
          group.entries.push({ work, schedule, row: row.row, source: row.source });
          days.forEach((date) => {
            const qty = row.source === 'exec' ? getActivityQty(work.workId, date, row.row.id) : 0;
            group.dayTotals[date] = (group.dayTotals[date] ?? 0) + qty;
            group.total += qty;
          });
          activityGroupMap.set(key, group);
        });
      });
      const activityGroups = [...activityGroupMap.values()].sort((a, b) => {
        if (!a.name && b.name) return 1;
        if (a.name && !b.name) return -1;
        return a.name.localeCompare(b.name, 'es');
      });
      const addActaExecActivityRow = () => {
        const first = activityWorks[0];
        if (!first) return;
        setActaExecActivityRows((prev) => ({
          ...prev,
          [first.work.workId]: [...(prev[first.work.workId] ?? []), { id: `exec-act-${first.schedule.scheduleId}-${Date.now()}`, name: '' }],
        }));
      };
      const ensureExecActivityRow = (workId: number, row: { id: string; name: string }) => {
        setActaExecActivityRows((prev) => {
          const rows = prev[workId] ?? [];
          if (rows.some((current) => current.id === row.id)) return prev;
          return { ...prev, [workId]: [...rows, row] };
        });
      };
      const updateActivityGroupName = (group: typeof activityGroups[number], name: string) => {
        const execEntries = group.entries.filter((entry) => entry.source === 'exec');
        if (execEntries.length === 0 && group.entries[0]) {
          ensureExecActivityRow(group.entries[0].work.workId, { ...group.entries[0].row, name });
        }
        setActaExecActivityRows((prev) => ({
          ...prev,
          ...Object.fromEntries((execEntries.length > 0 ? execEntries : group.entries.slice(0, 1)).map(({ work, row }) => [
            work.workId,
            (prev[work.workId] ?? []).map((current) => current.id === row.id ? { ...current, name } : current),
          ])),
        }));
      };
      const setActivityGroupQty = (group: typeof activityGroups[number], date: string, value: number) => {
        const target = group.entries.find((entry) => entry.source === 'exec') ?? group.entries[0];
        if (!target) return;
        ensureExecActivityRow(target.work.workId, target.row);
        setActaExecActivityDailyMap((prev) => {
          const next = { ...prev };
          group.entries.forEach(({ work, row }) => {
            const workMap = next[work.workId] ?? {};
            const dateMap = workMap[date] ?? {};
            const nextDateMap = { ...dateMap };
            if (work.workId === target.work.workId && row.id === target.row.id) nextDateMap[row.id] = value;
            else delete nextDateMap[row.id];
            next[work.workId] = {
              ...workMap,
              [date]: nextDateMap,
            };
          });
          return next;
        });
      };
      const removeActivityGroup = (group: typeof activityGroups[number]) => {
        const idsByWork = new Map<number, Set<string>>();
        group.entries.forEach(({ work, row }) => {
          const ids = idsByWork.get(work.workId) ?? new Set<string>();
          ids.add(row.id);
          idsByWork.set(work.workId, ids);
        });
        setActaExecActivityRows((prev) => ({
          ...prev,
          ...Object.fromEntries([...idsByWork.entries()].map(([workId, ids]) => [
            workId,
            (prev[workId] ?? []).filter((row) => !ids.has(row.id)),
          ])),
        }));
        setActaExecActivityDailyMap((prev) => {
          const next = { ...prev };
          idsByWork.forEach((ids, workId) => {
            const workMap = next[workId] ?? {};
            const nextWorkMap: NumberDailyMap = {};
            Object.entries(workMap).forEach(([date, rowMap]) => {
              const nextRowMap = { ...rowMap };
              ids.forEach((rowId) => delete nextRowMap[rowId]);
              nextWorkMap[date] = nextRowMap;
            });
            next[workId] = nextWorkMap;
          });
          return next;
        });
      };

      return (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecución Actividades
            </h3>
            <WeekNav days={days} offset={execActivityWeekOffset} onPrev={() => setExecActivityWeekOffset((w) => w - 1)} onNext={() => setExecActivityWeekOffset((w) => w + 1)} onToday={() => setExecActivityWeekOffset(0)} />
          </div>

          {activityWorks.length === 0 ? (
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-4">
              No hay proyectos con cronograma para registrar actividades en esta acta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                    <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Actividad</th>
                    {days.map((date, i) => {
                      const d = new Date(date + 'T12:00:00');
                      const isToday = date === today;
                      const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {activityGroups.length === 0 ? (
                    <tr>
                      <td colSpan={days.length + 3} className="py-6 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                        No hay actividades. Agrega una fila para iniciar la ejecución del acta.
                      </td>
                    </tr>
                  ) : activityGroups.map((group) => (
                    <tr key={group.key} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                      <td className="py-1.5 pr-2">
                        <Select
                          value={group.name}
                          disabled={!canEditEjecucion}
                          onValueChange={(val) => updateActivityGroupName(group, val)}
                        >
                          <SelectTrigger className="h-7 text-xs min-w-[220px]">
                            <SelectValue placeholder="Seleccionar actividad" />
                          </SelectTrigger>
                          <SelectContent>
                            {[...DEFAULT_ACTIVITY_OPTIONS, ...customActivityOptions].map((opt) => (
                              <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-[10px] text-[hsl(var(--canalco-neutral-500))]">
                          {group.entries.length} proyecto{group.entries.length !== 1 ? 's' : ''} consolidado{group.entries.length !== 1 ? 's' : ''}
                        </p>
                      </td>
                      {days.map((date) => {
                        const isToday = date === today;
                        const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                        const qty = group.dayTotals[date] ?? 0;
                        return (
                          <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={qty || ''}
                              placeholder="0"
                              disabled={isHoliday || !canEditEjecucion}
                              onChange={(e) => setActivityGroupQty(group, date, parseFloat(e.target.value) || 0)}
                              className="h-7 w-14 text-xs text-center px-1"
                            />
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                        {group.total > 0 ? group.total : '-'}
                      </td>
                      <td className="py-1.5 pl-1">
                        {canEditEjecucion && (
                          <button
                            onClick={() => removeActivityGroup(group)}
                            className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                    <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                    {days.map((date) => {
                      const dayTotal = activityGroups.reduce((sum, group) => sum + (group.dayTotals[date] ?? 0), 0);
                      return (
                        <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                          {dayTotal > 0 ? dayTotal : '-'}
                        </td>
                      );
                    })}
                    <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                      {(() => {
                        const total = activityGroups.reduce((sum, group) => sum + group.total, 0);
                        return total > 0 ? total : '-';
                      })()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {canEditEjecucion && (
            <div className="flex justify-between items-center mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={addActaExecActivityRow}
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar fila
              </Button>
              <div className="flex items-center gap-3">
                {lastSavedActaExecActivities && (
                  <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaExecActivities}</span>
                )}
                <Button onClick={handleSaveActaExecActivities} disabled={savingActaExecActivities} variant="outline" className="gap-2 text-sm">
                  <Save className="w-4 h-4" />
                  {savingActaExecActivities ? 'Guardando...' : 'Guardar ejecución'}
                </Button>
              </div>
            </div>
          )}
        </section>
      );
    };

    return (
      <TabsContent value="ejecucion" className="space-y-4 mt-0">
        {renderUcaps()}
        {renderMaterials()}
        {renderActivities()}
      </TabsContent>
    );
  };

  const renderActaInformeTab = () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    const today = formatDate(new Date());
    const todayMs = parseLocalDate(today).getTime();
    const fmtDate = (value: string | null | undefined) =>
      value ? new Date(value + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    const sumMap = (map: NumberDailyMap | undefined, key: string) =>
      Object.values(map ?? {}).reduce((sum, day) => sum + (day[key] ?? 0), 0);
    const sumDailyPlans = (workId: number, ucapId: number, field: keyof DailyPlanCell, untilToday = false) =>
      Object.entries(actaDailyPlans[workId] ?? {}).reduce((sum, [date, day]) => {
        if (untilToday && parseLocalDate(date).getTime() > todayMs) return sum;
        return sum + (parseFloat(day[ucapId]?.[field] ?? '') || 0);
      }, 0);
    const ratio = (executed: number, planned: number) => (planned > 0 ? clamp01(executed / planned) * 100 : 0);
    const statusFor = (temporal: number | null, physical: number) => {
      if (temporal === null) return { label: '-', color: '#94a3b8', cls: 'text-slate-400' };
      const diff = temporal - physical;
      if (diff <= 5) return { label: 'En tiempo', color: '#22c55e', cls: 'text-emerald-400' };
      if (diff <= 20) return { label: 'En riesgo', color: '#f59e0b', cls: 'text-amber-400' };
      return { label: 'Atrasada', color: '#ef4444', cls: 'text-red-400' };
    };
    const Bar = ({ value, expected }: { value: number; expected?: number | null }) => {
      const behind = expected != null && value < expected - 10;
      const color = value >= 100 ? '#22c55e' : behind ? '#ef4444' : value >= (expected ?? 0) ? '#22c55e' : '#38bdf8';
      return (
        <div className="relative h-2 rounded-full bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
          {expected != null && (
            <div className="absolute inset-y-[-2px] w-0.5 bg-amber-400" style={{ left: `${Math.min(100, expected)}%` }} />
          )}
        </div>
      );
    };

    const actaStartDates = rowsWithSchedule.map(({ work, schedule }) => {
      const dates = actaContractualDates[work.workId] ?? {
        start: toDateInput(schedule.contractualStart),
        end: toDateInput(schedule.contractualEnd),
      };
      return dates.start || toDateInput(schedule.startDate);
    }).filter(Boolean) as string[];
    const actaEndDates = rowsWithSchedule.map(({ work, schedule }) => {
      const dates = actaContractualDates[work.workId] ?? {
        start: toDateInput(schedule.contractualStart),
        end: toDateInput(schedule.contractualEnd),
      };
      return dates.end || toDateInput(schedule.endDate);
    }).filter(Boolean) as string[];
    const actaStart = actaStartDates.length > 0 ? [...actaStartDates].sort()[0] : '';
    const actaEnd = actaEndDates.length > 0 ? [...actaEndDates].sort().slice(-1)[0] : '';
    const temporal = actaStart && actaEnd ? workingDayProgress(actaStart, actaEnd).pct : null;
    // Días calendario "full" del acta (incluye festivos y domingos): transcurridos / totales.
    const DAY_MS = 86_400_000;
    const actaTotalDays = actaStart && actaEnd
      ? Math.max(1, Math.round((parseLocalDate(actaEnd).getTime() - parseLocalDate(actaStart).getTime()) / DAY_MS) + 1)
      : 0;
    const actaElapsedDays = actaStart
      ? Math.min(actaTotalDays, Math.max(0, Math.round((todayMs - parseLocalDate(actaStart).getTime()) / DAY_MS) + 1))
      : 0;
    const ucapMap = new Map<string, {
      label: string;
      sublabel: string;
      planned: number;
      executed: number;
      expectedQty: number;
    }>();
    const materialMap = new Map<string, {
      label: string;
      sublabel: string;
      planned: number;
      executed: number;
    }>();
    const activityMap = new Map<string, {
      label: string;
      sublabel: string;
      planned: number;
      executed: number;
    }>();
    const sumActivity = (rows: Array<{ id: string; name: string }>, map: NumberDailyMap, name: string) => {
      const ids = rows.filter((row) => row.name === name).map((row) => row.id);
      return Object.values(map).reduce((sum, day) => sum + ids.reduce((s, id) => s + (day[id] ?? 0), 0), 0);
    };

    rowsWithSchedule.forEach(({ work, schedule }) => {
      schedule.items.forEach((item) => {
        const executed = sumDailyPlans(work.workId, item.ucapId, 'executed');
        const plannedToDate = sumDailyPlans(work.workId, item.ucapId, 'planned', true);
        let expectedQty = 0;
        if (plannedToDate > 0) {
          expectedQty = Math.min(plannedToDate, item.plannedQuantity);
        } else if (item.ucapStartDate && item.ucapEndDate) {
          const startMs = parseLocalDate(toDateInput(item.ucapStartDate)).getTime();
          const endMs = parseLocalDate(toDateInput(item.ucapEndDate)).getTime();
          const fraction = endMs === startMs ? 1 : clamp01((todayMs - startMs) / (endMs - startMs));
          expectedQty = item.plannedQuantity * fraction;
        }
        const key = `${item.ucapCode}|${item.ucapDescription}`;
        const current = ucapMap.get(key) ?? {
          label: item.ucapCode,
          sublabel: item.ucapDescription,
          planned: 0,
          executed: 0,
          expectedQty: 0,
        };
        current.planned += item.plannedQuantity;
        current.executed += executed;
        current.expectedQty += expectedQty;
        ucapMap.set(key, current);
      });

      const materialRow = actaMaterialRows.find((row) => row.work.workId === work.workId);
      const materials = materialRow?.materials ?? [];
      const execMaterialMap = actaExecMaterialDailyMap[work.workId] ?? {};
      materials.forEach((mat) => {
        const planned = mat.totalQuantity ?? 0;
        const executed = sumMap(execMaterialMap, mat.materialCode);
        const key = `${mat.materialCode}|${mat.materialDescription ?? ''}|${mat.unitOfMeasure ?? ''}`;
        const current = materialMap.get(key) ?? {
          label: mat.materialCode,
          sublabel: mat.materialDescription ?? '',
          planned: 0,
          executed: 0,
        };
        current.planned += planned;
        current.executed += executed;
        materialMap.set(key, current);
      });

      const planActivityRows = actaActivityRows[work.workId] ?? [];
      const planActivityMap = actaActivityDailyMap[work.workId] ?? {};
      const execActivityRows = actaExecActivityRows[work.workId] ?? [];
      const execActivityMap = actaExecActivityDailyMap[work.workId] ?? {};
      const activityNames = [...new Set([...planActivityRows, ...execActivityRows].map((row) => row.name).filter(Boolean))];
      activityNames.forEach((name) => {
        const planned = sumActivity(planActivityRows, planActivityMap, name);
        const executed = sumActivity(execActivityRows, execActivityMap, name);
        const key = name.trim();
        const current = activityMap.get(key) ?? {
          label: name,
          sublabel: '',
          planned: 0,
          executed: 0,
        };
        current.planned += planned;
        current.executed += executed;
        activityMap.set(key, current);
      });
    });

    const ucapItems = [...ucapMap.values()]
      .map((item) => ({
        ...item,
        pct: ratio(item.executed, item.planned),
        expected: item.planned > 0 ? ratio(item.expectedQty, item.planned) : null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    const materialItems = [...materialMap.values()]
      .map((item) => ({ ...item, pct: ratio(item.executed, item.planned) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    const activityItems = [...activityMap.values()]
      .map((item) => ({ ...item, pct: ratio(item.executed, item.planned) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    const totalPlanned = ucapItems.reduce((sum, item) => sum + item.planned, 0);
    const totalExecuted = ucapItems.reduce((sum, item) => sum + item.executed, 0);
    const totalExpected = ucapItems.reduce((sum, item) => sum + item.expectedQty, 0);
    const physical = ratio(totalExecuted, totalPlanned);
    const expectedPct = ratio(totalExpected, totalPlanned);
    const donutData = [
      { name: 'Ejecutado', value: totalExecuted },
      { name: 'Pendiente', value: Math.max(0, totalPlanned - totalExecuted) },
    ];
    const dms = (date: string) => parseLocalDate(date.slice(0, 10)).getTime();
    const sortedPlanPoints = rowsWithSchedule
      .flatMap(({ work }) => (
        Object.entries(actaDailyPlans[work.workId] ?? {}).flatMap(([date, day]) => (
          Object.values(day).map((cell) => ({
            planDate: date,
            plannedQuantity: parseFloat(cell.planned ?? '') || 0,
            executedQuantity: parseFloat(cell.executed ?? '') || 0,
          }))
        ))
      ))
      .filter((point) => point.planDate && (point.plannedQuantity !== 0 || point.executedQuantity !== 0))
      .sort((a, b) => (a.planDate < b.planDate ? -1 : 1));
    const planDates = sortedPlanPoints.map((point) => point.planDate.slice(0, 10));
    const curveStart = (actaStart || planDates[0] || '').slice(0, 10);
    const curveEnd = (actaEnd || planDates[planDates.length - 1] || '').slice(0, 10);
    const curveDenom = totalPlanned || sortedPlanPoints.reduce((sum, point) => sum + point.plannedQuantity, 0) || 1;
    const curveTodayMs = parseLocalDate(today).getTime();
    // El "real" se dibuja hasta hoy o, si hay ejecución registrada en fechas posteriores,
    // hasta la última fecha con ejecución (para no "atrasar" el avance un día).
    const lastExecMs = sortedPlanPoints
      .filter((point) => point.executedQuantity > 0)
      .reduce((max, point) => Math.max(max, dms(point.planDate)), -Infinity);
    const realCutoffMs = Math.max(curveTodayMs, lastExecMs);
    let actaCurva: Array<{ month: string; programado: number; real: number | null }> = [];
    if (curveStart && curveEnd) {
      const DAY = 86_400_000;
      const startMs = dms(curveStart);
      const endMs = Math.max(dms(curveEnd), startMs + DAY);
      const spanDays = Math.round((endMs - startMs) / DAY);
      const stepDays = spanDays <= 21 ? 1 : spanDays <= 90 ? 3 : spanDays <= 180 ? 7 : spanDays <= 540 ? 14 : 30;
      const useDay = stepDays < 28;
      const fmtLabel = (ms: number) => {
        const label = new Date(ms).toLocaleDateString('es-CO', useDay ? { day: 'numeric', month: 'short' } : { month: 'short' });
        return label.charAt(0).toUpperCase() + label.slice(1);
      };
      const stops: number[] = [];
      for (let ms = startMs; ms <= endMs; ms += stepDays * DAY) stops.push(ms);
      if (stops[stops.length - 1] !== endMs) stops.push(endMs);
      actaCurva = stops.map((ms) => {
        let progCum = 0;
        let realCum = 0;
        for (const point of sortedPlanPoints) {
          if (dms(point.planDate) <= ms) {
            progCum += point.plannedQuantity;
            realCum += point.executedQuantity;
          } else {
            break;
          }
        }
        const real: number | null = ms > realCutoffMs ? null : clamp01(realCum / curveDenom) * 100;
        return { month: fmtLabel(ms), programado: clamp01(progCum / curveDenom) * 100, real };
      });
      actaCurva.unshift({ month: fmtLabel(startMs - stepDays * DAY), programado: 0, real: startMs > realCutoffMs ? null : 0 });
      for (let i = actaCurva.length - 1; i >= 0; i--) {
        if (actaCurva[i].real !== null) {
          if (actaCurva[i].real! < physical) actaCurva[i].real = physical;
          break;
        }
      }
    }
    const dev = physical - expectedPct;
    const spi = expectedPct > 0 ? physical / expectedPct : null;
    const status = statusFor(temporal, physical);
    const matPlanned = materialItems.reduce((sum, item) => sum + item.planned, 0);
    const matExecuted = materialItems.reduce((sum, item) => sum + item.executed, 0);
    const actPlanned = activityItems.reduce((sum, item) => sum + item.planned, 0);
    const actExecuted = activityItems.reduce((sum, item) => sum + item.executed, 0);
    const groups = [
      { key: 'UCAPs', weight: 0.30, planned: totalPlanned, executed: totalExecuted, pct: physical, items: ucapItems },
      { key: 'Materiales', weight: 0.30, planned: matPlanned, executed: matExecuted, pct: ratio(matExecuted, matPlanned), items: materialItems },
      { key: 'Actividades', weight: 0.40, planned: actPlanned, executed: actExecuted, pct: ratio(actExecuted, actPlanned), items: activityItems },
    ];
    const activeGroups = groups.filter((group) => group.planned > 0);
    const weightSum = activeGroups.reduce((sum, group) => sum + group.weight, 0);
    const operational = weightSum > 0
      ? activeGroups.reduce((sum, group) => sum + group.pct * (group.weight / weightSum), 0)
      : null;
    const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
    const ubicacion = [activeMunicipality ? getMunicipioName(activeMunicipality.name) : '', activeTab].filter(Boolean).join(' - ') || '-';

    return (
      <TabsContent value="informe" className="mt-0 space-y-4">
        {rowsWithSchedule.length === 0 ? (
          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
            <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
              <BarChart3 className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Informe del acta</p>
              <p className="text-xs mt-1">No hay proyectos con cronograma cargado en esta acta.</p>
            </div>
          </section>
        ) : (
          <div className="rounded-xl bg-[#0d1117] border border-slate-800 p-5 space-y-5 text-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-6 h-6 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white leading-tight truncate">Informe consolidado del acta</h3>
                  <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                    Dashboard de Control del Acta - Acta {selectedActa} - {rowsWithSchedule.length} proyecto{rowsWithSchedule.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ubicación</div>
                  <div className="font-semibold text-slate-200 mt-0.5 max-w-[220px] truncate" title={ubicacion}>{ubicacion}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Inicio</div>
                  <div className="font-semibold text-slate-200 mt-0.5">{fmtDate(actaStart)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Fin Programado</div>
                  <div className="font-semibold text-slate-200 mt-0.5">{fmtDate(actaEnd)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Corte</div>
                  <div className="font-semibold text-amber-400 mt-0.5">{fmtDate(today)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" />Avance en Tiempo</div>
                <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{temporal !== null ? Math.round(temporal) : '-'}</span><span className="text-sm text-slate-400">%</span></div>
                <div className="mt-2 text-[11px] text-slate-500">Esperado a la fecha: {Math.round(expectedPct)}%</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Activity className="w-3 h-3" />Avance Fisico (Alcance)</div>
                <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{Math.round(physical)}</span><span className="text-sm text-slate-400">%</span></div>
                <div className="mt-2 text-[11px] text-slate-500">{spi !== null ? `SPI ${spi.toFixed(2)}` : 'Ejecutado / Alcance'}</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">{dev >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}Desviacion</div>
                <div className={`mt-2 flex items-baseline gap-1 ${dev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}><span className="text-3xl font-bold">{dev >= 0 ? '+' : ''}{dev.toFixed(1)}</span><span className="text-sm opacity-70">pts</span></div>
                <div className="mt-2 text-[11px] text-slate-500">Planeado vs Ejecutado</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Estado del Acta</div>
                <div className="mt-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: status.color }} /><span className={`text-2xl font-bold ${status.cls}`}>{status.label}</span></div>
                <div className="mt-2 text-[11px] text-slate-500">{actaElapsedDays} / {actaTotalDays} días</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-amber-400" />Avance en el Tiempo - Curva S</h4>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">% acumulado - Programado vs Real</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Programado</span>
                    <span className="flex items-center gap-1 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-sky-400" />Real</span>
                  </div>
                </div>
                {actaCurva.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={actaCurva} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="actaProgFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#334155" />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#334155" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} formatter={(value: number) => `${Math.round(value)}%`} />
                      <Area type="monotone" dataKey="programado" stroke="#f59e0b" strokeWidth={2} fill="url(#actaProgFill)" name="Programado" />
                      <RLine type="monotone" dataKey="real" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} connectNulls name="Real" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 text-center px-4">Registra el plan diario y las fechas del acta para ver la curva S.</div>
                )}
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-400" />Avance Fisico</h4>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Ejecutado vs Pendiente (uds)</p>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" innerRadius={55} outerRadius={75} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                        <Cell fill="#22c55e" />
                        <Cell fill="#1e293b" />
                      </Pie>
                      <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(value: number) => `${value.toLocaleString('es-CO')} uds`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-white">{Math.round(physical)}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Ejecutado</span>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Ejecutado</span><span className="font-semibold text-white tabular-nums">{totalExecuted.toLocaleString('es-CO')} uds</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />Pendiente</span><span className="font-semibold text-slate-300 tabular-nums">{Math.max(0, totalPlanned - totalExecuted).toLocaleString('es-CO')} uds</span></div>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-1.5"><span className="text-slate-400">Alcance total</span><span className="font-semibold text-white tabular-nums">{totalPlanned.toLocaleString('es-CO')} uds</span></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1"><BarChart3 className="w-4 h-4 text-sky-400" />Alcance por UCAP</h4>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Avance real - linea ambar = esperado a la fecha</p>
                {ucapItems.length > 0 ? (
                  <div className="space-y-3">
                    {ucapItems.map((item) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="text-xs text-slate-300 truncate" title={item.sublabel}>{item.sublabel || item.label}</span>
                          <span className="text-xs font-semibold flex-shrink-0" title="Avance real / esperado a la fecha">
                            <span className="text-white">{Math.round(item.pct)}%</span>
                            {item.expected != null && <span className="text-amber-400"> / {Math.round(item.expected)}%</span>}
                          </span>
                        </div>
                        <Bar value={item.pct} expected={item.expected} />
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-500">El acta no tiene UCAPs registradas.</p>}
              </div>
            </div>

            {false && (
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-amber-400" />Avance Operativo</h4>
                <span className="text-2xl font-bold text-amber-400">{operational !== null ? `${Math.round(operational)}%` : '-'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {groups.map((group) => (
                  <div key={group.key} className="rounded-md border border-slate-700 p-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-300">{group.key}</span>
                      <span className="font-semibold text-white">{group.planned > 0 ? `${Math.round(group.pct)}%` : '-'}</span>
                    </div>
                    <Bar value={group.pct} />
                    <p className="text-[10px] text-slate-500 mt-2">{group.executed.toLocaleString('es-CO')} / {group.planned.toLocaleString('es-CO')}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {false && (
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-sky-400" />Desglose por item</h4>
              {itemCount === 0 ? (
                <p className="text-xs text-slate-500">Sin ítems para mostrar.</p>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 my-1.5">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">{group.key}</span>
                        <div className="flex-1 border-t border-slate-800" />
                      </div>
                      {group.items.length === 0 ? (
                        <p className="text-xs text-slate-500 ml-28">Sin ítems</p>
                      ) : group.items.map((item, index) => (
                        <div key={`${group.key}-${item.label}-${index}`} className="grid grid-cols-[160px_1fr_48px] gap-3 items-center mb-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono font-semibold text-amber-400 truncate">{item.label || '-'}</p>
                            {item.sublabel && <p className="text-[10px] text-slate-500 truncate" title={item.sublabel}>{item.sublabel}</p>}
                          </div>
                          <Bar value={item.pct} />
                          <span className="text-[11px] font-semibold text-right text-amber-400">{item.planned > 0 ? `${Math.round(item.pct)}%` : '-'}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
              <ActaGantt obras={actaGanttObras} dark />
            </div>
          </div>
        )}
        {false && rowsWithSchedule.map(({ work, schedule }) => {
          const materialRow = actaMaterialRows.find((row) => row.work.workId === work.workId);
          const materials = materialRow?.materials ?? [];
          const execMaterialMap = actaExecMaterialDailyMap[work.workId] ?? {};
          const planActivityRows = actaActivityRows[work.workId] ?? [];
          const planActivityMap = actaActivityDailyMap[work.workId] ?? {};
          const execActivityRows = actaExecActivityRows[work.workId] ?? [];
          const execActivityMap = actaExecActivityDailyMap[work.workId] ?? {};
          const dates = actaContractualDates[work.workId] ?? {
            start: toDateInput(schedule.contractualStart),
            end: toDateInput(schedule.contractualEnd),
          };
          const start = dates.start || toDateInput(schedule.startDate);
          const end = dates.end || toDateInput(schedule.endDate);
          const temporal = start && end ? workingDayProgress(start, end).pct : null;
          const totalPlanned = schedule.items.reduce((sum, item) => sum + item.plannedQuantity, 0);
          const totalExecuted = schedule.items.reduce((sum, item) => sum + sumDailyPlans(work.workId, item.ucapId, 'executed'), 0);
          const physical = ratio(totalExecuted, totalPlanned);
          const expectedPerUcap: Record<number, number> = {};
          let totalExpected = 0;
          schedule.items.forEach((item) => {
            const plannedToDate = sumDailyPlans(work.workId, item.ucapId, 'planned', true);
            if (plannedToDate > 0) {
              expectedPerUcap[item.ucapId] = Math.min(plannedToDate, item.plannedQuantity);
            } else if (item.ucapStartDate && item.ucapEndDate) {
              const startMs = parseLocalDate(toDateInput(item.ucapStartDate)).getTime();
              const endMs = parseLocalDate(toDateInput(item.ucapEndDate)).getTime();
              const fraction = endMs === startMs ? 1 : clamp01((todayMs - startMs) / (endMs - startMs));
              expectedPerUcap[item.ucapId] = item.plannedQuantity * fraction;
            } else {
              expectedPerUcap[item.ucapId] = 0;
            }
            totalExpected += expectedPerUcap[item.ucapId];
          });
          const expectedPct = ratio(totalExpected, totalPlanned);
          const dev = physical - expectedPct;
          const spi = expectedPct > 0 ? physical / expectedPct : null;
          const status = statusFor(temporal, physical);
          const ucapItems = schedule.items.map((item) => {
            const executed = sumDailyPlans(work.workId, item.ucapId, 'executed');
            const pctValue = ratio(executed, item.plannedQuantity);
            const expected = item.plannedQuantity > 0 ? ratio(expectedPerUcap[item.ucapId] ?? 0, item.plannedQuantity) : null;
            return { label: item.ucapCode, sublabel: item.ucapDescription, executed, planned: item.plannedQuantity, pct: pctValue, expected };
          });
          const materialItems = materials.map((mat) => {
            const executed = sumMap(execMaterialMap, mat.materialCode);
            const planned = mat.totalQuantity;
            return {
              label: mat.materialCode,
              sublabel: mat.materialDescription ?? '',
              unit: mat.unitOfMeasure,
              executed,
              planned,
              pct: ratio(executed, planned),
            };
          });
          const activityNames = [...new Set([...planActivityRows, ...execActivityRows].map((row) => row.name).filter(Boolean))];
          const sumActivity = (rows: Array<{ id: string; name: string }>, map: NumberDailyMap, name: string) => {
            const ids = rows.filter((row) => row.name === name).map((row) => row.id);
            return Object.values(map).reduce((sum, day) => sum + ids.reduce((s, id) => s + (day[id] ?? 0), 0), 0);
          };
          const activityItems = activityNames.map((name) => {
            const planned = sumActivity(planActivityRows, planActivityMap, name);
            const executed = sumActivity(execActivityRows, execActivityMap, name);
            return { label: name, sublabel: '', planned, executed, pct: ratio(executed, planned) };
          });
          const matPlanned = materialItems.reduce((sum, item) => sum + item.planned, 0);
          const matExecuted = materialItems.reduce((sum, item) => sum + item.executed, 0);
          const actPlanned = activityItems.reduce((sum, item) => sum + item.planned, 0);
          const actExecuted = activityItems.reduce((sum, item) => sum + item.executed, 0);
          const groups = [
            { key: 'UCAPs', weight: 0.30, planned: totalPlanned, executed: totalExecuted, pct: physical, items: ucapItems },
            { key: 'Materiales', weight: 0.30, planned: matPlanned, executed: matExecuted, pct: ratio(matExecuted, matPlanned), items: materialItems },
            { key: 'Actividades', weight: 0.40, planned: actPlanned, executed: actExecuted, pct: ratio(actExecuted, actPlanned), items: activityItems },
          ];
          const activeGroups = groups.filter((group) => group.planned > 0);
          const weightSum = activeGroups.reduce((sum, group) => sum + group.weight, 0);
          const operational = weightSum > 0
            ? activeGroups.reduce((sum, group) => sum + group.pct * (group.weight / weightSum), 0)
            : null;
          const ubicacion = [work.neighborhood, work.zone].filter(Boolean).join(' - ') || work.address || '-';
          const timelineItems = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.key })));

          return (
            <div key={work.workId} className="rounded-xl bg-[#0d1117] border border-slate-800 p-5 space-y-5 text-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white leading-tight truncate">{work.name}</h3>
                    <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                      Dashboard de Control de Obra - Acta {selectedActa}{work.workCode ? ` - ${work.workCode}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ubicación</div>
                    <div className="font-semibold text-slate-200 mt-0.5 max-w-[220px] truncate" title={ubicacion}>{ubicacion}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Inicio</div>
                    <div className="font-semibold text-slate-200 mt-0.5">{fmtDate(start)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Fin Programado</div>
                    <div className="font-semibold text-slate-200 mt-0.5">{fmtDate(end)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Corte</div>
                    <div className="font-semibold text-amber-400 mt-0.5">{fmtDate(today)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" />Avance en Tiempo</div>
                  <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{temporal !== null ? Math.round(temporal) : '-'}</span><span className="text-sm text-slate-400">%</span></div>
                  <div className="mt-2 text-[11px] text-slate-500">Esperado a la fecha: {Math.round(expectedPct)}%</div>
                </div>
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Activity className="w-3 h-3" />Avance Fisico</div>
                  <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{Math.round(physical)}</span><span className="text-sm text-slate-400">%</span></div>
                  <div className="mt-2 text-[11px] text-slate-500">{spi !== null ? `SPI ${spi.toFixed(2)}` : 'Ejecutado / Alcance'}</div>
                </div>
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">{dev >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}Desviacion</div>
                  <div className={`mt-2 flex items-baseline gap-1 ${dev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}><span className="text-3xl font-bold">{dev >= 0 ? '+' : ''}{dev.toFixed(1)}</span><span className="text-sm opacity-70">pts</span></div>
                  <div className="mt-2 text-[11px] text-slate-500">Fisico vs esperado</div>
                </div>
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Estado de la Obra</div>
                  <div className="mt-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: status.color }} /><span className={`text-2xl font-bold ${status.cls}`}>{status.label}</span></div>
                  <div className="mt-2 text-[11px] text-slate-500">Este mes: {monthProgress.elapsed} / {monthProgress.total} días hábiles</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1"><BarChart3 className="w-4 h-4 text-sky-400" />Alcance por UCAP</h4>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Avance real - linea ambar = esperado a la fecha</p>
                  {ucapItems.length > 0 ? (
                    <div className="space-y-3">
                      {ucapItems.map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <span className="text-xs text-slate-300 truncate" title={item.sublabel}>{item.sublabel || item.label}</span>
                            <span className="text-xs font-semibold text-white flex-shrink-0">{Math.round(item.pct)}%</span>
                          </div>
                          <Bar value={item.pct} expected={item.expected} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-slate-500">Este proyecto no tiene UCAPs registradas.</p>}
                </div>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-amber-400" />Avance Operativo</h4>
                  <span className="text-2xl font-bold text-amber-400">{operational !== null ? `${Math.round(operational)}%` : '-'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {groups.map((group) => (
                    <div key={group.key} className="rounded-md border border-slate-700 p-3">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-300">{group.key}</span>
                        <span className="font-semibold text-white">{group.planned > 0 ? `${Math.round(group.pct)}%` : '-'}</span>
                      </div>
                      <Bar value={group.pct} />
                      <p className="text-[10px] text-slate-500 mt-2">{group.executed.toLocaleString('es-CO')} / {group.planned.toLocaleString('es-CO')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-sky-400" />Desglose por item</h4>
                {timelineItems.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin ítems para mostrar.</p>
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => (
                      <div key={group.key}>
                        <div className="flex items-center gap-2 my-1.5">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">{group.key}</span>
                          <div className="flex-1 border-t border-slate-800" />
                        </div>
                        {group.items.length === 0 ? (
                          <p className="text-xs text-slate-500 ml-28">Sin ítems</p>
                        ) : group.items.map((item) => (
                          <div key={`${group.key}-${item.label}`} className="grid grid-cols-[160px_1fr_48px] gap-3 items-center mb-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-mono font-semibold text-amber-400 truncate">{item.label || '-'}</p>
                              {item.sublabel && <p className="text-[10px] text-slate-500 truncate" title={item.sublabel}>{item.sublabel}</p>}
                            </div>
                            <Bar value={item.pct} />
                            <span className="text-[11px] font-semibold text-right text-amber-400">{item.planned > 0 ? `${Math.round(item.pct)}%` : '-'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </TabsContent>
    );
  };

  const renderActaOperativoTab = () => {
    const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
    const fmtCOP = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const fmtQ = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
    const sumMap = (map: NumberDailyMap | undefined, key: string) =>
      Object.values(map ?? {}).reduce((sum, day) => sum + (day[key] ?? 0), 0);
    const sumDailyPlans = (workId: number, ucapId: number, field: keyof DailyPlanCell) =>
      Object.values(actaDailyPlans[workId] ?? {}).reduce((sum, day) => sum + (parseFloat(day[ucapId]?.[field] ?? '') || 0), 0);
    // Esperado a la fecha: cantidad planeada acumulada (plan diario) hasta hoy.
    const todayStr = formatDate(new Date());
    const sumPlannedToDate = (workId: number, ucapId: number) =>
      Object.entries(actaDailyPlans[workId] ?? {}).reduce(
        (sum, [date, day]) => sum + (date <= todayStr ? (parseFloat(day[ucapId]?.planned ?? '') || 0) : 0),
        0,
      );
    const ratio = (executed: number, planned: number) => (planned > 0 ? clamp01(executed / planned) * 100 : 0);
    const badge = (p: number, hasPlan: boolean) => {
      if (!hasPlan) return <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>;
      const cls = p >= 100 ? 'bg-emerald-100 text-emerald-700' : p >= 70 ? 'bg-amber-100 text-amber-700' : p >= 40 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
      const lbl = p >= 100 ? 'Completo' : p >= 70 ? 'En avance' : p >= 40 ? 'Vigilar' : 'Bajo';
      return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>;
    };
    const KPICard = ({ label, p, sub, color }: { label: string; p: number; sub?: string; color: string }) => (
      <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-4 text-center">
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mb-1">{label}</p>
        <p className="text-3xl font-bold text-[hsl(var(--canalco-neutral-800))]">{Math.round(p)}%</p>
        {sub && <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-0.5">{sub}</p>}
        <div className="mt-2 h-1.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
          <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
        </div>
      </div>
    );

    const ucapMap = new Map<string, {
      key: string;
      ucapCode: string;
      ucapDescription: string;
      plannedQuantity: number;
      execQty: number;
      expectedQty: number;
      plannedVal: number;
      execVal: number;
    }>();
    const matMap = new Map<string, {
      key: string;
      materialCode: string;
      materialDescription: string | null;
      unitOfMeasure: string | null;
      totalQuantity: number;
      execQty: number;
      plannedVal: number;
      execVal: number;
      isExtra?: boolean;
    }>();
    const pcMap = new Map<string, {
      key: string;
      materialCode: string;
      materialDescription: string | null;
      unitOfMeasure: string | null;
      budgetQty: number;
      execQty: number;
      budgetValue: number;
      requisitionedQty: number;
      orderedQty: number;
      orderedValue: number;
    }>();
    const actMap = new Map<string, {
      key: string;
      name: string;
      planned: number;
      execd: number;
    }>();

    const sumActivity = (rows: Array<{ id: string; name: string }>, map: NumberDailyMap, name: string) => {
      const ids = rows.filter((row) => row.name === name).map((row) => row.id);
      return Object.values(map).reduce((sum, day) => sum + ids.reduce((s, id) => s + (day[id] ?? 0), 0), 0);
    };

    rowsWithSchedule.forEach(({ work, schedule }) => {
      const ippF = Number(schedule.ippFactor) || 1;

      schedule.items.forEach((item) => {
        const execQty = sumDailyPlans(work.workId, item.ucapId, 'executed');
        const expectedQty = Math.min(sumPlannedToDate(work.workId, item.ucapId), item.plannedQuantity);
        const uv = Number(item.unitValue) || 0;
        const plannedVal = item.plannedQuantity * uv * ippF;
        const execVal = execQty * uv * ippF;
        const key = `${item.ucapCode || item.ucapId}|${item.ucapDescription || ''}`;
        const current = ucapMap.get(key) ?? {
          key,
          ucapCode: item.ucapCode,
          ucapDescription: item.ucapDescription,
          plannedQuantity: 0,
          execQty: 0,
          expectedQty: 0,
          plannedVal: 0,
          execVal: 0,
        };
        current.plannedQuantity += item.plannedQuantity;
        current.execQty += execQty;
        current.expectedQty += expectedQty;
        current.plannedVal += plannedVal;
        current.execVal += execVal;
        ucapMap.set(key, current);
      });

      const materialRow = actaMaterialRows.find((row) => row.work.workId === work.workId);
      const materials = materialRow?.materials ?? [];
      const execMaterialMap = actaExecMaterialDailyMap[work.workId] ?? {};
      materials.forEach((mat) => {
        const execQty = sumMap(execMaterialMap, mat.materialCode);
        const totalQuantity = mat.totalQuantity ?? 0;
        const uv = mat.unitValue ?? 0;
        const plannedVal = totalQuantity * uv * ippF;
        const execVal = execQty * uv * ippF;
        const key = `${mat.materialCode}|${mat.materialDescription ?? ''}|${mat.unitOfMeasure ?? ''}`;
        const current = matMap.get(key) ?? {
          key,
          materialCode: mat.materialCode,
          materialDescription: mat.materialDescription ?? null,
          unitOfMeasure: mat.unitOfMeasure ?? null,
          totalQuantity: 0,
          execQty: 0,
          plannedVal: 0,
          execVal: 0,
        };
        current.totalQuantity += totalQuantity;
        current.execQty += execQty;
        current.plannedVal += plannedVal;
        current.execVal += execVal;
        matMap.set(key, current);

        const pcCurrent = pcMap.get(key) ?? {
          key,
          materialCode: mat.materialCode,
          materialDescription: mat.materialDescription ?? null,
          unitOfMeasure: mat.unitOfMeasure ?? null,
          budgetQty: 0,
          execQty: 0,
          budgetValue: 0,
          requisitionedQty: 0,
          orderedQty: 0,
          orderedValue: 0,
        };
        // Presupuesto e instalado sí se suman por obra (son totales del acta). Requisitado/OC
        // NO: la comparación de compras es a nivel de proyecto/acta (misma para todas las
        // obras), así que se asigna una sola vez por código más abajo (evita multiplicar).
        pcCurrent.budgetQty += totalQuantity;
        pcCurrent.execQty += execQty;
        pcCurrent.budgetValue += plannedVal;
        pcMap.set(key, pcCurrent);
      });

      const planActivityRows = actaActivityRows[work.workId] ?? [];
      const planActivityMap = actaActivityDailyMap[work.workId] ?? {};
      const execActivityRows = actaExecActivityRows[work.workId] ?? [];
      const execActivityMap = actaExecActivityDailyMap[work.workId] ?? {};
      const actNames = [...new Set([...planActivityRows, ...execActivityRows].map((row) => row.name).filter(Boolean))];
      actNames.forEach((name) => {
        const planned = sumActivity(planActivityRows, planActivityMap, name);
        const execd = sumActivity(execActivityRows, execActivityMap, name);
        const key = name.trim();
        const current = actMap.get(key) ?? { key, name, planned: 0, execd: 0 };
        current.planned += planned;
        current.execd += execd;
        actMap.set(key, current);
      });
    });

    // Materiales extra del acta (agregados en Ejecución): aparecen acá como material extra.
    actaExtraExecMaterials.forEach((ex) => {
      if ([...matMap.values()].some((r) => r.materialCode === ex.code)) return;
      const execQty = rowsWithSchedule.reduce(
        (s, { work }) => s + sumMap(actaExecMaterialDailyMap[work.workId], ex.code),
        0,
      );
      const key = `extra|${ex.code}`;
      matMap.set(key, {
        key,
        materialCode: ex.code,
        materialDescription: ex.description || null,
        unitOfMeasure: ex.unitOfMeasure ?? null,
        totalQuantity: 0,
        execQty,
        plannedVal: 0,
        execVal: 0,
        isExtra: true,
      });
    });

    const ucapRows = [...ucapMap.values()]
      .map((row) => ({
        ...row,
        p: ratio(row.execQty, row.plannedQuantity),
        unitValue: row.plannedQuantity > 0 ? row.plannedVal / row.plannedQuantity : 0,
      }))
      .sort((a, b) => a.ucapCode.localeCompare(b.ucapCode, 'es'));
    const obraBudgetRows = rowsWithSchedule
      .map(({ work, schedule }) => {
        const ippF = Number(schedule.ippFactor) || 1;
        const totals = schedule.items.reduce((acc, item) => {
          const uv = Number(item.unitValue) || 0;
          const execQty = sumDailyPlans(work.workId, item.ucapId, 'executed');
          const expectedQty = Math.min(sumPlannedToDate(work.workId, item.ucapId), item.plannedQuantity);
          acc.plannedVal += item.plannedQuantity * uv * ippF;
          acc.expectedVal += expectedQty * uv * ippF;
          acc.execVal += execQty * uv * ippF;
          return acc;
        }, { plannedVal: 0, expectedVal: 0, execVal: 0 });
        return {
          key: String(work.workId),
          workCode: work.workCode,
          workName: work.name,
          ...totals,
        };
      })
      .sort((a, b) => a.workName.localeCompare(b.workName, 'es'));
    const matRows = [...matMap.values()]
      .map((row) => ({ ...row, p: ratio(row.execQty, row.totalQuantity) }))
      .sort((a, b) => {
        // Los materiales extra siempre van al final.
        if (!!a.isExtra !== !!b.isExtra) return a.isExtra ? 1 : -1;
        return a.materialCode.localeCompare(b.materialCode, 'es');
      });
    // Comparación de compras (requisitado / OC): es a nivel de proyecto/acta y viene
    // igual en cada obra, así que se toma UNA sola vez por código (no se suma por obra).
    const projectComparison = new Map<string, { requisitionedQty: number; orderedQty: number; orderedValue: number }>();
    rowsWithSchedule.forEach(({ work }) => {
      (actaPurchaseComparisonMap[work.workId] ?? []).forEach((item) => {
        if (!projectComparison.has(item.materialCode)) {
          projectComparison.set(item.materialCode, {
            requisitionedQty: item.requisitionedQty ?? 0,
            orderedQty: item.orderedQty ?? 0,
            orderedValue: item.orderedValue ?? 0,
          });
        }
      });
    });
    const pcRows = [...pcMap.values()]
      .map((row) => {
        const cmp = projectComparison.get(row.materialCode);
        const requisitionedQty = cmp?.requisitionedQty ?? 0;
        const orderedQty = cmp?.orderedQty ?? 0;
        const orderedValue = cmp?.orderedValue ?? 0;
        return { ...row, requisitionedQty, orderedQty, orderedValue, diffValue: row.budgetValue - orderedValue };
      })
      .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'es'));
    const actRows = [...actMap.values()]
      .map((row) => ({ ...row, p: ratio(row.execd, row.planned) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const totUcapQP = ucapRows.reduce((sum, row) => sum + row.plannedQuantity, 0);
    const totUcapQE = ucapRows.reduce((sum, row) => sum + row.execQty, 0);
    const totUcapVP = ucapRows.reduce((sum, row) => sum + row.plannedVal, 0);
    const totUcapVE = ucapRows.reduce((sum, row) => sum + row.execVal, 0);
    const ucapPct = ratio(totUcapQE, totUcapQP);
    const today = formatDate(new Date());
    const actaStartDates = rowsWithSchedule.map(({ work, schedule }) => {
      const dates = actaContractualDates[work.workId] ?? {
        start: toDateInput(schedule.contractualStart),
        end: toDateInput(schedule.contractualEnd),
      };
      return dates.start || toDateInput(schedule.startDate);
    }).filter(Boolean) as string[];
    const actaEndDates = rowsWithSchedule.map(({ work, schedule }) => {
      const dates = actaContractualDates[work.workId] ?? {
        start: toDateInput(schedule.contractualStart),
        end: toDateInput(schedule.contractualEnd),
      };
      return dates.end || toDateInput(schedule.endDate);
    }).filter(Boolean) as string[];
    const actaStart = actaStartDates.length > 0 ? [...actaStartDates].sort()[0] : '';
    const actaEnd = actaEndDates.length > 0 ? [...actaEndDates].sort().slice(-1)[0] : '';
    const dms = (date: string) => parseLocalDate(date.slice(0, 10)).getTime();
    const sortedPlanPoints = rowsWithSchedule
      .flatMap(({ work }) => (
        Object.entries(actaDailyPlans[work.workId] ?? {}).flatMap(([date, day]) => (
          Object.values(day).map((cell) => ({
            planDate: date,
            plannedQuantity: parseFloat(cell.planned ?? '') || 0,
            executedQuantity: parseFloat(cell.executed ?? '') || 0,
          }))
        ))
      ))
      .filter((point) => point.planDate && (point.plannedQuantity !== 0 || point.executedQuantity !== 0))
      .sort((a, b) => (a.planDate < b.planDate ? -1 : 1));
    const planDates = sortedPlanPoints.map((point) => point.planDate.slice(0, 10));
    const curveStart = (actaStart || planDates[0] || '').slice(0, 10);
    const curveEnd = (actaEnd || planDates[planDates.length - 1] || '').slice(0, 10);
    const curveDenom = totUcapQP || sortedPlanPoints.reduce((sum, point) => sum + point.plannedQuantity, 0) || 1;
    const curveTodayMs = parseLocalDate(today).getTime();
    // El "real" se dibuja hasta hoy o, si hay ejecución registrada en fechas posteriores,
    // hasta la última fecha con ejecución (para no "atrasar" el avance un día).
    const lastExecMs = sortedPlanPoints
      .filter((point) => point.executedQuantity > 0)
      .reduce((max, point) => Math.max(max, dms(point.planDate)), -Infinity);
    const realCutoffMs = Math.max(curveTodayMs, lastExecMs);
    let operativoCurva: Array<{ month: string; programado: number; real: number | null }> = [];
    if (curveStart && curveEnd) {
      const DAY = 86_400_000;
      const startMs = dms(curveStart);
      const endMs = Math.max(dms(curveEnd), startMs + DAY);
      const spanDays = Math.round((endMs - startMs) / DAY);
      const stepDays = spanDays <= 21 ? 1 : spanDays <= 90 ? 3 : spanDays <= 180 ? 7 : spanDays <= 540 ? 14 : 30;
      const useDay = stepDays < 28;
      const fmtLabel = (ms: number) => {
        const label = new Date(ms).toLocaleDateString('es-CO', useDay ? { day: 'numeric', month: 'short' } : { month: 'short' });
        return label.charAt(0).toUpperCase() + label.slice(1);
      };
      const stops: number[] = [];
      for (let ms = startMs; ms <= endMs; ms += stepDays * DAY) stops.push(ms);
      if (stops[stops.length - 1] !== endMs) stops.push(endMs);
      operativoCurva = stops.map((ms) => {
        let progCum = 0;
        let realCum = 0;
        for (const point of sortedPlanPoints) {
          if (dms(point.planDate) <= ms) {
            progCum += point.plannedQuantity;
            realCum += point.executedQuantity;
          } else {
            break;
          }
        }
        const real: number | null = ms > realCutoffMs ? null : clamp01(realCum / curveDenom) * 100;
        return { month: fmtLabel(ms), programado: clamp01(progCum / curveDenom) * 100, real };
      });
      operativoCurva.unshift({ month: fmtLabel(startMs - stepDays * DAY), programado: 0, real: startMs > realCutoffMs ? null : 0 });
      for (let i = operativoCurva.length - 1; i >= 0; i--) {
        if (operativoCurva[i].real !== null) {
          if (operativoCurva[i].real! < ucapPct) operativoCurva[i].real = ucapPct;
          break;
        }
      }
    }

    const totMatQP = matRows.reduce((sum, row) => sum + row.totalQuantity, 0);
    const totMatQE = matRows.reduce((sum, row) => sum + row.execQty, 0);
    const totMatVP = matRows.reduce((sum, row) => sum + row.plannedVal, 0);
    const totMatVE = matRows.reduce((sum, row) => sum + row.execVal, 0);
    const matPct = totMatVP > 0 ? ratio(totMatVE, totMatVP) : ratio(totMatQE, totMatQP);
    const totPcBudget = pcRows.reduce((sum, row) => sum + row.budgetValue, 0);
    const totPcOrdered = pcRows.reduce((sum, row) => sum + row.orderedValue, 0);
    const totPcDiff = totPcBudget - totPcOrdered;

    const totActP = actRows.reduce((sum, row) => sum + row.planned, 0);
    const totActE = actRows.reduce((sum, row) => sum + row.execd, 0);
    const actPct = ratio(totActE, totActP);

    const groups = [
      { key: 'UCAPs', weight: 0.30, pct: ucapPct, planned: totUcapQP, executed: totUcapQE, hasPlan: totUcapQP > 0 },
      { key: 'Materiales', weight: 0.30, pct: matPct, planned: totMatVP || totMatQP, executed: totMatVE || totMatQE, hasPlan: (totMatVP || totMatQP) > 0 },
      { key: 'Actividades', weight: 0.40, pct: actPct, planned: totActP, executed: totActE, hasPlan: totActP > 0 },
    ];
    const activeGroups = groups.filter((group) => group.hasPlan);
    const weightSum = activeGroups.reduce((sum, group) => sum + group.weight, 0);
    const totalOperativo = weightSum > 0
      ? activeGroups.reduce((sum, group) => sum + group.pct * (group.weight / weightSum), 0)
      : 0;
    const darkGroups = [
      {
        key: 'UCAPs',
        weight: 0.30,
        pct: ucapPct,
        planned: totUcapQP,
        executed: totUcapQE,
        hasPlan: totUcapQP > 0,
        items: ucapRows.map((row) => ({
          label: row.ucapCode,
          sublabel: row.ucapDescription,
          planned: row.plannedQuantity,
          executed: row.execQty,
          pct: row.p,
        })),
      },
      {
        key: 'Materiales',
        weight: 0.30,
        pct: ratio(totMatQE, totMatQP),
        planned: totMatQP,
        executed: totMatQE,
        hasPlan: totMatQP > 0,
        items: matRows.map((row) => ({
          label: row.materialCode,
          sublabel: row.materialDescription ?? '',
          planned: row.totalQuantity,
          executed: row.execQty,
          pct: row.p,
        })),
      },
      {
        key: 'Actividades',
        weight: 0.40,
        pct: actPct,
        planned: totActP,
        executed: totActE,
        hasPlan: totActP > 0,
        items: actRows.map((row) => ({
          label: row.name,
          sublabel: '',
          planned: row.planned,
          executed: row.execd,
          pct: row.p,
        })),
      },
    ];
    const darkItemCount = darkGroups.reduce((sum, group) => sum + group.items.length, 0);
    const DarkBar = ({ value }: { value: number }) => (
      <div className="relative h-2 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    );
    const darkSummaryPanels = (
      <>
        <div className="rounded-lg bg-white border border-[hsl(var(--canalco-neutral-300))] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Avance Operativo
            </h4>
            <span className="text-2xl font-bold text-[hsl(var(--canalco-primary))]">{Math.round(totalOperativo)}%</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {darkGroups.map((group) => (
              <div key={group.key} className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-[hsl(var(--canalco-neutral-500))]">{group.key}</span>
                  <span className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{group.hasPlan ? `${Math.round(group.pct)}%` : '-'}</span>
                </div>
                <DarkBar value={group.hasPlan ? group.pct : 0} />
                <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-2">{group.executed.toLocaleString('es-CO')} / {group.planned.toLocaleString('es-CO')} - peso {Math.round(group.weight * 100)}%</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-[hsl(var(--canalco-neutral-300))] p-4">
          <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Desglose por item
          </h4>
          {darkGroups.filter((group) => group.key === 'Actividades').every((group) => group.items.length === 0) ? (
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Sin ítems para mostrar.</p>
          ) : (
            <div className="space-y-3">
              {darkGroups.filter((group) => group.key === 'Actividades').map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 my-1.5">
                    <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide w-28">{group.key}</span>
                    <div className="flex-1 border-t border-[hsl(var(--canalco-neutral-200))]" />
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] ml-28">Sin ítems</p>
                  ) : group.items.map((item, index) => (
                    <div key={`${group.key}-${item.label}-${index}`} className="grid grid-cols-[160px_1fr_48px] gap-3 items-center mb-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.label || '-'}</p>
                        {item.sublabel && <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate" title={item.sublabel}>{item.sublabel}</p>}
                      </div>
                      <DarkBar value={item.pct} />
                      <span className="text-[11px] font-semibold text-right text-[hsl(var(--canalco-primary))]">{item.planned > 0 ? `${Math.round(item.pct)}%` : '-'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );

    const actaGraficos = (
      <>
              {obraBudgetRows.some((row) => row.plannedVal > 0 || row.execVal > 0) && (() => {
                const chartData = obraBudgetRows.map((row) => {
                  const esperado = Math.min(row.expectedVal, row.plannedVal);
                  const ejecutadoBase = Math.min(row.execVal, row.plannedVal);
                  const brechaEsperada = Math.max(Math.min(esperado, row.plannedVal) - ejecutadoBase, 0);
                  const saldoPpto = Math.max(row.plannedVal - ejecutadoBase - brechaEsperada, 0);
                  const exceso = Math.max(row.execVal - row.plannedVal, 0);
                  return {
                    name: row.workName,
                    desc: row.workCode,
                    Ppto: row.plannedVal,
                    Esperado: esperado,
                    Ejecutado: ejecutadoBase,
                    PptoRestante: Math.max(row.plannedVal - ejecutadoBase, 0),
                    Exceso: exceso,
                    EjecutadoReal: row.execVal,
                    avance: row.plannedVal > 0 ? Math.round((row.execVal / row.plannedVal) * 100) : 0,
                  };
                });
                const totalPpto = chartData.reduce((s, d) => s + d.Ppto, 0);
                const totalEsp = chartData.reduce((s, d) => s + d.Esperado, 0);
                const totalEjec = chartData.reduce((s, d) => s + d.EjecutadoReal, 0);
                const descByCode = new Map(chartData.map((d) => [d.name, d.desc]));
                const shortWorkName = (name: string) => name.length > 34 ? `${name.slice(0, 34)}...` : name;
                const atrasado = totalEsp > 0 && totalEjec < totalEsp;
                const pill = (color: string, label: string, value: string) => (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))] px-2.5 py-1 text-[11px] tabular-nums">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[hsl(var(--canalco-neutral-500))]">{label}</span>
                    <strong className="text-[hsl(var(--canalco-neutral-800))]">{value}</strong>
                  </span>
                );
                return (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Presupuesto apilado por obra
                    </h3>
                    <span className="text-2xl font-bold text-[hsl(var(--canalco-primary))] tabular-nums">{totalPpto > 0 ? Math.round((totalEjec / totalPpto) * 100) : 0}%</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {pill('#64748b', 'Ppto', fmtCOP(totalPpto))}
                    {pill('#f59e0b', 'Esperado', fmtCOP(totalEsp))}
                    {pill('#10b981', 'Ejecutado', fmtCOP(totalEjec))}
                    {totalEsp > 0 && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${atrasado ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                        {atrasado ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        {atrasado ? `Atrasado ${fmtCOP(totalEsp - totalEjec)}` : 'Al día / adelantado'}
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(300, obraBudgetRows.length * 46)}>
                    <BarChart
                      layout="vertical"
                      data={chartData}
                      margin={{ top: 4, right: 44, left: 8, bottom: 4 }}
                      barCategoryGap="36%"
                    >
                      <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--canalco-neutral-200))" horizontal={false} />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--canalco-neutral-400))' }}
                        tickFormatter={(v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={190}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={shortWorkName}
                        tick={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--canalco-neutral-600))' }}
                      />
                      <RTooltip
                        formatter={(v: number, key) => [fmtCOP(v), key]}
                        labelFormatter={(label) => `${label} — ${descByCode.get(String(label)) ?? ''}`}
                        cursor={{ fill: 'hsl(var(--canalco-neutral-100))' }}
                        contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--canalco-neutral-200))', fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                      <Bar dataKey="Ejecutado" stackId="ppto" name="Ejecutado" fill="#10b981" radius={[4, 0, 0, 4]} maxBarSize={18} />
                      <Bar dataKey="PptoRestante" stackId="ppto" name="Ppto" fill="#64748b" radius={[0, 4, 4, 0]} maxBarSize={18}>
                        <LabelList
                          dataKey="avance"
                          position="right"
                          formatter={(v: number) => (v > 0 && v <= 100 ? `${v}%` : '')}
                          style={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                        />
                      </Bar>
                      <Bar dataKey="Exceso" stackId="ppto" name="Exceso" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18}>
                        <LabelList
                          dataKey="avance"
                          position="right"
                          formatter={(v: number) => (v > 100 ? `${v}%` : '')}
                          style={{ fontSize: 10, fontWeight: 700, fill: '#dc2626' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </section>
                );
              })()}

              {pcRows.some((row) => row.budgetQty > 0 || row.requisitionedQty > 0 || row.orderedQty > 0 || row.budgetValue > 0 || row.orderedValue > 0) && (() => {
                const chartRows = pcRows
                  .map((row) => ({
                    name: row.materialCode,
                    desc: row.materialDescription ?? '',
                    Ppto: row.budgetQty,
                    Req: row.requisitionedQty,
                    OC: row.orderedQty,
                    'Ppto $': row.budgetValue,
                    'OC $': row.orderedValue,
                    Diferencia: row.budgetValue - row.orderedValue,
                    impact: Math.max(row.budgetValue, row.orderedValue, row.budgetQty, row.requisitionedQty, row.orderedQty),
                  }))
                  .filter((row) => row.Ppto > 0 || row.Req > 0 || row.OC > 0 || row['Ppto $'] > 0 || row['OC $'] > 0)
                  .sort((a, b) => b.impact - a.impact);
                // Se eligen los 12 de mayor impacto, pero se muestran de menor a mayor (ascendente).
                const visibleRows = chartRows.slice(0, 12).reverse();
                const hiddenRows = Math.max(0, chartRows.length - visibleRows.length);
                const descByCode = new Map(chartRows.map((row) => [row.name, row.desc]));
                const shortName = (code: string) => {
                  const desc = descByCode.get(code) ?? '';
                  const label = desc ? `${code} - ${desc}` : code;
                  return label.length > 32 ? `${label.slice(0, 32)}...` : label;
                };
                const totalBudgetQty = chartRows.reduce((sum, row) => sum + row.Ppto, 0);
                const totalReqQty = chartRows.reduce((sum, row) => sum + row.Req, 0);
                const totalOcQty = chartRows.reduce((sum, row) => sum + row.OC, 0);
                const totalPendingQty = Math.max(totalBudgetQty - totalOcQty, 0);
                const totalBudgetValue = chartRows.reduce((sum, row) => sum + row['Ppto $'], 0);
                const totalOcValue = chartRows.reduce((sum, row) => sum + row['OC $'], 0);
                const totalDiffValue = totalBudgetValue - totalOcValue;
                const ocPct = totalBudgetQty > 0 ? Math.round((totalOcQty / totalBudgetQty) * 100) : 0;
                const fmtMoneyShort = (value: number) => (Math.abs(value) >= 1e6 ? `$${(value / 1e6).toFixed(1)}M` : Math.abs(value) >= 1e3 ? `$${(value / 1e3).toFixed(0)}K` : `$${value}`);
                const stat = (label: string, value: string, sub: string, tone: 'slate' | 'blue' | 'green' | 'amber' | 'red') => {
                  const tones = {
                    slate: 'bg-slate-50 text-slate-700 border-slate-200',
                    blue: 'bg-blue-50 text-blue-700 border-blue-200',
                    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    amber: 'bg-amber-50 text-amber-700 border-amber-200',
                    red: 'bg-red-50 text-red-700 border-red-200',
                  };
                  return (
                    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
                      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-70">{label}</p>
                      <p className="text-sm font-bold tabular-nums">{value}</p>
                      <p className="text-[10px] opacity-70">{sub}</p>
                    </div>
                  );
                };
                const legendDot = (color: string, label: string) => (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[hsl(var(--canalco-neutral-200))] px-2.5 py-1 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                );
                return (
                  <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-2xl p-5 shadow-sm space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
                          <BarChart3 className="w-5 h-5" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-[hsl(var(--canalco-neutral-800))] leading-tight">Compras por material</h3>
                          <p className="text-[11px] text-[hsl(var(--canalco-neutral-400))]">Top {visibleRows.length} por impacto. Cantidades y valores separados para lectura rápida.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="inline-flex rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setPurchaseChartView('quantities')}
                            className={`rounded-md px-3 py-1 transition-colors ${purchaseChartView === 'quantities' ? 'bg-white text-[hsl(var(--canalco-primary))] shadow-sm' : 'text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))]'}`}
                          >
                            Cantidades
                          </button>
                          <button
                            type="button"
                            onClick={() => setPurchaseChartView('values')}
                            className={`rounded-md px-3 py-1 transition-colors ${purchaseChartView === 'values' ? 'bg-white text-[hsl(var(--canalco-primary))] shadow-sm' : 'text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))]'}`}
                          >
                            Valores
                          </button>
                        </div>
                        {hiddenRows > 0 && (
                          <span className="rounded-full bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--canalco-neutral-500))]">
                            +{hiddenRows} materiales
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      {stat('Presupuesto', totalBudgetValue > 0 ? fmtCOP(totalBudgetValue) : fmtQ(totalBudgetQty), totalBudgetValue > 0 ? `${fmtQ(totalBudgetQty)} und presupuestadas` : 'Cantidad presupuestada', 'slate')}
                      {stat('Requisitado', fmtQ(totalReqQty), 'Cantidad en requisiciones', 'blue')}
                      {stat('OC emitidas', totalOcValue > 0 ? fmtCOP(totalOcValue) : fmtQ(totalOcQty), `${ocPct}% de cantidad OC`, 'green')}
                      {stat(
                        totalDiffValue < 0 ? 'Sobrecosto' : 'Diferencia',
                        totalBudgetValue > 0 ? fmtCOP(Math.abs(totalDiffValue)) : fmtQ(totalPendingQty),
                        totalBudgetValue > 0 ? (totalDiffValue < 0 ? 'OC supera el ppto' : 'Disponible vs OC') : 'Pendiente por OC',
                        totalDiffValue < 0 ? 'red' : totalPendingQty > 0 ? 'amber' : 'green',
                      )}
                    </div>

                    {purchaseChartView === 'quantities' && (
                    <div className="rounded-xl border border-[hsl(var(--canalco-neutral-200))] p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidades</h4>
                          <p className="text-[11px] text-[hsl(var(--canalco-neutral-400))]">Presupuesto, requisitado y orden de compra por material.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                          {legendDot('#64748b', 'Ppto')}
                          {legendDot('#3b82f6', 'Req')}
                          {legendDot('#10b981', 'OC')}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(280, visibleRows.length * 42)}>
                        <BarChart layout="vertical" data={visibleRows} margin={{ top: 8, right: 24, left: 124, bottom: 8 }} barCategoryGap="18%" barGap={3}>
                          <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--canalco-neutral-200))" horizontal={false} />
                          <XAxis
                            type="number"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--canalco-neutral-400))' }}
                            tickFormatter={(value) => (Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}k` : `${value}`)}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={150}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={shortName}
                            tick={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--canalco-neutral-600))' }}
                          />
                          <RTooltip
                            formatter={(value: number, key) => [fmtQ(value), key]}
                            labelFormatter={(label) => `${label} - ${descByCode.get(String(label)) ?? ''}`}
                            cursor={{ fill: 'hsl(var(--canalco-primary))', fillOpacity: 0.06 }}
                            contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--canalco-neutral-200))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                          />
                          <Bar dataKey="Ppto" fill="#64748b" radius={[0, 5, 5, 0]} maxBarSize={12}>
                            <LabelList
                              dataKey="Ppto"
                              position="right"
                              formatter={(value: number) => (value > 0 ? fmtQ(value) : '')}
                              style={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            />
                          </Bar>
                          <Bar dataKey="Req" fill="#3b82f6" radius={[0, 5, 5, 0]} maxBarSize={12}>
                            <LabelList
                              dataKey="Req"
                              position="right"
                              formatter={(value: number) => (value > 0 ? fmtQ(value) : '')}
                              style={{ fontSize: 10, fontWeight: 700, fill: '#2563eb' }}
                            />
                          </Bar>
                          <Bar dataKey="OC" fill="#10b981" radius={[0, 5, 5, 0]} maxBarSize={12}>
                            <LabelList
                              dataKey="OC"
                              position="right"
                              formatter={(value: number) => (value > 0 ? fmtQ(value) : '')}
                              style={{ fontSize: 10, fontWeight: 700, fill: '#059669' }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    )}

                    {purchaseChartView === 'values' && (
                    <div className="rounded-xl border border-[hsl(var(--canalco-neutral-200))] p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Valores</h4>
                          <p className="text-[11px] text-[hsl(var(--canalco-neutral-400))]">Presupuesto cargado, OC emitidas y diferencia financiera.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                          {legendDot('#f59e0b', 'Ppto $')}
                          {legendDot('#8b5cf6', 'OC $')}
                          {legendDot(totalDiffValue < 0 ? '#ef4444' : '#10b981', 'Diferencia')}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(280, visibleRows.length * 42)}>
                        <BarChart layout="vertical" data={visibleRows} margin={{ top: 8, right: 24, left: 124, bottom: 8 }} barCategoryGap="18%" barGap={3}>
                          <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--canalco-neutral-200))" horizontal={false} />
                          <XAxis
                            type="number"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--canalco-neutral-400))' }}
                            tickFormatter={fmtMoneyShort}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={150}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={shortName}
                            tick={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--canalco-neutral-600))' }}
                          />
                          <RTooltip
                            formatter={(value: number, key) => [fmtCOP(value), key]}
                            labelFormatter={(label) => `${label} - ${descByCode.get(String(label)) ?? ''}`}
                            cursor={{ fill: 'hsl(var(--canalco-primary))', fillOpacity: 0.06 }}
                            contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--canalco-neutral-200))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                          />
                          <Bar dataKey="Ppto $" fill="#f59e0b" radius={[0, 5, 5, 0]} maxBarSize={12} />
                          <Bar dataKey="OC $" fill="#8b5cf6" radius={[0, 5, 5, 0]} maxBarSize={12} />
                          <Bar dataKey="Diferencia" radius={[0, 5, 5, 0]} maxBarSize={12}>
                            {visibleRows.map((row) => (
                              <Cell key={`diff-${row.name}`} fill={row.Diferencia < 0 ? '#ef4444' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-2">El Ppto $ depende del Presupuesto del Director. Diferencia positiva = saldo disponible; negativa = OC por encima del presupuesto.</p>
                    </div>
                    )}
                  </section>
                );
              })()}

              {actaDirectorBudgets.length > 0 && (() => {
                const asNumber = (value: number | null | undefined) => Number(value) || 0;
                const budgetSummaries = actaDirectorBudgets.map((budget) => {
                  const budgetItems = budget.items ?? [];
                  const subTotal = budgetItems.reduce((sum, item) => {
                    const quantity = asNumber(item.cantidad);
                    const unitValue = asNumber(item.vrUnitario);
                    const unitIva = item.hasIva ? unitValue * 0.19 : 0;
                    return sum + (quantity * (unitValue + unitIva));
                  }, 0);
                  const executedSubTotal = budgetItems.reduce((sum, item) => sum + asNumber(item.ejecutado), 0);
                  const manoDeObra = asNumber(budget.manoDeObra);
                  const manoDeObraEj = asNumber(budget.manoDeObraEj);
                  const materialesInventario = asNumber(budget.materialesInventario);
                  const materialesInventarioEj = asNumber(budget.materialesInventarioEj);
                  const valorFacturado = asNumber(budget.valorFacturado);
                  const valorFacturadoEj = asNumber(budget.valorFacturadoEj);
                  const retenciones = valorFacturado * (asNumber(budget.retPct) / 100);
                  const retencionesEj = valorFacturadoEj * (asNumber(budget.retPctEj) / 100);
                  const estampilla = valorFacturado * (asNumber(budget.estampillaPct) / 100);
                  const estampillaEj = valorFacturadoEj * (asNumber(budget.estampillaPctEj) / 100);
                  const totalObra = subTotal + manoDeObra;
                  const totalObraEj = executedSubTotal + manoDeObraEj;
                  const totalAPagar = valorFacturado - retenciones - estampilla;
                  const totalAPagarEj = valorFacturadoEj - retencionesEj - estampillaEj;
                  const saldo = valorFacturado - totalObra;
                  const saldoEj = valorFacturadoEj - totalObraEj;
                  const otrosCostos = asNumber(budget.otrosCostos);
                  const otrosCostosEj = asNumber(budget.otrosCostosEj);
                  const utilidadObra = saldo - otrosCostos;
                  const utilidadObraEj = saldoEj - otrosCostosEj;
                  const costosLna = utilidadObra * (asNumber(budget.leg) / 100);
                  const costosLnaEj = utilidadObraEj * (asNumber(budget.legEj) / 100);
                  const utilidadFinal = utilidadObra - costosLna;
                  const utilidadFinalEj = utilidadObraEj - costosLnaEj;
                  return {
                    subTotal,
                    executedSubTotal,
                    manoDeObra,
                    manoDeObraEj,
                    totalObra,
                    totalObraEj,
                    materialesInventario,
                    materialesInventarioEj,
                    valorFacturado,
                    valorFacturadoEj,
                    retenciones,
                    retencionesEj,
                    estampilla,
                    estampillaEj,
                    totalAPagar,
                    totalAPagarEj,
                    otrosCostos,
                    otrosCostosEj,
                    saldo,
                    saldoEj,
                    utilidadObra,
                    utilidadObraEj,
                    costosLna,
                    costosLnaEj,
                    utilidadFinal,
                    utilidadFinalEj,
                  };
                });
                const sumSummary = (key: keyof typeof budgetSummaries[number]) => budgetSummaries.reduce((sum, item) => sum + item[key], 0);
                const subTotal = sumSummary('subTotal');
                const executedSubTotal = sumSummary('executedSubTotal');
                const manoDeObra = sumSummary('manoDeObra');
                const manoDeObraEj = sumSummary('manoDeObraEj');
                const totalObra = sumSummary('totalObra');
                const totalObraEj = sumSummary('totalObraEj');
                const materialesInventario = sumSummary('materialesInventario');
                const materialesInventarioEj = sumSummary('materialesInventarioEj');
                const valorFacturado = sumSummary('valorFacturado');
                const valorFacturadoEj = sumSummary('valorFacturadoEj');
                const retenciones = sumSummary('retenciones');
                const retencionesEj = sumSummary('retencionesEj');
                const estampilla = sumSummary('estampilla');
                const estampillaEj = sumSummary('estampillaEj');
                const totalAPagar = sumSummary('totalAPagar');
                const totalAPagarEj = sumSummary('totalAPagarEj');
                const otrosCostos = sumSummary('otrosCostos');
                const otrosCostosEj = sumSummary('otrosCostosEj');
                const saldo = sumSummary('saldo');
                const saldoEj = sumSummary('saldoEj');
                const utilidadObra = sumSummary('utilidadObra');
                const utilidadObraEj = sumSummary('utilidadObraEj');
                const pctUtilidad = valorFacturado !== 0 ? (utilidadObra / valorFacturado) * 100 : 0;
                const pctUtilidadEj = valorFacturadoEj !== 0 ? (utilidadObraEj / valorFacturadoEj) * 100 : 0;
                const costosLna = sumSummary('costosLna');
                const costosLnaEj = sumSummary('costosLnaEj');
                const utilidadFinal = sumSummary('utilidadFinal');
                const utilidadFinalEj = sumSummary('utilidadFinalEj');
                const pctUtilidadFinal = valorFacturado !== 0 ? (utilidadFinal / valorFacturado) * 100 : 0;
                const pctUtilidadFinalEj = valorFacturadoEj !== 0 ? (utilidadFinalEj / valorFacturadoEj) * 100 : 0;

                const financialRows = [
                  { label: 'SUB-TOTAL', total: subTotal, executed: executedSubTotal },
                  { label: 'MANO DE OBRA', total: manoDeObra, executed: manoDeObraEj },
                  { label: 'TOTAL OBRA', total: totalObra, executed: totalObraEj, highlight: true },
                  { label: 'MATERIALES INVENTARIO', total: materialesInventario, executed: materialesInventarioEj },
                  { label: 'VALOR FACTURADO', total: valorFacturado, executed: valorFacturadoEj },
                  { label: '(-) RETENCIONES', total: retenciones, executed: retencionesEj },
                  { label: '(-) ESTAMPILLA', total: estampilla, executed: estampillaEj },
                  { label: 'TOTAL A PAGAR ORDEN $', total: totalAPagar, executed: totalAPagarEj },
                  { label: 'OTROS COSTOS', total: otrosCostos, executed: otrosCostosEj },
                  { label: 'SALDO', total: saldo, executed: saldoEj },
                  { label: 'UTILIDAD DE LA OBRA', total: utilidadObra, executed: utilidadObraEj },
                  { label: '% UTILIDAD DE LA OBRA', total: pctUtilidad, executed: pctUtilidadEj, percent: true },
                  { label: 'COSTOS L.N.A', total: costosLna, executed: costosLnaEj },
                  { label: 'UTILIDAD FINAL', total: utilidadFinal, executed: utilidadFinalEj, highlight: true },
                  { label: '% UTILIDAD FINAL', total: pctUtilidadFinal, executed: pctUtilidadFinalEj, percent: true, highlight: true },
                ];
                const moneyChartRows = financialRows
                  .filter((row) => !row.percent && (Math.abs(row.total) > 0 || Math.abs(row.executed) > 0))
                  .map((row) => ({
                    name: row.label,
                    total: row.total,
                    executed: row.executed,
                    diff: row.executed - row.total,
                  }));
                const fmtPercent = (value: number) => `${value.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
                const fmtValue = (value: number, isPercent?: boolean) => {
                  if (Math.abs(value) < 0.000001) return '-';
                  return isPercent ? fmtPercent(value) : fmtCOP(value);
                };
                const fmtMoneyShort = (value: number) => {
                  const sign = value < 0 ? '-' : '';
                  const abs = Math.abs(value);
                  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
                  return `${sign}$${abs.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
                };
                const summaryDiff = totalObraEj - totalObra;
                return (
                  <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-2xl p-5 shadow-sm space-y-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
                          <BarChart3 className="w-5 h-5" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-[hsl(var(--canalco-neutral-800))] leading-tight">Resumen financiero del presupuesto</h3>
                          <p className="text-[11px] text-[hsl(var(--canalco-neutral-400))]">
                            Comparativo entre Vr total y Ejecutado {actaDirectorBudgets.length > 1 ? `consolidado de ${actaDirectorBudgets.length} presupuestos de proyecto.` : 'del presupuesto del acta.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700">
                          Vr total <strong>{fmtCOP(totalObra)}</strong>
                        </span>
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-700">
                          Ejecutado <strong>{fmtCOP(totalObraEj)}</strong>
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 ${summaryDiff > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                          Diferencia <strong>{fmtCOP(summaryDiff)}</strong>
                        </span>
                      </div>
                    </div>

                    {moneyChartRows.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--canalco-neutral-200))] p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Comparativo financiero</h4>
                            <p className="text-[11px] text-[hsl(var(--canalco-neutral-400))]">Barras horizontales por concepto monetario.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[hsl(var(--canalco-neutral-200))] px-2.5 py-1 shadow-sm">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />Vr total
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[hsl(var(--canalco-neutral-200))] px-2.5 py-1 shadow-sm">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Ejecutado
                            </span>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={Math.max(320, moneyChartRows.length * 42)}>
                          <BarChart layout="vertical" data={moneyChartRows} margin={{ top: 8, right: 28, left: 142, bottom: 8 }} barCategoryGap="20%" barGap={3}>
                            <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--canalco-neutral-200))" horizontal={false} />
                            <XAxis
                              type="number"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 11, fill: 'hsl(var(--canalco-neutral-400))' }}
                              tickFormatter={fmtMoneyShort}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={160}
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--canalco-neutral-600))' }}
                            />
                            <RTooltip
                              formatter={(value: number, key) => [fmtCOP(Number(value)), key === 'total' ? 'Vr total' : key === 'executed' ? 'Ejecutado' : key]}
                              cursor={{ fill: 'hsl(var(--canalco-primary))', fillOpacity: 0.06 }}
                              contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--canalco-neutral-200))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                            <Bar dataKey="total" name="Vr total" fill="#64748b" radius={[0, 5, 5, 0]} maxBarSize={12} />
                            <Bar dataKey="executed" name="Ejecutado" fill="#10b981" radius={[0, 5, 5, 0]} maxBarSize={12} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-xl border border-[hsl(var(--canalco-neutral-200))]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                            <th className="px-4 py-2.5 font-semibold">Concepto</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Vr total</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Ejecutado</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                          {financialRows.map((row) => {
                            const diff = row.executed - row.total;
                            const isNegative = diff < 0;
                            const isZero = Math.abs(diff) < 0.000001;
                            return (
                              <tr key={row.label} className={`${row.highlight ? 'bg-[hsl(var(--canalco-primary))]/5 font-semibold' : 'bg-white'} hover:bg-[hsl(var(--canalco-neutral-50))]`}>
                                <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-800))]">{row.label}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-700))]">{fmtValue(row.total, row.percent)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{fmtValue(row.executed, row.percent)}</td>
                                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${isZero ? 'text-[hsl(var(--canalco-neutral-400))]' : isNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                                  {isZero ? '-' : fmtValue(diff, row.percent)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })()}

      </>
    );

    return (
      <>
      <TabsContent value="operativo" className="mt-0 space-y-4">
        {rowsWithSchedule.length === 0 ? (
          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
            <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
              <ClipboardList className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Operativo del acta</p>
              <p className="text-xs mt-1">No hay proyectos con cronograma cargado en esta acta.</p>
            </div>
          </section>
        ) : (
          <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Operativo consolidado del acta</h3>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                  {selectedActa ? `Acta ${selectedActa} - ` : ''}{rowsWithSchedule.length} proyecto{rowsWithSchedule.length !== 1 ? 's' : ''} consolidado{rowsWithSchedule.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KPICard label="UCAPs" p={ucapPct} sub={`${fmtQ(totUcapQE)} / ${fmtQ(totUcapQP)} uds`} color="bg-[hsl(var(--canalco-primary))]" />
                <KPICard label="Materiales" p={matPct} sub={totMatVP > 0 ? `${fmtCOP(totMatVE)} / ${fmtCOP(totMatVP)}` : `${fmtQ(totMatQE)} / ${fmtQ(totMatQP)}`} color="bg-sky-400" />
                <KPICard label="Actividades" p={actPct} sub={totActP > 0 ? `${fmtQ(totActE)} / ${fmtQ(totActP)}` : 'Sin plan'} color="bg-violet-400" />
              </div>

              {false && (
              <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Avance Operativo
                  </h4>
                  <span className="text-2xl font-bold text-[hsl(var(--canalco-primary))]">{Math.round(totalOperativo)}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                  <div className="h-2.5 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, totalOperativo)}%` }} />
                </div>
                <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-1.5">Promedio ponderado de ejecutado vs planeado - UCAPs 30% - Materiales 30% - Actividades 40%</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  {groups.map((group) => (
                    <div key={group.key} className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))]">{group.key}</span>
                        <span className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">{group.hasPlan ? `${Math.round(group.pct)}%` : '-'}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))] mt-2">
                        <div className="h-2 rounded-full bg-[hsl(var(--canalco-primary))]/70 transition-all" style={{ width: `${Math.min(100, group.hasPlan ? group.pct : 0)}%` }} />
                      </div>
                      <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-1.5">{group.executed.toLocaleString('es-CO')} / {group.planned.toLocaleString('es-CO')} - peso {Math.round(group.weight * 100)}%</p>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ucapRows.length > 0 && (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                  <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />UCAPs
                    </h3>
                    <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{ucapRows.length} item{ucapRows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                          <th className="px-4 py-2 font-medium">Código</th>
                          <th className="px-4 py-2 font-medium">Descripción</th>
                          <th className="px-4 py-2 font-medium text-right">Plan</th>
                          <th className="px-4 py-2 font-medium text-right">Ejec.</th>
                          <th className="px-4 py-2 font-medium text-right">Esperado</th>
                          <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                          <th className="px-4 py-2 font-medium text-right">Vr. Unitario</th>
                          <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                          <th className="px-4 py-2 font-medium text-right">Ejecutado $</th>
                          <th className="px-4 py-2 font-medium text-center">Avance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                        {ucapRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{row.ucapCode}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[220px] truncate" title={row.ucapDescription}>{row.ucapDescription}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.plannedQuantity)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(row.execQty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{row.plannedQuantity > 0 ? fmtQ(row.expectedQty) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, row.plannedQuantity - row.execQty))}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{row.unitValue > 0 ? fmtCOP(row.unitValue) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{row.plannedVal > 0 ? fmtCOP(row.plannedVal) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{row.execVal > 0 ? fmtCOP(row.execVal) : '-'}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-[90px]">
                                <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                  <div className="h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, row.p)}%` }} />
                                </div>
                                <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{row.plannedQuantity > 0 ? `${Math.round(row.p)}%` : '-'}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold text-[hsl(var(--canalco-neutral-700))] text-xs">
                          <td className="px-4 py-2.5" colSpan={7}>Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{totUcapVP > 0 ? fmtCOP(totUcapVP) : '-'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{totUcapVE > 0 ? fmtCOP(totUcapVE) : '-'}</td>
                          <td className="px-4 py-2.5" colSpan={1} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}

              {pcRows.length > 0 && (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                  <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Presupuesto vs Órdenes de Compra
                    </h3>
                    <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">{pcRows.length} item{pcRows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                          <th className="px-4 py-2 font-medium">Código</th>
                          <th className="px-4 py-2 font-medium">Descripción</th>
                          <th className="px-4 py-2 font-medium">U/M</th>
                          <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                          <th className="px-4 py-2 font-medium text-right">Instalado</th>
                          <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                          <th className="px-4 py-2 font-medium text-right">Req.</th>
                          <th className="px-4 py-2 font-medium text-right">OC</th>
                          <th className="px-4 py-2 font-medium text-right">Ppto. $</th>
                          <th className="px-4 py-2 font-medium text-right">OC $</th>
                          <th className="px-4 py-2 font-medium text-right">Dif. $</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                        {pcRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{row.materialCode}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[220px] truncate" title={row.materialDescription ?? ''}>{row.materialDescription ?? '-'}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-500))]">{row.unitOfMeasure ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.budgetQty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-800))]">{fmtQ(row.execQty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(Math.max(0, row.budgetQty - row.execQty))}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{row.requisitionedQty > 0 ? fmtQ(row.requisitionedQty) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{row.orderedQty > 0 ? fmtQ(row.orderedQty) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{row.budgetValue > 0 ? fmtCOP(row.budgetValue) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{row.orderedValue > 0 ? fmtCOP(row.orderedValue) : '-'}</td>
                            <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.orderedValue === 0 ? 'text-[hsl(var(--canalco-neutral-400))]' : row.diffValue >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {row.orderedValue === 0 ? '-' : fmtCOP(row.diffValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t-2 border-[hsl(var(--canalco-neutral-300))] font-semibold">
                          <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-600))]" colSpan={8}>Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{totPcBudget > 0 ? fmtCOP(totPcBudget) : '-'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{totPcOrdered > 0 ? fmtCOP(totPcOrdered) : '-'}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${totPcOrdered === 0 ? 'text-[hsl(var(--canalco-neutral-400))]' : totPcDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {totPcOrdered === 0 ? '-' : fmtCOP(totPcDiff)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}

              {actRows.length > 0 && (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                  <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-violet-500" />Actividades
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                          <th className="px-4 py-2 font-medium">Actividad</th>
                          <th className="px-4 py-2 font-medium text-right">Planeado</th>
                          <th className="px-4 py-2 font-medium text-right">Ejecutado</th>
                          <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                          <th className="px-4 py-2 font-medium text-center">Avance</th>
                          <th className="px-4 py-2 font-medium text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                        {actRows.map((row) => (
                          <tr key={row.name} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-medium text-[hsl(var(--canalco-neutral-700))]">{row.name}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.planned)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(row.execd)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, row.planned - row.execd))}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-[90px]">
                                <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                  <div className="h-1.5 rounded-full bg-violet-400 transition-all" style={{ width: `${Math.min(100, row.p)}%` }} />
                                </div>
                                <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{row.planned > 0 ? `${Math.round(row.p)}%` : '-'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">{badge(row.p, row.planned > 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {darkSummaryPanels}
            </div>
        )}
      </TabsContent>
      <TabsContent value="graficos" className="mt-0 space-y-4">
        {rowsWithSchedule.length === 0 ? (
          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
            <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
              <BarChart3 className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
              <p className="text-sm">No hay datos para graficar.</p>
            </div>
          </section>
        ) : actaGraficos}
      </TabsContent>
      </>
    );
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

  // ── physical progress: sum(ejecutado real) / sum(planned) across all UCAPs
  //    Usa la ejecución del plan diario (Ejecución UCAPs), no el campo legacy `executed`.
  const physicalProgress = useMemo(() => {
    if (!schedule || !schedule.items.length) return null;
    const totalPlanned = schedule.items.reduce((sum, item) => sum + item.plannedQuantity, 0);
    if (!totalPlanned) return null;
    const totalExecuted = schedule.items.reduce(
      (sum, item) => sum + Object.values(execDailyMap).reduce((s, day) => s + (day[item.ucapId] ?? 0), 0),
      0,
    );
    return clamp01(totalExecuted / totalPlanned) * 100;
  }, [schedule, execDailyMap]);

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
        // el plan puede programar más cantidad que el alcance del UCAP → tope al planeado
        const qty = Math.min(planToDateMap[item.ucapId] ?? 0, item.plannedQuantity);
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
    return { totalExpected, totalPlanned, pct: clamp01(totalExpected / totalPlanned) * 100, perUcap, fromPlan: hasPlanData };
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

  // ── Informe: aggregated report data built from the acta (UCAPs, materiales, plan diario)
  const reportData = useMemo(() => {
    if (!schedule) return null;
    const totalPlannedUnits = schedule.items.reduce((s, i) => s + i.plannedQuantity, 0);
    // Ejecutado real desde la Ejecución de UCAPs (plan diario), no el campo legacy `executed`
    const execUcap = (ucapId: number) => Object.values(execDailyMap).reduce((s, day) => s + (day[ucapId] ?? 0), 0);
    const totalExecutedUnits = schedule.items.reduce((s, i) => s + execUcap(i.ucapId), 0);
    const physical = totalPlannedUnits ? clamp01(totalExecutedUnits / totalPlannedUnits) * 100 : 0;

    // Materiales: instalado real (Ejecución de Materiales) vs cantidad de levantamiento (PPTO)
    const materialRows = surveyMaterials.map((m) => {
      const exec = Object.values(execMaterialDailyMap).reduce((s, day) => s + (day[m.materialCode] ?? 0), 0);
      const usage = m.totalQuantity ? clamp01(exec / m.totalQuantity) * 100 : 0;
      const estado: 'En rango' | 'Vigilar' | 'Excedido' = usage >= 100 ? 'Excedido' : usage >= 85 ? 'Vigilar' : 'En rango';
      return { code: m.materialCode, desc: m.materialDescription, unit: m.unitOfMeasure, ppto: m.totalQuantity, exec, usage, estado };
    });

    // Alcance por capítulo: cada UCAP con su % real y la marca de % esperado a la fecha
    const chapters = schedule.items.map((i) => {
      const exec = execUcap(i.ucapId);
      const real = i.plannedQuantity ? clamp01(exec / i.plannedQuantity) * 100 : 0;
      const expQty = expectedByToday?.perUcap[i.ucapId];
      const expectedPct = expQty !== undefined && i.plannedQuantity ? clamp01(expQty / i.plannedQuantity) * 100 : null;
      return { code: i.ucapCode, desc: i.ucapDescription, planned: i.plannedQuantity, exec, real, expectedPct };
    });

    // Curva S: % acumulado programado vs real en el tiempo (desde el plan diario).
    // Granularidad adaptativa (diaria → semanal → mensual) según la duración del periodo,
    // para que siempre se dibuje una curva y no puntos sueltos.
    const dms = (d: string) => parseLocalDate(d.slice(0, 10)).getTime();
    const sortedPlans = reportPlans
      .filter((p) => p.planDate && ((p.plannedQuantity || 0) !== 0 || (p.executedQuantity || 0) !== 0))
      .sort((a, b) => (a.planDate < b.planDate ? -1 : 1));
    const planDates = sortedPlans.map((p) => p.planDate.slice(0, 10));
    const rangeStart = (contractualStart || startDate || planDates[0] || '').slice(0, 10);
    const rangeEnd = (contractualEnd || endDate || planDates[planDates.length - 1] || '').slice(0, 10);
    const denom = totalPlannedUnits || sortedPlans.reduce((s, p) => s + (p.plannedQuantity || 0), 0) || 1;
    const curvaTodayMs = parseLocalDate(formatDate(new Date())).getTime();
    let curva: Array<{ month: string; programado: number; real: number | null }> = [];
    if (rangeStart && rangeEnd) {
      const DAY = 86_400_000;
      const startMs = dms(rangeStart);
      const endMs = Math.max(dms(rangeEnd), startMs + DAY);
      const spanDays = Math.round((endMs - startMs) / DAY);
      const stepDays = spanDays <= 21 ? 1 : spanDays <= 90 ? 3 : spanDays <= 180 ? 7 : spanDays <= 540 ? 14 : 30;
      const useDay = stepDays < 28;
      const fmtLabel = (ms: number) => {
        const s = new Date(ms).toLocaleDateString('es-CO', useDay ? { day: 'numeric', month: 'short' } : { month: 'short' });
        return s.charAt(0).toUpperCase() + s.slice(1);
      };
      const stops: number[] = [];
      for (let ms = startMs; ms <= endMs; ms += stepDays * DAY) stops.push(ms);
      if (stops[stops.length - 1] !== endMs) stops.push(endMs);
      curva = stops.map((ms) => {
        let progCum = 0, realCum = 0;
        for (const p of sortedPlans) {
          if (dms(p.planDate) <= ms) { progCum += p.plannedQuantity || 0; realCum += p.executedQuantity || 0; }
          else break;
        }
        const real: number | null = ms > curvaTodayMs ? null : clamp01(realCum / denom) * 100;
        return { month: fmtLabel(ms), programado: clamp01(progCum / denom) * 100, real };
      });
      // Punto inicial en 0% (arranque del proyecto, un paso antes del primer dato)
      curva.unshift({ month: fmtLabel(startMs - stepDays * DAY), programado: 0, real: 0 });
      // El último punto no-futuro refleja al menos el avance físico real (de UCAPs)
      for (let i = curva.length - 1; i >= 0; i--) {
        if (curva[i].real !== null) { if (curva[i].real! < physical) curva[i].real = physical; break; }
      }
    }

    return { totalPlannedUnits, totalExecutedUnits, physical, materialRows, chapters, curva };
  }, [schedule, execDailyMap, execMaterialDailyMap, surveyMaterials, expectedByToday, reportPlans, contractualStart, contractualEnd, startDate, endDate]);

  // ── Avance Operativo: promedio ponderado de ejecutado vs planeado, con desglose por ítem.
  //    Ejecutado = tablas de Ejecución. Planeado: UCAPs→alcance, Materiales→levantamiento, Actividades→Plan Diario.
  //    Pesos: UCAPs 30% · Materiales 30% · Actividades 40% (se renormalizan si alguna no tiene plan)
  const operativeProgress = useMemo(() => {
    if (!schedule) return null;
    const ippF = Number(schedule.ippFactor) || 1;
    const ratio = (e: number, p: number) => (p > 0 ? clamp01(e / p) * 100 : 0);
    const spanOf = (dates: string[]): { start: string | null; end: string | null } => {
      if (!dates.length) return { start: null, end: null };
      const sorted = [...dates].sort();
      return { start: sorted[0], end: sorted[sorted.length - 1] };
    };
    const datesWith = (map: Record<string, Record<string, number>>, has: (day: Record<string, number>) => boolean) =>
      Object.entries(map).filter(([, day]) => has(day)).map(([d]) => d);

    // Fracción temporal transcurrida del periodo del ítem (para el "esperado a hoy")
    const todayMs = parseLocalDate(formatDate(new Date())).getTime();
    const frac = (start: string | null, end: string | null): number | null => {
      if (!start || !end) return null;
      const s = parseLocalDate(start).getTime();
      const e = parseLocalDate(end).getTime();
      if (e <= s) return todayMs >= e ? 1 : 0;
      return clamp01((todayMs - s) / (e - s));
    };

    // Días planificados (Plan Diario UCAPs) por ucap — ubican la barra en la línea de tiempo
    const ucapPlanDates: Record<number, string[]> = {};
    reportPlans.forEach((p) => { if ((p.plannedQuantity || 0) > 0) (ucapPlanDates[p.ucapId] ||= []).push(p.planDate); });

    // UCAPs: ejecutado (Ejecución UCAPs) vs alcance · fechas = Plan Diario UCAPs (respaldo: ejecución / Inicio-Fin)
    const ucapItems = schedule.items.map((it) => {
      const executed = Object.values(execDailyMap).reduce((s, day) => s + (day[it.ucapId] ?? 0), 0);
      const planned = it.plannedQuantity;
      const planDates = ucapPlanDates[it.ucapId] || [];
      const execDates = datesWith(execDailyMap, (day) => (day[it.ucapId] ?? 0) > 0);
      let { start, end } = spanOf(planDates.length ? planDates : execDates);
      if (!start || !end) { const d = ucapDates[it.ucapId]; start = d?.start || null; end = d?.end || null; }
      const fromPlan = expectedByToday?.perUcap[it.ucapId];
      const f = frac(start, end);
      const expectedQty = fromPlan !== undefined ? fromPlan : (f !== null ? planned * f : null);
      const expectedPct = expectedQty !== null && planned > 0 ? clamp01(expectedQty / planned) * 100 : null;
      return { label: it.ucapCode, sublabel: it.ucapDescription, executed, planned, pct: ratio(executed, planned), start, end, expectedQty, expectedPct };
    });

    // Materiales: ejecutado vs levantamiento · fechas = Plan Diario Materiales (respaldo: ejecución)
    const matItems = surveyMaterials.map((m) => {
      const executed = Object.values(execMaterialDailyMap).reduce((s, day) => s + (day[m.materialCode] ?? 0), 0);
      const planned = m.totalQuantity;
      const planDates = datesWith(materialDailyMap, (day) => (day[m.materialCode] ?? 0) > 0);
      const execDates = datesWith(execMaterialDailyMap, (day) => (day[m.materialCode] ?? 0) > 0);
      const { start, end } = spanOf(planDates.length ? planDates : execDates);
      const f = frac(start, end);
      const expectedQty = f !== null ? planned * f : null;
      const expectedPct = expectedQty !== null && planned > 0 ? clamp01(expectedQty / planned) * 100 : null;
      const uv = execMaterialUnitPrices[m.materialCode] ? (parseFloat(execMaterialUnitPrices[m.materialCode]) || 0) : (m.unitValue ?? 0);
      return { label: m.materialCode, sublabel: m.materialDescription ?? '', executed, planned, pct: ratio(executed, planned), start, end, expectedQty, expectedPct, executedVal: executed * uv * ippF, plannedVal: planned * uv * ippF };
    });

    // Materiales agregados manualmente en ejecución · presupuesto editable (Ppto.) → cuentan en el avance
    const extraMatItems = extraExecMaterials.map((r) => {
      const executed = Object.values(execMaterialDailyMap).reduce((s, day) => s + (day[r.code] ?? 0), 0);
      const planned = r.budgetQty ?? 0;
      const execDates = datesWith(execMaterialDailyMap, (day) => (day[r.code] ?? 0) > 0);
      const { start, end } = spanOf(execDates);
      const f = frac(start, end);
      const expectedQty = (planned > 0 && f !== null) ? planned * f : null;
      const expectedPct = (expectedQty !== null && planned > 0) ? clamp01(expectedQty / planned) * 100 : null;
      const plannedVal = r.budgetValue || 0;
      const uv = planned > 0 ? plannedVal / planned : 0;
      return { label: r.code, sublabel: r.description ?? '', executed, planned, pct: ratio(executed, planned), start, end, expectedQty, expectedPct, executedVal: executed * uv, plannedVal };
    });

    // Actividades: agrupadas por nombre · fechas = Plan Diario Actividades (respaldo: ejecución)
    const sumByName = (rows: Array<{ id: string; name: string }>, map: Record<string, Record<string, number>>, name: string) => {
      const ids = rows.filter((r) => r.name === name).map((r) => r.id);
      return Object.values(map).reduce((s, day) => s + ids.reduce((ss, id) => ss + (day[id] ?? 0), 0), 0);
    };
    const datesByName = (rows: Array<{ id: string; name: string }>, map: Record<string, Record<string, number>>, name: string) => {
      const ids = rows.filter((r) => r.name === name).map((r) => r.id);
      return datesWith(map, (day) => ids.some((id) => (day[id] ?? 0) > 0));
    };
    const actNames = [...new Set([...activityRows, ...execActivityRows].map((r) => r.name).filter(Boolean))];
    const actItems = actNames.map((name) => {
      const planned = sumByName(activityRows, activityDailyMap, name);
      const executed = sumByName(execActivityRows, execActivityDailyMap, name);
      const planDates = datesByName(activityRows, activityDailyMap, name);
      const execDates = datesByName(execActivityRows, execActivityDailyMap, name);
      const { start, end } = spanOf(planDates.length ? planDates : execDates);
      const f = frac(start, end);
      const expectedQty = f !== null ? planned * f : null;
      const expectedPct = expectedQty !== null && planned > 0 ? clamp01(expectedQty / planned) * 100 : null;
      return { label: name, sublabel: '', executed, planned, pct: ratio(executed, planned), start, end, expectedQty, expectedPct };
    });

    const buildGroup = (key: string, weight: number, items: Array<{ executed: number; planned: number }>) => {
      const executed = items.reduce((s, i) => s + i.executed, 0);
      const planned = items.reduce((s, i) => s + i.planned, 0);
      return { key, weight, executed, planned, pct: ratio(executed, planned), hasPlan: planned > 0 };
    };
    // Materiales: el avance se pondera por VALOR (no por cantidad), porque los materiales
    // tienen precios muy distintos. Solo cuentan los presupuestados (Ppto. > 0).
    const matBudgeted = [...matItems, ...extraMatItems].filter((i) => i.planned > 0);
    const matExecVal = matBudgeted.reduce((s, i) => s + i.executedVal, 0);
    const matPlanVal = matBudgeted.reduce((s, i) => s + i.plannedVal, 0);
    const groups = [
      { ...buildGroup('UCAPs', 0.30, ucapItems), items: ucapItems },
      { key: 'Materiales', weight: 0.30, executed: matExecVal, planned: matPlanVal, pct: ratio(matExecVal, matPlanVal), hasPlan: matPlanVal > 0, items: [...matItems, ...extraMatItems] },
      { ...buildGroup('Actividades', 0.40, actItems), items: actItems },
    ];
    const active = groups.filter((g) => g.hasPlan);
    const wsum = active.reduce((s, g) => s + g.weight, 0);
    const total = wsum > 0 ? active.reduce((s, g) => s + g.pct * (g.weight / wsum), 0) : null;
    return { total, groups };
  }, [schedule, execDailyMap, reportPlans, ucapDates, expectedByToday, surveyMaterials, extraExecMaterials, materialDailyMap, execMaterialDailyMap, execMaterialUnitPrices, activityRows, activityDailyMap, execActivityRows, execActivityDailyMap]);

  // ── filter works by the selected municipality within the active department
  const municipalityWorks = useMemo(() => {
    if (!activeMunicipality) return works;
    const muniName = normalizeLocationName(activeMunicipality.name);
    if (activeMunicipality.type === 'company') {
      return works.filter((w) =>
        w.companyId === activeMunicipality.id ||
        normalizeLocationName(w.company?.name) === muniName ||
        (activeMunicipality.linkedProjectId !== undefined && w.projectId === activeMunicipality.linkedProjectId),
      );
    }
    return works.filter((w) =>
      w.projectId === activeMunicipality.id ||
      (!w.projectId && activeMunicipality.companyId !== undefined && w.companyId === activeMunicipality.companyId),
    );
  }, [works, activeMunicipality]);

  // ── grouping: actas with 2+ works
  const groupedWorksMap = useMemo(() => {
    const map = new Map<string, Work[]>();
    municipalityWorks
      .filter((w) => w.recordNumber)
      .forEach((w) => {
        const key = w.recordNumber!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      });
    map.forEach((ws, key) => { if (ws.length < 1) map.delete(key); });
    return map;
  }, [municipalityWorks]);

  const individualWorks = useMemo(
    () => municipalityWorks.filter((w) => w.recordNumber && !groupedWorksMap.has(w.recordNumber)),
    [municipalityWorks, groupedWorksMap],
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
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedWork(null); setSchedule(null); setSelectedActa(null); }}>
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div className="w-56">
                <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Departamento</label>
                <Select
                  value={activeTab}
                  onValueChange={(v) => { setActiveTab(v); setSelectedWork(null); setSchedule(null); setSelectedActa(null); }}
                >
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

              {activeDept && activeDept.municipalities.length > 1 && (
                <div className="w-56">
                  <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                  <Select
                    value={activeMunicipality ? `${activeMunicipality.type}-${activeMunicipality.id}` : ''}
                    onValueChange={(val) => {
                      const muni = activeDept.municipalities.find((m) => `${m.type}-${m.id}` === val);
                      if (muni) { setActiveMunicipality(muni); setSelectedWork(null); setSchedule(null); setSelectedActa(null); }
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Seleccionar municipio" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeDept.municipalities.map((muni) => (
                        <SelectItem key={`${muni.type}-${muni.id}`} value={`${muni.type}-${muni.id}`}>
                          {getMunicipioName(muni.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {groupedWorksMap.size > 0 && (
                <div className="w-56">
                  <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Acta</label>
                  <Select
                    value={selectedActa ?? ''}
                    onValueChange={(val) => {
                      const actaWorks = groupedWorksMap.get(val);
                      if (actaWorks) handleSelectActa(val, actaWorks);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Seleccionar acta" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(groupedWorksMap.entries()).map(([acta, actaWorks]) => (
                        <SelectItem key={acta} value={acta}>
                          Acta {acta} ({actaWorks.length} obras)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {departments.map((dept) => (
              <TabsContent key={dept.name} value={dept.name}>
                <div className="flex gap-6" style={{ minHeight: '70vh' }}>
                  {/* ── Right: schedule detail ── */}
                  <div className="flex-1 min-w-0">
                    {selectedActa && !selectedWork ? (
                      loadingActa ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <h2 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                                Cronograma · Acta {selectedActa}
                              </h2>
                              <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                                Avance de las obras del acta. Haz clic en una obra para desplegar sus UCAPs.
                              </p>
                            </div>
                            {/* ── Flujo de revisión del Plan ── */}
                            <div className="flex flex-col items-end gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                cronogramaStatus === 'aprobado' ? 'bg-emerald-100 text-emerald-700'
                                : cronogramaStatus === 'en_revision' ? 'bg-blue-100 text-blue-700'
                                : cronogramaStatus === 'rechazado' ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                              }`}>
                                {cronogramaStatus === 'aprobado' ? '✓ Plan aprobado'
                                  : cronogramaStatus === 'en_revision' ? '⏳ En revisión del Director Técnico'
                                  : cronogramaStatus === 'rechazado' ? '✗ Devuelto por el Director Técnico'
                                  : 'Plan en elaboración'}
                              </span>
                              {canSubmitCronograma && (
                                <button
                                  onClick={handleSubmitCronograma}
                                  disabled={cronogramaActionLoading}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--canalco-primary))] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                                >
                                  {cronogramaActionLoading ? 'Enviando...' : (cronogramaStatus === 'rechazado' ? 'Corregir y reenviar a revisión' : 'Enviar a revisión')}
                                </button>
                              )}
                              {canReviewCronograma && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleReviewCronograma('aprobado')}
                                    disabled={cronogramaActionLoading}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() => setCronogramaRejectOpen((v) => !v)}
                                    disabled={cronogramaActionLoading}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                                  >
                                    Rechazar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Comentario de rechazo (visible para todos) */}
                          {cronogramaStatus === 'rechazado' && actaCronograma?.cronogramaRechazoMotivo && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                              <span className="font-semibold">Motivo de la devolución: </span>
                              {actaCronograma.cronogramaRechazoMotivo}
                            </div>
                          )}
                          {/* Panel inline para rechazar con motivo (Director Técnico) */}
                          {canReviewCronograma && cronogramaRejectOpen && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                              <label className="text-sm font-medium text-red-800">Motivo del rechazo (obligatorio)</label>
                              <textarea
                                value={cronogramaRejectMotivo}
                                onChange={(e) => setCronogramaRejectMotivo(e.target.value)}
                                rows={3}
                                placeholder="Indica qué debe corregir el Director de Proyecto..."
                                className="w-full rounded-md border border-red-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => { setCronogramaRejectOpen(false); setCronogramaRejectMotivo(''); }}
                                  className="rounded-lg px-3 py-1.5 text-sm text-[hsl(var(--canalco-neutral-600))] hover:bg-white"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleReviewCronograma('rechazado', cronogramaRejectMotivo)}
                                  disabled={cronogramaActionLoading || !cronogramaRejectMotivo.trim()}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                                >
                                  Confirmar rechazo
                                </button>
                              </div>
                            </div>
                          )}
                          <Tabs value={cronogramaTab} onValueChange={setCronogramaTab} className="w-full">
                            <TabsList className="mb-4">
                              <TabsTrigger value="plan">Plan</TabsTrigger>
                              <TabsTrigger value="ejecucion" disabled={!canAccessOtherTabs} title={!canAccessOtherTabs ? 'Disponible cuando el Director Técnico apruebe el plan' : undefined}>Ejecución</TabsTrigger>
                              {canSeeInforme && <TabsTrigger value="informe" disabled={!canAccessOtherTabs}>Informe</TabsTrigger>}
                              {canSeeOperativo && <TabsTrigger value="operativo" disabled={!canAccessOtherTabs}>Operativo</TabsTrigger>}
                              {canSeeOperativo && <TabsTrigger value="graficos" disabled={!canAccessOtherTabs}>Gráficos</TabsTrigger>}
                            </TabsList>

                            <TabsContent value="plan" className="space-y-4 mt-0">
                              {actaScheduleRows.length > 0 && (() => {
                                const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
                                const startValues = rowsWithSchedule.map(({ work }) => actaContractualDates[work.workId]?.start ?? '');
                                const endValues = rowsWithSchedule.map(({ work }) => actaContractualDates[work.workId]?.end ?? '');
                                const commonStart = startValues.length > 0 && startValues.every((v) => v === startValues[0]) ? startValues[0] : '';
                                const commonEnd = endValues.length > 0 && endValues.every((v) => v === endValues[0]) ? endValues[0] : '';
                                const actaProgress = commonStart && commonEnd ? workingDayProgress(commonStart, commonEnd) : null;
                                const applyDateToActa = (field: 'start' | 'end', value: string) => {
                                  setActaContractualDates((prev) => {
                                    const next = { ...prev };
                                    rowsWithSchedule.forEach(({ work }) => {
                                      next[work.workId] = {
                                        ...(next[work.workId] ?? { start: '', end: '' }),
                                        [field]: value,
                                      };
                                    });
                                    return next;
                                  });
                                };
                                const applyStartWithCalculatedEnd = (value: string) => {
                                  applyDateToActa('start', value);
                                  const days = parseInt(actaContractualDays, 10);
                                  if (value && days > 0) {
                                    applyDateToActa('end', addWorkingDays(value, days));
                                  } else if (!value) {
                                    applyDateToActa('end', '');
                                  }
                                };
                                return (
                                  <div className="max-w-md">
                                    <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                      <div className="px-5 pt-5 pb-4">
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                          <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide mt-1 flex items-center gap-1.5">
                                            <CalendarRange className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))]" />Contractual
                                          </h3>
                                          <span className="text-xl font-bold text-[hsl(var(--canalco-primary))] leading-none">—</span>
                                        </div>
                                        <ProgressBar value={actaProgress?.pct ?? 0} color="primary" />
                                      </div>
                                      <div className="px-5 py-4 border-t border-[hsl(var(--canalco-neutral-100))] flex gap-3">
                                        <div className="flex-1">
                                          <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Inicio</Label>
                                          <Input
                                            type="date"
                                            value={commonStart}
                                            onChange={(e) => applyStartWithCalculatedEnd(e.target.value)}
                                            disabled={!canEditPlan}
                                            className="mt-0.5 h-8 text-sm w-full"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Fin calculado</Label>
                                          <Input
                                            type="date"
                                            value={commonEnd}
                                            readOnly
                                            disabled
                                            className="mt-0.5 h-8 text-sm w-full"
                                          />
                                        </div>
                                      </div>
                                      <div className="px-5 py-4 border-t border-[hsl(var(--canalco-neutral-100))]">
                                        <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Días contractuales (hábiles · lun–vie)</Label>
                                        <Input
                                          type="number"
                                          min="1"
                                          value={actaContractualDays}
                                          placeholder="Ej: 90"
                                          disabled={!canEditPlan || !commonStart}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setActaContractualDays(value);
                                            const days = parseInt(value, 10);
                                            if (commonStart && days > 0) {
                                              applyDateToActa('end', addWorkingDays(commonStart, days));
                                            } else if (!value) {
                                              applyDateToActa('end', '');
                                            }
                                          }}
                                          className="mt-0.5 h-8 text-sm w-full"
                                        />
                                        <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-1">
                                          La fecha de fin se calcula automáticamente con la fecha de inicio y los días contractuales hábiles.
                                        </p>
                                      </div>
                                      <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))] flex items-center justify-between text-xs">
                                        <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                        <span className="font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                          {monthProgress.elapsed} / {monthProgress.total} días hábiles
                                        </span>
                                      </div>
                                    </section>
                                    {canEditPlan && (
                                      <div className="flex items-center justify-end gap-3 mt-3">
                                        {lastSavedActaContractual && (
                                          <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaContractual}</span>
                                        )}
                                        <Button onClick={handleSaveActaContractual} disabled={savingActaContractual} variant="outline" className="gap-2 text-sm">
                                          <Save className="w-4 h-4" />
                                          {savingActaContractual ? 'Guardando...' : 'Guardar contractual'}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {false && actaScheduleRows.length > 0 && (() => {
                                const rowsWithSchedule = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
                                const starts = rowsWithSchedule.map(({ work }) => actaContractualDates[work.workId]?.start).filter(Boolean) as string[];
                                const ends = rowsWithSchedule.map(({ work }) => actaContractualDates[work.workId]?.end).filter(Boolean) as string[];
                                const actaStart = starts.length > 0 ? [...starts].sort()[0] : '';
                                const actaEnd = ends.length > 0 ? [...ends].sort().slice(-1)[0] : '';
                                const actaProgress = actaStart && actaEnd ? workingDayProgress(actaStart, actaEnd) : null;
                                return (
                                  <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                    <div className="px-5 pt-5 pb-4">
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide mt-1 flex items-center gap-1.5">
                                          <CalendarRange className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))]" />Contractual del acta
                                        </h3>
                                        <span className="text-xl font-bold text-[hsl(var(--canalco-primary))] leading-none">
                                          —
                                        </span>
                                      </div>
                                      <ProgressBar value={actaProgress?.pct ?? 0} color="primary" />
                                    </div>

                                    <div className="px-5 py-4 border-t border-[hsl(var(--canalco-neutral-100))] overflow-x-auto">
                                      <table className="w-full text-sm border-collapse" style={{ minWidth: 760 }}>
                                        <thead>
                                          <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                            <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Proyecto</th>
                                            <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-40">Inicio</th>
                                            <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-40">Fin</th>
                                            <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-32">Duración</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {rowsWithSchedule.map(({ work }) => {
                                            const dates = actaContractualDates[work.workId] ?? { start: '', end: '' };
                                            const rowProgress = dates.start && dates.end ? workingDayProgress(dates.start, dates.end) : null;
                                            return (
                                              <tr key={work.workId} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                                <td className="py-2 pr-2">
                                                  <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{work.name}</p>
                                                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{work.workCode || 'Sin código'}</p>
                                                </td>
                                                <td className="py-2 pr-2">
                                                  <Input
                                                    type="date"
                                                    value={dates.start}
                                                    disabled={!canEditPlan}
                                                    onChange={(e) => setActaContractualDates((prev) => ({
                                                      ...prev,
                                                      [work.workId]: { ...(prev[work.workId] ?? { start: '', end: '' }), start: e.target.value },
                                                    }))}
                                                    className="h-8 text-sm max-w-[150px]"
                                                  />
                                                </td>
                                                <td className="py-2 pr-2">
                                                  <Input
                                                    type="date"
                                                    value={dates.end}
                                                    disabled={!canEditPlan}
                                                    onChange={(e) => setActaContractualDates((prev) => ({
                                                      ...prev,
                                                      [work.workId]: { ...(prev[work.workId] ?? { start: '', end: '' }), end: e.target.value },
                                                    }))}
                                                    className="h-8 text-sm max-w-[150px]"
                                                  />
                                                </td>
                                                <td className="py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                                  {rowProgress ? `${rowProgress.elapsed} / ${rowProgress.total}` : '—'}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>

                                    <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))] flex items-center justify-between gap-3">
                                      <div className="text-xs">
                                        <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                        <span className="ml-2 font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                          {monthProgress.elapsed} / {monthProgress.total} días hábiles
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {lastSavedActaContractual && (
                                          <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaContractual}</span>
                                        )}
                                        {canEditPlan && (
                                          <Button onClick={handleSaveActaContractual} disabled={savingActaContractual} variant="outline" className="gap-2 text-sm">
                                            <Save className="w-4 h-4" />
                                            {savingActaContractual ? 'Guardando...' : 'Guardar contractual'}
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </section>
                                );
                              })()}
                              {actaScheduleRows.length > 0 && (() => {
                            const days = getWeekDays(weekOffset);
                            const today = formatDate(new Date());
                            const weekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                            const weekHolidaySet = new Set(weekYears.flatMap((y) => [...getColombianHolidays(y)]));
                            const rowsWithItems = actaScheduleRows.filter(({ schedule }) => schedule.items.length > 0);
                            const getPlanned = (workId: number, date: string, ucapId: number) =>
                              parseFloat(actaDailyPlans[workId]?.[date]?.[ucapId]?.planned ?? '') || 0;
                            const getWorkDateTotal = (workId: number, scheduleItems: ScheduleDetail['items'], date: string) =>
                              scheduleItems.reduce((sum, item) => sum + getPlanned(workId, date, item.ucapId), 0);
                            return (
                              <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                  <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                    <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan diario por proyectos
                                  </h3>
                                  <WeekNav days={days} offset={weekOffset} onPrev={() => setWeekOffset((w) => w - 1)} onNext={() => setWeekOffset((w) => w + 1)} onToday={() => setWeekOffset(0)} />
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border-collapse" style={{ minWidth: 760 }}>
                                    <thead>
                                      <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                        <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2 w-56">Proyecto / UCAP</th>
                                        <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                                        {days.map((date, i) => {
                                          const d = new Date(date + 'T12:00:00');
                                          const isToday = date === today;
                                          const isHoliday = weekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                      {rowsWithItems.length === 0 ? (
                                        <tr>
                                          <td colSpan={days.length + 3} className="py-6 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                                            No hay UCAPs registradas en las obras de esta acta.
                                          </td>
                                        </tr>
                                      ) : rowsWithItems.map(({ work, schedule }) => {
                                        const workTotal = allDataDates.reduce((sum, date) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
                                        return (
                                          <Fragment key={work.workId}>
                                            <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t border-[hsl(var(--canalco-neutral-200))]">
                                              <td colSpan={2} className="py-2 pr-2 align-middle">
                                                <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{work.name}</p>
                                                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                                                  {work.workCode || 'Sin codigo'}{work.recordNumber ? ` · Acta ${work.recordNumber}` : ''}
                                                </p>
                                              </td>
                                              {days.map((date) => {
                                                const dateTotal = getWorkDateTotal(work.workId, schedule.items, date);
                                                return (
                                                  <td key={date} className={`py-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                    {dateTotal > 0 ? dateTotal : '—'}
                                                  </td>
                                                );
                                              })}
                                              <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                                                {workTotal > 0 ? workTotal : '—'}
                                              </td>
                                            </tr>
                                            {schedule.items.map((item) => {
                                              const rowPlan = allDataDates.reduce((sum, date) => sum + getPlanned(work.workId, date, item.ucapId), 0);
                                              return (
                                                <tr key={`${work.workId}-${item.ucapId}`} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                                  <td className="py-2 pr-1 pl-4 align-middle">
                                                    <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.ucapCode}</p>
                                                    <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{item.ucapDescription}</p>
                                                  </td>
                                                  <td className="py-2 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                                    {item.plannedQuantity}
                                                  </td>
                                                  {days.map((date) => {
                                                    const isHoliday = weekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                    return (
                                                      <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                        <Input
                                                          type="number"
                                                          min="0"
                                                          step="0.01"
                                                          value={actaDailyPlans[work.workId]?.[date]?.[item.ucapId]?.planned ?? ''}
                                                          placeholder="0"
                                                          disabled={isHoliday || !canEditPlan}
                                                          onChange={(e) => setActaDailyPlans((prev) => {
                                                            const workPlans = prev[work.workId] ?? {};
                                                            const datePlans = workPlans[date] ?? {};
                                                            const cell = datePlans[item.ucapId] ?? { planned: '', executed: '' };
                                                            return {
                                                              ...prev,
                                                              [work.workId]: {
                                                                ...workPlans,
                                                                [date]: {
                                                                  ...datePlans,
                                                                  [item.ucapId]: { ...cell, planned: e.target.value },
                                                                },
                                                              },
                                                            };
                                                          })}
                                                          className="h-7 w-14 text-xs text-center px-1"
                                                        />
                                                      </td>
                                                    );
                                                  })}
                                                  <td className="py-2 text-center">
                                                    <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                                      {rowPlan > 0 ? rowPlan : '—'}
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </Fragment>
                                        );
                                      })}
                                    </tbody>
                                    {rowsWithItems.length > 0 && (
                                      <tfoot>
                                        <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                          <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total plan</td>
                                          <td className="pt-2 pb-2" />
                                          {days.map((date) => {
                                            const total = rowsWithItems.reduce((sum, { work, schedule }) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
                                            return (
                                              <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                {total > 0 ? total : '—'}
                                              </td>
                                            );
                                          })}
                                          <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                            {(() => {
                                              const total = allDataDates.reduce((sum, date) => (
                                                sum + rowsWithItems.reduce((workSum, { work, schedule }) => workSum + getWorkDateTotal(work.workId, schedule.items, date), 0)
                                              ), 0);
                                              return total > 0 ? total : '—';
                                            })()}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>
                                </div>

                                <div className="flex justify-end items-center gap-3 mt-4">
                                  {lastSavedActaDailyPlan && (
                                    <span className="text-xs text-green-600 font-medium">
                                      ✓ Guardado a las {lastSavedActaDailyPlan}
                                    </span>
                                  )}
                                  {canEditPlan && (
                                    <Button onClick={handleSaveActaDailyPlans} disabled={savingActaDailyPlans} variant="outline" className="gap-2 text-sm">
                                      <Save className="w-4 h-4" />
                                      {savingActaDailyPlans ? 'Guardando...' : 'Guardar plan del acta'}
                                    </Button>
                                  )}
                                </div>
                              </section>
                            );
                              })()}
                              {false && actaMaterialRows.length > 0 && (() => {
                                const days = getWeekDays(materialWeekOffset);
                                const today = formatDate(new Date());
                                const matWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                                const matWeekHolidaySet = new Set(matWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
                                const rowsWithMaterials = actaMaterialRows.filter(({ materials }) => materials.length > 0);
                                const getMaterialQty = (workId: number, date: string, code: string) =>
                                  actaMaterialDailyMap[workId]?.[date]?.[code] ?? 0;
                                const getWorkMaterialDateTotal = (workId: number, materials: SurveyMaterialItem[], date: string) =>
                                  materials.reduce((sum, mat) => sum + getMaterialQty(workId, date, mat.materialCode), 0);
                                return (
                                  <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                      <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                        <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan Diario Materiales
                                      </h3>
                                      <WeekNav days={days} offset={materialWeekOffset} onPrev={() => setMaterialWeekOffset((w) => w - 1)} onNext={() => setMaterialWeekOffset((w) => w + 1)} onToday={() => setMaterialWeekOffset(0)} />
                                    </div>

                                    {rowsWithMaterials.length === 0 ? (
                                      <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                                        Las obras de esta acta no tienen materiales registrados en sus levantamientos.
                                      </p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse" style={{ minWidth: 820 }}>
                                          <thead>
                                            <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                              <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Proyecto / Material</th>
                                              <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-16">Unidad</th>
                                              <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                                              {days.map((date, i) => {
                                                const d = new Date(date + 'T12:00:00');
                                                const isToday = date === today;
                                                const isHoliday = matWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                            {rowsWithMaterials.map(({ work, materials }) => {
                                              const workTotal = allDataDates.reduce((sum, date) => sum + getWorkMaterialDateTotal(work.workId, materials, date), 0);
                                              return (
                                                <Fragment key={work.workId}>
                                                  <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t border-[hsl(var(--canalco-neutral-200))]">
                                                    <td colSpan={3} className="py-2 pr-2 align-middle">
                                                      <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{work.name}</p>
                                                      <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{work.workCode || 'Sin codigo'}</p>
                                                    </td>
                                                    {days.map((date) => {
                                                      const dateTotal = getWorkMaterialDateTotal(work.workId, materials, date);
                                                      return (
                                                        <td key={date} className={`py-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                          {dateTotal > 0 ? dateTotal : '—'}
                                                        </td>
                                                      );
                                                    })}
                                                    <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                                                      {workTotal > 0 ? workTotal : '—'}
                                                    </td>
                                                  </tr>
                                                  {materials.map((mat) => {
                                                    const weekTotal = allDataDates.reduce((sum, date) => sum + getMaterialQty(work.workId, date, mat.materialCode), 0);
                                                    return (
                                                      <tr key={`${work.workId}-${mat.materialCode}`} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                                        <td className="py-1.5 pr-2 pl-4">
                                                          <p className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">{mat.materialCode}</p>
                                                          <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] leading-tight truncate max-w-[240px]">{mat.materialDescription}</p>
                                                        </td>
                                                        <td className="py-1.5 px-1 text-center text-xs text-[hsl(var(--canalco-neutral-600))]">
                                                          {mat.unitOfMeasure ?? '—'}
                                                        </td>
                                                        <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                                          {mat.totalQuantity}
                                                        </td>
                                                        {days.map((date) => {
                                                          const isToday = date === today;
                                                          const isHoliday = matWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                          const qty = getMaterialQty(work.workId, date, mat.materialCode);
                                                          return (
                                                            <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                              <Input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={qty || ''}
                                                                placeholder="0"
                                                                disabled={isHoliday || !canEditPlan}
                                                                onChange={(e) => {
                                                                  const val = parseFloat(e.target.value) || 0;
                                                                  setActaMaterialDailyMap((prev) => {
                                                                    const workMap = prev[work.workId] ?? {};
                                                                    const dateMap = workMap[date] ?? {};
                                                                    return {
                                                                      ...prev,
                                                                      [work.workId]: {
                                                                        ...workMap,
                                                                        [date]: { ...dateMap, [mat.materialCode]: val },
                                                                      },
                                                                    };
                                                                  });
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
                                                </Fragment>
                                              );
                                            })}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                              <td colSpan={2} className="pt-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                                              <td className="pt-2" />
                                              {days.map((date) => {
                                                const dayTotal = rowsWithMaterials.reduce((sum, { work, materials }) => sum + getWorkMaterialDateTotal(work.workId, materials, date), 0);
                                                return (
                                                  <td key={date} className={`pt-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                    {dayTotal > 0 ? dayTotal : '—'}
                                                  </td>
                                                );
                                              })}
                                              <td className="pt-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                                {(() => {
                                                  const total = allDataDates.reduce((sum, date) => (
                                                    sum + rowsWithMaterials.reduce((workSum, { work, materials }) => workSum + getWorkMaterialDateTotal(work.workId, materials, date), 0)
                                                  ), 0);
                                                  return total > 0 ? total : '—';
                                                })()}
                                              </td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}

                                    {canEditPlan && (
                                      <div className="flex justify-end items-center gap-3 mt-4">
                                        {lastSavedActaMaterials && (
                                          <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaMaterials}</span>
                                        )}
                                        <Button onClick={handleSaveActaMaterials} disabled={savingActaMaterials} variant="outline" className="gap-2 text-sm">
                                          <Save className="w-4 h-4" />
                                          {savingActaMaterials ? 'Guardando...' : 'Guardar materiales del acta'}
                                        </Button>
                                      </div>
                                    )}
                                  </section>
                                );
                              })()}
                              {actaScheduleRows.length > 0 && (() => {
                                const days = getWeekDays(activityWeekOffset);
                                const today = formatDate(new Date());
                                const actWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                                const actWeekHolidaySet = new Set(actWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
                                const activityWorks = actaScheduleRows.filter(({ schedule }) => schedule.scheduleId > 0);
                                const getActivityQty = (workId: number, date: string, rowId: string) =>
                                  actaActivityDailyMap[workId]?.[date]?.[rowId] ?? 0;
                                const getWorkActivityDateTotal = (workId: number, rows: Array<{ id: string; name: string }>, date: string) =>
                                  rows.reduce((sum, row) => sum + getActivityQty(workId, date, row.id), 0);
                                const addActaActivityRow = (workId: number, scheduleId: number) => {
                                  setActaActivityRows((prev) => ({
                                    ...prev,
                                    [workId]: [...(prev[workId] ?? []), { id: `act-${scheduleId}-${Date.now()}`, name: '' }],
                                  }));
                                };
                                const removeActaActivityRow = (workId: number, rowId: string) => {
                                  setActaActivityRows((prev) => ({
                                    ...prev,
                                    [workId]: (prev[workId] ?? []).filter((row) => row.id !== rowId),
                                  }));
                                  setActaActivityDailyMap((prev) => {
                                    const workMap = prev[workId] ?? {};
                                    const nextWorkMap: NumberDailyMap = {};
                                    Object.entries(workMap).forEach(([date, rowMap]) => {
                                      const { [rowId]: _, ...rest } = rowMap;
                                      nextWorkMap[date] = rest;
                                    });
                                    return { ...prev, [workId]: nextWorkMap };
                                  });
                                };
                                const activityGroupMap = new Map<string, {
                                  key: string;
                                  name: string;
                                  entries: Array<{ work: Work; schedule: ScheduleDetail; row: { id: string; name: string } }>;
                                  dayTotals: Record<string, number>;
                                  total: number;
                                }>();
                                activityWorks.forEach(({ work, schedule }) => {
                                  const rows = actaActivityRows[work.workId] ?? [];
                                  rows.forEach((row) => {
                                    const name = row.name.trim() || 'Sin actividad';
                                    const key = name.toLocaleLowerCase('es-CO');
                                    const current = activityGroupMap.get(key) ?? {
                                      key,
                                      name,
                                      entries: [],
                                      dayTotals: {},
                                      total: 0,
                                    };
                                    current.entries.push({ work, schedule, row });
                                    days.forEach((date) => {
                                      const qty = getActivityQty(work.workId, date, row.id);
                                      current.dayTotals[date] = (current.dayTotals[date] ?? 0) + qty;
                                      current.total += qty;
                                    });
                                    activityGroupMap.set(key, current);
                                  });
                                });
                                const groupedActivities = [...activityGroupMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
                                return (
                                  <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                      <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                        <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan Diario Actividades
                                      </h3>
                                      <WeekNav days={days} offset={activityWeekOffset} onPrev={() => setActivityWeekOffset((w) => w - 1)} onNext={() => setActivityWeekOffset((w) => w + 1)} onToday={() => setActivityWeekOffset(0)} />
                                    </div>

                                    {activityWorks.length === 0 ? (
                                      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-4">
                                        No hay obras con cronograma para registrar actividades en esta acta.
                                      </p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse" style={{ minWidth: 760 }}>
                                          <thead>
                                            <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                              <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Proyecto / Actividad</th>
                                              {days.map((date, i) => {
                                                const d = new Date(date + 'T12:00:00');
                                                const isToday = date === today;
                                                const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                              <th className="w-8 pb-2" />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {groupedActivities.length === 0 ? (
                                              <tr>
                                                <td colSpan={days.length + 3} className="py-6 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
                                                  No hay actividades. Agrega una fila para iniciar el plan del acta.
                                                </td>
                                              </tr>
                                            ) : groupedActivities.map((group) => (
                                              <Fragment key={group.key}>
                                                <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t border-[hsl(var(--canalco-neutral-200))]">
                                                  <td className="py-2 pr-2 align-middle">
                                                    <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{group.name}</p>
                                                    <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{group.entries.length} registro{group.entries.length !== 1 ? 's' : ''}</p>
                                                  </td>
                                                  {days.map((date) => (
                                                    <td key={date} className={`py-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                      {(group.dayTotals[date] ?? 0) > 0 ? group.dayTotals[date] : '—'}
                                                    </td>
                                                  ))}
                                                  <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                                                    {group.total > 0 ? group.total : '—'}
                                                  </td>
                                                  <td />
                                                </tr>
                                                {group.entries.map(({ work, row }) => {
                                                  const weekTotal = allDataDates.reduce((sum, date) => sum + getActivityQty(work.workId, date, row.id), 0);
                                                  return (
                                                    <tr key={`${work.workId}-${row.id}`} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                                      <td className="py-1.5 pr-2 pl-4">
                                                        <Select
                                                          value={row.name}
                                                          disabled={!canEditPlan}
                                                          onValueChange={(val) => setActaActivityRows((prev) => ({
                                                            ...prev,
                                                            [work.workId]: (prev[work.workId] ?? []).map((r) => r.id === row.id ? { ...r, name: val } : r),
                                                          }))}
                                                        >
                                                          <SelectTrigger className="h-7 text-xs min-w-[220px]">
                                                            <SelectValue placeholder="Seleccionar actividad" />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            {[...DEFAULT_ACTIVITY_OPTIONS, ...customActivityOptions].map((opt) => (
                                                              <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                                            ))}
                                                          </SelectContent>
                                                        </Select>
                                                        <p className="mt-1 text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate">{work.name}</p>
                                                      </td>
                                                      {days.map((date) => {
                                                        const isToday = date === today;
                                                        const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                        const qty = getActivityQty(work.workId, date, row.id);
                                                        return (
                                                          <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                            <Input
                                                              type="number"
                                                              min="0"
                                                              step="0.01"
                                                              value={qty || ''}
                                                              placeholder="0"
                                                              disabled={isHoliday || !canEditPlan}
                                                              onChange={(e) => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                setActaActivityDailyMap((prev) => {
                                                                  const workMap = prev[work.workId] ?? {};
                                                                  const dateMap = workMap[date] ?? {};
                                                                  return {
                                                                    ...prev,
                                                                    [work.workId]: {
                                                                      ...workMap,
                                                                      [date]: { ...dateMap, [row.id]: val },
                                                                    },
                                                                  };
                                                                });
                                                              }}
                                                              className="h-7 w-14 text-xs text-center px-1"
                                                            />
                                                          </td>
                                                        );
                                                      })}
                                                      <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                                        {weekTotal > 0 ? weekTotal : '—'}
                                                      </td>
                                                      <td className="py-1.5 pl-1">
                                                        {canEditPlan && (
                                                          <button
                                                            onClick={() => removeActaActivityRow(work.workId, row.id)}
                                                            className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                                                          >
                                                            <X className="w-3.5 h-3.5" />
                                                          </button>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </Fragment>
                                            ))}
                                          </tbody>
                                          {false && (
                                          <tbody>
                                            {activityWorks.map(({ work, schedule }) => {
                                              const rows = actaActivityRows[work.workId] ?? [];
                                              const workTotal = allDataDates.reduce((sum, date) => sum + getWorkActivityDateTotal(work.workId, rows, date), 0);
                                              return (
                                                <Fragment key={work.workId}>
                                                  <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t border-[hsl(var(--canalco-neutral-200))]">
                                                    <td className="py-2 pr-2 align-middle">
                                                      <p className="text-xs font-bold text-[hsl(var(--canalco-neutral-800))] truncate">{work.name}</p>
                                                      <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{work.workCode || 'Sin codigo'}</p>
                                                    </td>
                                                    {days.map((date) => {
                                                      const dateTotal = getWorkActivityDateTotal(work.workId, rows, date);
                                                      return (
                                                        <td key={date} className={`py-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                          {dateTotal > 0 ? dateTotal : '—'}
                                                        </td>
                                                      );
                                                    })}
                                                    <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                                                      {workTotal > 0 ? workTotal : '—'}
                                                    </td>
                                                    <td className="py-2 text-center">
                                                      {canEditPlan && (
                                                        <button
                                                          onClick={() => addActaActivityRow(work.workId, schedule.scheduleId)}
                                                          className="p-1 rounded hover:bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]"
                                                          title="Agregar actividad"
                                                        >
                                                          <Plus className="w-3.5 h-3.5" />
                                                        </button>
                                                      )}
                                                    </td>
                                                  </tr>
                                                  {rows.map((row) => {
                                                    const weekTotal = allDataDates.reduce((sum, date) => sum + getActivityQty(work.workId, date, row.id), 0);
                                                    return (
                                                      <tr key={`${work.workId}-${row.id}`} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                                        <td className="py-1.5 pr-2 pl-4">
                                                          <Select
                                                            value={row.name}
                                                            disabled={!canEditPlan}
                                                            onValueChange={(val) => setActaActivityRows((prev) => ({
                                                              ...prev,
                                                              [work.workId]: (prev[work.workId] ?? []).map((r) => r.id === row.id ? { ...r, name: val } : r),
                                                            }))}
                                                          >
                                                            <SelectTrigger className="h-7 text-xs min-w-[220px]">
                                                              <SelectValue placeholder="Seleccionar actividad" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                              {[...DEFAULT_ACTIVITY_OPTIONS, ...customActivityOptions].map((opt) => (
                                                                <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                                              ))}
                                                            </SelectContent>
                                                          </Select>
                                                        </td>
                                                        {days.map((date) => {
                                                          const isToday = date === today;
                                                          const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                          const qty = getActivityQty(work.workId, date, row.id);
                                                          return (
                                                            <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                              <Input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={qty || ''}
                                                                placeholder="0"
                                                                disabled={isHoliday || !canEditPlan}
                                                                onChange={(e) => {
                                                                  const val = parseFloat(e.target.value) || 0;
                                                                  setActaActivityDailyMap((prev) => {
                                                                    const workMap = prev[work.workId] ?? {};
                                                                    const dateMap = workMap[date] ?? {};
                                                                    return {
                                                                      ...prev,
                                                                      [work.workId]: {
                                                                        ...workMap,
                                                                        [date]: { ...dateMap, [row.id]: val },
                                                                      },
                                                                    };
                                                                  });
                                                                }}
                                                                className="h-7 w-14 text-xs text-center px-1"
                                                              />
                                                            </td>
                                                          );
                                                        })}
                                                        <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                                          {weekTotal > 0 ? weekTotal : '—'}
                                                        </td>
                                                        <td className="py-1.5 pl-1">
                                                          {canEditPlan && (
                                                            <button
                                                              onClick={() => removeActaActivityRow(work.workId, row.id)}
                                                              className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                                                            >
                                                              <X className="w-3.5 h-3.5" />
                                                            </button>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </Fragment>
                                              );
                                            })}
                                          </tbody>
                                          )}
                                          <tfoot>
                                            <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                              <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                                              {days.map((date) => {
                                                const dayTotal = groupedActivities.reduce((sum, group) => sum + (group.dayTotals[date] ?? 0), 0);
                                                return (
                                                  <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                                    {dayTotal > 0 ? dayTotal : '—'}
                                                  </td>
                                                );
                                              })}
                                              <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                                {(() => {
                                                  const total = groupedActivities.reduce((sum, group) => sum + group.total, 0);
                                                  return total > 0 ? total : '—';
                                                })()}
                                              </td>
                                              <td />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}

                                    {canEditPlan && (
                                      <div className="flex justify-between items-center mt-4">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            const first = activityWorks[0];
                                            if (first) addActaActivityRow(first.work.workId, first.schedule.scheduleId);
                                          }}
                                          className="gap-1.5 text-xs"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          Agregar fila
                                        </Button>
                                        <div className="flex items-center gap-3">
                                          {lastSavedActaActivities && (
                                            <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaActivities}</span>
                                          )}
                                          <Button onClick={handleSaveActaActivities} disabled={savingActaActivities} variant="outline" className="gap-2 text-sm">
                                            <Save className="w-4 h-4" />
                                            {savingActaActivities ? 'Guardando...' : 'Guardar actividades del acta'}
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </section>
                                );
                              })()}
                              <p className="text-xs text-[hsl(var(--canalco-neutral-400))]">
                                Selecciona una obra en la lista de la izquierda para editar su cronograma en detalle.
                              </p>
                            </TabsContent>

                            {renderActaExecutionTab()}
                            {false && (
                            <TabsContent value="ejecucion" className="mt-0">
                              <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
                                <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
                                  <Activity className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
                                  <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Ejecución del acta</p>
                                  <p className="text-xs mt-1">Selecciona una obra del acta para registrar o consultar su ejecución.</p>
                                </div>
                              </section>
                            </TabsContent>
                            )}

                            {canSeeInforme && renderActaInformeTab()}
                            {false && canSeeInforme && (
                              <TabsContent value="informe" className="mt-0">
                                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
                                  <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
                                    <BarChart3 className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
                                    <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Informe del acta</p>
                                    <p className="text-xs mt-1">Selecciona una obra del acta para ver su informe detallado.</p>
                                  </div>
                                </section>
                              </TabsContent>
                            )}

                            {canSeeOperativo && renderActaOperativoTab()}

                            {false && canSeeOperativo && (
                              <TabsContent value="operativo" className="mt-0">
                                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-6">
                                  <div className="flex flex-col items-center justify-center text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
                                    <ClipboardList className="w-10 h-10 mb-3 text-[hsl(var(--canalco-primary))]" />
                                    <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Operativo del acta</p>
                                    <p className="text-xs mt-1">Selecciona una obra del acta para consultar su operativo.</p>
                                  </div>
                                </section>
                              </TabsContent>
                            )}
                          </Tabs>
                        </div>
                      )
                    ) : !selectedWork ? (
                      <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--canalco-neutral-400))] gap-3">
                        <ClipboardList className="w-12 h-12 opacity-40" />
                        <p className="text-sm">Selecciona un acta o una obra para ver su cronograma</p>
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

                        {/* ── Plan / Ejecución / Informe tabs ── */}
                        <Tabs value={cronogramaTab} onValueChange={setCronogramaTab} className="w-full">
                          <TabsList className="mb-4">
                            <TabsTrigger value="plan">Plan</TabsTrigger>
                            <TabsTrigger value="ejecucion">Ejecución</TabsTrigger>
                            {canSeeInforme && <TabsTrigger value="informe">Informe</TabsTrigger>}
                            {canSeeOperativo && <TabsTrigger value="operativo">Operativo</TabsTrigger>}
                          </TabsList>

                          <TabsContent value="plan" className="space-y-4 mt-0">
                        {/* ── Fechas Contractual / Operativo ── */}
                        <div className="max-w-md">
                          {/* Contractual */}
                          <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                            <div className="px-5 pt-5 pb-4">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <h3 className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mt-2 flex items-center gap-1.5">
                                  <CalendarRange className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))]" />Contractual
                                </h3>
                                <span className="text-xl font-bold text-[hsl(var(--canalco-primary))] leading-none">
                                  {temporalProgress.contractual !== null
                                    ? `${temporalProgress.contractual.elapsed} / ${temporalProgress.contractual.total} días`
                                    : '—'}
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
                                  disabled={!canEditPlan}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Fin</Label>
                                <Input
                                  type="date"
                                  value={contractualEnd}
                                  onChange={(e) => { setContractualEnd(e.target.value); setIsDirty(true); }}
                                  disabled={!canEditPlan}
                                  className="mt-0.5 h-8 text-sm w-full"
                                />
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                <span className="font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                  {monthProgress.elapsed} / {monthProgress.total} días hábiles
                                </span>
                              </div>
                            </div>
                          </section>
                        </div>

                        {/* ── Plan Diario ── */}
                        {schedule && schedule.items.length > 0 && (() => {
                          const days = getWeekDays(weekOffset);
                          const today = formatDate(new Date());
                          const weekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                          const weekHolidaySet = new Set(weekYears.flatMap((y) => [...getColombianHolidays(y)]));
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                  <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan Diario UCAPs
                                </h3>
                                <WeekNav days={days} offset={weekOffset} onPrev={() => setWeekOffset((w) => w - 1)} onNext={() => setWeekOffset((w) => w + 1)} onToday={() => setWeekOffset(0)} />
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse" style={{ minWidth: 620 }}>
                                  <thead>
                                    <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                      <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2 w-40">UCAP</th>
                                      <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                                      {days.map((date, i) => {
                                        const d = new Date(date + 'T12:00:00');
                                        const isToday = date === today;
                                        const isHoliday = weekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                      const rowPlan = allDataDates.reduce((s, d) => s + (parseFloat(dailyPlans[d]?.[item.ucapId]?.planned ?? '') || 0), 0);
                                      return (
                                        <tr key={item.ucapId} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                          <td className="py-2 pr-1 align-middle w-32">
                                            <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.ucapCode}</p>
                                            <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{item.ucapDescription}</p>
                                          </td>
                                          <td className="py-2 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                            {item.plannedQuantity}
                                          </td>
                                          {days.map((date) => {
                                            const isHoliday = weekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                            return (
                                              <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={dailyPlans[date]?.[item.ucapId]?.planned ?? ''}
                                                  placeholder="0"
                                                  disabled={isHoliday || !canEditPlan}
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
                                          <td className="py-2 text-center">
                                            <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                              {rowPlan > 0 ? rowPlan : '—'}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                      <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total plan</td>
                                      <td className="pt-2 pb-2" />
                                      {days.map((date) => {
                                        const t = schedule.items.reduce((s, item) => s + (parseFloat(dailyPlans[date]?.[item.ucapId]?.planned ?? '') || 0), 0);
                                        return (
                                          <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                            {t > 0 ? t : '—'}
                                          </td>
                                        );
                                      })}
                                      <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                        {(() => { const g = allDataDates.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (parseFloat(dailyPlans[d]?.[i.ucapId]?.planned ?? '') || 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                {canEditPlan && (
                                  <Button onClick={handleSaveDailyPlans} disabled={savingDailyPlans} variant="outline" className="gap-2 text-sm">
                                    <Save className="w-4 h-4" />
                                    {savingDailyPlans ? 'Guardando...' : 'Guardar plan'}
                                  </Button>
                                )}
                              </div>
                            </section>
                          );
                        })()}

                        {/* ── Plan Diario Materiales ── */}
                        {false && schedule && (() => {
                          const days = getWeekDays(materialWeekOffset);
                          const today = formatDate(new Date());
                          const matWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                          const matWeekHolidaySet = new Set(matWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                  <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan Diario Materiales
                                </h3>
                                <WeekNav days={days} offset={materialWeekOffset} onPrev={() => setMaterialWeekOffset((w) => w - 1)} onNext={() => setMaterialWeekOffset((w) => w + 1)} onToday={() => setMaterialWeekOffset(0)} />
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
                                          const isHoliday = matWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                        const weekTotal = allDataDates.reduce((s, d) => s + (materialDailyMap[d]?.[mat.materialCode] ?? 0), 0);
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
                                              const isHoliday = matWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                              const qty = materialDailyMap[date]?.[mat.materialCode] ?? 0;
                                              return (
                                                <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={qty || ''}
                                                    placeholder="0"
                                                    disabled={isHoliday || !canEditPlan}
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
                                          {(() => { const g = allDataDates.reduce((s, d) => s + surveyMaterials.reduce((ss, mat) => ss + (materialDailyMap[d]?.[mat.materialCode] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}

                              {canEditPlan && (
                                <div className="flex justify-end mt-4">
                                  <Button onClick={handleSaveMaterials} disabled={savingMaterials} variant="outline" className="gap-2 text-sm">
                                    <Save className="w-4 h-4" />
                                    {savingMaterials ? 'Guardando...' : 'Guardar materiales'}
                                  </Button>
                                </div>
                              )}
                            </section>
                          );
                        })()}

                        {/* ── Plan Diario Actividades ── */}
                        {schedule && (() => {
                          const days = getWeekDays(activityWeekOffset);
                          const today = formatDate(new Date());
                          const actWeekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                          const actWeekHolidaySet = new Set(actWeekYears.flatMap((y) => [...getColombianHolidays(y)]));
                          return (
                            <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
                                <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                  <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Plan Diario Actividades
                                </h3>
                                <WeekNav days={days} offset={activityWeekOffset} onPrev={() => setActivityWeekOffset((w) => w - 1)} onNext={() => setActivityWeekOffset((w) => w + 1)} onToday={() => setActivityWeekOffset(0)} />
                              </div>

                              {activityRows.length === 0 ? (
                                <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-4">
                                  No hay actividades. Agrega una con el botón de abajo.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
                                    <thead>
                                      <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                        <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Actividad</th>
                                        {days.map((date, i) => {
                                          const d = new Date(date + 'T12:00:00');
                                          const isToday = date === today;
                                          const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
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
                                        <th className="w-6 pb-2" />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {activityRows.map((row) => {
                                        const weekTotal = allDataDates.reduce((s, d) => s + (activityDailyMap[d]?.[row.id] ?? 0), 0);
                                        return (
                                          <tr key={row.id} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                            <td className="py-1.5 pr-2">
                                              <Select
                                                value={row.name}
                                                disabled={!canEditPlan}
                                                onValueChange={(val) => setActivityRows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: val } : r))}
                                              >
                                                <SelectTrigger className="h-7 text-xs min-w-[200px]">
                                                  <SelectValue placeholder="Seleccionar actividad" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {[...DEFAULT_ACTIVITY_OPTIONS, ...customActivityOptions].map((opt) => (
                                                    <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </td>
                                            {days.map((date) => {
                                              const isToday = date === today;
                                              const isHoliday = actWeekHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                              const qty = activityDailyMap[date]?.[row.id] ?? 0;
                                              return (
                                                <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={qty || ''}
                                                    placeholder="0"
                                                    disabled={isHoliday || !canEditPlan}
                                                    onChange={(e) => {
                                                      const val = parseFloat(e.target.value) || 0;
                                                      setActivityDailyMap((prev) => ({
                                                        ...prev,
                                                        [date]: { ...prev[date], [row.id]: val },
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
                                            <td className="py-1.5 pl-1">
                                              {canEditPlan && (
                                                <button
                                                  onClick={() => removeActivityRow(row.id)}
                                                  className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                        <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total día</td>
                                        {days.map((date) => {
                                          const isToday = date === today;
                                          const dayTotal = activityRows.reduce((s, row) => s + (activityDailyMap[date]?.[row.id] ?? 0), 0);
                                          return (
                                            <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${isToday ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>
                                              {dayTotal > 0 ? dayTotal : '—'}
                                            </td>
                                          );
                                        })}
                                        <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                          {(() => { const g = allDataDates.reduce((s, d) => s + activityRows.reduce((ss, row) => ss + (activityDailyMap[d]?.[row.id] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                        </td>
                                        <td />
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}

                              {showAddActivityInput && (
                                <div className="flex items-center gap-2 mt-3">
                                  <Input
                                    autoFocus
                                    value={newCustomActivity}
                                    onChange={(e) => setNewCustomActivity(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newCustomActivity.trim()) {
                                        setCustomActivityOptions((prev) => [...prev, newCustomActivity.trim()]);
                                        setNewCustomActivity('');
                                        setShowAddActivityInput(false);
                                      }
                                      if (e.key === 'Escape') { setShowAddActivityInput(false); setNewCustomActivity(''); }
                                    }}
                                    placeholder="Nombre de la nueva actividad"
                                    className="h-7 text-xs flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs px-3"
                                    onClick={() => {
                                      if (newCustomActivity.trim()) {
                                        setCustomActivityOptions((prev) => [...prev, newCustomActivity.trim()]);
                                        setNewCustomActivity('');
                                        setShowAddActivityInput(false);
                                      }
                                    }}
                                  >
                                    Guardar
                                  </Button>
                                  <button
                                    onClick={() => { setShowAddActivityInput(false); setNewCustomActivity(''); }}
                                    className="p-1 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {canEditPlan && (
                                <div className="flex justify-between items-center mt-4">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={addActivityRow}
                                      className="gap-1.5 text-xs"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Agregar fila
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowAddActivityInput(true)}
                                      className="gap-1.5 text-xs"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Nueva actividad
                                    </Button>
                                  </div>
                                  <Button onClick={handleSaveActivities} variant="outline" className="gap-2 text-sm">
                                    <Save className="w-4 h-4" />
                                    Guardar actividades
                                  </Button>
                                </div>
                              )}
                            </section>
                          );
                        })()}
                          </TabsContent>

                          <TabsContent value="ejecucion" className="space-y-4 mt-0">

                            {/* ── Ejecución UCAPs ── */}
                            {schedule && schedule.items.length > 0 && (() => {
                              const days = getWeekDays(execWeekOffset);
                              const today = formatDate(new Date());
                              const weekYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                              const holidaySet = new Set(weekYears.flatMap((y) => [...getColombianHolidays(y)]));
                              return (
                                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">Ejecución UCAPs</h3>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => setExecWeekOffset((w) => w - 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">‹</button>
                                      <span className="text-xs text-[hsl(var(--canalco-neutral-600))] min-w-[140px] text-center">
                                        {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                        {' – '}
                                        {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      </span>
                                      <button onClick={() => setExecWeekOffset((w) => w + 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">›</button>
                                      {execWeekOffset !== 0 && <button onClick={() => setExecWeekOffset(0)} className="text-xs text-[hsl(var(--canalco-primary))] underline ml-1">Hoy</button>}
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse" style={{ minWidth: 580 }}>
                                      <thead>
                                        <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                          <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2 w-40">UCAP</th>
                                          {days.map((date, i) => {
                                            const d = new Date(date + 'T12:00:00');
                                            const isToday = date === today;
                                            const isHoliday = holidaySet.has(date) || isSunday(date) || isSaturday(date);
                                            const cls = isToday ? 'text-[hsl(var(--canalco-primary))] font-bold' : isHoliday ? 'text-red-500 font-semibold' : 'text-[hsl(var(--canalco-neutral-600))] font-semibold';
                                            return (
                                              <th key={date} className={`text-center text-xs pb-2 w-16 ${cls}`}>
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
                                          const rowTotal = allDataDates.reduce((s, d) => s + (execDailyMap[d]?.[item.ucapId] ?? 0), 0);
                                          return (
                                            <tr key={item.ucapId} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                              <td className="py-2 pr-1 align-middle w-32">
                                                <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.ucapCode}</p>
                                                <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{item.ucapDescription}</p>
                                              </td>
                                              {days.map((date) => {
                                                const isHoliday = holidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                const val = execDailyMap[date]?.[item.ucapId] ?? 0;
                                                return (
                                                  <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                    <Input type="number" min="0" step="0.01" value={val || ''} placeholder="0" disabled={isHoliday || !canEditEjecucion}
                                                      onChange={(e) => { const v = parseFloat(e.target.value) || 0; setExecDailyMap((prev) => ({ ...prev, [date]: { ...prev[date], [item.ucapId]: v } })); }}
                                                      className="h-7 w-14 text-xs text-center px-1" />
                                                  </td>
                                                );
                                              })}
                                              <td className="py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">{rowTotal > 0 ? rowTotal : '—'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                          <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total día</td>
                                          {days.map((date) => {
                                            const t = schedule.items.reduce((s, item) => s + (execDailyMap[date]?.[item.ucapId] ?? 0), 0);
                                            return <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>{t > 0 ? t : '—'}</td>;
                                          })}
                                          <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                            {(() => { const g = allDataDates.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (execDailyMap[d]?.[i.ucapId] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                  {canEditEjecucion && (
                                    <div className="flex justify-end mt-4">
                                      <Button onClick={handleSaveExecUcaps} variant="outline" className="gap-2 text-sm"><Save className="w-4 h-4" />Guardar ejecución</Button>
                                    </div>
                                  )}
                                </section>
                              );
                            })()}

                            {/* ── Ejecución Materiales ── */}
                            {schedule && (() => {
                              const days = getWeekDays(execMaterialWeekOffset);
                              const today = formatDate(new Date());
                              const matYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                              const matHolidaySet = new Set(matYears.flatMap((y) => [...getColombianHolidays(y)]));
                              // levantamiento + materiales agregados manualmente (para totales)
                              const matExecCodes = [...surveyMaterials.map((m) => m.materialCode), ...extraExecMaterials.map((r) => r.code)];
                              return (
                                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">Ejecución Materiales</h3>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => setExecMaterialWeekOffset((w) => w - 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">‹</button>
                                      <span className="text-xs text-[hsl(var(--canalco-neutral-600))] min-w-[140px] text-center">
                                        {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                        {' – '}
                                        {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      </span>
                                      <button onClick={() => setExecMaterialWeekOffset((w) => w + 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">›</button>
                                      {execMaterialWeekOffset !== 0 && <button onClick={() => setExecMaterialWeekOffset(0)} className="text-xs text-[hsl(var(--canalco-primary))] underline ml-1">Hoy</button>}
                                    </div>
                                  </div>
                                  {surveyMaterials.length === 0 && extraExecMaterials.length === 0 ? (
                                    <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-4">Esta obra no tiene materiales registrados en sus levantamientos. Usa “Agregar material” para añadir uno.</p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm border-collapse" style={{ minWidth: 680 }}>
                                        <thead>
                                          <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                            <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2 w-40">Material</th>
                                            {days.map((date, i) => {
                                              const d = new Date(date + 'T12:00:00');
                                              const isToday = date === today;
                                              const isHoliday = matHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                              const cls = isToday ? 'text-[hsl(var(--canalco-primary))] font-bold' : isHoliday ? 'text-red-500 font-semibold' : 'text-[hsl(var(--canalco-neutral-600))] font-semibold';
                                              return (
                                                <th key={date} className={`text-center text-xs pb-2 w-14 ${cls}`}>
                                                  <div>{DAY_LABELS[i]}</div>
                                                  <div className="font-normal opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                                                </th>
                                              );
                                            })}
                                            <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-12">Total</th>
                                            <th className="w-6 pb-2" />
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {surveyMaterials.map((mat) => {
                                            const code = mat.materialCode;
                                            const rowTotal = allDataDates.reduce((s, d) => s + (execMaterialDailyMap[d]?.[code] ?? 0), 0);
                                            return (
                                              <tr key={code} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                                <td className="py-2 pr-1 align-middle w-40">
                                                  <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{code}</p>
                                                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{mat.materialDescription ?? ''}</p>
                                                </td>
                                                {days.map((date) => {
                                                  const isHoliday = matHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                  const val = execMaterialDailyMap[date]?.[code] ?? 0;
                                                  return (
                                                    <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                      <Input type="number" min="0" step="0.01" value={val || ''} placeholder="0" disabled={isHoliday || !canEditEjecucion}
                                                        onChange={(e) => { const v = parseFloat(e.target.value) || 0; setExecMaterialDailyMap((prev) => ({ ...prev, [date]: { ...prev[date], [code]: v } })); }}
                                                        className="h-7 w-12 text-xs text-center px-1" />
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">{rowTotal > 0 ? rowTotal : '—'}</td>
                                                <td />
                                              </tr>
                                            );
                                          })}
                                          {extraExecMaterials.map((row) => {
                                            const code = row.code;
                                            const rowTotal = allDataDates.reduce((s, d) => s + (execMaterialDailyMap[d]?.[code] ?? 0), 0);
                                            return (
                                              <tr key={row.id} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                                <td className="py-2 pr-1 align-middle w-40">
                                                  <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{code}</p>
                                                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{row.description || ''}</p>
                                                </td>
                                                {days.map((date) => {
                                                  const isHoliday = matHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                  const val = execMaterialDailyMap[date]?.[code] ?? 0;
                                                  return (
                                                    <td key={date} className={`py-0.5 px-0.5 text-center ${date === today ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                      <Input type="number" min="0" step="0.01" value={val || ''} placeholder="0" disabled={isHoliday || !canEditEjecucion}
                                                        onChange={(e) => { const v = parseFloat(e.target.value) || 0; setExecMaterialDailyMap((prev) => ({ ...prev, [date]: { ...prev[date], [code]: v } })); }}
                                                        className="h-7 w-12 text-xs text-center px-1" />
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">{rowTotal > 0 ? rowTotal : '—'}</td>
                                                <td className="py-1.5 pl-1">
                                                  {canEditEjecucion && (
                                                    <button onClick={() => removeExtraMaterial(row.id)} className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500" title="Quitar material">
                                                      <X className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                            <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total día</td>
                                            {days.map((date) => {
                                              const t = matExecCodes.reduce((s, code) => s + (execMaterialDailyMap[date]?.[code] ?? 0), 0);
                                              return <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${date === today ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>{t > 0 ? t : '—'}</td>;
                                            })}
                                            <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                              {(() => { const g = allDataDates.reduce((s, d) => s + matExecCodes.reduce((ss, code) => ss + (execMaterialDailyMap[d]?.[code] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                            </td>
                                            <td />
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  )}
                                  {canEditEjecucion && (
                                  <div className="flex justify-between items-center mt-4">
                                    <Popover open={addMaterialOpen} onOpenChange={setAddMaterialOpen}>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" />Agregar material</Button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" className="w-80 p-0">
                                        <Command>
                                          <CommandInput placeholder="Buscar material..." className="text-xs" />
                                          <CommandList>
                                            <CommandEmpty className="py-4 text-xs text-[hsl(var(--canalco-neutral-500))]">Sin resultados.</CommandEmpty>
                                            <CommandGroup>
                                              {materialCatalog
                                                .filter((m) => !surveyMaterials.some((s) => s.materialCode === m.code) && !extraExecMaterials.some((r) => r.code === m.code))
                                                .map((m) => (
                                                  <CommandItem key={m.materialId} value={`${m.code} ${m.description}`} onSelect={() => addExtraMaterial(m)} className="text-xs gap-2">
                                                    <span className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">{m.code}</span>
                                                    <span className="truncate text-[hsl(var(--canalco-neutral-700))]">{m.description}</span>
                                                  </CommandItem>
                                                ))}
                                            </CommandGroup>
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                    <Button onClick={handleSaveExecMaterials} variant="outline" className="gap-2 text-sm"><Save className="w-4 h-4" />Guardar ejecución</Button>
                                  </div>
                                  )}
                                </section>
                              );
                            })()}

                            {/* ── Ejecución Actividades ── */}
                            {schedule && (() => {
                              const days = getWeekDays(execActivityWeekOffset);
                              const today = formatDate(new Date());
                              const actYears = [...new Set(days.map((d) => parseInt(d.slice(0, 4))))];
                              const actHolidaySet = new Set(actYears.flatMap((y) => [...getColombianHolidays(y)]));
                              return (
                                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">Ejecución Actividades</h3>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => setExecActivityWeekOffset((w) => w - 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">‹</button>
                                      <span className="text-xs text-[hsl(var(--canalco-neutral-600))] min-w-[140px] text-center">
                                        {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                        {' – '}
                                        {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      </span>
                                      <button onClick={() => setExecActivityWeekOffset((w) => w + 1)} className="px-2 py-0.5 rounded text-lg leading-none hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">›</button>
                                      {execActivityWeekOffset !== 0 && <button onClick={() => setExecActivityWeekOffset(0)} className="text-xs text-[hsl(var(--canalco-primary))] underline ml-1">Hoy</button>}
                                    </div>
                                  </div>
                                  {execActivityRows.length === 0 ? (
                                    <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mb-4">No hay actividades. Agrega una con el botón de abajo.</p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
                                        <thead>
                                          <tr className="border-b border-[hsl(var(--canalco-neutral-200))]">
                                            <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Actividad</th>
                                            {days.map((date, i) => {
                                              const d = new Date(date + 'T12:00:00');
                                              const isToday = date === today;
                                              const isHoliday = actHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                              const cls = isToday ? 'text-[hsl(var(--canalco-primary))] font-bold' : isHoliday ? 'text-red-500 font-semibold' : 'text-[hsl(var(--canalco-neutral-600))] font-semibold';
                                              return (
                                                <th key={date} className={`text-center text-xs pb-2 w-16 ${cls}`}>
                                                  <div>{DAY_LABELS[i]}</div>
                                                  <div className="font-normal opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                                                </th>
                                              );
                                            })}
                                            <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-14">Total</th>
                                            <th className="w-6 pb-2" />
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {execActivityRows.map((row) => {
                                            const weekTotal = allDataDates.reduce((s, d) => s + (execActivityDailyMap[d]?.[row.id] ?? 0), 0);
                                            return (
                                              <tr key={row.id} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                                                <td className="py-1.5 pr-2">
                                                  <Select value={row.name} disabled={!canEditEjecucion} onValueChange={(val) => setExecActivityRows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: val } : r))}>
                                                    <SelectTrigger className="h-7 text-xs min-w-[200px]"><SelectValue placeholder="Seleccionar actividad" /></SelectTrigger>
                                                    <SelectContent>
                                                      {[...DEFAULT_ACTIVITY_OPTIONS, ...customActivityOptions].map((opt) => (
                                                        <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </td>
                                                {days.map((date) => {
                                                  const isToday = date === today;
                                                  const isHoliday = actHolidaySet.has(date) || isSunday(date) || isSaturday(date);
                                                  const qty = execActivityDailyMap[date]?.[row.id] ?? 0;
                                                  return (
                                                    <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                                      <Input type="number" min="0" step="0.01" value={qty || ''} placeholder="0" disabled={isHoliday || !canEditEjecucion}
                                                        onChange={(e) => { const v = parseFloat(e.target.value) || 0; setExecActivityDailyMap((prev) => ({ ...prev, [date]: { ...prev[date], [row.id]: v } })); }}
                                                        className="h-7 w-14 text-xs text-center px-1" />
                                                    </td>
                                                  );
                                                })}
                                                <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">{weekTotal > 0 ? weekTotal : '—'}</td>
                                                <td className="py-1.5 pl-1">
                                                  {canEditEjecucion && (
                                                    <button onClick={() => removeExecActivityRow(row.id)} className="p-0.5 rounded hover:bg-red-50 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500">
                                                      <X className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                            <td className="pt-2 pb-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total día</td>
                                            {days.map((date) => {
                                              const isToday = date === today;
                                              const t = execActivityRows.reduce((s, row) => s + (execActivityDailyMap[date]?.[row.id] ?? 0), 0);
                                              return <td key={date} className={`pt-2 pb-2 text-center text-xs font-bold ${isToday ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-700))]'}`}>{t > 0 ? t : '—'}</td>;
                                            })}
                                            <td className="pt-2 pb-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-700))]">
                                              {(() => { const g = allDataDates.reduce((s, d) => s + execActivityRows.reduce((ss, row) => ss + (execActivityDailyMap[d]?.[row.id] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
                                            </td>
                                            <td />
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  )}
                                  {canEditEjecucion && (
                                    <div className="flex justify-between items-center mt-4">
                                      <Button variant="outline" size="sm" onClick={() => setExecActivityRows((prev) => [...prev, { id: `exec-act-${Date.now()}`, name: '' }])} className="gap-1.5 text-xs">
                                        <Plus className="w-3.5 h-3.5" />Agregar fila
                                      </Button>
                                      <Button onClick={handleSaveExecActivities} variant="outline" className="gap-2 text-sm"><Save className="w-4 h-4" />Guardar ejecución</Button>
                                    </div>
                                  )}
                                </section>
                              );
                            })()}

                          </TabsContent>

                          <TabsContent value="informe" className="mt-0 space-y-4">
                            {!schedule ? (
                              <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-8 text-center text-sm text-[hsl(var(--canalco-neutral-400))]">
                                Selecciona una obra para ver su informe.
                              </div>
                            ) : (() => {
                              const tiempo = temporalProgress.contractual?.pct ?? temporalProgress.operational?.pct ?? null;
                              const esperado = expectedByToday?.pct ?? null;
                              const fisico = reportData?.physical ?? 0;
                              const spi = esperado && esperado > 0 ? fisico / esperado : null;
                              const dev = fisico - (esperado ?? 0);
                              const fmt = (x: string | null | undefined) => x ? new Date(x + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                              const corte = formatDate(new Date());
                              const inicio = startDate || contractualStart;
                              const fin = endDate || contractualEnd;
                              const statusInfo = currentStatus === 'on-track'
                                ? { label: 'En tiempo', color: '#22c55e', cls: 'text-emerald-400' }
                                : currentStatus === 'at-risk'
                                ? { label: 'En riesgo', color: '#f59e0b', cls: 'text-amber-400' }
                                : currentStatus === 'delayed'
                                ? { label: 'Atrasada', color: '#ef4444', cls: 'text-red-400' }
                                : { label: '—', color: '#94a3b8', cls: 'text-slate-400' };
                              const ubicacion = [selectedWork.neighborhood, selectedWork.zone].filter(Boolean).join(' · ') || selectedWork.address || '—';
                              const donutData = [
                                { name: 'Ejecutado', value: reportData?.totalExecutedUnits ?? 0 },
                                { name: 'Pendiente', value: Math.max(0, (reportData?.totalPlannedUnits ?? 0) - (reportData?.totalExecutedUnits ?? 0)) },
                              ];
                              return (
                                <div className="rounded-xl bg-[#0d1117] border border-slate-800 p-5 space-y-5 text-slate-200">
                                  {/* ── Header ── */}
                                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                                        <BarChart3 className="w-6 h-6 text-amber-400" />
                                      </div>
                                      <div className="min-w-0">
                                        <h3 className="text-lg font-bold text-white leading-tight truncate">{selectedWork.name}</h3>
                                        <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                                          Dashboard de Control de Obra{selectedWork.recordNumber ? ` · Acta ${selectedWork.recordNumber}` : ''}{selectedWork.workCode ? ` · ${selectedWork.workCode}` : ''}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ubicación</div>
                                        <div className="font-semibold text-slate-200 mt-0.5 max-w-[200px] truncate" title={ubicacion}>{ubicacion}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Inicio</div>
                                        <div className="font-semibold text-slate-200 mt-0.5">{fmt(inicio)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Fin Programado</div>
                                        <div className="font-semibold text-slate-200 mt-0.5">{fmt(fin)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Corte</div>
                                        <div className="font-semibold text-amber-400 mt-0.5">{fmt(corte)}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* ── KPI cards ── */}
                                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" />Avance en Tiempo</div>
                                      <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{tiempo !== null ? Math.round(tiempo) : '—'}</span><span className="text-sm text-slate-400">%</span></div>
                                      <div className="mt-2 text-[11px] text-slate-500">Esperado a la fecha: {esperado !== null ? `${Math.round(esperado)}%` : '—'}</div>
                                    </div>
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Activity className="w-3 h-3" />Avance Físico (Alcance)</div>
                                      <div className="mt-2 flex items-baseline gap-1"><span className="text-3xl font-bold text-white">{Math.round(fisico)}</span><span className="text-sm text-slate-400">%</span></div>
                                      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                        {spi !== null && (
                                          <span className={`px-1.5 py-0.5 rounded font-medium ${spi >= 0.98 ? 'bg-emerald-500/15 text-emerald-400' : spi >= 0.9 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>SPI {spi.toFixed(2)}</span>
                                        )}
                                        <span className="text-slate-500">Ejecutado / Alcance</span>
                                      </div>
                                    </div>
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">{dev >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}Desviación de Avance</div>
                                      <div className={`mt-2 flex items-baseline gap-1 ${dev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}><span className="text-3xl font-bold">{dev >= 0 ? '+' : ''}{dev.toFixed(1)}</span><span className="text-sm opacity-70">pts</span></div>
                                      <div className="mt-2 text-[11px] text-slate-500">Físico vs esperado a la fecha</div>
                                    </div>
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Estado de la Obra</div>
                                      <div className="mt-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: statusInfo.color }} /><span className={`text-2xl font-bold ${statusInfo.cls}`}>{statusInfo.label}</span></div>
                                      <div className="mt-2 text-[11px] text-slate-500">Este mes: {monthProgress.elapsed} / {monthProgress.total} días hábiles</div>
                                    </div>
                                  </div>

                                  {/* ── Curva S + Donut ── */}
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    <div className="lg:col-span-2 rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <div>
                                          <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-amber-400" />Avance en el Tiempo — Curva S</h4>
                                          <p className="text-[10px] uppercase tracking-wider text-slate-500">% Acumulado · Programado vs Real</p>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px]">
                                          <span className="flex items-center gap-1 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Programado</span>
                                          <span className="flex items-center gap-1 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-sky-400" />Real</span>
                                        </div>
                                      </div>
                                      {reportData && reportData.curva.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={260}>
                                          <ComposedChart data={reportData.curva} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                              <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                              </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#334155" />
                                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#334155" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                            <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} formatter={(v: number) => `${Math.round(v)}%`} />
                                            <Area type="monotone" dataKey="programado" stroke="#f59e0b" strokeWidth={2} fill="url(#progFill)" name="Programado" />
                                            <RLine type="monotone" dataKey="real" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} connectNulls name="Real" />
                                          </ComposedChart>
                                        </ResponsiveContainer>
                                      ) : (
                                        <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 text-center px-4">Registra el plan diario y las fechas del proyecto para ver la curva S.</div>
                                      )}
                                    </div>

                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-400" />Avance Físico</h4>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Ejecutado vs Pendiente (uds)</p>
                                      <div className="relative">
                                        <ResponsiveContainer width="100%" height={180}>
                                          <PieChart>
                                            <Pie data={donutData} dataKey="value" innerRadius={55} outerRadius={75} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                                              <Cell fill="#22c55e" />
                                              <Cell fill="#1e293b" />
                                            </Pie>
                                            <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `${v.toLocaleString('es-CO')} uds`} />
                                          </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                          <span className="text-2xl font-bold text-white">{Math.round(fisico)}%</span>
                                          <span className="text-[10px] uppercase tracking-wider text-slate-500">Ejecutado</span>
                                        </div>
                                      </div>
                                      <div className="mt-2 space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Ejecutado</span><span className="font-semibold text-white tabular-nums">{(reportData?.totalExecutedUnits ?? 0).toLocaleString('es-CO')} uds</span></div>
                                        <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />Pendiente</span><span className="font-semibold text-slate-300 tabular-nums">{Math.max(0, (reportData?.totalPlannedUnits ?? 0) - (reportData?.totalExecutedUnits ?? 0)).toLocaleString('es-CO')} uds</span></div>
                                        <div className="flex items-center justify-between border-t border-slate-800 pt-1.5"><span className="text-slate-400">Alcance total</span><span className="font-semibold text-white tabular-nums">{(reportData?.totalPlannedUnits ?? 0).toLocaleString('es-CO')} uds</span></div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* ── Alcance por UCAP + Materiales ── */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4 self-start">
                                      <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1"><BarChart3 className="w-4 h-4 text-sky-400" />Alcance por UCAP</h4>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Avance físico real · línea ámbar = esperado a la fecha</p>
                                      {reportData && reportData.chapters.length > 0 ? (
                                        <div className="space-y-3">
                                          {reportData.chapters.map((c) => {
                                            const behind = c.expectedPct !== null && c.real < c.expectedPct - 10;
                                            const barColor = c.real >= 100 ? '#22c55e' : behind ? '#ef4444' : c.real >= (c.expectedPct ?? 0) ? '#22c55e' : '#38bdf8';
                                            return (
                                              <div key={c.code}>
                                                <div className="flex items-center justify-between mb-1 gap-2">
                                                  <span className="text-xs text-slate-300 truncate" title={c.desc || c.code}>{c.desc || c.code}</span>
                                                  <span className="text-xs font-semibold text-white flex-shrink-0">{Math.round(c.real)}%</span>
                                                </div>
                                                <div className="relative h-2 rounded-full bg-slate-800">
                                                  <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${Math.min(100, c.real)}%`, background: barColor }} />
                                                  {c.expectedPct !== null && (
                                                    <div className="absolute inset-y-[-2px] w-0.5 bg-amber-400" style={{ left: `${Math.min(100, c.expectedPct)}%` }} title={`Esperado ${Math.round(c.expectedPct)}%`} />
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : <p className="text-xs text-slate-500">Esta obra no tiene UCAPs registradas.</p>}
                                    </div>

                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1"><Package className="w-4 h-4 text-purple-400" />Ejecución de Materiales</h4>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Cantidad instalada vs levantamiento</p>
                                      {reportData && reportData.materialRows.length > 0 ? (
                                        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                                          <table className="w-full text-xs">
                                            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                                              <tr className="border-b border-slate-800">
                                                <th className="text-left font-medium pb-2">Material</th>
                                                <th className="text-right font-medium pb-2">PPTO</th>
                                                <th className="text-right font-medium pb-2">Ejec.</th>
                                                <th className="text-right font-medium pb-2 pl-2">% Uso</th>
                                                <th className="text-right font-medium pb-2 pl-2">Estado</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {reportData.materialRows.map((m) => {
                                                const estadoCls = m.estado === 'En rango' ? 'text-emerald-400 bg-emerald-500/10' : m.estado === 'Vigilar' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
                                                const barCls = m.estado === 'En rango' ? 'bg-emerald-500' : m.estado === 'Vigilar' ? 'bg-amber-500' : 'bg-red-500';
                                                return (
                                                  <tr key={m.code} className="border-b border-slate-800/60">
                                                    <td className="py-2 pr-2 max-w-[150px]">
                                                      <div className="text-slate-200 truncate" title={m.desc ?? m.code}>{m.desc ?? m.code}</div>
                                                      <div className="text-[10px] text-slate-500 font-mono">{m.code}{m.unit ? ` · ${m.unit}` : ''}</div>
                                                    </td>
                                                    <td className="py-2 text-right text-slate-300 tabular-nums">{m.ppto.toLocaleString('es-CO')}</td>
                                                    <td className="py-2 text-right text-slate-300 tabular-nums">{m.exec.toLocaleString('es-CO')}</td>
                                                    <td className="py-2 pl-2 text-right">
                                                      <div className="flex items-center justify-end gap-1.5">
                                                        <div className="w-10 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${barCls}`} style={{ width: `${Math.min(100, m.usage)}%` }} /></div>
                                                        <span className="text-slate-200 tabular-nums w-9 text-right">{Math.round(m.usage)}%</span>
                                                      </div>
                                                    </td>
                                                    <td className="py-2 pl-2 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${estadoCls}`}>{m.estado}</span></td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : <p className="text-xs text-slate-500">Esta obra no tiene materiales registrados en sus levantamientos.</p>}
                                    </div>
                                  </div>

                                  {/* ── Avance Operativo ── */}
                                  {operativeProgress && (
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-1.5"><Activity className="w-4 h-4 text-amber-400" />Avance Operativo</h4>
                                        <span className="text-2xl font-bold text-amber-400 leading-none">{operativeProgress.total !== null ? `${Math.round(operativeProgress.total)}%` : '—'}</span>
                                      </div>
                                      <div className="h-2.5 w-full rounded-full bg-slate-800">
                                        <div className="h-2.5 rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, operativeProgress.total ?? 0)}%` }} />
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-1.5">Promedio ponderado de ejecutado vs planeado · UCAPs 30% · Materiales 30% · Actividades 40%</p>
                                      <div className="grid grid-cols-3 gap-3 mt-4">
                                        {operativeProgress.groups.map((g) => (
                                          <div key={g.key} className="border border-slate-700 rounded-lg p-3">
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-medium text-slate-400">{g.key}</span>
                                              <span className="text-xs font-bold text-slate-200">{g.hasPlan ? `${Math.round(g.pct)}%` : '—'}</span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-slate-800 mt-2">
                                              <div className="h-2 rounded-full bg-amber-400/70 transition-all" style={{ width: `${Math.min(100, g.hasPlan ? g.pct : 0)}%` }} />
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1.5">{g.executed.toLocaleString('es-CO')} / {g.planned.toLocaleString('es-CO')} · peso {Math.round(g.weight * 100)}%</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* ── Desglose por ítem ── */}
                                  {operativeProgress && (() => {
                                    const dItems = operativeProgress.groups.flatMap((g) => g.items);
                                    // Barra Contractual: usa fechas contractuales; si faltan, las operativas
                                    const refStart = contractualStart || startDate;
                                    const refEnd = contractualEnd || endDate;
                                    const dDateStrs = [
                                      ...(refStart ? [refStart] : []),
                                      ...(refEnd ? [refEnd] : []),
                                      ...dItems.flatMap((i) => [i.start, i.end].filter(Boolean) as string[]),
                                    ];
                                    const dMs = dDateStrs.map((d) => parseLocalDate(d).getTime());
                                    const dMinMs = dMs.length ? Math.min(...dMs) : 0;
                                    const dMaxMs = dMs.length ? Math.max(...dMs) : 0;
                                    const dRange = dMaxMs - dMinMs;
                                    const dHasAxis = dMs.length >= 2 && dRange > 0;
                                    // si la obra no tiene fechas, la barra cubre todo el rango del timeline
                                    const cStart = refStart || (dHasAxis ? formatDate(new Date(dMinMs)) : '');
                                    const cEnd = refEnd || (dHasAxis ? formatDate(new Date(dMaxMs)) : '');
                                    const dToPos = (d: string) => (dHasAxis ? Math.max(0, Math.min(100, ((parseLocalDate(d).getTime() - dMinMs) / dRange) * 100)) : 0);
                                    const dTodayLocal = new Date(); dTodayLocal.setHours(0, 0, 0, 0);
                                    const dTodayPct = dHasAxis ? ((dTodayLocal.getTime() - dMinMs) / dRange) * 100 : -1;
                                    const dShowToday = dHasAxis && dTodayPct >= 0 && dTodayPct <= 100;
                                    const dLabels: Array<{ label: string; pct: number }> = [];
                                    if (dHasAxis) {
                                      const DAY = 86_400_000; const totalDays = dRange / DAY;
                                      const step = totalDays <= 21 ? 3 : totalDays <= 60 ? 7 : totalDays <= 120 ? 14 : 30;
                                      const cur = new Date(dMinMs); const maxD = new Date(dMaxMs);
                                      while (cur <= maxD) { dLabels.push({ label: cur.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }), pct: ((cur.getTime() - dMinMs) / dRange) * 100 }); cur.setDate(cur.getDate() + step); }
                                    }
                                    const LBL2 = 'w-44 flex-shrink-0';
                                    const PCT2 = 'w-16 flex-shrink-0';
                                    return (
                                      <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-sky-400" />Desglose por ítem — Línea de tiempo</h4>
                                        <div className="overflow-x-auto">
                                          <div style={{ minWidth: 720 }}>
                                            {dHasAxis && (
                                              <div className="flex gap-2 h-6 mb-1">
                                                <div className={LBL2} />
                                                <div className="flex-1 relative">
                                                  {dLabels.map(({ label, pct }) => (
                                                    <span key={`${label}-${pct}`} className="absolute bottom-0 text-[10px] text-slate-500 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct}%` }}>{label}</span>
                                                  ))}
                                                </div>
                                                <div className={PCT2} />
                                              </div>
                                            )}
                                            {dHasAxis && cStart && cEnd && (() => {
                                              const cLeft = dToPos(cStart);
                                              const cWidth = Math.max(0.5, dToPos(cEnd) - cLeft);
                                              return (
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className={`${LBL2} text-xs font-semibold text-amber-400 pr-2`}>Contractual</div>
                                                  <div className="flex-1 relative h-4">
                                                    {dShowToday && <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10" style={{ left: `${dTodayPct}%` }} />}
                                                    <div className="absolute top-0.5 h-3 rounded-full bg-amber-400/30" style={{ left: `${cLeft}%`, width: `${cWidth}%` }} />
                                                  </div>
                                                  <div className={PCT2} />
                                                </div>
                                              );
                                            })()}
                                            {operativeProgress.groups.map((g) => (
                                              <div key={g.key} className="mb-3">
                                                <div className="flex items-center gap-2 my-1.5">
                                                  <div className={`${LBL2} text-xs font-semibold text-slate-400 uppercase tracking-wide`}>
                                                    {g.key} <span className="text-[10px] font-normal text-slate-500">{g.hasPlan ? `${Math.round(g.pct)}%` : '—'}</span>
                                                  </div>
                                                  <div className="flex-1 border-t border-slate-800" />
                                                  <div className={PCT2} />
                                                </div>
                                                {g.items.length === 0 ? (
                                                  <div className="flex gap-2"><div className={LBL2} /><div className="flex-1 text-xs text-slate-500 py-1">Sin ítems</div><div className={PCT2} /></div>
                                                ) : g.items.map((it, idx) => {
                                                  const hasDates2 = !!(it.start && it.end);
                                                  const left2 = hasDates2 ? dToPos(it.start!) : 0;
                                                  const barW2 = hasDates2 ? Math.max(1, dToPos(it.end!) - left2) : 100;
                                                  const fillW2 = clamp01(it.pct / 100) * barW2;
                                                  const expLeft2 = it.expectedPct !== null ? left2 + clamp01(it.expectedPct / 100) * barW2 : null;
                                                  const behind2 = it.expectedPct !== null && it.pct < it.expectedPct - 5;
                                                  const fillColor2 = it.pct >= 100 ? '#22c55e' : behind2 ? '#ef4444' : '#f59e0b';
                                                  return (
                                                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                                                      <div className={`${LBL2} pr-2`}>
                                                        <p className="text-[11px] font-mono font-semibold text-amber-400 truncate leading-tight">{it.label || '—'}</p>
                                                        {it.sublabel && <p className="text-[10px] text-slate-500 truncate leading-tight" title={it.sublabel}>{it.sublabel}</p>}
                                                      </div>
                                                      <div className="flex-1 relative h-6">
                                                        {dShowToday && <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10" style={{ left: `${dTodayPct}%` }} />}
                                                        <div className="absolute top-1.5 h-3 rounded-full bg-slate-800" style={{ left: `${left2}%`, width: `${barW2}%` }} />
                                                        <div className="absolute top-1.5 h-3 rounded-l-full" style={{ left: `${left2}%`, width: `${fillW2}%`, background: fillColor2 }} />
                                                        {expLeft2 !== null && (
                                                          <div className="absolute top-0.5 h-5 w-0.5 bg-slate-300 z-20" style={{ left: `${expLeft2}%` }} title={`Esperado a hoy: ${it.expectedQty?.toFixed(2)}`} />
                                                        )}
                                                      </div>
                                                      <div className={`${PCT2} text-right leading-tight`}>
                                                        <span className="text-[11px] font-semibold" style={{ color: fillColor2 }}>{it.planned > 0 ? `${Math.round(it.pct)}%` : '—'}</span>
                                                        {it.expectedQty !== null && (
                                                          <span className="block text-[9px] text-slate-500">esp {it.expectedQty.toFixed(it.expectedQty % 1 === 0 ? 0 : 1)}</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ))}
                                            {dShowToday && (
                                              <div className="flex items-center gap-2 mt-1">
                                                <div className={LBL2} />
                                                <div className="flex-1 relative h-4"><span className="absolute text-[10px] text-red-400 font-semibold -translate-x-1/2" style={{ left: `${dTodayPct}%` }}>hoy</span></div>
                                                <div className={PCT2} />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <p className="text-[10px] text-slate-600 mt-2">Barra = periodo del ítem · relleno = % ejecutado · marca vertical = esperado a hoy · "esp" = cantidad esperada</p>
                                      </div>
                                    );
                                  })()}

                                  <div className="text-center text-[10px] text-slate-600 pt-1">
                                    Informe generado del acta{selectedWork.recordNumber ? ` ${selectedWork.recordNumber}` : ''} · Corte {fmt(corte)} · SPI = avance real / esperado · Datos de UCAPs y materiales del levantamiento
                                  </div>
                                </div>
                              );
                            })()}
                          </TabsContent>

                          {/* ── Informe Operativo ── */}
                          <TabsContent value="operativo" className="mt-0 space-y-4">
                            {!schedule ? (
                              <div className="text-sm text-[hsl(var(--canalco-neutral-500))] py-8 text-center">Selecciona una obra para ver su informe operativo.</div>
                            ) : (() => {
                              const fmtCOP = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
                              const fmtQ = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
                              const badge = (p: number, hasPlan: boolean) => {
                                if (!hasPlan) return <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">—</span>;
                                const cls = p >= 100 ? 'bg-emerald-100 text-emerald-700' : p >= 70 ? 'bg-amber-100 text-amber-700' : p >= 40 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
                                const lbl = p >= 100 ? 'Completo' : p >= 70 ? 'En avance' : p >= 40 ? 'Vigilar' : 'Bajo';
                                return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>;
                              };

                              // UCAPs
                              const ucapRows = schedule.items.map((it) => {
                                const execQty = Object.values(execDailyMap).reduce((s, day) => s + (day[it.ucapId] ?? 0), 0);
                                const p = it.plannedQuantity > 0 ? clamp01(execQty / it.plannedQuantity) * 100 : 0;
                                const uv = Number(it.unitValue) || (ucapValueMap.get(it.ucapId) ?? 0);
                                const ippF = Number(schedule.ippFactor) || 1;
                                return { ...it, execQty, p, uv, plannedVal: it.plannedQuantity * uv * ippF, execVal: execQty * uv * ippF };
                              });
                              const totUcapQP = ucapRows.reduce((s, r) => s + r.plannedQuantity, 0);
                              const totUcapQE = ucapRows.reduce((s, r) => s + r.execQty, 0);
                              const totUcapVP = ucapRows.reduce((s, r) => s + r.plannedVal, 0);
                              const totUcapVE = ucapRows.reduce((s, r) => s + r.execVal, 0);
                              const ucapPct = totUcapQP > 0 ? clamp01(totUcapQE / totUcapQP) * 100 : 0;

                              // Materiales
                              const ippF = Number(schedule.ippFactor) || 1;
                              const matRows = surveyMaterials.map((surveyMat) => {
                                const code = surveyMat.materialCode;
                                const execQty = Object.values(execMaterialDailyMap).reduce((s, day) => s + (day[code] ?? 0), 0);
                                const uvStr = execMaterialUnitPrices[code];
                                const uv = uvStr ? (parseFloat(uvStr) || 0) : (surveyMat.unitValue ?? 0);
                                const totalQty = surveyMat.totalQuantity ?? 0;
                                const p = totalQty > 0 ? clamp01(execQty / totalQty) * 100 : 0;
                                return { materialCode: code, materialDescription: surveyMat.materialDescription ?? null, unitOfMeasure: surveyMat.unitOfMeasure ?? null, totalQuantity: totalQty, execQty, p, uv, plannedVal: totalQty * uv * ippF, execVal: execQty * uv * ippF, isExtra: false, extraId: undefined as string | undefined };
                              });
                              // Materiales agregados manualmente en ejecución · Ppto. (cantidad) y Ppto.$ editables
                              const extraMatRows = extraExecMaterials.map((r) => {
                                const code = r.code;
                                const execQty = Object.values(execMaterialDailyMap).reduce((s, day) => s + (day[code] ?? 0), 0);
                                const totalQty = r.budgetQty || 0;
                                const plannedVal = r.budgetValue || 0;
                                const uv = totalQty > 0 ? plannedVal / totalQty : 0;
                                const p = totalQty > 0 ? clamp01(execQty / totalQty) * 100 : 0;
                                return { materialCode: code, materialDescription: r.description || null, unitOfMeasure: r.unitOfMeasure ?? null, totalQuantity: totalQty, execQty, p, uv, plannedVal, execVal: execQty * uv, isExtra: true, extraId: r.id as string | undefined };
                              });
                              const allMatRows = [...matRows, ...extraMatRows];
                              const totMatQP = allMatRows.reduce((s, r) => s + r.totalQuantity, 0);
                              const totMatQE = allMatRows.reduce((s, r) => s + r.execQty, 0);
                              // % de avance de materiales ponderado por VALOR (no por cantidad),
                              // sobre los presupuestados (Ppto. > 0).
                              const budgetedMatRows = allMatRows.filter((r) => r.totalQuantity > 0);
                              const budMatVP = budgetedMatRows.reduce((s, r) => s + r.plannedVal, 0);
                              const budMatVE = budgetedMatRows.reduce((s, r) => s + r.execVal, 0);
                              const matPct = budMatVP > 0 ? clamp01(budMatVE / budMatVP) * 100 : 0;

                              // Actividades
                              const actNames = [...new Set([...activityRows, ...execActivityRows].map((r) => r.name).filter(Boolean))];
                              const actPairs = actNames.map((name) => {
                                const planned = activityRows.filter((r) => r.name === name).reduce((s, r) => s + Object.values(activityDailyMap).reduce((ss, day) => ss + (day[r.id] ?? 0), 0), 0);
                                const execd = execActivityRows.filter((r) => r.name === name).reduce((s, r) => s + Object.values(execActivityDailyMap).reduce((ss, day) => ss + (day[r.id] ?? 0), 0), 0);
                                const p = planned > 0 ? clamp01(execd / planned) * 100 : 0;
                                return { name, planned, execd, p };
                              });
                              const totActP = actPairs.reduce((s, a) => s + a.planned, 0);
                              const totActE = actPairs.reduce((s, a) => s + a.execd, 0);
                              const actPct = totActP > 0 ? clamp01(totActE / totActP) * 100 : 0;

                              const KPICard = ({ label, p, sub, color }: { label: string; p: number; sub?: string; color: string }) => (
                                <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-4 text-center">
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mb-1">{label}</p>
                                  <p className="text-3xl font-bold text-[hsl(var(--canalco-neutral-800))]">{Math.round(p)}%</p>
                                  {sub && <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-0.5">{sub}</p>}
                                  <div className="mt-2 h-1.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                    <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
                                  </div>
                                </div>
                              );

                              return (
                                <>
                                  {/* KPI summary */}
                                  <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                                    <KPICard label="UCAPs" p={ucapPct} sub={`${fmtQ(totUcapQE)} / ${fmtQ(totUcapQP)} uds`} color="bg-[hsl(var(--canalco-primary))]" />
                                    <KPICard label="Materiales" p={matPct} sub={`${fmtCOP(budMatVE)} / ${fmtCOP(budMatVP)}`} color="bg-sky-400" />
                                    <KPICard label="Actividades" p={actPct} sub={totActP > 0 ? `${fmtQ(totActE)} / ${fmtQ(totActP)}` : 'Sin plan'} color="bg-violet-400" />
                                    {(
                                      <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-4 text-center">
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mb-1">Valor Ejecutado</p>
                                        <p className="text-xl font-bold text-emerald-600 leading-tight">{fmtCOP(totUcapVE)}</p>
                                        <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-0.5">de {fmtCOP(totUcapVP)}</p>
                                        <div className="mt-2 h-1.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, totUcapVP > 0 ? (totUcapVE / totUcapVP) * 100 : 0)}%` }} />
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Curva S — Avance en el tiempo */}
                                  <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                    <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between flex-wrap gap-2">
                                      <div>
                                        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                          <TrendingUp className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Curva S — Avance en el Tiempo
                                        </h3>
                                        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--canalco-neutral-400))] mt-0.5">% Acumulado · Programado vs Real</p>
                                      </div>
                                      <div className="flex items-center gap-3 text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Programado</span>
                                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" />Real</span>
                                      </div>
                                    </div>
                                    <div className="p-4">
                                      {reportData && reportData.curva.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                          <ComposedChart data={reportData.curva} margin={{ top: 5, right: 14, left: -16, bottom: 0 }}>
                                            <defs>
                                              <linearGradient id="progFillOp" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                              </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#cbd5e1" />
                                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} stroke="#cbd5e1" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                            <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} labelStyle={{ color: '#334155', fontWeight: 600 }} formatter={(v: number) => `${Math.round(v)}%`} />
                                            <Area type="monotone" dataKey="programado" stroke="#f59e0b" strokeWidth={2} fill="url(#progFillOp)" name="Programado" />
                                            <RLine type="monotone" dataKey="real" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3, fill: '#0ea5e9' }} connectNulls name="Real" />
                                          </ComposedChart>
                                        </ResponsiveContainer>
                                      ) : (
                                        <div className="h-[300px] flex items-center justify-center text-xs text-[hsl(var(--canalco-neutral-400))] text-center px-4">Registra el plan diario y las fechas del proyecto para ver la curva S.</div>
                                      )}
                                    </div>
                                  </section>

                                  {/* UCAPs table */}
                                  {ucapRows.length > 0 && (
                                    <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                      <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                          <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />UCAPs
                                        </h3>
                                        <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{ucapRows.length} ítem{ucapRows.length !== 1 ? 's' : ''}</span>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                                              <th className="px-4 py-2 font-medium">Código</th>
                                              <th className="px-4 py-2 font-medium">Descripción</th>
                                              <th className="px-4 py-2 font-medium text-right">Plan</th>
                                              <th className="px-4 py-2 font-medium text-right">Ejec.</th>
                                              <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                                              <th className="px-4 py-2 font-medium text-right">Vr. Unitario</th>
                                              <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                                              <th className="px-4 py-2 font-medium text-right">Ejecutado $</th>
                                              <th className="px-4 py-2 font-medium text-center">Avance</th>
                                              <th className="px-4 py-2 font-medium text-center">Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                                            {ucapRows.map((r) => (
                                              <tr key={r.ucapId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                                <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{r.ucapCode}</td>
                                                <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[200px] truncate" title={r.ucapDescription}>{r.ucapDescription}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(r.plannedQuantity)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(r.execQty)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, r.plannedQuantity - r.execQty))}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{r.uv > 0 ? fmtCOP(r.uv) : '—'}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{r.plannedVal > 0 ? fmtCOP(r.plannedVal) : '—'}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{r.execVal > 0 ? fmtCOP(r.execVal) : '—'}</td>
                                                <td className="px-4 py-2.5">
                                                  <div className="flex items-center gap-2 min-w-[90px]">
                                                    <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                                      <div className="h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, r.p)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{r.plannedQuantity > 0 ? `${Math.round(r.p)}%` : '—'}</span>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">{badge(r.p, r.plannedQuantity > 0)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold text-[hsl(var(--canalco-neutral-700))] text-xs">
                                              <td className="px-4 py-2.5" colSpan={5}>Total</td>
                                              <td className="px-4 py-2.5" />
                                              <td className="px-4 py-2.5 text-right tabular-nums">{totUcapVP > 0 ? fmtCOP(totUcapVP) : '—'}</td>
                                              <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{totUcapVE > 0 ? fmtCOP(totUcapVE) : '—'}</td>
                                              <td className="px-4 py-2.5" colSpan={2} />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </section>
                                  )}

                                  {/* Materiales table */}
                                  {allMatRows.length > 0 && (
                                    <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                      <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                          <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Materiales
                                        </h3>
                                        <div className="flex items-center gap-3">
                                          {extraMatRows.length > 0 && canEditOperativo && (
                                            <Button onClick={handleSaveExecMaterials} variant="outline" size="sm" className="gap-1.5 text-xs h-7"><Save className="w-3.5 h-3.5" />Guardar</Button>
                                          )}
                                          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{allMatRows.length} ítem{allMatRows.length !== 1 ? 's' : ''}</span>
                                        </div>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                                              <th className="px-4 py-2 font-medium">Código</th>
                                              <th className="px-4 py-2 font-medium">Descripción</th>
                                              <th className="px-4 py-2 font-medium text-center">U/M</th>
                                              <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                                              <th className="px-4 py-2 font-medium text-right">Instalado</th>
                                              <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                                              <th className="px-4 py-2 font-medium text-center">Uso</th>
                                              <th className="px-4 py-2 font-medium text-center">Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                                            {allMatRows.map((r) => (
                                              <tr key={r.materialCode} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                                <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{r.materialCode}</td>
                                                <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[240px]">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="truncate min-w-0" title={r.materialDescription ?? ''}>{r.materialDescription ?? '—'}</span>
                                                    {r.isExtra && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[hsl(var(--canalco-primary))] text-white">Extra</span>}
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-center text-[hsl(var(--canalco-neutral-500))]">
                                                  {r.isExtra && r.extraId && canEditOperativo ? (
                                                    <div className="flex justify-center">
                                                      <Input value={r.unitOfMeasure ?? ''} placeholder="U/M" onChange={(e) => updateExtraMaterial(r.extraId!, { unitOfMeasure: e.target.value || null })} className="h-7 w-16 text-xs text-center px-1" />
                                                    </div>
                                                  ) : (r.unitOfMeasure ?? '—')}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">
                                                  {r.isExtra && r.extraId && canEditOperativo ? (
                                                    <div className="flex justify-end">
                                                      <Input type="number" min="0" step="0.01" value={r.totalQuantity || ''} placeholder="0" onChange={(e) => updateExtraMaterial(r.extraId!, { budgetQty: parseFloat(e.target.value) || 0 })} className="h-7 w-16 text-xs text-right px-1" />
                                                    </div>
                                                  ) : fmtQ(r.totalQuantity)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(r.execQty)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, r.totalQuantity - r.execQty))}</td>
                                                <td className="px-4 py-2.5">
                                                  <div className="flex items-center gap-2 min-w-[90px]">
                                                    <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                                      <div className="h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, r.p)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{r.totalQuantity > 0 ? `${Math.round(r.p)}%` : '—'}</span>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">{badge(r.p, r.totalQuantity > 0)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold text-[hsl(var(--canalco-neutral-700))] text-xs">
                                              <td className="px-4 py-2.5" colSpan={3}>Total</td>
                                              <td className="px-4 py-2.5 text-right tabular-nums">{fmtQ(totMatQP)}</td>
                                              <td className="px-4 py-2.5 text-right tabular-nums">{fmtQ(totMatQE)}</td>
                                              <td className="px-4 py-2.5 text-right tabular-nums">{fmtQ(Math.max(0, totMatQP - totMatQE))}</td>
                                              <td className="px-4 py-2.5" colSpan={2} />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </section>
                                  )}

                                  {/* Presupuesto vs Órdenes de Compra table */}
                                  {surveyMaterials.length > 0 && (() => {
                                    const pcMap = new Map(purchaseComparison.map((c) => [c.materialCode, c]));
                                    const pcRows = surveyMaterials.map((mat) => {
                                      const pc = pcMap.get(mat.materialCode);
                                      const budgetVal = (mat.totalQuantity ?? 0) * (mat.unitValue ?? 0) * ippF;
                                      const orderedVal = pc?.orderedValue ?? 0;
                                      return {
                                        materialCode: mat.materialCode,
                                        materialDescription: mat.materialDescription,
                                        unitOfMeasure: mat.unitOfMeasure,
                                        budgetQty: mat.totalQuantity ?? 0,
                                        budgetUnitValue: mat.unitValue ?? 0,
                                        budgetValue: budgetVal,
                                        requisitionedQty: pc?.requisitionedQty ?? 0,
                                        orderedQty: pc?.orderedQty ?? 0,
                                        orderedValue: orderedVal,
                                        diffValue: budgetVal - orderedVal,
                                      };
                                    });
                                    const totPcBudget = pcRows.reduce((s, r) => s + r.budgetValue, 0);
                                    const totPcOrdered = pcRows.reduce((s, r) => s + r.orderedValue, 0);
                                    const totPcDiff = totPcBudget - totPcOrdered;
                                    return (
                                      <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                        <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                                          <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                            <ShoppingCart className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Presupuesto vs Órdenes de Compra
                                          </h3>
                                          <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">{pcRows.length} ítem{pcRows.length !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                                                <th className="px-4 py-2 font-medium">Código</th>
                                                <th className="px-4 py-2 font-medium">Descripción</th>
                                                <th className="px-4 py-2 font-medium">U/M</th>
                                                <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                                                <th className="px-4 py-2 font-medium text-right">Req.</th>
                                                <th className="px-4 py-2 font-medium text-right">OC</th>
                                                <th className="px-4 py-2 font-medium text-right">Ppto. $</th>
                                                <th className="px-4 py-2 font-medium text-right">OC $</th>
                                                <th className="px-4 py-2 font-medium text-right">Dif. $</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                                              {pcRows.map((r) => (
                                                <tr key={r.materialCode} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                                  <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{r.materialCode}</td>
                                                  <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[200px] truncate">{r.materialDescription ?? '—'}</td>
                                                  <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-500))]">{r.unitOfMeasure ?? '—'}</td>
                                                  <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{r.budgetQty}</td>
                                                  <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{r.requisitionedQty > 0 ? r.requisitionedQty : '—'}</td>
                                                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{r.orderedQty > 0 ? r.orderedQty : '—'}</td>
                                                  <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{r.budgetValue > 0 ? fmtCOP(r.budgetValue) : '—'}</td>
                                                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{r.orderedValue > 0 ? fmtCOP(r.orderedValue) : '—'}</td>
                                                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.orderedValue === 0 ? 'text-[hsl(var(--canalco-neutral-400))]' : r.diffValue >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {r.orderedValue === 0 ? '—' : fmtCOP(r.diffValue)}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot>
                                              <tr className="bg-[hsl(var(--canalco-neutral-50))] border-t-2 border-[hsl(var(--canalco-neutral-300))] font-semibold">
                                                <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-600))]" colSpan={7}>Total</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{totPcBudget > 0 ? fmtCOP(totPcBudget) : '—'}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{totPcOrdered > 0 ? fmtCOP(totPcOrdered) : '—'}</td>
                                                <td className={`px-4 py-2.5 text-right tabular-nums ${totPcOrdered === 0 ? 'text-[hsl(var(--canalco-neutral-400))]' : totPcDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                  {totPcOrdered === 0 ? '—' : fmtCOP(totPcDiff)}
                                                </td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </section>
                                    );
                                  })()}

                                  {/* Actividades table */}
                                  {actPairs.length > 0 && (
                                    <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                                      <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                                          <Activity className="w-4 h-4 text-violet-500" />Actividades
                                        </h3>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                                              <th className="px-4 py-2 font-medium">Actividad</th>
                                              <th className="px-4 py-2 font-medium text-right">Planeado</th>
                                              <th className="px-4 py-2 font-medium text-right">Ejecutado</th>
                                              <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                                              <th className="px-4 py-2 font-medium text-center">Avance</th>
                                              <th className="px-4 py-2 font-medium text-center">Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                                            {actPairs.map((a) => (
                                              <tr key={a.name} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                                <td className="px-4 py-2.5 font-medium text-[hsl(var(--canalco-neutral-700))]">{a.name}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(a.planned)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(a.execd)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, a.planned - a.execd))}</td>
                                                <td className="px-4 py-2.5">
                                                  <div className="flex items-center gap-2 min-w-[90px]">
                                                    <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                                      <div className="h-1.5 rounded-full bg-violet-400 transition-all" style={{ width: `${Math.min(100, a.p)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{a.planned > 0 ? `${Math.round(a.p)}%` : '—'}</span>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">{badge(a.p, a.planned > 0)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </section>
                                  )}

                                  {/* ── Desglose por ítem — Línea de tiempo ── */}
                                  {operativeProgress && (() => {
                                    const dItems = operativeProgress.groups.flatMap((g) => g.items);
                                    // Barra Contractual: usa fechas contractuales; si faltan, las operativas
                                    const refStart = contractualStart || startDate;
                                    const refEnd = contractualEnd || endDate;
                                    const dDateStrs = [
                                      ...(refStart ? [refStart] : []),
                                      ...(refEnd ? [refEnd] : []),
                                      ...dItems.flatMap((i) => [i.start, i.end].filter(Boolean) as string[]),
                                    ];
                                    const dMs = dDateStrs.map((d) => parseLocalDate(d).getTime());
                                    const dMinMs = dMs.length ? Math.min(...dMs) : 0;
                                    const dMaxMs = dMs.length ? Math.max(...dMs) : 0;
                                    const dRange = dMaxMs - dMinMs;
                                    const dHasAxis = dMs.length >= 2 && dRange > 0;
                                    // si la obra no tiene fechas, la barra cubre todo el rango del timeline
                                    const cStart = refStart || (dHasAxis ? formatDate(new Date(dMinMs)) : '');
                                    const cEnd = refEnd || (dHasAxis ? formatDate(new Date(dMaxMs)) : '');
                                    const dToPos = (d: string) => (dHasAxis ? Math.max(0, Math.min(100, ((parseLocalDate(d).getTime() - dMinMs) / dRange) * 100)) : 0);
                                    const dTodayLocal = new Date(); dTodayLocal.setHours(0, 0, 0, 0);
                                    const dTodayPct = dHasAxis ? ((dTodayLocal.getTime() - dMinMs) / dRange) * 100 : -1;
                                    const dShowToday = dHasAxis && dTodayPct >= 0 && dTodayPct <= 100;
                                    const dLabels: Array<{ label: string; pct: number }> = [];
                                    if (dHasAxis) {
                                      const DAY = 86_400_000; const totalDays = dRange / DAY;
                                      const step = totalDays <= 21 ? 3 : totalDays <= 60 ? 7 : totalDays <= 120 ? 14 : 30;
                                      const cur = new Date(dMinMs); const maxD = new Date(dMaxMs);
                                      while (cur <= maxD) { dLabels.push({ label: cur.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }), pct: ((cur.getTime() - dMinMs) / dRange) * 100 }); cur.setDate(cur.getDate() + step); }
                                    }
                                    const LBL2 = 'w-44 flex-shrink-0';
                                    const PCT2 = 'w-16 flex-shrink-0';
                                    return (
                                      <div className="rounded-lg bg-white border border-[hsl(var(--canalco-neutral-300))] p-4">
                                        <h4 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide mb-4 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Desglose por ítem — Línea de tiempo</h4>
                                        <div className="overflow-x-auto">
                                          <div style={{ minWidth: 720 }}>
                                            {dHasAxis && (
                                              <div className="flex gap-2 h-6 mb-1">
                                                <div className={LBL2} />
                                                <div className="flex-1 relative">
                                                  {dLabels.map(({ label, pct }) => (
                                                    <span key={`${label}-${pct}`} className="absolute bottom-0 text-[10px] text-[hsl(var(--canalco-neutral-400))] -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct}%` }}>{label}</span>
                                                  ))}
                                                </div>
                                                <div className={PCT2} />
                                              </div>
                                            )}
                                            {dHasAxis && cStart && cEnd && (() => {
                                              const cLeft = dToPos(cStart);
                                              const cWidth = Math.max(0.5, dToPos(cEnd) - cLeft);
                                              return (
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className={`${LBL2} text-xs font-semibold text-amber-600 pr-2`}>Contractual</div>
                                                  <div className="flex-1 relative h-4">
                                                    {dShowToday && <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10" style={{ left: `${dTodayPct}%` }} />}
                                                    <div className="absolute top-0.5 h-3 rounded-full bg-amber-400/20" style={{ left: `${cLeft}%`, width: `${cWidth}%` }} />
                                                  </div>
                                                  <div className={PCT2} />
                                                </div>
                                              );
                                            })()}
                                            {operativeProgress.groups.map((g) => (
                                              <div key={g.key} className="mb-3">
                                                <div className="flex items-center gap-2 my-1.5">
                                                  <div className={`${LBL2} text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide`}>
                                                    {g.key} <span className="text-[10px] font-normal text-[hsl(var(--canalco-neutral-400))]">{g.hasPlan ? `${Math.round(g.pct)}%` : '—'}</span>
                                                  </div>
                                                  <div className="flex-1 border-t border-[hsl(var(--canalco-neutral-200))]" />
                                                  <div className={PCT2} />
                                                </div>
                                                {g.items.length === 0 ? (
                                                  <div className="flex gap-2"><div className={LBL2} /><div className="flex-1 text-xs text-[hsl(var(--canalco-neutral-400))] py-1">Sin ítems</div><div className={PCT2} /></div>
                                                ) : g.items.map((it, idx) => {
                                                  const hasDates2 = !!(it.start && it.end);
                                                  const left2 = hasDates2 ? dToPos(it.start!) : 0;
                                                  const barW2 = hasDates2 ? Math.max(1, dToPos(it.end!) - left2) : 100;
                                                  const fillW2 = clamp01(it.pct / 100) * barW2;
                                                  const expLeft2 = it.expectedPct !== null ? left2 + clamp01(it.expectedPct / 100) * barW2 : null;
                                                  const behind2 = it.expectedPct !== null && it.pct < it.expectedPct - 5;
                                                  const fillColor2 = it.pct >= 100 ? '#22c55e' : behind2 ? '#ef4444' : '#f59e0b';
                                                  return (
                                                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                                                      <div className={`${LBL2} pr-2`}>
                                                        <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate leading-tight">{it.label || '—'}</p>
                                                        {it.sublabel && <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] truncate leading-tight" title={it.sublabel}>{it.sublabel}</p>}
                                                      </div>
                                                      <div className="flex-1 relative h-6">
                                                        {dShowToday && <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10" style={{ left: `${dTodayPct}%` }} />}
                                                        <div className="absolute top-1.5 h-3 rounded-full bg-[hsl(var(--canalco-neutral-200))]" style={{ left: `${left2}%`, width: `${barW2}%` }} />
                                                        <div className="absolute top-1.5 h-3 rounded-l-full" style={{ left: `${left2}%`, width: `${fillW2}%`, background: fillColor2 }} />
                                                        {expLeft2 !== null && (
                                                          <div className="absolute top-0.5 h-5 w-0.5 bg-[hsl(var(--canalco-neutral-500))] z-20" style={{ left: `${expLeft2}%` }} title={`Esperado a hoy: ${it.expectedQty?.toFixed(2)}`} />
                                                        )}
                                                      </div>
                                                      <div className={`${PCT2} text-right leading-tight`}>
                                                        <span className="text-[11px] font-semibold" style={{ color: fillColor2 }}>{it.planned > 0 ? `${Math.round(it.pct)}%` : '—'}</span>
                                                        {it.expectedQty !== null && (
                                                          <span className="block text-[9px] text-[hsl(var(--canalco-neutral-400))]">esp {it.expectedQty.toFixed(it.expectedQty % 1 === 0 ? 0 : 1)}</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ))}
                                            {dShowToday && (
                                              <div className="flex items-center gap-2 mt-1">
                                                <div className={LBL2} />
                                                <div className="flex-1 relative h-4"><span className="absolute text-[10px] text-red-500 font-semibold -translate-x-1/2" style={{ left: `${dTodayPct}%` }}>hoy</span></div>
                                                <div className={PCT2} />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-2">Barra = periodo del ítem · relleno = % ejecutado · marca vertical = esperado a hoy · "esp" = cantidad esperada</p>
                                      </div>
                                    );
                                  })()}
                                </>
                              );
                            })()}
                          </TabsContent>

                        </Tabs>

                        {cronogramaTab === 'ejecucion' && (<>
                        {/* ── Gantt timeline ── */}
                        {schedule && schedule.items.length > 0 && (() => {
                          const ganttMetas = [
                            ...(contractualStart && contractualEnd ? [{ label: 'Contractual', start: contractualStart, end: contractualEnd, color: 'hsl(var(--canalco-primary))' }] : []),
                          ];
                          const ganttRows: GanttRow[] = schedule.items
                            .filter((item) => ucapDates[item.ucapId]?.start && ucapDates[item.ucapId]?.end)
                            .map((item) => ({
                              id: item.ucapId,
                              code: item.ucapCode,
                              description: item.ucapDescription,
                              start: ucapDates[item.ucapId].start,
                              end: ucapDates[item.ucapId].end,
                              progress: pct(Object.values(execDailyMap).reduce((s, day) => s + (day[item.ucapId] ?? 0), 0), item.plannedQuantity),
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

                        {/* ── Save button ── */}
                        {canEditPlan && (
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
                        )}
                        </>)}
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
