import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Eye, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';

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
  const [total, setTotal] = useState(0);

  // Filtros individuales por columna
  const [filterOrden, setFilterOrden] = useState('');
  const [filterRequisicion, setFilterRequisicion] = useState('');
  const [filterEstadoReq, setFilterEstadoReq] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('');
  const [filterProveedor, setFilterProveedor] = useState('');
  const [filterEstadoFactura, setFilterEstadoFactura] = useState('');

  const isCompras = user?.nombreRol === 'Compras';

  const loadPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Carga todo de una vez para que los filtros operen globalmente
      const first = await getPurchaseOrdersForInvoicing(1, 1);
      const all = await getPurchaseOrdersForInvoicing(1, first.total || 1000);
      setPurchaseOrders(all.data);
      setTotal(all.total);
    } catch (err: any) {
      console.error('Error loading purchase orders:', err);
      setError(err.response?.data?.message || 'Error al cargar las órdenes de compra');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const getReceptionStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pendiente_recepcion: { label: 'Pendiente', className: 'bg-gray-100 text-gray-700' },
      en_recepcion: { label: 'En recepción', className: 'bg-yellow-100 text-yellow-800' },
      recepcion_completa: { label: 'Recepción completa', className: 'bg-green-100 text-green-800' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
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


  // Filtrar y ordenar órdenes (sin factura primero)
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = purchaseOrders;

    if (filterOrden.trim()) {
      const q = filterOrden.toLowerCase();
      filtered = filtered.filter(po => po.purchaseOrderNumber?.toLowerCase().includes(q));
    }
    if (filterRequisicion.trim()) {
      const q = filterRequisicion.toLowerCase();
      filtered = filtered.filter(po => po.requisition?.requisitionNumber?.toLowerCase().includes(q));
    }
    if (filterEstadoReq.trim()) {
      const q = filterEstadoReq.toLowerCase();
      const labels: Record<string, string> = {
        pendiente_recepcion: 'pendiente',
        en_recepcion: 'en recepción',
        recepcion_completa: 'recepción completa',
      };
      filtered = filtered.filter(po => {
        const status = po.receptionStatus || 'pendiente_recepcion';
        return labels[status]?.includes(q) || status.includes(q);
      });
    }
    if (filterEmpresa.trim()) {
      const q = filterEmpresa.toLowerCase();
      filtered = filtered.filter(po => po.requisition?.operationCenter?.company?.name?.toLowerCase().includes(q));
    }
    if (filterProveedor.trim()) {
      const q = filterProveedor.toLowerCase();
      filtered = filtered.filter(po =>
        po.supplier?.name?.toLowerCase().includes(q) ||
        po.supplier?.nitCc?.toLowerCase().includes(q)
      );
    }
    if (filterEstadoFactura.trim()) {
      const q = filterEstadoFactura.toLowerCase();
      const labels: Record<string, string> = {
        sin_factura: 'sin factura',
        facturacion_parcial: 'parcial',
        factura_completa: 'completa',
        enviada_contabilidad: 'en contabilidad',
      };
      filtered = filtered.filter(po => labels[po.invoiceStatus]?.includes(q) || po.invoiceStatus?.includes(q));
    }

    return [...filtered].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.invoiceStatus] || 99;
      const priorityB = STATUS_PRIORITY[b.invoiceStatus] || 99;
      return priorityA - priorityB;
    });
  }, [purchaseOrders, filterOrden, filterRequisicion, filterEstadoReq, filterEmpresa, filterProveedor, filterEstadoFactura]);

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
        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}


        {/* Column Filters */}
        <div className="mb-4 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Nº Orden</p>
              <Input value={filterOrden} onChange={e => setFilterOrden(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Requisición</p>
              <Input value={filterRequisicion} onChange={e => setFilterRequisicion(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Estado Recepción</p>
              <Input value={filterEstadoReq} onChange={e => setFilterEstadoReq(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Empresa</p>
              <Input value={filterEmpresa} onChange={e => setFilterEmpresa(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Proveedor</p>
              <Input value={filterProveedor} onChange={e => setFilterProveedor(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] mb-1">Estado Factura</p>
              <Input value={filterEstadoFactura} onChange={e => setFilterEstadoFactura(e.target.value)} placeholder="Filtrar..." className="h-8 text-xs" />
            </div>
          </div>
        </div>

        {/* Table */}
        {filteredAndSortedOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
            <FileText className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
            <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
              No hay órdenes de compra para facturar
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
              Las órdenes con recepción de materiales completa aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                  <TableHead className="font-semibold">Nº Orden</TableHead>
                  <TableHead className="font-semibold">Requisición</TableHead>
                  <TableHead className="font-semibold">Estado Recepción</TableHead>
                  <TableHead className="font-semibold">Empresa</TableHead>
                  <TableHead className="font-semibold">Proveedor</TableHead>
                  <TableHead className="font-semibold">Total OC</TableHead>
                  <TableHead className="font-semibold text-center">Facturas</TableHead>
                  <TableHead className="font-semibold">Facturado</TableHead>
                  <TableHead className="font-semibold">Pendiente</TableHead>
                  <TableHead className="font-semibold">Progreso</TableHead>
                  <TableHead className="font-semibold">Estado Factura</TableHead>
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
                      <TableCell className="font-mono">
                        <div className="flex items-center gap-1.5">
                          {po.requisition?.requisitionNumber || '-'}
                          {(po.requisition as any)?.priority === 'alta' && (
                            <Badge className="bg-red-600 text-white text-[10px] px-1 py-0">URGENTE</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getReceptionStatusBadge(po.receptionStatus || 'pendiente_recepcion')}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {po.requisition?.operationCenter?.company?.name || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{po.supplier?.name || '-'}</p>
                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">{po.supplier?.nitCc || '-'}</p>
                      </TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--canalco-primary))]">
                        {formatCurrency(po.totalAmount)}
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {progress.count}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600">
                        {formatCurrency(progress.amount)}
                      </TableCell>
                      <TableCell className="font-semibold text-red-500">
                        {formatCurrency(progress.pending)}
                      </TableCell>
                      <TableCell>
                        <div className="w-20">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                progress.percentage >= 100 ? 'bg-green-500' : progress.percentage > 0 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-center mt-0.5 font-medium">
                            {Math.round(progress.percentage)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getInvoiceStatusBadge(po.invoiceStatus)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/dashboard/compras/facturas/${po.purchaseOrderId}`)}
                            className="hover:bg-blue-50 h-7 w-7"
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

            <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-2">
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                {filteredAndSortedOrders.length} de {total} órdenes
              </p>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default GestionFacturasPage;
