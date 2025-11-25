import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, FileText, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
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
import { formatDate } from '@/utils/dateUtils';
import {
  getPurchaseOrdersForInvoicing,
  type PurchaseOrderForInvoicing,
} from '@/services/invoices.service';
import { StatusDashboard } from '@/components/ui/status-dashboard';

const GestionFacturasPage: React.FC = () => {
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderForInvoicing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadPurchaseOrders();
  }, [page]);

  const loadPurchaseOrders = async () => {
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
  };

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
                Registrar facturas de órdenes de compra aprobadas
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Dashboard */}
        <StatusDashboard
          totalPending={purchaseOrders.filter(
            po => po.invoiceStatus === 'sin_factura' || po.invoiceStatus === 'facturacion_parcial'
          ).length}
          overdueCount={0}
        />

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
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Total Órdenes</p>
            <p className="text-2xl font-bold text-[hsl(var(--canalco-primary))]">{total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Sin Factura</p>
            <p className="text-2xl font-bold text-red-600">
              {purchaseOrders.filter(po => po.invoiceStatus === 'sin_factura').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Facturación Parcial</p>
            <p className="text-2xl font-bold text-yellow-600">
              {purchaseOrders.filter(po => po.invoiceStatus === 'facturacion_parcial').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Completas</p>
            <p className="text-2xl font-bold text-green-600">
              {purchaseOrders.filter(po => po.invoiceStatus === 'factura_completa').length}
            </p>
          </Card>
        </div>

        {/* Table */}
        {purchaseOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
            <FileText className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
            <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
              No hay órdenes de compra para facturar
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
              Las órdenes aprobadas por Gerencia aparecerán aquí
            </p>
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
                {purchaseOrders.map((po) => {
                  const progress = getInvoiceProgress(po);
                  return (
                    <TableRow key={po.purchaseOrderId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                      <TableCell className="font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                        {po.purchaseOrderNumber}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {po.requisition?.requisitionNumber || '-'}
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
                          {progress.count}/3
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
    </div>
  );
};

export default GestionFacturasPage;
