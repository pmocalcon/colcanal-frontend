import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThPersona } from '@/services/talentoHumano.service';

/**
 * Listado de la base de personal.
 *
 * Trae la base entera —son menos de cien personas— y filtra en pantalla. Pedirle al
 * servidor cada tecleo obligaría a esperar por algo que ya está en memoria, y paginar
 * impediría contar cuántos activos hay sin recorrer las páginas.
 */

const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return n > 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

/** «2019-02-15» → «15/02/2019». Devuelve el crudo si no se entiende. */
const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '—');
};

const esActivo = (p: ThPersona) => (p.estado ?? '').trim().toUpperCase().startsWith('ACTIVO');

export default function PersonalListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [area, setArea] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  useEffect(() => {
    let cancelled = false;
    talentoHumanoService
      .listPersonal()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) toast.error('No se pudo cargar el personal'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const areas = useMemo(
    () => [...new Set(rows.map((r) => (r.area ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (soloActivos ? esActivo(r) : true))
      .filter((r) => (area ? (r.area ?? '').trim() === area : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || r.identificacion.toLowerCase().includes(q)
        || (r.cargo ?? '').toLowerCase().includes(q));
  }, [rows, buscar, area, soloActivos]);

  const activos = useMemo(() => rows.filter(esActivo).length, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Users className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Personal
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading ? 'Cargando…' : `${activos} activos de ${rows.length} registros`}
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
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            onClick={() => setSoloActivos((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              soloActivos
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            Solo activos
          </button>
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            {visibles.length} en pantalla
          </span>
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
                  <th className="text-left px-3 py-2 font-semibold">Área</th>
                  <th className="text-left px-3 py-2 font-semibold">Contrato</th>
                  <th className="text-left px-3 py-2 font-semibold">Ubicación</th>
                  <th className="text-left px-3 py-2 font-semibold">Ingreso</th>
                  <th className="text-right px-3 py-2 font-semibold">Salario</th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))]">
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">{p.nombre}</td>
                    <td className="px-3 py-2 tabular-nums">{p.identificacion}</td>
                    <td className="px-3 py-2">{p.cargo || '—'}</td>
                    <td className="px-3 py-2">{p.area || '—'}</td>
                    <td className="px-3 py-2">{p.tipoContrato || '—'}</td>
                    <td className="px-3 py-2">{p.ubicacion || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(p.fechaIngreso)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.salario)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium rounded px-2 py-0.5 ${
                        esActivo(p) ? 'bg-emerald-50 text-emerald-800' : 'bg-[#eeeef5] text-[#4a4a63]'
                      }`}>
                        {(p.estado ?? '—').trim()}
                      </span>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'La base de personal está vacía. Falta importarla.'
                        : 'Nadie coincide con los filtros.'}
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
