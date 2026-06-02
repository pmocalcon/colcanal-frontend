import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Home, ArrowLeft, Plus, Trash2, Printer, Check, ChevronsUpDown, X, Layers, Send, CheckCircle, XCircle, Lock} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Save } from 'lucide-react';
import { materialsService, type Material } from '@/services/materials.service';
import { surveysService, type Work } from '@/services/surveys.service';
import { directorBudgetsService, type BudgetStatus } from '@/services/director-budgets.service';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments, getMunicipioName, type Department } from '@/utils/departmentMapper';

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
  fuel: 'Combustible',
  additional_crew: 'Cuadrilla Adicional',
  day_hours: 'Horas Diurnas',
  holiday_overtime: 'Horas Festivas/Nocturnas',
};

const FIXED_ROW_NAMES = ['POLIZA', 'IMPREVISTOS', 'TRANSPORTE', 'STICKERS'] as const;

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

const parseNum = (val: string) => parseFloat(val) || 0;

const fmt = (value: number): string => {
  if (value === 0) return '-';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
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
  const [budgetId, setBudgetId] = useState<number | null>(budgetIdParam ? Number(budgetIdParam) : null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const { access, loading: accessLoading } = useSurveyAccess();

  const isAnalistaPMO = user?.nombreRol === 'Analista PMO';
  const canEditBudget = hasPermission('levantamientos:crear') || isAnalistaPMO;
  const canReview = hasPermission('levantamientos:revisar') || hasPermission('levantamientos:autorizar') || isAnalistaPMO;
  const canApprove = hasPermission('levantamientos:aprobar') || isAnalistaPMO;
  const isGerenciaReview = budgetStatus === 'en_revision';
  const isReadOnly = !canEditBudget || (!isAnalistaPMO && budgetStatus !== 'draft');

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<number | null>(null);
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
  const [observaciones, setObservaciones] = useState('');
  const [manoDeObra, setManoDeObra] = useState('');
  const [manoDeObraEj, setManoDeObraEj] = useState('');
  const [materialesInventario, setMaterialesInventario] = useState('');
  const [materialesInventarioEj, setMaterialesInventarioEj] = useState('');
  const [valorFacturado, setValorFacturado] = useState('');
  const [valorFacturadoEj, setValorFacturadoEj] = useState('');
  const [otrosCostos, setOtrosCostos] = useState('');
  const [otrosCostosEj, setOtrosCostosEj] = useState('');
  const [leg, setLeg] = useState('');
  const [legEj, setLegEj] = useState('');
  const [retPct, setRetPct] = useState('');
  const [retPctEj, setRetPctEj] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingWorkMaterials, setLoadingWorkMaterials] = useState(false);
  const [editingVrUnitarioId, setEditingVrUnitarioId] = useState<number | null>(null);
  const [editingCantidadId, setEditingCantidadId] = useState<number | null>(null);
  const skipWorkMaterialsLoad = useRef(false);
  const skipActaMaterialsLoad = useRef(false);
  const budgetLoadedRef = useRef(false);
  const [travelRows, setTravelRows] = useState<PresupuestoRow[]>([]);
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
    // Solo es agrupado si 2+ obras comparten el mismo número de acta
    map.forEach((ws, key) => { if (ws.length < 2) map.delete(key); });
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
        if (b.items?.length) {
          const regularItems = b.items.filter(
            (item) => !FIXED_ROW_NAMES.includes(item.descripcion as any)
          );
          const loaded: PresupuestoRow[] = regularItems.map((item, i) => ({
            id: i + 1,
            materialId: item.materialId,
            codigo: item.codigo ?? '',
            descripcion: item.descripcion ?? '',
            cantidad: item.cantidad != null ? String(item.cantidad) : '',
            vrUnitario: item.vrUnitario != null ? String(item.vrUnitario) : '',
            cantBodega: item.cantBodega != null ? String(item.cantBodega) : '',
            costoTransporte: item.costoTransporte != null ? String(item.costoTransporte) : '',
            ejecutado: item.ejecutado != null ? String(item.ejecutado) : '',
            hasIva: item.hasIva !== false,
            isManual: false,
          }));
          while (loaded.length < 10) loaded.push(createEmptyRow(loaded.length + 1));
          const fixedRows: PresupuestoRow[] = FIXED_ROW_NAMES.map((name) => {
            const saved = b.items.find((item) => item.descripcion === name);
            return {
              ...createFixedRow(name),
              cantidad: saved?.cantidad != null ? String(saved.cantidad) : '',
              vrUnitario: saved?.vrUnitario != null ? String(saved.vrUnitario) : '',
              cantBodega: saved?.cantBodega != null ? String(saved.cantBodega) : '',
              costoTransporte: saved?.costoTransporte != null ? String(saved.costoTransporte) : '',
              ejecutado: saved?.ejecutado != null ? String(saved.ejecutado) : '',
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

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const selectedWork = works.find((w) => w.workId === selectedWorkId);
      const companyName =
        selectedWork?.company?.name ??
        (selectedDept?.companies?.length === 1 ? selectedDept.companies[0].name : undefined);
      const dto = {
        workId: workSelectionMode === 'individual' ? selectedWorkId : null,
        departmentName: selectedDept?.name,
        companyName,
        workName:
          workSelectionMode === 'individual'
            ? selectedWorkName || undefined
            : selectedActa ?? undefined,
        fuenteFinanciacion: fuenteFinanciacion || undefined,
        valorMinimoExcedentes: valorMinimoExcedentes ? parseFloat(valorMinimoExcedentes) : null,
        valorActualExcedentes: valorActualExcedentes ? parseFloat(valorActualExcedentes) : null,
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
        status: 'draft' as const,
        items: rows.map((r, i) => ({
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
    fuenteFinanciacion, valorMinimoExcedentes, valorActualExcedentes,
    observaciones, manoDeObra, manoDeObraEj, materialesInventario, materialesInventarioEj,
    valorFacturado, valorFacturadoEj, otrosCostos, otrosCostosEj,
    leg, legEj, retPct, retPctEj, rows, navigate,
  ]);

  const handleSubmitForReview = useCallback(async () => {
    if (!budgetId) return;
    if (!fuenteFinanciacion.trim() || !valorMinimoExcedentes.trim() || !valorActualExcedentes.trim()) {
      toast.error('Debe diligenciar Fuente de Financiación, Valor Mínimo de los Excedentes y Valor Actual de Excedentes antes de enviar a revisión.');
      return;
    }
    try {
      setTransitioning(true);
      await directorBudgetsService.submitForReview(budgetId);
      setBudgetStatus('en_revision');
      toast.success('Presupuesto enviado a revisión');
    } catch {
      toast.error('Error al enviar a revisión');
    } finally {
      setTransitioning(false);
    }
  }, [budgetId, fuenteFinanciacion, valorMinimoExcedentes, valorActualExcedentes]);

  const handleApprove = useCallback(async () => {
    if (!budgetId) return;
    try {
      setTransitioning(true);
      await directorBudgetsService.approve(budgetId);
      setBudgetStatus('final');
      toast.success('Presupuesto aprobado como Final');
    } catch {
      toast.error('Error al aprobar el presupuesto');
    } finally {
      setTransitioning(false);
    }
  }, [budgetId]);

  const handleReject = useCallback(async () => {
    if (!budgetId) return;
    try {
      setTransitioning(true);
      await directorBudgetsService.reject(budgetId);
      setBudgetStatus('draft');
      toast.success('Presupuesto devuelto a borrador');
    } catch {
      toast.error('Error al rechazar el presupuesto');
    } finally {
      setTransitioning(false);
    }
  }, [budgetId]);

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

  // Load works for the selected department / municipality
  useEffect(() => {
    if (!selectedDept) {
      setWorks([]);
      return;
    }
    const companyIds = selectedMunicipalityId !== null ? [selectedMunicipalityId] : selectedDept.companyIds;
    const load = async () => {
      try {
        setLoadingWorks(true);
        const response = await surveysService.getWorks({ companyId: companyIds, limit: 1000 });
        const worksData = Array.isArray(response) ? response : (response.data ?? []);
        setWorks(worksData);
      } catch {
        // silent
      } finally {
        setLoadingWorks(false);
      }
    };
    load();
  }, [selectedDept, selectedMunicipalityId]);

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

        setTravelRows(buildTravelRows(fullSurveys));

        if (skipRows) return;

        const materialMap = new Map<number, { materialId: number; codigo: string; cantidad: number }>();
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

        setTravelRows(buildTravelRows(fullSurveys));

        if (skipRows) return;

        // Merge: same materialId → sum quantities (Number() handles decimal-as-string from TypeORM)
        const materialMap = new Map<number, { materialId: number; codigo: string; cantidad: number }>();
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

  const totals = useMemo(() => {
    const subTotal = calculated.reduce((s, r) => s + r.vrTotal, 0)
      + travelCalculated.reduce((s, r) => s + r.vrTotal, 0);
    const mdo = parseNum(manoDeObra);
    const matInv = parseNum(materialesInventario);
    const valFact = parseNum(valorFacturado);
    const otros = parseNum(otrosCostos);
    const legVal = parseNum(leg);
    const totalObra = subTotal + mdo;
    const ret4 = valFact * (parseNum(retPct) / 100);
    const totalAPagar = valFact - ret4;
    const saldo = valFact - totalObra;
    const utilidad = saldo - otros;
    const utilidadFinal = utilidad - legVal;
    const pctUtilidad = valFact !== 0 ? (utilidad / valFact) * 100 : 0;
    const ejecutadoTotal = rows.reduce((s, r) => s + parseNum(r.ejecutado), 0)
      + travelRows.reduce((s, r) => s + parseNum(r.ejecutado), 0);
    const mdoEj = parseNum(manoDeObraEj);
    const matInvEj = parseNum(materialesInventarioEj);
    const valFactEj = parseNum(valorFacturadoEj);
    const otrosEj = parseNum(otrosCostosEj);
    const legValEj = parseNum(legEj);
    const totalObraEj = ejecutadoTotal + mdoEj;
    const ret68 = valFactEj * (parseNum(retPctEj) / 100);
    const totalAPagarEj = valFactEj - ret68;
    const saldoEj = valFactEj - totalObraEj;
    const utilidadEj = saldoEj - otrosEj;
    const utilidadFinalEj = utilidadEj - legValEj;
    const pctUtilidadEj = valFactEj !== 0 ? (utilidadEj / valFactEj) * 100 : 0;
    return {
      subTotal, mdo, matInv, valFact, otros, legVal,
      totalObra, ret4, totalAPagar, saldo, utilidad, pctUtilidad, utilidadFinal,
      ejecutadoTotal, mdoEj, matInvEj, valFactEj, otrosEj, legValEj,
      totalObraEj, ret68, totalAPagarEj, saldoEj, utilidadEj, pctUtilidadEj, utilidadFinalEj,
    };
  }, [
    calculated, rows, travelCalculated, travelRows,
    manoDeObra, materialesInventario, valorFacturado, otrosCostos, leg, retPct,
    manoDeObraEj, materialesInventarioEj, valorFacturadoEj, otrosCostosEj, legEj, retPctEj,
  ]);

  // Title bar label
  const selectionLabel =
    workSelectionMode === 'agrupado' && selectedActa
      ? `Acta ${selectedActa}`
      : selectedWorkName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10 print:hidden">
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
        {/* Selectors row */}
        {!isGerenciaReview && <div className="mb-4 flex flex-wrap items-center gap-4">

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
                              setSelectedMunicipalityId(null);
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
                  setSelectedMunicipalityId(null);
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
          {selectedDept && selectedDept.companies.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
                Municipio:
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => { setSelectedMunicipalityId(null); clearWorkSelection(); }}
                  disabled={isReadOnly}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    selectedMunicipalityId === null
                      ? 'bg-[hsl(var(--canalco-primary))] text-white border-transparent'
                      : 'bg-white text-[hsl(var(--canalco-neutral-600))] border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:text-[hsl(var(--canalco-primary))]'
                  }`}
                >
                  Todos
                </button>
                {selectedDept.companies.map((company) => (
                  <button
                    key={company.companyId}
                    onClick={() => { setSelectedMunicipalityId(company.companyId); clearWorkSelection(); }}
                    disabled={isReadOnly}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      selectedMunicipalityId === company.companyId
                        ? 'bg-[hsl(var(--canalco-primary))] text-white border-transparent'
                        : 'bg-white text-[hsl(var(--canalco-neutral-600))] border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:text-[hsl(var(--canalco-primary))]'
                    }`}
                  >
                    {getMunicipioName(company.name)}
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
                ? `${selectedDept.name.toUpperCase()}${selectionLabel ? ` / ${selectionLabel.toUpperCase()}` : ''} — `
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
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-24">Cant. Bodega</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Costo de Transporte</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-32">Vr Total (Con Transporte)</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Ejecutado</th>
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
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.cantBodega}
                          onChange={(e) => updateRow(row.id, 'cantBodega', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.costoTransporte}
                          onChange={(e) => updateRow(row.id, 'costoTransporte', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotalConTransporte > 0 ? fmtTable(calc.vrTotalConTransporte) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.ejecutado}
                          onChange={(e) => updateRow(row.id, 'ejecutado', e.target.value)}
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
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.cantBodega}
                          onChange={(e) => updateTravelRow(i, 'cantBodega', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.costoTransporte}
                          onChange={(e) => updateTravelRow(i, 'costoTransporte', e.target.value)}
                          disabled={isReadOnly}
                          className="h-6 text-[16px] text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent disabled:opacity-100 disabled:cursor-default"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotalConTransporte > 0 ? fmtTable(calc.vrTotalConTransporte) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.ejecutado}
                          onChange={(e) => updateTravelRow(i, 'ejecutado', e.target.value)}
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
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Valor Mínimo de los Excedentes
                </p>
                <Input
                  type="number"
                  min="0"
                  value={valorMinimoExcedentes}
                  onChange={(e) => setValorMinimoExcedentes(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="0"
                  className="text-[16px] text-right max-w-[180px] disabled:opacity-80 disabled:cursor-default"
                />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 uppercase tracking-wide">
                  Valor Actual de Excedentes
                </p>
                <Input
                  type="number"
                  min="0"
                  value={valorActualExcedentes}
                  onChange={(e) => setValorActualExcedentes(e.target.value)}
                  disabled={isReadOnly}
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
                      <Input type="number" min="0" value={valorFacturado} onChange={(e) => setValorFacturado(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <Input type="number" min="0" value={valorFacturadoEj} onChange={(e) => setValorFacturadoEj(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
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
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">TOTAL A PAGAR ORDEN $</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{totals.totalAPagar !== 0 ? fmt(totals.totalAPagar) : '-'}</td>
                    <td className="py-1.5 text-right font-medium">{totals.totalAPagarEj !== 0 ? fmt(totals.totalAPagarEj) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">SALDO</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{totals.saldo !== 0 ? fmt(totals.saldo) : '-'}</td>
                    <td className="py-1.5 text-right font-medium">{totals.saldoEj !== 0 ? fmt(totals.saldoEj) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">OTROS COSTOS</td>
                    <td className="py-1 pr-3">
                      <Input type="number" min="0" value={otrosCostos} onChange={(e) => setOtrosCostos(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <Input type="number" min="0" value={otrosCostosEj} onChange={(e) => setOtrosCostosEj(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
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
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">FACTOR</td>
                    <td className="py-1 pr-3">
                      <Input type="number" value={leg} onChange={(e) => setLeg(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
                    </td>
                    <td className="py-1">
                      <Input type="number" value={legEj} onChange={(e) => setLegEj(e.target.value)} placeholder="0" disabled={isReadOnly} className="h-7 text-[16px] text-right" />
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
