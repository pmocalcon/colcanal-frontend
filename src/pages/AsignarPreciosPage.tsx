import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRequisitionWithPrices,
  assignPrices,
  createPurchaseOrders,
  getLatestMaterialPrice,
  type MaterialPriceHistory,
} from '@/services/purchase-orders.service';
import type {
  RequisitionWithQuotations,
  RequisitionItemQuotation,
} from '@/services/quotation.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, FileCheck, AlertCircle, ArrowLeft, History } from 'lucide-react';
import { formatDate, formatCurrency } from '@/utils/dateUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ItemPriceState {
  itemId: number;
  quotationId: number | null;
  selectedSupplier: RequisitionItemQuotation | null;
  unitPrice: string;
  hasIva: boolean;
  ivaPercentage: number;
  discount: string;
  subtotal: number;
  ivaAmount: number;
  total: number;
  priceHistory: MaterialPriceHistory | null;
}

export default function AsignarPreciosPage() {
  const navigate = useNavigate();
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const { user } = useAuth();
  const [requisition, setRequisition] = useState<RequisitionWithQuotations | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [itemPrices, setItemPrices] = useState<Map<number, ItemPriceState>>(new Map());

  const isCompras = user?.nombreRol === 'Compras';

  useEffect(() => {
    if (!isCompras) {
      navigate('/dashboard');
      return;
    }
    loadRequisition();
  }, [requisitionId, isCompras]);

  const loadRequisition = async () => {
    if (!requisitionId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getRequisitionWithPrices(parseInt(requisitionId));
      setRequisition(data);
      initializeItemPrices(data);
    } catch (err: any) {
      console.error('Error loading requisition:', err);
      setError(err.response?.data?.message || 'Error al cargar la requisición');
    } finally {
      setLoading(false);
    }
  };

  const initializeItemPrices = async (req: RequisitionWithQuotations) => {
    const pricesMap = new Map<number, ItemPriceState>();

    // Process all items and fetch price history in parallel
    await Promise.all(
      req.items.map(async (item) => {
        const quotationsForItem = item.quotations.filter(
          (q) => q.action === 'cotizar' && q.isActive
        );

        if (quotationsForItem.length > 0) {
          // Si ya hay un proveedor seleccionado, usar ese
          const selectedQuotation =
            quotationsForItem.find((q) => q.isSelected) || quotationsForItem[0];

          // Fetch price history for this material + supplier
          let priceHistory: MaterialPriceHistory | null = null;
          let unitPrice = selectedQuotation.unitPrice?.toString() || '';
          let hasIva = selectedQuotation.hasIva || false;
          let ivaPercentage = 19; // Default IVA percentage
          let discount = selectedQuotation.discount?.toString() || '0';

          if (item.material?.materialId && selectedQuotation.supplierId) {
            priceHistory = await getLatestMaterialPrice(
              item.material.materialId,
              selectedQuotation.supplierId
            );

            // Pre-populate from history if available
            if (priceHistory) {
              unitPrice = priceHistory.unitPrice.toString();
              hasIva = priceHistory.hasIva;
              ivaPercentage = priceHistory.ivaPercentage;
              discount = priceHistory.discount.toString();
            } else if (selectedQuotation.unitPrice) {
              // Fallback to quotation price if available
              unitPrice = selectedQuotation.unitPrice.toString();
            }
          }

          const calculatedValues = calculateTotals(
            parseFloat(unitPrice) || 0,
            item.quantity,
            hasIva,
            ivaPercentage,
            parseFloat(discount) || 0
          );

          pricesMap.set(item.itemId, {
            itemId: item.itemId,
            quotationId: selectedQuotation.quotationId,
            selectedSupplier: selectedQuotation,
            unitPrice,
            hasIva,
            ivaPercentage,
            discount,
            priceHistory,
            ...calculatedValues,
          });
        }
      })
    );

    setItemPrices(pricesMap);
  };

  const calculateTotals = (
    unitPrice: number,
    quantity: number,
    hasIva: boolean,
    ivaPercentage: number,
    discount: number
  ) => {
    const subtotal = unitPrice * quantity;
    const ivaAmount = hasIva ? subtotal * (ivaPercentage / 100) : 0;
    const total = subtotal + ivaAmount - discount;

    return { subtotal, ivaAmount, total };
  };

  const handlePriceChange = (itemId: number, field: string, value: any) => {
    setItemPrices((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(itemId);
      if (!currentState) return prev;

      const updated = { ...currentState, [field]: value };

      // Recalcular totales
      const item = requisition?.items.find((i) => i.itemId === itemId);
      if (item) {
        const unitPrice = parseFloat(updated.unitPrice) || 0;
        const discount = parseFloat(updated.discount) || 0;
        const calculatedValues = calculateTotals(
          unitPrice,
          item.quantity,
          updated.hasIva,
          updated.ivaPercentage,
          discount
        );
        Object.assign(updated, calculatedValues);
      }

      newMap.set(itemId, updated);
      return newMap;
    });
  };

  const handleSupplierChange = async (itemId: number, quotationId: number) => {
    const item = requisition?.items.find((i) => i.itemId === itemId);
    if (!item) return;

    const selectedQuotation = item.quotations.find(
      (q) => q.quotationId === quotationId
    );
    if (!selectedQuotation) return;

    // Fetch price history for new supplier selection
    let priceHistory: MaterialPriceHistory | null = null;
    let unitPrice = '';
    let hasIva = false;
    let ivaPercentage = 19;
    let discount = '0';

    if (item.material?.materialId && selectedQuotation.supplierId) {
      priceHistory = await getLatestMaterialPrice(
        item.material.materialId,
        selectedQuotation.supplierId
      );

      // Pre-populate from history if available
      if (priceHistory) {
        unitPrice = priceHistory.unitPrice.toString();
        hasIva = priceHistory.hasIva;
        ivaPercentage = priceHistory.ivaPercentage;
        discount = priceHistory.discount.toString();
      } else if (selectedQuotation.unitPrice) {
        // Fallback to quotation price if available
        unitPrice = selectedQuotation.unitPrice.toString();
        hasIva = selectedQuotation.hasIva || false;
        discount = selectedQuotation.discount?.toString() || '0';
      }
    }

    // Calculate totals with new prices
    const calculatedValues = calculateTotals(
      parseFloat(unitPrice) || 0,
      item.quantity,
      hasIva,
      ivaPercentage,
      parseFloat(discount) || 0
    );

    setItemPrices((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(itemId);
      if (!currentState) return prev;

      const updated = {
        ...currentState,
        quotationId,
        selectedSupplier: selectedQuotation,
        unitPrice,
        hasIva,
        ivaPercentage,
        discount,
        priceHistory,
        ...calculatedValues,
      };

      newMap.set(itemId, updated);
      return newMap;
    });
  };

  const validatePrices = (): boolean => {
    if (!requisition) return false;

    const cotizarItems = requisition.items.filter((item) =>
      item.quotations.some((q) => q.action === 'cotizar' && q.isActive)
    );

    for (const item of cotizarItems) {
      const priceState = itemPrices.get(item.itemId);
      if (!priceState) return false;
      if (!priceState.unitPrice || parseFloat(priceState.unitPrice) <= 0) return false;
      if (!priceState.quotationId) return false;
    }

    return true;
  };

  const handleSavePrices = async () => {
    if (!requisition || !validatePrices()) {
      setError('Por favor completa todos los precios antes de guardar');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const items = Array.from(itemPrices.values()).map((state) => ({
        itemId: state.itemId,
        quotationId: state.quotationId!,
        unitPrice: parseFloat(state.unitPrice),
        hasIva: state.hasIva,
        discount: parseFloat(state.discount) || 0,
      }));

      await assignPrices(requisition.requisitionId, { items });
      setSuccess('Precios guardados exitosamente');
      await loadRequisition(); // Recargar datos
    } catch (err: any) {
      console.error('Error saving prices:', err);
      setError(err.response?.data?.message || 'Error al guardar los precios');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateOrders = async () => {
    if (!requisition || !validatePrices()) {
      setError('Por favor completa todos los precios antes de generar las órdenes');
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const items = Array.from(itemPrices.values()).map((state) => ({
        itemId: state.itemId,
        supplierId: state.selectedSupplier!.supplierId!,
        unitPrice: parseFloat(state.unitPrice),
        hasIVA: state.hasIva,
        discount: parseFloat(state.discount) || 0,
      }));

      await createPurchaseOrders(requisition.requisitionId, {
        issueDate: new Date().toISOString().split('T')[0],
        items,
      });

      setSuccess('Órdenes de compra generadas exitosamente');
      setTimeout(() => {
        navigate('/dashboard/compras/ordenes');
      }, 2000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al generar las órdenes de compra';
      setError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const getGrandTotals = () => {
    let grandSubtotal = 0;
    let grandIva = 0;
    let grandDiscount = 0;
    let grandTotal = 0;

    itemPrices.forEach((state) => {
      grandSubtotal += state.subtotal;
      grandIva += state.ivaAmount;
      grandDiscount += parseFloat(state.discount) || 0;
      grandTotal += state.total;
    });

    return { grandSubtotal, grandIva, grandDiscount, grandTotal };
  };

  if (!isCompras) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--canalco-primary))]"></div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[hsl(var(--canalco-neutral-600))]">Requisición no encontrada</p>
          <Button onClick={() => navigate('/dashboard/compras/ordenes')} className="mt-4">
            Volver
          </Button>
        </div>
      </div>
    );
  }

  const cotizarItems = requisition.items.filter((item) =>
    item.quotations.some((q) => q.action === 'cotizar' && q.isActive)
  );

  const totals = getGrandTotals();
  const allPricesValid = validatePrices();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-[hsl(var(--canalco-neutral-300))]">
        <div className="mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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
                onClick={() => navigate('/dashboard/compras/ordenes')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Órdenes de Compra"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Asignar Precios y Generar Orden
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Requisición: {requisition.requisitionNumber}
              </p>
            </div>

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

      {/* Main Content */}
      <main className="mx-auto px-6 py-8 max-w-7xl">
        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Requisition Info Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">
            Información de la Requisición
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Fecha
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {formatDate(requisition.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Solicitado por
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.creator?.nombre || requisition.user?.name || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Empresa
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.company?.name || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Proyecto / Obra
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.project?.name || requisition.obra || 'No especificado'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">
                Centro de Operación
              </p>
              <p className="text-sm text-[hsl(var(--canalco-neutral-900))]">
                {requisition.operationCenter?.name || 'No especificado'}
              </p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Ítems a Cotizar</h2>

          {cotizarItems.length === 0 ? (
            <p className="text-[hsl(var(--canalco-neutral-600))]">
              No hay ítems para asignar precios
            </p>
          ) : (
            <div className="space-y-6">
              {cotizarItems.map((item) => {
                const priceState = itemPrices.get(item.itemId);
                const activeQuotations = item.quotations.filter(
                  (q) => q.action === 'cotizar' && q.isActive
                );

                return (
                  <div
                    key={item.itemId}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    {/* Item Header */}
                    <div className="mb-4 pb-3 border-b border-[hsl(var(--canalco-neutral-300))]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] text-sm font-bold">
                          #{item.itemNumber}
                        </span>
                        <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">
                          {item.material?.name || item.material?.description || 'Material sin nombre'}
                        </h3>
                      </div>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                        <span className="font-medium">Cantidad:</span> {item.quantity}
                      </p>
                    </div>

                    {/* Supplier Selection (if multiple) */}
                    {activeQuotations.length > 1 && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">
                          Seleccionar Proveedor
                        </label>
                        <select
                          value={priceState?.quotationId || ''}
                          onChange={(e) =>
                            handleSupplierChange(item.itemId, parseInt(e.target.value))
                          }
                          className="w-full border rounded-lg p-2"
                        >
                          {activeQuotations.map((q) => (
                            <option key={q.quotationId} value={q.quotationId}>
                              {q.supplier?.name} - NIT: {q.supplier?.nitCc}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Supplier Display (if single) */}
                    {activeQuotations.length === 1 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium">Proveedor:</p>
                        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {activeQuotations[0].supplier?.name} - NIT: {activeQuotations[0].supplier?.nitCc}
                        </p>
                      </div>
                    )}

                    {/* Price History Indicator */}
                    {priceState?.priceHistory && (
                      <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 text-xs text-blue-700">
                          <History className="w-4 h-4" />
                          <span className="font-medium">
                            Último precio usado: {formatCurrency(priceState.priceHistory.unitPrice)}
                          </span>
                          {priceState.priceHistory.purchaseOrderNumber && (
                            <span className="text-blue-600">
                              (OC: {priceState.priceHistory.purchaseOrderNumber})
                            </span>
                          )}
                          <span className="text-blue-600">
                            - {formatDate(priceState.priceHistory.lastUsedDate)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Price Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Precio antes de Iva
                        </label>
                        <Input
                          type="number"
                          value={priceState?.unitPrice || ''}
                          onChange={(e) =>
                            handlePriceChange(item.itemId, 'unitPrice', e.target.value)
                          }
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          IVA
                        </label>
                        <div className="flex items-center h-10">
                          <Checkbox
                            checked={priceState?.hasIva || false}
                            onCheckedChange={(checked) =>
                              handlePriceChange(item.itemId, 'hasIva', checked)
                            }
                          />
                          <span className="ml-2 text-sm">Sí</span>
                        </div>
                      </div>
                      {priceState?.hasIva && (
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            % IVA
                          </label>
                          <Select
                            value={priceState.ivaPercentage.toString()}
                            onValueChange={(value) =>
                              handlePriceChange(item.itemId, 'ivaPercentage', parseInt(value))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="19">19%</SelectItem>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="0">0%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Descuento
                        </label>
                        <Input
                          type="number"
                          value={priceState?.discount || '0'}
                          onChange={(e) =>
                            handlePriceChange(item.itemId, 'discount', e.target.value)
                          }
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Total Ítem
                        </label>
                        <p className="text-lg font-semibold text-[hsl(var(--canalco-primary))] h-10 flex items-center">
                          {formatCurrency(priceState?.total || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Grand Totals */}
        {cotizarItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Totales Generales</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--canalco-neutral-700))]">Subtotal:</span>
                <span className="font-semibold">{formatCurrency(totals.grandSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--canalco-neutral-700))]">IVA:</span>
                <span className="font-semibold">{formatCurrency(totals.grandIva)}</span>
              </div>
              {totals.grandDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Descuento:</span>
                  <span className="font-semibold">-{formatCurrency(totals.grandDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Total General:</span>
                <span className="text-[hsl(var(--canalco-primary))]">
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard/compras/ordenes')}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSavePrices}
            disabled={!allPricesValid || saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              'Guardando...'
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Precios
              </>
            )}
          </Button>
          <Button
            onClick={handleGenerateOrders}
            disabled={!allPricesValid || generating}
            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
          >
            {generating ? (
              'Generando...'
            ) : (
              <>
                <FileCheck className="w-4 h-4 mr-2" />
                Generar Órdenes de Compra
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
