import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plane, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThVacacion } from '@/services/talentoHumano.service';

/**
 * Vacaciones ya aprobadas.
 *
 * Es el registro de lo que Gerencia concedió en el formato **GTH-018-F** (G. de talento
 * humano): allá se recorren los cuatro recuadros de "APROBACIÓN", acá queda lo ya
 * concedido, con los días y valores que confirmó Recursos Humanos —que pueden no ser
 * los mismos que pidió el empleado—.
 */

const AÑO_ACTUAL = new Date().getFullYear();

const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};

const anioDe = (iso: string | null) => iso?.slice(0, 4) ?? '';

const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const dias = (n: number | null) => (n === null || n === undefined ? '—' : n);

export default function VacacionesListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThVacacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [anio, setAnio] = useState(String(AÑO_ACTUAL));

  useEffect(() => {
    let cancelled = false;
    talentoHumanoService
      .listVacaciones()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar las vacaciones'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const anios = useMemo(
    () => [...new Set(rows.map((r) => anioDe(r.fechaInicio)).filter(Boolean))].sort().reverse(),
    [rows],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (anio ? anioDe(r.fechaInicio) === anio : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || r.identificacion.toLowerCase().includes(q)
        || (r.cargo ?? '').toLowerCase().includes(q));
  }, [rows, buscar, anio]);

  const totales = useMemo(() => ({
    disfrutar: visibles.reduce((s, r) => s + (r.diasDisfrutar ?? 0), 0),
    compensar: visibles.reduce((s, r) => s + (r.diasCompensar ?? 0), 0),
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
              <Plane className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Vacaciones
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading
                ? 'Cargando…'
                : `${visibles.length} registros · ${totales.disfrutar} días a disfrutar · ${totales.compensar} a compensar`}
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-grow min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Nombre, cédula o cargo"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            <option value="">Todos los años</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold">Identificación</th>
                  <th className="text-left px-3 py-2 font-semibold">Cargo</th>
                  <th className="text-left px-3 py-2 font-semibold">Periodo causado</th>
                  <th className="text-left px-3 py-2 font-semibold">Desde</th>
                  <th className="text-left px-3 py-2 font-semibold">Hasta</th>
                  <th className="text-right px-3 py-2 font-semibold">Disfrutar</th>
                  <th className="text-right px-3 py-2 font-semibold">Compensar</th>
                  <th className="text-right px-3 py-2 font-semibold">Pendientes</th>
                  <th className="text-right px-3 py-2 font-semibold">Prima</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((v) => (
                  <tr key={v.vacacionId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))]">
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">{v.nombre}</td>
                    <td className="px-3 py-2 tabular-nums">{v.identificacion}</td>
                    <td className="px-3 py-2">{v.cargo || '—'}</td>
                    <td className="px-3 py-2">{v.periodoCausado || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(v.fechaInicio)}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(v.fechaFinal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{dias(v.diasDisfrutar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dias(v.diasCompensar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dias(v.diasPendientes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(v.valorPrima)}</td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay vacaciones aprobadas.'
                        : 'Ninguna coincide con los filtros.'}
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
