import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, ExternalLink, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { FORMATO_PRESTAMO } from '@/config/formatosGestion';

/**
 * Listado de préstamos.
 *
 * **No tiene tabla propia.** Un préstamo se pide con el formato de G. de talento humano y
 * queda en `gc_solicitudes`; acá se consultan todos juntos. Guardarlos aparte obligaría a
 * teclear dos veces lo mismo y a que las dos copias se contradijeran.
 *
 * Cada fila abre el formato original, que es donde se corrige.
 */

const cop = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function PrestamosListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    let cancelled = false;
    gestionConocimientoService
      .list({ gestion: 'talento-humano' })
      .then((todas) => {
        if (!cancelled) setRows(todas.filter((r) => r.formato === FORMATO_PRESTAMO));
      })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar los préstamos'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r.data?.nombreCompleto ?? '').toLowerCase().includes(q)
      || String(r.data?.numero ?? '').toLowerCase().includes(q)
      || String(r.data?.cargo ?? '').toLowerCase().includes(q));
  }, [rows, buscar]);

  /** Lo pedido y lo aprobado, para ver de un vistazo qué falta por decidir. */
  const totales = useMemo(() => {
    const suma = (campo: string) => rows.reduce((s, r) => {
      const n = Number(String(r.data?.[campo] ?? '').replace(/[^\d.-]/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { solicitado: suma('valorSolicitado'), aprobado: suma('valorAprobado') };
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Préstamos
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading
                ? 'Cargando…'
                : `${rows.length} solicitudes · ${cop(totales.solicitado)} solicitado · ${cop(totales.aprobado)} aprobado`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/prestamo')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Ir al formato
          </Button>
        </div>

        <div className="max-w-6xl mx-auto px-6 pb-3">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Empleado, cédula o cargo"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Empleado</th>
                  <th className="text-left px-3 py-2 font-semibold">Cédula</th>
                  <th className="text-left px-3 py-2 font-semibold">Cargo</th>
                  <th className="text-right px-3 py-2 font-semibold">Solicitado</th>
                  <th className="text-right px-3 py-2 font-semibold">Aprobado</th>
                  <th className="text-left px-3 py-2 font-semibold">Motivo</th>
                  <th className="text-left px-3 py-2 font-semibold">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr
                    key={r.solicitudId}
                    onClick={() => navigate(`/dashboard/gestion-conocimiento/talento-humano/prestamo/${r.solicitudId}`)}
                    title="Abrir el formato"
                    className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {r.data?.nombreCompleto || <span className="italic text-[hsl(var(--canalco-neutral-400))]">Sin diligenciar</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.data?.numero || '—'}</td>
                    <td className="px-3 py-2">{r.data?.cargo || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(r.data?.valorSolicitado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(r.data?.valorAprobado)}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate">{r.data?.motivo || '—'}</td>
                    <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))]">{fecha(r.updatedAt)}</td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay solicitudes de préstamo.'
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
