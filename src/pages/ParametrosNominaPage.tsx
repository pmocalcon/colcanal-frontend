import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Campo, CampoCheck } from '@/components/talentoHumano/campos';
import { talentoHumanoService, type ThBanco, type ThParametroNomina } from '@/services/talentoHumano.service';

/**
 * Parámetros de nómina: las cifras que no calcula el sistema sino que le llegan de afuera.
 *
 * Son dos y no se parecen en nada más que en eso:
 *
 *  - **Por año**, el salario mínimo y el auxilio de transporte que decreta el Gobierno.
 *    Antes estaban escritos a mano en la pantalla de Nómina, así que cada 1º de enero
 *    había que acordarse de cambiarlos ahí —y la liquidación de un mes viejo se
 *    recalculaba con las cifras del año nuevo—. Acá queda una fila por año y la nómina
 *    toma la del año del periodo que se esté liquidando.
 *
 *  - **Los bancos**, con el código que los identifica en el archivo plano que se sube al
 *    portal bancario. Ese código lo define el banco pagador y cambia cuando entra una
 *    entidad nueva o cuando dos se fusionan; si estuviera quemado en el código, el
 *    archivo saldría con un código viejo, el banco lo rechazaría y no habría dónde
 *    corregirlo.
 *
 * Ruta: `.../talento-humano/parametros`.
 */

const cop = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) && n ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

type Pestana = 'anios' | 'bancos';

type BorradorAnio = { anio: number | ''; smmlv: string; auxilioTransporte: string; observaciones: string };
type BorradorBanco = { codigo: number | ''; nombre: string; activo: boolean; original?: number };

const ANIO_VACIO = (anio: number): BorradorAnio => ({
  anio, smmlv: '', auxilioTransporte: '', observaciones: '',
});
const BANCO_VACIO: BorradorBanco = { codigo: '', nombre: '', activo: true };

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ParametrosNominaPage() {
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<Pestana>('anios');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-[1000px] mx-auto px-6 pt-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Parámetros
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Las cifras y los códigos que la nómina no calcula sino que le llegan de afuera
            </p>
          </div>
        </div>
        <nav className="max-w-[1000px] mx-auto px-6 flex gap-1 mt-3">
          {([
            ['anios', 'Salario mínimo y auxilio'],
            ['bancos', 'Bancos'],
          ] as Array<[Pestana, string]>).map(([id, texto]) => (
            <button
              key={id}
              onClick={() => setPestana(id)}
              className={
                'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
                (pestana === id
                  ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                  : 'border-transparent text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))]')
              }
            >
              {texto}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-6">
        {pestana === 'anios' ? <SeccionAnios /> : <SeccionBancos />}
      </main>
    </div>
  );
}

// ── Salario mínimo y auxilio de transporte ──

function SeccionAnios() {
  const [filas, setFilas] = useState<ThParametroNomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrador, setBorrador] = useState<BorradorAnio | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setFilas(await talentoHumanoService.listParametros());
    } catch {
      toast.error('No se pudieron cargar los parámetros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const nuevo = () => {
    // Se propone el año siguiente al más reciente cargado: es lo que uno viene a hacer
    // en enero, y si es el primero, el año en curso.
    const ultimo = filas.length ? Math.max(...filas.map((f) => f.anio)) : new Date().getFullYear() - 1;
    setBorrador(ANIO_VACIO(ultimo + 1));
  };

  const editar = (f: ThParametroNomina) => setBorrador({
    anio: f.anio,
    smmlv: String(Number(f.smmlv)),
    auxilioTransporte: String(Number(f.auxilioTransporte)),
    observaciones: f.observaciones ?? '',
  });

  const guardar = async () => {
    if (!borrador) return;
    if (!borrador.anio || !Number(borrador.smmlv)) {
      toast.error('Indica el año y el salario mínimo');
      return;
    }
    setGuardando(true);
    try {
      await talentoHumanoService.guardarParametros({
        anio: Number(borrador.anio),
        smmlv: borrador.smmlv,
        auxilioTransporte: borrador.auxilioTransporte || '0',
        observaciones: borrador.observaciones || null,
      });
      toast.success(`Parámetros de ${borrador.anio} guardados`);
      setBorrador(null);
      await cargar();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (f: ThParametroNomina) => {
    if (!window.confirm(
      `¿Borrar los parámetros de ${f.anio}? La nómina de ese año se queda sin salario mínimo ni auxilio.`,
    )) return;
    try {
      await talentoHumanoService.borrarParametros(f.anio);
      toast.success(`${f.anio} borrado`);
      await cargar();
    } catch {
      toast.error('No se pudo borrar');
    }
  };

  const set = <K extends keyof BorradorAnio>(k: K, v: BorradorAnio[K]) =>
    setBorrador((b) => (b ? { ...b, [k]: v } : b));

  return (
    <>
      <div className="mb-5 flex items-start gap-4">
        <p className="flex-grow text-sm bg-sky-50 text-sky-900 border border-sky-200 rounded-md px-3 py-2">
          La nómina de un periodo usa los parámetros <strong>del año de ese periodo</strong>, así que
          cargar 2027 no cambia lo que ya se liquidó en 2026.
        </p>
        {!borrador && (
          <Button onClick={nuevo} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Agregar año
          </Button>
        )}
      </div>

      {borrador && (
        <div className="mb-6 bg-white border-2 border-[hsl(var(--canalco-primary))] rounded-xl shadow-sm">
          <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] text-sm font-semibold">
            {filas.some((f) => f.anio === borrador.anio) ? `Editar ${borrador.anio}` : 'Agregar año'}
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-3">
            <Campo
              label="Año"
              value={borrador.anio}
              onChange={(v) => set('anio', v === '' ? '' : Number(v))}
              tipo="number"
              paso="1"
            />
            <Campo
              label="Salario mínimo"
              value={borrador.smmlv}
              onChange={(v) => set('smmlv', v)}
              tipo="number"
              nota="Mensual, sin auxilio de transporte."
            />
            <Campo
              label="Auxilio de transporte"
              value={borrador.auxilioTransporte}
              onChange={(v) => set('auxilioTransporte', v)}
              tipo="number"
              nota="Mensual. Lo recibe quien devenga menos de 2 mínimos."
            />
            <Campo
              label="Observaciones"
              value={borrador.observaciones}
              onChange={(v) => set('observaciones', v)}
              ancho="md:col-span-3"
            />
          </div>
          <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex gap-3">
            <Button onClick={guardar} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
            <Button variant="outline" onClick={() => setBorrador(null)}>Cancelar</Button>
          </footer>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
        </div>
      ) : filas.length === 0 ? (
        <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-10">
          Todavía no hay ningún año cargado.
        </p>
      ) : (
        <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
          <table className="text-sm w-full">
            <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Año</th>
                <th className="px-4 py-2 text-right font-semibold">Salario mínimo</th>
                <th className="px-4 py-2 text-right font-semibold">Auxilio de transporte</th>
                <th className="px-4 py-2 text-left font-semibold">Observaciones</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.parametroId} className="border-t border-[hsl(var(--canalco-neutral-200))]">
                  <td className="px-4 py-2 font-semibold tabular-nums">{f.anio}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{cop(f.smmlv)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{cop(f.auxilioTransporte)}</td>
                  <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-600))] max-w-[220px] truncate" title={f.observaciones ?? ''}>
                    {f.observaciones || '—'}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => editar(f)}>Editar</Button>
                    <Button variant="ghost" size="icon" onClick={() => borrar(f)} title={`Borrar ${f.anio}`}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Catálogo de bancos ──

function SeccionBancos() {
  const [filas, setFilas] = useState<ThBanco[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrador, setBorrador] = useState<BorradorBanco | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      setFilas(await talentoHumanoService.listBancos());
    } catch {
      toast.error('No se pudo cargar el catálogo de bancos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const visibles = useMemo(() => {
    const q = filtro.trim();
    if (!q) return filas;
    const digitos = q.replace(/\D/g, '');
    return filas.filter(
      (b) => (digitos && String(b.codigo).includes(digitos)) || sinTildes(b.nombre).includes(sinTildes(q)),
    );
  }, [filas, filtro]);

  const guardar = async () => {
    if (!borrador) return;
    if (!borrador.codigo || !borrador.nombre.trim()) {
      toast.error('Indica el código y el nombre de la entidad');
      return;
    }
    setGuardando(true);
    try {
      await talentoHumanoService.guardarBanco({
        codigo: Number(borrador.codigo),
        nombre: borrador.nombre.trim(),
        activo: borrador.activo,
      });
      // Cambiar el código de una entidad ya cargada crea otra fila —el upsert es por
      // código—, así que la vieja se borra para no dejar dos veces el mismo banco.
      if (borrador.original && borrador.original !== Number(borrador.codigo)) {
        await talentoHumanoService.borrarBanco(borrador.original);
      }
      toast.success(`${borrador.nombre.trim()} guardado`);
      setBorrador(null);
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (b: ThBanco) => {
    if (!window.confirm(
      `¿Borrar ${b.nombre} del catálogo? Las cuentas que digan ese banco se quedan sin código y no podrán salir en el archivo.`,
    )) return;
    try {
      await talentoHumanoService.borrarBanco(b.codigo);
      toast.success(`${b.nombre} borrado`);
      await cargar();
    } catch {
      toast.error('No se pudo borrar');
    }
  };

  const set = <K extends keyof BorradorBanco>(k: K, v: BorradorBanco[K]) =>
    setBorrador((b) => (b ? { ...b, [k]: v } : b));

  return (
    <>
      <div className="mb-5 flex items-start gap-4">
        <p className="flex-grow text-sm bg-sky-50 text-sky-900 border border-sky-200 rounded-md px-3 py-2">
          El <strong>código</strong> es el que el portal bancario espera en el archivo plano; el nombre
          es el que se escoge en la ficha de cada persona. Si no coinciden, esa cuenta no sale en el
          archivo y se avisa en la solicitud de pago.
        </p>
        {!borrador && (
          <Button onClick={() => setBorrador({ ...BANCO_VACIO })} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Agregar banco
          </Button>
        )}
      </div>

      {borrador && (
        <div className="mb-6 bg-white border-2 border-[hsl(var(--canalco-primary))] rounded-xl shadow-sm">
          <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] text-sm font-semibold">
            {borrador.original ? `Editar ${borrador.nombre}` : 'Agregar banco'}
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-3">
            <Campo
              label="Código"
              value={borrador.codigo}
              onChange={(v) => set('codigo', v === '' ? '' : Number(v))}
              tipo="number"
              paso="1"
              nota="El del archivo del banco."
            />
            <Campo
              label="Entidad"
              value={borrador.nombre}
              onChange={(v) => set('nombre', v)}
              ancho="md:col-span-2"
            />
            <CampoCheck
              label="Activo"
              value={borrador.activo}
              onChange={(v) => set('activo', v)}
              nota="Apágalo si dejó de operar."
            />
          </div>
          <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex gap-3">
            <Button onClick={guardar} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
            <Button variant="outline" onClick={() => setBorrador(null)}>Cancelar</Button>
          </footer>
        </div>
      )}

      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar por código o nombre…"
        className="mb-4 w-full max-w-sm border border-[hsl(var(--canalco-neutral-300))] rounded px-3 py-1.5 text-sm"
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-10">
          {filas.length === 0 ? 'Todavía no hay bancos cargados.' : 'Ningún banco coincide.'}
        </p>
      ) : (
        <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
          <table className="text-sm w-full">
            <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
              <tr>
                <th className="px-4 py-2 text-right font-semibold w-24">Código</th>
                <th className="px-4 py-2 text-left font-semibold">Entidad</th>
                <th className="px-4 py-2 text-left font-semibold w-24">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((b) => (
                <tr
                  key={b.bancoId}
                  className={
                    'border-t border-[hsl(var(--canalco-neutral-200))] ' +
                    (b.activo ? '' : 'text-[hsl(var(--canalco-neutral-400))]')
                  }
                >
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{b.codigo}</td>
                  <td className="px-4 py-2">{b.nombre}</td>
                  <td className="px-4 py-2 text-xs">{b.activo ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBorrador({
                        codigo: b.codigo, nombre: b.nombre, activo: b.activo, original: b.codigo,
                      })}
                    >
                      Editar
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => borrar(b)} title={`Borrar ${b.nombre}`}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-[hsl(var(--canalco-neutral-500))] border-t border-[hsl(var(--canalco-neutral-200))]">
            {visibles.length === filas.length
              ? `${filas.length} entidades`
              : `${visibles.length} de ${filas.length} entidades`}
          </p>
        </div>
      )}
    </>
  );
}
