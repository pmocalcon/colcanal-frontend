import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThAusentismo } from '@/services/talentoHumano.service';

/**
 * Ausentismos: los permisos concedidos.
 *
 * Es el histórico de «01. Ausentismos.xlsx», el mismo hecho que el formato **GTH-009-F
 * (Solicitud de permiso)** de G. de talento humano: allá se firma el papel, acá se
 * consulta lo ya concedido.
 *
 * No confundir con incapacidades: un permiso lo autoriza la empresa y sale de las horas
 * del empleado; una incapacidad la expide la EPS o la ARL y se le recobra a ella. Por eso
 * lo que se mira acá son **horas**, no plata.
 *
 * El listado llega acotado del servidor —esta tabla solo crece— y se filtra en pantalla.
 */

const AÑO_ACTUAL = new Date().getFullYear();

/** Cuántos registros se piden. El servidor topa en 2000 por si acaso. */
const LIMITE = '1000';

const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};

const anioDe = (iso: string | null) => iso?.slice(0, 4) ?? '';

const horas = (v: string | null) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return '—';
  // 1.5 se lee mejor como «1,5 h» y 8 como «8 h», sin decimal de relleno.
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`;
};

export default function AusentismosPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThAusentismo[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [motivo, setMotivo] = useState('');
  const [anio, setAnio] = useState(String(AÑO_ACTUAL));

  useEffect(() => {
    let cancelled = false;
    talentoHumanoService
      .listAusentismos({ limite: LIMITE })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar los ausentismos'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const motivos = useMemo(
    () => [...new Set(rows.map((r) => (r.motivo ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  );

  const anios = useMemo(
    () => [...new Set(rows.map((r) => anioDe(r.fechaInicio)).filter(Boolean))].sort().reverse(),
    [rows],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (anio ? anioDe(r.fechaInicio) === anio : true))
      .filter((r) => (motivo ? (r.motivo ?? '').trim() === motivo : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || r.identificacion.toLowerCase().includes(q)
        || (r.cargo ?? '').toLowerCase().includes(q));
  }, [rows, buscar, motivo, anio]);

  /** Lo que se mira al abrir: cuántas horas se fueron y en cuánta gente. */
  const totales = useMemo(() => ({
    horas: visibles.reduce((s, r) => s + (Number(r.horasAusencia) || 0), 0),
    personas: new Set(visibles.map((r) => r.identificacion)).size,
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
              <CalendarClock className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Ausentismos
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading
                ? 'Cargando…'
                : `${visibles.length} permisos · ${horas(String(totales.horas))} · ${totales.personas} personas`}
            </p>
          </div>
        </div>

        {/* Filtros */}
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
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))] max-w-[220px]"
          >
            <option value="">Todos los motivos</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-auto shadow-sm max-h-[calc(100vh-13rem)]">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))] [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold">Identificación</th>
                  <th className="text-left px-3 py-2 font-semibold">Cargo</th>
                  <th className="text-left px-3 py-2 font-semibold">Área</th>
                  <th className="text-left px-3 py-2 font-semibold">Desde</th>
                  <th className="text-left px-3 py-2 font-semibold">Hasta</th>
                  <th className="text-center px-3 py-2 font-semibold">Salida</th>
                  <th className="text-center px-3 py-2 font-semibold">Entrada</th>
                  <th className="text-right px-3 py-2 font-semibold">Horas</th>
                  <th className="text-left px-3 py-2 font-semibold">Motivo</th>
                  <th className="text-left px-3 py-2 font-semibold">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => (
                  <tr key={a.ausentismoId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))]">
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">{a.nombre}</td>
                    <td className="px-3 py-2 tabular-nums">{a.identificacion}</td>
                    <td className="px-3 py-2">{a.cargo || '—'}</td>
                    <td className="px-3 py-2">{a.area || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(a.fechaInicio)}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(a.fechaFin)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{a.horaSalida || '—'}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{a.horaEntrada || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{horas(a.horasAusencia)}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium rounded px-2 py-0.5 bg-[#eeeef5] text-[#4a4a63] whitespace-nowrap">
                        {a.motivo || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-[hsl(var(--canalco-neutral-600))]" title={a.observaciones ?? ''}>
                      {a.observaciones || '—'}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay permisos registrados.'
                        : 'Ninguno coincide con los filtros.'}
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
