import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { useAuth } from '@/contexts/AuthContext';
import { mapToDepartments, getMunicipioName, type Municipality } from '@/utils/departmentMapper';
import { surveysService, type Work } from '@/services/surveys.service';
import { schedulesService, type ScheduleDetail, type DailyPlanEntry, type MaterialLogEntry, type SurveyMaterialItem, type DailyExecutionEntry, type ExecutionItem, type PurchaseComparisonItem } from '@/services/schedules.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { materialsService, type Material } from '@/services/materials.service';
import { Home, ArrowLeft, Save, Search, CalendarRange, ClipboardList, Layers, Plus, X, MapPin, TrendingUp, TrendingDown, Activity, Package, BarChart3, Clock, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { workingDayProgress, parseLocalDate, type WorkingDayCount, getColombianHolidays, currentMonthWorkingDays } from '@/utils/colombianCalendar';
import { GanttTimeline, type GanttRow } from '@/components/GanttTimeline';
import { ActaGantt, buildActaGanttObras, type ActaGanttObra } from '@/components/ActaGantt';
import { ResponsiveContainer, ComposedChart, Area, Line as RLine, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, PieChart, Pie, Cell } from 'recharts';

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function toApiDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getApiErrorMessage(error: any, fallback: string): string {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || fallback;
}

function pct(executed: number, planned: number): number {
  if (!planned) return 0;
  return clamp01(executed / planned) * 100;
}

type WorkStatus = 'on-track' | 'at-risk' | 'delayed';
type DailyPlanCell = { planned: string; executed: string };
type DailyPlanMap = Record<string, Record<number, DailyPlanCell>>;
type ActaScheduleRow = { work: Work; schedule: ScheduleDetail };
type ActaDailyPlanMap = Record<number, DailyPlanMap>;
type NumberDailyMap = Record<string, Record<string, number>>;
type ActaMaterialRow = ActaScheduleRow & { materials: SurveyMaterialItem[] };
type ActaActivityRowsMap = Record<number, Array<{ id: string; name: string }>>;
type ActaNumberDailyMap = Record<number, NumberDailyMap>;
type ActaPurchaseComparisonMap = Record<number, PurchaseComparisonItem[]>;

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

// Domingo (día no laboral): se marca en rojo y se deshabilita igual que un festivo.
function isSunday(date: string): boolean {
  return parseLocalDate(date).getDay() === 0;
}

// Selector de semana reutilizable (‹ rango ›  Hoy) para los planes diarios.
function WeekNav({ days, offset, onPrev, onNext, onToday }: {
  days: string[]; offset: number; onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  const fmt = (s: string, withYear?: boolean) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CO', withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onPrev} aria-label="Semana anterior" className="p-1 rounded-md hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))] transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] min-w-[150px] text-center tabular-nums px-2.5 py-1 rounded-md bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))]">
        {fmt(days[0])} – {fmt(days[6], true)}
      </span>
      <button onClick={onNext} aria-label="Semana siguiente" className="p-1 rounded-md hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))] transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
      {offset !== 0 && (
        <button onClick={onToday} className="text-xs font-semibold text-[hsl(var(--canalco-primary))] hover:underline ml-1">Hoy</button>
      )}
    </div>
  );
}

// Ejecuta tareas async con un límite de concurrencia (evita saturar el backend
// cuando un acta tiene muchas obras). Conserva el orden de entrada.
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const normalizeLocationName = (name?: string | null) =>
  getMunicipioName(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^union temporal alumbrado publico\s+/i, '')
    .toLowerCase()
    .trim();

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

const DEFAULT_ACTIVITY_OPTIONS = [
  'Instalación de sistema puesta tierra',
  'Conexiones eléctricas',
  'Tendido de cableado',
  'Montaje luminaria',
  'Obra civil',
  'Izado de poste',
  'Segmentación de postes',
  'Instalación de ductos escavación y apertura de zanjas',
  'Recepción de material',
  'Escavación y apertura para postes',
  'Construcción de cajas de inspección',
];

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
  const [execActivityRows, setExecActivityRows] = useState<Array<{ id: string; name: string }>>([]);
  const [execActivityDailyMap, setExecActivityDailyMap] = useState<Record<string, Record<string, number>>>({});
  const [purchaseComparison, setPurchaseComparison] = useState<PurchaseComparisonItem[]>([]);

  // ── Informe: full daily-plan history for the S-curve
  const [reportPlans, setReportPlans] = useState<DailyPlanEntry[]>([]);

  // ── Informe Operativo: ucapId → unit value (COP)
  const [ucapValueMap, setUcapValueMap] = useState<Map<number, number>>(new Map());

  const currentActaGanttObras = useMemo(() => {
    if (actaScheduleRows.length === 0) return actaGanttObras;

    return buildActaGanttObras(actaScheduleRows.map(({ work, schedule }) => {
      const workPlans = actaDailyPlans[work.workId] ?? {};
      const plans: DailyPlanEntry[] = [];
      const execByUcap = new Map<number, number>();
      const planByUcap = new Map<number, { start: string; end: string }>();

      Object.entries(workPlans).forEach(([date, ucapEntries]) => {
        Object.entries(ucapEntries).forEach(([ucapIdKey, cell]) => {
          const ucapId = Number(ucapIdKey);
          const plannedQuantity = parseFloat(cell.planned) || 0;
          const executedQuantity = parseFloat(cell.executed) || 0;
          plans.push({ ucapId, planDate: date, plannedQuantity, executedQuantity });
          execByUcap.set(ucapId, (execByUcap.get(ucapId) ?? 0) + executedQuantity);

          if (plannedQuantity > 0) {
            const current = planByUcap.get(ucapId);
            if (!current) planByUcap.set(ucapId, { start: date, end: date });
            else {
              if (date < current.start) current.start = date;
              if (date > current.end) current.end = date;
            }
          }
        });
      });

      const dates = actaContractualDates[work.workId];
      const scheduleForGantt: ScheduleDetail = {
        ...schedule,
        contractualStart: dates?.start || schedule.contractualStart,
        contractualEnd: dates?.end || schedule.contractualEnd,
        items: schedule.items.map((item) => {
          const plan = planByUcap.get(item.ucapId);
          return {
            ...item,
            executedQuantity: execByUcap.get(item.ucapId) ?? item.executedQuantity,
            ucapStartDate: plan?.start ?? item.ucapStartDate,
            ucapEndDate: plan?.end ?? item.ucapEndDate,
          };
        }),
      };

      return { work, schedule: scheduleForGantt, plans };
    }));
  }, [actaScheduleRows, actaDailyPlans, actaContractualDates, actaGanttObras]);

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
  // Plan: edita Director de Proyecto · los demás solo ven
  const canEditPlan = isDirectorProyecto || isMaster;
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
    if ((cronogramaTab === 'informe' && !canSeeInforme) || (cronogramaTab === 'operativo' && !canSeeOperativo)) {
      setCronogramaTab('plan');
    }
  }, [cronogramaTab, canSeeInforme, canSeeOperativo]);

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
      const results = await mapWithLimit(actaWorks, 2, async (w): Promise<{
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
      setActaExecActivityRows(execActivityRowsMap);
      setActaExecActivityDailyMap(execActivityDailyMap);
      setActaPurchaseComparisonMap(purchaseComparisonMap);
    } catch {
      toast.error('Error al cargar el cronograma del acta');
    } finally {
      setLoadingActa(false);
    }
  }, [isDirty]);

  // ── save
  const handleSave = async () => {
    if (!schedule) return;
    try {
      setSaving(true);
      const items = schedule.items.flatMap((item) => {
        const ucapId = Number(item.ucapId);
        if (!Number.isFinite(ucapId)) return [];
        return [{
          ucapId,
          executedQuantity: parseFloat(executed[item.ucapId] ?? '0') || 0,
          ucapStartDate: toApiDate(ucapDates[item.ucapId]?.start),
          ucapEndDate: toApiDate(ucapDates[item.ucapId]?.end),
        }];
      });
      const updated = await schedulesService.update(schedule.scheduleId, {
        startDate: toApiDate(startDate),
        endDate: toApiDate(endDate),
        contractualStart: toApiDate(contractualStart),
        contractualEnd: toApiDate(contractualEnd),
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
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Error al guardar el cronograma'));
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

  const addExtraMaterial = (mat: Material) => {
    setExtraExecMaterials((prev) => prev.some((r) => r.code === mat.code) ? prev : [...prev, { id: `extra-${mat.code}`, code: mat.code, description: mat.description, unitOfMeasure: null, budgetQty: 0, budgetValue: 0 }]);
    setAddMaterialOpen(false);
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
      toast.success('Ejecucion UCAPs del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecucion de UCAPs del acta');
    } finally {
      setSavingActaExecUcaps(false);
    }
  };

  const handleSaveActaExecMaterials = async () => {
    const rowsWithSchedule = actaMaterialRows.filter(({ schedule }) => schedule.scheduleId > 0);
    if (rowsWithSchedule.length === 0) return;

    try {
      setSavingActaExecMaterials(true);
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
        Object.entries(actaExecMaterialDailyMap[work.workId] ?? {}).forEach(([date, matMap]) => {
          Object.entries(matMap).forEach(([code, qty]) => {
            if (qty > 0) {
              const mat = metaByCode.get(code);
              items.push({
                itemKey: code,
                label: mat?.materialDescription ?? null,
                unitOfMeasure: mat?.unitOfMeasure ?? null,
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
      toast.success('Ejecucion de materiales del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecucion de materiales del acta');
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
      toast.success('Ejecucion de actividades del acta guardada');
    } catch {
      toast.error('Error al guardar la ejecucion de actividades del acta');
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
          contractualStart: toApiDate(dates.start),
          contractualEnd: toApiDate(dates.end),
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
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Error al guardar las fechas contractuales del acta'));
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
              <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecucion UCAPs
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
                      const isHoliday = holidaySet.has(date) || isSunday(date);
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
                    const workTotal = days.reduce((sum, date) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
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
                          const weekTotal = days.reduce((sum, date) => sum + getExecuted(work.workId, date, item.ucapId), 0);
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
                                const isHoliday = holidaySet.has(date) || isSunday(date);
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
                        const total = days.reduce((sum, date) => (
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
                {savingActaExecUcaps ? 'Guardando...' : 'Guardar ejecucion'}
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

      return (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-4 border-b border-[hsl(var(--canalco-neutral-100))]">
            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecucion Materiales
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
                    <th className="text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 pr-2">Proyecto / Material</th>
                    <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-16">Unidad</th>
                    <th className="text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] pb-2 w-20">Cantidad</th>
                    {days.map((date, i) => {
                      const d = new Date(date + 'T12:00:00');
                      const isToday = date === today;
                      const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
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
                    const workTotal = days.reduce((sum, date) => sum + getWorkMaterialDateTotal(work.workId, materials, date), 0);
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
                                {dateTotal > 0 ? dateTotal : '-'}
                              </td>
                            );
                          })}
                          <td className="py-2 text-center text-xs font-bold text-[hsl(var(--canalco-neutral-800))]">
                            {workTotal > 0 ? workTotal : '-'}
                          </td>
                        </tr>
                        {materials.map((mat) => {
                          const weekTotal = days.reduce((sum, date) => sum + getMaterialQty(work.workId, date, mat.materialCode), 0);
                          return (
                            <tr key={`${work.workId}-${mat.materialCode}`} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
                              <td className="py-1.5 pr-2 pl-4">
                                <p className="text-xs font-mono font-semibold text-[hsl(var(--canalco-primary))]">{mat.materialCode}</p>
                                <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] leading-tight truncate max-w-[260px]">{mat.materialDescription}</p>
                              </td>
                              <td className="py-1.5 px-1 text-center text-xs text-[hsl(var(--canalco-neutral-600))]">
                                {mat.unitOfMeasure ?? '-'}
                              </td>
                              <td className="py-1.5 px-1 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-800))]">
                                {mat.totalQuantity}
                              </td>
                              {days.map((date) => {
                                const isToday = date === today;
                                const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
                                const qty = getMaterialQty(work.workId, date, mat.materialCode);
                                return (
                                  <td key={date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-[hsl(var(--canalco-primary))]/5' : isHoliday ? 'bg-red-100' : ''}`}>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={qty || ''}
                                      placeholder="0"
                                      disabled={isHoliday || !canEditEjecucion}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setActaExecMaterialDailyMap((prev) => {
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
                    <td colSpan={2} className="pt-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">Total dia</td>
                    <td className="pt-2" />
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
                        const total = days.reduce((sum, date) => (
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
            <div className="flex justify-end items-center gap-3 mt-4">
              {lastSavedActaExecMaterials && (
                <span className="text-xs text-green-600 font-medium">Guardado a las {lastSavedActaExecMaterials}</span>
              )}
              <Button onClick={handleSaveActaExecMaterials} disabled={savingActaExecMaterials} variant="outline" className="gap-2 text-sm">
                <Save className="w-4 h-4" />
                {savingActaExecMaterials ? 'Guardando...' : 'Guardar ejecucion'}
              </Button>
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
              <Activity className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Ejecucion Actividades
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
                      const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                        No hay actividades. Agrega una fila para iniciar la ejecucion del acta.
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
                        const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                  {savingActaExecActivities ? 'Guardando...' : 'Guardar ejecucion'}
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
        const real: number | null = ms > curveTodayMs ? null : clamp01(realCum / curveDenom) * 100;
        return { month: fmtLabel(ms), programado: clamp01(progCum / curveDenom) * 100, real };
      });
      actaCurva.unshift({ month: fmtLabel(startMs - stepDays * DAY), programado: 0, real: startMs > curveTodayMs ? null : 0 });
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
    const ubicacion = [activeMunicipality, activeTab].filter(Boolean).join(' - ') || '-';

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
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ubicacion</div>
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
                <div className="mt-2 text-[11px] text-slate-500">Fisico vs esperado</div>
              </div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Estado del Acta</div>
                <div className="mt-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: status.color }} /><span className={`text-2xl font-bold ${status.cls}`}>{status.label}</span></div>
                <div className="mt-2 text-[11px] text-slate-500">Este mes: {monthProgress.elapsed} / {monthProgress.total} dias habiles</div>
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
                          <span className="text-xs font-semibold text-white flex-shrink-0">{Math.round(item.pct)}%</span>
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
                <p className="text-xs text-slate-500">Sin items para mostrar.</p>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 my-1.5">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">{group.key}</span>
                        <div className="flex-1 border-t border-slate-800" />
                      </div>
                      {group.items.length === 0 ? (
                        <p className="text-xs text-slate-500 ml-28">Sin items</p>
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
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Ubicacion</div>
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
                  <div className="mt-2 text-[11px] text-slate-500">Este mes: {monthProgress.elapsed} / {monthProgress.total} dias habiles</div>
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
                  <p className="text-xs text-slate-500">Sin items para mostrar.</p>
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => (
                      <div key={group.key}>
                        <div className="flex items-center gap-2 my-1.5">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">{group.key}</span>
                          <div className="flex-1 border-t border-slate-800" />
                        </div>
                        {group.items.length === 0 ? (
                          <p className="text-xs text-slate-500 ml-28">Sin items</p>
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
    }>();
    const pcMap = new Map<string, {
      key: string;
      materialCode: string;
      materialDescription: string | null;
      unitOfMeasure: string | null;
      budgetQty: number;
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
          plannedVal: 0,
          execVal: 0,
        };
        current.plannedQuantity += item.plannedQuantity;
        current.execQty += execQty;
        current.plannedVal += plannedVal;
        current.execVal += execVal;
        ucapMap.set(key, current);
      });

      const materialRow = actaMaterialRows.find((row) => row.work.workId === work.workId);
      const materials = materialRow?.materials ?? [];
      const execMaterialMap = actaExecMaterialDailyMap[work.workId] ?? {};
      const purchaseByCode = new Map((actaPurchaseComparisonMap[work.workId] ?? []).map((item) => [item.materialCode, item]));
      materials.forEach((mat) => {
        const execQty = sumMap(execMaterialMap, mat.materialCode);
        const totalQuantity = mat.totalQuantity ?? 0;
        const uv = mat.unitValue ?? 0;
        const plannedVal = totalQuantity * uv * ippF;
        const execVal = execQty * uv * ippF;
        const purchase = purchaseByCode.get(mat.materialCode);
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
          budgetValue: 0,
          requisitionedQty: 0,
          orderedQty: 0,
          orderedValue: 0,
        };
        pcCurrent.budgetQty += totalQuantity;
        pcCurrent.budgetValue += plannedVal;
        pcCurrent.requisitionedQty += purchase?.requisitionedQty ?? 0;
        pcCurrent.orderedQty += purchase?.orderedQty ?? 0;
        pcCurrent.orderedValue += purchase?.orderedValue ?? 0;
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

    const ucapRows = [...ucapMap.values()]
      .map((row) => ({
        ...row,
        p: ratio(row.execQty, row.plannedQuantity),
        unitValue: row.plannedQuantity > 0 ? row.plannedVal / row.plannedQuantity : 0,
      }))
      .sort((a, b) => a.ucapCode.localeCompare(b.ucapCode, 'es'));
    const matRows = [...matMap.values()]
      .map((row) => ({ ...row, p: ratio(row.execQty, row.totalQuantity) }))
      .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'es'));
    const pcRows = [...pcMap.values()]
      .map((row) => ({ ...row, diffValue: row.budgetValue - row.orderedValue }))
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
        const real: number | null = ms > curveTodayMs ? null : clamp01(realCum / curveDenom) * 100;
        return { month: fmtLabel(ms), programado: clamp01(progCum / curveDenom) * 100, real };
      });
      operativoCurva.unshift({ month: fmtLabel(startMs - stepDays * DAY), programado: 0, real: startMs > curveTodayMs ? null : 0 });
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
          {darkItemCount === 0 ? (
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Sin items para mostrar.</p>
          ) : (
            <div className="space-y-3">
              {darkGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 my-1.5">
                    <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide w-28">{group.key}</span>
                    <div className="flex-1 border-t border-[hsl(var(--canalco-neutral-200))]" />
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] ml-28">Sin items</p>
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

    return (
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

              <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Curva S - Avance en el Tiempo
                    </h3>
                    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--canalco-neutral-500))] mt-1">% acumulado - Programado vs Real</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-[hsl(var(--canalco-neutral-600))]"><span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--canalco-primary))]" />Programado</span>
                    <span className="flex items-center gap-1 text-[hsl(var(--canalco-neutral-600))]"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" />Real</span>
                  </div>
                </div>
                <div className="p-4">
                  {operativoCurva.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={operativoCurva} margin={{ top: 5, right: 14, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="actaOperativoProgFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#cbd5e1" />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} stroke="#cbd5e1" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                        <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} formatter={(value: number) => `${Math.round(value)}%`} />
                        <Area type="monotone" dataKey="programado" stroke="#f59e0b" strokeWidth={2} fill="url(#actaOperativoProgFill)" name="Programado" />
                        <RLine type="monotone" dataKey="real" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3, fill: '#0ea5e9' }} connectNulls name="Real" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[260px] flex items-center justify-center text-xs text-[hsl(var(--canalco-neutral-400))] text-center px-4">
                      Registra el plan diario y las fechas del acta para ver la curva S.
                    </div>
                  )}
                </div>
              </section>

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
                          <th className="px-4 py-2 font-medium">Codigo</th>
                          <th className="px-4 py-2 font-medium">Descripcion</th>
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
                        {ucapRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{row.ucapCode}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[220px] truncate" title={row.ucapDescription}>{row.ucapDescription}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.plannedQuantity)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(row.execQty)}</td>
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
                            <td className="px-4 py-2.5 text-center">{badge(row.p, row.plannedQuantity > 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[hsl(var(--canalco-neutral-100))] font-semibold text-[hsl(var(--canalco-neutral-700))] text-xs">
                          <td className="px-4 py-2.5" colSpan={6}>Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{totUcapVP > 0 ? fmtCOP(totUcapVP) : '-'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{totUcapVE > 0 ? fmtCOP(totUcapVE) : '-'}</td>
                          <td className="px-4 py-2.5" colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}

              {matRows.length > 0 && (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                  <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Materiales
                    </h3>
                    <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{matRows.length} item{matRows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                          <th className="px-4 py-2 font-medium">Codigo</th>
                          <th className="px-4 py-2 font-medium">Descripcion</th>
                          <th className="px-4 py-2 font-medium text-center">U/M</th>
                          <th className="px-4 py-2 font-medium text-right">Ppto.</th>
                          <th className="px-4 py-2 font-medium text-right">Instalado</th>
                          <th className="px-4 py-2 font-medium text-right">Pendiente</th>
                          <th className="px-4 py-2 font-medium text-center">Uso</th>
                          <th className="px-4 py-2 font-medium text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                        {matRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{row.materialCode}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[240px] truncate" title={row.materialDescription ?? ''}>{row.materialDescription ?? '-'}</td>
                            <td className="px-4 py-2.5 text-center text-[hsl(var(--canalco-neutral-500))]">{row.unitOfMeasure ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.totalQuantity)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[hsl(var(--canalco-neutral-800))]">{fmtQ(row.execQty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">{fmtQ(Math.max(0, row.totalQuantity - row.execQty))}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-[90px]">
                                <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-200))]">
                                  <div className="h-1.5 rounded-full bg-[hsl(var(--canalco-primary))] transition-all" style={{ width: `${Math.min(100, row.p)}%` }} />
                                </div>
                                <span className="text-[11px] tabular-nums font-semibold text-[hsl(var(--canalco-neutral-700))] w-9 text-right">{row.totalQuantity > 0 ? `${Math.round(row.p)}%` : '-'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">{badge(row.p, row.totalQuantity > 0)}</td>
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

              {pcRows.length > 0 && (
                <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                  <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Presupuesto vs Ordenes de Compra
                    </h3>
                    <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">{pcRows.length} item{pcRows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--canalco-neutral-50))] text-[hsl(var(--canalco-neutral-500))] text-left">
                          <th className="px-4 py-2 font-medium">Codigo</th>
                          <th className="px-4 py-2 font-medium">Descripcion</th>
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
                        {pcRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                            <td className="px-4 py-2.5 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{row.materialCode}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-700))] max-w-[220px] truncate" title={row.materialDescription ?? ''}>{row.materialDescription ?? '-'}</td>
                            <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-500))]">{row.unitOfMeasure ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">{fmtQ(row.budgetQty)}</td>
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
                          <td className="px-4 py-2.5 text-[hsl(var(--canalco-neutral-600))]" colSpan={6}>Total</td>
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
            </div>

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
                                  <button
                                    onClick={() => handleSelectActa(acta, actaWorks)}
                                    title="Ver cronograma (Gantt) del acta"
                                    className={`w-full px-4 py-2 flex items-center gap-2 border-b border-[hsl(var(--canalco-neutral-200))] transition-colors hover:bg-[hsl(var(--canalco-primary))]/10 ${
                                      selectedActa === acta
                                        ? 'bg-[hsl(var(--canalco-primary))]/10 border-l-4 border-l-[hsl(var(--canalco-primary))]'
                                        : 'bg-[hsl(var(--canalco-neutral-50))]'
                                    }`}
                                  >
                                    <CalendarRange className="w-3.5 h-3.5 text-[hsl(var(--canalco-primary))] flex-shrink-0" />
                                    <span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                                      Acta {acta}
                                    </span>
                                    <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">
                                      ({actaWorks.length} obras)
                                    </span>
                                  </button>
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
                    {selectedActa && !selectedWork ? (
                      loadingActa ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <h2 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                              Cronograma · Acta {selectedActa}
                            </h2>
                            <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                              Avance de las obras del acta. Haz clic en una obra para desplegar sus UCAPs.
                            </p>
                          </div>
                          <Tabs value={cronogramaTab} onValueChange={setCronogramaTab} className="w-full">
                            <TabsList className="mb-4">
                              <TabsTrigger value="plan">Plan</TabsTrigger>
                              <TabsTrigger value="ejecucion">Ejecución</TabsTrigger>
                              {canSeeInforme && <TabsTrigger value="informe">Informe</TabsTrigger>}
                              {canSeeOperativo && <TabsTrigger value="operativo">Operativo</TabsTrigger>}
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
                                            onChange={(e) => applyDateToActa('start', e.target.value)}
                                            disabled={!canEditPlan}
                                            className="mt-0.5 h-8 text-sm w-full"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <Label className="text-xs text-[hsl(var(--canalco-neutral-400))]">Fin</Label>
                                          <Input
                                            type="date"
                                            value={commonEnd}
                                            onChange={(e) => applyDateToActa('end', e.target.value)}
                                            disabled={!canEditPlan}
                                            className="mt-0.5 h-8 text-sm w-full"
                                          />
                                        </div>
                                      </div>
                                      <div className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-100))] bg-[hsl(var(--canalco-neutral-50))] flex items-center justify-between text-xs">
                                        <span className="text-[hsl(var(--canalco-neutral-400))]">Este mes</span>
                                        <span className="font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                          {monthProgress.elapsed} / {monthProgress.total} dias habiles
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
                              <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-5">
                                <ActaGantt obras={currentActaGanttObras} />
                              </section>
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
                                          const isHoliday = weekHolidaySet.has(date) || isSunday(date);
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
                                        const workTotal = days.reduce((sum, date) => sum + getWorkDateTotal(work.workId, schedule.items, date), 0);
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
                                              const rowPlan = days.reduce((sum, date) => sum + getPlanned(work.workId, date, item.ucapId), 0);
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
                                                    const isHoliday = weekHolidaySet.has(date) || isSunday(date);
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
                                              const total = days.reduce((sum, date) => (
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
                                                const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
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
                                              const workTotal = days.reduce((sum, date) => sum + getWorkMaterialDateTotal(work.workId, materials, date), 0);
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
                                                    const weekTotal = days.reduce((sum, date) => sum + getMaterialQty(work.workId, date, mat.materialCode), 0);
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
                                                          const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
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
                                                  const total = days.reduce((sum, date) => (
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
                                                const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                                                  const weekTotal = days.reduce((sum, date) => sum + getActivityQty(work.workId, date, row.id), 0);
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
                                                        const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                                              const workTotal = days.reduce((sum, date) => sum + getWorkActivityDateTotal(work.workId, rows, date), 0);
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
                                                    const weekTotal = days.reduce((sum, date) => sum + getActivityQty(work.workId, date, row.id), 0);
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
                                                          const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                                        const isHoliday = weekHolidaySet.has(date) || isSunday(date);
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
                                            const isHoliday = weekHolidaySet.has(date) || isSunday(date);
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
                                        {(() => { const g = days.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (parseFloat(dailyPlans[d]?.[i.ucapId]?.planned ?? '') || 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                          const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
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
                                              const isHoliday = matWeekHolidaySet.has(date) || isSunday(date);
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
                                          {(() => { const g = days.reduce((s, d) => s + surveyMaterials.reduce((ss, mat) => ss + (materialDailyMap[d]?.[mat.materialCode] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                          const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                                        const weekTotal = days.reduce((s, d) => s + (activityDailyMap[d]?.[row.id] ?? 0), 0);
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
                                              const isHoliday = actWeekHolidaySet.has(date) || isSunday(date);
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
                                          {(() => { const g = days.reduce((s, d) => s + activityRows.reduce((ss, row) => ss + (activityDailyMap[d]?.[row.id] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                            const isHoliday = holidaySet.has(date) || isSunday(date);
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
                                          const rowTotal = days.reduce((s, d) => s + (execDailyMap[d]?.[item.ucapId] ?? 0), 0);
                                          return (
                                            <tr key={item.ucapId} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                              <td className="py-2 pr-1 align-middle w-32">
                                                <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{item.ucapCode}</p>
                                                <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{item.ucapDescription}</p>
                                              </td>
                                              {days.map((date) => {
                                                const isHoliday = holidaySet.has(date) || isSunday(date);
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
                                            {(() => { const g = days.reduce((s, d) => s + schedule.items.reduce((ss, i) => ss + (execDailyMap[d]?.[i.ucapId] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                              const isHoliday = matHolidaySet.has(date) || isSunday(date);
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
                                            const rowTotal = days.reduce((s, d) => s + (execMaterialDailyMap[d]?.[code] ?? 0), 0);
                                            return (
                                              <tr key={code} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                                <td className="py-2 pr-1 align-middle w-40">
                                                  <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{code}</p>
                                                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{mat.materialDescription ?? ''}</p>
                                                </td>
                                                {days.map((date) => {
                                                  const isHoliday = matHolidaySet.has(date) || isSunday(date);
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
                                            const rowTotal = days.reduce((s, d) => s + (execMaterialDailyMap[d]?.[code] ?? 0), 0);
                                            return (
                                              <tr key={row.id} className="border-b border-[hsl(var(--canalco-neutral-100))]">
                                                <td className="py-2 pr-1 align-middle w-40">
                                                  <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate">{code}</p>
                                                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">{row.description || ''}</p>
                                                </td>
                                                {days.map((date) => {
                                                  const isHoliday = matHolidaySet.has(date) || isSunday(date);
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
                                              {(() => { const g = days.reduce((s, d) => s + matExecCodes.reduce((ss, code) => ss + (execMaterialDailyMap[d]?.[code] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
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
                                              const isHoliday = actHolidaySet.has(date) || isSunday(date);
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
                                            const weekTotal = days.reduce((s, d) => s + (execActivityDailyMap[d]?.[row.id] ?? 0), 0);
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
                                                  const isHoliday = actHolidaySet.has(date) || isSunday(date);
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
                                              {(() => { const g = days.reduce((s, d) => s + execActivityRows.reduce((ss, row) => ss + (execActivityDailyMap[d]?.[row.id] ?? 0), 0), 0); return g > 0 ? g : '—'; })()}
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
