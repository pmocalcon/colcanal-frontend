import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThPrestamo } from '@/services/talentoHumano.service';

/**
 * Cartera de préstamos a empleados.
 *
 * **No es el formato de solicitud.** Ese es el papel con el que se pide uno nuevo y vive
 * en G. de talento humano; esto es lo que se prestó, lo que se ha descontado por nómina y
 * lo que falta. Un préstamo está acá desde que se desembolsa, lo hayan pedido con formato
 * o no: los 52 que se importaron son anteriores al formato.
 *
 * Los que aún deben van primero: la pregunta al abrir es a quién hay que seguirle
 * cobrando, no quién ya terminó de pagar.
 *
 * La fila se despliega para ver los descuentos mes a mes, que es de donde sale el saldo.
 * Se piden al abrir y no de entrada: son cientos de cuotas y traerlas todas para mostrar
 * un listado es exactamente lo que tumbó por memoria el listado de levantamientos.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

/** Para las cifras de cabecera, donde el cero sí es informativo. */
const copCero = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/** «2025-09-01» → «sep 2025». El día no aporta: en la hoja siempre es el 1. */
const mesAnio = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : '—';
};

export default function PrestamosListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [soloConSaldo, setSoloConSaldo] = useState(false);

  /** Qué fila está desplegada y el detalle que ya se trajo, por id. */
  const [abierto, setAbierto] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<Record<number, ThPrestamo>>({});

  useEffect(() => {
    let cancelled = false;
    talentoHumanoService
      .listPrestamos()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar los préstamos'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const abrir = async (p: ThPrestamo) => {
    if (abierto === p.prestamoId) { setAbierto(null); return; }
    setAbierto(p.prestamoId);
    if (detalles[p.prestamoId]) return;
    try {
      const detalle = await talentoHumanoService.getPrestamo(p.prestamoId);
      setDetalles((d) => ({ ...d, [p.prestamoId]: detalle }));
    } catch {
      toast.error('No se pudieron cargar los descuentos');
    }
  };

  const proyectos = useMemo(
    () => [...new Set(rows.map((r) => (r.proyecto ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (soloConSaldo ? Number(r.saldo ?? 0) > 0 : true))
      .filter((r) => (proyecto ? (r.proyecto ?? '').trim() === proyecto : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || (r.identificacion ?? '').includes(q));
  }, [rows, buscar, proyecto, soloConSaldo]);

  /** Lo que se mira al abrir: cuánto se prestó y cuánto falta por recuperar. */
  const totales = useMemo(() => {
    const suma = (campo: keyof ThPrestamo) =>
      visibles.reduce((s, r) => s + (Number(r[campo] ?? 0) || 0), 0);
    return {
      prestado: suma('valorPrestamo'),
      cancelado: suma('valorCancelado'),
      saldo: suma('saldo'),
      activos: visibles.filter((r) => Number(r.saldo ?? 0) > 0).length,
    };
  }, [visibles]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
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
                : `${visibles.length} préstamos · ${totales.activos} con saldo`}
            </p>
          </div>
        </div>

        {/* Lo que de verdad importa: cuánto falta por recuperar. */}
        {!loading && (
          <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Prestado </span>
              <span className="font-semibold tabular-nums">{copCero(totales.prestado)}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Descontado </span>
              <span className="font-semibold tabular-nums text-emerald-800">{copCero(totales.cancelado)}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Por recuperar </span>
              <span className="font-bold tabular-nums text-[hsl(var(--canalco-primary))]">{copCero(totales.saldo)}</span>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-grow min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Empleado o cédula"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
          <select
            value={proyecto}
            onChange={(e) => setProyecto(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={() => setSoloConSaldo((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              soloConSaldo
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            Solo con saldo
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[940px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2 font-semibold">Empleado</th>
                  <th className="text-left px-3 py-2 font-semibold">Proyecto</th>
                  <th className="text-left px-3 py-2 font-semibold">Desde</th>
                  <th className="text-right px-3 py-2 font-semibold">Cuotas</th>
                  <th className="text-left px-3 py-2 font-semibold">Vence</th>
                  <th className="text-right px-3 py-2 font-semibold">Préstamo</th>
                  <th className="text-right px-3 py-2 font-semibold">Cuota</th>
                  <th className="text-right px-3 py-2 font-semibold">Descontado</th>
                  <th className="text-right px-3 py-2 font-semibold">Saldo</th>
                  <th className="text-center px-3 py-2 font-semibold">Pagaré</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const debe = Number(p.saldo ?? 0) > 0;
                  const detalle = detalles[p.prestamoId];
                  const desplegado = abierto === p.prestamoId;
                  return [
                    <tr
                      key={p.prestamoId}
                      onClick={() => void abrir(p)}
                      title="Ver los descuentos mes a mes"
                      className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer"
                    >
                      <td className="pl-2 text-[hsl(var(--canalco-neutral-400))]">
                        {desplegado ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">
                        {p.nombre}
                        {p.identificacion && (
                          <span className="ml-2 text-xs text-[hsl(var(--canalco-neutral-500))] tabular-nums">
                            {p.identificacion}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{p.proyecto || '—'}</td>
                      <td className="px-3 py-2">{mesAnio(p.mesInicio)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.numeroCuotas ?? '—'}</td>
                      <td className="px-3 py-2">{mesAnio(p.fechaVencimiento)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cop(p.valorPrestamo)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cop(p.valorCuota)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{cop(p.valorCancelado)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        debe ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-400))]'
                      }`}>
                        {debe ? cop(p.saldo) : 'Saldado'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.pagare
                          ? <span className={`text-xs font-medium rounded px-2 py-0.5 ${
                              p.pagare === 'SI' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                            }`}>{p.pagare}</span>
                          : <span className="text-[hsl(var(--canalco-neutral-400))]">—</span>}
                      </td>
                    </tr>,

                    desplegado && (
                      <tr key={`${p.prestamoId}-detalle`} className="bg-[hsl(var(--canalco-neutral-100))]">
                        <td />
                        <td colSpan={10} className="px-3 py-3">
                          {!detalle ? (
                            <div className="flex items-center gap-2 text-[hsl(var(--canalco-neutral-500))]">
                              <Loader2 className="w-4 h-4 animate-spin" /> Cargando descuentos…
                            </div>
                          ) : detalle.pagos?.length ? (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {detalle.pagos.map((g) => (
                                  <span
                                    key={g.pagoId}
                                    className="text-xs bg-white border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 tabular-nums"
                                  >
                                    <span className="text-[hsl(var(--canalco-neutral-500))]">
                                      {MESES[g.mes - 1]} {g.anio}
                                    </span>{' '}
                                    <span className="font-medium">{cop(g.valor)}</span>
                                  </span>
                                ))}
                              </div>
                              {detalle.observaciones && (
                                <p className="mt-2 text-xs text-[hsl(var(--canalco-neutral-600))] italic">
                                  {detalle.observaciones}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-[hsl(var(--canalco-neutral-500))]">
                              Todavía no se le ha descontado ninguna cuota.
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay préstamos registrados.'
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
