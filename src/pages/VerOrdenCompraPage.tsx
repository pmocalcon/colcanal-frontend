import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPurchaseOrdersByRequisition,
  type PurchaseOrder,
  getRequisitionWithPrices,
} from '@/services/purchase-orders.service';
import type { RequisitionWithQuotations } from '@/services/quotation.service';
import { companyContactsService, type CompanyContact } from '@/services/company-contacts.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDate, formatCurrency } from '@/utils/dateUtils';

const statusStyles: Record<string, string> = {
  pendiente_recepcion: 'bg-purple-100 text-purple-800 border-purple-200',
  en_orden_compra: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  aprobada: 'bg-green-100 text-green-700 border-green-200',
  rechazada: 'bg-red-100 text-red-700 border-red-200',
};

const getStatusClass = (code?: string) => statusStyles[code || ''] || 'bg-gray-100 text-gray-700';

export default function VerOrdenCompraPage() {
  const navigate = useNavigate();
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const { user } = useAuth();
  const isCompras = user?.nombreRol === 'Compras';

  const [requisition, setRequisition] = useState<RequisitionWithQuotations | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
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

  const loadData = useCallback(async () => {
    if (!requisitionId) return;
    try {
      setLoading(true);
      setError(null);

      const [reqData, orders] = await Promise.all([
        getRequisitionWithPrices(Number(requisitionId)),
        getPurchaseOrdersByRequisition(Number(requisitionId)),
      ]);

      console.log('Requisition data:', reqData);
      console.log('Purchase orders from API:', orders);
      console.log('Requisition purchaseOrders:', reqData.purchaseOrders);

      // Usar las órdenes de compra de la requisición si el endpoint no las devuelve
      const finalOrders = orders.length > 0 ? orders : (reqData.purchaseOrders || []);

      setRequisition(reqData);
      setPurchaseOrders(Array.isArray(finalOrders) ? finalOrders : []);

      if (reqData.company?.companyId) {
        await loadShippingContact(
          reqData.company.companyId,
          reqData.project?.projectId ?? reqData.projectId ?? undefined
        );
      } else {
        setShippingContact(null);
      }
    } catch (err) {
      console.error('Error loading purchase order detail:', err);
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(
        apiError.response?.data?.message || 'No se pudo cargar la información de la orden de compra'
      );
    } finally {
      setLoading(false);
    }
  }, [requisitionId, loadShippingContact]);

  useEffect(() => {
    if (!isCompras) {
      navigate('/dashboard');
      return;
    }
    if (!requisitionId) {
      navigate('/dashboard/compras/ordenes');
      return;
    }
    loadData();
  }, [isCompras, requisitionId, loadData, navigate]);

  const totals = useMemo(() => {
    return purchaseOrders.reduce(
      (acc, po) => {
        acc.subtotal += Number(po.subtotal) || 0;
        acc.iva += Number(po.totalIva) || 0;
        acc.discount += Number(po.totalDiscount) || 0;
        acc.total += Number(po.totalAmount) || 0;
        return acc;
      },
      { subtotal: 0, iva: 0, discount: 0, total: 0 }
    );
  }, [purchaseOrders]);

  // Mapeo de observaciones de items de la requisición para fallback
  const itemObservationsMap = useMemo(() => {
    const map = new Map<number, string>();
    if (requisition?.items) {
      for (const item of requisition.items) {
        if (item.observation) {
          map.set(item.itemId, item.observation);
        }
      }
    }
    return map;
  }, [requisition]);

  if (!isCompras) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando órdenes de compra...</p>
        </div>
      </div>
    );
  }

  if (error || !requisition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertDescription className="space-y-3">
              <p className="font-semibold">Error al cargar</p>
              <p>{error || 'No se encontró la información solicitada.'}</p>
              <Button variant="outline" onClick={loadData} className="w-full">
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white shadow-sm border-b border-[hsl(var(--canalco-neutral-300))] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard/compras/ordenes')}
              className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              title="Volver a Órdenes"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))]">
              <img
                src="/assets/images/logo-canalco.png"
                alt="Logo de la empresa"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide">
                Órdenes de Compra
              </p>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  Requisición {requisition.requisitionNumber}
                </h1>
                {requisition.priority === 'alta' && (
                  <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                    URGENTE
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Badge className="bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] border border-[hsl(var(--canalco-primary))]/20">
            {requisition.status?.name || 'Sin estado'}
          </Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <section className="bg-white rounded-xl shadow-lg p-6 border border-[hsl(var(--canalco-neutral-200))]">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
            <h2 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
              Información de la Requisición
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Fecha</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {formatDate(requisition.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Solicitante</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {requisition.creator?.nombre || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Empresa</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {requisition.company?.name || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Proyecto / Obra</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {requisition.project?.name || requisition.obra || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Centro de operación</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {requisition.operationCenter?.name || requisition.operationCenter?.code || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Código de obra</p>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                {requisition.codigoObra || 'No especificado'}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] p-4">
            <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide mb-2">
              Información de envío / facturación
            </p>
            {shippingContact ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Razón social</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {shippingContact.businessName}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">NIT</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">{shippingContact.nit}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Teléfono</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {shippingContact.phone || 'No registrado'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Dirección</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {[shippingContact.address, shippingContact.city].filter(Boolean).join(' • ') || 'No registrada'}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Contacto</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {[shippingContact.contactPerson, shippingContact.email].filter(Boolean).join(' • ') ||
                      'No registrado'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                No hay contacto de envío/facturación definido para esta empresa/proyecto.
              </p>
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-lg p-6 border border-[hsl(var(--canalco-neutral-200))]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              <h2 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
                Órdenes de compra generadas
              </h2>
            </div>
            <div className="text-right text-sm">
              <p className="text-[hsl(var(--canalco-neutral-600))]">Total órdenes</p>
              <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">{purchaseOrders.length}</p>
            </div>
          </div>

          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              Esta requisición aún no tiene órdenes de compra generadas.
            </p>
          ) : (
            <div className="space-y-6">
              {purchaseOrders.map((po) => {
                // Debug: ver qué datos tiene cada orden
                console.log('Purchase Order:', po);

                // Check if approved by looking at code, name, or description
                const isApproved = po.approvalStatus?.code?.toLowerCase().includes('aprobad') ||
                                   po.approvalStatus?.name?.toLowerCase().includes('aprobad') ||
                                   po.approvalStatus?.description?.toLowerCase().includes('aprobad');

                return (
                <div
                  key={po.purchaseOrderId}
                  className={`rounded-xl p-5 shadow-sm ${
                    isApproved
                      ? 'border-2 border-green-400 bg-green-50'
                      : 'border border-[hsl(var(--canalco-neutral-200))]'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Nº Orden</p>
                      <p className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
                        {po.purchaseOrderNumber}
                      </p>
                      <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                        Emitida el {formatDate(po.issueDate || po.createdAt)}
                      </p>
                    </div>
                    <Badge className={`${getStatusClass(po.approvalStatus?.code)} border`}>
                      {po.approvalStatus?.description || po.approvalStatus?.name || 'Sin estado'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-sm">
                    <div>
                      <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Proveedor</p>
                      <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                        {po.supplier?.name || 'Sin proveedor'}
                      </p>
                      <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                        NIT: {po.supplier?.nit || po.supplier?.nitCc || 'N/D'}
                      </p>
                      {po.supplier?.contactName && (
                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                          Contacto: {po.supplier.contactName}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Totales</p>
                      <div className="space-y-1">
                        <p>Subtotal: {formatCurrency(po.subtotal)}</p>
                        <p>IVA: {formatCurrency(po.totalIva)}</p>
                        {po.totalDiscount > 0 && <p>Descuento: -{formatCurrency(po.totalDiscount)}</p>}
                        {po.otherValue && po.otherValue > 0 && (
                          <p className="text-blue-600">Otros: +{formatCurrency(po.otherValue)}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[hsl(var(--canalco-neutral-500))] text-xs">Monto total</p>
                      <p className="text-xl font-bold text-[hsl(var(--canalco-primary))]">
                        {formatCurrency(po.totalAmount)}
                      </p>
                      {po.deadline && (
                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                          Vence: {formatDate(po.deadline)}
                        </p>
                      )}
                      {po.estimatedDeliveryDate && (
                        <p className="text-xs text-green-600 mt-1">
                          Entrega estimada: {formatDate(po.estimatedDeliveryDate)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Observaciones de la OC */}
                  {po.observations && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-amber-800 mb-1">Observaciones:</p>
                      <p className="text-sm text-amber-700">{po.observations}</p>
                    </div>
                  )}

                  {po.items && po.items.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-2">
                        Ítems incluidos
                      </p>
                      <div className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden">
                        <Table>
                          <TableHeader className="bg-[hsl(var(--canalco-neutral-100))]">
                            <TableRow>
                              <TableHead className="text-xs font-semibold">Material</TableHead>
                              <TableHead className="text-xs font-semibold">Cantidad</TableHead>
                              <TableHead className="text-xs font-semibold">Precio Unitario</TableHead>
                              <TableHead className="text-xs font-semibold">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {po.items.map((item) => {
                              // Buscar observación: primero en el item de OC, luego en el mapeo de la requisición
                              const observation = item.requisitionItem?.observation
                                || (item.requisitionItem?.itemId ? itemObservationsMap.get(item.requisitionItem.itemId) : undefined)
                                || (item.requisitionItemId ? itemObservationsMap.get(item.requisitionItemId) : undefined);

                              return (
                              <TableRow key={item.poItemId}>
                                <TableCell className="text-sm">
                                  <p className="font-medium">{item.requisitionItem?.material?.code}</p>
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                    {item.requisitionItem?.material?.description || 'Sin descripción'}
                                  </p>
                                  {observation && (
                                    <p className="text-xs text-amber-600 mt-1">
                                      Obs: {observation}
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{item.quantity}</TableCell>
                                <TableCell className="text-sm">{formatCurrency(item.unitPrice)}</TableCell>
                                <TableCell className="text-sm font-semibold">
                                  {formatCurrency(item.totalAmount)}
                                </TableCell>
                              </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Botón para ver orden individual (para imprimir con Ctrl+P) */}
                  <div className="mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))] flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/compras/orden/${po.purchaseOrderId}`)}
                      className="text-[hsl(var(--canalco-primary))] border-[hsl(var(--canalco-primary))]"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Ver Orden Completa
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {purchaseOrders.length > 0 && (
            <div className="mt-6 border-t border-[hsl(var(--canalco-neutral-200))] pt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Subtotal acumulado</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {formatCurrency(totals.subtotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">IVA acumulado</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">{formatCurrency(totals.iva)}</p>
              </div>
              <div>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Descuentos</p>
                <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  -{formatCurrency(totals.discount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Total general</p>
                <p className="text-xl font-bold text-[hsl(var(--canalco-primary))]">
                  {formatCurrency(totals.total)}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
