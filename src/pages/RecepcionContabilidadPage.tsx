import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle,
  Eye,
  Calendar,
  Building,
  Package,
  X,
  Search,
} from 'lucide-react';
import { StatusDashboard, type StatusCount } from '@/components/ui/status-dashboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  getAccountingPendingInvoices,
  getAccountingReceivedInvoices,
  markInvoicesAsReceived,
  type PurchaseOrderForInvoicing,
  type Invoice,
} from '@/services/invoices.service';
import { useAuth } from '@/contexts/AuthContext';

const RecepcionContabilidadPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Data states for both sections
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrderForInvoicing[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<PurchaseOrderForInvoicing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Totals
  const [pendingTotal, setPendingTotal] = useState(0);
  const [receivedTotal, setReceivedTotal] = useState(0);

  // Pagination for received section (internal pagination)
  const [receivedPage, setReceivedPage] = useState(1);
  const receivedLimit = 10;

  // Filter states
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterOrderNumber, setFilterOrderNumber] = useState<string>('');

  // Detail modal state
  const [selectedPO, setSelectedPO] = useState<PurchaseOrderForInvoicing | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Mark as received state
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [markingReceived, setMarkingReceived] = useState(false);

  // Check if user has Contabilidad role
  const isContabilidad = user?.nombreRol === 'Contabilidad';

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both pending and received data
      const [pendingResponse, receivedResponse] = await Promise.all([
        getAccountingPendingInvoices(1, 100), // Get all pending
        getAccountingReceivedInvoices(1, 100), // Get all received
      ]);

      setPendingOrders(pendingResponse.data);
      setPendingTotal(pendingResponse.total);
      setReceivedOrders(receivedResponse.data);
      setReceivedTotal(receivedResponse.total);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (po: PurchaseOrderForInvoicing) => {
    setSelectedPO(po);
    setShowDetailModal(true);
  };

  const handleOpenReceiveModal = (po: PurchaseOrderForInvoicing) => {
    setSelectedPO(po);
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setShowReceiveModal(true);
  };

  const handleMarkAsReceived = async () => {
    if (!selectedPO) return;

    try {
      setMarkingReceived(true);
      await markInvoicesAsReceived(selectedPO.purchaseOrderId, {
        receivedDate,
      });
      await loadAllData();
      setShowReceiveModal(false);
      setSelectedPO(null);
      alert('Facturas marcadas como recibidas exitosamente');
    } catch (err: any) {
      console.error('Error marking as received:', err);
      alert(err.response?.data?.message || 'Error al marcar como recibidas');
    } finally {
      setMarkingReceived(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      enviada_contabilidad: { label: 'Enviada', className: 'bg-blue-100 text-blue-800' },
      recibida_contabilidad: { label: 'Recibida', className: 'bg-green-100 text-green-800' },
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

  // Get unique companies from pending orders
  const getUniqueCompanies = () => {
    const companies = new Set<string>();
    pendingOrders.forEach((po) => {
      const companyName = po.requisition?.operationCenter?.company?.name;
      if (companyName) companies.add(companyName);
    });
    return Array.from(companies).sort();
  };

  // Filter pending orders
  const filteredPendingOrders = pendingOrders.filter((po) => {
    // Filter by company
    if (filterCompany !== 'all') {
      const companyName = po.requisition?.operationCenter?.company?.name || '';
      if (companyName !== filterCompany) return false;
    }

    // Filter by supplier name
    if (filterSupplier) {
      const supplierName = po.supplier?.name?.toLowerCase() || '';
      if (!supplierName.includes(filterSupplier.toLowerCase())) return false;
    }

    // Filter by order number
    if (filterOrderNumber) {
      const orderNum = po.purchaseOrderNumber?.toLowerCase() || '';
      if (!orderNum.includes(filterOrderNumber.toLowerCase())) return false;
    }

    return true;
  });

  if (loading && pendingOrders.length === 0 && receivedOrders.length === 0) {
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
                Recepción de Facturas - Contabilidad
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Confirmar recepción de facturas enviadas por compras
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Summary Bar */}
        <div className="mb-6 p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
          <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
            Total: <span className="font-semibold text-[hsl(var(--canalco-primary))]">{pendingTotal + receivedTotal}</span> órdenes con facturas (
            <span className="text-orange-600 font-semibold">
              {pendingTotal} pendientes
            </span>
            {' y '}
            <span className="text-green-600 font-semibold">
              {receivedTotal} recibidas
            </span>
            )
          </p>
        </div>

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

        {/* Access Warning for non-Contabilidad users */}
        {!isContabilidad && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-900">Solo lectura</p>
              <p className="text-sm text-yellow-700">
                Solo el rol de Contabilidad puede marcar facturas como recibidas.
                Tu rol actual es: {user?.nombreRol || 'Sin rol'}
              </p>
            </div>
          </div>
        )}

        {/* Status Dashboard */}
        <StatusDashboard
          title="Pendientes de Atención"
          statusCounts={[
            {
              label: 'Pendientes de Recibir',
              count: filteredPendingOrders.length,
              color: 'orange',
            },
          ]}
          className="mb-6"
        />

        {/* Filters Section */}
        <Card className="mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Company Filter */}
            <div>
              <Label htmlFor="filterCompany" className="text-sm font-medium mb-1 block">
                Empresa
              </Label>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger id="filterCompany">
                  <SelectValue placeholder="Todas las empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {getUniqueCompanies().map((company) => (
                    <SelectItem key={company} value={company}>
                      {company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier Filter */}
            <div>
              <Label htmlFor="filterSupplier" className="text-sm font-medium mb-1 block">
                Proveedor
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--canalco-neutral-400))]" />
                <Input
                  id="filterSupplier"
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Order Number Filter */}
            <div>
              <Label htmlFor="filterOrderNumber" className="text-sm font-medium mb-1 block">
                Nº Orden
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--canalco-neutral-400))]" />
                <Input
                  id="filterOrderNumber"
                  type="text"
                  placeholder="Buscar orden..."
                  value={filterOrderNumber}
                  onChange={(e) => setFilterOrderNumber(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFilterCompany('all');
                  setFilterSupplier('');
                  setFilterOrderNumber('');
                }}
                className="w-full"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </Card>

        {/* Tables Container */}
        {pendingOrders.length === 0 && receivedOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
            <FileText className="h-16 w-16 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-4" />
            <p className="text-lg font-medium text-[hsl(var(--canalco-neutral-700))]">
              No hay facturas registradas
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-2">
              Las facturas enviadas por compras aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* SECCIÓN: PENDIENTES DE RECIBIR */}
            {filteredPendingOrders.length > 0 && (
              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 border-b border-orange-200">
                  <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    PENDIENTES DE RECIBIR ({filteredPendingOrders.length})
                  </p>
                </div>
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
                      <TableHead className="font-semibold">Estado</TableHead>
                      <TableHead className="font-semibold text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPendingOrders.map((po) => {
                      const progress = getInvoiceProgress(po);
                      return (
                        <TableRow key={po.purchaseOrderId} className="bg-white hover:bg-orange-50/30 transition-colors">
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
                          <TableCell>{getStatusBadge(po.invoiceStatus)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetails(po)}
                                className="hover:bg-blue-50"
                                title="Ver detalles"
                              >
                                <Eye className="w-4 h-4 text-blue-600" />
                              </Button>
                              {isContabilidad && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenReceiveModal(po)}
                                  className="hover:bg-green-50"
                                  title="Marcar como recibida"
                                >
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* SECCIÓN: YA RECIBIDAS */}
            {receivedOrders.length > 0 && (() => {
              // Paginación interna
              const receivedTotalPages = Math.ceil(receivedTotal / receivedLimit);
              const receivedStartIndex = (receivedPage - 1) * receivedLimit;
              const receivedEndIndex = receivedStartIndex + receivedLimit;
              const paginatedReceivedOrders = receivedOrders.slice(receivedStartIndex, receivedEndIndex);

              return (
                <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                  <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                    <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      YA RECIBIDAS ({receivedTotal})
                    </p>
                  </div>
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
                        <TableHead className="font-semibold">Estado</TableHead>
                        <TableHead className="font-semibold text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReceivedOrders.map((po) => {
                        const progress = getInvoiceProgress(po);
                        return (
                          <TableRow key={po.purchaseOrderId} className="bg-white hover:bg-green-50/30 transition-colors">
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
                            <TableCell>{getStatusBadge(po.invoiceStatus)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewDetails(po)}
                                  className="hover:bg-blue-50"
                                  title="Ver detalles"
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

                  {/* Paginación de sección recibidas */}
                  {receivedTotalPages > 1 && (
                    <div className="border-t border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center justify-between bg-green-50/30">
                      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                        Mostrando {receivedStartIndex + 1} - {Math.min(receivedEndIndex, receivedTotal)} de {receivedTotal} recibidas
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReceivedPage((p) => Math.max(1, p - 1))}
                          disabled={receivedPage === 1}
                          className="h-8 text-xs"
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-[hsl(var(--canalco-neutral-700))]">
                          Página {receivedPage} de {receivedTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReceivedPage((p) => Math.min(receivedTotalPages, p + 1))}
                          disabled={receivedPage === receivedTotalPages}
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

        {/* Detail Modal */}
        {showDetailModal && selectedPO && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  Detalle - {selectedPO.purchaseOrderNumber}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedPO(null);
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Order Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nº Orden</Label>
                  <p className="font-mono text-sm font-bold text-[hsl(var(--canalco-primary))]">
                    {selectedPO.purchaseOrderNumber}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Requisición</Label>
                  <p className="font-mono text-sm font-semibold">
                    {selectedPO.requisition?.requisitionNumber || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Empresa</Label>
                  <p className="text-sm font-medium">
                    {selectedPO.requisition?.operationCenter?.company?.name || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total OC</Label>
                  <p className="font-bold text-sm text-[hsl(var(--canalco-primary))]">
                    {formatCurrency(selectedPO.totalAmount)}
                  </p>
                </div>
              </div>

              {/* Supplier Info */}
              <Card className="p-4 mb-6 bg-[hsl(var(--canalco-neutral-50))]">
                <div className="flex items-center gap-2 mb-3">
                  <Building className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                  <h3 className="text-sm font-semibold">Proveedor</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nombre</Label>
                    <p className="text-sm font-medium">{selectedPO.supplier?.name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">NIT/CC</Label>
                    <p className="text-sm font-mono">{selectedPO.supplier?.nitCc || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Contacto</Label>
                    <p className="text-sm">{selectedPO.supplier?.contactPerson || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Teléfono</Label>
                    <p className="text-sm">{selectedPO.supplier?.phone || '-'}</p>
                  </div>
                </div>
              </Card>

              {/* Materials */}
              {selectedPO.items && selectedPO.items.length > 0 && (
                <Card className="p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                    <h3 className="text-sm font-semibold">Materiales</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                          <TableHead className="text-xs font-semibold">Código</TableHead>
                          <TableHead className="text-xs font-semibold">Descripción</TableHead>
                          <TableHead className="text-xs font-semibold">Cantidad</TableHead>
                          <TableHead className="text-xs font-semibold">Precio Unit.</TableHead>
                          <TableHead className="text-xs font-semibold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPO.items.map((item) => (
                          <TableRow key={item.purchaseOrderItemId}>
                            <TableCell className="font-mono text-xs">{item.material?.codigo || '-'}</TableCell>
                            <TableCell className="text-xs">{item.material?.descripcion || '-'}</TableCell>
                            <TableCell className="text-xs font-semibold">{item.quantity}</TableCell>
                            <TableCell className="text-xs">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-xs font-semibold">{formatCurrency(item.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Invoices */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />
                  <h3 className="text-sm font-semibold">Facturas</h3>
                </div>
                {selectedPO.invoices && selectedPO.invoices.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                          <TableHead className="text-xs font-semibold">Nº Factura</TableHead>
                          <TableHead className="text-xs font-semibold">Fecha Emisión</TableHead>
                          <TableHead className="text-xs font-semibold">Monto</TableHead>
                          <TableHead className="text-xs font-semibold">Cantidad Material</TableHead>
                          <TableHead className="text-xs font-semibold">Enviada a Contabilidad</TableHead>
                          <TableHead className="text-xs font-semibold">Fecha Envío</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPO.invoices.map((invoice: Invoice) => (
                          <TableRow key={invoice.invoiceId}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDate(new Date(invoice.issueDate))}
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-green-600">
                              {formatCurrency(invoice.amount)}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">
                              {invoice.materialQuantity}
                            </TableCell>
                            <TableCell>
                              {invoice.sentToAccounting ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <X className="w-4 h-4 text-gray-400" />
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {invoice.sentToAccountingDate
                                ? formatDate(new Date(invoice.sentToAccountingDate))
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-[hsl(var(--canalco-neutral-500))] text-center py-4">
                    No hay facturas registradas
                  </p>
                )}
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedPO(null);
                  }}
                >
                  Cerrar
                </Button>
                {pendingOrders.some(po => po.purchaseOrderId === selectedPO.purchaseOrderId) && isContabilidad && (
                  <Button
                    onClick={() => {
                      setShowDetailModal(false);
                      handleOpenReceiveModal(selectedPO);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Marcar como Recibida
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Mark as Received Modal */}
        {showReceiveModal && selectedPO && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md p-6">
              <h2 className="text-lg font-bold mb-4">Confirmar Recepción de Facturas</h2>

              <div className="mb-4 p-4 bg-[hsl(var(--canalco-neutral-50))] rounded-lg">
                <p className="text-sm">
                  <span className="font-semibold">Orden de Compra:</span>{' '}
                  <span className="font-mono text-[hsl(var(--canalco-primary))]">
                    {selectedPO.purchaseOrderNumber}
                  </span>
                </p>
                <p className="text-sm mt-1">
                  <span className="font-semibold">Proveedor:</span> {selectedPO.supplier?.name || '-'}
                </p>
                <p className="text-sm mt-1">
                  <span className="font-semibold">Total Facturado:</span>{' '}
                  <span className="text-green-600 font-semibold">
                    {formatCurrency(Number(selectedPO.totalInvoicedAmount) || 0)}
                  </span>
                </p>
                <p className="text-sm mt-1">
                  <span className="font-semibold">Número de Facturas:</span>{' '}
                  {selectedPO.invoices?.length || 0}
                </p>
              </div>

              <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mb-4">
                Las facturas de esta orden de compra serán marcadas como recibidas por contabilidad.
              </p>

              <div className="mb-4">
                <Label htmlFor="receivedDate" className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Fecha de Recepción
                </Label>
                <Input
                  id="receivedDate"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReceiveModal(false);
                    setSelectedPO(null);
                  }}
                  disabled={markingReceived}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleMarkAsReceived}
                  disabled={markingReceived}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {markingReceived ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirmar Recepción
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default RecepcionContabilidadPage;
