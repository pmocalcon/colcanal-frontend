import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRequisitionQuotation, type RequisitionWithQuotations } from '@/services/quotation.service';
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
import { formatDateShort, getNowInColombia } from '@/utils/dateUtils';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function SolicitudCotizacionProveedorPage() {
  const navigate = useNavigate();
  const { requisitionId, supplierId } = useParams<{ requisitionId: string; supplierId: string }>();

  const [requisition, setRequisition] = useState<RequisitionWithQuotations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supplierIdNumber = supplierId ? Number(supplierId) : null;

  useEffect(() => {
    if (!requisitionId || !supplierIdNumber) {
      setError('Faltan datos para cargar la solicitud de cotización.');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRequisitionQuotation(Number(requisitionId));
        setRequisition(data);
      } catch (err) {
        console.error('Error loading quotation view:', err);
        setError('No se pudo cargar la solicitud de cotización');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [requisitionId, supplierIdNumber]);

  const supplier = useMemo(() => {
    if (!requisition || !supplierIdNumber) return null;
    const allQuotations = requisition.items.flatMap((item) => item.quotations || []);
    return allQuotations.find((q) => q.supplier?.supplierId === supplierIdNumber)?.supplier || null;
  }, [requisition, supplierIdNumber]);

  const supplierItems = useMemo(() => {
    if (!requisition || !supplierIdNumber) return [];
    const filtered = requisition.items.filter((item) =>
      (item.quotations || []).some((q) => q.supplier?.supplierId === supplierIdNumber)
    );
    return filtered.length > 0 ? filtered : requisition.items;
  }, [requisition, supplierIdNumber]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando solicitud...</p>
        </div>
      </div>
    );
  }

  if (error || !requisition || !supplierIdNumber) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-start gap-3 p-6">
              <AlertCircle className="w-6 h-6 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">No se pudo mostrar la solicitud</p>
                <p className="text-sm text-red-700 mt-1">
                  {error || 'Verifica el número de requisición y el proveedor.'}
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
  const operationCenter = requisition.operationCenter?.code || '-';
  const projectOrWork = requisition.project?.name || requisition.obra || 'N/A';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              title="Volver"
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
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Solicitud de Cotización</p>
              <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Requisición {requisition.requisitionNumber}
              </h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Fecha</p>
            <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">{today}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Encabezado de datos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                Datos del Proveedor
              </p>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {supplier?.name || 'Proveedor no asignado'}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                  NIT: {supplier?.nitCc || 'N/D'}
                </p>
                {supplier && (
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                    {supplier.contactPerson || supplier.email || supplier.phone
                      ? [supplier.contactPerson, supplier.email, supplier.phone].filter(Boolean).join(' • ')
                      : 'Contacto no registrado'}
                  </p>
                )}
              </div>
              {!supplier && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  No se encontró un proveedor con este ID en la requisición.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase tracking-wide">
                Datos del Solicitante
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Empresa</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {requisition.company?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Proyecto/Obra</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {projectOrWork}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Centro de operación</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {operationCenter}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--canalco-neutral-600))]">Solicitante</p>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))]">
                    {requisition.creator?.nombre || 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de ítems */}
        <Card>
          <CardContent className="p-0">
            <div className="px-6 pt-6 pb-3">
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                Ítems a cotizar
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                Código, descripción, cantidad y unidad (solo lectura)
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[hsl(var(--canalco-neutral-100))]">
                  <TableRow>
                    <TableHead className="w-24 font-semibold">Código</TableHead>
                    <TableHead className="font-semibold">Descripción</TableHead>
                    <TableHead className="w-24 font-semibold text-right">Cantidad</TableHead>
                    <TableHead className="w-28 font-semibold">Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-[hsl(var(--canalco-neutral-600))] py-8">
                        No hay ítems para mostrar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    supplierItems.map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="font-mono text-sm text-[hsl(var(--canalco-primary))]">
                          {item.material?.code || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {item.material?.description || item.description || 'Sin descripción'}
                          </p>
                          {item.observation && (
                            <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                              Obs.: {item.observation}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[hsl(var(--canalco-neutral-900))]">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                          {item.unit || 'Unidad'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
