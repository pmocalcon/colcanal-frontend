import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRequisitionsForQuotation } from '@/services/quotation.service';
import type { Requisition } from '@/services/requisitions.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Menu, Eye, Edit, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
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

// Mapeo de estados a colores (siguiendo el formato de RevisarRequisicionesPage)
const STATUS_COLORS: Record<string, string> = {
  aprobada_gerencia: 'bg-emerald-100 text-emerald-800',
  en_cotizacion: 'bg-blue-100 text-blue-800',
  cotizada: 'bg-indigo-100 text-indigo-800',
  en_orden_compra: 'bg-purple-100 text-purple-800',
  pendiente_recepcion: 'bg-cyan-100 text-cyan-800',
  en_recepcion: 'bg-teal-100 text-teal-800',
  recepcion_completa: 'bg-green-100 text-green-800',
};

// Estados que permiten gestionar cotización
const QUOTABLE_STATUSES = ['aprobada_gerencia', 'en_cotizacion', 'cotizada'];

export default function CotizacionesPage() {
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

  // Paginación para sección de cotizadas (10 por página)
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
      const response = await getRequisitionsForQuotation({ page, limit });
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

  const handleManage = (requisition: Requisition) => {
    navigate(`/dashboard/compras/cotizaciones/gestionar/${requisition.requisitionId}`);
  };

  const handleView = (requisition: Requisition) => {
    // Para Compras, "Ver" también abre la página de gestión (en modo solo lectura si ya tiene órdenes)
    navigate(`/dashboard/compras/cotizaciones/gestionar/${requisition.requisitionId}`);
  };

  const getStatusLabel = (code: string) => {
    const labels: Record<string, string> = {
      aprobada_gerencia: 'Lista para Cotizar',
      en_cotizacion: 'En Cotización',
      cotizada: 'Cotizada',
      en_orden_compra: 'Con Orden de Compra',
      pendiente_recepcion: 'Pendiente Recepción',
      en_recepcion: 'En Recepción',
      recepcion_completa: 'Recepción Completa',
    };
    return labels[code] || code;
  };

  const canManage = (statusCode: string) => {
    return QUOTABLE_STATUSES.includes(statusCode);
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

  if (!isCompras) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-[hsl(var(--canalco-neutral-300))]">
        <div className="mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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
                Cotizaciones
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
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/compras/requisiciones');
                  setSidebarOpen(false);
                }}
              >
                Requisiciones
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start bg-[hsl(var(--canalco-primary))]/10"
                onClick={() => setSidebarOpen(false)}
              >
                Cotizaciones
              </Button>
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
        {/* Title and Instructions */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">
            Gestión de Cotizaciones
          </h2>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Historial completo de cotizaciones: pendientes, en proceso y completadas
          </p>
        </div>

        {/* Dashboard de Estado */}
        {(() => {
          // Calcular pendientes por estado
          const statusCounts = requisitions.reduce((acc, req) => {
            // Solo contar las que están en proceso de cotización
            const statusCode = req.status?.code || '';
            if (['aprobada_gerencia', 'en_cotizacion'].includes(statusCode)) {
              const statusName = req.status?.name || '';
              if (!acc[statusCode]) {
                acc[statusCode] = { status: statusCode, statusLabel: statusName, count: 0 };
              }
              acc[statusCode].count++;
            }
            return acc;
          }, {} as Record<string, StatusCount>);

          // Calcular vencidos (requisiciones que llevan mucho tiempo sin cotizar)
          const overdueCount = requisitions.filter(req =>
            req.status?.code === 'aprobada_gerencia' && req.isOverdue
          ).length;

          return (
            <StatusDashboard
              pendingByStatus={Object.values(statusCounts)}
              overdueCount={overdueCount}
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

        {/* Requisitions Table */}
        <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--canalco-primary))]"></div>
                <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando requisiciones...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-red-600 font-medium mb-2">Error al cargar</p>
                <p className="text-[hsl(var(--canalco-neutral-600))] text-sm">{error}</p>
                <Button
                  onClick={loadRequisitions}
                  className="mt-4 bg-[hsl(var(--canalco-primary))]"
                >
                  Reintentar
                </Button>
              </div>
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-[hsl(var(--canalco-neutral-600))]">
                  {requisitions.length === 0
                    ? 'No hay requisiciones disponibles'
                    : 'No se encontraron requisiciones con los filtros aplicados'}
                </p>
                {requisitions.length > 0 && (
                  <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
                    Intenta ajustar los filtros para ver más resultados.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* Pending Quotations Section */}
              {filteredRequisitions.filter(r => ['aprobada_gerencia', 'en_cotizacion'].includes(r.status?.code || '')).length > 0 && (
                <div>
                  <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
                    <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      PENDIENTES DE COTIZAR ({filteredRequisitions.filter(r => ['aprobada_gerencia', 'en_cotizacion'].includes(r.status?.code || '')).length})
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
                  {filteredRequisitions.filter(r => ['aprobada_gerencia', 'en_cotizacion'].includes(r.status?.code || '')).map((req) => {
                      // Determinar última actualización según estado
                      const getLastAction = () => {
                        switch (req.status.code) {
                          case 'aprobada_gerencia':
                            return { label: 'Aprobada (Gerencia)', date: req.approvedByManagementAt || req.updatedAt };
                          case 'en_cotizacion':
                            return { label: 'En Cotización', date: req.updatedAt };
                          case 'cotizada':
                            return { label: 'Cotizada', date: req.quotedAt || req.updatedAt };
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
                                {req.creator?.nombre || 'N/A'}
                              </p>
                              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                {req.creator?.role?.nombreRol || '-'}
                              </p>
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
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status.code] || 'bg-gray-100 text-gray-800'}`}>
                              {getStatusLabel(req.status.code)}
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
                              {canManage(req.status.code) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleManage(req)}
                                  className="hover:bg-orange-50"
                                  title="Gestionar cotización"
                                >
                                  <Edit className="w-4 h-4 text-orange-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
                </div>
              )}

              {/* Quoted Requisitions Section */}
              {(() => {
                const quotedRequisitions = filteredRequisitions.filter(r =>
                  ['cotizada', 'en_orden_compra', 'pendiente_recepcion', 'en_recepcion', 'recepcion_completa'].includes(r.status?.code || '')
                );

                if (quotedRequisitions.length === 0) return null;

                // Paginación interna: 10 por página
                const totalQuoted = quotedRequisitions.length;
                const processedTotalPages = Math.ceil(totalQuoted / processedLimit);
                const processedStartIndex = (processedPage - 1) * processedLimit;
                const processedEndIndex = processedStartIndex + processedLimit;
                const paginatedQuotedRequisitions = quotedRequisitions.slice(processedStartIndex, processedEndIndex);

                return (
                  <div className={filteredRequisitions.filter(r => ['aprobada_gerencia', 'en_cotizacion'].includes(r.status?.code || '')).length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        HISTORIAL DE COTIZACIONES ({quotedRequisitions.length})
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
                        {paginatedQuotedRequisitions.map((req) => {
                            // Determinar última actualización según estado
                            const getLastAction = () => {
                              switch (req.status.code) {
                                case 'aprobada_gerencia':
                                  return { label: 'Aprobada (Gerencia)', date: req.approvedByManagementAt || req.updatedAt };
                                case 'en_cotizacion':
                                  return { label: 'En Cotización', date: req.updatedAt };
                                case 'cotizada':
                                  return { label: 'Cotizada', date: req.quotedAt || req.updatedAt };
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
                                      {req.creator?.nombre || 'N/A'}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                      {req.creator?.role?.nombreRol || '-'}
                                    </p>
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
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status.code] || 'bg-gray-100 text-gray-800'}`}>
                                    {getStatusLabel(req.status.code)}
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
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>

                    {/* Paginación de sección cotizadas */}
                    {processedTotalPages > 1 && (
                      <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center justify-between bg-green-50/30">
                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                          Mostrando {processedStartIndex + 1} - {Math.min(processedEndIndex, totalQuoted)} de {totalQuoted} cotizadas
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

              {/* Empty state */}
              {requisitions.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
                    No hay requisiciones para cotizar
                  </p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                    Mostrando {requisitions.length} de {total} requisiciones
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="border-[hsl(var(--canalco-neutral-300))]"
                    >
                      Anterior
                    </Button>
                    <span className="px-4 py-2 text-sm text-[hsl(var(--canalco-neutral-700))]">
                      Página {page} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="border-[hsl(var(--canalco-neutral-300))]"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
