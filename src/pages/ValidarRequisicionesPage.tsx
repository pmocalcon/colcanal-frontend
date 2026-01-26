import React, { useState, useEffect, useMemo } from 'react';
import { Eye, CheckCircle, AlertCircle, Loader2, ArrowLeft, Check, X, Building2, CheckCheck } from 'lucide-react';
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
import { usersService, type User } from '@/services/users.service';

// Estado de validación por ítem
interface ItemValidationStatus {
  itemId: number;
  status: 'pending' | 'validated' | 'rejected';
  comments: string;
}

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

  // Estado de validación por ítem
  const [itemValidations, setItemValidations] = useState<ItemValidationStatus[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Datos reales del revisor y aprobador (obtenidos por ID)
  const [reviewerUser, setReviewerUser] = useState<User | null>(null);
  const [approverUser, setApproverUser] = useState<User | null>(null);

  // Cargar datos reales del revisor y aprobador por ID
  useEffect(() => {
    const loadUserData = async () => {
      if (selectedRequisition?.reviewedBy) {
        try {
          const userData = await usersService.getById(selectedRequisition.reviewedBy);
          setReviewerUser(userData);
        } catch (err) {
          console.error('Error loading reviewer:', err);
        }
      } else {
        setReviewerUser(null);
      }
      if (selectedRequisition?.approvedBy) {
        try {
          const userData = await usersService.getById(selectedRequisition.approvedBy);
          setApproverUser(userData);
        } catch (err) {
          console.error('Error loading approver:', err);
        }
      } else {
        setApproverUser(null);
      }
    };
    loadUserData();
  }, [selectedRequisition?.reviewedBy, selectedRequisition?.approvedBy]);

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
      const fullRequisition = await getRequisitionById(requisition.requisitionId);
      setSelectedRequisition(fullRequisition);
      setActionError(null);

      // Inicializar estados de validación para cada ítem
      const initialValidations: ItemValidationStatus[] = fullRequisition.items.map((item) => ({
        itemId: item.itemId,
        status: 'pending',
        comments: '',
      }));
      setItemValidations(initialValidations);
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
    setItemValidations([]);
    setActionError(null);
  };

  // Validar un ítem
  const handleValidateItem = (itemId: number) => {
    setItemValidations((prev) =>
      prev.map((validation) =>
        validation.itemId === itemId
          ? { ...validation, status: 'validated', comments: '' }
          : validation
      )
    );
  };

  // Rechazar un ítem
  const handleRejectItem = (itemId: number) => {
    setItemValidations((prev) =>
      prev.map((validation) =>
        validation.itemId === itemId
          ? { ...validation, status: 'rejected' }
          : validation
      )
    );
  };

  // Actualizar comentarios de un ítem
  const handleUpdateItemComments = (itemId: number, comments: string) => {
    setItemValidations((prev) =>
      prev.map((validation) =>
        validation.itemId === itemId ? { ...validation, comments } : validation
      )
    );
  };

  // Validar todos los ítems pendientes
  const handleValidateAll = () => {
    setItemValidations((prev) =>
      prev.map((validation) =>
        validation.status === 'pending'
          ? { ...validation, status: 'validated', comments: '' }
          : validation
      )
    );
  };

  // Validar que todos los ítems tengan una decisión
  const areAllItemsReviewed = () => {
    return itemValidations.every((validation) => validation.status !== 'pending');
  };

  // Validar que ítems rechazados tengan comentarios
  const validateRejectedItems = (): string | null => {
    const rejectedWithoutComments = itemValidations.filter(
      (validation) => validation.status === 'rejected' && !validation.comments.trim()
    );

    if (rejectedWithoutComments.length > 0) {
      return 'Los ítems rechazados deben tener comentarios explicando el motivo';
    }

    return null;
  };

  // Calcular decisión final
  const getFinalDecision = (): 'validate' | 'reject' => {
    const hasRejected = itemValidations.some((validation) => validation.status === 'rejected');
    return hasRejected ? 'reject' : 'validate';
  };

  // Consolidar comentarios
  const consolidateComments = (): string => {
    const decision = getFinalDecision();

    if (decision === 'validate') {
      return 'Todos los ítems validados';
    }

    // Requisición rechazada: consolidar comentarios de ítems rechazados
    const rejectedItems = itemValidations.filter((validation) => validation.status === 'rejected');

    if (rejectedItems.length === 0) return '';

    const itemsWithComments = rejectedItems.map((validation) => {
      const item = selectedRequisition?.items?.find((i) => i.itemId === validation.itemId);
      return `Ítem ${item?.itemNumber || '?'} (${item?.material?.code || '?'}): ${validation.comments}`;
    });

    return `Requisición rechazada. Motivos:\n${itemsWithComments.join('\n')}`;
  };

  // Obtener estado de validación de un ítem
  const getItemValidationStatus = (itemId: number) => {
    return itemValidations.find((validation) => validation.itemId === itemId);
  };

  // Contar ítems por estado
  const getItemsCount = () => {
    const validated = itemValidations.filter((v) => v.status === 'validated').length;
    const rejected = itemValidations.filter((v) => v.status === 'rejected').length;
    const pending = itemValidations.filter((v) => v.status === 'pending').length;
    return { validated, rejected, pending };
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

  // Confirmar acción
  const handleConfirmAction = async () => {
    if (!selectedRequisition) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const finalDecision = getFinalDecision();
      const consolidatedComments = consolidateComments();

      const data: ValidateRequisitionDto = {
        decision: finalDecision,
        comments: consolidatedComments || undefined,
      };

      await validateRequisition(selectedRequisition.requisitionId, data);

      // Cerrar y recargar
      handleCloseDetail();
      await loadPendingRequisitions();

      // Mostrar mensaje de éxito
      alert(
        finalDecision === 'validate'
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
                {filteredRequisitions.filter(r => r.isPending).length > 0 && (
                  <div>
                    <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2">
                      <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        PENDIENTES DE VALIDACIÓN ({filteredRequisitions.filter(r => r.isPending).length})
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
                        {filteredRequisitions.filter(r => r.isPending).sort((a, b) => {
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
                {filteredRequisitions.filter(r => !r.isPending).length > 0 && (
                  <div className={filteredRequisitions.filter(r => r.isPending).length > 0 ? 'border-t-4 border-[hsl(var(--canalco-neutral-200))]' : ''}>
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        YA VALIDADAS ({filteredRequisitions.filter(r => !r.isPending).length})
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
                        {filteredRequisitions.filter(r => !r.isPending).sort((a, b) => {
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

                {/* Card de Progreso */}
                {!showConfirmation && (
                  <Card className="p-4 bg-indigo-50 border-indigo-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-indigo-900">
                          Progreso de Validación
                        </p>
                        <p className="text-xs text-indigo-700 mt-1">
                          Valida cada ítem individualmente o valida todos de una vez
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-bold text-green-700">{getItemsCount().validated}</p>
                          <p className="text-xs text-green-600">Validados</p>
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
                          onClick={handleValidateAll}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCheck className="h-4 w-4 mr-1" />
                          Validar Todo ({getItemsCount().pending})
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {/* Card de Materiales con Validación por Ítem */}
                {!showConfirmation ? (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Elementos Solicitados ({selectedRequisition.items?.length || 0})
                    </h3>
                    <div className="space-y-4">
                      {selectedRequisition.items?.map((item) => {
                        const validationStatus = getItemValidationStatus(item.itemId);
                        return (
                          <div
                            key={item.itemId}
                            className={`border rounded-lg p-4 ${
                              validationStatus?.status === 'validated'
                                ? 'border-green-300 bg-green-50'
                                : validationStatus?.status === 'rejected'
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
                                  {validationStatus?.status === 'validated' && (
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                  )}
                                  <span className="font-mono text-sm font-semibold">
                                    {item.material?.code}
                                  </span>
                                  <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                                    {item.material?.materialGroup?.name || '-'}
                                  </span>
                                </div>
                                <p className="text-base font-medium mb-1">
                                  {item.material?.description}
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
                                {validationStatus?.status === 'rejected' && (
                                  <div className="mt-3">
                                    <Label className="text-xs text-red-700 font-semibold">
                                      Motivo del rechazo *
                                    </Label>
                                    <textarea
                                      placeholder="Explica por qué rechazas este ítem..."
                                      value={validationStatus.comments}
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
                                  onClick={() => handleValidateItem(item.itemId)}
                                  className={`${
                                    validationStatus?.status === 'validated'
                                      ? 'bg-green-600 hover:bg-green-700'
                                      : 'bg-gray-200 text-gray-700 hover:bg-green-600 hover:text-white'
                                  }`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Validar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectItem(item.itemId)}
                                  className={`${
                                    validationStatus?.status === 'rejected'
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
                        Finalizar Validación
                      </Button>
                    </div>
                  </Card>
                ) : (
                  /* Confirmación Final */
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Confirmar Validación
                    </h3>

                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${
                        getFinalDecision() === 'validate'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <p className="font-semibold mb-2">
                          {getFinalDecision() === 'validate' ? (
                            <span className="text-green-800">✅ Todos los ítems validados</span>
                          ) : (
                            <span className="text-red-800">❌ Requisición será rechazada</span>
                          )}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {getFinalDecision() === 'validate'
                            ? 'La requisición será validada y pasará a revisión por el Director Técnico.'
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
                            getFinalDecision() === 'validate'
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
                              {getFinalDecision() === 'validate' ? (
                                <CheckCircle className="h-4 w-4 mr-2" />
                              ) : (
                                <X className="h-4 w-4 mr-2" />
                              )}
                              Confirmar {getFinalDecision() === 'validate' ? 'Validación' : 'Rechazo'}
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

                    {/* Revisado por - Solo si reviewedBy existe Y es diferente al creador */}
                    {selectedRequisition.reviewedBy && (!selectedRequisition.creator?.userId || selectedRequisition.reviewedBy !== selectedRequisition.creator.userId) ? (
                      <div className="border-l-4 border-blue-500 pl-4">
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                          Revisado por
                        </p>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {selectedRequisition.reviewer?.nombre || reviewerUser?.nombre || 'Andrés Gómez'}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {selectedRequisition.reviewer?.cargo || reviewerUser?.cargo || 'Director Técnico'}
                        </p>
                      </div>
                    ) : null}

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

                    {/* Aprobado por - Solo si approvedBy NO es NULL */}
                    {selectedRequisition.approvedBy ? (
                      <div className="border-l-4 border-green-500 pl-4">
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                          Aprobado por
                        </p>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {approverUser?.nombre || 'Gerencia'}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {approverUser?.cargo || 'Gerencia'}
                        </p>
                      </div>
                    ) : null}
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
