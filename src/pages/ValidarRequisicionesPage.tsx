import React, { useState, useEffect, useMemo } from 'react';
import { Eye, CheckCircle, AlertCircle, Loader2, ArrowLeft, Check, X, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/utils/dateUtils';
import {
  getPendingActions,
  getRequisitionById,
  validateRequisition,
  type Requisition,
  type ValidateRequisitionDto,
} from '@/services/requisition.service';
import { RequisitionFilters } from '@/components/ui/requisition-filters';
import { StatusDashboard } from '@/components/ui/status-dashboard';
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';
import { getStatusColor } from '@/constants/status';
import type { StatusCount, FilterValues } from '@/types/common.types';

const ValidarRequisicionesPage: React.FC = () => {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Detalle de requisición
  const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Estado de validación
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [decision, setDecision] = useState<'validate' | 'reject' | null>(null);

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Cargar requisiciones para validación (pendientes y ya validadas)
  const loadPendingRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPendingActions({ page, limit: 100 });

      // Filtrar requisiciones relevantes para el validador:
      // - pendiente_validacion (pendientes de validar)
      // - en_revision, aprobada_revisor, pendiente_autorizacion, autorizado, aprobada_gerencia (ya validadas, en proceso)
      // - rechazada_validador (rechazadas por el validador)
      const relevantStatuses = [
        'pendiente_validacion',
        'en_revision',
        'aprobada_revisor',
        'pendiente_autorizacion',
        'autorizado',
        'aprobada_gerencia',
        'rechazada_validador'
      ];
      const validationRequisitions = response.data.filter(
        (req) => relevantStatuses.includes(req.status?.code || '')
      );

      setRequisitions(validationRequisitions);
      setTotalPages(Math.ceil(validationRequisitions.length / 10) || 1);
    } catch (err: any) {
      console.error('Error loading requisitions:', err);
      setError(err.response?.data?.message || 'Error al cargar las requisiciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingRequisitions();
  }, [page]);

  // Ver detalle
  const handleViewDetail = async (requisition: Requisition) => {
    try {
      setDetailLoading(true);
      setShowDetail(true);
      setShowConfirmation(false);
      setComments('');
      setDecision(null);
      const fullRequisition = await getRequisitionById(requisition.requisitionId);
      setSelectedRequisition(fullRequisition);
      setActionError(null);
    } catch (err: any) {
      console.error('Error loading requisition:', err);
      setError(err.response?.data?.message || 'Error al cargar la requisición');
    } finally {
      setDetailLoading(false);
    }
  };

  // Cerrar detalle
  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedRequisition(null);
    setShowConfirmation(false);
    setComments('');
    setDecision(null);
    setActionError(null);
  };

  // Iniciar validación
  const handleStartValidate = () => {
    setDecision('validate');
    setShowConfirmation(true);
  };

  // Iniciar rechazo
  const handleStartReject = () => {
    setDecision('reject');
    setShowConfirmation(true);
  };

  // Confirmar acción
  const handleConfirmAction = async () => {
    if (!selectedRequisition || !decision) return;

    // Validar comentarios si es rechazo
    if (decision === 'reject' && !comments.trim()) {
      setActionError('Debe proporcionar un motivo para rechazar la requisición');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const data: ValidateRequisitionDto = {
        decision,
        comments: comments.trim() || undefined,
      };

      await validateRequisition(selectedRequisition.requisitionId, data);

      // Cerrar y recargar
      handleCloseDetail();
      await loadPendingRequisitions();

      // Mostrar mensaje de éxito
      alert(
        decision === 'validate'
          ? 'Requisición validada exitosamente. Ahora pasará a revisión.'
          : 'Requisición rechazada. El creador podrá editarla y volver a enviarla.'
      );
    } catch (err: any) {
      console.error('Error processing action:', err);
      setActionError(
        err.response?.data?.message || 'Error al procesar la acción'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Color de estado - ahora usa la función centralizada de @/constants/status

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

      return true;
    });
  }, [requisitions, filters]);

  if (loading && requisitions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Back Button */}
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
                onClick={() => {
                  if (showDetail) {
                    handleCloseDetail();
                  } else {
                    navigate('/dashboard/compras');
                  }
                }}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Validar Requisiciones de Obra
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisiciones con obra pendientes de validación
              </p>
            </div>

            <div className="w-16" /> {/* Spacer for balance */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}

        {/* Dashboard de Estado */}
        {!showDetail && (() => {
          const statusCounts = requisitions.reduce((acc, req) => {
            if (req.isPending) {
              const statusCode = req.status?.code || 'pendiente_validacion';
              const statusName = req.status?.name || 'Pendiente de Validación';
              if (!acc[statusCode]) {
                acc[statusCode] = { status: statusCode, statusLabel: statusName, count: 0 };
              }
              acc[statusCode].count++;
            }
            return acc;
          }, {} as Record<string, StatusCount>);

          const overdueCount = requisitions.filter(req => req.isPending && req.isOverdue).length;

          return (
            <StatusDashboard
              pendingByStatus={Object.values(statusCounts)}
              overdueCount={overdueCount}
            />
          );
        })()}

        {/* Vista de Lista */}
        {!showDetail && (
          <>
            {/* Filtros */}
            {requisitions.length > 0 && (
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
                <CheckCircle className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
                <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
                  {requisitions.length === 0
                    ? 'No hay requisiciones pendientes de validación'
                    : 'No se encontraron requisiciones con los filtros aplicados'}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
                  {requisitions.length === 0
                    ? 'Todas las requisiciones de obra han sido procesadas.'
                    : 'Intenta ajustar los filtros para ver más resultados.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                {/* Pending Section */}
                {filteredRequisitions.filter(r => r.status?.code === 'pendiente_validacion').length > 0 && (
                  <div>
                    <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2">
                      <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        PENDIENTES DE VALIDACIÓN ({filteredRequisitions.filter(r => r.status?.code === 'pendiente_validacion').length})
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
                          <TableHead className="font-semibold">Fecha</TableHead>
                          <TableHead className="font-semibold">Estado</TableHead>
                          <TableHead className="font-semibold">Plazo</TableHead>
                          <TableHead className="font-semibold text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRequisitions.filter(r => r.status?.code === 'pendiente_validacion').sort((a, b) => {
                          if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                          if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        }).map((req) => (
                          <TableRow key={req.requisitionId} className="bg-white hover:bg-indigo-50/30">
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
                                {req.company.name}
                              </p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-indigo-600" />
                                <div>
                                  {req.obra ? (
                                    <>
                                      <p className="text-sm font-medium text-indigo-700">{req.obra}</p>
                                      {req.codigoObra && (
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                          Código: {req.codigoObra}
                                        </p>
                                      )}
                                    </>
                                  ) : req.project ? (
                                    <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">{req.project.name}</p>
                                  ) : (
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] font-semibold text-sm">
                                {req.items?.length || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                                  {req.creator.nombre}
                                </p>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {req.creator.role?.nombreRol || 'Sin rol'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                              {formatDate(req.createdAt)}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                  req.status?.code || 'pendiente_validacion'
                                )}`}
                              >
                                {req.status?.name || 'Pendiente Validación'}
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
                                      {req.daysOverdue && req.daysOverdue > 0 && (
                                        <span className="text-xs text-red-500">
                                          Hace {req.daysOverdue} día{req.daysOverdue !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className="text-green-600">✅</span>
                                        <span className="text-green-600 font-medium">A tiempo</span>
                                      </div>
                                      {req.daysRemaining !== undefined && req.daysRemaining > 0 && (
                                        <span className="text-xs text-green-600">
                                          {req.daysRemaining} día{req.daysRemaining !== 1 ? 's' : ''} restante{req.daysRemaining !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </>
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
                                  onClick={() => handleViewDetail(req)}
                                  className="hover:bg-indigo-50"
                                  title="Validar"
                                >
                                  <Eye className="h-4 w-4 text-indigo-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Already Validated Section */}
                {filteredRequisitions.filter(r => r.status?.code !== 'pendiente_validacion').length > 0 && (
                  <div className={filteredRequisitions.filter(r => r.status?.code === 'pendiente_validacion').length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        YA VALIDADAS ({filteredRequisitions.filter(r => r.status?.code !== 'pendiente_validacion').length})
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
                          <TableHead className="font-semibold text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRequisitions.filter(r => r.status?.code !== 'pendiente_validacion').sort((a, b) => {
                          if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                          if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        }).map((req) => (
                          <TableRow key={req.requisitionId} className="bg-white hover:bg-green-50/30">
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
                                {req.company.name}
                              </p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-green-600" />
                                <div>
                                  {req.obra ? (
                                    <>
                                      <p className="text-sm font-medium text-green-700">{req.obra}</p>
                                      {req.codigoObra && (
                                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                          Código: {req.codigoObra}
                                        </p>
                                      )}
                                    </>
                                  ) : req.project ? (
                                    <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">{req.project.name}</p>
                                  ) : (
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-600))] font-semibold text-sm">
                                {req.items?.length || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                                  {req.creator.nombre}
                                </p>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {req.creator.role?.nombreRol || 'Sin rol'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                              <div>
                                <p className="font-medium">{req.lastActionLabel || 'Validada'}</p>
                                <p className="text-xs">{formatDate(req.lastActionDate || req.updatedAt)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                  req.status?.code || 'pendiente'
                                )}`}
                              >
                                {req.status?.name || 'Validada'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/dashboard/compras/requisiciones/detalle/${req.requisitionId}`)}
                                  className="hover:bg-blue-50"
                                  title="Ver detalles"
                                >
                                  <Eye className="w-4 h-4 text-blue-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between">
                    <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                      Página {page} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Vista de Detalle */}
        {showDetail && (
          <div className="space-y-6">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--canalco-primary))]" />
              </div>
            ) : selectedRequisition ? (
              <>
                {/* Card de Información General */}
                <Card className="p-6">
                  <h2 className="text-xl font-bold mb-2 text-[hsl(var(--canalco-neutral-900))]">
                    Requisición {selectedRequisition.requisitionNumber}
                    {selectedRequisition.priority === 'alta' && (
                      <Badge className="ml-2 bg-red-600 text-white">URGENTE</Badge>
                    )}
                  </h2>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mb-4">
                    Creada el {formatDate(selectedRequisition.createdAt)}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                      <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Empresa
                      </Label>
                      <p className="font-medium">
                        {selectedRequisition.company.name}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Proyecto
                      </Label>
                      <p className="font-medium">
                        {selectedRequisition.project?.name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Obra
                      </Label>
                      <p className="font-medium text-indigo-700">
                        {selectedRequisition.obra || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Código de Obra
                      </Label>
                      <p className="font-medium">
                        {selectedRequisition.codigoObra || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Centro de Operación
                      </Label>
                      <p className="font-medium">
                        {selectedRequisition.operationCenter?.code || 'N/A'}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Card de Materiales */}
                {!showConfirmation && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Elementos Solicitados ({selectedRequisition.items?.length || 0})
                    </h3>
                    <div className="border border-[hsl(var(--canalco-neutral-200))] rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Grupo</TableHead>
                            <TableHead className="text-center">Cantidad</TableHead>
                            <TableHead>Observación</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRequisition.items?.map((item, index) => (
                            <TableRow key={item.itemId}>
                              <TableCell className="font-bold text-[hsl(var(--canalco-primary))]">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {item.material?.code}
                              </TableCell>
                              <TableCell>
                                {item.material?.description}
                              </TableCell>
                              <TableCell className="text-sm">
                                {item.material?.materialGroup?.name || '-'}
                              </TableCell>
                              <TableCell className="text-center font-semibold">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                {item.observation || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Botones de acción */}
                    <div className="flex gap-3 justify-end mt-6">
                      <Button variant="outline" onClick={handleCloseDetail}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleStartReject}
                        variant="destructive"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Rechazar
                      </Button>
                      <Button
                        onClick={handleStartValidate}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Validar Requisición
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Confirmación */}
                {showConfirmation && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Confirmar {decision === 'validate' ? 'Validación' : 'Rechazo'}
                    </h3>

                    <div className={`p-4 rounded-lg ${
                      decision === 'validate'
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      <p className="font-semibold mb-2">
                        {decision === 'validate' ? (
                          <span className="text-green-800">✅ Validar esta requisición</span>
                        ) : (
                          <span className="text-red-800">❌ Rechazar esta requisición</span>
                        )}
                      </p>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                        {decision === 'validate'
                          ? 'La requisición será validada y pasará a revisión por el Director Técnico.'
                          : 'La requisición será devuelta al creador para corrección.'}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label htmlFor="comments">
                        {decision === 'validate' ? 'Comentarios (opcional)' : 'Motivo del rechazo *'}
                      </Label>
                      <Textarea
                        id="comments"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder={decision === 'validate' ? 'Agregar comentarios...' : 'Explique el motivo del rechazo...'}
                        rows={3}
                        className={decision === 'reject' && !comments.trim() ? 'border-red-300' : ''}
                      />
                    </div>

                    {actionError && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{actionError}</p>
                      </div>
                    )}

                    <div className="flex gap-2 justify-end mt-6">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowConfirmation(false);
                          setDecision(null);
                          setComments('');
                          setActionError(null);
                        }}
                        disabled={actionLoading}
                      >
                        Volver
                      </Button>
                      <Button
                        onClick={handleConfirmAction}
                        disabled={actionLoading}
                        className={
                          decision === 'validate'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }
                      >
                        {actionLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            {decision === 'validate' ? (
                              <Check className="h-4 w-4 mr-2" />
                            ) : (
                              <X className="h-4 w-4 mr-2" />
                            )}
                            Confirmar {decision === 'validate' ? 'Validación' : 'Rechazo'}
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Sección de Firmas */}
                <Card className="p-6 bg-[hsl(var(--canalco-neutral-50))]">
                  <h3 className="text-lg font-semibold mb-4 text-[hsl(var(--canalco-neutral-900))]">
                    Firmas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* Solicitado por */}
                    <div className="border-l-4 border-[hsl(var(--canalco-primary))] pl-4">
                      <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                        Solicitado por
                      </p>
                      <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                        {selectedRequisition.creator.nombre}
                      </p>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                        {selectedRequisition.creator.cargo || 'Sin cargo'}
                      </p>
                    </div>

                    {/* Validado por */}
                    {(() => {
                      const validateLog = selectedRequisition.logs?.find(
                        (log) => log.action === 'validar' ||
                          log.action === 'validar_aprobar' ||
                          (log.previousStatus === 'pendiente_validacion' && log.newStatus === 'pendiente')
                      );
                      return validateLog ? (
                        <div className="border-l-4 border-indigo-500 pl-4">
                          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                            Validado por
                          </p>
                          <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {validateLog.user.nombre}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {validateLog.user.cargo || 'Sin cargo'}
                          </p>
                        </div>
                      ) : null;
                    })()}

                    {/* Revisado por */}
                    {(() => {
                      const reviewLog = selectedRequisition.logs?.find(
                        (log) => log.action?.startsWith('revisar_')
                      );
                      return reviewLog ? (
                        <div className="border-l-4 border-blue-500 pl-4">
                          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                            Revisado por
                          </p>
                          <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {reviewLog.user.nombre}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {reviewLog.user.cargo || 'Sin cargo'}
                          </p>
                        </div>
                      ) : null;
                    })()}

                    {/* Autorizado por */}
                    {(() => {
                      const authorizeLog = selectedRequisition.logs?.find(
                        (log) => log.action === 'autorizar_aprobar' || log.newStatus === 'autorizado'
                      );
                      return authorizeLog ? (
                        <div className="border-l-4 border-amber-500 pl-4">
                          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                            Autorizado por
                          </p>
                          <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {authorizeLog.user.nombre}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {authorizeLog.user.cargo || 'Sin cargo'}
                          </p>
                        </div>
                      ) : null;
                    })()}

                    {/* Aprobado por */}
                    {(() => {
                      const approveLog = selectedRequisition.logs?.find(
                        (log) => log.action === 'aprobar_gerencia' || log.newStatus === 'aprobada_gerencia'
                      );
                      return approveLog ? (
                        <div className="border-l-4 border-green-500 pl-4">
                          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                            Aprobado por
                          </p>
                          <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {approveLog.user.nombre}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {approveLog.user.cargo || 'Sin cargo'}
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </Card>
              </>
            ) : null}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ValidarRequisicionesPage;
