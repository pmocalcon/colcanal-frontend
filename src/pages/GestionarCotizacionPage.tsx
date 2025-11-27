import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRequisitionQuotation,
  manageQuotation,
  type RequisitionWithQuotations,
  type ItemQuotationDto,
  type SupplierQuotationDto,
} from '@/services/quotation.service';
import { suppliersService, type Supplier } from '@/services/suppliers.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Home, Save, X, Search, ArrowLeft, Copy } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateShort } from '@/utils/dateUtils';

// Estados que NO permiten edición
const NON_EDITABLE_STATUSES = ['en_orden_compra', 'pendiente_recepcion'];

interface ItemQuotationState {
  itemId: number;
  action: 'cotizar' | 'no_requiere' | '';
  suppliers: Array<{
    supplier: Supplier | null;
    supplierOrder: number;
    observations: string;
  }>;
  justification: string;
  searchQuery1: string;
  searchQuery2: string;
  searchResults1: Supplier[];
  searchResults2: Supplier[];
  showResults1: boolean;
  showResults2: boolean;
}

export default function GestionarCotizacionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const { user } = useAuth();

  // Determinar la ruta de retorno basada en la URL actual
  const backPath = location.pathname.includes('/ordenes/')
    ? '/dashboard/compras/ordenes'
    : '/dashboard/compras/cotizaciones';

  const [requisition, setRequisition] = useState<RequisitionWithQuotations | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemStates, setItemStates] = useState<Record<number, ItemQuotationState>>({});

  // Check if user is Compras
  const isCompras = user?.nombreRol === 'Compras';

  useEffect(() => {
    if (!isCompras) {
      navigate('/dashboard');
      return;
    }
    if (!requisitionId) {
      navigate(backPath);
      return;
    }
    loadRequisition();
  }, [requisitionId, isCompras, backPath]);

  const loadRequisition = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRequisitionQuotation(Number(requisitionId));
      setRequisition(data);

      // Initialize item states
      const states: Record<number, ItemQuotationState> = {};
      data.items.forEach((item) => {
        const existingQuotations = item.quotations || [];

        // Check if already has quotations
        if (existingQuotations.length > 0) {
          const hasSuppliers = existingQuotations.some(q => q.supplier);

          states[item.itemId] = {
            itemId: item.itemId,
            action: hasSuppliers ? 'cotizar' : 'no_requiere',
            suppliers: hasSuppliers
              ? existingQuotations
                  .filter(q => q.supplier)
                  .sort((a, b) => a.supplierOrder - b.supplierOrder)
                  .map(q => ({
                    supplier: q.supplier,
                    supplierOrder: q.supplierOrder,
                    observations: q.observations || '',
                  }))
              : [
                  { supplier: null, supplierOrder: 1, observations: '' },
                  { supplier: null, supplierOrder: 2, observations: '' },
                ],
            justification: existingQuotations.find(q => q.justification)?.justification || '',
            searchQuery1: '',
            searchQuery2: '',
            searchResults1: [],
            searchResults2: [],
            showResults1: false,
            showResults2: false,
          };
        } else {
          // No quotations yet
          states[item.itemId] = {
            itemId: item.itemId,
            action: '',
            suppliers: [
              { supplier: null, supplierOrder: 1, observations: '' },
              { supplier: null, supplierOrder: 2, observations: '' },
            ],
            justification: '',
            searchQuery1: '',
            searchQuery2: '',
            searchResults1: [],
            searchResults2: [],
            showResults1: false,
            showResults2: false,
          };
        }
      });

      setItemStates(states);
    } catch (err) {
      console.error('Error loading requisition:', err);
      setError('Error al cargar la requisición');
    } finally {
      setLoading(false);
    }
  };

  const handleActionChange = (itemId: number, action: 'cotizar' | 'no_requiere') => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        action,
        // Reset fields when changing action
        suppliers: action === 'cotizar'
          ? [
              { supplier: null, supplierOrder: 1, observations: '' },
              { supplier: null, supplierOrder: 2, observations: '' },
            ]
          : prev[itemId].suppliers,
        justification: action === 'no_requiere' ? prev[itemId].justification : '',
      },
    }));
  };

  const handleSupplierSearch = async (itemId: number, order: 1 | 2, query: string) => {
    const searchKey = order === 1 ? 'searchQuery1' : 'searchQuery2';
    const resultsKey = order === 1 ? 'searchResults1' : 'searchResults2';
    const showKey = order === 1 ? 'showResults1' : 'showResults2';

    setItemStates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [searchKey]: query,
        [showKey]: query.length > 0,
      },
    }));

    if (query.length < 2) {
      setItemStates(prev => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          [resultsKey]: [],
        },
      }));
      return;
    }

    try {
      const results = await suppliersService.search(query);
      setItemStates(prev => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          [resultsKey]: results,
        },
      }));
    } catch (err) {
      console.error('Error searching suppliers:', err);
    }
  };

  const handleSupplierSelect = (itemId: number, order: 1 | 2, supplier: Supplier) => {
    const supplierIndex = order - 1;
    const searchKey = order === 1 ? 'searchQuery1' : 'searchQuery2';
    const showKey = order === 1 ? 'showResults1' : 'showResults2';

    setItemStates(prev => {
      const newSuppliers = [...prev[itemId].suppliers];
      newSuppliers[supplierIndex] = {
        ...newSuppliers[supplierIndex],
        supplier,
        supplierOrder: order,
      };

      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          suppliers: newSuppliers,
          [searchKey]: '',
          [showKey]: false,
        },
      };
    });
  };

  const handleRemoveSupplier = (itemId: number, order: 1 | 2) => {
    const supplierIndex = order - 1;
    setItemStates(prev => {
      const newSuppliers = [...prev[itemId].suppliers];
      newSuppliers[supplierIndex] = {
        supplier: null,
        supplierOrder: order,
        observations: '',
      };

      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          suppliers: newSuppliers,
        },
      };
    });
  };

  const handleApplySupplierToAll = (sourceItemId: number, order: 1 | 2) => {
    const sourceState = itemStates[sourceItemId];
    if (!sourceState) return;

    const supplierIndex = order - 1;
    const supplierToCopy = sourceState.suppliers[supplierIndex];

    if (!supplierToCopy?.supplier) return;

    // Apply to all items that have action = 'cotizar'
    setItemStates(prev => {
      const updated = { ...prev };

      Object.keys(updated).forEach(itemIdStr => {
        const itemId = Number(itemIdStr);
        // Don't apply to the source item itself
        if (itemId === sourceItemId) return;

        const state = updated[itemId];
        // Only apply to items with 'cotizar' action
        if (state.action === 'cotizar') {
          const newSuppliers = [...state.suppliers];
          newSuppliers[supplierIndex] = {
            supplier: supplierToCopy.supplier,
            supplierOrder: order,
            observations: supplierToCopy.observations || '',
          };

          updated[itemId] = {
            ...state,
            suppliers: newSuppliers,
          };
        }
      });

      return updated;
    });
  };

  const handleObservationsChange = (itemId: number, order: 1 | 2, observations: string) => {
    const supplierIndex = order - 1;
    setItemStates(prev => {
      const newSuppliers = [...prev[itemId].suppliers];
      newSuppliers[supplierIndex] = {
        ...newSuppliers[supplierIndex],
        observations,
      };

      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          suppliers: newSuppliers,
        },
      };
    });
  };

  const handleJustificationChange = (itemId: number, justification: string) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        justification,
      },
    }));
  };

  const calculateProgress = () => {
    const total = Object.keys(itemStates).length;
    const completed = Object.values(itemStates).filter(state => {
      if (!state.action) return false;
      if (state.action === 'cotizar') {
        // At least one supplier must be selected
        return state.suppliers.some(s => s.supplier !== null);
      }
      if (state.action === 'no_requiere') {
        // Justification must be provided
        return state.justification.trim().length > 0;
      }
      return false;
    }).length;

    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const validateForm = (): string | null => {
    for (const [itemId, state] of Object.entries(itemStates)) {
      if (!state.action) {
        return `Debe seleccionar una acción para todos los ítems`;
      }

      if (state.action === 'cotizar') {
        const hasSuppliers = state.suppliers.some(s => s.supplier !== null);
        if (!hasSuppliers) {
          return `Debe seleccionar al menos un proveedor para los ítems marcados como "Cotizar"`;
        }
      }

      if (state.action === 'no_requiere') {
        if (!state.justification.trim()) {
          return `Debe proporcionar una justificación para los ítems marcados como "No Requiere Cotización"`;
        }
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Build the DTO
      const items: ItemQuotationDto[] = Object.values(itemStates).map(state => {
        const item: ItemQuotationDto = {
          itemId: state.itemId,
          action: state.action as 'cotizar' | 'no_requiere',
        };

        if (state.action === 'cotizar') {
          const suppliers: SupplierQuotationDto[] = state.suppliers
            .filter(s => s.supplier !== null)
            .map(s => ({
              supplierId: s.supplier!.supplierId,
              supplierOrder: s.supplierOrder,
              observations: s.observations || undefined,
            }));

          item.suppliers = suppliers;
        }

        if (state.action === 'no_requiere') {
          item.justification = state.justification;
        }

        return item;
      });

      await manageQuotation(Number(requisitionId), { items });

      alert('Cotizaciones guardadas exitosamente');
      navigate(backPath);
    } catch (err: any) {
      console.error('Error saving quotations:', err);
      setError(err.response?.data?.message || 'Error al guardar las cotizaciones');
    } finally {
      setSaving(false);
    }
  };

  const isEditable = () => {
    if (!requisition) return false;

    // Si ya tiene órdenes de compra creadas, NO se puede editar
    if (requisition.purchaseOrders && requisition.purchaseOrders.length > 0) {
      return false;
    }

    // Si no tiene OCs, verificar el estado de la requisición
    return !NON_EDITABLE_STATUSES.includes(requisition.status.code);
  };

  if (!isCompras) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--canalco-primary))]"></div>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando requisición...</p>
        </div>
      </div>
    );
  }

  if (error || !requisition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Error al cargar</p>
          <p className="text-[hsl(var(--canalco-neutral-600))] text-sm mb-4">{error}</p>
          <Button onClick={loadRequisition} className="bg-[hsl(var(--canalco-primary))]">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const progress = calculateProgress();
  const editable = isEditable();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-[hsl(var(--canalco-neutral-300))]">
        <div className="mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Back button */}
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
                onClick={() => navigate(backPath)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title={backPath.includes('/ordenes') ? 'Volver a Órdenes de Compra' : 'Volver a Cotizaciones'}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                {editable ? 'Gestión de Cotizaciones' : 'Detalle de Cotizaciones'}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisición {requisition.requisitionNumber}
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Requisition Info */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-[hsl(var(--canalco-neutral-200))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4 border-b border-[hsl(var(--canalco-neutral-200))] pb-2">
            Información de la Requisición
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Número de Requisición
              </p>
              <p className="text-sm font-semibold text-[hsl(var(--canalco-primary))]">
                {requisition.requisitionNumber}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Fecha
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {formatDateShort(requisition.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Solicitado por
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.creator?.nombre || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Empresa *
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.company?.name || '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Proyecto
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.project?.name || 'No aplica'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Centro de operación
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.operationCenter?.code || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Código de proyecto
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.projectCode?.code || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Obra
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.obra || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Código de obra
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.codigoObra || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Estado
              </p>
              <Badge variant="outline" className="bg-cyan-500/10 text-cyan-700 border-cyan-500/20">
                {requisition.status.name}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Total de Ítems
              </p>
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                {requisition.items.length}
              </p>
            </div>
          </div>

          {/* Firmas de Aprobación */}
          <div className="mt-6 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
            <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-4">
              Firmas de Aprobación
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Solicitado por */}
              <div className="border-l-4 border-[hsl(var(--canalco-primary))] pl-3">
                <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] mb-1">
                  Solicitado por
                </p>
                <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.creator?.nombre || 'N/A'}
                </p>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  {requisition.creator?.cargo || 'Sin cargo'}
                </p>
              </div>

              {/* Revisado por */}
              {(() => {
                const reviewLog = requisition.logs?.find(
                  (log) => log.action?.startsWith('revisar_')
                );
                return reviewLog ? (
                  <div className="border-l-4 border-blue-500 pl-3">
                    <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] mb-1">
                      Revisado por
                    </p>
                    <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {reviewLog.user.nombre}
                    </p>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                      {reviewLog.user.cargo || 'Sin cargo'}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Autorizado por */}
              {(() => {
                const authorizeLog = requisition.logs?.find(
                  (log) => log.action === 'autorizar_aprobar' || log.newStatus === 'autorizado'
                );
                return authorizeLog ? (
                  <div className="border-l-4 border-amber-500 pl-3">
                    <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] mb-1">
                      Autorizado por
                    </p>
                    <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {authorizeLog.user.nombre}
                    </p>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                      {authorizeLog.user.cargo || 'Sin cargo'}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Aprobado por (Gerencia) */}
              {(() => {
                const approveLog = requisition.logs?.find(
                  (log) => log.action === 'aprobar_gerencia' || log.newStatus === 'aprobada_gerencia'
                );
                return approveLog ? (
                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] mb-1">
                      Aprobado por
                    </p>
                    <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {approveLog.user.nombre}
                    </p>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                      {approveLog.user.cargo || 'Sin cargo'}
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-[hsl(var(--canalco-neutral-200))]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
              Progreso de Cotización
            </p>
            <p className="text-sm font-semibold text-[hsl(var(--canalco-primary))]">
              {progress.completed} de {progress.total} ítems procesados ({progress.percentage}%)
            </p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-[hsl(var(--canalco-primary))] h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-[hsl(var(--canalco-neutral-200))]">
          <Table>
            <TableHeader className="bg-[hsl(var(--canalco-primary))]/5">
              <TableRow>
                <TableHead className="font-semibold text-[hsl(var(--canalco-neutral-700))] w-12">
                  #
                </TableHead>
                <TableHead className="font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Material
                </TableHead>
                <TableHead className="font-semibold text-[hsl(var(--canalco-neutral-700))] w-24">
                  Cantidad
                </TableHead>
                <TableHead className="font-semibold text-[hsl(var(--canalco-neutral-700))] w-48">
                  Acción
                </TableHead>
                <TableHead className="font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Proveedores / Justificación
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requisition.items.map((item, index) => {
                const state = itemStates[item.itemId];
                if (!state) return null;

                return (
                  <TableRow key={item.itemId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {item.material?.code || 'N/A'}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {item.material?.description || item.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{item.quantity}</p>
                      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                        {item.unit}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={state.action}
                        onValueChange={(value) =>
                          handleActionChange(item.itemId, value as 'cotizar' | 'no_requiere')
                        }
                        disabled={!editable}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar acción" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cotizar">Cotizar</SelectItem>
                          <SelectItem value="no_requiere">No Requiere Cotización</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {state.action === 'cotizar' && (
                        <div className="space-y-4">
                          {/* Proveedor 1 */}
                          <div className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-3">
                            <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                              Proveedor 1º (Prioritario)
                            </p>
                            {state.suppliers[0]?.supplier ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between bg-green-50 p-2 rounded">
                                  <div>
                                    <p className="font-medium text-sm text-[hsl(var(--canalco-neutral-900))]">
                                      {state.suppliers[0].supplier.name}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                      NIT: {state.suppliers[0].supplier.nitCc}
                                    </p>
                                  </div>
                                  {editable && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveSupplier(item.itemId, 1)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                                <Input
                                  placeholder="Observaciones (opcional)"
                                  value={state.suppliers[0].observations}
                                  onChange={(e) =>
                                    handleObservationsChange(item.itemId, 1, e.target.value)
                                  }
                                  disabled={!editable}
                                  className="text-sm"
                                />
                                {/* Apply to All button - Only show on first item if there are multiple items */}
                                {editable && index === 0 && requisition && requisition.items.length > 1 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleApplySupplierToAll(item.itemId, 1)}
                                    className="w-full mt-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Aplicar este proveedor a todos los elementos
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="flex items-center">
                                  <Search className="absolute left-3 w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                                  <Input
                                    placeholder="Buscar proveedor..."
                                    value={state.searchQuery1}
                                    onChange={(e) =>
                                      handleSupplierSearch(item.itemId, 1, e.target.value)
                                    }
                                    disabled={!editable}
                                    className="pl-10 text-sm"
                                  />
                                </div>
                                {state.showResults1 && state.searchResults1.length > 0 && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {state.searchResults1.map((supplier) => (
                                      <button
                                        key={supplier.supplierId}
                                        onClick={() =>
                                          handleSupplierSelect(item.itemId, 1, supplier)
                                        }
                                        className="w-full text-left px-3 py-2 hover:bg-[hsl(var(--canalco-neutral-100))] border-b last:border-b-0"
                                      >
                                        <p className="font-medium text-sm text-[hsl(var(--canalco-neutral-900))]">
                                          {supplier.name}
                                        </p>
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                          NIT: {supplier.nitCc}
                                        </p>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Proveedor 2 */}
                          <div className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg p-3">
                            <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                              Proveedor 2º (Opcional)
                            </p>
                            {state.suppliers[1]?.supplier ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between bg-blue-50 p-2 rounded">
                                  <div>
                                    <p className="font-medium text-sm text-[hsl(var(--canalco-neutral-900))]">
                                      {state.suppliers[1].supplier.name}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                      NIT: {state.suppliers[1].supplier.nitCc}
                                    </p>
                                  </div>
                                  {editable && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveSupplier(item.itemId, 2)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                                <Input
                                  placeholder="Observaciones (opcional)"
                                  value={state.suppliers[1].observations}
                                  onChange={(e) =>
                                    handleObservationsChange(item.itemId, 2, e.target.value)
                                  }
                                  disabled={!editable}
                                  className="text-sm"
                                />
                                {/* Apply to All button for second supplier - Only show on first item if there are multiple items */}
                                {editable && index === 0 && requisition && requisition.items.length > 1 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleApplySupplierToAll(item.itemId, 2)}
                                    className="w-full mt-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Aplicar este proveedor a todos los elementos
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="flex items-center">
                                  <Search className="absolute left-3 w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                                  <Input
                                    placeholder="Buscar proveedor..."
                                    value={state.searchQuery2}
                                    onChange={(e) =>
                                      handleSupplierSearch(item.itemId, 2, e.target.value)
                                    }
                                    disabled={!editable}
                                    className="pl-10 text-sm"
                                  />
                                </div>
                                {state.showResults2 && state.searchResults2.length > 0 && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {state.searchResults2.map((supplier) => (
                                      <button
                                        key={supplier.supplierId}
                                        onClick={() =>
                                          handleSupplierSelect(item.itemId, 2, supplier)
                                        }
                                        className="w-full text-left px-3 py-2 hover:bg-[hsl(var(--canalco-neutral-100))] border-b last:border-b-0"
                                      >
                                        <p className="font-medium text-sm text-[hsl(var(--canalco-neutral-900))]">
                                          {supplier.name}
                                        </p>
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                          NIT: {supplier.nitCc}
                                        </p>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {state.action === 'no_requiere' && (
                        <div>
                          <textarea
                            placeholder="Justificación (requerida)"
                            value={state.justification}
                            onChange={(e) =>
                              handleJustificationChange(item.itemId, e.target.value)
                            }
                            disabled={!editable}
                            rows={3}
                            className="w-full px-3 py-2 border border-[hsl(var(--canalco-neutral-300))] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))] disabled:bg-gray-100"
                          />
                        </div>
                      )}

                      {!state.action && (
                        <p className="text-sm text-[hsl(var(--canalco-neutral-500))] italic">
                          Seleccione una acción
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate(backPath)}
            className="border-[hsl(var(--canalco-neutral-300))]"
          >
            {editable ? 'Cancelar' : 'Volver'}
          </Button>
          {editable && (
            <Button
              onClick={handleSave}
              disabled={saving || progress.completed !== progress.total}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cotizaciones
                </>
              )}
            </Button>
          )}
        </div>

        {!editable && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            {requisition.purchaseOrders && requisition.purchaseOrders.length > 0 ? (
              <div>
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Modo solo lectura:</strong> Las cotizaciones no se pueden modificar porque ya se han creado {requisition.purchaseOrders.length} orden{requisition.purchaseOrders.length > 1 ? 'es' : ''} de compra.
                </p>
                <div className="text-xs text-blue-700 mt-2 space-y-1">
                  <p className="font-semibold">Órdenes de compra asociadas:</p>
                  {requisition.purchaseOrders.map((po) => (
                    <div key={po.purchaseOrderId} className="ml-4">
                      • {po.purchaseOrderNumber} - {po.approvalStatus.description} (${po.totalAmount.toLocaleString('es-CO', { minimumFractionDigits: 2 })})
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-800">
                <strong>Modo solo lectura:</strong> Esta requisición se encuentra en estado{' '}
                <strong>{requisition.status.name}</strong> y ya no puede ser editada.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
