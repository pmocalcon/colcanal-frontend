import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ArrowLeft, Plus, Trash2, Printer, Check, ChevronsUpDown, X, Layers, Send, CheckCircle, XCircle, Lock} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Save } from 'lucide-react';
import { materialsService, type Material } from '@/services/materials.service';
import { surveysService, type Work } from '@/services/surveys.service';
import { directorBudgetsService, type BudgetStatus } from '@/services/director-budgets.service';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapToDepartments, getMunicipioName, visibleMunicipalitiesOf, type Department, type Municipality } from '@/utils/departmentMapper';

type WorkSelectionMode = 'individual' | 'agrupado';

interface PresupuestoRow {
  id: number;
  materialId: number | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  vrUnitario: string;
  cantBodega: string;
  costoTransporte: string;
  ejecutado: string;
  hasIva: boolean;
  isManual: boolean;
  isFixed?: boolean;
}

const TRAVEL_EXPENSE_LABELS: Record<string, string> = {
  tolls: 'Peajes',
  parking: 'Parqueadero',
  lodging: 'Hospedaje',
  food: 'Alimentación',
  additional_crew: 'Cuadrilla Adicional',
  day_hours: 'Horas Extras Diurnas',
  holiday_overtime: 'Horas Festivas/Nocturnas',
};

const FIXED_ROW_NAMES = ['POLIZA', 'IMPREVISTOS', 'TRANSPORTE', 'STICKERS'] as const;

/**
 * Descripciones con las que se guardan las filas de viáticos. Sirven para
 * reconocerlas al releer el presupuesto y no cargarlas como filas de material.
 */
const TRAVEL_ROW_NAMES: string[] = Object.values(TRAVEL_EXPENSE_LABELS);
const esFilaViatico = (desc?: string | null) => !!desc && TRAVEL_ROW_NAMES.includes(desc);

const createFixedRow = (name: string): PresupuestoRow => ({
  id: 0,
  materialId: null,
  codigo: '',
  descripcion: name,
  cantidad: '',
  vrUnitario: '',
  cantBodega: '',
  costoTransporte: '',
  ejecutado: '',
  hasIva: false,
  isManual: false,
  isFixed: true,
});

const createEmptyRow = (id: number): PresupuestoRow => ({
  id,
  materialId: null,
  codigo: '',
  descripcion: '',
  cantidad: '',
  vrUnitario: '',
  cantBodega: '',
  costoTransporte: '',
  ejecutado: '',
  hasIva: true,
  isManual: false,
});

function buildTravelRows(surveys: { travelExpenses?: Array<{ expenseType: string; quantity: number; unitPrice?: number }> }[]): PresupuestoRow[] {
  const travelMap = new Map<string, { quantity: number; unitPrice: number | undefined }>();
  for (const survey of surveys) {
    for (const item of survey.travelExpenses ?? []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const price = item.unitPrice != null ? Number(item.unitPrice) : undefined;
      const existing = travelMap.get(item.expenseType);
      if (existing) {
        existing.quantity += qty;
        if (price !== undefined) {
          existing.unitPrice = (existing.unitPrice ?? 0) + price;
        }
      } else {
        travelMap.set(item.expenseType, { quantity: qty, unitPrice: price });
      }
    }
  }
  return Array.from(travelMap.entries())
    .filter(([, v]) => v.quantity > 0)
    .map(([type, v]) => ({
      ...createEmptyRow(0),
      descripcion: TRAVEL_EXPENSE_LABELS[type] ?? type,
      cantidad: String(v.quantity),
      vrUnitario: v.unitPrice != null ? String(v.unitPrice) : '',
      hasIva: false,
    }));
}

function FormattedInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const formatted =
    value !== '' && !isNaN(Number(value))
      ? Number(value).toLocaleString('es-CO')
      : value;
  return (
    <Input
      type={editing ? 'number' : 'text'}
      min="0"
      step="any"
      value={editing ? value : formatted}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}

const parseNum = (val: string) => parseFloat(val) || 0;

const fmt = (value: number): string => {
  if (value === 0) return '-';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const fmtTable = (value: number): string => {
  if (value === 0) return '-';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

function MaterialCombobox({
  value,
  materials,
  onSelect,
  disabled = false,
}: {
  value: number | null;
  materials: Material[];
  onSelect: (material: Material | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedMaterial = materials.find((m) => m.materialId === value);

  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materials.slice(0, 50);
    const query = searchQuery.toLowerCase();
    return materials
      .filter(
        (m) =>
          m.code.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [materials, searchQuery]);

  return (
    <div className="flex gap-1 w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between h-6 text-[16px] font-normal border-0 shadow-none px-0 hover:bg-transparent focus-visible:ring-0"
          >
            {selectedMaterial ? (
              <span className="truncate text-left">{selectedMaterial.description}</span>
            ) : (
              <span className="text-muted-foreground">Descripción...</span>
            )}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por código o descripción..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>No se encontraron materiales.</CommandEmpty>
              <CommandGroup>
                {filteredMaterials.map((material) => (
                  <CommandItem
                    key={material.materialId}
                    value={material.materialId.toString()}
                    onSelect={() => {
                      onSelect(material.materialId === value ? null : material);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === material.materialId ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium text-[16px]">{material.code}</span>
                      <span className="text-[16px] text-muted-foreground truncate max-w-[370px]">
                        {material.description}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedMaterial && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
          }}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
          title="Limpiar selección"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<BudgetStatus, string> = {
  draft: 'Borrador de Ppto',
  en_revision: 'En Revisión',
  final: 'Ppto Final',
};

const STATUS_TITLE_LABELS: Record<BudgetStatus, string> = {
  draft: 'BORRADOR',
  en_revision: 'EN REVISIÓN',
  final: 'FINAL',
};

const STATUS_COLORS: Record<BudgetStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  en_revision: 'bg-blue-100 text-blue-800 border-blue-300',
  final: 'bg-green-100 text-green-800 border-green-300',
};

export default function PresupuestoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = useGranularPermissions();
  const { id: budgetIdParam } = useParams<{ id: string }>();
  // Preselección al llegar desde la bandeja de actas: ?company=&project=&acta=
  const [searchParams] = useSearchParams();
  const preCompanyId = searchParams.get('company') ? Number(searchParams.get('company')) : null;
  const preProjectId = searchParams.get('project') ? Number(searchParams.get('project')) : null;
  const preActa = searchParams.get('acta');
  const preselectAppliedRef = useRef(false);
  const [budgetId, setBudgetId] = useState<number | null>(budgetIdParam ? Number(budgetIdParam) : null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const { access, loading: accessLoading } = useSurveyAccess();

  const isAnalistaPMO = user?.nombreRol === 'Analista PMO';
  const canEditBudget = hasPermission('levantamientos:crear') || isAnalistaPMO;
  // Enviar a autorización lo hace quien elabora el presupuesto. Es una restricción por
  // ROL, igual que en el backend: con permisos no alcanzaba, porque `levantamientos:revisar`
  // lo tiene también el Director Técnico, que no participa en esta cadena.
  const canReview = user?.nombreRol === 'Director Financiero y Administrativo' || isAnalistaPMO;
  const canApprove = hasPermission('levantamientos:aprobar') || isAnalistaPMO;
  const isGerenciaReview = budgetStatus === 'en_revision';
  const isReadOnly = !canEditBudget || (!isAnalistaPMO && budgetStatus !== 'draft');
  // Gerencia, al autorizar (en_revision), puede editar SOLO Otros Costos y Costos L.N.A.
  const canEditAuthFields = canApprove && budgetStatus === 'en_revision';

  // Los municipios de Antioquia son PROYECTOS de "Canales & Contactos", así que
  // hay que mapear empresas y proyectos: solo con empresas se pierden los que no
  // tienen una UT homónima (p. ej. Pueblo Rico).
  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapToDepartments(access.companies, access.projects || []);
  }, [access]);

  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);

  // Municipios elegibles: sin la empresa matriz, que no es un municipio.
  const visibleMunicipalities = useMemo(
    () => visibleMunicipalitiesOf(selectedDept?.municipalities),
    [selectedDept],
  );
  const [workSelectionMode, setWorkSelectionMode] = useState<WorkSelectionMode>('individual');
  const [selectedWorkId, setSelectedWorkId] = useState<number | null>(null);
  const [selectedWorkName, setSelectedWorkName] = useState('');
  const [selectedActa, setSelectedActa] = useState<string | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [actaOpen, setActaOpen] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [workSearch, setWorkSearch] = useState('');
  const [actaSearch, setActaSearch] = useState('');
  const [rows, setRows] = useState<PresupuestoRow[]>(() => [
    ...Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)),
    ...FIXED_ROW_NAMES.map((name, i) => ({ ...createFixedRow(name), id: i + 11 })),
  ]);
  const [fuenteFinanciacion, setFuenteFinanciacion] = useState('');
  const [valorMinimoExcedentes, setValorMinimoExcedentes] = useState('');
  const [valorActualExcedentes, setValorActualExcedentes] = useState('');
  const [valorActualExcedentesTexto, setValorActualExcedentesTexto] = useState('');
  // Saldo disponible para obras = Valor actual − Valor mínimo de excedentes (automático, solo lectura)
  const saldoDisponibleNum = parseNum(valorActualExcedentes) - parseNum(valorMinimoExcedentes);
  const saldoDisponible = saldoDisponibleNum !== 0 ? String(saldoDisponibleNum) : '';
  const [observaciones, setObservaciones] = useState('');
  const [manoDeObra, setManoDeObra] = useState('');
  const [manoDeObraEj, setManoDeObraEj] = useState('');
  const [materialesInventario, setMaterialesInventario] = useState('');
  const [materialesInventarioEj, setMaterialesInventarioEj] = useState('');
  const [valorFacturado, setValorFacturado] = useState('');
  const [valorFacturadoEj, setValorFacturadoEj] = useState('');
  // Valor acta = Valor facturado; Saldo disponible (final) = Saldo disponible para obras − Valor facturado
  const valorActaNum = parseNum(valorFacturado);
  const valorActa = valorActaNum !== 0 ? String(valorActaNum) : '';
  const saldoDisponibleFinalNum = saldoDisponibleNum - valorActaNum;
  const saldoDisponibleFinal = saldoDisponibleFinalNum !== 0 ? String(saldoDisponibleFinalNum) : '';
  const [otrosCostos, setOtrosCostos] = useState('');
  const [otrosCostosEj, setOtrosCostosEj] = useState('');
  const [leg, setLeg] = useState('');
  const [legEj, setLegEj] = useState('');
  const [retPct, setRetPct] = useState('');
  const [retPctEj, setRetPctEj] = useState('');
  const [estampillaPct, setEstampillaPct] = useState('');
  const [estampillaPctEj, setEstampillaPctEj] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingWorkMaterials, setLoadingWorkMaterials] = useState(false);
  const [editingVrUnitarioId, setEditingVrUnitarioId] = useState<number | null>(null);
  const [editingCantidadId, setEditingCantidadId] = useState<number | null>(null);
  const skipWorkMaterialsLoad = useRef(false);
  const skipActaMaterialsLoad = useRef(false);
  const budgetLoadedRef = useRef(false);
  const [travelRows, setTravelRows] = useState<PresupuestoRow[]>([]);
  /**
   * Viáticos ya guardados en el presupuesto, por descripción. La obra solo dice
   * QUÉ conceptos hay; los importes editados viven en el presupuesto. Se guardan
   * aparte porque las filas se reconstruyen desde la obra cada vez que cargan
   * los levantamientos, y eso puede pasar después de leer el presupuesto.
   */
  const viaticosGuardados = useRef<Map<string, PresupuestoRow>>(new Map());

  /**
   * Vuelca los viáticos guardados sobre los que arma el levantamiento. Los que
   * estén guardados y ya no vengan de la obra se conservan al final, para no
   * borrar importes capturados si la obra cambió.
   */
  const fusionarViaticos = useCallback((deLaObra: PresupuestoRow[]): PresupuestoRow[] => {
    const guardados = viaticosGuardados.current;
    if (guardados.size === 0) return deLaObra;
    const usados = new Set<string>();
    const fusionadas = deLaObra.map((fila) => {
      const guardada = guardados.get(fila.descripcion);
      if (!guardada) return fila;
      usados.add(fila.descripcion);
      return { ...fila, ...guardada };
    });
    const soloGuardadas = [...guardados.entries()]
      .filter(([nombre]) => !usados.has(nombre))
      .map(([, fila]) => fila);
    return [...fusionadas, ...soloGuardadas];
  }, []);
  const [editingTravelCantidadIdx, setEditingTravelCantidadIdx] = useState<number | null>(null);
  const [editingTravelVrUnitarioIdx, setEditingTravelVrUnitarioIdx] = useState<number | null>(null);

  // Actas disponibles en el municipio seleccionado
  const groupedWorksMap = useMemo(() => {
    const map = new Map<string, Work[]>();
    works
      .filter((w) => w.recordNumber)
      .forEach((w) => {
        const key = w.recordNumber!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      });
    map.forEach((ws, key) => { if (ws.length < 1) map.delete(key); });
    return map;
  }, [works]);

  // Load existing budget when editing
  useEffect(() => {
    if (!budgetId || budgetLoadedRef.current) return;
    if (accessLoading) return;
    budgetLoadedRef.current = true;
    const load = async () => {
      try {
        const b = await directorBudgetsService.getById(budgetId);
        setBudgetStatus(b.status ?? 'draft');
        if (b.departmentName) {
          const matchedDept = departments.find((d) => d.name === b.departmentName);
          if (matchedDept) setSelectedDept(matchedDept);
        }
        // Restore selection mode: agrupado when workId is null but workName exists
        if (b.workId != null) {
          setWorkSelectionMode('individual');
          setSelectedWorkName(b.workName ?? '');
          skipWorkMaterialsLoad.current = true;
          setSelectedWorkId(b.workId);
        } else if (b.workName) {
          setWorkSelectionMode('agrupado');
          setSelectedActa(b.workName);
          skipActaMaterialsLoad.current = true;
          skipWorkMaterialsLoad.current = true;
          setSelectedWorkId(null);
        } else {
          skipWorkMaterialsLoad.current = true;
          setSelectedWorkId(null);
        }
        setFuenteFinanciacion(b.fuenteFinanciacion ?? '');
        setValorMinimoExcedentes(b.valorMinimoExcedentes != null ? String(b.valorMinimoExcedentes) : '');
        setValorActualExcedentes(b.valorActualExcedentes != null ? String(b.valorActualExcedentes) : '');
        setValorActualExcedentesTexto(b.valorActualExcedentesTexto ?? '');
        setObservaciones(b.observaciones ?? '');
        setManoDeObra(b.manoDeObra != null ? String(b.manoDeObra) : '');
        setManoDeObraEj(b.manoDeObraEj != null ? String(b.manoDeObraEj) : '');
        setMaterialesInventario(b.materialesInventario != null ? String(b.materialesInventario) : '');
        setMaterialesInventarioEj(b.materialesInventarioEj != null ? String(b.materialesInventarioEj) : '');
        setValorFacturado(b.valorFacturado != null ? String(b.valorFacturado) : '');
        setValorFacturadoEj(b.valorFacturadoEj != null ? String(b.valorFacturadoEj) : '');
        setOtrosCostos(b.otrosCostos != null ? String(b.otrosCostos) : '');
        setOtrosCostosEj(b.otrosCostosEj != null ? String(b.otrosCostosEj) : '');
        setLeg(b.leg != null ? String(b.leg) : '');
        setLegEj(b.legEj != null ? String(b.legEj) : '');
        setRetPct(b.retPct != null ? String(b.retPct) : '');
        setRetPctEj(b.retPctEj != null ? String(b.retPctEj) : '');
        setEstampillaPct(b.estampillaPct != null ? String(b.estampillaPct) : '');
        setEstampillaPctEj(b.estampillaPctEj != null ? String(b.estampillaPctEj) : '');
        if (b.items?.length) {
          // Los viáticos guardados se apartan: no son filas de material y se
          // vuelcan sobre las que arma el levantamiento.
          viaticosGuardados.current = new Map(
            b.items
              .filter((item) => esFilaViatico(item.descripcion))
              .map((item) => [item.descripcion as string, {
                ...createEmptyRow(0),
                descripcion: item.descripcion as string,
                cantidad: item.cantidad != null ? String(item.cantidad) : '',
                vrUnitario: item.vrUnitario != null ? String(item.vrUnitario) : '',
                cantBodega: item.cantBodega != null ? String(item.cantBodega) : '',
                costoTransporte: item.costoTransporte != null ? String(item.costoTransporte) : '',
                ejecutado: item.ejecutado != null ? String(item.ejecutado) : '',
                hasIva: item.hasIva === true,
              }]),
          );
          setTravelRows((prev) => fusionarViaticos(prev));
          const regularItems = b.items.filter(
            (item) => !FIXED_ROW_NAMES.includes(item.descripcion as any)
              && !esFilaViatico(item.descripcion)
          );
          const loaded: PresupuestoRow[] = regularItems.map((item, i) => ({
            id: i + 1,
            materialId: item.materialId,
            // Los presupuestos creados desde el levantamiento se guardaron sin
            // descripción (solo con el código), así que se cae a la del material.
            // Va con || y no con ??: lo guardado es cadena vacía, no null.
            codigo: item.codigo || item.material?.code || '',
            descripcion: item.descripcion || item.material?.description || '',
            cantidad: item.cantidad != null ? String(item.cantidad) : '',
            vrUnitario: item.vrUnitario != null ? String(item.vrUnitario) : '',
            cantBodega: item.cantBodega != null ? String(item.cantBodega) : '',
            costoTransporte: item.costoTransporte != null ? String(item.costoTransporte) : '',
            ejecutado: item.ejecutado != null ? String(item.ejecutado) : '',
            hasIva: item.hasIva !== false,
            isManual: false,
          }));
          const fixedRows: PresupuestoRow[] = FIXED_ROW_NAMES.map((name) => {
            const saved = b.items.find((item) => item.descripcion === name);
            return {
              ...createFixedRow(name),
              cantidad: saved?.cantidad != null ? String(saved.cantidad) : '',
              vrUnitario: saved?.vrUnitario != null ? String(saved.vrUnitario) : '',
              cantBodega: saved?.cantBodega != null ? String(saved.cantBodega) : '',
              costoTransporte: saved?.costoTransporte != null ? String(saved.costoTransporte) : '',
              ejecutado: saved?.ejecutado != null ? String(saved.ejecutado) : '',
              hasIva: saved?.hasIva ?? false,
            };
          });
          setRows([...loaded, ...fixedRows].map((r, i) => ({ ...r, id: i + 1 })));
        }
      } catch {
        toast.error('No se pudo cargar el presupuesto');
      }
    };
    load();
  }, [budgetId, departments, accessLoading]);

  // Preselección al llegar desde la bandeja de actas pendientes: deja el presupuesto
  // en modo agrupado sobre esa acta; los efectos de abajo cargan materiales, costos
  // de viaje y valor facturado solos, igual que si se hubiera elegido a mano.
  useEffect(() => {
    if (budgetId || preselectAppliedRef.current) return;
    if (accessLoading || departments.length === 0) return;
    if (preCompanyId == null || !preActa) return;

    const dept = departments.find(
      (d) =>
        d.companyIds.includes(preCompanyId) ||
        (preProjectId != null && d.projectIds.includes(preProjectId)),
    );
    if (!dept) return;

    // El municipio puede ser el proyecto en sí, o la empresa que lo tiene enlazado
    // (una UT homónima, como Tarso). Sin proyecto, el municipio es la empresa.
    const muni =
      preProjectId != null
        ? dept.municipalities.find(
            (m) =>
              (m.type === 'project' && m.id === preProjectId) || m.linkedProjectId === preProjectId,
          )
        : dept.municipalities.find((m) => m.type === 'company' && m.id === preCompanyId);

    preselectAppliedRef.current = true;
    setSelectedDept(dept);
    setSelectedMunicipality(muni ?? null);
    setWorkSelectionMode('agrupado');
    setSelectedActa(preActa);
  }, [budgetId, departments, accessLoading, preCompanyId, preProjectId, preActa]);

  // Resuelve el municipio de un conjunto de obras. En Antioquia el municipio es el PROYECTO
  // (las obras pertenecen a "Canales & Contactos" y el municipio sale del proyecto); en otros
  // departamentos el municipio es la empresa. Devuelve '' si abarca varios municipios.
  const resolveMunicipioName = useCallback((list: Work[]): string => {
    const projectIds = Array.from(
      new Set(list.filter((w) => w.projectId != null).map((w) => w.projectId)),
    );
    if (projectIds.length === 1) {
      const id = projectIds[0];
      // El proyecto puede no estar en `access` (fuera del alcance del usuario, o
      // todavía cargando); el departamento también lo lista como municipio.
      const nombre =
        access?.projects?.find((pr) => pr.projectId === id)?.name
        ?? selectedDept?.projects?.find((pr) => pr.projectId === id)?.name
        ?? selectedDept?.municipalities?.find((m) => m.type === 'project' && m.id === id)?.name;
      if (nombre) return getMunicipioName(nombre);
      // Si las obras son de un proyecto, el municipio ES el proyecto. Caer a la
      // empresa daría la matriz (Canales & Contactos en Antioquia), que no es un
      // municipio: mejor vacío que un nombre equivocado.
      return '';
    }
    const companyIds = Array.from(new Set(list.map((w) => w.companyId)));
    if (companyIds.length === 1 && selectedDept) {
      const c = selectedDept.companies.find((cc) => cc.companyId === companyIds[0]);
      if (c) return getMunicipioName(c.name);
    }
    return '';
  }, [access, selectedDept]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const selectedWork = works.find((w) => w.workId === selectedWorkId);
      // Guardamos el municipio resuelto (proyecto en Antioquia, empresa en el resto) como
      // companyName, así la lista lo muestra. '' si el acta abarca varios municipios.
      const obrasDelPresupuesto =
        workSelectionMode === 'agrupado' && selectedActa
          ? works.filter((w) => w.recordNumber === selectedActa)
          : selectedWork
            ? [selectedWork]
            : [];
      const municipio = resolveMunicipioName(obrasDelPresupuesto);
      // Con obras de un proyecto el municipio ES el proyecto, así que no se cae a
      // la empresa: sería la matriz (Canales & Contactos) y pisaría el municipio.
      // Sin municipio se manda undefined, que el backend ignora y conserva el
      // valor guardado, en vez de sobrescribirlo con algo equivocado.
      const esPorProyecto = obrasDelPresupuesto.some((w) => w.projectId != null);
      const companyName =
        (municipio || undefined) ??
        (esPorProyecto
          ? undefined
          : selectedWork?.company?.name ??
            (selectedDept?.companies?.length === 1 ? selectedDept.companies[0].name : undefined));
      // Acta de origen, tomada de las obras reales (no del ?acta= de la URL). Es lo que
      // le permite a Gerencia cerrar el presupuesto del acta al aprobar: sin empresa y
      // proyecto el número es ambiguo, porque se repite entre municipios.
      const obraDelActa = obrasDelPresupuesto[0];
      const actaNumber =
        workSelectionMode === 'agrupado' ? selectedActa : selectedWork?.recordNumber ?? null;
      const dto = {
        workId: workSelectionMode === 'individual' ? selectedWorkId : null,
        actaNumber: actaNumber || null,
        actaCompanyId: actaNumber ? obraDelActa?.companyId ?? null : null,
        actaProjectId: actaNumber ? obraDelActa?.projectId ?? null : null,
        departmentName: selectedDept?.name,
        companyName,
        workName:
          workSelectionMode === 'individual'
            ? selectedWorkName || undefined
            : selectedActa ?? undefined,
        fuenteFinanciacion: fuenteFinanciacion || undefined,
        valorMinimoExcedentes: valorMinimoExcedentes ? parseFloat(valorMinimoExcedentes) : null,
        valorActualExcedentes: valorActualExcedentes ? parseFloat(valorActualExcedentes) : null,
        valorActualExcedentesTexto: valorActualExcedentesTexto.trim() || undefined,
        saldoDisponible: saldoDisponibleNum || null,
        observaciones: observaciones || undefined,
        manoDeObra: manoDeObra ? parseFloat(manoDeObra) : null,
        manoDeObraEj: manoDeObraEj ? parseFloat(manoDeObraEj) : null,
        materialesInventario: materialesInventario ? parseFloat(materialesInventario) : null,
        materialesInventarioEj: materialesInventarioEj ? parseFloat(materialesInventarioEj) : null,
        valorFacturado: valorFacturado ? parseFloat(valorFacturado) : null,
        valorFacturadoEj: valorFacturadoEj ? parseFloat(valorFacturadoEj) : null,
        otrosCostos: otrosCostos ? parseFloat(otrosCostos) : null,
        otrosCostosEj: otrosCostosEj ? parseFloat(otrosCostosEj) : null,
        leg: leg ? parseFloat(leg) : null,
        legEj: legEj ? parseFloat(legEj) : null,
        retPct: retPct ? parseFloat(retPct) : null,
        retPctEj: retPctEj ? parseFloat(retPctEj) : null,
        estampillaPct: estampillaPct ? parseFloat(estampillaPct) : null,
        estampillaPctEj: estampillaPctEj ? parseFloat(estampillaPctEj) : null,
        status: 'draft' as const,
        // Los viáticos van al final: son filas del presupuesto como las demás y
        // sin esto lo que se capture en ellas se pierde al recargar.
        items: [...rows, ...travelRows].map((r, i) => ({
          itemOrder: i + 1,
          materialId: r.materialId ?? null,
          codigo: r.codigo || undefined,
          descripcion: r.descripcion || undefined,
          cantidad: r.cantidad ? parseFloat(r.cantidad) : null,
          vrUnitario: r.vrUnitario ? parseFloat(r.vrUnitario) : null,
          cantBodega: r.cantBodega ? parseFloat(r.cantBodega) : null,
          costoTransporte: r.costoTransporte ? parseFloat(r.costoTransporte) : null,
          ejecutado: r.ejecutado ? parseFloat(r.ejecutado) : null,
          hasIva: r.hasIva,
        })),
      };
      if (budgetId) {
        await directorBudgetsService.update(budgetId, dto);
        toast.success('Presupuesto actualizado');
      } else {
        const created = await directorBudgetsService.create(dto);
        setBudgetId(created.budgetId);
        navigate(`/dashboard/levantamiento-obras/presupuesto/${created.budgetId}`, { replace: true });
        toast.success('Borrador guardado');
      }
    } catch {
      toast.error('Error al guardar el presupuesto');
    } finally {
      setSaving(false);
    }
  }, [
    budgetId, workSelectionMode, selectedWorkId, selectedActa, selectedDept, selectedWorkName,
    fuenteFinanciacion, valorMinimoExcedentes, valorActualExcedentes, valorActualExcedentesTexto,
    observaciones, manoDeObra, manoDeObraEj, materialesInventario, materialesInventarioEj,
    valorFacturado, valorFacturadoEj, otrosCostos, otrosCostosEj,
    leg, legEj, retPct, retPctEj, estampillaPct, estampillaPctEj, rows, travelRows, works, resolveMunicipioName, navigate,
  ]);

  const handleSubmitForReview = useCallback(async () => {
    if (!budgetId) return;
    if (!fuenteFinanciacion.trim() || !valorMinimoExcedentes.trim() || !valorActualExcedentes.trim()) {
      toast.error('Debe diligenciar Fuente de Financiación, Valor Mínimo de los Excedentes y Valor Actual de Excedentes antes de enviar a revisión.');
      return;
    }
    // El acta es obligatoria para salir a autorización: Gerencia no debe autorizar un
    // presupuesto sin origen, y es el acta la que se cierra al aprobar. El backend valida
    // además que esté esperando presupuesto; aquí solo se atrapa el caso evidente.
    const actaDelPresupuesto =
      workSelectionMode === 'agrupado'
        ? selectedActa
        : works.find((w) => w.workId === selectedWorkId)?.recordNumber;
    if (!actaDelPresupuesto) {
      toast.error('El presupuesto debe estar asociado a un acta antes de enviarlo a autorización.');
      return;
    }
    try {
      setTransitioning(true);
      await directorBudgetsService.submitForReview(budgetId);
      setBudgetStatus('en_revision');
      toast.success('Presupuesto enviado a revisión');
    } catch (e: any) {
      // El backend explica por qué (acta sin enviar a presupuesto, rechazada, no
      // identificable). Perder ese mensaje deja al usuario sin saber qué corregir.
      toast.error(e?.response?.data?.message || 'Error al enviar a revisión');
    } finally {
      setTransitioning(false);
    }
  }, [
    budgetId, fuenteFinanciacion, valorMinimoExcedentes, valorActualExcedentes,
    workSelectionMode, selectedActa, selectedWorkId, works,
  ]);

  const handleApprove = useCallback(async () => {
    if (!budgetId) return;
    try {
      setTransitioning(true);
      // Gerencia pudo ajustar Otros Costos y Costos L.N.A durante la autorización: se guardan al aprobar.
      if (canEditAuthFields) {
        await directorBudgetsService.updateOtrosCostos(
          budgetId,
          otrosCostos ? parseFloat(otrosCostos) : null,
          otrosCostosEj ? parseFloat(otrosCostosEj) : null,
          leg ? parseFloat(leg) : null,
          legEj ? parseFloat(legEj) : null,
        );
      }
      await directorBudgetsService.approve(budgetId);
      setBudgetStatus('final');
      toast.success('Presupuesto aprobado como Final');
    } catch {
      toast.error('Error al aprobar el presupuesto');
    } finally {
      setTransitioning(false);
    }
  }, [budgetId, canEditAuthFields, otrosCostos, otrosCostosEj, leg, legEj]);

  const handleReject = useCallback(async () => {
    if (!budgetId) return;
    // Devolver desde 'final' deshace una autorización y devuelve el acta a revisión:
    // no es lo mismo que rechazar algo que todavía se está revisando.
    if (budgetStatus === 'final') {
      const ok = window.confirm(
        'Este presupuesto ya está autorizado. Al devolverlo vuelve a borrador y el ' +
          'presupuesto del acta regresa a revisión. ¿Continuar?',
      );
      if (!ok) return;
    }
    try {
      setTransitioning(true);
      await directorBudgetsService.reject(budgetId);
      setBudgetStatus('draft');
      toast.success('Presupuesto devuelto a borrador');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Error al devolver el presupuesto');
    } finally {
      setTransitioning(false);
    }
  }, [budgetId, budgetStatus]);

  // Load materials catalog
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingMaterials(true);
        const data = await materialsService.getMaterials();
        setMaterials(data);
      } catch {
        // silent
      } finally {
        setLoadingMaterials(false);
      }
    };
    load();
  }, []);

  // Load works for the selected department / municipality.
  // Las obras de Antioquia viven en la empresa "Canales & Contactos" separadas por proyecto
  // (Ciudad Bolívar, Tarso, Jericó, Pueblo Rico). Al elegir un municipio cargamos por el
  // proyecto de ese nombre; en "Todos" incluimos también la empresa dueña de esos proyectos.
  useEffect(() => {
    if (!selectedDept) {
      setWorks([]);
      return;
    }
    let companyIds: number[] | undefined;
    let projectId: number | undefined;

    if (selectedMunicipality === null) {
      // Todos: empresas del depto + empresas dueñas de sus proyectos (p. ej. Canales & Contactos)
      companyIds = Array.from(
        new Set([
          ...selectedDept.companyIds,
          ...selectedDept.municipalities
            .filter((m) => m.type === 'project' && m.companyId != null)
            .map((m) => m.companyId!),
        ]),
      );
    } else if (selectedMunicipality.type === 'project') {
      projectId = selectedMunicipality.id;
    } else if (selectedMunicipality.linkedProjectId != null) {
      // La UT homónima existe pero las obras cuelgan del proyecto del mismo nombre.
      projectId = selectedMunicipality.linkedProjectId;
    } else {
      companyIds = [selectedMunicipality.id];
    }

    const load = async () => {
      try {
        setLoadingWorks(true);
        const response = await surveysService.getWorks({ companyId: companyIds, projectId, limit: 1000 });
        const worksData = Array.isArray(response) ? response : (response.data ?? []);
        setWorks(worksData);
      } catch {
        // silent
      } finally {
        setLoadingWorks(false);
      }
    };
    load();
  }, [selectedDept, selectedMunicipality, access]);

  // VALOR FACTURADO = UCAPs (cantidad × valor unitario del catálogo) ajustadas por IPP del mes.
  //   valor = base × (IPP del mes / IPP inicial). IPP inicial: ippConfig de la empresa; IPP del mes: del levantamiento.
  const computeValorFacturado = useCallback(async (fullSurveys: any[], companyId?: number, projectId?: number): Promise<number> => {
    let valMap = new Map<number, number>();
    let ippInicial = 0;
    if (companyId) {
      try {
        const u = await surveysService.getUcaps(companyId, projectId);
        valMap = new Map(u.ucaps.map((x) => [x.ucapId, Number(x.value) || 0]));
        ippInicial = Number(u.ippConfig?.initialValue) || 0;
      } catch { /* ignore — sin catálogo se usa el valor del levantamiento */ }
    }
    let base = 0;
    for (const s of fullSurveys) {
      for (const bi of (s.budgetItems ?? [])) {
        if (!bi.ucapId) continue;
        const vr = valMap.get(bi.ucapId) ?? Number(bi.unitValue) ?? 0;
        base += (Number(bi.quantity) || 0) * vr;
      }
    }
    const ippMes = fullSurveys.map((s) => s.previousMonthIpp).find((v) => v != null && Number(v) > 0);
    const factor = ippInicial > 0 && ippMes ? Number(ippMes) / ippInicial : 1;
    return base * factor;
  }, []);

  // Load materials from a single work (individual mode)
  useEffect(() => {
    const skipRows = skipWorkMaterialsLoad.current;
    if (skipWorkMaterialsLoad.current) {
      skipWorkMaterialsLoad.current = false;
    }
    if (!selectedWorkId) {
      setTravelRows([]);
      if (!skipRows) setRows(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
      return;
    }
    const load = async () => {
      try {
        setLoadingWorkMaterials(true);
        const listResponse = await surveysService.getSurveys({ workId: selectedWorkId, limit: 100 });
        const surveyIds = (listResponse.data ?? []).map((s) => s.surveyId);
        if (surveyIds.length === 0) return;

        const fullSurveys = await Promise.all(surveyIds.map((id) => surveysService.getSurveyById(id)));

        setTravelRows(fusionarViaticos(buildTravelRows(fullSurveys)));

        if (skipRows) return;

        // VALOR FACTURADO automático desde las UCAPs (con IPP). IPP inicial por PROYECTO.
        const selWork = works.find((w) => w.workId === selectedWorkId);
        const vf = await computeValorFacturado(fullSurveys, selWork?.companyId, selWork?.projectId);
        setValorFacturado(vf > 0 ? String(Math.round(vf)) : '');

        const materialMap = new Map<number, { materialId: number; codigo: string; descripcion: string; cantidad: number }>();
        for (const survey of fullSurveys) {
          for (const item of survey.materialItems ?? []) {
            const qty = Number(item.quantity) || 0;
            const existing = materialMap.get(item.materialId);
            if (existing) {
              existing.cantidad += qty;
            } else {
              materialMap.set(item.materialId, {
                materialId: item.materialId,
                codigo: item.material?.code ?? '',
                descripcion: item.material?.description ?? '',
                cantidad: qty,
              });
            }
          }
        }

        const materialIds = Array.from(materialMap.keys());
        const lastPrices = await materialsService.getLastPrices(materialIds).catch(() => []);
        const priceMap = new Map(lastPrices.map((p) => [p.materialId, p.lastPrice]));

        const materialRows: PresupuestoRow[] = Array.from(materialMap.values()).map((m, i) => ({
          ...createEmptyRow(i + 1),
          materialId: m.materialId,
          codigo: m.codigo,
          descripcion: m.descripcion,
          cantidad: String(m.cantidad),
          vrUnitario: (priceMap.get(m.materialId) ?? 0) > 0 ? String(priceMap.get(m.materialId)) : '',
        }));

        while (materialRows.length < 10) materialRows.push(createEmptyRow(materialRows.length + 1));
        const fixedRows = FIXED_ROW_NAMES.map((name) => createFixedRow(name));
        setRows([...materialRows, ...fixedRows].map((r, i) => ({ ...r, id: i + 1 })));
      } catch {
        // silent
      } finally {
        setLoadingWorkMaterials(false);
      }
    };
    load();
  }, [selectedWorkId]);

  // Load and merge materials from ALL works in a grouped acta
  useEffect(() => {
    if (!selectedActa) return;
    const actaWorks = works.filter((w) => w.recordNumber === selectedActa);
    if (actaWorks.length === 0) return;
    const skipRows = skipActaMaterialsLoad.current;
    if (skipActaMaterialsLoad.current) {
      skipActaMaterialsLoad.current = false;
    }

    const load = async () => {
      try {
        setLoadingWorkMaterials(true);

        // Fetch surveys for every work in the group in parallel
        const allSurveyLists = await Promise.all(
          actaWorks.map((w) => surveysService.getSurveys({ workId: w.workId, limit: 100 }))
        );

        const allSurveyIds = allSurveyLists.flatMap((r) => (r.data ?? []).map((s) => s.surveyId));
        if (allSurveyIds.length === 0) {
          setTravelRows([]);
          if (!skipRows) setRows(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
          return;
        }

        const fullSurveys = await Promise.all(
          allSurveyIds.map((id) => surveysService.getSurveyById(id))
        );

        setTravelRows(fusionarViaticos(buildTravelRows(fullSurveys)));

        if (skipRows) return;

        // VALOR FACTURADO automático desde las UCAPs (con IPP) — todas las obras del acta.
        // El IPP inicial vive por PROYECTO (municipio), así que se pasa projectId al catálogo.
        const vf = await computeValorFacturado(fullSurveys, actaWorks[0]?.companyId, actaWorks[0]?.projectId);
        setValorFacturado(vf > 0 ? String(Math.round(vf)) : '');

        // Merge: same materialId → sum quantities (Number() handles decimal-as-string from TypeORM)
        const materialMap = new Map<number, { materialId: number; codigo: string; descripcion: string; cantidad: number }>();
        for (const survey of fullSurveys) {
          for (const item of survey.materialItems ?? []) {
            const qty = Number(item.quantity) || 0;
            const existing = materialMap.get(item.materialId);
            if (existing) {
              existing.cantidad += qty;
            } else {
              materialMap.set(item.materialId, {
                materialId: item.materialId,
                codigo: item.material?.code ?? '',
                descripcion: item.material?.description ?? '',
                cantidad: qty,
              });
            }
          }
        }

        const materialIds = Array.from(materialMap.keys());
        const lastPrices = await materialsService.getLastPrices(materialIds).catch(() => []);
        const priceMap = new Map(lastPrices.map((p) => [p.materialId, p.lastPrice]));

        const materialRows: PresupuestoRow[] = Array.from(materialMap.values()).map((m, i) => ({
          ...createEmptyRow(i + 1),
          materialId: m.materialId,
          codigo: m.codigo,
          descripcion: m.descripcion,
          cantidad: String(m.cantidad),
          vrUnitario: (priceMap.get(m.materialId) ?? 0) > 0 ? String(priceMap.get(m.materialId)) : '',
        }));

        while (materialRows.length < 10) materialRows.push(createEmptyRow(materialRows.length + 1));
        const fixedRows = FIXED_ROW_NAMES.map((name) => createFixedRow(name));
        setRows([...materialRows, ...fixedRows].map((r, i) => ({ ...r, id: i + 1 })));
      } catch {
        // silent
      } finally {
        setLoadingWorkMaterials(false);
      }
    };
    load();
  }, [selectedActa, works]);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const regular = prev.filter((r) => !r.isFixed);
      const fixed = prev.filter((r) => r.isFixed);
      const newRow = { ...createEmptyRow(0), isManual: true };
      return [...regular, newRow, ...fixed].map((r, i) => ({ ...r, id: i + 1 }));
    });
  }, []);

  const removeRow = useCallback((id: number) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row?.isFixed) return prev;
      const filtered = prev.filter((r) => r.id !== id);
      return filtered.map((r, i) => ({ ...r, id: i + 1 }));
    });
  }, []);

  const updateRow = useCallback((id: number, field: keyof PresupuestoRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const toggleRowHasIva = useCallback((id: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, hasIva: !r.hasIva } : r)));
  }, []);

  const updateTravelRow = useCallback((i: number, field: keyof PresupuestoRow, value: string) => {
    setTravelRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  }, []);

  const toggleTravelRowHasIva = useCallback((i: number) => {
    setTravelRows((prev) => prev.map((r, j) => (j === i ? { ...r, hasIva: !r.hasIva } : r)));
  }, []);

  const removeTravelRow = useCallback((i: number) => {
    setTravelRows((prev) => prev.filter((_, j) => j !== i));
  }, []);

  const handleMaterialSelect = useCallback((rowId: number, material: Material | null) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (!material) return { ...r, materialId: null, codigo: '', descripcion: '', vrUnitario: '' };
        return { ...r, materialId: material.materialId, codigo: material.code, descripcion: material.description };
      })
    );
    if (material) {
      materialsService.getLastPrices([material.materialId]).then((prices) => {
        const price = prices.find((p) => p.materialId === material.materialId);
        if (price && price.lastPrice > 0) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === rowId && !r.vrUnitario ? { ...r, vrUnitario: String(price.lastPrice) } : r
            )
          );
        }
      }).catch(() => {});
    }
  }, []);

  const clearWorkSelection = () => {
    setSelectedWorkId(null);
    setSelectedWorkName('');
    setSelectedActa(null);
    setTravelRows([]);
    setRows([
      ...Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)),
      ...FIXED_ROW_NAMES.map((name, i) => ({ ...createFixedRow(name), id: i + 11 })),
    ]);
  };

  const switchMode = (mode: WorkSelectionMode) => {
    setWorkSelectionMode(mode);
    clearWorkSelection();
  };

  const calculated = useMemo(() => {
    return rows.map((row) => {
      const cantidad = parseNum(row.cantidad);
      const vrUnitario = parseNum(row.vrUnitario);
      const costoTransporte = parseNum(row.costoTransporte);
      const cantBodega = parseNum(row.cantBodega);
      const ivaUnitario = row.hasIva ? vrUnitario * 0.19 : 0;
      const subtotalUnitario = vrUnitario + ivaUnitario;
      const vrTotal = subtotalUnitario * cantidad;
      const vrTotalConTransporte =
        row.cantidad === '' || row.vrUnitario === '' || row.cantBodega === '' || row.costoTransporte === ''
          ? 0
          : cantBodega >= cantidad
          ? costoTransporte
          : (cantidad - cantBodega) * subtotalUnitario + costoTransporte;
      return { ivaUnitario, subtotalUnitario, vrTotal, vrTotalConTransporte };
    });
  }, [rows]);

  const travelCalculated = useMemo(() => {
    return travelRows.map((row) => {
      const cantidad = parseNum(row.cantidad);
      const vrUnitario = parseNum(row.vrUnitario);
      const costoTransporte = parseNum(row.costoTransporte);
      const cantBodega = parseNum(row.cantBodega);
      const ivaUnitario = row.hasIva ? vrUnitario * 0.19 : 0;
      const subtotalUnitario = vrUnitario + ivaUnitario;
      const vrTotal = subtotalUnitario * cantidad;
      const vrTotalConTransporte =
        row.cantidad === '' || row.vrUnitario === '' || row.cantBodega === '' || row.costoTransporte === ''
          ? 0
          : cantBodega >= cantidad
          ? costoTransporte
          : (cantidad - cantBodega) * subtotalUnitario + costoTransporte;
      return { ivaUnitario, subtotalUnitario, vrTotal, vrTotalConTransporte };
    });
  }, [travelRows]);

  /**
   * Columnas de seguimiento (Cant. Bodega → Ejecutado). En un presupuesto que
   * todavía no se ejecuta van vacías y en el papel solo estorban, así que se
   * ocultan al imprimir. En pantalla siguen siempre, para poder capturarlas.
   * Cada una se evalúa por separado: si solo hay ejecutado, se imprime esa.
   */
  const colVacia = useMemo(() => {
    const todas = [...rows, ...travelRows];
    const vacia = (campo: 'cantBodega' | 'costoTransporte' | 'ejecutado') =>
      todas.every((r) => (r[campo] ?? '').trim() === '');
    return {
      cantBodega: vacia('cantBodega'),
      costoTransporte: vacia('costoTransporte'),
      // Calculada: sale en '-' salvo que la fila tenga bodega y transporte.
      conTransporte: [...calculated, ...travelCalculated].every((c) => c.vrTotalConTransporte <= 0),
      ejecutado: vacia('ejecutado'),
    };
  }, [rows, travelRows, calculated, travelCalculated]);

  /** Clase para esconder una columna solo en impresión. */
  const sinImprimir = (vacia: boolean) => (vacia ? ' print:hidden' : '');

  const totals = useMemo(() => {
    const subTotal = calculated.reduce((s, r) => s + r.vrTotal, 0)
      + travelCalculated.reduce((s, r) => s + r.vrTotal, 0);
    const mdo = parseNum(manoDeObra);
    const matInv = parseNum(materialesInventario);
    const valFact = parseNum(valorFacturado);
    const otros = parseNum(otrosCostos);
    // COSTOS L.N.A: porcentaje (float) sobre la Utilidad de la Obra.
    const legPct = parseNum(leg);
    const totalObra = subTotal + mdo;
    const ret4 = valFact * (parseNum(retPct) / 100);
    const estampilla = valFact * (parseNum(estampillaPct) / 100);
    const totalAPagar = valFact - ret4 - estampilla;
    const saldo = valFact - totalObra;
    const utilidad = saldo - otros;
    const legAmount = utilidad * (legPct / 100);
    const utilidadFinal = utilidad - legAmount;
    const pctUtilidad = valFact !== 0 ? (utilidad / valFact) * 100 : 0;
    const ejecutadoTotal = rows.reduce((s, r) => s + parseNum(r.ejecutado), 0)
      + travelRows.reduce((s, r) => s + parseNum(r.ejecutado), 0);
    const mdoEj = parseNum(manoDeObraEj);
    const matInvEj = parseNum(materialesInventarioEj);
    const valFactEj = parseNum(valorFacturadoEj);
    const otrosEj = parseNum(otrosCostosEj);
    const legPctEj = parseNum(legEj);
    const totalObraEj = ejecutadoTotal + mdoEj;
    const ret68 = valFactEj * (parseNum(retPctEj) / 100);
    const estampillaEj = valFactEj * (parseNum(estampillaPctEj) / 100);
    const totalAPagarEj = valFactEj - ret68 - estampillaEj;
    const saldoEj = valFactEj - totalObraEj;
    const utilidadEj = saldoEj - otrosEj;
    const legAmountEj = utilidadEj * (legPctEj / 100);
    const utilidadFinalEj = utilidadEj - legAmountEj;
    const pctUtilidadEj = valFactEj !== 0 ? (utilidadEj / valFactEj) * 100 : 0;
    return {
      subTotal, mdo, matInv, valFact, otros, legAmount, estampilla,
      totalObra, ret4, totalAPagar, saldo, utilidad, pctUtilidad, utilidadFinal,
      ejecutadoTotal, mdoEj, matInvEj, valFactEj, otrosEj, legAmountEj, estampillaEj,
      totalObraEj, ret68, totalAPagarEj, saldoEj, utilidadEj, pctUtilidadEj, utilidadFinalEj,
    };
  }, [
    calculated, rows, travelCalculated, travelRows,
    manoDeObra, materialesInventario, valorFacturado, otrosCostos, leg, retPct, estampillaPct,
    manoDeObraEj, materialesInventarioEj, valorFacturadoEj, otrosCostosEj, legEj, retPctEj, estampillaPctEj,
  ]);

  // Title bar label
  const selectionLabel =
    workSelectionMode === 'agrupado' && selectedActa
      ? `Acta ${selectedActa}`
      : selectedWorkName;

  // Municipio para mostrarlo en la cabecera, después del departamento.
  const selectedMunicipioName = useMemo(() => {
    if (!selectedDept) return '';
    // 1) Municipio elegido explícitamente en el filtro
    if (selectedMunicipality) return getMunicipioName(selectedMunicipality.name);
    // 2) Departamento con un solo municipio
    if (selectedDept.municipalities.length === 1) {
      return getMunicipioName(selectedDept.municipalities[0].name);
    }
    // 3) Individual: municipio de la obra seleccionada (proyecto o empresa)
    if (workSelectionMode === 'individual' && selectedWorkId != null) {
      const w = works.find((x) => x.workId === selectedWorkId);
      return w ? resolveMunicipioName([w]) : '';
    }
    // 4) Agrupado: si todas las obras del acta son del mismo municipio, mostrarlo
    if (workSelectionMode === 'agrupado' && selectedActa) {
      return resolveMunicipioName(works.filter((w) => w.recordNumber === selectedActa));
    }
    return '';
  }, [selectedDept, selectedMunicipality, workSelectionMode, selectedWorkId, selectedActa, works, resolveMunicipioName]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10 print:hidden">
        <div className="max-w-full px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl shadow-md p-2 w-12 h-12 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img src="/assets/images/logo-canalco.png" alt="Canalco" className="w-full h-full object-contain" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/levantamiento-obras')} title="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Presupuesto</h1>
            </div>
            <div className="flex items-center gap-3">
              {!isGerenciaReview && loadingMaterials && (
                <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))] flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-[hsl(var(--canalco-primary))]/40 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                  Cargando materiales...
                </span>
              )}
              {!isGerenciaReview && loadingWorkMaterials && (
                <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))] flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-[hsl(var(--canalco-primary))]/40 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
                  Cargando ítems de obra...
                </span>
              )}
              {!isGerenciaReview && !loadingMaterials && materials.length > 0 && (
                <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">
                  {materials.length} materiales
                </span>
              )}

              {/* Coordinadora / Analista PMO: guardar borrador */}
              {canEditBudget && budgetStatus === 'draft' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || transitioning}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
                >
                  {saving ? (
                    <div className="w-4 h-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {budgetId ? 'Actualizar' : 'Guardar Borrador'}
                </Button>
              )}

              {/* Director Financiero: enviar borrador a revisión */}
              {budgetId !== null && canReview && budgetStatus === 'draft' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSubmitForReview}
                  disabled={transitioning}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {transitioning ? (
                    <div className="w-4 h-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Enviar a Revisión
                </Button>
              )}

              {/* Gerencia: aprobar o rechazar cuando está en revisión */}
              {budgetId !== null && canApprove && budgetStatus === 'en_revision' && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleApprove}
                    disabled={transitioning}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {transitioning ? (
                      <div className="w-4 h-4 mr-2 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReject}
                    disabled={transitioning}
                    className="border-red-400 text-red-700 hover:bg-red-50"
                  >
                    {transitioning ? (
                      <div className="w-4 h-4 mr-2 border-2 border-red-400/40 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Rechazar
                  </Button>
                </>
              )}

              {/* Gerencia: devolver cuando está Aprobado */}
              {budgetId !== null && canApprove && budgetStatus === 'final' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  disabled={transitioning}
                  className="border-red-400 text-red-700 hover:bg-red-50"
                >
                  {transitioning ? (
                    <div className="w-4 h-4 mr-2 border-2 border-red-400/40 border-t-red-500 rounded-full animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Devolver
                </Button>
              )}

              {!isGerenciaReview && (
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Selectors row: solo al crear un presupuesto nuevo. Al editar uno guardado
            (o en revisión de Gerencia) se ocultan para no reasignar depto/municipio/acta. */}
        {!isGerenciaReview && budgetId === null && <div className="mb-4 flex flex-wrap items-center gap-4">

          {/* Departamento */}
          <div className="flex items-center gap-2">
            <label className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
              Departamentos:
            </label>
            <Popover open={deptOpen} onOpenChange={setDeptOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={deptOpen}
                  disabled={accessLoading || isReadOnly}
                  className="h-8 min-w-[180px] justify-between text-[16px] font-semibold"
                >
                  {selectedDept?.name || (accessLoading ? 'Cargando...' : 'Seleccionar...')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar departamento..."
                    value={deptSearch}
                    onValueChange={setDeptSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No se encontraron departamentos.</CommandEmpty>
                    <CommandGroup>
                      {departments
                        .filter((d) => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                        .map((d) => (
                          <CommandItem
                            key={d.name}
                            value={d.name}
                            onSelect={() => {
                              setSelectedDept(d);
                              // Sin opción "Todos": siempre queda un municipio elegido.
                              setSelectedMunicipality(visibleMunicipalitiesOf(d.municipalities)[0] ?? null);
                              clearWorkSelection();
                              setWorkSelectionMode('individual');
                              setDeptOpen(false);
                              setDeptSearch('');
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', selectedDept?.name === d.name ? 'opacity-100' : 'opacity-0')} />
                            {d.name}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedDept && !isReadOnly && (
              <button
                onClick={() => {
                  setSelectedDept(null);
                  setSelectedMunicipality(null);
                  clearWorkSelection();
                  setWorkSelectionMode('individual');
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Limpiar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Municipality filter pills */}
          {selectedDept && visibleMunicipalities.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
                Municipio:
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {/* Los ids de empresa y de proyecto son secuencias distintas: la llave lleva el tipo. */}
                {visibleMunicipalities.map((muni) => (
                  <button
                    key={`${muni.type}-${muni.id}`}
                    onClick={() => { setSelectedMunicipality(muni); clearWorkSelection(); }}
                    disabled={isReadOnly}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      selectedMunicipality?.type === muni.type && selectedMunicipality?.id === muni.id
                        ? 'bg-[hsl(var(--canalco-primary))] text-white border-transparent'
                        : 'bg-white text-[hsl(var(--canalco-neutral-600))] border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:text-[hsl(var(--canalco-primary))]'
                    }`}
                  >
                    {getMunicipioName(muni.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode toggle + work/acta selector */}
          {selectedDept && (
            <>
              {/* Individual / Agrupado toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--canalco-neutral-300))]">
                <button
                  onClick={() => !isReadOnly && switchMode('individual')}
                  disabled={isReadOnly}
                  className={`px-3 py-1.5 text-[16px] font-medium transition-colors ${
                    workSelectionMode === 'individual'
                      ? 'bg-[hsl(var(--canalco-primary))] text-white'
                      : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  Individual
                </button>
                <button
                  onClick={() => !isReadOnly && switchMode('agrupado')}
                  disabled={isReadOnly}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[16px] font-medium border-l border-[hsl(var(--canalco-neutral-300))] transition-colors ${
                    workSelectionMode === 'agrupado'
                      ? 'bg-[hsl(var(--canalco-primary))] text-white'
                      : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <Layers className="w-3 h-3" />
                  Agrupado
                  {groupedWorksMap.size > 0 && (
                    <span
                      className={`ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                        workSelectionMode === 'agrupado'
                          ? 'bg-white/30 text-white'
                          : 'bg-[hsl(var(--canalco-primary))]/15 text-[hsl(var(--canalco-primary))]'
                      }`}
                    >
                      {groupedWorksMap.size}
                    </span>
                  )}
                </button>
              </div>

              {/* Individual: select work */}
              {workSelectionMode === 'individual' && (
                <div className="flex items-center gap-2">
                  <label className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
                    Nombre de Obra:
                  </label>
                  <Popover open={workOpen} onOpenChange={setWorkOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={workOpen}
                        className="h-8 min-w-[220px] max-w-[340px] justify-between text-[16px]"
                        disabled={loadingWorks || isReadOnly}
                      >
                        <span className="truncate">
                          {loadingWorks ? 'Cargando...' : (selectedWorkName || 'Seleccionar obra...')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar obra..."
                          value={workSearch}
                          onValueChange={setWorkSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No se encontraron obras.</CommandEmpty>
                          <CommandGroup>
                            {works
                              .filter((w) => !w.recordNumber || !groupedWorksMap.has(w.recordNumber))
                              .filter((w) => w.name.toLowerCase().includes(workSearch.toLowerCase()))
                              .map((w) => (
                                <CommandItem
                                  key={w.workId}
                                  value={w.workId.toString()}
                                  onSelect={() => {
                                    setSelectedWorkId(w.workId);
                                    setSelectedWorkName(w.name);
                                    setWorkOpen(false);
                                    setWorkSearch('');
                                  }}
                                >
                                  <Check className={cn('mr-2 h-4 w-4', selectedWorkId === w.workId ? 'opacity-100' : 'opacity-0')} />
                                  <div className="flex flex-col">
                                    <span className="text-[16px]">{w.name}</span>
                                    {w.address && <span className="text-[16px] text-muted-foreground">{w.address}</span>}
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedWorkId && !isReadOnly && (
                    <button
                      onClick={clearWorkSelection}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Limpiar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Agrupado: select acta */}
              {workSelectionMode === 'agrupado' && (
                <div className="flex items-center gap-2">
                  <label className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
                    N° Acta:
                  </label>
                  <Popover open={actaOpen} onOpenChange={setActaOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={actaOpen}
                        className="h-8 min-w-[220px] max-w-[340px] justify-between text-[16px]"
                        disabled={loadingWorks || isReadOnly}
                      >
                        <span className="truncate font-mono">
                          {loadingWorks ? 'Cargando...' : (selectedActa || 'Seleccionar acta...')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[360px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar número de acta..."
                          value={actaSearch}
                          onValueChange={setActaSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {groupedWorksMap.size === 0
                              ? 'No hay proyectos agrupados en este municipio'
                              : 'No se encontraron actas'}
                          </CommandEmpty>
                          <CommandGroup>
                            {Array.from(groupedWorksMap.entries())
                              .filter(([acta]) => acta.toLowerCase().includes(actaSearch.toLowerCase()))
                              .map(([acta, actaWorks]) => (
                                <CommandItem
                                  key={acta}
                                  value={acta}
                                  onSelect={() => {
                                    setSelectedActa(acta);
                                    setActaOpen(false);
                                    setActaSearch('');
                                  }}
                                >
                                  <Check className={cn('mr-2 h-4 w-4', selectedActa === acta ? 'opacity-100' : 'opacity-0')} />
                                  <div className="flex flex-col">
                                    <span className="text-[16px] font-mono font-medium">{acta}</span>
                                    <span className="text-[16px] text-muted-foreground">
                                      {actaWorks.length} obra{actaWorks.length !== 1 ? 's' : ''} agrupadas
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedActa && (
                    <button
                      onClick={clearWorkSelection}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Limpiar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>}

        {/* Budget card */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
          {/* Title bar */}
          <div className="bg-[hsl(var(--canalco-primary))] px-6 py-3 text-center">
            <h2 className="text-base font-bold text-white tracking-wider">
              {selectedDept
                ? `${selectedDept.name.toUpperCase()}${selectedMunicipioName ? ` / ${selectedMunicipioName.toUpperCase()}` : ''}${selectionLabel ? ` / ${selectionLabel.toUpperCase()}` : ''} — `
                : ''}PRESUPUESTO {STATUS_TITLE_LABELS[budgetStatus]}
            </h2>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[16px] border-collapse">
              <thead>
                <tr className="bg-[hsl(var(--canalco-primary))]/10">
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-10">Item</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-24">Código</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-left font-semibold min-w-[260px]">Descripción</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-20">Cantidad</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Vr. Unitario</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">IVA Unitario (19%)</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Subtotal Unitario</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Vr. Total</th>
                  <th className={`border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-24${sinImprimir(colVacia.cantBodega)}`}>Cant. Bodega</th>
                  <th className={`border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28${sinImprimir(colVacia.costoTransporte)}`}>Costo de Transporte</th>
                  <th className={`border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-32${sinImprimir(colVacia.conTransporte)}`}>Vr Total (Con Transporte)</th>
                  <th className={`border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28${sinImprimir(colVacia.ejecutado)}`}>Ejecutado</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-1 py-2 w-8 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const calc = calculated[index];
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-[hsl(var(--canalco-neutral-200))]',
                        index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
                      )}
                    >
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-700))]">
                        {row.id}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          value={row.codigo}
                          onChange={(e) => updateRow(row.id, 'codigo', e.target.value)}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        {row.isFixed ? (
                          <span className="flex-1 text-[16px] uppercase tracking-wide px-1">{row.descripcion}</span>
                        ) : row.isManual ? (
                          <Input
                            value={row.descripcion}
                            onChange={(e) => updateRow(row.id, 'descripcion', e.target.value)}
                            disabled={isReadOnly}
                            placeholder="Descripción..."
                            className="w-full h-6 text-[16px] border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="flex-1 text-[16px] truncate">{row.descripcion}</span>
                            {!isReadOnly && (
                              <MaterialCombobox
                                value={row.materialId}
                                materials={materials}
                                onSelect={(m) => handleMaterialSelect(row.id, m)}
                                disabled={loadingMaterials}
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <input
                          type={editingCantidadId === row.id ? 'number' : 'text'}
                          min="0"
                          value={editingCantidadId === row.id
                            ? row.cantidad
                            : (row.cantidad !== '' ? fmtTable(parseNum(row.cantidad)) : '')}
                          onFocus={() => setEditingCantidadId(row.id)}
                          onBlur={() => setEditingCantidadId(null)}
                          onChange={(e) => updateRow(row.id, 'cantidad', e.target.value)}
                          disabled={isReadOnly}
                          className="w-full text-center bg-transparent border-0 outline-none p-0 disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <input
                          type={editingVrUnitarioId === row.id ? 'number' : 'text'}
                          min="0"
                          step="any"
                          value={editingVrUnitarioId === row.id
                            ? row.vrUnitario
                            : (row.vrUnitario !== '' ? fmtTable(parseNum(row.vrUnitario)) : '')}
                          onFocus={() => setEditingVrUnitarioId(row.id)}
                          onBlur={() => setEditingVrUnitarioId(null)}
                          onChange={(e) => updateRow(row.id, 'vrUnitario', e.target.value)}
                          disabled={isReadOnly}
                          className="w-full text-right bg-transparent border-0 outline-none p-0 disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        <div className="flex items-center justify-end gap-1.5">
                          {parseNum(row.vrUnitario) > 0 && row.hasIva ? fmtTable(calc.ivaUnitario) : <span className="text-[hsl(var(--canalco-neutral-300))]">-</span>}
                          {!isReadOnly && (
                            <input
                              type="checkbox"
                              checked={row.hasIva}
                              onChange={() => toggleRowHasIva(row.id)}
                              title="Aplica IVA 19%"
                              className="w-3 h-3 cursor-pointer accent-[hsl(var(--canalco-primary))]"
                            />
                          )}
                        </div>
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        {parseNum(row.vrUnitario) > 0 ? fmtTable(calc.subtotalUnitario) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotal > 0 ? fmtTable(calc.vrTotal) : '-'}
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.cantBodega)}`}>
                        <Input
                          type="number"
                          min="0"
                          value={row.cantBodega}
                          onChange={(e) => updateRow(row.id, 'cantBodega', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.costoTransporte)}`}>
                        <FormattedInput
                          value={row.costoTransporte}
                          onChange={(v) => updateRow(row.id, 'costoTransporte', v)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium${sinImprimir(colVacia.conTransporte)}`}>
                        {calc.vrTotalConTransporte > 0 ? fmtTable(calc.vrTotalConTransporte) : '-'}
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.ejecutado)}`}>
                        <FormattedInput
                          value={row.ejecutado}
                          onChange={(v) => updateRow(row.id, 'ejecutado', v)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1 text-center print:hidden">
                        {rows.length > 1 && !isReadOnly && !row.isFixed && (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {travelRows.map((row, i) => {
                  const calc = travelCalculated[i];
                  const idx = rows.length + i;
                  return (
                    <tr key={`travel-${i}`} className={cn('border-b border-[hsl(var(--canalco-neutral-200))]', idx % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]')}>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-700))]">{rows.length + i + 1}</td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          value={row.codigo}
                          onChange={(e) => updateTravelRow(i, 'codigo', e.target.value)}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-[16px] uppercase">{row.descripcion}</td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <input
                          type={editingTravelCantidadIdx === i ? 'number' : 'text'}
                          min="0"
                          value={editingTravelCantidadIdx === i
                            ? row.cantidad
                            : (row.cantidad !== '' ? fmtTable(parseNum(row.cantidad)) : '')}
                          onFocus={() => setEditingTravelCantidadIdx(i)}
                          onBlur={() => setEditingTravelCantidadIdx(null)}
                          onChange={(e) => updateTravelRow(i, 'cantidad', e.target.value)}
                          disabled={isReadOnly}
                          className="w-full text-center bg-transparent border-0 outline-none p-0 disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <input
                          type={editingTravelVrUnitarioIdx === i ? 'number' : 'text'}
                          min="0"
                          step="any"
                          value={editingTravelVrUnitarioIdx === i
                            ? row.vrUnitario
                            : (row.vrUnitario !== '' ? fmtTable(parseNum(row.vrUnitario)) : '')}
                          onFocus={() => setEditingTravelVrUnitarioIdx(i)}
                          onBlur={() => setEditingTravelVrUnitarioIdx(null)}
                          onChange={(e) => updateTravelRow(i, 'vrUnitario', e.target.value)}
                          disabled={isReadOnly}
                          className="w-full text-right bg-transparent border-0 outline-none p-0 disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        <div className="flex items-center justify-end gap-1.5">
                          {parseNum(row.vrUnitario) > 0 && row.hasIva ? fmtTable(calc.ivaUnitario) : <span className="text-[hsl(var(--canalco-neutral-300))]">-</span>}
                          {!isReadOnly && (
                            <input
                              type="checkbox"
                              checked={row.hasIva}
                              onChange={() => toggleTravelRowHasIva(i)}
                              title="Aplica IVA 19%"
                              className="w-3 h-3 cursor-pointer accent-[hsl(var(--canalco-primary))]"
                            />
                          )}
                        </div>
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        {parseNum(row.vrUnitario) > 0 ? fmtTable(calc.subtotalUnitario) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotal > 0 ? fmtTable(calc.vrTotal) : '-'}
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.cantBodega)}`}>
                        <Input
                          type="number"
                          min="0"
                          value={row.cantBodega}
                          onChange={(e) => updateTravelRow(i, 'cantBodega', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.costoTransporte)}`}>
                        <FormattedInput
                          value={row.costoTransporte}
                          onChange={(v) => updateTravelRow(i, 'costoTransporte', v)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium${sinImprimir(colVacia.conTransporte)}`}>
                        {calc.vrTotalConTransporte > 0 ? fmtTable(calc.vrTotalConTransporte) : '-'}
                      </td>
                      <td className={`border border-[hsl(var(--canalco-neutral-200))] px-1 py-1${sinImprimir(colVacia.ejecutado)}`}>
                        <FormattedInput
                          value={row.ejecutado}
                          onChange={(v) => updateTravelRow(i, 'ejecutado', v)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1 text-center print:hidden">
                        {!isReadOnly && (
                          <button
                            onClick={() => removeTravelRow(i)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <div className="px-3 py-2 border-t border-[hsl(var(--canalco-neutral-200))] print:hidden flex items-center gap-2">
            {!isReadOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10"
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar línea
              </Button>
            )}
          </div>

          {/* Footer: Observaciones + Totals */}
          <div className="border-t-2 border-[hsl(var(--canalco-primary))]/30 grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[hsl(var(--canalco-neutral-200))]">
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2 uppercase tracking-wide">
                  Observaciones
                </p>
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ingrese observaciones..."
                  disabled={isReadOnly}
                  className="min-h-[120px] text-[16px] resize-none disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Fuente de Financiación
                </p>
                <Input
                  value={fuenteFinanciacion}
                  onChange={(e) => setFuenteFinanciacion(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Ingrese fuente de financiación..."
                  className="text-[16px] max-w-sm disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">
                    Valor Actual de Excedentes
                  </p>
                  <Input
                    value={valorActualExcedentesTexto}
                    onChange={(e) => setValorActualExcedentesTexto(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="texto"
                    aria-label="Texto adicional de valor actual de excedentes"
                    className="h-7 px-1 text-[16px] font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-700))] border-0 border-b border-[hsl(var(--canalco-neutral-300))] rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-[hsl(var(--canalco-primary))] disabled:opacity-80 disabled:cursor-default"
                    style={{
                      width: `${Math.min(Math.max(valorActualExcedentesTexto.length + 2, 10), 42)}ch`,
                    }}
                  />
                </div>
                <FormattedInput
                  value={valorActualExcedentes}
                  onChange={setValorActualExcedentes}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  CONCESIÓN, INTERVENTORIA Y ENERGÍA (2 Meses)
                </p>
                <FormattedInput
                  value={valorMinimoExcedentes}
                  onChange={setValorMinimoExcedentes}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Saldo disponible para obras
                </p>
                <FormattedInput
                  value={saldoDisponible}
                  onChange={() => {}}
                  disabled
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Valor de la Obra
                </p>
                <FormattedInput
                  value={valorActa}
                  onChange={() => {}}
                  disabled
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Saldo Disponible
                </p>
                <FormattedInput
                  value={saldoDisponibleFinal}
                  onChange={() => {}}
                  disabled
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
            </div>

            <div className="p-4">
              <table className="w-full text-[16px]">
                <thead>
                  <tr>
                    <th className="text-left pb-2 text-[hsl(var(--canalco-neutral-500))] font-normal" />
                    <th className="text-right pb-2 text-[hsl(var(--canalco-neutral-600))] font-semibold pr-3">Vr total</th>
                    <th className="text-right pb-2 text-[hsl(var(--canalco-neutral-600))] font-semibold">Ejecutado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">SUB-TOTAL</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{fmt(totals.subTotal)}</td>
                    <td className="py-1.5 text-right font-medium">{totals.ejecutadoTotal > 0 ? fmt(totals.ejecutadoTotal) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">MANO DE OBRA</td>
                    <td className="py-1 pr-3">
                      <Input type="number" min="0" value={manoDeObra} onChange={(e) => setManoDeObra(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <Input type="number" min="0" value={manoDeObraEj} onChange={(e) => setManoDeObraEj(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-primary))]/5">
                    <td className="py-1.5 font-bold text-[hsl(var(--canalco-neutral-900))]">TOTAL OBRA</td>
                    <td className="py-1.5 text-right pr-3 font-bold text-[hsl(var(--canalco-primary))]">{fmt(totals.totalObra)}</td>
                    <td className="py-1.5 text-right font-bold text-[hsl(var(--canalco-primary))]">{fmt(totals.totalObraEj)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">MATERIALES INVENTARIO</td>
                    <td className="py-1 pr-3">
                      <Input type="number" min="0" value={materialesInventario} onChange={(e) => setMaterialesInventario(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <Input type="number" min="0" value={materialesInventarioEj} onChange={(e) => setMaterialesInventarioEj(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">VALOR FACTURADO</td>
                    <td className="py-1 pr-3">
                      <FormattedInput value={valorFacturado} onChange={setValorFacturado} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <FormattedInput value={valorFacturadoEj} onChange={setValorFacturadoEj} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">(-) RETENCIONES</td>
                    <td className="py-1 pr-3">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={retPct} onChange={(e) => setRetPct(e.target.value)} placeholder="%" disabled={isReadOnly} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.ret4 > 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.ret4)}</span>}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={retPctEj} onChange={(e) => setRetPctEj(e.target.value)} placeholder="%" disabled={isReadOnly} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.ret68 > 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.ret68)}</span>}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">(-) ESTAMPILLA</td>
                    <td className="py-1 pr-3">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={estampillaPct} onChange={(e) => setEstampillaPct(e.target.value)} placeholder="%" disabled={isReadOnly} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.estampilla > 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.estampilla)}</span>}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={estampillaPctEj} onChange={(e) => setEstampillaPctEj(e.target.value)} placeholder="%" disabled={isReadOnly} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.estampillaEj > 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.estampillaEj)}</span>}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">TOTAL A PAGAR ORDEN $</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{totals.totalAPagar !== 0 ? fmt(totals.totalAPagar) : '-'}</td>
                    <td className="py-1.5 text-right font-medium">{totals.totalAPagarEj !== 0 ? fmt(totals.totalAPagarEj) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">OTROS COSTOS</td>
                    <td className="py-1 pr-3">
                      <FormattedInput value={otrosCostos} onChange={setOtrosCostos} placeholder="0" disabled={isReadOnly && !canEditAuthFields} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <FormattedInput value={otrosCostosEj} onChange={setOtrosCostosEj} placeholder="0" disabled={isReadOnly && !canEditAuthFields} className="h-7 text-[16px] text-right" />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">SALDO</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{totals.saldo !== 0 ? fmt(totals.saldo) : '-'}</td>
                    <td className="py-1.5 text-right font-medium">{totals.saldoEj !== 0 ? fmt(totals.saldoEj) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">UTILIDAD DE LA OBRA</td>
                    <td className={`py-1.5 text-right pr-3 font-medium ${totals.utilidad < 0 ? 'text-red-600' : ''}`}>
                      {totals.utilidad !== 0 ? fmt(totals.utilidad) : '-'}
                    </td>
                    <td className={`py-1.5 text-right font-medium ${totals.utilidadEj < 0 ? 'text-red-600' : ''}`}>
                      {totals.utilidadEj !== 0 ? fmt(totals.utilidadEj) : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">% UTILIDAD DE LA OBRA</td>
                    <td className="py-1.5 text-right pr-3 text-[hsl(var(--canalco-neutral-600))]">
                      {totals.valFact !== 0 ? `${totals.pctUtilidad.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-1.5 text-right text-[hsl(var(--canalco-neutral-600))]">
                      {totals.valFactEj !== 0 ? `${totals.pctUtilidadEj.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">COSTOS L.N.A</td>
                    <td className="py-1 pr-3">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={leg} onChange={(e) => setLeg(e.target.value)} placeholder="%" disabled={isReadOnly && !canEditAuthFields} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.legAmount !== 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.legAmount)}</span>}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" step="0.01" value={legEj} onChange={(e) => setLegEj(e.target.value)} placeholder="%" disabled={isReadOnly && !canEditAuthFields} className="h-6 text-[16px] text-right w-14" />
                          <span className="text-[16px] text-[hsl(var(--canalco-neutral-500))]">%</span>
                        </div>
                        {totals.legAmountEj !== 0 && <span className="text-[16px] text-red-600 font-medium">{fmt(totals.legAmountEj)}</span>}
                      </div>
                    </td>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-primary))]/5">
                    <td className="py-1.5 font-bold text-[hsl(var(--canalco-neutral-900))]">UTILIDAD FINAL</td>
                    <td className={`py-1.5 text-right pr-3 font-bold ${totals.utilidadFinal < 0 ? 'text-red-600' : 'text-[hsl(var(--canalco-primary))]'}`}>
                      {totals.utilidadFinal !== 0 ? fmt(totals.utilidadFinal) : '-'}
                    </td>
                    <td className={`py-1.5 text-right font-bold ${totals.utilidadFinalEj < 0 ? 'text-red-600' : 'text-[hsl(var(--canalco-primary))]'}`}>
                      {totals.utilidadFinalEj !== 0 ? fmt(totals.utilidadFinalEj) : '-'}
                    </td>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-primary))]/5">
                    <td className="py-1.5 font-bold text-[hsl(var(--canalco-neutral-900))]">% UTILIDAD FINAL</td>
                    <td className={`py-1.5 text-right pr-3 font-bold ${totals.utilidadFinal < 0 ? 'text-red-600' : 'text-[hsl(var(--canalco-primary))]'}`}>
                      {totals.valFact !== 0 ? `${(totals.utilidadFinal / totals.valFact * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className={`py-1.5 text-right font-bold ${totals.utilidadFinalEj < 0 ? 'text-red-600' : 'text-[hsl(var(--canalco-primary))]'}`}>
                      {totals.valFactEj !== 0 ? `${(totals.utilidadFinalEj / totals.valFactEj * 100).toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
