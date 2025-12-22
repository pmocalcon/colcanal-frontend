import React, { useState, useEffect, useMemo } from 'react';
import { Eye, CheckCircle, AlertCircle, Loader2, ArrowLeft, Check, X, CheckCheck, XCircle } from 'lucide-react';
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
  authorizeRequisition,
  type Requisition,
  type RequisitionItem,
  type AuthorizeRequisitionDto,
} from '@/services/requisition.service';
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';
import { StatusDashboard, type StatusCount } from '@/components/ui/status-dashboard';

// Estado de aprobación por ítem
interface ItemReviewStatus {
  itemId: number;
  status: 'pending' | 'approved' | 'rejected';
  comments: string;
}

const AutorizarRequisicionesPage: React.FC = () => {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Detalle de requisición
  const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Estados de autorización por ítem
  const [itemReviews, setItemReviews] = useState<ItemReviewStatus[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Usuario actual
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user?.nombreRol || '';

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Cargar requisiciones para autorización (pendientes y ya procesadas)
  const loadPendingRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPendingActions({ page, limit: 100 });

      // Filtrar requisiciones relevantes para el autorizador:
      // - pendiente_autorizacion (pendientes de autorizar)
      // - autorizado (ya autorizadas por el autorizador)
      // - aprobada_gerencia (ya pasaron por autorización y aprobación)
      // NO incluir rechazada_revisor porque esas van al creador, no al autorizador
      const relevantStatuses = ['pendiente_autorizacion', 'autorizado', 'aprobada_gerencia'];
      const authRequisitions = response.data.filter(
        (req) => relevantStatuses.includes(req.status?.code || '')
      );

      setRequisitions(authRequisitions);
      setTotalPages(response.totalPages);
      setTotal(authRequisitions.length);
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
      const fullRequisition = await getRequisitionById(requisition.requisitionId);

      // DEBUG: Log para ver qué datos vienen del backend
      console.log('📋 Requisition data (Autorizar):', fullRequisition);
      console.log('📝 Logs array:', fullRequisition.logs);
      if (fullRequisition.logs && fullRequisition.logs.length > 0) {
        console.log('🔍 Log actions:', fullRequisition.logs.map(log => ({
          action: log.action,
          newStatus: log.newStatus,
          previousStatus: log.previousStatus,
          user: log.user.nombre
        })));
      }

      setSelectedRequisition(fullRequisition);

      // Inicializar estados de revisión para cada ítem
      const initialReviews: ItemReviewStatus[] = fullRequisition.items.map((item) => ({
        itemId: item.itemId,
        status: 'pending',
        comments: '',
      }));
      setItemReviews(initialReviews);
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
    setItemReviews([]);
    setActionError(null);
  };

  // Aprobar un ítem
  const handleApproveItem = (itemId: number) => {
    setItemReviews((prev) =>
      prev.map((review) =>
        review.itemId === itemId
          ? { ...review, status: 'approved', comments: '' }
          : review
      )
    );
  };

  // Rechazar un ítem
  const handleRejectItem = (itemId: number) => {
    setItemReviews((prev) =>
      prev.map((review) =>
        review.itemId === itemId
          ? { ...review, status: 'rejected' }
          : review
      )
    );
  };

  // Actualizar comentarios de un ítem
  const handleUpdateItemComments = (itemId: number, comments: string) => {
    setItemReviews((prev) =>
      prev.map((review) =>
        review.itemId === itemId ? { ...review, comments } : review
      )
    );
  };

  // Aprobar todos los ítems pendientes
  const handleApproveAll = () => {
    setItemReviews((prev) =>
      prev.map((review) =>
        review.status === 'pending'
          ? { ...review, status: 'approved', comments: '' }
          : review
      )
    );
  };

  // Validar que todos los ítems tengan una decisión
  const areAllItemsReviewed = () => {
    return itemReviews.every((review) => review.status !== 'pending');
  };

  // Validar que ítems rechazados tengan comentarios
  const validateRejectedItems = (): string | null => {
    const rejectedWithoutComments = itemReviews.filter(
      (review) => review.status === 'rejected' && !review.comments.trim()
    );

    if (rejectedWithoutComments.length > 0) {
      return 'Los ítems rechazados deben tener comentarios explicando el motivo';
    }

    return null;
  };

  // Calcular decisión final
  const getFinalDecision = (): 'approve' | 'reject' => {
    const hasRejected = itemReviews.some((review) => review.status === 'rejected');
    return hasRejected ? 'reject' : 'approve';
  };

  // Consolidar comentarios
  const consolidateComments = (): string => {
    const decision = getFinalDecision();

    if (decision === 'approve') {
      return 'Todos los ítems autorizados';
    }

    // Requisición rechazada: consolidar comentarios de ítems rechazados
    const rejectedItems = itemReviews.filter((review) => review.status === 'rejected');

    if (rejectedItems.length === 0) return '';

    const itemsWithComments = rejectedItems.map((review, index) => {
      const item = selectedRequisition?.items.find((i) => i.itemId === review.itemId);
      return `Ítem ${item?.itemNumber || index + 1} (${item?.material.code}): ${review.comments}`;
    });

    return `Requisición rechazada. Motivos:\n${itemsWithComments.join('\n')}`;
  };

  // Obtener estado de revisión de un ítem
  const getItemReviewStatus = (itemId: number) => {
    return itemReviews.find((review) => review.itemId === itemId);
  };

  // Contar ítems por estado
  const getItemsCount = () => {
    const approved = itemReviews.filter((r) => r.status === 'approved').length;
    const rejected = itemReviews.filter((r) => r.status === 'rejected').length;
    const pending = itemReviews.filter((r) => r.status === 'pending').length;
    return { approved, rejected, pending };
  };

  // Abrir confirmación
  const handleOpenConfirmation = () => {
    // Validar que todos los ítems estén revisados
    if (!areAllItemsReviewed()) {
      setActionError('Debes revisar todos los ítems antes de continuar');
      return;
    }

    // Validar que ítems rechazados tengan comentarios
    const validationError = validateRejectedItems();
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setActionError(null);
    setShowConfirmation(true);
  };

  // Confirmar y enviar
  const handleConfirmAction = async () => {
    if (!selectedRequisition) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const finalDecision = getFinalDecision();
      const consolidatedComments = consolidateComments();

      const data: AuthorizeRequisitionDto = {
        decision: finalDecision,
        comments: consolidatedComments,
      };

      // DEBUG: Log para ver qué se está enviando
      console.log('🔑 Authorize Request:', {
        requisitionId: selectedRequisition.requisitionId,
        requisitionNumber: selectedRequisition.requisitionNumber,
        currentStatus: selectedRequisition.status?.code,
        data,
      });

      await authorizeRequisition(selectedRequisition.requisitionId, data);

      // Cerrar y recargar
      handleCloseDetail();
      loadPendingRequisitions();

      alert(
        finalDecision === 'approve'
          ? 'Requisición autorizada exitosamente'
          : 'Requisición rechazada. El creador podrá corregirla y reenviarla.'
      );
    } catch (err: any) {
      console.error('❌ Error processing action:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error status:', err.response?.status);
      setActionError(
        err.response?.data?.message || 'Error al procesar la acción'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Color de estado
  const getStatusColor = (statusCode: string) => {
    const colors: Record<string, string> = {
      pendiente: 'bg-gray-100 text-gray-800',
      en_revision: 'bg-blue-100 text-blue-800',
      aprobada_revisor: 'bg-green-100 text-green-800',
      pendiente_autorizacion: 'bg-amber-100 text-amber-800',
      autorizado: 'bg-lime-100 text-lime-800',
      aprobada_gerencia: 'bg-emerald-100 text-emerald-800',
      rechazada_revisor: 'bg-orange-100 text-orange-800',
      rechazada_autorizador: 'bg-amber-100 text-amber-800',
      rechazada_gerencia: 'bg-red-100 text-red-800',
    };
    return colors[statusCode] || 'bg-gray-100 text-gray-800';
  };

  // Filtros aplicados
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      // Filtro por número de requisición
      if (
        filters.requisitionNumber &&
        !req.requisitionNumber.toLowerCase().includes(filters.requisitionNumber.toLowerCase())
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

  // Extraer opciones únicas de filtros
  const availableStatuses = useMemo(() => {
    return [
      { statusId: 1, code: 'pendiente_autorizacion', name: 'Pendiente de autorización', description: '', color: 'amber', order: 4 },
    ];
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
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
                Autorizar Requisiciones
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisiciones pendientes de autorización
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

        {/* Dashboard de Estado */}
        {!showDetail && (() => {
          // Calcular pendientes (solo pendiente_autorizacion)
          const pendingReqs = requisitions.filter(req => req.status?.code === 'pendiente_autorizacion');
          const overdueCount = pendingReqs.filter(req => req.isOverdue).length;

          const statusCounts: StatusCount[] = [];
          if (pendingReqs.length > 0) {
            statusCounts.push({
              status: 'pendiente_autorizacion',
              statusLabel: 'Pendiente',
              count: pendingReqs.length,
            });
          }

          return (
            <StatusDashboard
              pendingByStatus={statusCounts}
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
                    ? 'No hay requisiciones para mostrar'
                    : 'No se encontraron requisiciones con los filtros aplicados'}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
                  {requisitions.length === 0
                    ? 'Aún no tienes requisiciones asignadas para autorizar.'
                    : 'Intenta ajustar los filtros para ver más resultados.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                {/* Sección PENDIENTES */}
                {filteredRequisitions.filter(r => r.status?.code === 'pendiente_autorizacion').length > 0 && (
                  <div>
                    <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
                      <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        PENDIENTES ({filteredRequisitions.filter(r => r.status?.code === 'pendiente_autorizacion').length})
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
                        {filteredRequisitions.filter(r => r.status?.code === 'pendiente_autorizacion').map((req) => (
                          <TableRow key={req.requisitionId} className="bg-white hover:bg-orange-50/30">
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
                                  req.status?.code || 'pendiente'
                                )}`}
                              >
                                {req.status?.name || 'Pendiente'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {req.isOverdue ? (
                                <div className="text-sm flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-red-600">❌</span>
                                    <span className="text-red-600 font-medium">Vencida</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className="text-green-600">✅</span>
                                  <span className="text-green-600 font-medium">A tiempo</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewDetail(req)}
                                  className="hover:bg-blue-50"
                                  title="Autorizar"
                                >
                                  <Eye className="h-4 w-4 text-blue-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Sección YA AUTORIZADAS */}
                {filteredRequisitions.filter(r => r.status?.code !== 'pendiente_autorizacion').length > 0 && (
                  <div className={filteredRequisitions.filter(r => r.status?.code === 'pendiente_autorizacion').length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        YA AUTORIZADAS ({filteredRequisitions.filter(r => r.status?.code !== 'pendiente_autorizacion').length})
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
                        {filteredRequisitions.filter(r => r.status?.code !== 'pendiente_autorizacion').map((req) => (
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
                                  {req.creator.nombre}
                                </p>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {req.creator.role?.nombreRol || 'Sin rol'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                              <div>
                                <p className="font-medium">{req.lastActionLabel || 'Autorizada'}</p>
                                <p className="text-xs">{formatDate(req.lastActionDate || req.updatedAt)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                  req.status?.code || 'pendiente'
                                )}`}
                              >
                                {req.status?.name || 'Pendiente'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>
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
                      <p className="font-medium">
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
                        {selectedRequisition.operationCenter.code}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Card de Progreso */}
                {!showConfirmation && (
                  <Card className="p-4 bg-amber-50 border-amber-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Progreso de Autorización
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Autoriza cada ítem individualmente o autoriza todos de una vez
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-bold text-green-700">{getItemsCount().approved}</p>
                          <p className="text-xs text-green-600">Autorizados</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-red-700">{getItemsCount().rejected}</p>
                          <p className="text-xs text-red-600">Rechazados</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-gray-700">{getItemsCount().pending}</p>
                          <p className="text-xs text-gray-600">Pendientes</p>
                        </div>
                      </div>
                    </div>
                    {getItemsCount().pending > 0 && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleApproveAll}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCheck className="h-4 w-4 mr-1" />
                          Autorizar Todo ({getItemsCount().pending})
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {/* Card de Elementos Solicitados con Autorización por Ítem */}
                {!showConfirmation ? (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Elementos Solicitados ({selectedRequisition.items.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedRequisition.items.map((item) => {
                        const reviewStatus = getItemReviewStatus(item.itemId);
                        return (
                          <div
                            key={item.itemId}
                            className={`border rounded-lg p-4 ${
                              reviewStatus?.status === 'approved'
                                ? 'border-green-300 bg-green-50'
                                : reviewStatus?.status === 'rejected'
                                ? 'border-red-300 bg-red-50'
                                : 'border-[hsl(var(--canalco-neutral-300))] bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-grow">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-bold text-lg text-[hsl(var(--canalco-primary))]">
                                    #{item.itemNumber}
                                  </span>
                                  {reviewStatus?.status === 'approved' && (
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                  )}
                                  {reviewStatus?.status === 'rejected' && (
                                    <XCircle className="h-5 w-5 text-red-600" />
                                  )}
                                  <span className="font-mono text-sm font-semibold">
                                    {item.material.code}
                                  </span>
                                  <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                    {item.material.materialGroup.name}
                                  </span>
                                </div>
                                <p className="text-base font-medium mb-1">
                                  {item.material.description}
                                </p>
                                <div className="flex gap-4 text-sm text-[hsl(var(--canalco-neutral-600))]">
                                  <span>
                                    <strong>Cantidad:</strong> {item.quantity}
                                  </span>
                                  {item.observation && (
                                    <span>
                                      <strong>Observación:</strong> {item.observation}
                                    </span>
                                  )}
                                </div>

                                {/* Comentarios si está rechazado */}
                                {reviewStatus?.status === 'rejected' && (
                                  <div className="mt-3">
                                    <Label className="text-xs text-red-700 font-semibold">
                                      Motivo del rechazo *
                                    </Label>
                                    <textarea
                                      placeholder="Explica por qué rechazas este ítem..."
                                      value={reviewStatus.comments}
                                      onChange={(e) =>
                                        handleUpdateItemComments(item.itemId, e.target.value)
                                      }
                                      rows={2}
                                      className="mt-1 w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Botones de acción */}
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveItem(item.itemId)}
                                  className={`${
                                    reviewStatus?.status === 'approved'
                                      ? 'bg-green-600 hover:bg-green-700'
                                      : 'bg-gray-200 text-gray-700 hover:bg-green-600 hover:text-white'
                                  }`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Autorizar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectItem(item.itemId)}
                                  className={`${
                                    reviewStatus?.status === 'rejected'
                                      ? 'bg-red-600 hover:bg-red-700'
                                      : 'bg-gray-200 text-gray-700 hover:bg-red-600 hover:text-white'
                                  }`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Rechazar
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Error de validación */}
                    {actionError && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{actionError}</p>
                      </div>
                    )}

                    {/* Botones de navegación */}
                    <div className="flex gap-3 justify-end mt-6">
                      <Button variant="outline" onClick={handleCloseDetail}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleOpenConfirmation}
                        disabled={!areAllItemsReviewed()}
                        className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-dark))]"
                      >
                        Finalizar Autorización
                      </Button>
                    </div>
                  </Card>
                ) : (
                  /* Confirmación Final */
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Confirmar Autorización
                    </h3>

                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${
                        getFinalDecision() === 'approve'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <p className="font-semibold mb-2">
                          {getFinalDecision() === 'approve' ? (
                            <span className="text-green-800">Todos los ítems autorizados</span>
                          ) : (
                            <span className="text-red-800">Requisición será rechazada</span>
                          )}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {getFinalDecision() === 'approve'
                            ? 'La requisición pasará al siguiente nivel de aprobación (Gerencia).'
                            : `${getItemsCount().rejected} ítem(es) rechazado(s). El creador podrá editar y volver a enviar la requisición.`}
                        </p>
                      </div>

                      {/* Resumen de comentarios */}
                      {getFinalDecision() === 'reject' && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <Label className="text-sm font-semibold mb-2 block">
                            Comentarios que se enviarán:
                          </Label>
                          <pre className="text-sm text-[hsl(var(--canalco-neutral-700))] whitespace-pre-wrap">
                            {consolidateComments()}
                          </pre>
                        </div>
                      )}

                      {actionError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">{actionError}</p>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setShowConfirmation(false)}
                          disabled={actionLoading}
                        >
                          Volver
                        </Button>
                        <Button
                          onClick={handleConfirmAction}
                          disabled={actionLoading}
                          className={
                            getFinalDecision() === 'approve'
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
                              {getFinalDecision() === 'approve' ? (
                                <CheckCircle className="h-4 w-4 mr-2" />
                              ) : (
                                <XCircle className="h-4 w-4 mr-2" />
                              )}
                              Confirmar {getFinalDecision() === 'approve' ? 'Autorización' : 'Rechazo'}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Sección de Firmas */}
                <Card className="p-6 bg-[hsl(var(--canalco-neutral-50))]">
                  <h3 className="text-lg font-semibold mb-4 text-[hsl(var(--canalco-neutral-900))]">
                    Firmas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Solicitado por - SIEMPRE se muestra */}
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

                    {/* Revisado por - actions: revisar_aprobar, revisar_aprobar_pendiente_autorizacion, revisar_rechazar */}
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

                    {/* Autorizado por - actions: autorizar_aprobar (newStatus = autorizado) */}
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

                    {/* Aprobado por (Gerencia) - action: aprobar_gerencia (newStatus = aprobada_gerencia) */}
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
    </div>
  );
};

export default AutorizarRequisicionesPage;
