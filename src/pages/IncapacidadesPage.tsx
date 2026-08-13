import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, HeartPulse, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService, type ThIncapacidad } from '@/services/talentoHumano.service';

/**
 * Incapacidades y su recobro.
 *
 * Lo que se sigue acá no es la incapacidad sino **la plata**: cuántos días asume la
 * empresa y cuántos la EPS o la ARL, cuánto hay que recobrar, en qué estado va y cuánto
 * se recuperó.
 *
 * El formulario se abre sobre el listado en vez de en otra pantalla: se registra de a
 * varias seguidas y volver atrás en cada una obligaría a recargar la tabla.
 */

/**
 * Los cinco estados de la hoja LISTAS del archivo, tal cual.
 *
 * «NO SE PUEDE COBRAR» no es lo mismo que «LO ASUME LA COMPAÑÍA» aunque las dos terminen
 * en que la empresa paga: la primera es una incapacidad que sí era recobrable y se perdió
 * —sin historia clínica, radicada tarde—, y por eso hay que poder contarlas aparte.
 */
const ESTADOS = ['EN PROCESO', 'AUTORIZADA', 'PAGADO', 'NO SE PUEDE COBRAR', 'LO ASUME LA COMPAÑÍA'];

/** Espejo de `TIPOS_INCAPACIDAD` del extractor, que es quien normalizó lo importado. */
const TIPOS = ['ENFERMEDAD GENERAL', 'ACCIDENTE DE TRABAJO', 'ACCIDENTE DE TRÁNSITO', 'LICENCIA DE MATERNIDAD', 'LICENCIA DE PATERNIDAD'];

const cop = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};

type Borrador = Partial<ThIncapacidad>;

const VACIO: Borrador = {
  identificacion: '', nombre: '', proyecto: '', salario: '',
  tipo: '', numeroIncapacidad: '',
  fechaInicio: '', fechaFin: '', periodoTexto: '',
  totalDias: null, diasEmpresa: null, diasEntidad: null,
  valorAsumidoEmpresa: '', valorRecobro: '',
  valorProyectadoRecuperar: '', valorRecuperado: '',
  entidad: '', estado: 'EN PROCESO', numeroRadicacion: '', fechaPago: '', observaciones: '',
};

export default function IncapacidadesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThIncapacidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  /** null = el formulario está cerrado. */
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setRows(await talentoHumanoService.listIncapacidades());
    } catch {
      toast.error('No se pudieron cargar las incapacidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (filtroEstado ? r.estado === filtroEstado : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || r.identificacion.toLowerCase().includes(q)
        || (r.entidad ?? '').toLowerCase().includes(q));
  }, [rows, buscar, filtroEstado]);

  /** Lo que falta por recuperar es el número que justifica la pantalla. */
  const totales = useMemo(() => {
    const suma = (f: (r: ThIncapacidad) => unknown) =>
      visibles.reduce((s, r) => {
        const n = Number(String(f(r) ?? '').replace(/[^\d.-]/g, ''));
        return s + (Number.isFinite(n) ? n : 0);
      }, 0);
    const proyectado = suma((r) => r.valorProyectadoRecuperar);
    const recuperado = suma((r) => r.valorRecuperado);
    return { proyectado, recuperado, pendiente: proyectado - recuperado };
  }, [visibles]);

  const set = <K extends keyof ThIncapacidad>(k: K, v: ThIncapacidad[K]) =>
    setBorrador((p) => (p ? { ...p, [k]: v } : p));

  const guardar = async () => {
    if (!borrador) return;
    if (!borrador.identificacion?.trim() || !borrador.nombre?.trim()) {
      toast.error('La identificación y el nombre son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      // Las fechas y los números vacíos van como null: una cadena vacía en una columna
      // `date` la rechaza Postgres, y en una `numeric` entraría como cero.
      const limpio: Record<string, unknown> = {};
      Object.entries(borrador).forEach(([k, v]) => {
        limpio[k] = v === '' ? null : v;
      });

      if (borrador.incapacidadId) {
        await talentoHumanoService.updateIncapacidad(borrador.incapacidadId, limpio);
        toast.success('Incapacidad actualizada');
      } else {
        await talentoHumanoService.createIncapacidad(limpio);
        toast.success('Incapacidad registrada');
      }
      setBorrador(null);
      await cargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (r: ThIncapacidad) => {
    if (!window.confirm(`¿Eliminar la incapacidad de ${r.nombre}? No se puede deshacer.`)) return;
    try {
      await talentoHumanoService.deleteIncapacidad(r.incapacidadId);
      setRows((p) => p.filter((x) => x.incapacidadId !== r.incapacidadId));
      toast.success('Eliminada');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Incapacidades
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading
                ? 'Cargando…'
                : `${visibles.length} registros · ${cop(totales.pendiente)} por recuperar`}
            </p>
          </div>
          <Button onClick={() => setBorrador({ ...VACIO })} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
            <Plus className="w-4 h-4" /> Registrar
          </Button>
        </div>

        <div className="max-w-7xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-grow min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Nombre, cédula o entidad"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            Proyectado {cop(totales.proyectado)} · recuperado {cop(totales.recuperado)}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Formulario. Se abre sobre el listado. */}
        {borrador && (
          <section className="mb-6 bg-white border border-[hsl(var(--canalco-primary))] rounded-xl shadow-md overflow-hidden">
            <header className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))] px-5 py-2.5 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] flex-grow">
                {borrador.incapacidadId ? 'Editar incapacidad' : 'Nueva incapacidad'}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setBorrador(null)} title="Cerrar">
                <X className="w-4 h-4" />
              </Button>
            </header>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3">
              <Campo label="Identificación *" value={borrador.identificacion ?? ''} onChange={(v) => set('identificacion', v)} />
              <Campo label="Nombre *" value={borrador.nombre ?? ''} onChange={(v) => set('nombre', v)} ancho="md:col-span-2" />
              <Campo label="Empresa o proyecto" value={borrador.proyecto ?? ''} onChange={(v) => set('proyecto', v)} />

              <Selector label="Tipo" value={borrador.tipo ?? ''} opciones={TIPOS} onChange={(v) => set('tipo', v)} />
              <Campo label="N.º de incapacidad" value={borrador.numeroIncapacidad ?? ''} onChange={(v) => set('numeroIncapacidad', v)} />
              <Campo label="Salario" value={borrador.salario ?? ''} onChange={(v) => set('salario', v)} tipo="number" />
              <Campo label="Entidad (EPS o ARL)" value={borrador.entidad ?? ''} onChange={(v) => set('entidad', v)} />

              <Campo label="Fecha inicio" value={borrador.fechaInicio ?? ''} onChange={(v) => set('fechaInicio', v)} tipo="date" />
              <Campo label="Fecha fin" value={borrador.fechaFin ?? ''} onChange={(v) => set('fechaFin', v)} tipo="date" />
              <Campo label="Periodo (como se escribe)" value={borrador.periodoTexto ?? ''} onChange={(v) => set('periodoTexto', v)} ancho="md:col-span-2" />

              <Campo label="Total días" value={borrador.totalDias ?? ''} onChange={(v) => set('totalDias', v === '' ? null : Number(v))} tipo="number" />
              <Campo label="Días empresa" value={borrador.diasEmpresa ?? ''} onChange={(v) => set('diasEmpresa', v === '' ? null : Number(v))} tipo="number" />
              <Campo label="Días EPS/ARL" value={borrador.diasEntidad ?? ''} onChange={(v) => set('diasEntidad', v === '' ? null : Number(v))} tipo="number" />
              <Selector label="Estado" value={borrador.estado ?? ''} opciones={ESTADOS} onChange={(v) => set('estado', v)} />

              <Campo label="Valor asumido por la empresa" value={borrador.valorAsumidoEmpresa ?? ''} onChange={(v) => set('valorAsumidoEmpresa', v)} tipo="number" />
              <Campo label="Valor a recobrar" value={borrador.valorRecobro ?? ''} onChange={(v) => set('valorRecobro', v)} tipo="number" />
              <Campo label="Proyectado a recuperar" value={borrador.valorProyectadoRecuperar ?? ''} onChange={(v) => set('valorProyectadoRecuperar', v)} tipo="number" />
              <Campo label="Recuperado" value={borrador.valorRecuperado ?? ''} onChange={(v) => set('valorRecuperado', v)} tipo="number" />

              <Campo label="N.º de radicación" value={borrador.numeroRadicacion ?? ''} onChange={(v) => set('numeroRadicacion', v)} />
              <Campo label="Fecha de pago" value={borrador.fechaPago ?? ''} onChange={(v) => set('fechaPago', v)} />
              <Campo label="Observaciones" value={borrador.observaciones ?? ''} onChange={(v) => set('observaciones', v)} ancho="md:col-span-2" />
            </div>

            <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex items-center gap-3">
              <Button onClick={guardar} disabled={guardando} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </Button>
              <Button variant="outline" onClick={() => setBorrador(null)}>Cancelar</Button>
            </footer>
          </section>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold">Identificación</th>
                  <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                  <th className="text-left px-3 py-2 font-semibold">Desde</th>
                  <th className="text-right px-3 py-2 font-semibold">Días</th>
                  <th className="text-right px-3 py-2 font-semibold">Empresa</th>
                  <th className="text-right px-3 py-2 font-semibold">EPS/ARL</th>
                  <th className="text-left px-3 py-2 font-semibold">Entidad</th>
                  <th className="text-right px-3 py-2 font-semibold">Proyectado</th>
                  <th className="text-right px-3 py-2 font-semibold">Recuperado</th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr
                    key={r.incapacidadId}
                    onClick={() => setBorrador({ ...r })}
                    title="Editar"
                    className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))]">{r.nombre}</td>
                    <td className="px-3 py-2 tabular-nums">{r.identificacion}</td>
                    <td className="px-3 py-2">{r.tipo || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fecha(r.fechaInicio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.totalDias ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.diasEmpresa ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.diasEntidad ?? '—'}</td>
                    <td className="px-3 py-2">{r.entidad || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(r.valorProyectadoRecuperar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(r.valorRecuperado)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium rounded px-2 py-0.5 whitespace-nowrap ${
                        r.estado === 'PAGADO' ? 'bg-emerald-50 text-emerald-800'
                          : r.estado === 'EN PROCESO' ? 'bg-[#fff8b0] text-[#16162b]'
                            // Plata que era recobrable y se perdió: se marca aparte de
                            // «LO ASUME LA COMPAÑÍA», que nunca se iba a recobrar.
                            : r.estado === 'NO SE PUEDE COBRAR' ? 'bg-red-50 text-red-800'
                              : 'bg-[#eeeef5] text-[#4a4a63]'
                      }`}>
                        {r.estado || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={(e) => { e.stopPropagation(); void eliminar(r); }}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'Todavía no hay incapacidades registradas.'
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

/* ── Subcomponentes ─────────────────────────────────────── */

function Campo({ label, value, onChange, tipo, ancho }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  tipo?: string;
  ancho?: string;
}) {
  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <input
        type={tipo ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
    </label>
  );
}

function Selector({ label, value, opciones, onChange }: {
  label: string; value: string; opciones: string[]; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
      >
        <option value="">—</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
