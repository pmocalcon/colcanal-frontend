import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { requisitionsService } from '@/services/requisitions.service';
import type { Requisition, FilterRequisitionsParams } from '@/services/requisitions.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Menu, Eye, Edit, AlertCircle, Plus, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort } from '@/utils/dateUtils';
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';

// Mapeo de estados a colores
const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  aprobada_revisor: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  rechazada_revisor: 'bg-red-500/10 text-red-700 border-red-500/20',
  aprobada_gerencia: 'bg-green-500/10 text-green-700 border-green-500/20',
  rechazada_gerencia: 'bg-red-500/10 text-red-700 border-red-500/20',
  cotizada: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  en_orden_compra: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  pendiente_recepcion: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
};

// Estados que permiten edición
const EDITABLE_STATUSES = ['pendiente', 'rechazada_revisor', 'rechazada_gerencia'];

export default function RequisicionesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Paginación para sección de procesadas (10 por página)
  const [processedPage, setProcessedPage] = useState(1);
  const processedLimit = 10;

  // Filters state
  const [filters, setFilters] = useState<FilterValues>({
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    operationCenter: '',
    status: '',
    creatorName: '',
  });

  // Available statuses for the filter dropdown
  const availableStatuses = [
    { code: 'pendiente', name: 'Pendiente' },
    { code: 'aprobada_revisor', name: 'Aprobada por Revisor' },
    { code: 'rechazada_revisor', name: 'Rechazada por Revisor' },
    { code: 'aprobada_gerencia', name: 'Aprobada' },
    { code: 'rechazada_gerencia', name: 'Rechazada por Gerencia' },
    { code: 'cotizada', name: 'Cotizada' },
    { code: 'en_orden_compra', name: 'En Orden de Compra' },
    { code: 'pendiente_recepcion', name: 'Pendiente de Recepción' },
  ];

  // Check user permissions
  // Roles que NO pueden crear requisiciones
  const restrictedRoles = ['Gerencia', 'Compras'];
  const canCreateRequisitions = user ? !restrictedRoles.includes(user.nombreRol) : false;

  useEffect(() => {
    loadRequisitions();
  }, [page, filters]);

  const loadRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Map filter values to API parameters
      const params: FilterRequisitionsParams = {
        page,
        limit,
        status: filters.status && filters.status !== 'all' ? filters.status : undefined,
        fromDate: filters.startDate || undefined,
        toDate: filters.endDate || undefined,
      };

      const response = await requisitionsService.getMyRequisitions(params);
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

  const handleCreateNew = () => {
    if (!canCreateRequisitions) {
      // Show info message for restricted roles
      const message = user?.nombreRol === 'Compras'
        ? 'Su rol (Compras) no tiene permisos para crear requisiciones. Puede gestionar cotizaciones y órdenes de compra.'
        : user?.nombreRol === 'Gerencia'
        ? 'Su rol (Gerencia) no tiene permisos para crear requisiciones. Puede aprobar requisiciones previamente revisadas.'
        : 'Su rol no tiene permisos para crear requisiciones.';
      alert(message);
      return;
    }
    // Navigate to create view
    navigate('/dashboard/compras/requisiciones/crear');
  };

  const getStatusLabel = (code: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      aprobada_revisor: 'Aprobada por Revisor',
      rechazada_revisor: 'Rechazada por Revisor',
      aprobada_gerencia: 'Aprobada',
      rechazada_gerencia: 'Rechazada por Gerencia',
      cotizada: 'Cotizada',
      en_orden_compra: 'En Orden de Compra',
      pendiente_recepcion: 'Pendiente de Recepción',
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

              {/* Home Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>

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

            {/* Right: Logo 2 - Alumbrado Público */}
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                src="/assets/images/logo-alumbrado.png"
                alt="Alumbrado Público"
                className="w-full h-full object-contain"
              />
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
        <div className="mb-6">
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
                ? `Su rol (${user?.nombreRol}) no tiene permisos para crear requisiciones`
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
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden shadow-sm">
          <RequisitionFilters
            filters={filters}
            onFiltersChange={setFilters}
            availableStatuses={availableStatuses}
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
                ['pendiente', 'aprobada_revisor', 'rechazada_revisor', 'rechazada_gerencia'].includes(r.status?.code || '')
              );

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
                          case 'aprobada_revisor':
                            return { label: 'Revisada', date: req.reviewedAt || req.updatedAt };
                          case 'rechazada_revisor':
                            return { label: 'Rechazada (Revisor)', date: req.reviewedAt || req.updatedAt };
                          case 'aprobada_gerencia':
                            return { label: 'Aprobada (Gerencia)', date: req.approvedAt || req.updatedAt };
                          case 'rechazada_gerencia':
                            return { label: 'Rechazada (Gerencia)', date: req.approvedAt || req.updatedAt };
                          case 'cotizada':
                            return { label: 'Cotizada', date: req.updatedAt };
                          case 'en_orden_compra':
                            return { label: 'En Orden de Compra', date: req.updatedAt };
                          case 'pendiente_recepcion':
                            return { label: 'Pendiente de Recepción', date: req.updatedAt };
                          default:
                            return { label: 'Actualizada', date: req.updatedAt };
                        }
                      };

                      const lastAction = getLastAction();

                      return (
                        <TableRow key={req.requisitionId} className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors">
                          <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                            {req.requisitionNumber}
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
                              {(req.status.code === 'rechazada_revisor' || req.status.code === 'rechazada_gerencia') && req.logs && req.logs.length > 0 && (() => {
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
                ['aprobada_gerencia', 'cotizada', 'en_orden_compra', 'pendiente_recepcion'].includes(r.status?.code || '')
              );

              if (processedRequisitions.length === 0) return null;

              // Paginación interna: 10 por página
              const totalProcessed = processedRequisitions.length;
              const processedTotalPages = Math.ceil(totalProcessed / processedLimit);
              const processedStartIndex = (processedPage - 1) * processedLimit;
              const processedEndIndex = processedStartIndex + processedLimit;
              const paginatedProcessedRequisitions = processedRequisitions.slice(processedStartIndex, processedEndIndex);

              return (
                <div className={requisitions.filter(r => ['pendiente', 'aprobada_revisor', 'rechazada_revisor', 'rechazada_gerencia'].includes(r.status?.code || '')).length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
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
                              case 'aprobada_gerencia':
                                return { label: 'Aprobada (Gerencia)', date: req.approvedAt || req.updatedAt };
                              case 'cotizada':
                                return { label: 'Cotizada', date: req.updatedAt };
                              case 'en_orden_compra':
                                return { label: 'En Orden de Compra', date: req.updatedAt };
                              case 'pendiente_recepcion':
                                return { label: 'Pendiente de Recepción', date: req.updatedAt };
                              default:
                                return { label: 'Actualizada', date: req.updatedAt };
                            }
                          };

                          const lastAction = getLastAction();

                          return (
                            <TableRow key={req.requisitionId} className="bg-white hover:bg-green-50/30 transition-colors">
                              <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-neutral-600))]">
                                {req.requisitionNumber}
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
    </div>
  );
}
