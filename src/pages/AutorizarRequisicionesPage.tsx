import React, { useState, useEffect, useMemo } from 'react';
import { Eye, CheckCircle, XCircle, AlertCircle, Loader2, ArrowLeft, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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

  // Estados de autorización
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionType, setActionType] = useState<'authorize' | 'reject'>('authorize');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comments, setComments] = useState('');

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

  // Cargar requisiciones pendientes de autorización
  const loadPendingRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPendingActions({ page, limit: 100 });

      // DEBUG: Log para ver qué está devolviendo la API
      console.log('🔍 getPendingActions response:', response);
      console.log('🔍 Total requisitions returned:', response.data.length);
      console.log('🔍 All statuses:', response.data.map(r => r.status?.code));

      // Filtrar solo las que están pendientes de autorización
      const pendingAuth = response.data.filter(
        (req) => req.status?.code === 'pendiente_autorizacion'
      );

      console.log('🔍 Filtered pendiente_autorizacion:', pendingAuth.length);
      console.log('🔍 Pending auth requisitions:', pendingAuth);

      setRequisitions(pendingAuth);
      setTotalPages(response.totalPages);
      setTotal(pendingAuth.length);
    } catch (err: any) {
      console.error('❌ Error loading pending requisitions:', err);
      console.error('❌ Error details:', err.response?.data);
      setError(err.response?.data?.message || 'Error al cargar las requisiciones pendientes');
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
      setComments('');
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
    setActionError(null);
  };

  // Abrir confirmación
  const handleOpenConfirmation = (action: 'authorize' | 'reject') => {
    setActionType(action);
    setActionError(null);
    setShowConfirmation(true);
  };

  // Confirmar y enviar
  const handleConfirmAction = async () => {
    if (!selectedRequisition) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const data: AuthorizeRequisitionDto = {
        decision: actionType,
        comments: comments.trim() || undefined,
      };

      await authorizeRequisition(selectedRequisition.requisitionId, data);

      // Cerrar y recargar
      handleCloseDetail();
      loadPendingRequisitions();

      alert(
        actionType === 'authorize'
          ? 'Requisición autorizada exitosamente'
          : 'Requisición rechazada. El creador podrá corregirla y reenviarla.'
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
      en_revision: 'bg-blue-100 text-blue-800',
      aprobada_revisor: 'bg-green-100 text-green-800',
      pendiente_autorizacion: 'bg-amber-100 text-amber-800',
      autorizado: 'bg-lime-100 text-lime-800',
      aprobada_gerencia: 'bg-emerald-100 text-emerald-800',
      rechazada_revisor: 'bg-orange-100 text-orange-800',
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
          // Calcular vencidos
          const overdueCount = requisitions.filter(req => req.isOverdue).length;

          const statusCounts: StatusCount[] = [];
          if (requisitions.length > 0) {
            statusCounts.push({
              status: 'pendiente_autorizacion',
              statusLabel: 'Pendiente de Autorización',
              count: requisitions.length,
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
                    ? 'No hay requisiciones pendientes de autorización'
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
                    {filteredRequisitions.map((req) => (
                      <TableRow key={req.requisitionId} className="bg-white hover:bg-orange-50/30">
                        <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                          {req.requisitionNumber}
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
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <div className="grid grid-cols-3 gap-4">
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
                        Centro de Operación
                      </Label>
                      <p className="font-medium">
                        {selectedRequisition.operationCenter.code}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Card de Elementos Solicitados */}
                {!showConfirmation ? (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Elementos Solicitados ({selectedRequisition.items.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedRequisition.items.map((item) => {
                        return (
                          <div
                            key={item.itemId}
                            className="border rounded-lg p-4 border-[hsl(var(--canalco-neutral-300))] bg-white"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-grow">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-bold text-lg text-[hsl(var(--canalco-primary))]">
                                    #{item.itemNumber}
                                  </span>
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
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex gap-4 mt-6">
                      <Button
                        onClick={() => handleOpenConfirmation('authorize')}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Autorizar
                      </Button>
                      <Button
                        onClick={() => handleOpenConfirmation('reject')}
                        variant="outline"
                        className="flex-1 border-red-600 text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Rechazar
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      {actionType === 'authorize' ? '✓ Autorizar Requisición' : '✗ Rechazar Requisición'}
                    </h3>

                    {actionError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {actionError}
                      </div>
                    )}

                    <div className="mb-4">
                      <Label>Comentarios {actionType === 'reject' ? '(requerido)' : '(opcional)'}</Label>
                      <Textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder={
                          actionType === 'authorize'
                            ? 'Agregar comentarios opcionales...'
                            : 'Explica por qué rechazas esta requisición...'
                        }
                        rows={4}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex gap-4">
                      <Button
                        onClick={() => setShowConfirmation(false)}
                        variant="outline"
                        className="flex-1"
                        disabled={actionLoading}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleConfirmAction}
                        className={`flex-1 ${
                          actionType === 'authorize'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        } text-white`}
                        disabled={actionLoading || (actionType === 'reject' && !comments.trim())}
                      >
                        {actionLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : actionType === 'authorize' ? (
                          <Check className="h-4 w-4 mr-2" />
                        ) : (
                          <X className="h-4 w-4 mr-2" />
                        )}
                        Confirmar {actionType === 'authorize' ? 'Autorización' : 'Rechazo'}
                      </Button>
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
                        {selectedRequisition.creator.role?.nombreRol || 'Sin rol'}
                      </p>
                    </div>

                    {/* Revisado por - solo si existe */}
                    {selectedRequisition.logs?.find(
                      (log) => log.action === 'revisar_aprobar' && log.newStatus === 'aprobada_revisor'
                    ) && (
                      <div className="border-l-4 border-blue-500 pl-4">
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                          Revisado por
                        </p>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {selectedRequisition.logs.find(
                            (log) => log.action === 'revisar_aprobar' && log.newStatus === 'aprobada_revisor'
                          )?.user.nombre}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {selectedRequisition.logs.find(
                            (log) => log.action === 'revisar_aprobar' && log.newStatus === 'aprobada_revisor'
                          )?.user.role?.nombreRol || 'Sin rol'}
                        </p>
                      </div>
                    )}

                    {/* Autorizado por - solo si existe */}
                    {selectedRequisition.logs?.find((log) => log.action === 'autorizar') && (
                      <div className="border-l-4 border-amber-500 pl-4">
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                          Autorizado por
                        </p>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {selectedRequisition.logs.find((log) => log.action === 'autorizar')?.user.nombre}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {selectedRequisition.logs.find((log) => log.action === 'autorizar')?.user.role?.nombreRol || 'Sin rol'}
                        </p>
                      </div>
                    )}

                    {/* Aprobado por - solo si existe */}
                    {selectedRequisition.logs?.find(
                      (log) => log.action === 'aprobar_gerencia' && log.newStatus === 'aprobada_gerencia'
                    ) && (
                      <div className="border-l-4 border-green-500 pl-4">
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                          Aprobado por
                        </p>
                        <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {selectedRequisition.logs.find(
                            (log) => log.action === 'aprobar_gerencia' && log.newStatus === 'aprobada_gerencia'
                          )?.user.nombre}
                        </p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {selectedRequisition.logs.find(
                            (log) => log.action === 'aprobar_gerencia' && log.newStatus === 'aprobada_gerencia'
                          )?.user.role?.nombreRol || 'Sin rol'}
                        </p>
                      </div>
                    )}
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
