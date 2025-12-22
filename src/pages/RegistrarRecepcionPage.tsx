import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRequisitionReceipts,
  createMaterialReceipts,
  updateMaterialReceipt,
} from '@/services/receipts.service';
import type {
  RequisitionWithReceipts,
  PurchaseOrderItem,
  MaterialReceipt,
  CreateReceiptItemDto,
} from '@/services/receipts.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Home, Save, AlertCircle, Edit2, Package, ArrowLeft } from 'lucide-react';
import { formatDate, formatDateShort } from '@/utils/dateUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ReceiptItemState {
  poItemId: number;
  quantityToReceive: string;
  receivedDate: string;
  observations: string;
  overdeliveryJustification: string;
  // For display
  poNumber: string;
  supplierName: string;
  materialCode: string;
  materialDescription: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityPending: number;
}

interface EditingReceipt {
  receiptId: number;
  poItemId: number;
  quantityReceived: string;
  receivedDate: string;
  observations: string;
  overdeliveryJustification: string;
}

export default function RegistrarRecepcionPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [requisition, setRequisition] = useState<RequisitionWithReceipts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [receiptItems, setReceiptItems] = useState<Map<number, ReceiptItemState>>(new Map());
  const [editingReceipt, setEditingReceipt] = useState<EditingReceipt | null>(null);

  useEffect(() => {
    loadRequisition();
  }, [id]);

  const loadRequisition = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getRequisitionReceipts(parseInt(id));
      setRequisition(data);
      initializeReceiptItems(data);
    } catch (err: any) {
      console.error('Error loading requisition receipts:', err);
      setError(err.response?.data?.message || 'Error al cargar la información de recepción');
    } finally {
      setLoading(false);
    }
  };

  const initializeReceiptItems = (req: RequisitionWithReceipts) => {
    const itemsMap = new Map<number, ReceiptItemState>();
    const today = new Date().toISOString().split('T')[0];

    req.purchaseOrders?.forEach((po) => {
      po.items?.forEach((item) => {
        itemsMap.set(item.poItemId, {
          poItemId: item.poItemId,
          quantityToReceive: '',
          receivedDate: today,
          observations: '',
          overdeliveryJustification: '',
          poNumber: po.purchaseOrderNumber,
          supplierName: po.supplier?.name || 'N/A',
          materialCode: item.requisitionItem?.material?.code || 'N/A',
          materialDescription: item.requisitionItem?.material?.description || 'N/A',
          quantityOrdered: item.quantityOrdered || item.quantity || 0,
          quantityReceived: item.quantityReceived || 0,
          quantityPending: item.quantityPending || 0,
        });
      });
    });

    setReceiptItems(itemsMap);
  };

  const updateReceiptItem = (poItemId: number, field: keyof ReceiptItemState, value: string) => {
    setReceiptItems((prev) => {
      const newMap = new Map(prev);
      const item = newMap.get(poItemId);
      if (item) {
        newMap.set(poItemId, { ...item, [field]: value });
      }
      return newMap;
    });
  };

  const validateReceipt = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check if at least one item has quantity to receive
    const hasAnyQuantity = Array.from(receiptItems.values()).some(
      (item) => item.quantityToReceive && parseFloat(item.quantityToReceive) > 0
    );

    if (!hasAnyQuantity) {
      errors.push('Debes ingresar al menos una cantidad a recibir');
      return { valid: false, errors };
    }

    // Validate each item with quantity
    receiptItems.forEach((item) => {
      if (item.quantityToReceive && parseFloat(item.quantityToReceive) > 0) {
        const qty = parseFloat(item.quantityToReceive);

        if (qty < 0) {
          errors.push(`${item.materialCode}: La cantidad no puede ser negativa`);
        }

        // Check for overdelivery
        if (qty > item.quantityPending) {
          if (!item.overdeliveryJustification.trim()) {
            errors.push(
              `${item.materialCode}: Se está recibiendo más de lo pendiente (${qty} > ${item.quantityPending}). Debes proporcionar una justificación.`
            );
          }
        }

        if (!item.receivedDate) {
          errors.push(`${item.materialCode}: Debes seleccionar una fecha de recepción`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  };

  const handleSaveReceipt = async () => {
    const validation = validateReceipt();
    if (!validation.valid) {
      setError(validation.errors.join('\n'));
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Build items array with only those that have quantity
      const items: CreateReceiptItemDto[] = [];
      receiptItems.forEach((item) => {
        if (item.quantityToReceive && parseFloat(item.quantityToReceive) > 0) {
          const receiptItem: CreateReceiptItemDto = {
            poItemId: item.poItemId,
            quantityReceived: parseFloat(item.quantityToReceive),
            receivedDate: item.receivedDate,
          };

          if (item.observations.trim()) {
            receiptItem.observations = item.observations;
          }

          if (item.overdeliveryJustification.trim()) {
            receiptItem.overdeliveryJustification = item.overdeliveryJustification;
          }

          items.push(receiptItem);
        }
      });

      await createMaterialReceipts(parseInt(id!), { items });

      setSuccess('Recepción registrada exitosamente');

      // Reload data to show updated state
      setTimeout(() => {
        loadRequisition();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error saving receipt:', err);
      setError(err.response?.data?.message || 'Error al guardar la recepción');
    } finally {
      setSaving(false);
    }
  };

  const handleEditReceipt = (receipt: MaterialReceipt, poItemId: number) => {
    setEditingReceipt({
      receiptId: receipt.receiptId,
      poItemId,
      quantityReceived: receipt.quantityReceived.toString(),
      receivedDate: receipt.receivedDate,
      observations: receipt.observations || '',
      overdeliveryJustification: receipt.overdeliveryJustification || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingReceipt) return;

    try {
      setSaving(true);
      setError(null);

      const updateData: any = {
        quantityReceived: parseFloat(editingReceipt.quantityReceived),
        receivedDate: editingReceipt.receivedDate,
      };

      if (editingReceipt.observations.trim()) {
        updateData.observations = editingReceipt.observations;
      }

      if (editingReceipt.overdeliveryJustification.trim()) {
        updateData.overdeliveryJustification = editingReceipt.overdeliveryJustification;
      }

      await updateMaterialReceipt(
        parseInt(id!),
        editingReceipt.receiptId,
        updateData
      );

      setSuccess('Recepción actualizada exitosamente');
      setEditingReceipt(null);

      // Reload data
      setTimeout(() => {
        loadRequisition();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error updating receipt:', err);
      setError(err.response?.data?.message || 'Error al actualizar la recepción');
    } finally {
      setSaving(false);
    }
  };

  const getStatusLabel = (code: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      en_revision: 'En revisión',
      aprobada_revisor: 'Aprobada por revisor',
      pendiente_autorizacion: 'Pendiente de autorización',
      autorizado: 'Autorizado',
      aprobada_gerencia: 'Aprobada por gerencia',
      en_cotizacion: 'En cotización',
      rechazada_revisor: 'Rechazada por revisor',
      rechazada_gerencia: 'Rechazada por gerencia',
      cotizada: 'Cotizada',
      en_orden_compra: 'En orden de compra',
      pendiente_recepcion: 'Pendiente de recepción',
      en_recepcion: 'En recepción',
      recepcion_completa: 'Recepción completa',
    };
    return labels[code] || code;
  };

  const getStatusColor = (code: string) => {
    const colors: Record<string, string> = {
      pendiente: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
      en_revision: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
      aprobada_revisor: 'bg-green-500/10 text-green-700 border-green-500/20',
      pendiente_autorizacion: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
      autorizado: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
      aprobada_gerencia: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      en_cotizacion: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
      rechazada_revisor: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
      rechazada_gerencia: 'bg-red-500/10 text-red-700 border-red-500/20',
      cotizada: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      en_orden_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
      pendiente_recepcion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
      en_recepcion: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
      recepcion_completa: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
    };
    return colors[code] || 'bg-gray-100';
  };

  // Get all receipts for display
  const getAllReceipts = (): Array<MaterialReceipt & { poItem: PurchaseOrderItem }> => {
    const receipts: Array<MaterialReceipt & { poItem: PurchaseOrderItem }> = [];

    requisition?.purchaseOrders?.forEach((po) => {
      po.items?.forEach((item) => {
        item.receipts?.forEach((receipt) => {
          receipts.push({ ...receipt, poItem: item });
        });
      });
    });

    return receipts.sort((a, b) =>
      new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime()
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-lg text-[hsl(var(--canalco-neutral-700))]">Requisición no encontrada</p>
          <Button onClick={() => navigate('/dashboard/compras/recepciones')} className="mt-4">
            Volver a Recepciones
          </Button>
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
                onClick={() => navigate('/dashboard/compras/recepciones')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Recepciones"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Registrar Recepción de Materiales
              </h1>
              <div className="flex items-center justify-center gap-2">
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Requisición {requisition.requisitionNumber}
                </p>
                {requisition.priority === 'alta' && (
                  <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                    URGENTE
                  </Badge>
                )}
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 whitespace-pre-line">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <Package className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Requisition Info */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Requisición</p>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{requisition.requisitionNumber}</p>
                {requisition.priority === 'alta' && (
                  <Badge className="bg-red-600 text-white text-xs px-1.5 py-0.5">
                    URGENTE
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Proyecto/Obra</p>
              <p className="font-semibold">
                {requisition.obra || requisition.project?.name || requisition.company?.name || '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">Estado</p>
              <Badge
                variant="outline"
                className={`${getStatusColor(requisition.status.code)} border`}
              >
                {getStatusLabel(requisition.status.code)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Receipt Form */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] mb-6 overflow-hidden">
          <div className="p-4 bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-300))]">
            <h2 className="text-lg font-semibold">Registrar Nueva Recepción</h2>
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              Ingresa las cantidades recibidas para cada ítem
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">OC</TableHead>
                  <TableHead className="font-semibold">Proveedor</TableHead>
                  <TableHead className="font-semibold">Material</TableHead>
                  <TableHead className="font-semibold text-right">Ordenado</TableHead>
                  <TableHead className="font-semibold text-right">Recibido</TableHead>
                  <TableHead className="font-semibold text-right">Pendiente</TableHead>
                  <TableHead className="font-semibold">Recibir ahora</TableHead>
                  <TableHead className="font-semibold">Fecha</TableHead>
                  <TableHead className="font-semibold">Observaciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(receiptItems.values()).map((item) => {
                  const needsJustification =
                    item.quantityToReceive &&
                    parseFloat(item.quantityToReceive) > item.quantityPending;

                  return (
                    <TableRow key={item.poItemId}>
                      <TableCell className="font-medium">{item.poNumber}</TableCell>
                      <TableCell>{item.supplierName}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.materialCode}</p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {item.materialDescription}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantityOrdered}</TableCell>
                      <TableCell className="text-right">{item.quantityReceived}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.quantityPending}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantityToReceive}
                            onChange={(e) =>
                              updateReceiptItem(item.poItemId, 'quantityToReceive', e.target.value)
                            }
                            className="w-24"
                            placeholder="0"
                          />
                          {needsJustification && (
                            <Textarea
                              placeholder="Justificación de sobreentrega *"
                              value={item.overdeliveryJustification}
                              onChange={(e) =>
                                updateReceiptItem(
                                  item.poItemId,
                                  'overdeliveryJustification',
                                  e.target.value
                                )
                              }
                              className="text-xs border-red-300"
                              rows={2}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={item.receivedDate}
                          onChange={(e) =>
                            updateReceiptItem(item.poItemId, 'receivedDate', e.target.value)
                          }
                          className="w-40"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          placeholder="Observaciones..."
                          value={item.observations}
                          onChange={(e) =>
                            updateReceiptItem(item.poItemId, 'observations', e.target.value)
                          }
                          className="text-xs"
                          rows={2}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-[hsl(var(--canalco-neutral-300))] flex justify-end">
            <Button
              onClick={handleSaveReceipt}
              disabled={saving}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white"
            >
              {saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Recepción
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Previous Receipts */}
        {getAllReceipts().length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="p-4 bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-300))]">
              <h2 className="text-lg font-semibold">Recepciones Registradas</h2>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Registrado por</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getAllReceipts().map((receipt) => {
                    const isEditing = editingReceipt?.receiptId === receipt.receiptId;

                    return (
                      <TableRow key={receipt.receiptId}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="date"
                              value={editingReceipt.receivedDate}
                              onChange={(e) =>
                                setEditingReceipt({ ...editingReceipt, receivedDate: e.target.value })
                              }
                              className="w-40"
                            />
                          ) : (
                            formatDateShort(receipt.receivedDate)
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {receipt.poItem.requisitionItem?.material?.code || 'N/A'}
                            </p>
                            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                              {receipt.poItem.requisitionItem?.material?.description || 'N/A'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editingReceipt.quantityReceived}
                              onChange={(e) =>
                                setEditingReceipt({
                                  ...editingReceipt,
                                  quantityReceived: e.target.value,
                                })
                              }
                              className="w-24"
                            />
                          ) : (
                            receipt.quantityReceived
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Textarea
                              value={editingReceipt.observations}
                              onChange={(e) =>
                                setEditingReceipt({
                                  ...editingReceipt,
                                  observations: e.target.value,
                                })
                              }
                              rows={2}
                            />
                          ) : (
                            receipt.observations || '-'
                          )}
                        </TableCell>
                        <TableCell>{receipt.creator?.nombre || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex gap-2 justify-center">
                              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingReceipt(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditReceipt(receipt, receipt.poItemId)}
                              className="hover:bg-blue-50"
                              title="Editar recepción"
                            >
                              <Edit2 className="w-4 h-4 text-blue-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
