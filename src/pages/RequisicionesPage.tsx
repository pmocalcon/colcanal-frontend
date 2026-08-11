import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { requisitionsService } from '@/services/requisitions.service';
import { modulesService } from '@/services/modules.service';
import { masterDataService, type Company, type Project } from '@/services/master-data.service';
import type { Requisition, FilterRequisitionsParams, PendingVoidRequest } from '@/services/requisitions.service';
import type { ModulePermissions } from '@/services/modules.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Menu, Eye, Edit, AlertCircle, Plus, Lock, ArrowLeft, CheckCircle, Ban, XCircle, Clock } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatDateShort } from '@/utils/dateUtils';
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';

// Mapeo de estados a colores (17 estados según backend)
const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  pendiente_validacion: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  en_revision: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  aprobada_revisor: 'bg-green-500/10 text-green-700 border-green-500/20',
  pendiente_autorizacion: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  autorizado: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
  aprobada_gerencia: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  en_cotizacion: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  rechazada_validador: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  rechazada_revisor: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  rechazada_autorizador: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  rechazada_gerencia: 'bg-red-500/10 text-red-700 border-red-500/20',
  cotizada: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  en_orden_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  pendiente_recepcion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  en_recepcion: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
  recepcion_completa: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
  pendiente_anulacion: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  anulada: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

// Estados que permiten edición
const EDITABLE_STATUSES = ['pendiente', 'pendiente_validacion', 'rechazada_validador', 'rechazada_revisor', 'rechazada_autorizador', 'rechazada_gerencia'];

export default function RequisicionesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Permisos del módulo de compras
  const [permissions, setPermissions] = useState<ModulePermissions | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 200; // Traer todas las requisiciones propias para que la división activas/procesadas no corte resultados

  // Paginación para sección de procesadas (10 por página)
  const [processedPage, setProcessedPage] = useState(1);
  const processedLimit = 10;

  // Selección para anulación (solo PMO)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidMotivo, setVoidMotivo] = useState('');

  // Bandeja de solicitudes de anulación (Directora Financiera)
  const [pendingVoids, setPendingVoids] = useState<PendingVoidRequest[]>([]);
  const [pendingVoidsLoading, setPendingVoidsLoading] = useState(false);
  const [reviewingVoid, setReviewingVoid] = useState<number | null>(null);
  const [voidRejectDialog, setVoidRejectDialog] = useState<{ requisitionId: number; requisitionNumber: string } | null>(null);
  const [voidRejectMotivo, setVoidRejectMotivo] = useState('');

  // Filters state
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Available statuses for the filter dropdown (17 estados según backend)
  const availableStatuses = [
    { code: 'pendiente', name: 'Pendiente' },
    { code: 'pendiente_validacion', name: 'Pendiente de validación' },
    { code: 'en_revision', name: 'En revisión' },
    { code: 'aprobada_revisor', name: 'Aprobada por revisor' },
    { code: 'pendiente_autorizacion', name: 'Pendiente de autorización' },
    { code: 'autorizado', name: 'Autorizado' },
    { code: 'aprobada_gerencia', name: 'Aprobada por gerencia' },
    { code: 'en_cotizacion', name: 'En cotización' },
    { code: 'rechazada_validador', name: 'Rechazada por validador' },
    { code: 'rechazada_revisor', name: 'Rechazada por revisor' },
    { code: 'rechazada_autorizador', name: 'Rechazada por autorizador' },
    { code: 'rechazada_gerencia', name: 'Rechazada por gerencia' },
    { code: 'cotizada', name: 'Cotizada' },
    { code: 'en_orden_compra', name: 'En orden de compra' },
    { code: 'pendiente_recepcion', name: 'Pendiente de recepción' },
    { code: 'en_recepcion', name: 'En recepción' },
    { code: 'recepcion_completa', name: 'Recepción completa' },
  ];

  // Empresas y proyectos para los filtros
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [companies, projects] = await Promise.all([
          masterDataService.getCompanies(),
          masterDataService.getProjects(),
        ]);
        setAvailableCompanies(companies);
        setAvailableProjects(projects);
      } catch (err) {
        console.error('Error loading companies/projects:', err);
      }
    };
    loadMasterData();
  }, []);

  // Proyectos visibles según la empresa seleccionada
  const visibleProjects = filters.company && filters.company !== 'all'
    ? availableProjects.filter((p) => p.companyId === Number(filters.company))
    : availableProjects;

  // Permisos dinámicos desde el backend
  const canCreateRequisitions = permissions?.crear ?? false;

  // Cargar permisos del módulo al montar
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const modules = await modulesService.getUserModules();
        const comprasModule = modules.find(m => m.slug === 'compras');
        if (comprasModule?.permisos) {
          setPermissions(comprasModule.permisos);
        }
      } catch (err) {
        console.error('Error loading permissions:', err);
      }
    };
    loadPermissions();
  }, []);

  useEffect(() => {
    loadRequisitions();
  }, [page, filters]);

  // Roles que pueden ver TODAS las requisiciones y anularlas.
  // Incluye Compras (Coordinadora de Compras) además de los roles PMO.
  const isPmoRole = user?.nombreRol
    ? ['analista pmo', 'director pmo', 'compras'].includes(user.nombreRol.toLowerCase())
    : false;
  // El rol Compras solicita la anulación (no anula directo); la Directora Financiera la aprueba.
  const isComprasRole = user?.nombreRol?.toLowerCase() === 'compras';
  const canReviewVoid =
    user?.nombreRol === 'Director Financiero y Administrativo' || user?.nombreRol === 'Analista PMO';

  const loadRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: FilterRequisitionsParams = {
        page,
        limit,
        status: filters.status && filters.status !== 'all' ? filters.status : undefined,
        fromDate: filters.startDate || undefined,
        toDate: filters.endDate || undefined,
        companyId: filters.company && filters.company !== 'all' ? Number(filters.company) : undefined,
        projectId: filters.project && filters.project !== 'all' ? Number(filters.project) : undefined,
        search: filters.requisitionNumber?.trim() || undefined,
      };

      const response = isPmoRole
        ? await requisitionsService.getAllRequisitions(params)
        : await requisitionsService.getMyRequisitions(params);

      setRequisitions(response.data);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      console.error('Error loading requisitions:', err);
      setError('Error al cargar las requisiciones');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handleView = (requisition: Requisition) => {
    navigate(`/dashboard/compras/requisiciones/detalle/${requisition.requisitionId}`);
  };

  const handleEdit = (requisition: Requisition) => {
    const canEdit = EDITABLE_STATUSES.includes(requisition.status.code);
    if (!canEdit) {
      alert('Esta requisición ya fue aprobada y no puede ser modificada.');
      return;
    }
    // Navegar a página de edición
    navigate(`/dashboard/compras/requisiciones/editar/${requisition.requisitionId}`);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleVoid = () => {
    if (selectedIds.size === 0) return;
    setVoidMotivo('');
    setVoidDialogOpen(true);
  };

  const confirmVoid = async () => {
    if (selectedIds.size === 0 || !voidMotivo.trim()) return;
    setVoidLoading(true);
    try {
      const result = await requisitionsService.voidRequisitions(Array.from(selectedIds), voidMotivo.trim());
      setSelectedIds(new Set());
      setVoidDialogOpen(false);
      setVoidMotivo('');
      await loadRequisitions();
      const requestedCount = result.requested?.length ?? 0;
      if (requestedCount > 0) {
        toast.success(`Solicitud de anulación enviada (${requestedCount}). La Directora Financiera debe aprobarla.`);
      } else if (result.voided.length > 0) {
        toast.success(`Anuladas: ${result.voided.length}.`);
      }
      if (result.errors.length > 0) {
        toast.error(`Errores: ${result.errors.map(e => `ID ${e.id}: ${e.reason}`).join(', ')}`);
      }
    } catch {
      toast.error('Error al anular las requisiciones');
    } finally {
      setVoidLoading(false);
    }
  };

  const loadPendingVoids = async () => {
    try {
      setPendingVoidsLoading(true);
      setPendingVoids(await requisitionsService.getPendingVoidRequests());
    } catch {
      setPendingVoids([]);
    } finally {
      setPendingVoidsLoading(false);
    }
  };

  useEffect(() => {
    if (canReviewVoid) loadPendingVoids();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReviewVoid]);

  const handleApproveVoid = async (requisitionId: number) => {
    try {
      setReviewingVoid(requisitionId);
      await requisitionsService.reviewVoidRequest(requisitionId, 'aprobado');
      setPendingVoids((prev) => prev.filter((v) => v.requisitionId !== requisitionId));
      toast.success('Anulación aprobada. Se notificó al solicitante.');
      await loadRequisitions();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al aprobar la anulación');
    } finally {
      setReviewingVoid(null);
    }
  };

  const handleRejectVoid = async () => {
    if (!voidRejectDialog || !voidRejectMotivo.trim()) return;
    const { requisitionId } = voidRejectDialog;
    try {
      setReviewingVoid(requisitionId);
      await requisitionsService.reviewVoidRequest(requisitionId, 'rechazado', voidRejectMotivo.trim());
      setPendingVoids((prev) => prev.filter((v) => v.requisitionId !== requisitionId));
      toast.success('Solicitud de anulación rechazada. Se notificó al solicitante.');
      setVoidRejectDialog(null);
      setVoidRejectMotivo('');
      await loadRequisitions();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al rechazar la anulación');
    } finally {
      setReviewingVoid(null);
    }
  };

  const handleCreateNew = () => {
    if (!canCreateRequisitions) {
      alert('Su rol no tiene permisos para crear requisiciones.');
      return;
    }
    // Navigate to create view
    navigate('/dashboard/compras/requisiciones/crear');
  };

  const getStatusLabel = (code: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      pendiente_validacion: 'Pendiente de validación',
      en_revision: 'En revisión',
      aprobada_revisor: 'Aprobada por revisor',
      pendiente_autorizacion: 'Pendiente de autorización',
      autorizado: 'Autorizado',
      aprobada_gerencia: 'Aprobada por gerencia',
      en_cotizacion: 'En cotización',
      rechazada_validador: 'Rechazada por validador',
      rechazada_revisor: 'Rechazada por revisor',
      rechazada_autorizador: 'Rechazada por autorizador',
      rechazada_gerencia: 'Rechazada por gerencia',
      cotizada: 'Cotizada',
      en_orden_compra: 'En orden de compra',
      pendiente_recepcion: 'Pendiente de recepción',
      en_recepcion: 'En recepción',
      recepcion_completa: 'Recepción completa',
      pendiente_anulacion: 'Pendiente de anulación',
      anulada: 'Anulada',
    };
    return labels[code] || code;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo 1 - Canales Contactos */}
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>


              {/* Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>

              {/* Back Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/compras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Compras"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Gestión de Compras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisiciones de Compra
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Sidebar (Mobile drawer / Desktop sidebar) */}
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
              Módulo de Compras
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start bg-[hsl(var(--canalco-primary))]/10"
                onClick={() => {
                  setSidebarOpen(false);
                }}
              >
                Requisiciones
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => alert('Revisión próximamente')}
              >
                Revisión
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => alert('Aprobación próximamente')}
              >
                Aprobación
              </Button>
              {user?.nombreRol === 'Compras' && (
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/dashboard/compras/cotizaciones');
                    setSidebarOpen(false);
                  }}
                >
                  Cotizaciones
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => alert('Órdenes de Compra próximamente')}
              >
                Órdenes de Compra
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => alert('Recepciones próximamente')}
              >
                Recepciones
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Action Button - Always visible but disabled if no permissions */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleCreateNew}
            className={`shadow-lg transition-all ${
              canCreateRequisitions
                ? 'bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white cursor-pointer'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60 hover:bg-gray-400'
            }`}
            size="lg"
            title={
              !canCreateRequisitions
                ? 'Su rol no tiene permisos para crear requisiciones'
                : 'Crear nueva requisición'
            }
          >
            {canCreateRequisitions ? (
              <Plus className="w-5 h-5 mr-2" />
            ) : (
              <Lock className="w-5 h-5 mr-2" />
            )}
            Crear nueva requisición
          </Button>

          {isPmoRole && selectedIds.size > 0 && (
            <Button
              onClick={handleVoid}
              disabled={voidLoading}
              className="bg-red-600 hover:bg-red-700 text-white shadow-lg"
              size="lg"
            >
              <Ban className="w-5 h-5 mr-2" />
              {voidLoading
                ? (isComprasRole ? 'Enviando...' : 'Anulando...')
                : isComprasRole
                  ? `Solicitar anulación (${selectedIds.size})`
                  : `Anular seleccionadas (${selectedIds.size})`}
            </Button>
          )}
        </div>

        {/* Solicitudes de anulación pendientes — Directora Financiera */}
        {canReviewVoid && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-orange-100 border-b border-orange-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="font-semibold text-orange-800 text-sm">Solicitudes de anulación pendientes</span>
              {!pendingVoidsLoading && pendingVoids.length > 0 && (
                <Badge className="ml-1 bg-orange-500 text-white hover:bg-orange-500 text-xs">{pendingVoids.length}</Badge>
              )}
            </div>
            {pendingVoidsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : pendingVoids.length === 0 ? (
              <p className="px-4 py-3 text-sm text-orange-600 italic">Sin solicitudes de anulación pendientes.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-200">
                    <th className="px-4 py-2 text-left font-medium text-orange-700">N° Requisición</th>
                    <th className="px-4 py-2 text-left font-medium text-orange-700">Empresa / Proyecto</th>
                    <th className="px-4 py-2 text-left font-medium text-orange-700">Solicitó</th>
                    <th className="px-4 py-2 text-left font-medium text-orange-700">Motivo</th>
                    <th className="px-4 py-2 text-right font-medium text-orange-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingVoids.map((v) => {
                    const busy = reviewingVoid === v.requisitionId;
                    return (
                      <tr key={v.requisitionId} className="border-b border-orange-100 hover:bg-orange-100/50 transition-colors">
                        <td className="px-4 py-2 font-mono font-semibold text-orange-900">{v.requisitionNumber}</td>
                        <td className="px-4 py-2 text-orange-700">
                          {v.companyName ?? '-'}{v.projectName ? ` / ${v.projectName}` : ''}
                        </td>
                        <td className="px-4 py-2 text-orange-700">{v.requestedByName ?? '-'}</td>
                        <td className="px-4 py-2 text-orange-700 max-w-[260px]">
                          <span className="line-clamp-2">{v.motivo ?? '-'}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleApproveVoid(v.requisitionId)}
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
                              onClick={() => { setVoidRejectDialog({ requisitionId: v.requisitionId, requisitionNumber: v.requisitionNumber }); setVoidRejectMotivo(''); }}
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

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden shadow-sm">
          <RequisitionFilters
            filters={filters}
            onFiltersChange={handleFilterChange}
            availableStatuses={availableStatuses}
            availableCompanies={availableCompanies}
            availableProjects={visibleProjects}
          />
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
        {!loading && !error && requisitions.length === 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-12 text-center">
            <p className="text-[hsl(var(--canalco-neutral-600))]">
              No tienes requisiciones creadas. Haz clic en "Crear nueva requisición" para comenzar.
            </p>
          </div>
        )}

        {!loading && !error && requisitions.length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            {/* Pending Requisitions Section */}
            {(() => {
              const pendingRequisitions = requisitions.filter(r =>
                ['pendiente', 'pendiente_validacion', 'en_revision', 'aprobada_revisor', 'pendiente_autorizacion', 'autorizado', 'aprobada_gerencia', 'en_cotizacion', 'rechazada_validador', 'rechazada_revisor', 'rechazada_autorizador', 'rechazada_gerencia'].includes(r.status?.code || '')
              ).sort((a, b) => {
                // Urgentes primero
                if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                // Luego por fecha de creación (más recientes primero)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });

              if (pendingRequisitions.length === 0) return null;

              return (
                <div>
                  <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
                    <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      EN PROCESO ({pendingRequisitions.length})
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                          {isPmoRole && <TableHead className="w-10" />}
                          <TableHead className="font-semibold w-[120px]">N° Requisición</TableHead>
                          <TableHead className="font-semibold">Empresa</TableHead>
                          <TableHead className="font-semibold">Proyecto/Obra</TableHead>
                          <TableHead className="font-semibold w-[80px]">Ítems</TableHead>
                          <TableHead className="font-semibold">Solicitado por</TableHead>
                          <TableHead className="font-semibold">Última Actualización</TableHead>
                          <TableHead className="font-semibold">Estado</TableHead>
                          <TableHead className="font-semibold text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequisitions.map((req) => {
                      // Determinar la última acción según el estado
                      const getLastAction = () => {
                        switch (req.status.code) {
                          case 'pendiente':
                            return { label: 'Creada', date: req.createdAt };
                          case 'en_revision':
                            return { label: 'En revisión', date: req.updatedAt };
                          case 'aprobada_revisor':
                            return { label: 'Revisada', date: req.reviewedAt || req.updatedAt };
                          case 'pendiente_autorizacion':
                            return { label: 'Pendiente autorización', date: req.reviewedAt || req.updatedAt };
                          case 'autorizado':
                            return { label: 'Autorizada', date: req.updatedAt };
                          case 'aprobada_gerencia':
                            return { label: 'Aprobada (Gerencia)', date: req.approvedAt || req.updatedAt };
                          case 'en_cotizacion':
                            return { label: 'En cotización', date: req.updatedAt };
                          case 'rechazada_revisor':
                            return { label: 'Rechazada (Revisor)', date: req.reviewedAt || req.updatedAt };
                          case 'rechazada_autorizador':
                            return { label: 'Rechazada (Autorizador)', date: req.updatedAt };
                          case 'rechazada_gerencia':
                            return { label: 'Rechazada (Gerencia)', date: req.approvedAt || req.updatedAt };
                          case 'cotizada':
                            return { label: 'Cotizada', date: req.updatedAt };
                          case 'en_orden_compra':
                            return { label: 'En orden de compra', date: req.updatedAt };
                          case 'pendiente_recepcion':
                            return { label: 'Pendiente de recepción', date: req.updatedAt };
                          case 'en_recepcion':
                            return { label: 'En recepción', date: req.updatedAt };
                          case 'recepcion_completa':
                            return { label: 'Recepción completa', date: req.updatedAt };
                          default:
                            return { label: 'Actualizada', date: req.updatedAt };
                        }
                      };

                      const lastAction = getLastAction();

                      return (
                        <TableRow key={req.requisitionId} className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors">
                          {isPmoRole && (
                            <TableCell className="w-10">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(req.requisitionId)}
                                onChange={() => toggleSelect(req.requisitionId)}
                                className="w-4 h-4 cursor-pointer accent-red-600"
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                            <div className="flex items-center gap-2">
                              {req.requisitionNumber}
                              {req.priority === 'alta' && (
                                <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                                  URGENTE
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                              {req.company?.name || '-'}
                            </p>
                          </TableCell>
                          <TableCell>
                            {req.project ? (
                              <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">{req.project.name}</p>
                            ) : req.obra ? (
                              <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">{req.obra}</p>
                            ) : (
                              <p className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</p>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] font-semibold text-sm">
                              {req.items?.length || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                                {req.creator?.nombre || 'N/A'}
                              </p>
                              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                {req.creator?.role?.nombreRol || 'Sin rol'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                            <div>
                              <p className="font-medium">{lastAction.label}</p>
                              <p className="text-xs">{formatDateShort(lastAction.date)}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className={`${STATUS_COLORS[req.status.code] || 'bg-gray-100'} border`}
                              >
                                {getStatusLabel(req.status.code)}
                              </Badge>
                              {/* Mostrar preview del último comentario de rechazo */}
                              {(req.status.code === 'rechazada_validador' || req.status.code === 'rechazada_revisor' || req.status.code === 'rechazada_autorizador' || req.status.code === 'rechazada_gerencia') && req.logs && req.logs.length > 0 && (() => {
                                const lastRejectionLog = [...req.logs]
                                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                  .find(log => log.comments && (log.action?.includes('rechazar') || log.newStatus?.includes('rechazada')));

                                if (lastRejectionLog?.comments) {
                                  const preview = lastRejectionLog.comments.length > 60
                                    ? lastRejectionLog.comments.substring(0, 60) + '...'
                                    : lastRejectionLog.comments;
                                  return (
                                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1">
                                      <span className="font-semibold">🚫 Motivo: </span>
                                      <span className="italic">{preview}</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleView(req)}
                                className="hover:bg-blue-50"
                                title="Ver detalles"
                              >
                                <Eye className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(req)}
                                className={`hover:bg-orange-50 ${!EDITABLE_STATUSES.includes(req.status.code) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={EDITABLE_STATUSES.includes(req.status.code) ? 'Editar' : 'No se puede editar'}
                                disabled={!EDITABLE_STATUSES.includes(req.status.code)}
                              >
                                <Edit className="w-4 h-4 text-orange-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })()}

            {/* Processed Requisitions Section */}
            {(() => {
              const processedRequisitions = requisitions.filter(r =>
                ['cotizada', 'en_orden_compra', 'pendiente_recepcion', 'en_recepcion', 'recepcion_completa'].includes(r.status?.code || '')
              ).sort((a, b) => {
                // Urgentes primero
                if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                // Luego por fecha de creación (más recientes primero)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });

              if (processedRequisitions.length === 0) return null;

              // Paginación interna: 10 por página
              const totalProcessed = processedRequisitions.length;
              const processedTotalPages = Math.ceil(totalProcessed / processedLimit);
              const processedStartIndex = (processedPage - 1) * processedLimit;
              const processedEndIndex = processedStartIndex + processedLimit;
              const paginatedProcessedRequisitions = processedRequisitions.slice(processedStartIndex, processedEndIndex);

              return (
                <div className={requisitions.filter(r => ['pendiente', 'pendiente_validacion', 'en_revision', 'aprobada_revisor', 'pendiente_autorizacion', 'autorizado', 'aprobada_gerencia', 'en_cotizacion', 'rechazada_validador', 'rechazada_revisor', 'rechazada_autorizador', 'rechazada_gerencia'].includes(r.status?.code || '')).length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                  <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                    <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      YA PROCESADAS ({processedRequisitions.length})
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                          {isPmoRole && <TableHead className="w-10" />}
                          <TableHead className="font-semibold w-[120px]">N° Requisición</TableHead>
                          <TableHead className="font-semibold">Empresa</TableHead>
                          <TableHead className="font-semibold">Proyecto/Obra</TableHead>
                          <TableHead className="font-semibold w-[80px]">Ítems</TableHead>
                          <TableHead className="font-semibold">Solicitado por</TableHead>
                          <TableHead className="font-semibold">Última Actualización</TableHead>
                          <TableHead className="font-semibold">Estado</TableHead>
                          <TableHead className="font-semibold text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProcessedRequisitions.map((req) => {
                          // Determinar la última acción según el estado
                          const getLastAction = () => {
                            switch (req.status.code) {
                              case 'cotizada':
                                return { label: 'Cotizada', date: req.updatedAt };
                              case 'en_orden_compra':
                                return { label: 'En orden de compra', date: req.updatedAt };
                              case 'pendiente_recepcion':
                                return { label: 'Pendiente de recepción', date: req.updatedAt };
                              case 'en_recepcion':
                                return { label: 'En recepción', date: req.updatedAt };
                              case 'recepcion_completa':
                                return { label: 'Recepción completa', date: req.updatedAt };
                              default:
                                return { label: 'Actualizada', date: req.updatedAt };
                            }
                          };

                          const lastAction = getLastAction();

                          return (
                            <TableRow key={req.requisitionId} className="bg-white hover:bg-green-50/30 transition-colors">
                              {isPmoRole && (
                                <TableCell className="w-10">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(req.requisitionId)}
                                    onChange={() => toggleSelect(req.requisitionId)}
                                    className="w-4 h-4 cursor-pointer accent-red-600"
                                  />
                                </TableCell>
                              )}
                              <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                <div className="flex items-center gap-2">
                                  {req.requisitionNumber}
                                  {req.priority === 'alta' && (
                                    <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                                      URGENTE
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="font-medium text-[hsl(var(--canalco-neutral-700))]">
                                  {req.company?.name || '-'}
                                </p>
                              </TableCell>
                              <TableCell>
                                {req.project ? (
                                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">{req.project.name}</p>
                                ) : req.obra ? (
                                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">{req.obra}</p>
                                ) : (
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</p>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-600))] font-semibold text-sm">
                                  {req.items?.length || 0}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                                    {req.creator?.nombre || 'N/A'}
                                  </p>
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                    {req.creator?.role?.nombreRol || 'Sin rol'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                <div>
                                  <p className="font-medium">{lastAction.label}</p>
                                  <p className="text-xs">{formatDateShort(lastAction.date)}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`${STATUS_COLORS[req.status.code] || 'bg-gray-100'} border`}
                                >
                                  {getStatusLabel(req.status.code)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleView(req)}
                                    className="hover:bg-blue-50"
                                    title="Ver detalles"
                                  >
                                    <Eye className="w-4 h-4 text-blue-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(req)}
                                    className="opacity-50 cursor-not-allowed"
                                    title="No se puede editar"
                                    disabled
                                  >
                                    <Edit className="w-4 h-4 text-orange-600" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Paginación de sección procesadas */}
                  {processedTotalPages > 1 && (
                    <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center justify-between bg-green-50/30">
                      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                        Mostrando {processedStartIndex + 1} - {Math.min(processedEndIndex, totalProcessed)} de {totalProcessed} procesadas
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setProcessedPage((p) => Math.max(1, p - 1))}
                          disabled={processedPage === 1}
                          className="h-8 text-xs"
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-[hsl(var(--canalco-neutral-700))]">
                          Página {processedPage} de {processedTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setProcessedPage((p) => Math.min(processedTotalPages, p + 1))}
                          disabled={processedPage === processedTotalPages}
                          className="h-8 text-xs"
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* Diálogo de anulación — motivo obligatorio */}
      <Dialog open={voidDialogOpen} onOpenChange={(open) => { if (!open) { setVoidDialogOpen(false); setVoidMotivo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isComprasRole ? 'Solicitar anulación' : 'Anular'} de {selectedIds.size} requisición(es)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              {isComprasRole
                ? 'La anulación quedará pendiente de aprobación de la Directora Financiera. Indica el motivo.'
                : 'Esta acción no se puede deshacer. Indica el motivo de la anulación.'}
            </p>
            <label className="text-xs font-medium text-foreground block">
              Motivo de la anulación (obligatorio)
            </label>
            <textarea
              autoFocus
              value={voidMotivo}
              onChange={(e) => setVoidMotivo(e.target.value)}
              placeholder="Explica por qué se anula la(s) requisición(es)..."
              className="w-full text-sm border border-input rounded-md p-2 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoidDialogOpen(false); setVoidMotivo(''); }} disabled={voidLoading}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmVoid}
              disabled={voidLoading || !voidMotivo.trim()}
            >
              <Ban className="w-4 h-4 mr-1.5" />
              {isComprasRole
                ? (voidLoading ? 'Enviando...' : 'Solicitar anulación')
                : (voidLoading ? 'Anulando...' : 'Anular')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de rechazo de la solicitud de anulación — motivo obligatorio */}
      <Dialog open={!!voidRejectDialog} onOpenChange={(open) => { if (!open) { setVoidRejectDialog(null); setVoidRejectMotivo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar anulación — {voidRejectDialog?.requisitionNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              La requisición volverá a su estado anterior (no se anulará). Indica el motivo del rechazo.
            </p>
            <label className="text-xs font-medium text-foreground block">
              Motivo del rechazo (obligatorio)
            </label>
            <textarea
              autoFocus
              value={voidRejectMotivo}
              onChange={(e) => setVoidRejectMotivo(e.target.value)}
              placeholder="Explica por qué se rechaza la anulación..."
              className="w-full text-sm border border-input rounded-md p-2 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoidRejectDialog(null); setVoidRejectMotivo(''); }} disabled={reviewingVoid !== null}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRejectVoid}
              disabled={!voidRejectMotivo.trim() || reviewingVoid !== null}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Rechazar anulación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
