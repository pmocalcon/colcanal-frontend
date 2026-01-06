import React, { useState, useEffect, useMemo } from 'react';
import { Eye, CheckCircle, AlertCircle, Loader2, ArrowLeft, Check, X, Building2, MapPin } from 'lucide-react';
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
import { RequisitionFilters, type FilterValues } from '@/components/ui/requisition-filters';
import { StatusDashboard } from '@/components/ui/status-dashboard';

// Mapeo de estados a colores
const STATUS_COLORS: Record<string, string> = {
  pendiente_validacion: 'bg-indigo-100 text-indigo-800',
  rechazada_validador: 'bg-pink-100 text-pink-800',
  pendiente: 'bg-gray-100 text-gray-800',
};

const ValidarRequisicionesPage: React.FC = () => {
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

  // Estado de validación
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [decision, setDecision] = useState<'validate' | 'reject' | null>(null);

  // Usuario actual
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Filtros
  const [filters, setFilters] = useState<FilterValues>({
    company: '',
    project: '',
    requisitionNumber: '',
    startDate: '',
    endDate: '',
    status: '',
  });

  // Cargar requisiciones pendientes de validación
  const loadPendingRequisitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPendingActions({ page, limit: 100 });

      // Filtrar solo requisiciones en estado pendiente_validacion
      const validationRequisitions = response.data.filter(
        (req) => req.status?.code === 'pendiente_validacion'
      );

      setRequisitions(validationRequisitions);
      setTotalPages(Math.ceil(validationRequisitions.length / 10) || 1);
      setTotal(validationRequisitions.length);
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

  // Filtrar requisiciones
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      if (filters.company && !req.company?.name?.toLowerCase().includes(filters.company.toLowerCase())) {
        return false;
      }
      if (filters.project && !req.project?.name?.toLowerCase().includes(filters.project.toLowerCase())) {
        return false;
      }
      if (filters.requisitionNumber && !req.requisitionNumber?.toLowerCase().includes(filters.requisitionNumber.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [requisitions, filters]);

  // Estadísticas
  const pendingCount = filteredRequisitions.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--canalco-primary))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando requisiciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Back button */}
            <div className="flex items-center gap-4">
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
                Validar Requisiciones de Obra
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisiciones con obra pendientes de validación
              </p>
            </div>

            <div className="w-10" /> {/* Spacer for balance */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Dashboard */}
        {pendingCount > 0 && (
          <StatusDashboard
            totalPending={pendingCount}
            title="Pendientes de Validación"
          />
        )}

        {/* Error */}
        {error && (
          <Card className="p-6 border-red-200 bg-red-50 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          </Card>
        )}

        {/* Lista de requisiciones */}
        {!showDetail ? (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            {filteredRequisitions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-[hsl(var(--canalco-neutral-600))]">
                  No hay requisiciones pendientes de validación
                </p>
              </div>
            ) : (
              <>
                <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2">
                  <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    PENDIENTES DE VALIDACIÓN ({filteredRequisitions.length})
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requisición</TableHead>
                      <TableHead>Empresa / Proyecto</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead>Creador</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequisitions.map((req) => (
                      <TableRow key={req.requisitionId} className="hover:bg-indigo-50/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[hsl(var(--canalco-primary))]">
                              {req.requisitionNumber}
                            </span>
                            {req.priority === 'alta' && (
                              <Badge className="bg-red-100 text-red-800 text-xs">
                                URGENTE
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{req.company?.name}</p>
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                              {req.project?.name || 'Sin proyecto'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <div>
                              <p className="font-medium text-sm text-indigo-700">{req.obra || '-'}</p>
                              {req.codigoObra && (
                                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                  Código: {req.codigoObra}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{req.creator?.nombre}</p>
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                              {req.creator?.role?.nombreRol || 'Sin rol'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{formatDate(req.createdAt)}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewDetail(req)}
                              className="hover:bg-indigo-100"
                              title="Ver y validar"
                            >
                              <Eye className="w-4 h-4 text-indigo-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        ) : (
          /* Detalle de requisición */
          <Card className="p-6">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
              </div>
            ) : selectedRequisition ? (
              <div className="space-y-6">
                {/* Header del detalle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      {selectedRequisition.requisitionNumber}
                      {selectedRequisition.priority === 'alta' && (
                        <Badge className="bg-red-100 text-red-800">URGENTE</Badge>
                      )}
                    </h2>
                    <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                      {selectedRequisition.company?.name} - {selectedRequisition.project?.name || 'Sin proyecto'}
                    </p>
                  </div>
                  <Button variant="outline" onClick={handleCloseDetail}>
                    Cerrar
                  </Button>
                </div>

                {/* Información de obra */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h3 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Información de Obra
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-indigo-600">Obra</Label>
                      <p className="font-medium">{selectedRequisition.obra || 'No especificada'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-indigo-600">Código de Obra</Label>
                      <p className="font-medium">{selectedRequisition.codigoObra || 'No especificado'}</p>
                    </div>
                  </div>
                </div>

                {/* Información del creador */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Creado por</Label>
                    <p className="font-medium">{selectedRequisition.creator?.nombre}</p>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                      {selectedRequisition.creator?.role?.nombreRol}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Fecha de creación</Label>
                    <p className="font-medium">{formatDate(selectedRequisition.createdAt)}</p>
                  </div>
                </div>

                {/* Items de la requisición */}
                <div>
                  <h3 className="font-semibold mb-3">
                    Items ({selectedRequisition.items?.length || 0})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead>Observación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRequisition.items?.map((item, index) => (
                        <TableRow key={item.itemId}>
                          <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.material?.description}</p>
                              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                {item.material?.code}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.material?.materialGroup?.name || '-'}
                          </TableCell>
                          <TableCell className="text-center font-medium">
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

                {/* Área de validación */}
                {!showConfirmation ? (
                  <div className="flex items-center justify-center gap-4 pt-4 border-t">
                    <Button
                      onClick={handleStartValidate}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Validar Requisición
                    </Button>
                    <Button
                      onClick={handleStartReject}
                      variant="destructive"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Rechazar
                    </Button>
                  </div>
                ) : (
                  <div className="border-t pt-4 space-y-4">
                    <div className={`p-4 rounded-lg ${decision === 'validate' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
                      <h3 className={`font-semibold mb-2 ${decision === 'validate' ? 'text-green-800' : 'text-red-800'}`}>
                        {decision === 'validate' ? 'Confirmar Validación' : 'Confirmar Rechazo'}
                      </h3>
                      <p className={`text-sm mb-4 ${decision === 'validate' ? 'text-green-700' : 'text-red-700'}`}>
                        {decision === 'validate'
                          ? 'La requisición será validada y pasará a revisión por el Director Técnico.'
                          : 'La requisición será devuelta al creador para corrección.'}
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="comments">
                          {decision === 'validate' ? 'Comentarios (opcional)' : 'Motivo del rechazo *'}
                        </Label>
                        <Textarea
                          id="comments"
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder={decision === 'validate' ? 'Agregar comentarios...' : 'Explique el motivo del rechazo...'}
                          rows={3}
                        />
                      </div>

                      {actionError && (
                        <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                          {actionError}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 mt-4">
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
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleConfirmAction}
                          disabled={actionLoading}
                          className={decision === 'validate' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                          {actionLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : decision === 'validate' ? (
                            <Check className="w-4 h-4 mr-2" />
                          ) : (
                            <X className="w-4 h-4 mr-2" />
                          )}
                          {decision === 'validate' ? 'Confirmar Validación' : 'Confirmar Rechazo'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        )}
      </main>
    </div>
  );
};

export default ValidarRequisicionesPage;
