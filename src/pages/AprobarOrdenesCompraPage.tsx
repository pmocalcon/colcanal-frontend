import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle, XCircle, AlertCircle, Loader2, ArrowLeft, Check, X, Clock, RefreshCw } from 'lucide-react';
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
  getPendingPurchaseOrdersForApproval,
  getPurchaseOrderForApproval,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type ApprovePurchaseOrderDto,
} from '@/services/purchase-orders.service';
import { StatusDashboard, type StatusCount } from '@/components/ui/status-dashboard';

// Estado de aprobación por ítem
interface ItemApprovalStatus {
  poItemId: number;
  status: 'pending' | 'approved' | 'rejected';
  comments: string;
}

const AprobarOrdenesCompraPage: React.FC = () => {
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Paginación para sección de procesadas (10 por página)
  const [processedPage, setProcessedPage] = useState(1);
  const processedLimit = 10;

  // Detalle de orden de compra
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Estados de aprobación por ítem
  const [itemApprovals, setItemApprovals] = useState<ItemApprovalStatus[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generalComments, setGeneralComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Usuario actual
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isGerencia = user?.nombreRol === 'Gerencia';

  // Cargar órdenes de compra pendientes
  const loadPendingPurchaseOrders = async () => {
    if (!isGerencia) {
      setError('Solo el rol Gerencia puede aprobar órdenes de compra');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getPendingPurchaseOrdersForApproval(page, 10);
      setPurchaseOrders(response.data);
      setTotalPages(response.totalPages);
      setTotal(response.total);
    } catch (err: any) {
      console.error('Error loading pending purchase orders:', err);
      const errorMessage = err.response?.data?.message || 'Error al cargar las órdenes de compra pendientes';

      // Mostrar mensaje específico para errores de autorización
      if (err.response?.status === 401) {
        setError('Su sesión ha expirado. Por favor, vuelva a iniciar sesión.');
      } else if (err.response?.status === 403) {
        setError('Solo el rol Gerencia puede aprobar órdenes de compra');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingPurchaseOrders();
  }, [page]);

  // Ver detalle
  const handleViewDetail = async (po: PurchaseOrder) => {
    try {
      setDetailLoading(true);
      setShowDetail(true);
      setShowConfirmation(false);
      const fullPO = await getPurchaseOrderForApproval(po.purchaseOrderId);
      setSelectedPO(fullPO);

      // Inicializar estados de aprobación para cada ítem
      const initialApprovals: ItemApprovalStatus[] = (fullPO.items || []).map((item) => ({
        poItemId: item.poItemId,
        status: 'pending',
        comments: '',
      }));
      setItemApprovals(initialApprovals);
      setGeneralComments('');
      setRejectionReason('');
    } catch (err: any) {
      console.error('Error loading purchase order detail:', err);
      alert('Error al cargar el detalle de la orden de compra');
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Cerrar detalle
  const handleCloseDetail = () => {
    setShowDetail(false);
    setShowConfirmation(false);
    setSelectedPO(null);
    setItemApprovals([]);
    setActionError(null);
    setGeneralComments('');
    setRejectionReason('');
  };

  // Aprobar un ítem
  const handleApproveItem = (poItemId: number) => {
    setItemApprovals((prev) =>
      prev.map((approval) =>
        approval.poItemId === poItemId
          ? { ...approval, status: 'approved', comments: '' }
          : approval
      )
    );
  };

  // Rechazar un ítem
  const handleRejectItem = (poItemId: number) => {
    setItemApprovals((prev) =>
      prev.map((approval) =>
        approval.poItemId === poItemId
          ? { ...approval, status: 'rejected' }
          : approval
      )
    );
  };

  // Actualizar comentarios de un ítem
  const handleUpdateItemComments = (poItemId: number, comments: string) => {
    setItemApprovals((prev) =>
      prev.map((approval) =>
        approval.poItemId === poItemId ? { ...approval, comments } : approval
      )
    );
  };

  // Aprobar todos los ítems pendientes
  const handleApproveAll = () => {
    setItemApprovals((prev) =>
      prev.map((approval) =>
        approval.status === 'pending'
          ? { ...approval, status: 'approved', comments: '' }
          : approval
      )
    );
  };

  // Validar que todos los ítems tengan una decisión
  const areAllItemsReviewed = () => {
    return itemApprovals.every((approval) => approval.status !== 'pending');
  };

  // Validar que ítems rechazados tengan comentarios o que haya razón de rechazo general
  const validateRejections = (): string | null => {
    const hasRejected = itemApprovals.some((approval) => approval.status === 'rejected');

    if (hasRejected && !rejectionReason.trim()) {
      return 'Debe proporcionar una razón de rechazo cuando se rechaza algún ítem';
    }

    return null;
  };

  // Calcular decisión final
  const getFinalDecision = (): 'approve' | 'reject' => {
    const hasRejected = itemApprovals.some((approval) => approval.status === 'rejected');
    return hasRejected ? 'reject' : 'approve';
  };

  // Abrir confirmación
  const handleOpenConfirmation = () => {
    // Validar que todos los ítems estén revisados
    if (!areAllItemsReviewed()) {
      setActionError('Debes revisar todos los ítems antes de continuar');
      return;
    }

    // Validar rechazos
    const validationError = validateRejections();
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setActionError(null);
    setShowConfirmation(true);
  };

  // Confirmar y enviar
  const handleConfirmAction = async () => {
    if (!selectedPO) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const finalDecision = getFinalDecision();

      const approvalDto: ApprovePurchaseOrderDto = {
        items: itemApprovals.map((approval) => ({
          poItemId: approval.poItemId,
          decision: approval.status === 'approved' ? 'approved' : 'rejected',
          comments: approval.comments || undefined,
        })),
        generalComments: generalComments || undefined,
        rejectionReason: finalDecision === 'reject' ? rejectionReason : undefined,
      };

      await approvePurchaseOrder(selectedPO.purchaseOrderId, approvalDto);

      // Cerrar y recargar
      handleCloseDetail();
      loadPendingPurchaseOrders();

      alert(
        finalDecision === 'approve'
          ? 'Orden de compra aprobada exitosamente'
          : 'Orden de compra rechazada. El departamento de Compras podrá corregirla y reenviarla.'
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
  const getStatusColor = (status?: string) => {
    const colors: Record<string, string> = {
      pendiente_aprobacion_gerencia: 'bg-orange-100 text-orange-800',
      aprobada_gerencia: 'bg-green-100 text-green-800',
      rechazada_gerencia: 'bg-red-100 text-red-800',
      en_recepcion: 'bg-blue-100 text-blue-800',
      completada: 'bg-emerald-100 text-emerald-800',
    };
    return colors[status || ''] || 'bg-gray-100 text-gray-800';
  };

  // Obtener estado de aprobación de un ítem
  const getItemApprovalStatus = (poItemId: number) => {
    return itemApprovals.find((approval) => approval.poItemId === poItemId);
  };

  // Contar ítems por estado
  const getItemsCount = () => {
    const approved = itemApprovals.filter((r) => r.status === 'approved').length;
    const rejected = itemApprovals.filter((r) => r.status === 'rejected').length;
    const pending = itemApprovals.filter((r) => r.status === 'pending').length;
    return { approved, rejected, pending };
  };

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Formatear deadline
  const formatDeadline = (po: PurchaseOrder) => {
    if (!po.deadline) return '-';

    const deadlineDate = new Date(po.deadline);
    const now = new Date();

    if (po.isOverdue) {
      return (
        <span className="text-red-600 font-semibold flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          VENCIDO ({po.daysOverdue} {po.daysOverdue === 1 ? 'día' : 'días'})
        </span>
      );
    }

    return (
      <span className="text-green-600 font-medium flex items-center gap-1">
        <Clock className="h-4 w-4" />
        {formatDate(deadlineDate)}
      </span>
    );
  };

  if (loading && purchaseOrders.length === 0) {
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
                Aprobar Órdenes de Compra
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Historial completo de aprobaciones: pendientes y procesadas
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
            Total: <span className="font-semibold text-[hsl(var(--canalco-primary))]">{total}</span> órdenes de compra (
            <span className="text-orange-600 font-semibold">
              {purchaseOrders.filter((po) => po.approvalStatus?.code === 'pendiente_aprobacion_gerencia').length} pendientes
            </span>
            {' y '}
            <span className="text-green-600 font-semibold">
              {purchaseOrders.filter((po) => po.approvalStatus?.code === 'aprobada_gerencia' || po.approvalStatus?.code === 'rechazada_gerencia').length} procesadas
            </span>
            )
          </p>
        </div>

        {/* Dashboard de Estado */}
        {!showDetail && (() => {
          // Calcular pendientes por estado
          const pendingPOs = purchaseOrders.filter((po) => po.approvalStatus?.code === 'pendiente_aprobacion_gerencia');

          const statusCounts: StatusCount[] = [];
          if (pendingPOs.length > 0) {
            statusCounts.push({
              status: 'pendiente_aprobacion_gerencia',
              statusLabel: 'Pendiente de Aprobación',
              count: pendingPOs.length,
            });
          }

          // Calcular vencidos
          const overdueCount = pendingPOs.filter(po => po.isOverdue).length;

          return (
            <StatusDashboard
              pendingByStatus={statusCounts}
              overdueCount={overdueCount}
              title="Órdenes de Compra Pendientes de Aprobación"
            />
          );
        })()}

        {/* Vista de Lista */}
        {!showDetail && (
          <>
            {purchaseOrders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
                <CheckCircle className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
                <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
                  No hay órdenes de compra
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
                  No se encontraron órdenes de compra.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* SECCIÓN: PENDIENTES DE APROBAR */}
                {(() => {
                  const pendingOrders = purchaseOrders
                    .filter((po) => po.approvalStatus?.code === 'pendiente_aprobacion_gerencia')
                    .sort((a, b) => {
                      // Ordenar: vencidas primero
                      if (a.isOverdue && !b.isOverdue) return -1;
                      if (!a.isOverdue && b.isOverdue) return 1;
                      // Si ambas son vencidas o ambas no son vencidas, mantener orden original
                      return 0;
                    });

                  if (pendingOrders.length === 0) return null;

                  return (
                    <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                      <div className="bg-orange-50 px-4 py-2 border-b border-orange-200">
                        <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          PENDIENTES DE APROBAR ({pendingOrders.length})
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                            <TableHead className="font-semibold">Nº Orden</TableHead>
                            <TableHead className="font-semibold">Requisición</TableHead>
                            <TableHead className="font-semibold">Empresa</TableHead>
                            <TableHead className="font-semibold">Proveedor</TableHead>
                            <TableHead className="font-semibold w-[80px]">Ítems</TableHead>
                            <TableHead className="font-semibold">Total</TableHead>
                            <TableHead className="font-semibold">Fecha Emisión</TableHead>
                            <TableHead className="font-semibold">Plazo</TableHead>
                            <TableHead className="font-semibold text-center">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingOrders.map((po) => (
                            <TableRow
                              key={po.purchaseOrderId}
                              className={`${po.isOverdue ? 'bg-red-50/50' : 'bg-white'} hover:bg-orange-50/30 transition-colors`}
                            >
                              <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                                {po.purchaseOrderNumber}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {po.requisition?.requisitionNumber || '-'}
                              </TableCell>
                              <TableCell>
                                <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                                  {po.requisition?.operationCenter?.company?.name || '-'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">{po.supplier?.name || '-'}</p>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {po.supplier?.nit || po.supplier?.nitCc || '-'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] text-xs font-semibold">
                                    {po.items?.length || 0}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-[hsl(var(--canalco-primary))]">
                                {formatCurrency(po.totalAmount)}
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(new Date(po.issueDate))}</TableCell>
                              <TableCell>
                                {po.deadline ? (
                                  <div className="text-sm flex flex-col gap-0.5">
                                    {po.isOverdue ? (
                                      <>
                                        <div className="flex items-center gap-1">
                                          <span className="text-red-600">❌</span>
                                          <span className="text-red-600 font-medium">Vencida</span>
                                        </div>
                                        {po.daysOverdue && po.daysOverdue > 0 && (
                                          <span className="text-xs text-red-500">
                                            Hace {po.daysOverdue} día{po.daysOverdue !== 1 ? 's' : ''}
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
                                    onClick={() => handleViewDetail(po)}
                                    className="hover:bg-blue-50"
                                    title="Ver y aprobar"
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
                  );
                })()}

                {/* SECCIÓN: YA PROCESADAS */}
                {(() => {
                  const processedOrders = purchaseOrders.filter(
                    (po) => po.approvalStatus?.code === 'aprobada_gerencia' || po.approvalStatus?.code === 'rechazada_gerencia'
                  );

                  if (processedOrders.length === 0) return null;

                  // Paginación interna: 10 por página
                  const totalProcessed = processedOrders.length;
                  const processedTotalPages = Math.ceil(totalProcessed / processedLimit);
                  const processedStartIndex = (processedPage - 1) * processedLimit;
                  const processedEndIndex = processedStartIndex + processedLimit;
                  const paginatedProcessedOrders = processedOrders.slice(processedStartIndex, processedEndIndex);

                  return (
                    <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                      <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          YA PROCESADAS ({processedOrders.length})
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                            <TableHead className="font-semibold">Nº Orden</TableHead>
                            <TableHead className="font-semibold">Requisición</TableHead>
                            <TableHead className="font-semibold">Empresa</TableHead>
                            <TableHead className="font-semibold">Proveedor</TableHead>
                            <TableHead className="font-semibold w-[80px]">Ítems</TableHead>
                            <TableHead className="font-semibold">Total</TableHead>
                            <TableHead className="font-semibold">Fecha Emisión</TableHead>
                            <TableHead className="font-semibold">Estado</TableHead>
                            <TableHead className="font-semibold text-center">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedProcessedOrders.map((po) => (
                            <TableRow
                              key={po.purchaseOrderId}
                              className="bg-white hover:bg-green-50/30 transition-colors"
                            >
                              <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                                {po.purchaseOrderNumber}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {po.requisition?.requisitionNumber || '-'}
                              </TableCell>
                              <TableCell>
                                <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                                  {po.requisition?.operationCenter?.company?.name || '-'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">{po.supplier?.name || '-'}</p>
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  {po.supplier?.nit || po.supplier?.nitCc || '-'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] text-xs font-semibold">
                                    {po.items?.length || 0}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-[hsl(var(--canalco-primary))]">
                                {formatCurrency(po.totalAmount)}
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(new Date(po.issueDate))}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(po.approvalStatus?.code)}`}>
                                  {po.approvalStatus?.code === 'aprobada_gerencia' ? 'Aprobada' : 'Rechazada'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewDetail(po)}
                                    className="hover:bg-blue-50"
                                    title="Ver detalle"
                                  >
                                    <Eye className="w-4 h-4 text-blue-600" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

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
          </>
        )}

        {/* Vista de Detalle */}
        {showDetail && selectedPO && (
          <div className="space-y-6">
            {/* Información de la OC */}
            <Card className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nº Orden de Compra</Label>
                  <p className="font-mono font-bold text-[hsl(var(--canalco-primary))]">{selectedPO.purchaseOrderNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nº Requisición</Label>
                  <p className="font-mono font-semibold">{selectedPO.requisition?.requisitionNumber || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Fecha Emisión</Label>
                  <p className="font-medium">{formatDate(new Date(selectedPO.issueDate))}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Plazo de Aprobación</Label>
                  <div className="mt-1">{formatDeadline(selectedPO)}</div>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Empresa</Label>
                  <p className="font-medium">{selectedPO.requisition?.operationCenter?.company?.name || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Proveedor</Label>
                  <p className="font-medium">{selectedPO.supplier?.name || '-'}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">{selectedPO.supplier?.nit || selectedPO.supplier?.nitCc || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total OC</Label>
                  <p className="font-bold text-lg text-[hsl(var(--canalco-primary))]">{formatCurrency(selectedPO.totalAmount)}</p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Rechazos Previos</Label>
                  <p className="font-semibold text-red-600">{selectedPO.rejectionCount || 0}</p>
                </div>
              </div>

              {/* Última razón de rechazo */}
              {selectedPO.lastRejectionReason && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <Label className="text-xs font-semibold text-red-800">Último rechazo:</Label>
                  <p className="text-sm text-red-700 mt-1">{selectedPO.lastRejectionReason}</p>
                </div>
              )}
            </Card>

            {/* Ítems de la OC */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Ítems de la Orden de Compra</h3>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{getItemsCount().approved} Aprobados</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="font-medium">{getItemsCount().rejected} Rechazados</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <span className="font-medium">{getItemsCount().pending} Pendientes</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApproveAll}
                    className="ml-2"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Aprobar Todos
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {(selectedPO.items || []).map((item) => {
                  const approvalStatus = getItemApprovalStatus(item.poItemId);
                  const statusBgColor = approvalStatus?.status === 'approved' ? 'bg-green-50 border-green-300' :
                                       approvalStatus?.status === 'rejected' ? 'bg-red-50 border-red-300' :
                                       'bg-white border-[hsl(var(--canalco-neutral-200))]';

                  return (
                    <Card key={item.poItemId} className={`p-4 border-2 ${statusBgColor}`}>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {/* Información del material */}
                        <div className="md:col-span-2">
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Material</Label>
                          <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                            {item.requisitionItem?.material?.code || '-'}
                          </p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                            {item.requisitionItem?.material?.name || '-'}
                          </p>
                          {item.requisitionItem?.observation && (
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                              Obs: {item.requisitionItem.observation}
                            </p>
                          )}
                        </div>

                        {/* Cantidades y precios */}
                        <div>
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Cantidad</Label>
                          <p className="font-semibold">{item.quantity} {item.requisitionItem?.material?.unit || ''}</p>
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-2">Precio Unitario</Label>
                          <p className="font-medium">{formatCurrency(item.unitPrice)}</p>
                        </div>

                        <div>
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">IVA</Label>
                          <p className="font-medium">{item.hasIva ? `${item.ivaPercentage}%` : 'No'}</p>
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-2">Descuento</Label>
                          <p className="font-medium">{formatCurrency(item.discount)}</p>
                        </div>

                        <div>
                          <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total Ítem</Label>
                          <p className="font-bold text-lg text-[hsl(var(--canalco-primary))]">
                            {formatCurrency(item.totalAmount)}
                          </p>
                        </div>
                      </div>

                      {/* Acciones de aprobación */}
                      <div className="mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                        <div className="flex items-start gap-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={approvalStatus?.status === 'approved' ? 'default' : 'outline'}
                              onClick={() => handleApproveItem(item.poItemId)}
                              className={approvalStatus?.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant={approvalStatus?.status === 'rejected' ? 'default' : 'outline'}
                              onClick={() => handleRejectItem(item.poItemId)}
                              className={approvalStatus?.status === 'rejected' ? 'bg-red-600 hover:bg-red-700' : ''}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Rechazar
                            </Button>
                          </div>

                          {approvalStatus?.status === 'rejected' && (
                            <div className="flex-grow">
                              <Textarea
                                placeholder="Comentarios sobre el rechazo (opcional si hay razón general)"
                                value={approvalStatus.comments}
                                onChange={(e) => handleUpdateItemComments(item.poItemId, e.target.value)}
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Card>

            {/* Comentarios generales y razón de rechazo */}
            <Card className="p-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="generalComments">Comentarios Generales (Opcional)</Label>
                  <Textarea
                    id="generalComments"
                    placeholder="Agrega comentarios generales sobre esta orden de compra..."
                    value={generalComments}
                    onChange={(e) => setGeneralComments(e.target.value)}
                    rows={3}
                  />
                </div>

                {getFinalDecision() === 'reject' && (
                  <div>
                    <Label htmlFor="rejectionReason" className="text-red-700">
                      Razón de Rechazo (Obligatorio) *
                    </Label>
                    <Textarea
                      id="rejectionReason"
                      placeholder="Explica por qué se rechaza esta orden de compra..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      className="border-red-300 focus:border-red-500"
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Error de acci�n */}
            {actionError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">Error</p>
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={handleCloseDetail}
                disabled={actionLoading}
              >
                Cancelar
              </Button>

              <div className="flex gap-3">
                {!showConfirmation ? (
                  <Button
                    onClick={handleOpenConfirmation}
                    disabled={actionLoading || !areAllItemsReviewed()}
                    className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
                  >
                    {getFinalDecision() === 'approve' ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar Aprobación
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Confirmar Rechazo
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                      {getFinalDecision() === 'approve'
                        ? '¿Confirmar aprobación de esta orden de compra?'
                        : '¿Confirmar rechazo de esta orden de compra?'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowConfirmation(false)}
                      disabled={actionLoading}
                    >
                      No
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConfirmAction}
                      disabled={actionLoading}
                      className={getFinalDecision() === 'approve'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'}
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Sí, Confirmar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AprobarOrdenesCompraPage;
