import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CalendarCheck, Check, Loader2, Save, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  talentoHumanoService,
  type FilaCierrePrestamo,
} from '@/services/talentoHumano.service';

/**
 * El descuento del mes de toda la cartera, en una sola tabla.
 *
 * Es la columna del Excel, pero dentro del sistema. La pantalla de préstamos deja
 * registrar lo descontado préstamo por préstamo, y con cincuenta y dos activos eso son
 * cincuenta y dos aperturas cada mes: por eso la cartera se seguía llevando en la hoja.
 * Acá se abre el mes, se corrige lo que cambió y se guarda todo de una vez.
 *
 * Se puede volver a entrar al mismo mes: lo ya guardado vuelve prellenado y se puede
 * subir, bajar o poner en cero. Un cero borra la cuota y le devuelve la plata al saldo.
 *
 * Los abonos extraordinarios no se editan acá —se ven, para saber por qué a alguien le
 * bajó más el saldo—: cada uno lleva su medio y su observación, y eso no cabe en una
 * casilla de un solo número. Se siguen registrando en la ficha del préstamo.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Los meses que se pueden cerrar: el actual y los doce anteriores.
 *
 * Hacia atrás, porque el cierre casi siempre se hace del mes que acaba de pasar. Hacia
 * adelante no: descontar en un mes que todavía no llega es un dedazo, no una intención.
 */
const mesesElegibles = () => {
  const hoy = new Date();
  const opciones: { anio: number; mes: number }[] = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    opciones.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
  }
  return opciones;
};

const cop = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');

/** Deja solo dígitos: la casilla recibe pesos, no fórmulas. */
const soloNumero = (v: string) => v.replace(/[^\d]/g, '');

export default function CierrePrestamosPage() {
  const navigate = useNavigate();
  const opciones = useMemo(mesesElegibles, []);
  const [anio, setAnio] = useState(opciones[0].anio);
  const [mes, setMes] = useState(opciones[0].mes);

  const [filas, setFilas] = useState<FilaCierrePrestamo[]>([]);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (a: number, m: number) => {
    setLoading(true);
    try {
      const data = await talentoHumanoService.cierrePrestamos(a, m);
      setFilas(data);
      // Arranca con lo sugerido: lo ya guardado del mes si se está reabriendo, y si no
      // la cuota que corresponde. Así el caso normal es revisar y guardar.
      setValores(Object.fromEntries(data.map((f) => [f.prestamoId, String(f.sugerido || 0)])));
    } catch {
      toast.error('No se pudo cargar el mes');
      setFilas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(anio, mes); }, [anio, mes, cargar]);

  const valorDe = (f: FilaCierrePrestamo) => Number(valores[f.prestamoId] ?? 0) || 0;
  const seExcede = (f: FilaCierrePrestamo) => valorDe(f) > f.disponible + 0.5;

  const total = useMemo(
    () => filas.reduce((s, f) => s + valorDe(f), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, valores],
  );
  const excedidos = useMemo(() => filas.filter(seExcede).length, [filas, valores]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiados = useMemo(
    () => filas.filter((f) => Math.abs(valorDe(f) - f.yaDescontado) >= 1).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, valores],
  );

  const guardar = async () => {
    if (excedidos > 0) {
      toast.error('Hay descuentos por encima de lo que la persona debe');
      return;
    }
    setGuardando(true);
    try {
      const r = await talentoHumanoService.guardarCierrePrestamos(
        anio,
        mes,
        filas.map((f) => ({ prestamoId: f.prestamoId, valor: valorDe(f) })),
      );
      toast.success(
        r.prestamos === 0
          ? 'No había nada que cambiar'
          : `${r.prestamos} préstamo${r.prestamos === 1 ? '' : 's'} · ${cop(r.total)} descontados en ${MESES[mes - 1]}`,
      );
      await cargar(anio, mes);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar el mes');
    } finally {
      setGuardando(false);
    }
  };

  const ponerSugeridas = () =>
    setValores(Object.fromEntries(filas.map((f) => [f.prestamoId, String(f.sugerido || 0)])));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white pb-32">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard/talento-humano/prestamos')}
            title="Volver a Préstamos"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              Descuento del mes
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading
                ? 'Cargando…'
                : `${filas.length} préstamos con saldo · ${cambiados} por cambiar`}
            </p>
          </div>

          <select
            value={`${anio}-${mes}`}
            onChange={(e) => {
              const [a, m] = e.target.value.split('-').map(Number);
              setAnio(a);
              setMes(m);
            }}
            className="px-3 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            {opciones.map((o) => (
              <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
                {MESES[o.mes - 1]} {o.anio}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center gap-2 text-[hsl(var(--canalco-neutral-600))]">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando el mes…
          </div>
        ) : filas.length === 0 ? (
          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
            No hay préstamos con saldo. Nada que descontar en {MESES[mes - 1]} de {anio}.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={ponerSugeridas} className="gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> Poner la cuota que corresponde
              </Button>
              <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                Vuelve a dejar cada casilla en la cuota del préstamo, o en el saldo cuando
                es la última.
              </span>
            </div>

            <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left">
                    <th className="px-4 py-2.5 font-semibold">Empleado</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Saldo</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Cuota</th>
                    <th className="px-3 py-2.5 font-semibold text-right w-40">Descontar</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Abonos</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Queda debiendo</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const valor = valorDe(f);
                    const queda = f.disponible - valor;
                    const excede = seExcede(f);
                    return (
                      <tr
                        key={f.prestamoId}
                        className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))]/60"
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                            {f.nombre}
                          </div>
                          <div className="text-xs text-[hsl(var(--canalco-neutral-500))] flex flex-wrap items-center gap-2">
                            {f.identificacion && <span>C.C. {f.identificacion}</span>}
                            {f.proyecto && <span>· {f.proyecto}</span>}
                            {/* La nómina busca el préstamo por este nombre: sin él, el
                                descuento queda registrado en la cartera pero no se le
                                descuenta a la persona. Es el mecanismo con el que
                                Contabilidad deja un préstamo quieto, así que se avisa
                                sin estorbar. */}
                            {!f.nombreNomina && (
                              <span className="text-amber-700">· sin nombre en nómina</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{cop(f.disponible)}</td>
                        {/* La cuota pactada; si el préstamo vino sin una —los del
                            archivo histórico—, lo último que se le descontó. */}
                        <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">
                          {cop(Number(f.cuotaDescontar ?? f.valorCuota ?? 0) || f.ultimaCuota)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            value={valores[f.prestamoId] ?? ''}
                            onChange={(e) =>
                              setValores((v) => ({
                                ...v,
                                [f.prestamoId]: soloNumero(e.target.value),
                              }))
                            }
                            inputMode="numeric"
                            className={`w-32 px-2 py-1 text-right tabular-nums border rounded-md outline-none ${
                              excede
                                ? 'border-red-400 bg-red-50 text-red-800'
                                : 'border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))]'
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">
                          {f.abonos ? cop(f.abonos) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {excede ? (
                            <span className="inline-flex items-center gap-1 text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> debe {cop(f.disponible)}
                            </span>
                          ) : queda <= 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <Check className="w-3.5 h-3.5" /> queda saldado
                            </span>
                          ) : (
                            cop(queda)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* El pie va fijo: la tabla es larga y el total es lo que se revisa antes de
          guardar; obligar a bajar hasta el final para verlo invita a guardar sin mirarlo. */}
      {!loading && filas.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-[hsl(var(--canalco-neutral-300))] shadow-[0_-2px_10px_rgba(0,0,0,.05)]">
          <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-4">
            <div>
              <span className="text-xs text-[hsl(var(--canalco-neutral-500))] block">
                Total a descontar en {MESES[mes - 1]} de {anio}
              </span>
              <span className="text-lg font-bold tabular-nums text-[hsl(var(--canalco-primary))]">
                {cop(total)}
              </span>
            </div>
            {excedidos > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4" />
                {excedidos} descuento{excedidos === 1 ? '' : 's'} por encima de lo que se debe
              </span>
            )}
            <div className="flex-grow" />
            <Button
              onClick={guardar}
              disabled={guardando || excedidos > 0 || cambiados === 0}
              className="bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00] gap-1.5"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {cambiados === 0 ? 'Nada que guardar' : `Guardar el mes (${cambiados})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
