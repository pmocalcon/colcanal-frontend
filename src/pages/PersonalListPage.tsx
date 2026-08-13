import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pencil, Plus, Save, Search, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Campo, CampoCalculado, CampoPorcentaje, CampoSugerido, Selector } from '@/components/talentoHumano/campos';
import { talentoHumanoService, type ThPersona } from '@/services/talentoHumano.service';

/**
 * Listado de la base de personal.
 *
 * Trae la base entera —son menos de cien personas— y filtra en pantalla. Pedirle al
 * servidor cada tecleo obligaría a esperar por algo que ya está en memoria, y paginar
 * impediría contar cuántos activos hay sin recorrer las páginas.
 *
 * La tabla muestra **todas** las columnas del archivo original. Son veintitantas, así que
 * la de nombre queda fija al desplazarse a lo ancho: sin eso, a la altura de la carga
 * prestacional ya no se sabe de quién es la fila.
 */

const ESTADOS = ['ACTIVO', 'INACTIVO'];

/** Las cifras de la remuneración, que en la tabla van juntas y alineadas a la derecha. */
const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

/** El archivo guarda la carga prestacional como fracción: 0,3783 es el 37,83 %. */
const pct = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0
    ? (n * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' %'
    : '—';
};

const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '—');
};

const esActivo = (p: ThPersona) => (p.estado ?? '').trim().toUpperCase().startsWith('ACTIVO');

/**
 * Encabezado de columna.
 *
 * Las clases de alineación se escogen de un objeto y no se arman con `text-${alinear}`:
 * Tailwind purga lo que no encuentre escrito literal en el código, y una clase construida
 * no aparecería en la hoja de estilos compilada.
 *
 * `fija` deja la columna del nombre pegada a la izquierda: son veintitantas columnas, y a
 * la altura de la carga prestacional ya no se sabría de quién es la fila.
 */
const ALINEAR = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function Th({ children, alinear = 'left', fija = false }: {
  children: React.ReactNode;
  alinear?: keyof typeof ALINEAR;
  fija?: boolean;
}) {
  return (
    <th className={`px-3 py-2 font-semibold whitespace-nowrap ${ALINEAR[alinear]} ${
      fija ? 'sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))]' : ''
    }`}>
      {children}
    </th>
  );
}

type Borrador = Partial<ThPersona>;

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** A dos decimales, y sin la cola de coma flotante de 662367.36150000004. */
const dosDecimales = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Rehace los tres totales de la remuneración a partir de los cuatro datos de entrada.
 *
 * Son las mismas fórmulas del Excel, verificadas contra sus filas:
 *
 *     total salarios     = salario + auxilio de transporte + auxilio de rodamiento
 *     carga prestacional = salario × % de carga        ← sobre el salario, no sobre el total
 *     costo total        = total salarios + carga prestacional
 *
 * Se calculan en vez de dejarlos escribir porque un total tecleado a mano deja de cuadrar
 * con sus sumandos en cuanto uno cambia, y porque de los cuatro números que se digitan
 * salen los tres que de verdad se miran.
 */
const recalcular = (b: Borrador): Borrador => {
  const salario = num(b.salario);
  const total = salario + num(b.auxilioTransporte) + num(b.auxilioRodamiento);
  const carga = salario * num(b.cargaPrestacionalPct);
  return {
    ...b,
    totalSalarios: total ? dosDecimales(total) : '',
    cargaPrestacional: carga ? dosDecimales(carga) : '',
    costoTotal: total || carga ? dosDecimales(total + carga) : '',
  };
};

const VACIO: Borrador = {
  estado: 'ACTIVO', tipoContrato: '', ubicacion: '', empresaProyecto: '',
  identificacion: '', nombre: '', cargo: '', area: '',
  operacionFge: '', centroCosto: '', tipoGasto: '',
  fechaIngreso: '', escalafon: '', formacionProfesional: '',
  salario: '', auxilioTransporte: '', auxilioRodamiento: '', totalSalarios: '',
  cargaPrestacionalPct: '', cargaPrestacional: '', costoTotal: '',
  anioVigencia: new Date().getFullYear(), observaciones: '',
};

export default function PersonalListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [area, setArea] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  /** null = el formulario está cerrado. */
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setRows(await talentoHumanoService.listPersonal());
    } catch {
      toast.error('No se pudo cargar el personal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  /** Las listas de sugerencias salen de lo que ya está cargado, no de un catálogo. */
  const valoresDe = (campo: keyof ThPersona) =>
    [...new Set(rows.map((r) => String(r[campo] ?? '').trim()).filter(Boolean))].sort();

  const areas = useMemo(() => valoresDe('area'), [rows]);
  const ubicaciones = useMemo(() => valoresDe('ubicacion'), [rows]);
  const contratos = useMemo(() => valoresDe('tipoContrato'), [rows]);
  const empresas = useMemo(() => valoresDe('empresaProyecto'), [rows]);
  const escalafones = useMemo(() => valoresDe('escalafon'), [rows]);
  const cargos = useMemo(() => valoresDe('cargo'), [rows]);
  const formaciones = useMemo(() => valoresDe('formacionProfesional'), [rows]);

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

  const set = <K extends keyof ThPersona>(k: K, v: ThPersona[K]) =>
    setBorrador((p) => (p ? { ...p, [k]: v } : p));

  /** Igual que `set`, pero rehace los tres totales que dependen de lo que cambió. */
  const setCalculado = <K extends keyof ThPersona>(k: K, v: ThPersona[K]) =>
    setBorrador((p) => (p ? recalcular({ ...p, [k]: v }) : p));

  const guardar = async () => {
    if (!borrador) return;
    if (!borrador.identificacion?.trim() || !borrador.nombre?.trim()) {
      toast.error('La identificación y el nombre son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      // Los vacíos van como null: una cadena vacía en una columna `date` la rechaza
      // Postgres, y en una `numeric` entraría como cero, que no es lo mismo que «no sé».
      const limpio: Record<string, unknown> = {};
      Object.entries(borrador).forEach(([k, v]) => { limpio[k] = v === '' ? null : v; });

      if (borrador.personaId) {
        await talentoHumanoService.updatePersona(borrador.personaId, limpio);
        toast.success('Persona actualizada');
      } else {
        await talentoHumanoService.createPersona(limpio);
        toast.success('Persona agregada');
      }
      setBorrador(null);
      await cargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center gap-4">
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
          <Button
            onClick={() => setBorrador({ ...VACIO })}
            className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
          >
            <Plus className="w-4 h-4" /> Agregar persona
          </Button>
        </div>

        {/* Filtros */}
        <div className="max-w-[1800px] mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
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

      <main className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Formulario. Se abre sobre el listado, como en incapacidades. */}
        {borrador && (
          <section className="mb-6 bg-white border border-[hsl(var(--canalco-primary))] rounded-xl shadow-md overflow-hidden">
            <header className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))] px-5 py-2.5 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] flex-grow">
                {borrador.personaId ? `Editar a ${borrador.nombre}` : 'Agregar persona'}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setBorrador(null)} title="Cerrar">
                <X className="w-4 h-4" />
              </Button>
            </header>

            <div className="p-5 space-y-5">
              {/* Quién es */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3">
                <Campo label="Identificación *" value={borrador.identificacion ?? ''} onChange={(v) => set('identificacion', v)} />
                <Campo label="Nombre *" value={borrador.nombre ?? ''} onChange={(v) => set('nombre', v)} ancho="md:col-span-2" />
                <Selector label="Estado" value={borrador.estado ?? ''} opciones={ESTADOS} onChange={(v) => set('estado', v)} />

                <CampoSugerido id="lista-cargos" label="Cargo" value={borrador.cargo ?? ''} opciones={cargos} onChange={(v) => set('cargo', v)} ancho="md:col-span-2" />
                <CampoSugerido id="lista-areas" label="Área" value={borrador.area ?? ''} opciones={areas} onChange={(v) => set('area', v)} />
                <CampoSugerido id="lista-escalafon" label="Escalafón" value={borrador.escalafon ?? ''} opciones={escalafones} onChange={(v) => set('escalafon', v)} />
              </div>

              {/* Dónde y con qué contrato */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <CampoSugerido id="lista-contratos" label="Tipo de contrato" value={borrador.tipoContrato ?? ''} opciones={contratos} onChange={(v) => set('tipoContrato', v)} />
                <Campo label="Fecha de ingreso" value={borrador.fechaIngreso ?? ''} onChange={(v) => set('fechaIngreso', v)} tipo="date" />
                <CampoSugerido id="lista-ubicaciones" label="Ubicación" value={borrador.ubicacion ?? ''} opciones={ubicaciones} onChange={(v) => set('ubicacion', v)} />
                <CampoSugerido id="lista-empresas" label="Empresa o proyecto" value={borrador.empresaProyecto ?? ''} opciones={empresas} onChange={(v) => set('empresaProyecto', v)} />

                <Campo label="Operación / FGE" value={borrador.operacionFge ?? ''} onChange={(v) => set('operacionFge', v)} />
                <Campo label="Centro de costo" value={borrador.centroCosto ?? ''} onChange={(v) => set('centroCosto', v)} />
                <Campo label="Tipo de gasto" value={borrador.tipoGasto ?? ''} onChange={(v) => set('tipoGasto', v)} />
                <CampoSugerido id="lista-formacion" label="Formación profesional" value={borrador.formacionProfesional ?? ''} opciones={formaciones} onChange={(v) => set('formacionProfesional', v)} />
              </div>

              {/* Remuneración */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <Campo label="Salario" value={borrador.salario ?? ''} onChange={(v) => setCalculado('salario', v)} tipo="number" />
                <Campo label="Auxilio de transporte" value={borrador.auxilioTransporte ?? ''} onChange={(v) => setCalculado('auxilioTransporte', v)} tipo="number" />
                <Campo label="Auxilio de rodamiento y otros" value={borrador.auxilioRodamiento ?? ''} onChange={(v) => setCalculado('auxilioRodamiento', v)} tipo="number" />
                <CampoPorcentaje label="Carga prestacional" value={borrador.cargaPrestacionalPct ?? ''} onChange={(v) => setCalculado('cargaPrestacionalPct', v)} />

                <CampoCalculado label="Total salarios" value={cop(borrador.totalSalarios ?? '')} nota="Salario + auxilio de transporte + auxilio de rodamiento" />
                <CampoCalculado label="Carga prestacional" value={cop(borrador.cargaPrestacional ?? '')} nota="Salario × % de carga" />
                <CampoCalculado label="Costo total" value={cop(borrador.costoTotal ?? '')} nota="Total salarios + carga prestacional" />
                <Campo label="Año de vigencia" value={borrador.anioVigencia ?? ''} onChange={(v) => set('anioVigencia', v === '' ? null : Number(v))} tipo="number" paso="1" />

                <Campo label="Observaciones" value={borrador.observaciones ?? ''} onChange={(v) => set('observaciones', v)} ancho="md:col-span-3 lg:col-span-4" />
              </div>
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
            <table className="w-full text-sm min-w-[2400px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <Th fija>Nombre</Th>
                  <Th>Identificación</Th>
                  <Th>Estado</Th>
                  <Th>Cargo</Th>
                  <Th>Área</Th>
                  <Th>Contrato</Th>
                  <Th>Ingreso</Th>
                  <Th>Ubicación</Th>
                  <Th>Empresa o proyecto</Th>
                  <Th>Operación/FGE</Th>
                  <Th>CC</Th>
                  <Th>Tipo gasto</Th>
                  <Th>Escalafón</Th>
                  <Th>Formación</Th>
                  <Th alinear="right">Salario</Th>
                  <Th alinear="right">Aux. transporte</Th>
                  <Th alinear="right">Aux. rodamiento</Th>
                  <Th alinear="right">Total salarios</Th>
                  <Th alinear="right">% carga</Th>
                  <Th alinear="right">Carga prestacional</Th>
                  <Th alinear="right">Costo total</Th>
                  <Th alinear="right">Año</Th>
                  <Th>Observaciones</Th>
                  <Th alinear="center">Editar</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] group">
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))] sticky left-0 z-10 bg-white group-hover:bg-[hsl(var(--canalco-neutral-100))]">
                      {p.nombre}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.identificacion}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium rounded px-2 py-0.5 whitespace-nowrap ${
                        esActivo(p) ? 'bg-emerald-50 text-emerald-800' : 'bg-[#eeeef5] text-[#4a4a63]'
                      }`}>
                        {(p.estado ?? '—').trim()}
                      </span>
                    </td>
                    <td className="px-3 py-2">{p.cargo || '—'}</td>
                    <td className="px-3 py-2">{p.area || '—'}</td>
                    <td className="px-3 py-2">{p.tipoContrato || '—'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(p.fechaIngreso)}</td>
                    <td className="px-3 py-2">{p.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{p.empresaProyecto || '—'}</td>
                    <td className="px-3 py-2">{p.operacionFge || '—'}</td>
                    <td className="px-3 py-2">{p.centroCosto || '—'}</td>
                    <td className="px-3 py-2">{p.tipoGasto || '—'}</td>
                    <td className="px-3 py-2">{p.escalafon || '—'}</td>
                    <td className="px-3 py-2">{p.formacionProfesional || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.salario)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.auxilioTransporte)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.auxilioRodamiento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.totalSalarios)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(p.cargaPrestacionalPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.cargaPrestacional)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(p.costoTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.anioVigencia ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-[hsl(var(--canalco-neutral-600))]" title={p.observaciones ?? ''}>
                      {p.observaciones || '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setBorrador({ ...p })}
                        title={`Editar a ${p.nombre}`}
                        className="text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-primary))]"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={24} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
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
