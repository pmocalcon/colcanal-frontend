import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Edit, CheckCircle, XCircle, AlertCircle, Loader2, ArrowLeft, Check, X, CheckCheck } from 'lucide-react';
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
import { formatDate } from '@/utils/dateUtils';
import {
  getPendingActions,
  getRequisitionById,
  reviewRequisition,
  approveRequisition,
  rejectRequisition,
  type Requisition,
} from '@/services/requisition.service';
import { requisitionsService, type ItemApprovalResponse } from '@/services/requisitions.service';
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';
import { StatusDashboard, type StatusCount } from '@/components/ui/status-dashboard';
import { modulesService, type ModulePermissions } from '@/services/modules.service';

// Estado de aprobación por ítem
interface ItemReviewStatus {
  itemId: number;
  status: 'pending' | 'approved' | 'rejected';
  comments: string;
}

const RevisarRequisicionesPage: React.FC = () => {
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

  // Estados de revisión por ítem
  const [itemReviews, setItemReviews] = useState<ItemReviewStatus[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Usuario actual
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user?.nombreRol || '';

  // Permisos del usuario
  const [permissions, setPermissions] = useState<ModulePermissions | null>(null);

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Cargar permisos del usuario
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const modules = await modulesService.getUserModules();
        const comprasModule = modules.find(
          (m) => m.slug === 'compras' || m.nombre.toLowerCase().includes('compras')
        );
        if (comprasModule) {
          setPermissions(comprasModule.permisos);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      }
    };
    fetchPermissions();
  }, []);

  // Cargar requisiciones pendientes
  const loadPendingRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPendingActions({ page, limit: 100 });

      // Filtrar según permisos del usuario
      let filteredData = response.data;

      if (permissions) {
        // Si tiene permiso de aprobar pero NO de revisar: solo ve estado 'autorizado'
        if (permissions.aprobar && !permissions.revisar) {
          filteredData = response.data.filter(
            (req) => req.status?.code === 'autorizado' || req.status?.code === 'aprobada_gerencia'
          );
        }
        // Si tiene permiso de revisar pero NO de aprobar: ve estados pendientes y ya revisados
        else if (permissions.revisar && !permissions.aprobar) {
          filteredData = response.data.filter(
            (req) => ['pendiente', 'en_revision', 'aprobada_revisor', 'pendiente_autorizacion', 'autorizado', 'aprobada_gerencia', 'rechazada_revisor'].includes(req.status?.code || '')
          );
        }
        // Si tiene ambos permisos: ve todo
      }

      setRequisitions(filteredData);
      setTotalPages(Math.ceil(filteredData.length / 10));
    } catch (err: any) {
      console.error('Error loading pending requisitions:', err);
      setError(err.response?.data?.message || 'Error al cargar las requisiciones pendientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (permissions !== null) {
      loadPendingRequisitions();
    }
  }, [page, permissions]);

  // Ver detalle
  const handleViewDetail = async (requisition: Requisition) => {
    try {
      setDetailLoading(true);
      setShowDetail(true);
      setShowConfirmation(false);
      const fullRequisition = await getRequisitionById(requisition.requisitionId);

      // DEBUG: Log para ver qué datos vienen del backend
      console.log('📋 Requisition data (Revisar):', fullRequisition);
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

      // Determinar nivel de aprobación según el estado de la requisición
      let approvalLevel: 'reviewer' | 'management' | undefined;
      if (fullRequisition.status?.code === 'en_revision') {
        approvalLevel = 'reviewer';
      } else if (fullRequisition.status?.code === 'aprobada_revisor') {
        approvalLevel = 'management';
      }

      // Cargar aprobaciones previas si existen
      let previousApprovals: ItemApprovalResponse[] = [];
      if (approvalLevel) {
        try {
          previousApprovals = await requisitionsService.getItemApprovals(
            fullRequisition.requisitionId,
            approvalLevel
          );
        } catch (err) {
          console.log('No previous approvals found or error loading them:', err);
        }
      }

      // Inicializar estados de revisión para cada ítem, pre-cargando aprobaciones previas
      const initialReviews: ItemReviewStatus[] = fullRequisition.items.map((item) => {
        // Buscar aprobación previa para este ítem
        const previousApproval = previousApprovals.find(
          (approval) =>
            approval.materialId === item.materialId &&
            approval.itemNumber === item.itemNumber &&
            approval.isValid
        );

        if (previousApproval) {
          return {
            itemId: item.itemId,
            status: previousApproval.status === 'approved' ? 'approved' : 'rejected',
            comments: previousApproval.comments || '',
          };
        }

        return {
          itemId: item.itemId,
          status: 'pending',
          comments: '',
        };
      });
      setItemReviews(initialReviews);
    } catch (err: any) {
      console.error('Error loading requisition detail:', err);
      alert('Error al cargar el detalle de la requisición');
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Cerrar detalle
  const handleCloseDetail = () => {
    setShowDetail(false);
    setShowConfirmation(false);
    setSelectedRequisition(null);
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
      return 'Todos los ítems aprobados';
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
      const isGerencia = userRole === 'Gerencia';

      if (isGerencia) {
        if (finalDecision === 'approve') {
          await approveRequisition(selectedRequisition.requisitionId, {
            comments: consolidatedComments,
          });
        } else {
          await rejectRequisition(selectedRequisition.requisitionId, {
            comments: consolidatedComments,
          });
        }
      } else {
        await reviewRequisition(selectedRequisition.requisitionId, {
          decision: finalDecision,
          comments: consolidatedComments,
        });
      }

      // Cerrar y recargar
      handleCloseDetail();
      loadPendingRequisitions();

      alert(
        finalDecision === 'approve'
          ? 'Requisición aprobada exitosamente'
          : 'Requisición rechazada exitosamente. El creador podrá editarla y volver a enviarla.'
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

  // Color de estado
  const getStatusColor = (statusCode: string) => {
    const colors: Record<string, string> = {
      pendiente: 'bg-gray-100 text-gray-800',
      pendiente_validacion: 'bg-indigo-100 text-indigo-800',
      en_revision: 'bg-blue-100 text-blue-800',
      aprobada_revisor: 'bg-green-100 text-green-800',
      pendiente_autorizacion: 'bg-amber-100 text-amber-800',
      autorizado: 'bg-lime-100 text-lime-800',
      aprobada_gerencia: 'bg-emerald-100 text-emerald-800',
      rechazada_validador: 'bg-pink-100 text-pink-800',
      rechazada_revisor: 'bg-orange-100 text-orange-800',
      rechazada_autorizador: 'bg-amber-100 text-amber-800',
      rechazada_gerencia: 'bg-red-100 text-red-800',
    };
    return colors[statusCode] || 'bg-gray-100 text-gray-800';
  };

  // Removed formatDate - using utility from dateUtils

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
        endDate.setHours(23, 59, 59, 999); // Incluir todo el día
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
                {permissions?.aprobar && !permissions?.revisar ? 'Aprobar Requisiciones' : 'Revisar Requisiciones'}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {permissions?.aprobar && !permissions?.revisar
                  ? 'Requisiciones listas para aprobación'
                  : 'Requisiciones pendientes de revisión o aprobación'}
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
          // Calcular pendientes por estado
          const statusCounts = requisitions.reduce((acc, req) => {
            if (req.isPending) {
              const statusCode = req.status?.code || 'pendiente';
              const statusName = req.status?.name || 'Pendiente';
              if (!acc[statusCode]) {
                acc[statusCode] = { status: statusCode, statusLabel: statusName, count: 0 };
              }
              acc[statusCode].count++;
            }
            return acc;
          }, {} as Record<string, StatusCount>);

          // Calcular vencidos
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
                    ? 'No hay requisiciones pendientes'
                    : 'No se encontraron requisiciones con los filtros aplicados'}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
                  {requisitions.length === 0
                    ? 'Todas las requisiciones asignadas han sido procesadas.'
                    : 'Intenta ajustar los filtros para ver más resultados.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                {/* Pending Requisitions Section */}
                {filteredRequisitions.filter(r => ['pendiente', 'en_revision'].includes(r.status?.code || '')).length > 0 && (
                  <div>
                    <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
                      <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        PENDIENTES ({filteredRequisitions.filter(r => ['pendiente', 'en_revision'].includes(r.status?.code || '')).length})
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
                        {filteredRequisitions.filter(r => ['pendiente', 'en_revision'].includes(r.status?.code || '')).sort((a, b) => {
                          // Urgentes primero
                          if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                          if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                          // Luego por fecha de creación (más recientes primero)
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        }).map((req) => (
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
                                          {req.daysRemaining} día{req.daysRemaining !== 1 ? 's' : ''} hábil{req.daysRemaining !== 1 ? 'es' : ''} restante{req.daysRemaining !== 1 ? 's' : ''}
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
                                  className="hover:bg-blue-50"
                                  title={userRole.includes('Director') ? 'Revisar' : 'Aprobar'}
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

                {/* Processed Requisitions Section */}
                {filteredRequisitions.filter(r => !['pendiente', 'en_revision'].includes(r.status?.code || '')).length > 0 && (
                  <div className={filteredRequisitions.filter(r => ['pendiente', 'en_revision'].includes(r.status?.code || '')).length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        YA REVISADAS ({filteredRequisitions.filter(r => !['pendiente', 'en_revision'].includes(r.status?.code || '')).length})
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
                        {filteredRequisitions.filter(r => !['pendiente', 'en_revision'].includes(r.status?.code || '')).sort((a, b) => {
                          // Urgentes primero
                          if (a.priority === 'alta' && b.priority !== 'alta') return -1;
                          if (a.priority !== 'alta' && b.priority === 'alta') return 1;
                          // Luego por fecha de creación (más recientes primero)
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
                                <p className="font-medium">{req.lastActionLabel || 'Procesada'}</p>
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
                                          {req.daysRemaining} día{req.daysRemaining !== 1 ? 's' : ''} hábil{req.daysRemaining !== 1 ? 'es' : ''} restante{req.daysRemaining !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewDetail(req)}
                                  className={`hover:bg-orange-50 ${req.status?.code === 'aprobada_gerencia' || req.status?.code === 'cotizada' || req.status?.code === 'en_orden_compra' || req.status?.code === 'pendiente_recepcion' || req.status?.code === 'en_recepcion' || req.status?.code === 'recepcion_completa' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={req.status?.code === 'aprobada_gerencia' || req.status?.code === 'cotizada' || req.status?.code === 'en_orden_compra' || req.status?.code === 'pendiente_recepcion' || req.status?.code === 'en_recepcion' || req.status?.code === 'recepcion_completa' ? 'No se puede re-revisar (aprobación final completada)' : 'Re-revisar / Aprobar o Rechazar'}
                                  disabled={req.status?.code === 'aprobada_gerencia' || req.status?.code === 'cotizada' || req.status?.code === 'en_orden_compra' || req.status?.code === 'pendiente_recepcion' || req.status?.code === 'en_recepcion' || req.status?.code === 'recepcion_completa'}
                                >
                                  <Edit className="w-4 h-4 text-orange-600" />
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
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">
                          Progreso de Revisión
                        </p>
                        <p className="text-xs text-blue-700 mt-1">
                          Revisa cada ítem individualmente o aprueba todos de una vez
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-bold text-green-700">{getItemsCount().approved}</p>
                          <p className="text-xs text-green-600">Aprobados</p>
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
                          Aprobar Todo ({getItemsCount().pending})
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {/* Card de Materiales con Revisión por Ítem */}
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
                                  Aprobar
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
                        Finalizar Revisión
                      </Button>
                    </div>
                  </Card>
                ) : (
                  /* Confirmación Final */
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Confirmar Revisión
                    </h3>

                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${
                        getFinalDecision() === 'approve'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <p className="font-semibold mb-2">
                          {getFinalDecision() === 'approve' ? (
                            <span className="text-green-800">✅ Todos los ítems aprobados</span>
                          ) : (
                            <span className="text-red-800">❌ Requisición será rechazada</span>
                          )}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {getFinalDecision() === 'approve'
                            ? 'La requisición pasará al siguiente nivel de aprobación.'
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
                              Confirmar {getFinalDecision() === 'approve' ? 'Aprobación' : 'Rechazo'}
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
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

                    {/* Validado por - action: validar or previousStatus='pendiente_validacion' and newStatus='pendiente' */}
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

                {/* Nota sobre notificaciones por email */}
                <div className="text-xs text-[hsl(var(--canalco-neutral-500))] text-center">
                  💡 Nota: Las notificaciones por correo electrónico se implementarán próximamente
                </div>
              </>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

export default RevisarRequisicionesPage;
