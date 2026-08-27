import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Campo, Selector } from '@/components/talentoHumano/campos';
import { nominaService } from '@/services/nomina.service';
import {
  talentoHumanoService, puedeVerSolicitudesPago, type ThSolicitudPagoResumen,
} from '@/services/talentoHumano.service';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Solicitudes de pago: el listado.
 *
 * Reemplaza el libro «Nómina Banco Formato.xlsm», que era un archivo suelto por mes y del
 * que había que acordarse de guardar una copia antes de pisarlo con el mes siguiente.
 *
 * Una solicitud es el documento con el que se le pide a Tesorería que disperse. De ella
 * salen las dos hojas que antes se llenaban a mano: la solicitud en sí y el archivo plano
 * que se sube al portal bancario — que no es otro documento, sino el mismo con las
 * columnas que el banco pide.
 *
 * Ruta: `.../talento-humano/pagos`.
 */

const cop = (v: number) => (v ? '$' + Math.round(v).toLocaleString('es-CO') : '—');

const fecha = (f: string | null) => {
  if (!f) return '—';
  const [a, m, d] = f.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const nombrePeriodo = (p: string | null) => {
  if (!p) return '—';
  const [a, m] = p.split('-');
  return `${MESES[Number(m) - 1] ?? m} de ${a}`;
};

const COLOR_ESTADO: Record<string, string> = {
  BORRADOR: 'bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]',
  ENVIADA: 'bg-amber-100 text-amber-900',
  PAGADA: 'bg-emerald-100 text-emerald-900',
};

type Borrador = { fecha: string; concepto: string; periodo: string; observaciones: string };

export default function SolicitudesPagoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEntrar = puedeVerSolicitudesPago(user?.nombreRol, user?.nombre);
  const [filas, setFilas] = useState<ThSolicitudPagoResumen[]>([]);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setFilas(await talentoHumanoService.listSolicitudesPago());
    } catch {
      toast.error('No se pudieron cargar las solicitudes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
    nominaService.listPeriodos().then(setPeriodos).catch(() => setPeriodos([]));
  }, []);

  const total = useMemo(() => filas.reduce((s, f) => s + f.total, 0), [filas]);

  const nueva = () => setBorrador({
    fecha: new Date().toISOString().slice(0, 10),
    concepto: 'Nómina',
    periodo: periodos[0] ?? '',
    observaciones: '',
  });

  const crear = async () => {
    if (!borrador) return;
    setGuardando(true);
    try {
      const { solicitud } = await talentoHumanoService.crearSolicitudPago({
        fecha: borrador.fecha,
        concepto: borrador.concepto,
        periodo: borrador.periodo || null,
        observaciones: borrador.observaciones || null,
      });
      setBorrador(null);
      // Se entra derecho al detalle: lo que sigue siempre es revisar las líneas.
      navigate(`/dashboard/talento-humano/pagos/${solicitud.solicitudId}`);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo crear la solicitud');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (f: ThSolicitudPagoResumen) => {
    if (!window.confirm(
      `¿Borrar la solicitud del ${fecha(f.fecha)}? Se van también sus ${f.lineas} líneas.`,
    )) return;
    try {
      await talentoHumanoService.borrarSolicitudPago(f.solicitudId);
      toast.success('Solicitud borrada');
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo borrar');
    }
  };

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setBorrador((b) => (b ? { ...b, [k]: v } : b));

  if (!puedeEntrar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">
            Solicitudes de pago
          </h1>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Acá está el archivo que se sube al portal bancario, con la cuenta de cada
            empleado. Lo lleva la Coordinación Financiera que hace el giro. Si necesitas
            algo de aquí, pídeselo.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => navigate('/dashboard/talento-humano')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Solicitudes de pago
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              El documento con el que se pide el giro y el archivo que se sube al banco
            </p>
          </div>
          {!borrador && (
            <Button onClick={nueva} className="gap-2">
              <Plus className="w-4 h-4" /> Nueva solicitud
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6">
        {borrador && (
          <div className="mb-6 bg-white border-2 border-[hsl(var(--canalco-primary))] rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] text-sm font-semibold">
              Nueva solicitud
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-3">
              <Campo label="Fecha" value={borrador.fecha} onChange={(v) => set('fecha', v)} tipo="date" />
              <Campo label="Concepto" value={borrador.concepto} onChange={(v) => set('concepto', v)} />
              <Selector
                label="Periodo de nómina"
                value={borrador.periodo}
                opciones={periodos}
                onChange={(v) => set('periodo', v)}
                vacio="Ninguno — la armo a mano"
                nota="Si escoges uno, se llena con el neto a pagar de cada empleado."
              />
              <Campo
                label="Observaciones"
                value={borrador.observaciones}
                onChange={(v) => set('observaciones', v)}
              />
            </div>
            <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex gap-3">
              <Button onClick={crear} disabled={guardando} className="gap-2">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Crear
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
          <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-12">
            Todavía no hay ninguna solicitud de pago.
          </p>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="text-sm w-full">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-2 text-left font-semibold">Concepto</th>
                  <th className="px-4 py-2 text-left font-semibold">Periodo</th>
                  <th className="px-4 py-2 text-right font-semibold">Personas</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                  <th className="px-4 py-2 text-left font-semibold">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.solicitudId}
                    className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-50))] cursor-pointer"
                    onClick={() => navigate(`/dashboard/talento-humano/pagos/${f.solicitudId}`)}
                  >
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fecha(f.fecha)}</td>
                    <td className="px-4 py-2">{f.concepto}</td>
                    <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-600))]">{nombrePeriodo(f.periodo)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{f.lineas}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{cop(f.total)}</td>
                    <td className="px-4 py-2">
                      <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (COLOR_ESTADO[f.estado] ?? '')}>
                        {f.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {f.estado === 'BORRADOR' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); void borrar(f); }}
                          title="Borrar solicitud"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
                <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                  <td className="px-4 py-2" colSpan={4}>{filas.length} solicitudes</td>
                  <td className="px-4 py-2 text-right tabular-nums">{cop(total)}</td>
                  <td className="px-4 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
