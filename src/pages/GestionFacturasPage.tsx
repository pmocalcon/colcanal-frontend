import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Eye, FileText, AlertCircle, Loader2, Filter } from 'lucide-react';
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
import { formatDate } from '@/utils/dateUtils';
import {
  getPurchaseOrdersForInvoicing,
  type PurchaseOrderForInvoicing,
} from '@/services/invoices.service';
import { StatusDashboard } from '@/components/ui/status-dashboard';
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';

// Tipos de estado de factura para filtro
type InvoiceStatusFilter = 'todos' | 'sin_factura' | 'facturacion_parcial' | 'factura_completa' | 'enviada_contabilidad';

// Orden de prioridad para ordenar (sin factura primero)
const STATUS_PRIORITY: Record<string, number> = {
  sin_factura: 1,
  facturacion_parcial: 2,
  factura_completa: 3,
  enviada_contabilidad: 4,
};

const GestionFacturasPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderForInvoicing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filtro de estado de factura
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('todos');

  const isCompras = user?.nombreRol === 'Compras';

  const loadPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPurchaseOrdersForInvoicing(page, 10);
      setPurchaseOrders(response.data);
      setTotalPages(response.totalPages);
      setTotal(response.total);
    } catch (err: any) {
      console.error('Error loading purchase orders:', err);
      setError(err.response?.data?.message || 'Error al cargar las órdenes de compra');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (!isCompras) {
      navigate('/dashboard');
      return;
    }
    loadPurchaseOrders();
  }, [isCompras, navigate, loadPurchaseOrders]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getInvoiceStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      sin_factura: { label: 'Sin Factura', className: 'bg-red-100 text-red-800' },
      facturacion_parcial: { label: 'Parcial', className: 'bg-yellow-100 text-yellow-800' },
      factura_completa: { label: 'Completa', className: 'bg-green-100 text-green-800' },
      enviada_contabilidad: { label: 'En Contabilidad', className: 'bg-blue-100 text-blue-800' },
    };

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getInvoiceProgress = (po: PurchaseOrderForInvoicing) => {
    const invoiceCount = po.invoices?.length || 0;
    const totalInvoiced = Number(po.totalInvoicedAmount) || 0;
    const totalAmount = Number(po.totalAmount);
    const percentage = totalAmount > 0 ? (totalInvoiced / totalAmount) * 100 : 0;

    return {
      count: invoiceCount,
      percentage: Math.min(percentage, 100),
      amount: totalInvoiced,
      pending: totalAmount - totalInvoiced,
    };
  };

  // Contadores por estado
  const statusCounts = useMemo(() => {
    const counts = {
      todos: purchaseOrders.length,
      sin_factura: 0,
      facturacion_parcial: 0,
      factura_completa: 0,
      enviada_contabilidad: 0,
    };
    purchaseOrders.forEach(po => {
      const status = po.invoiceStatus as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
    });
    return counts;
  }, [purchaseOrders]);

  // Filtrar y ordenar órdenes (sin factura primero)
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = purchaseOrders;

    // Aplicar filtro de estado
    if (statusFilter !== 'todos') {
      filtered = purchaseOrders.filter(po => po.invoiceStatus === statusFilter);
    }

    // Ordenar: sin factura primero, luego parcial, luego completa, luego enviada
    return [...filtered].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.invoiceStatus] || 99;
      const priorityB = STATUS_PRIORITY[b.invoiceStatus] || 99;
      return priorityA - priorityB;
    });
  }, [purchaseOrders, statusFilter]);

  if (!isCompras) {
    return null;
  }

  if (loading && purchaseOrders.length === 0) {
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
                onClick={() => navigate('/dashboard/compras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Gestión de Facturas
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Registrar facturas de órdenes con recepción completa
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Status Dashboard */}
        <StatusDashboard
          totalPending={statusCounts.sin_factura + statusCounts.facturacion_parcial}
          overdueCount={0}
        />

        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}

        {/* Filter Buttons */}
        <div className="mb-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
              Filtrar por estado:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={statusFilter === 'todos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('todos')}
              className={statusFilter === 'todos' ? 'bg-[hsl(var(--canalco-primary))]' : ''}
            >
              Todos ({statusCounts.todos})
            </Button>
            <Button
              variant={statusFilter === 'sin_factura' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('sin_factura')}
              className={statusFilter === 'sin_factura' ? 'bg-red-600 hover:bg-red-700' : 'border-red-300 text-red-700 hover:bg-red-50'}
            >
              🔴 Sin Factura ({statusCounts.sin_factura})
            </Button>
            <Button
              variant={statusFilter === 'facturacion_parcial' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('facturacion_parcial')}
              className={statusFilter === 'facturacion_parcial' ? 'bg-yellow-600 hover:bg-yellow-700' : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'}
            >
              🟡 Parcial ({statusCounts.facturacion_parcial})
            </Button>
            <Button
              variant={statusFilter === 'factura_completa' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('factura_completa')}
              className={statusFilter === 'factura_completa' ? 'bg-green-600 hover:bg-green-700' : 'border-green-300 text-green-700 hover:bg-green-50'}
            >
              🟢 Completa ({statusCounts.factura_completa})
            </Button>
            <Button
              variant={statusFilter === 'enviada_contabilidad' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('enviada_contabilidad')}
              className={statusFilter === 'enviada_contabilidad' ? 'bg-blue-600 hover:bg-blue-700' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}
            >
              🔵 En Contabilidad ({statusCounts.enviada_contabilidad})
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Total</p>
            <p className="text-2xl font-bold text-[hsl(var(--canalco-primary))]">{total}</p>
          </Card>
          <Card className="p-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-600">Sin Factura</p>
            <p className="text-2xl font-bold text-red-700">{statusCounts.sin_factura}</p>
          </Card>
          <Card className="p-4 border-yellow-200 bg-yellow-50">
            <p className="text-sm text-yellow-600">Parcial</p>
            <p className="text-2xl font-bold text-yellow-700">{statusCounts.facturacion_parcial}</p>
          </Card>
          <Card className="p-4 border-green-200 bg-green-50">
            <p className="text-sm text-green-600">Completas</p>
            <p className="text-2xl font-bold text-green-700">{statusCounts.factura_completa}</p>
          </Card>
          <Card className="p-4 border-blue-200 bg-blue-50">
            <p className="text-sm text-blue-600">En Contabilidad</p>
            <p className="text-2xl font-bold text-blue-700">{statusCounts.enviada_contabilidad}</p>
          </Card>
        </div>

        {/* Table */}
        {filteredAndSortedOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
            <FileText className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
            <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
              {statusFilter !== 'todos'
                ? `No hay órdenes con estado "${statusFilter === 'sin_factura' ? 'Sin Factura' : statusFilter === 'facturacion_parcial' ? 'Parcial' : statusFilter === 'factura_completa' ? 'Completa' : 'En Contabilidad'}"`
                : 'No hay órdenes de compra para facturar'}
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
              {statusFilter !== 'todos'
                ? 'Intenta con otro filtro para ver más órdenes'
                : 'Las órdenes con recepción de materiales completa aparecerán aquí'}
            </p>
            {statusFilter !== 'todos' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter('todos')}
                className="mt-4"
              >
                Ver todas las órdenes
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                  <TableHead className="font-semibold">Nº Orden</TableHead>
                  <TableHead className="font-semibold">Requisición</TableHead>
                  <TableHead className="font-semibold">Empresa</TableHead>
                  <TableHead className="font-semibold">Proveedor</TableHead>
                  <TableHead className="font-semibold">Total OC</TableHead>
                  <TableHead className="font-semibold">Facturas</TableHead>
                  <TableHead className="font-semibold">Facturado</TableHead>
                  <TableHead className="font-semibold">Progreso</TableHead>
                  <TableHead className="font-semibold">Estado</TableHead>
                  <TableHead className="font-semibold text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedOrders.map((po) => {
                  const progress = getInvoiceProgress(po);
                  return (
                    <TableRow key={po.purchaseOrderId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                      <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                        {po.purchaseOrderNumber}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          {po.requisition?.requisitionNumber || '-'}
                          {po.requisition?.priority === 'alta' && (
                            <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                              URGENTE
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">
                          {po.requisition?.operationCenter?.company?.name || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{po.supplier?.name || '-'}</p>
                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                          {po.supplier?.nitCc || '-'}
                        </p>
                      </TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--canalco-primary))]">
                        {formatCurrency(po.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-semibold">
                          {progress.count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-green-600">
                          {formatCurrency(progress.amount)}
                        </p>
                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                          Pendiente: {formatCurrency(progress.pending)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                progress.percentage >= 100
                                  ? 'bg-green-500'
                                  : progress.percentage > 0
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-center mt-1 font-medium">
                            {Math.round(progress.percentage)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getInvoiceStatusBadge(po.invoiceStatus)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/dashboard/compras/facturas/${po.purchaseOrderId}`)}
                            className="hover:bg-blue-50"
                            title="Ver facturas"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  Mostrando {(page - 1) * 10 + 1} - {Math.min(page * 10, total)} de {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 text-xs"
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-[hsl(var(--canalco-neutral-700))]">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-8 text-xs"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default GestionFacturasPage;
