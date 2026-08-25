import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronRight, Clock4, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThHorasExtra } from '@/services/talentoHumano.service';

/**
 * Planillas de horas extras ya aprobadas.
 *
 * **No es el formato de planilla.** Ese es el papel que recorre las cuatro firmas en
 * G. de talento humano; esto es lo que Gerencia de Proyectos ya avaló y queda listo para
 * que Dirección Administrativa lo lleve a nómina.
 *
 * La fila se despliega para ver el detalle día a día, de donde sale la liquidación: se
 * piden al abrir y no de entrada, como en la cartera de préstamos.
 */

const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const copCero = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

const horas = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? n.toLocaleString('es-CO') : '—';
};

const TIPOS = [
  { key: 'diurna', label: 'HED' },
  { key: 'recargoNocturno', label: 'RN' },
  { key: 'nocturna', label: 'HEN' },
  { key: 'diurnaFestiva', label: 'HDDYF' },
  { key: 'nocturnaFestiva', label: 'HNDYF' },
] as const;

export default function HorasExtrasListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThHorasExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');

  const [abierto, setAbierto] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<Record<number, ThHorasExtra>>({});

  useEffect(() => {
    let cancelled = false;
    talentoHumanoService
      .listHorasExtras()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar las planillas'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const abrir = async (h: ThHorasExtra) => {
    if (abierto === h.horasExtraId) { setAbierto(null); return; }
    setAbierto(h.horasExtraId);
    if (detalles[h.horasExtraId]) return;
    try {
      const detalle = await talentoHumanoService.getHorasExtra(h.horasExtraId);
      setDetalles((d) => ({ ...d, [h.horasExtraId]: detalle }));
    } catch {
      toast.error('No se pudo cargar el detalle');
    }
  };

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows.filter((r) => !q
      || r.nombre.toLowerCase().includes(q)
      || (r.identificacion ?? '').includes(q));
  }, [rows, buscar]);

  const totales = useMemo(() => ({
    horas: visibles.reduce((s, r) => s + (Number(r.totalHoras ?? 0) || 0), 0),
    liquidacion: visibles.reduce((s, r) => s + (Number(r.totalLiquidacion ?? 0) || 0), 0),
  }), [visibles]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Clock4 className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Horas extras
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading ? 'Cargando…' : `${visibles.length} planillas aprobadas`}
            </p>
          </div>
        </div>

        {!loading && (
          <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Horas laboradas </span>
              <span className="font-semibold tabular-nums">{totales.horas.toLocaleString('es-CO')}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Liquidación proyectada </span>
              <span className="font-bold tabular-nums text-[hsl(var(--canalco-primary))]">{copCero(totales.liquidacion)}</span>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-grow min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Trabajador o cédula"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2 font-semibold">Trabajador</th>
                  <th className="text-left px-3 py-2 font-semibold">Cargo</th>
                  <th className="text-left px-3 py-2 font-semibold">Periodo</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor hora</th>
                  <th className="text-right px-3 py-2 font-semibold">Horas</th>
                  <th className="text-right px-3 py-2 font-semibold">Liquidación</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((h) => {
                  const detalle = detalles[h.horasExtraId];
                  const desplegado = abierto === h.horasExtraId;
                  return [
                    <tr
                      key={h.horasExtraId}
                      onClick={() => void abrir(h)}
                      title="Ver el detalle día a día"
                      className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer"
                    >
                      <td className="pl-2 text-[hsl(var(--canalco-neutral-400))]">
                        {desplegado ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">
                        {h.nombre}
                        {h.identificacion && (
                          <span className="ml-2 text-xs text-[hsl(var(--canalco-neutral-500))] tabular-nums">
                            {h.identificacion}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{h.cargo || '—'}</td>
                      <td className="px-3 py-2">{h.periodo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cop(h.valorHora)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{horas(h.totalHoras)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[hsl(var(--canalco-primary))]">
                        {cop(h.totalLiquidacion)}
                      </td>
                    </tr>,

                    desplegado && (
                      <tr key={`${h.horasExtraId}-detalle`} className="bg-[hsl(var(--canalco-neutral-100))]">
                        <td />
                        <td colSpan={6} className="px-3 py-3">
                          {!detalle ? (
                            <div className="flex items-center gap-2 text-[hsl(var(--canalco-neutral-500))]">
                              <Loader2 className="w-4 h-4 animate-spin" /> Cargando detalle…
                            </div>
                          ) : detalle.detalle?.length ? (
                            <div className="overflow-x-auto">
                              <table className="text-xs min-w-[700px]">
                                <thead className="text-[hsl(var(--canalco-neutral-500))]">
                                  <tr>
                                    <th className="text-left pr-3 py-1">Fecha</th>
                                    <th className="text-left pr-3 py-1">Proyecto</th>
                                    {TIPOS.map((t) => <th key={t.key} className="text-right pr-3 py-1">{t.label}</th>)}
                                    <th className="text-right py-1">Liquidación</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detalle.detalle.map((d) => (
                                    <tr key={d.detalleId} className="border-t border-[hsl(var(--canalco-neutral-200))]">
                                      <td className="pr-3 py-1">{d.fecha || '—'}</td>
                                      <td className="pr-3 py-1">{d.proyecto || '—'}</td>
                                      {TIPOS.map((t) => (
                                        <td key={t.key} className="text-right pr-3 py-1 tabular-nums">
                                          {horas(d[t.key])}
                                        </td>
                                      ))}
                                      <td className="text-right py-1 tabular-nums">{cop(d.liquidacion)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <span className="text-[hsl(var(--canalco-neutral-500))]">
                              Esta planilla no tiene renglones registrados.
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay planillas aprobadas.'
                        : 'Ninguna coincide con la búsqueda.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
