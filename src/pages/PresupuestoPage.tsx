import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Home, ArrowLeft, Plus, Trash2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresupuestoRow {
  id: number;
  codigo: string;
  descripcion: string;
  cantidad: string;
  vrUnitario: string;
  cantBodega: string;
  costoTransporte: string;
  ejecutado: string;
}

const createEmptyRow = (id: number): PresupuestoRow => ({
  id,
  codigo: '',
  descripcion: '',
  cantidad: '',
  vrUnitario: '',
  cantBodega: '',
  costoTransporte: '',
  ejecutado: '',
});

const parseNum = (val: string) => parseFloat(val) || 0;

const fmt = (value: number): string => {
  if (value === 0) return '-';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export default function PresupuestoPage() {
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState('');
  const [rows, setRows] = useState<PresupuestoRow[]>(() =>
    Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1))
  );
  const [observaciones, setObservaciones] = useState('');
  const [manoDeObra, setManoDeObra] = useState('');
  const [materialesInventario, setMaterialesInventario] = useState('');
  const [valorFacturado, setValorFacturado] = useState('');

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow(prev.length + 1)]);
  }, []);

  const removeRow = useCallback((id: number) => {
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== id);
      return filtered.map((r, i) => ({ ...r, id: i + 1 }));
    });
  }, []);

  const updateRow = useCallback((id: number, field: keyof PresupuestoRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const calculated = useMemo(() => {
    return rows.map(row => {
      const cantidad = parseNum(row.cantidad);
      const vrUnitario = parseNum(row.vrUnitario);
      const costoTransporte = parseNum(row.costoTransporte);
      const ivaUnitario = vrUnitario * 0.19;
      const subtotalUnitario = vrUnitario + ivaUnitario;
      const vrTotal = subtotalUnitario * cantidad;
      const vrTotalConTransporte = vrTotal + costoTransporte;
      return { ivaUnitario, subtotalUnitario, vrTotal, vrTotalConTransporte };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const subTotal = calculated.reduce((s, r) => s + r.vrTotal, 0);
    const subTotalTransporte = calculated.reduce((s, r) => s + r.vrTotalConTransporte, 0);
    const mdo = parseNum(manoDeObra);
    return {
      subTotal,
      subTotalTransporte,
      mdo,
      totalObra: subTotal + mdo,
      totalObraTransporte: subTotalTransporte + mdo,
      matInv: parseNum(materialesInventario),
      valFact: parseNum(valorFacturado),
    };
  }, [calculated, manoDeObra, materialesInventario, valorFacturado]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10 print:hidden">
        <div className="max-w-full px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl shadow-md p-2 w-12 h-12 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img src="/assets/images/logo-canalco.png" alt="Canalco" className="w-full h-full object-contain" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/levantamiento-obras')} title="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Presupuesto Director de Proyectos</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Proyecto */}
        <div className="mb-4 flex items-center gap-3 max-w-md">
          <label className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap">
            Proyecto / Municipio:
          </label>
          <Input
            value={proyecto}
            onChange={e => setProyecto(e.target.value)}
            placeholder="Ej: QUIMBAYA"
            className="h-8 text-sm font-semibold uppercase"
          />
        </div>

        {/* Budget card */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
          {/* Title bar */}
          <div className="bg-[hsl(var(--canalco-primary))] px-6 py-3 text-center">
            <h2 className="text-base font-bold text-white tracking-wider">
              {proyecto ? `${proyecto.toUpperCase()} — ` : ''}PRESUPUESTO DIRECTOR DE PROYECTOS
            </h2>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[hsl(var(--canalco-primary))]/10">
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-10">Item</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-20">Código</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-left font-semibold min-w-[220px]">Descripción</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-20">Cantidad</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Vr. Unitario</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">IVA Unitario (19%)</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Subtotal Unitario</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Vr. Total</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-24">Cant. Bodega</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Costo de Transporte</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-32">Vr. Total (Con Transporte)</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-2 text-center font-semibold w-28">Ejecutado</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-1 py-2 w-8 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const calc = calculated[index];
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-[hsl(var(--canalco-neutral-200))]',
                        index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
                      )}
                    >
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-700))]">
                        {row.id}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          value={row.codigo}
                          onChange={e => updateRow(row.id, 'codigo', e.target.value)}
                          className="h-6 text-xs text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          value={row.descripcion}
                          onChange={e => updateRow(row.id, 'descripcion', e.target.value)}
                          className="h-6 text-xs border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                          placeholder="Descripción..."
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.cantidad}
                          onChange={e => updateRow(row.id, 'cantidad', e.target.value)}
                          className="h-6 text-xs text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.vrUnitario}
                          onChange={e => updateRow(row.id, 'vrUnitario', e.target.value)}
                          className="h-6 text-xs text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        {parseNum(row.vrUnitario) > 0 ? fmt(calc.ivaUnitario) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right text-[hsl(var(--canalco-neutral-500))]">
                        {parseNum(row.vrUnitario) > 0 ? fmt(calc.subtotalUnitario) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotal > 0 ? fmt(calc.vrTotal) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.cantBodega}
                          onChange={e => updateRow(row.id, 'cantBodega', e.target.value)}
                          className="h-6 text-xs text-center border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.costoTransporte}
                          onChange={e => updateRow(row.id, 'costoTransporte', e.target.value)}
                          className="h-6 text-xs text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-2 py-1 text-right font-medium">
                        {calc.vrTotalConTransporte > 0 ? fmt(calc.vrTotalConTransporte) : '-'}
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={row.ejecutado}
                          onChange={e => updateRow(row.id, 'ejecutado', e.target.value)}
                          className="h-6 text-xs text-right border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
                        />
                      </td>
                      <td className="border border-[hsl(var(--canalco-neutral-200))] px-1 py-1 text-center print:hidden">
                        {rows.length > 1 && (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <div className="px-3 py-2 border-t border-[hsl(var(--canalco-neutral-200))] print:hidden">
            <Button type="button" variant="ghost" size="sm" onClick={addRow}
              className="text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10">
              <Plus className="w-4 h-4 mr-1" />
              Agregar línea
            </Button>
          </div>

          {/* Footer: Observaciones + Totals */}
          <div className="border-t-2 border-[hsl(var(--canalco-primary))]/30 grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[hsl(var(--canalco-neutral-200))]">
            {/* Observaciones */}
            <div className="p-4">
              <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2 uppercase tracking-wide">
                Observaciones
              </p>
              <Textarea
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                placeholder="Ingrese observaciones..."
                className="min-h-[120px] text-xs resize-none"
              />
            </div>

            {/* Totals */}
            <div className="p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left pb-2 text-[hsl(var(--canalco-neutral-500))] font-normal" />
                    <th className="text-right pb-2 text-[hsl(var(--canalco-neutral-600))] font-semibold pr-3">Sin Transporte</th>
                    <th className="text-right pb-2 text-[hsl(var(--canalco-neutral-600))] font-semibold">Con Transporte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">SUB-TOTAL</td>
                    <td className="py-1.5 text-right pr-3 font-medium">{fmt(totals.subTotal)}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(totals.subTotalTransporte)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">MANO DE OBRA</td>
                    <td className="py-1 pr-3" colSpan={2}>
                      <Input
                        type="number"
                        min="0"
                        value={manoDeObra}
                        onChange={e => setManoDeObra(e.target.value)}
                        placeholder="0"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-primary))]/5">
                    <td className="py-1.5 font-bold text-[hsl(var(--canalco-neutral-900))]">TOTAL OBRA</td>
                    <td className="py-1.5 text-right pr-3 font-bold text-[hsl(var(--canalco-primary))]">
                      {fmt(totals.totalObra)}
                    </td>
                    <td className="py-1.5 text-right font-bold text-[hsl(var(--canalco-primary))]">
                      {fmt(totals.totalObraTransporte)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">MATERIALES INVENTARIO</td>
                    <td className="py-1 pr-3" colSpan={2}>
                      <Input
                        type="number"
                        min="0"
                        value={materialesInventario}
                        onChange={e => setMaterialesInventario(e.target.value)}
                        placeholder="0"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-[hsl(var(--canalco-neutral-700))]">VALOR FACTURADO</td>
                    <td className="py-1 pr-3" colSpan={2}>
                      <Input
                        type="number"
                        min="0"
                        value={valorFacturado}
                        onChange={e => setValorFacturado(e.target.value)}
                        placeholder="0"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
