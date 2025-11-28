import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { getPurchaseOrderById, type PurchaseOrder } from '@/services/purchase-orders.service';
import { companyContactsService, type CompanyContact } from '@/services/company-contacts.service';
import { formatDateShort, getNowInColombia } from '@/utils/dateUtils';

export default function VerOrdenCompraIndividualPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const navigate = useNavigate();
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [shippingContact, setShippingContact] = useState<CompanyContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadShippingContact = useCallback(async (companyId: number, projectId?: number) => {
    try {
      const contact = await companyContactsService.getDefaultContact(companyId, projectId);
      setShippingContact(contact);
    } catch (err) {
      console.error('Error loading shipping contact:', err);
      setShippingContact(null);
    }
  }, []);

  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      if (!purchaseOrderId) {
        setError('ID de orden de compra no proporcionado');
        setLoading(false);
        return;
      }

      try {
        const data = await getPurchaseOrderById(parseInt(purchaseOrderId));
        console.log('Purchase order data:', data);
        setPurchaseOrder(data);

        // Load shipping contact if we have company info
        if (data.requisition?.operationCenter?.company?.companyId) {
          await loadShippingContact(data.requisition.operationCenter.company.companyId);
        }
      } catch (err: any) {
        console.error('Error fetching purchase order:', err);
        setError(err.response?.data?.message || 'Error al cargar la orden de compra');
      } finally {
        setLoading(false);
      }
    };

    fetchPurchaseOrder();
  }, [purchaseOrderId, loadShippingContact]);

  const formatCurrency = (value: number | undefined | null): string => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Check if approved by looking at code, name, or description
  const isApproved = purchaseOrder?.approvalStatus?.code?.toLowerCase().includes('aprobad') ||
                     purchaseOrder?.approvalStatus?.name?.toLowerCase().includes('aprobad') ||
                     purchaseOrder?.approvalStatus?.description?.toLowerCase().includes('aprobad');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando orden de compra...</p>
        </div>
      </div>
    );
  }

  if (error || !purchaseOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-start gap-3 p-6">
              <AlertCircle className="w-6 h-6 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">No se pudo cargar la orden de compra</p>
                <p className="text-sm text-red-700 mt-1">
                  {error || 'Verifica el ID de la orden de compra.'}
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const today = formatDateShort(getNowInColombia());
  const operationCenter = purchaseOrder.requisition?.operationCenter?.name ||
                          purchaseOrder.requisition?.operationCenter?.code || '-';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm print:shadow-none print:border-b-2 print:border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:bg-[hsl(var(--canalco-neutral-200))] print:hidden"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] print:shadow-none print:border-gray-400">
              <img
                src="/assets/images/logo-canalco.png"
                alt="Logo de la empresa"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Orden de Compra</p>
              <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                {purchaseOrder.purchaseOrderNumber}
              </h1>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                Ref: {purchaseOrder.requisition?.requisitionNumber || `REQ-${purchaseOrder.requisitionId}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Fecha de emisión</p>
            <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">{today}</p>
            {purchaseOrder.approvalStatus && (
              <span
                className="inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: purchaseOrder.approvalStatus.color + '20',
                  color: purchaseOrder.approvalStatus.color,
                }}
              >
                {purchaseOrder.approvalStatus.name}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 print:py-4 print:space-y-4">
        {/* Encabezado de datos - 3 cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
          {/* Datos del Proveedor */}
          <Card className="print:shadow-none print:border">
            <CardContent className="p-6 space-y-3 print:p-4">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                Datos del Proveedor
              </p>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] print:text-base">
                  {purchaseOrder.supplier?.name || 'Proveedor no asignado'}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                  NIT: {purchaseOrder.supplier?.nitCc || purchaseOrder.supplier?.nit || 'N/D'}
                </p>
                {purchaseOrder.supplier && (
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                    {[
                      purchaseOrder.supplier.contactName,
                      purchaseOrder.supplier.contactEmail,
                      purchaseOrder.supplier.contactPhone
                    ].filter(Boolean).join(' • ') || 'Contacto no registrado'}
                  </p>
                )}
              </div>
              {!purchaseOrder.supplier && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  Proveedor no encontrado
                </div>
              )}
            </CardContent>
          </Card>

          {/* Datos del Solicitante */}
          <Card className="print:shadow-none print:border">
            <CardContent className="p-6 space-y-3 print:p-4">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                Datos del Solicitante
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Empresa</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {purchaseOrder.requisition?.operationCenter?.company?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Centro de Operación</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {operationCenter}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información de envío */}
          <Card className="lg:col-span-1 print:shadow-none print:border">
            <CardContent className="p-6 space-y-3 print:p-4">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                Información de envío
              </p>
              {shippingContact ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-[hsl(var(--canalco-neutral-600))]">Razón social</p>
                    <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                      {shippingContact.businessName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--canalco-neutral-600))]">NIT</p>
                    <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                      {shippingContact.nit}
                    </p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--canalco-neutral-600))]">Dirección</p>
                    <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                      {[shippingContact.address, shippingContact.city]
                        .filter(Boolean)
                        .join(' • ') || 'No registrada'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--canalco-neutral-600))]">Teléfono / Contacto</p>
                    <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                      {[shippingContact.phone, shippingContact.contactPerson]
                        .filter(Boolean)
                        .join(' • ') || 'No registrado'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                  No hay contacto de envío configurado para esta empresa/proyecto.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabla de ítems */}
        <Card className="print:shadow-none print:border">
          <CardContent className="p-0">
            <div className="px-6 pt-6 pb-3 print:px-4 print:pt-4">
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                Ítems de la orden
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                Detalle de materiales, cantidades y precios
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[hsl(var(--canalco-neutral-100))] print:bg-gray-100">
                  <TableRow>
                    <TableHead className="w-24 font-semibold">Código</TableHead>
                    <TableHead className="font-semibold">Material</TableHead>
                    <TableHead className="w-20 font-semibold text-center">Cant.</TableHead>
                    <TableHead className="w-20 font-semibold text-center">Unidad</TableHead>
                    <TableHead className="w-28 font-semibold text-right">P. Unitario</TableHead>
                    <TableHead className="w-28 font-semibold text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!purchaseOrder.items || purchaseOrder.items.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[hsl(var(--canalco-neutral-600))] py-8">
                        No hay ítems en esta orden.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchaseOrder.items.map((item) => (
                      <TableRow key={item.poItemId}>
                        <TableCell className="font-mono text-sm text-[hsl(var(--canalco-primary))]">
                          {item.requisitionItem?.material?.code || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {item.requisitionItem?.material?.description || 'Material no especificado'}
                          </p>
                          {item.requisitionItem?.observation && (
                            <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                              Obs.: {item.requisitionItem.observation}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-[hsl(var(--canalco-neutral-900))]">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-center text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {item.requisitionItem?.material?.unit || 'UND'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--canalco-neutral-900))]">
                          {formatCurrency(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totales */}
            <div className="px-6 py-4 border-t border-[hsl(var(--canalco-neutral-200))] print:px-4">
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--canalco-neutral-600))]">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.subtotal)}</span>
                  </div>
                  {Number(purchaseOrder.totalDiscount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[hsl(var(--canalco-neutral-600))]">Descuento:</span>
                      <span className="font-medium text-green-600">
                        -{formatCurrency(purchaseOrder.totalDiscount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--canalco-neutral-600))]">IVA (19%):</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.totalIva)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-[hsl(var(--canalco-neutral-300))] pt-2 mt-2">
                    <span>TOTAL:</span>
                    <span className="text-[hsl(var(--canalco-primary))]">
                      {formatCurrency(purchaseOrder.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sección de firmas */}
        <Card className="print:shadow-none print:border print:break-inside-avoid">
          <CardContent className="p-6 print:p-4">
            <div className="grid grid-cols-2 gap-8 print:gap-4">
              {/* Firma Compras */}
              <div className="text-center">
                <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {purchaseOrder.creator?.nombre || 'Compras'}
                </p>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Departamento de Compras</p>
              </div>

              {/* Firma Gerencia */}
              <div className="text-center">
                {isApproved ? (
                  <>
                    {purchaseOrder.approvals?.[0]?.approver?.nombre ? (
                      <>
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                          {purchaseOrder.approvals[0].approver.nombre}
                        </p>
                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Gerencia</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">Gerencia</p>
                        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Gerencia</p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-400))]">
                      Pendiente de aprobación
                    </p>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Gerencia</p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-[hsl(var(--canalco-neutral-500))] pt-4 print:pt-2">
          <p>Este documento es una orden de compra oficial.</p>
          <p className="mt-1">
            Generado el {new Date().toLocaleDateString('es-CO', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 1cm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
