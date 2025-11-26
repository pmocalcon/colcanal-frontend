import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle,
  X,
} from 'lucide-react';
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
  getInvoicesByPurchaseOrder,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoicesToAccounting,
  type Invoice,
  type PurchaseOrderForInvoicing,
  type InvoiceSummary,
  type CreateInvoiceDto,
  type UpdateInvoiceDto,
} from '@/services/invoices.service';

interface InvoiceFormData {
  invoiceNumber: string;
  issueDate: string;
  amount: string;
  materialQuantity: string;
}

const FacturasOrdenCompraPage: React.FC = () => {
  const navigate = useNavigate();
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderForInvoicing | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoiceNumber: '',
    issueDate: new Date().toISOString().split('T')[0],
    amount: '',
    materialQuantity: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Send to accounting state
  const [showSendToAccounting, setShowSendToAccounting] = useState(false);
  const [accountingDate, setAccountingDate] = useState(new Date().toISOString().split('T')[0]);
  const [sendingToAccounting, setSendingToAccounting] = useState(false);

  useEffect(() => {
    if (purchaseOrderId) {
      loadData();
    }
  }, [purchaseOrderId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getInvoicesByPurchaseOrder(Number(purchaseOrderId));
      setPurchaseOrder(response.purchaseOrder);
      setInvoices(response.invoices);
      setSummary(response.summary);
    } catch (err: any) {
      console.error('Error loading invoices:', err);
      setError(err.response?.data?.message || 'Error al cargar las facturas');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (invoice?: Invoice) => {
    if (invoice) {
      setEditingInvoice(invoice);
      setFormData({
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.split('T')[0],
        amount: invoice.amount.toString(),
        materialQuantity: invoice.materialQuantity.toString(),
      });
    } else {
      setEditingInvoice(null);
      // Pre-llenar con valores por defecto de la OC (pendiente por facturar)
      const defaultAmount = summary?.pendingAmount || purchaseOrder?.defaultInvoiceValues?.amount || purchaseOrder?.totalAmount || 0;
      const totalExpectedQuantity = purchaseOrder?.items?.reduce(
        (sum, item) => sum + Number(item.quantity),
        0
      ) || 0;
      const defaultQuantity = purchaseOrder?.defaultInvoiceValues?.materialQuantity
        || (totalExpectedQuantity - (summary?.totalInvoicedQuantity || 0));

      setFormData({
        invoiceNumber: '',
        issueDate: new Date().toISOString().split('T')[0],
        amount: defaultAmount > 0 ? defaultAmount.toString() : '',
        materialQuantity: defaultQuantity > 0 ? defaultQuantity.toString() : '',
      });
    }
    setFormError(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingInvoice(null);
    setFormError(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    if (!formData.invoiceNumber.trim()) {
      setFormError('El número de factura es requerido');
      return;
    }

    // Obtener valores (pueden ser vacíos si se usarán los por defecto del backend)
    const amountValue = formData.amount ? Number(formData.amount) : null;
    const quantityValue = formData.materialQuantity ? Number(formData.materialQuantity) : null;

    // Solo validar si se proporcionaron valores
    if (amountValue !== null && amountValue <= 0) {
      setFormError('El monto debe ser mayor a 0');
      return;
    }
    if (quantityValue !== null && quantityValue <= 0) {
      setFormError('La cantidad debe ser mayor a 0');
      return;
    }

    // Validar que no se exceda el monto total de la orden de compra (solo si se proporcionó monto)
    if (amountValue !== null) {
      const currentInvoicedAmount = invoices
        .filter(inv => !editingInvoice || inv.invoiceId !== editingInvoice.invoiceId)
        .reduce((sum, inv) => sum + Number(inv.amount), 0);

      const newTotalInvoiced = currentInvoicedAmount + amountValue;
      const totalOrderAmount = Number(purchaseOrder?.totalAmount || 0);

      if (newTotalInvoiced > totalOrderAmount) {
        const remainingAmount = totalOrderAmount - currentInvoicedAmount;
        setFormError(
          `El monto excede el total de la orden de compra. ` +
          `Monto disponible: ${formatCurrency(remainingAmount)}`
        );
        return;
      }
    }

    // Validar que no se exceda la cantidad total de materiales (solo si se proporcionó cantidad)
    if (quantityValue !== null) {
      const totalExpectedQuantity = purchaseOrder?.items?.reduce(
        (sum, item) => sum + Number(item.quantity),
        0
      ) || 0;

      const currentInvoicedQuantity = invoices
        .filter(inv => !editingInvoice || inv.invoiceId !== editingInvoice.invoiceId)
        .reduce((sum, inv) => sum + Number(inv.materialQuantity), 0);

      const newTotalInvoicedQuantity = currentInvoicedQuantity + quantityValue;

      if (newTotalInvoicedQuantity > totalExpectedQuantity) {
        const remainingQuantity = totalExpectedQuantity - currentInvoicedQuantity;
        setFormError(
          `La cantidad excede el total esperado de la orden de compra. ` +
          `Cantidad disponible: ${remainingQuantity}`
        );
        return;
      }
    }

    try {
      setFormLoading(true);

      if (editingInvoice) {
        // Update invoice
        const updateData: UpdateInvoiceDto = {
          invoiceNumber: formData.invoiceNumber,
          issueDate: formData.issueDate,
          amount: amountValue !== null ? amountValue : undefined,
          materialQuantity: quantityValue !== null ? quantityValue : undefined,
        };
        await updateInvoice(editingInvoice.invoiceId, updateData);
      } else {
        // Create invoice - amount y materialQuantity son opcionales
        // Si no se envían, el backend usa los valores por defecto de la OC
        const createData: CreateInvoiceDto = {
          purchaseOrderId: Number(purchaseOrderId),
          invoiceNumber: formData.invoiceNumber,
          issueDate: formData.issueDate,
          ...(amountValue !== null && { amount: amountValue }),
          ...(quantityValue !== null && { materialQuantity: quantityValue }),
        };
        await createInvoice(createData);
      }

      // Reload data
      await loadData();
      handleCloseForm();
    } catch (err: any) {
      console.error('Error saving invoice:', err);
      setFormError(err.response?.data?.message || 'Error al guardar la factura');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta factura?')) {
      return;
    }

    try {
      await deleteInvoice(invoiceId);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting invoice:', err);
      alert(err.response?.data?.message || 'Error al eliminar la factura');
    }
  };

  const handleSendToAccounting = async () => {
    try {
      setSendingToAccounting(true);
      await sendInvoicesToAccounting(Number(purchaseOrderId), {
        sentToAccountingDate: accountingDate,
      });
      await loadData();
      setShowSendToAccounting(false);
      alert('Facturas enviadas a contabilidad exitosamente');
    } catch (err: any) {
      console.error('Error sending to accounting:', err);
      alert(err.response?.data?.message || 'Error al enviar a contabilidad');
    } finally {
      setSendingToAccounting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const canAddInvoice = () => {
    return (
      summary &&
      summary.totalInvoices < 3 &&
      purchaseOrder?.invoiceStatus !== 'enviada_contabilidad'
    );
  };

  const canSendToAccounting = () => {
    return (
      summary &&
      summary.invoiceStatus === 'factura_completa' &&
      purchaseOrder?.invoiceStatus !== 'enviada_contabilidad'
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto text-red-600 mb-4" />
          <p className="text-lg font-medium">Orden de compra no encontrada</p>
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
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))]">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/compras/facturas')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Facturas - {purchaseOrder.purchaseOrderNumber}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Gestionar facturas de la orden de compra
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Purchase Order Info */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Información de la Orden de Compra</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nº Orden</Label>
              <p className="font-mono text-sm font-bold text-[hsl(var(--canalco-primary))]">
                {purchaseOrder.purchaseOrderNumber}
              </p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Requisición</Label>
              <p className="font-mono text-sm font-semibold">{purchaseOrder.requisition?.requisitionNumber}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Empresa</Label>
              <p className="text-sm font-medium">{purchaseOrder.requisition?.operationCenter?.company?.name || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total OC</Label>
              <p className="font-bold text-sm text-[hsl(var(--canalco-primary))]">
                {formatCurrency(purchaseOrder.totalAmount)}
              </p>
            </div>
          </div>
        </Card>

        {/* Supplier Info */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Información del Proveedor</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Nombre</Label>
              <p className="text-sm font-medium">{purchaseOrder.supplier?.name || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">NIT/CC</Label>
              <p className="text-sm font-mono">{purchaseOrder.supplier?.nitCc || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Contacto</Label>
              <p className="text-sm">{purchaseOrder.supplier?.contactPerson || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Teléfono</Label>
              <p className="text-sm">{purchaseOrder.supplier?.phone || '-'}</p>
            </div>
          </div>
        </Card>

        {/* Materials List */}
        {purchaseOrder.items && purchaseOrder.items.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Materiales de la Orden de Compra</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--canalco-neutral-50))]">
                    <TableHead className="text-xs font-semibold">Código</TableHead>
                    <TableHead className="text-xs font-semibold">Descripción</TableHead>
                    <TableHead className="text-xs font-semibold">Cantidad</TableHead>
                    <TableHead className="text-xs font-semibold">Unidad</TableHead>
                    <TableHead className="text-xs font-semibold">Precio Unit.</TableHead>
                    <TableHead className="text-xs font-semibold">Subtotal</TableHead>
                    <TableHead className="text-xs font-semibold">IVA</TableHead>
                    <TableHead className="text-xs font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrder.items.map((item) => (
                    <TableRow key={item.purchaseOrderItemId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                      <TableCell className="font-mono text-xs">{item.material?.codigo || '-'}</TableCell>
                      <TableCell className="text-xs">{item.material?.descripcion || '-'}</TableCell>
                      <TableCell className="text-xs font-semibold">{item.quantity}</TableCell>
                      <TableCell className="text-xs">{item.material?.unidadMedida || '-'}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(item.subtotal)}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(item.iva)}</TableCell>
                      <TableCell className="text-xs font-semibold">{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-[hsl(var(--canalco-neutral-50))] font-semibold">
                    <TableCell colSpan={2} className="text-xs">TOTAL</TableCell>
                    <TableCell className="text-xs">
                      {purchaseOrder.items.reduce((sum, item) => sum + Number(item.quantity), 0)}
                    </TableCell>
                    <TableCell colSpan={4}></TableCell>
                    <TableCell className="text-xs font-bold text-[hsl(var(--canalco-primary))]">
                      {formatCurrency(purchaseOrder.totalAmount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Summary Card */}
        {summary && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Resumen de Facturación</h2>
              <div className="flex gap-2">
                {canAddInvoice() && (
                  <Button onClick={() => handleOpenForm()} size="sm" className="bg-[hsl(var(--canalco-primary))] text-xs">
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar Factura
                  </Button>
                )}
                {canSendToAccounting() && (
                  <Button
                    onClick={() => setShowSendToAccounting(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-xs"
                  >
                    <Send className="w-4 h-4 mr-1" />
                    Enviar a Contabilidad
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Facturas</Label>
                <p className="text-sm font-bold">{summary.totalInvoices} / 3</p>
              </div>
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total Facturado</Label>
                <p className="text-sm font-bold text-green-600">
                  {formatCurrency(summary.totalInvoicedAmount)}
                </p>
              </div>
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Pendiente Monto</Label>
                <p className="text-sm font-bold text-orange-600">
                  {formatCurrency(summary.pendingAmount)}
                </p>
              </div>
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Cantidad Esperada</Label>
                <p className="text-sm font-bold">
                  {purchaseOrder.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0}
                </p>
              </div>
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Cantidad Facturada</Label>
                <p className="text-sm font-bold text-green-600">{summary.totalInvoicedQuantity}</p>
              </div>
              <div>
                <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Estado</Label>
                <div className="mt-1">
                  {summary.invoiceStatus === 'sin_factura' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Sin Factura
                    </span>
                  )}
                  {summary.invoiceStatus === 'facturacion_parcial' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Parcial
                    </span>
                  )}
                  {summary.invoiceStatus === 'factura_completa' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Completa
                    </span>
                  )}
                  {summary.invoiceStatus === 'enviada_contabilidad' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      En Contabilidad
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="mt-3 space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Progreso Monto</Label>
                  <span className="text-xs font-medium">
                    {Math.round((summary.totalInvoicedAmount / purchaseOrder.totalAmount) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      summary.invoiceStatus === 'factura_completa' || summary.invoiceStatus === 'enviada_contabilidad'
                        ? 'bg-green-500'
                        : summary.invoiceStatus === 'facturacion_parcial'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.min((summary.totalInvoicedAmount / purchaseOrder.totalAmount) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-[hsl(var(--canalco-neutral-600))]">Progreso Cantidad</Label>
                  <span className="text-xs font-medium">
                    {(() => {
                      const totalExpected = purchaseOrder.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;
                      return totalExpected > 0 ? Math.round((summary.totalInvoicedQuantity / totalExpected) * 100) : 0;
                    })()}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      summary.invoiceStatus === 'factura_completa' || summary.invoiceStatus === 'enviada_contabilidad'
                        ? 'bg-green-500'
                        : summary.invoiceStatus === 'facturacion_parcial'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{
                      width: `${(() => {
                        const totalExpected = purchaseOrder.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;
                        return totalExpected > 0 ? Math.min((summary.totalInvoicedQuantity / totalExpected) * 100, 100) : 0;
                      })()}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Invoices Table */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Facturas Registradas</h2>

          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-3" />
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                No hay facturas registradas
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                Haz clic en "Agregar Factura" para registrar la primera factura
              </p>
            </div>
          ) : (
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
                    <TableHead className="text-xs font-semibold">Creada Por</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.invoiceId} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                      <TableCell className="font-mono text-xs font-semibold">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="text-xs">{formatDate(new Date(invoice.issueDate))}</TableCell>
                      <TableCell className="text-xs font-semibold text-green-600">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">{invoice.materialQuantity}</TableCell>
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
                      <TableCell className="text-xs">{invoice.creator?.nombre || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        {!invoice.sentToAccounting && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenForm(invoice)}
                              className="hover:bg-blue-50"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteInvoice(invoice.invoiceId)}
                              className="hover:bg-red-50"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </Card>

        {/* Invoice Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md p-4">
              <h2 className="text-base font-bold mb-3">
                {editingInvoice ? 'Editar Factura' : 'Nueva Factura'}
              </h2>

              {/* Info disponible */}
              {!editingInvoice && summary && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-semibold text-blue-900 mb-1">Disponible para facturar:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-blue-700">Monto:</p>
                      <p className="text-xs font-bold text-blue-900">
                        {formatCurrency(summary.pendingAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-700">Cantidad:</p>
                      <p className="text-xs font-bold text-blue-900">
                        {(() => {
                          const totalExpected = purchaseOrder?.items?.reduce(
                            (sum, item) => sum + Number(item.quantity),
                            0
                          ) || 0;
                          return totalExpected - summary.totalInvoicedQuantity;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {formError && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="space-y-3">
                <div>
                  <Label htmlFor="invoiceNumber" className="text-xs">Número de Factura *</Label>
                  <Input
                    id="invoiceNumber"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    placeholder="Ej: FAC-001"
                    className="text-sm"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="issueDate" className="text-xs">Fecha de Emisión *</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="text-sm"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="amount" className="text-xs">
                    Monto (COP) <span className="text-[hsl(var(--canalco-neutral-500))]">(pre-llenado)</span>
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="Usa valor de la OC"
                    className="text-sm"
                  />
                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Si se deja vacío, usará el monto pendiente de la OC
                  </p>
                </div>

                <div>
                  <Label htmlFor="materialQuantity" className="text-xs">
                    Cantidad de Material <span className="text-[hsl(var(--canalco-neutral-500))]">(pre-llenado)</span>
                  </Label>
                  <Input
                    id="materialQuantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.materialQuantity}
                    onChange={(e) => setFormData({ ...formData, materialQuantity: e.target.value })}
                    placeholder="Usa cantidad de la OC"
                    className="text-sm"
                  />
                  <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Si se deja vacío, usará la cantidad pendiente de la OC
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={handleCloseForm} disabled={formLoading} className="text-xs">
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={formLoading} className="bg-[hsl(var(--canalco-primary))] text-xs">
                    {formLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Send to Accounting Modal */}
        {showSendToAccounting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md p-4">
              <h2 className="text-base font-bold mb-3">Enviar a Contabilidad</h2>

              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mb-3">
                Las facturas de esta orden de compra serán marcadas como enviadas a contabilidad.
                Esta acción no se puede deshacer.
              </p>

              <div className="mb-3">
                <Label htmlFor="accountingDate" className="text-xs">Fecha de Envío</Label>
                <Input
                  id="accountingDate"
                  type="date"
                  value={accountingDate}
                  onChange={(e) => setAccountingDate(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSendToAccounting(false)}
                  disabled={sendingToAccounting}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSendToAccounting}
                  size="sm"
                  disabled={sendingToAccounting}
                  className="bg-blue-600 hover:bg-blue-700 text-xs"
                >
                  {sendingToAccounting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Confirmar Envío
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

export default FacturasOrdenCompraPage;
