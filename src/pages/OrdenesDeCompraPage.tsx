import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRequisitionsForPurchaseOrders } from '@/services/purchase-orders.service';
import type { Requisition } from '@/services/requisitions.service';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Edit, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/utils/dateUtils';
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';
import { StatusDashboard, type StatusCount } from '@/components/ui/status-dashboard';

// Mapeo de colores de estados
const getStatusColor = (statusCode: string) => {
  const colors: Record<string, string> = {
    cotizada: 'bg-yellow-100 text-yellow-800',
    pendiente_recepcion: 'bg-purple-100 text-purple-800',
    en_orden_compra: 'bg-indigo-100 text-indigo-800',
  };
  return colors[statusCode] || 'bg-gray-100 text-gray-800';
};

export default function OrdenesDeCompraPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Paginación para sección de generadas (10 por página)
  const [processedPage, setProcessedPage] = useState(1);
  const processedLimit = 10;

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Check if user is Compras
  const isCompras = user?.nombreRol === 'Compras';

  useEffect(() => {
    if (!isCompras) {
      navigate('/dashboard');
      return;
    }
    loadRequisitions();
  }, [page, isCompras]);

  const loadRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getRequisitionsForPurchaseOrders({ page, limit });
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

  const handleView = (requisition: Requisition) => {
    navigate(`/dashboard/compras/ordenes/${requisition.requisitionId}/ver`);
  };

  const handleEdit = (requisition: Requisition) => {
    navigate(`/dashboard/compras/ordenes/${requisition.requisitionId}/asignar-precios`);
  };

  // Extraer opciones únicas de filtros
  const availableStatuses = useMemo(() => {
    const statuses = requisitions
      .map((r) => r.status)
      .filter((s): s is NonNullable<typeof s> => s != null);
    const uniqueStatuses = Array.from(
      new Map(statuses.map((s) => [s.code, s])).values()
    );
    return uniqueStatuses;
  }, [requisitions]);

  const availableCompanies = useMemo(() => {
    const companies = requisitions.map((r) => r.company);
    const uniqueCompanies = Array.from(
      new Map(companies.map((c) => [c.companyId, c])).values()
    );
    return uniqueCompanies;
  }, [requisitions]);

  const availableProjects = useMemo(() => {
    const projects = requisitions.map((r) => r.project).filter(Boolean);
    const uniqueProjects = Array.from(
      new Map(projects.map((p) => [p.projectId, p])).values()
    );
    return uniqueProjects;
  }, [requisitions]);

  // Filtrar requisiciones
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      // Filtro por número de requisición
      if (
        filters.requisitionNumber &&
        !req.requisitionNumber
          .toLowerCase()
          .includes(filters.requisitionNumber.toLowerCase())
      ) {
        return false;
      }

      // Filtro por fecha desde
      if (filters.startDate) {
        const reqDate = new Date(req.createdAt);
        const startDate = new Date(filters.startDate);
        if (reqDate < startDate) return false;
      }

      // Filtro por fecha hasta
      if (filters.endDate) {
        const reqDate = new Date(req.createdAt);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (reqDate > endDate) return false;
      }

      // Filtro por empresa
      if (
        filters.company &&
        filters.company !== 'all' &&
        req.company.companyId.toString() !== filters.company
      ) {
        return false;
      }

      // Filtro por proyecto
      if (
        filters.project &&
        filters.project !== 'all' &&
        req.project?.projectId.toString() !== filters.project
      ) {
        return false;
      }

      // Filtro por estado
      if (
        filters.status &&
        filters.status !== 'all' &&
        req.status?.code !== filters.status
      ) {
        return false;
      }

      return true;
    });
  }, [requisitions, filters]);

  // Helper para obtener el badge de estado de facturación
  const getInvoiceStatusBadge = (purchaseOrders: any[]) => {
    if (!purchaseOrders || purchaseOrders.length === 0) {
      return null;
    }

    // Si hay múltiples OCs, mostrar el estado general
    const statuses = purchaseOrders.map(po => po.invoiceStatus || 'sin_factura');
    const allComplete = statuses.every(s => s === 'factura_completa' || s === 'enviada_contabilidad');
    const somePartial = statuses.some(s => s === 'facturacion_parcial');
    const allSent = statuses.every(s => s === 'enviada_contabilidad');

    let status = 'sin_factura';
    let label = 'Sin Factura';
    let className = 'bg-red-100 text-red-800';

    if (allSent) {
      status = 'enviada_contabilidad';
      label = 'Enviada';
      className = 'bg-blue-100 text-blue-800';
    } else if (allComplete) {
      status = 'factura_completa';
      label = 'Completa';
      className = 'bg-green-100 text-green-800';
    } else if (somePartial || statuses.some(s => s === 'factura_completa')) {
      status = 'facturacion_parcial';
      label = 'Parcial';
      className = 'bg-yellow-100 text-yellow-800';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
        {label}
      </span>
    );
  };

  if (!isCompras) {
    return null;
  }

  if (loading && requisitions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo 1 + Back Button */}
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
                onClick={() => navigate('/dashboard/compras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Órdenes de Compra
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Historial completo de órdenes de compra: pendientes, generadas y completadas
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
          <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
            <span className="font-semibold text-[hsl(var(--canalco-primary))]">
              {total}
            </span>{' '}
            requisición(es) cotizada(s) lista(s) para generar órdenes de compra
          </p>
        </div>

        {/* Dashboard de Estado */}
        {(() => {
          // Calcular pendientes por estado
          const statusCounts = requisitions.reduce((acc, req) => {
            const statusCode = req.status?.code || '';
            // Solo mostrar estados que requieren acción
            if (['cotizada', 'en_orden_compra'].includes(statusCode)) {
              const statusName = req.status?.name || '';
              if (!acc[statusCode]) {
                acc[statusCode] = { status: statusCode, statusLabel: statusName, count: 0 };
              }
              acc[statusCode].count++;
            }
            return acc;
          }, {} as Record<string, StatusCount>);

          // Calcular vencidos (órdenes de compra pendientes de crear o aprobar)
          const overdueCount = requisitions.filter(req =>
            req.isOverdue && ['cotizada', 'en_orden_compra'].includes(req.status?.code || '')
          ).length;

          return (
            <StatusDashboard
              pendingByStatus={Object.values(statusCounts)}
              overdueCount={overdueCount}
              title="Órdenes de Compra Pendientes"
            />
          );
        })()}

        {/* Filtros */}
        {!loading && requisitions.length > 0 && (
          <div className="mb-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
            <RequisitionFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableStatuses={availableStatuses}
              availableCompanies={availableCompanies}
              availableProjects={availableProjects}
            />
          </div>
        )}

        {filteredRequisitions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
            <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
              {requisitions.length === 0
                ? 'No hay requisiciones cotizadas disponibles'
                : 'No se encontraron requisiciones con los filtros aplicados'}
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
              {requisitions.length === 0
                ? 'Las requisiciones aparecerán aquí cuando estén completamente cotizadas'
                : 'Intenta ajustar los filtros para ver más resultados.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
            {/* Pending Purchase Orders Section */}
            {filteredRequisitions.filter(r => r.status?.code === 'cotizada').length > 0 && (
              <div>
                <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
                  <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    PENDIENTES DE GENERAR OC ({filteredRequisitions.filter(r => r.status?.code === 'cotizada').length})
                  </p>
                </div>
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
                  <TableHead className="font-semibold">Plazo</TableHead>
                  <TableHead className="font-semibold text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequisitions.filter(r => r.status?.code === 'cotizada').map((req) => {
                  // Determinar última actualización según estado
                  const getLastAction = () => {
                    switch (req.status?.code) {
                      case 'cotizada':
                        return { label: 'Cotizada', date: req.quotedAt || req.updatedAt };
                      case 'en_orden_compra':
                        return { label: 'En Orden de Compra', date: req.purchaseOrderDate || req.updatedAt };
                      case 'pendiente_recepcion':
                        return { label: 'Pendiente Recepción', date: req.updatedAt };
                      default:
                        return { label: 'Actualizada', date: req.updatedAt };
                    }
                  };

                  const lastAction = getLastAction();

                  return (
                    <TableRow key={req.requisitionId}>
                      <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                        {req.requisitionNumber}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {req.company?.name || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {req.project?.name || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] text-xs font-semibold">
                            {req.items?.length || 0}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {req.user?.name || req.creator?.nombre || 'N/A'}
                          </p>
                          {req.creator?.role && (
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                              {req.creator.role?.nombreRol || 'Sin rol'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                            {lastAction.label}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                            {formatDate(lastAction.date)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            req.status?.code || 'cotizada'
                          )}`}
                        >
                          {req.status?.name || 'Cotizada'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {req.slaDeadline ? (
                          <div className="text-sm flex flex-col gap-0.5">
                            {req.isOverdue ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="text-red-600">❌</span>
                                  <span className="text-red-600 font-medium">Vencida</span>
                                </div>
                                {req.daysOverdue > 0 && (
                                  <span className="text-xs text-red-500">
                                    Hace {req.daysOverdue} día{req.daysOverdue !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-green-600">✅</span>
                                <span className="text-green-600 font-medium">A tiempo</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleView(req)}
                            className="hover:bg-blue-50"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(req)}
                            className="hover:bg-orange-50"
                            title="Asignar precios"
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
            )}

            {/* Generated Purchase Orders Section */}
            {(() => {
              const generatedOrders = filteredRequisitions.filter(r => ['en_orden_compra', 'pendiente_recepcion'].includes(r.status?.code || ''));

              if (generatedOrders.length === 0) return null;

              // Paginación interna: 10 por página
              const totalGenerated = generatedOrders.length;
              const processedTotalPages = Math.ceil(totalGenerated / processedLimit);
              const processedStartIndex = (processedPage - 1) * processedLimit;
              const processedEndIndex = processedStartIndex + processedLimit;
              const paginatedGeneratedOrders = generatedOrders.slice(processedStartIndex, processedEndIndex);

              return (
                <div className={filteredRequisitions.filter(r => r.status?.code === 'cotizada').length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                  <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                    <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      OC YA GENERADAS ({generatedOrders.length})
                    </p>
                  </div>
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
                        <TableHead className="font-semibold">Estado Factura</TableHead>
                        <TableHead className="font-semibold">Plazo</TableHead>
                        <TableHead className="font-semibold text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedGeneratedOrders.map((req) => {
                        // Determinar última actualización según estado
                        const getLastAction = () => {
                          switch (req.status?.code) {
                            case 'cotizada':
                              return { label: 'Cotizada', date: req.quotedAt || req.updatedAt };
                            case 'en_orden_compra':
                              return { label: 'En Orden de Compra', date: req.purchaseOrderDate || req.updatedAt };
                            case 'pendiente_recepcion':
                              return { label: 'Pendiente Recepción', date: req.updatedAt };
                            default:
                              return { label: 'Actualizada', date: req.updatedAt };
                          }
                        };

                        const lastAction = getLastAction();

                        return (
                          <TableRow key={req.requisitionId} className="bg-white hover:bg-green-50/30">
                            <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-neutral-600))]">
                              {req.requisitionNumber}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                                {req.company?.name || '-'}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                {req.project?.name || '-'}
                              </p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-600))] text-xs font-semibold">
                                  {req.items?.length || 0}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                                  {req.user?.name || req.creator?.nombre || 'N/A'}
                                </p>
                                {req.creator?.role && (
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                    {req.creator.role?.nombreRol || 'Sin rol'}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {lastAction.label}
                                </p>
                                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                  {formatDate(lastAction.date)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                  req.status?.code || 'cotizada'
                                )}`}
                              >
                                {req.status?.name || 'Cotizada'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getInvoiceStatusBadge(req.purchaseOrders) || (
                                <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.slaDeadline ? (
                                <div className="text-sm flex flex-col gap-0.5">
                                  {req.isOverdue ? (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className="text-red-600">❌</span>
                                        <span className="text-red-600 font-medium">Vencida</span>
                                      </div>
                                      {req.daysOverdue > 0 && (
                                        <span className="text-xs text-red-500">
                                          Hace {req.daysOverdue} día{req.daysOverdue !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-green-600">✅</span>
                                      <span className="text-green-600 font-medium">A tiempo</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleView(req)}
                                  className="hover:bg-blue-50"
                                  title="Ver detalle"
                                >
                                  <Eye className="w-4 h-4 text-blue-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Paginación de sección generadas */}
                  {processedTotalPages > 1 && (
                    <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center justify-between bg-green-50/30">
                      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                        Mostrando {processedStartIndex + 1} - {Math.min(processedEndIndex, totalGenerated)} de {totalGenerated} generadas
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

        {/* Pagination */}
        {requisitions.length > 0 && (
          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-[hsl(var(--canalco-neutral-600))]"
            >
              Anterior
            </Button>
            <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-[hsl(var(--canalco-neutral-600))]"
            >
              Siguiente
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
