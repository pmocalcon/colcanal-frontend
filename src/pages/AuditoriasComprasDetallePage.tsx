import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auditService, type RequisitionDetailResponse } from '@/services/audit.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Home, Menu, AlertCircle, ArrowLeft, Clock, User, Package, FileText, TrendingUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort, formatDate } from '@/utils/dateUtils';

// Mapeo de acciones a etiquetas legibles
const ACTION_LABELS: Record<string, string> = {
  crear: 'Creada',
  revisar: 'Revisada',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada',
  registrar_cotizacion: 'Cotización Registrada',
  crear_ordenes_compra: 'Órdenes de Compra Generadas',
  registrar_recepcion: 'Recepción Registrada',
};

// Mapeo de acciones a colores
const ACTION_COLORS: Record<string, string> = {
  crear: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  revisar: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  aprobar: 'bg-green-500/10 text-green-700 border-green-500/20',
  rechazar: 'bg-red-500/10 text-red-700 border-red-500/20',
  registrar_cotizacion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  crear_ordenes_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  registrar_recepcion: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
};

export default function AuditoriasComprasDetallePage() {
  const navigate = useNavigate();
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const [detail, setDetail] = useState<RequisitionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadRequisitionDetail();
  }, [requisitionId]);

  const loadRequisitionDetail = async () => {
    if (!requisitionId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await auditService.getRequisitionDetail(parseInt(requisitionId));
      setDetail(response);
    } catch (err) {
      console.error('Error loading requisition detail:', err);
      setError('Error al cargar el detalle de la requisición');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    return ACTION_LABELS[action] || action;
  };

  const getActionColor = (action: string) => {
    return ACTION_COLORS[action] || 'bg-gray-100';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error || 'No se encontró la requisición'}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard/auditorias/compras')}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Auditorías
          </Button>
        </div>
      </div>
    );
  }

  const { requisition, amounts, timeline } = detail;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo 1 */}
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
                onClick={() => navigate('/dashboard/auditorias/compras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Auditorías - Compras"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Detalle de Requisición
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {requisition.requisitionNumber}
              </p>
            </div>

            {/* Right: Logo 2 */}
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
              Detalle de Requisición
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/auditorias/compras');
                  setSidebarOpen(false);
                }}
              >
                Volver a Compras
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/auditorias');
                  setSidebarOpen(false);
                }}
              >
                Volver a Auditorías
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* General Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Información General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">N° Requisición</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.requisitionNumber}
                </p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Estado</p>
                <Badge variant="outline" className={getActionColor(requisition.status?.statusName || '')}>
                  {requisition.status?.statusName || 'N/A'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Empresa</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.company?.name || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Proyecto</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.project?.name || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Centro de Operación</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.operationCenter?.name || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Código de Proyecto</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.projectCode?.code || 'N/A'}
                </p>
              </div>
              {requisition.obra && (
                <div>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Obra</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {requisition.obra}
                  </p>
                </div>
              )}
              {requisition.codigoObra && (
                <div>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Código de Obra</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {requisition.codigoObra}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Solicitado por</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.creator?.nombre || 'N/A'}
                </p>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                  {requisition.creator?.cargo}
                </p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Fecha de Creación</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {formatDate(requisition.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              ¿Qué se pidió?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                    <TableHead className="font-semibold">Código Material</TableHead>
                    <TableHead className="font-semibold">Descripción</TableHead>
                    <TableHead className="font-semibold text-right">Cantidad</TableHead>
                    <TableHead className="font-semibold">Unidad</TableHead>
                    <TableHead className="font-semibold text-right">Precio Unitario</TableHead>
                    <TableHead className="font-semibold text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisition.items && requisition.items.length > 0 ? (
                    requisition.items.map((item: any, index: number) => {
                      const selectedQuotation = item.quotations?.find((q: any) => q.selected) || item.quotations?.[0];
                      const unitPrice = selectedQuotation?.unitPrice || 0;
                      const subtotal = unitPrice * item.quantity;

                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {item.material?.materialCode || 'N/A'}
                          </TableCell>
                          <TableCell>{item.material?.description || 'N/A'}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {item.quantity}
                          </TableCell>
                          <TableCell>{item.material?.unit || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            {unitPrice > 0 ? formatCurrency(unitPrice) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {subtotal > 0 ? formatCurrency(subtotal) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-[hsl(var(--canalco-neutral-600))]">
                        No hay ítems registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Amounts Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              ¿Cuánto?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-[hsl(var(--canalco-neutral-200))]">
                <span className="text-[hsl(var(--canalco-neutral-700))]">Subtotal:</span>
                <span className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {formatCurrency(amounts.subtotal)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[hsl(var(--canalco-neutral-200))]">
                <span className="text-[hsl(var(--canalco-neutral-700))]">IVA (16%):</span>
                <span className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {formatCurrency(amounts.iva)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">Total:</span>
                <span className="text-2xl font-bold text-[hsl(var(--canalco-primary))]">
                  {formatCurrency(amounts.total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              ¿Cuándo? - Línea de Tiempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div
                  key={event.logId}
                  className="relative pl-8 pb-6 border-l-2 border-[hsl(var(--canalco-neutral-300))] last:border-l-0 last:pb-0"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-[hsl(var(--canalco-primary))] border-2 border-white shadow"></div>

                  {/* Event content */}
                  <div className="bg-[hsl(var(--canalco-neutral-100))] rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <Badge variant="outline" className={`${getActionColor(event.action)} border mb-2`}>
                          {getActionLabel(event.action)}
                        </Badge>
                        <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-700))]">
                          <User className="w-4 h-4" />
                          <span className="font-medium">{event.user.nombre}</span>
                          <span className="text-[hsl(var(--canalco-neutral-500))]">
                            ({event.user.cargo})
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                          {formatDate(event.createdAt)}
                        </p>
                        {event.timeSincePrevious && (
                          <p className="text-xs text-[hsl(var(--canalco-neutral-600))] flex items-center gap-1 justify-end mt-1">
                            <Clock className="w-3 h-3" />
                            {event.timeSincePrevious} después
                          </p>
                        )}
                      </div>
                    </div>

                    {event.comments && (
                      <div className="mt-2 pt-2 border-t border-[hsl(var(--canalco-neutral-300))]">
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          <strong>Comentarios:</strong> {event.comments}
                        </p>
                      </div>
                    )}

                    {(event.previousStatus || event.newStatus) && (
                      <div className="mt-2 pt-2 border-t border-[hsl(var(--canalco-neutral-300))] flex items-center gap-2 text-xs">
                        {event.previousStatus && (
                          <span className="text-[hsl(var(--canalco-neutral-600))]">
                            De: <strong>{event.previousStatus}</strong>
                          </span>
                        )}
                        {event.previousStatus && event.newStatus && (
                          <span className="text-[hsl(var(--canalco-neutral-400))]">→</span>
                        )}
                        {event.newStatus && (
                          <span className="text-[hsl(var(--canalco-neutral-600))]">
                            A: <strong>{event.newStatus}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders Card (if any) */}
        {requisition.purchaseOrders && requisition.purchaseOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Órdenes de Compra Generadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                      <TableHead className="font-semibold">N° Orden</TableHead>
                      <TableHead className="font-semibold">Proveedor</TableHead>
                      <TableHead className="font-semibold">Fecha</TableHead>
                      <TableHead className="font-semibold text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requisition.purchaseOrders.map((po: any) => (
                      <TableRow key={po.purchaseOrderId}>
                        <TableCell className="font-medium">{po.purchaseOrderNumber}</TableCell>
                        <TableCell>{po.supplier?.name || 'N/A'}</TableCell>
                        <TableCell>{formatDateShort(po.createdAt)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {po.totalAmount ? formatCurrency(po.totalAmount) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back Button */}
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard/auditorias/compras')}
            className="px-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Auditorías - Compras
          </Button>
        </div>
      </main>
    </div>
  );
}
