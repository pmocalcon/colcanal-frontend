import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, CalendarCheck, Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  talentoHumanoService,
  type ThPrestamo,
  type ThPrestamoPago,
} from '@/services/talentoHumano.service';
import { planDeAmortizacion, cuotaActual, type CuotaPlan } from '@/utils/amortizacion';

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

/**
 * Cuántos abonos se aceptan sobre un préstamo en un mismo mes.
 *
 * Espejo de `MAX_ABONOS_POR_MES` en `talento-humano.service.ts`, que es quien lo hace
 * cumplir de verdad: acá solo sirve para apagar el botón y decir por qué antes de que el
 * servidor rechace el guardado.
 */
const MAX_ABONOS_POR_MES = 7;

/** Un mes de la cartera: la cuota que se descontó y los abonos que se le sumaron. */
interface MesDePago {
  clave: string;
  anio: number;
  mes: number;
  /** Lo estipulado que se descontó ese mes. Hay meses de puro abono, sin cuota. */
  cuota: number;
  abonos: ThPrestamoPago[];
  total: number;
}

/**
 * Agrupa los pagos por mes.
 *
 * La cartera se lee por mes, no por movimiento: la pregunta es «en abril, ¿cuánto se le
 * descontó y de dónde salió?», y una lista plana de pagos obliga a sumarlos de a ojo.
 * Los meses van del más viejo al más nuevo, como se pagaron.
 */
const agruparPorMes = (pagos: ThPrestamoPago[] | undefined): MesDePago[] => {
  const porMes = new Map<string, MesDePago>();
  for (const p of pagos ?? []) {
    const clave = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
    const m = porMes.get(clave)
      ?? { clave, anio: p.anio, mes: p.mes, cuota: 0, abonos: [], total: 0 };
    const valor = Number(p.valor) || 0;
    if (p.tipo === 'ABONO') m.abonos.push(p);
    else m.cuota += valor;
    m.total += valor;
    porMes.set(clave, m);
  }
  return [...porMes.values()].sort((a, b) => a.clave.localeCompare(b.clave));
};

/**
 * Un abono nuevo arranca en el mes en curso, que es cuando se está registrando.
 *
 * `medio` decide si además se descuenta por nómina: «NOMINA» se le suma a la cuota de ese
 * mes en la liquidación; «DIRECTO» —consignación, prima, cruce con vacaciones— solo baja
 * el saldo. Es la diferencia que antes obligaba a escribir el total a mano en la hoja.
 */
/**
 * Los meses que tiene sentido escoger para un abono: los seis anteriores y los tres que
 * vienen. Un desplegable acotado evita el abono cargado a 2019 por un dedazo en el año,
 * que es un error que nadie nota hasta que el saldo no cuadra.
 */
const mesesCercanos = () => {
  const hoy = new Date();
  const opciones: { anio: number; mes: number }[] = [];
  for (let i = 3; i >= -6; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    opciones.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
  }
  return opciones;
};

const nuevoAbono = () => {
  const hoy = new Date();
  return {
    anio: hoy.getFullYear(),
    mes: hoy.getMonth() + 1,
    valor: '',
    medio: 'NOMINA',
    observaciones: '',
  };
};

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
  /*
   * Qué se está mirando de cada préstamo desplegado.
   *
   * Arranca en el plan: es la pregunta que más se hace —«¿en qué cuota va y cuánto le
   * falta?»— y hasta ahora había que contar renglones para responderla. Lo descontado
   * sigue a un clic, que es donde se registran y se borran los abonos.
   */
  const [vista, setVista] = useState<Record<number, 'plan' | 'pagos'>>({});

  /** El préstamo al que se le está registrando un abono, y el formulario. */
  const [abonando, setAbonando] = useState<number | null>(null);
  const [abono, setAbono] = useState(nuevoAbono);
  const [guardando, setGuardando] = useState(false);

  /**
   * La fila del plan cuyo descontado se está ajustando (su clave, p. ej. "2026-04"), y el
   * valor en el input. Registra la cuota descontada de ese mes: reemplaza la cuota previa
   * del mes y deja los abonos como estén —esos se mueven con el botón de abonos—.
   */
  const [editandoDescontado, setEditandoDescontado] = useState<string | null>(null);
  const [descontadoInput, setDescontadoInput] = useState('');

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

  /** Vuelve a traer el préstamo y la lista: el saldo y lo descontado cambiaron. */
  const refrescar = async (prestamoId: number) => {
    const [detalle, lista] = await Promise.all([
      talentoHumanoService.getPrestamo(prestamoId),
      talentoHumanoService.listPrestamos(),
    ]);
    setDetalles((d) => ({ ...d, [prestamoId]: detalle }));
    setRows(lista);
  };

  /** Abre el editor en la fila del plan que se tocó, con la cuota descontada del mes. */
  const abrirEdicionDescontado = (clave: string, cuotaDelMes: number) => {
    setEditandoDescontado(clave);
    setDescontadoInput(cuotaDelMes > 0 ? String(cuotaDelMes) : '');
  };

  /**
   * Fija la cuota descontada del mes que se está editando.
   *
   * Reemplaza la cuota previa —borra los pagos de tipo CUOTA de ese mes y registra uno
   * nuevo— y no toca los abonos, que se mueven con su propio botón. Así el número de la
   * columna Descontado queda como el que se escribió más los abonos que hubiera.
   */
  const guardarDescontado = async (prestamoId: number) => {
    if (!editandoDescontado) return;
    const [anio, mes] = editandoDescontado.split('-').map(Number);
    const valor = Number(descontadoInput);
    if (!valor || valor <= 0) {
      toast.error('Indica un valor descontado válido');
      return;
    }
    setGuardando(true);
    try {
      const detalle = detalles[prestamoId];
      const cuotasPrevias = (detalle?.pagos ?? []).filter(
        (g) => g.anio === anio && g.mes === mes && (g.tipo ?? 'CUOTA').toUpperCase() !== 'ABONO',
      );
      for (const cp of cuotasPrevias) {
        await talentoHumanoService.eliminarPago(prestamoId, cp.pagoId);
      }
      await talentoHumanoService.registrarPago(prestamoId, {
        anio, mes, valor, tipo: 'CUOTA', medio: 'NOMINA',
      });
      toast.success('Cuota del mes registrada. Se recalculó el saldo.');
      setEditandoDescontado(null);
      await refrescar(prestamoId);
    } catch {
      toast.error('No se pudo ajustar lo descontado');
    } finally {
      setGuardando(false);
    }
  };

  const registrarAbono = async (prestamoId: number) => {
    if (!Number(abono.valor)) { toast.error('Indica el valor del abono'); return; }
    setGuardando(true);
    try {
      await talentoHumanoService.registrarPago(prestamoId, {
        anio: abono.anio,
        mes: abono.mes,
        valor: abono.valor,
        tipo: 'ABONO',
        medio: abono.medio,
        observaciones: abono.observaciones || null,
      });
      toast.success(
        abono.medio === 'NOMINA'
          ? 'Abono registrado. Se le suma a la cuota de ese mes en la nómina.'
          : 'Abono registrado. Baja el saldo sin pasar por la nómina.',
      );
      setAbonando(null);
      setAbono(nuevoAbono());
      await refrescar(prestamoId);
    } catch {
      toast.error('No se pudo registrar el abono');
    } finally {
      setGuardando(false);
    }
  };

  const borrarPago = async (prestamoId: number, pagoId: number, etiqueta: string) => {
    if (!window.confirm(`¿Borrar el pago de ${etiqueta}? El saldo del préstamo vuelve a subir.`)) return;
    try {
      await talentoHumanoService.eliminarPago(prestamoId, pagoId);
      toast.success('Pago borrado');
      await refrescar(prestamoId);
    } catch {
      toast.error('No se pudo borrar el pago');
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

          {/* El trabajo de todos los meses es este, no abrir un préstamo: va en la
              cabecera y no escondido entre los filtros. */}
          <Button
            onClick={() => navigate('/dashboard/talento-humano/prestamos/cierre')}
            className="bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00] gap-1.5"
          >
            <CalendarCheck className="w-4 h-4" /> Descuento del mes
          </Button>
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
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-auto shadow-sm max-h-[calc(100vh-13rem)]">
            <table className="w-full text-sm min-w-[940px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))] [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
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
                          ) : (
                            <>
                              {(() => {
                                const cual = vista[p.prestamoId] ?? 'plan';
                                const plan = planDeAmortizacion(detalle, detalle.pagos ?? []);
                                // La cuota descontada de cada mes (sin abonos), para prellenar
                                // el editor con lo que hay que corregir y no con el total.
                                const cuotaPorMes = new Map<string, number>();
                                for (const mp of agruparPorMes(detalle.pagos)) {
                                  cuotaPorMes.set(mp.clave, mp.cuota);
                                }
                                return (
                                  <>
                                    <div className="flex gap-1 mb-2">
                                      {([
                                        ['plan', 'Plan de pagos'],
                                        ['pagos', 'Lo descontado'],
                                      ] as const).map(([clave, texto]) => (
                                        <button
                                          key={clave}
                                          onClick={() => setVista((v) => ({ ...v, [p.prestamoId]: clave }))}
                                          className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                                            cual === clave
                                              ? 'bg-white border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                                              : 'bg-transparent border-transparent text-[hsl(var(--canalco-neutral-600))] hover:bg-white'
                                          }`}
                                        >
                                          {texto}
                                        </button>
                                      ))}
                                    </div>

                                    {cual === 'plan' ? (
                                      <TablaAmortizacion
                                        plan={plan}
                                        edicion={{
                                          cuotaPorMes,
                                          editando: editandoDescontado,
                                          input: descontadoInput,
                                          setInput: setDescontadoInput,
                                          guardando,
                                          abrir: abrirEdicionDescontado,
                                          guardar: () => guardarDescontado(p.prestamoId),
                                          cancelar: () => setEditandoDescontado(null),
                                        }}
                                      />
                                    ) : detalle.pagos?.length ? (
                                      <TablaDePagos
                                        meses={agruparPorMes(detalle.pagos)}
                                        onBorrar={(pagoId, etiqueta) => borrarPago(p.prestamoId, pagoId, etiqueta)}
                                      />
                                    ) : (
                                      <span className="text-[hsl(var(--canalco-neutral-500))]">
                                        Todavía no se le ha descontado ninguna cuota.
                                      </span>
                                    )}
                                  </>
                                );
                              })()}

                              {detalle.observaciones && (
                                <p className="mt-2 text-xs text-[hsl(var(--canalco-neutral-600))] italic">
                                  {detalle.observaciones}
                                </p>
                              )}

                              {abonando === p.prestamoId ? (() => {
                                /*
                                 * Cuántos abonos lleva ya el mes que está escogido en el
                                 * formulario. Se cuenta del mes escogido y no del actual
                                 * porque el desplegable deja cargar el abono a otro mes,
                                 * y el tope es de ese mes, no de hoy.
                                 */
                                const enEseMes = (detalle.pagos ?? []).filter(
                                  (g) => g.tipo === 'ABONO' && g.anio === abono.anio && g.mes === abono.mes,
                                ).length;
                                const alTope = enEseMes >= MAX_ABONOS_POR_MES;
                                return (
                                <div className="mt-3 bg-white border border-amber-300 rounded-lg p-3">
                                  <div className="flex flex-wrap items-end gap-3">
                                    <label className="text-xs">
                                      <span className="block font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Valor</span>
                                      <input
                                        type="number"
                                        autoFocus
                                        value={abono.valor}
                                        onChange={(e) => setAbono((a) => ({ ...a, valor: e.target.value }))}
                                        className="border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 w-32 text-right tabular-nums outline-none focus:border-[hsl(var(--canalco-primary))]"
                                      />
                                    </label>
                                    <label className="text-xs">
                                      <span className="block font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Mes</span>
                                      <select
                                        value={abono.anio + '-' + abono.mes}
                                        onChange={(e) => {
                                          const [y, m] = e.target.value.split('-').map(Number);
                                          setAbono((a) => ({ ...a, anio: y, mes: m }));
                                        }}
                                        className="border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
                                      >
                                        {mesesCercanos().map((o) => (
                                          <option key={o.anio + '-' + o.mes} value={o.anio + '-' + o.mes}>
                                            {MESES[o.mes - 1]} {o.anio}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="text-xs">
                                      <span className="block font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Cómo lo paga</span>
                                      <select
                                        value={abono.medio}
                                        onChange={(e) => setAbono((a) => ({ ...a, medio: e.target.value }))}
                                        className="border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
                                      >
                                        <option value="NOMINA">Por nómina</option>
                                        <option value="DIRECTO">Directo (consignación, prima…)</option>
                                      </select>
                                    </label>
                                    <label className="text-xs flex-grow min-w-[180px]">
                                      <span className="block font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Observaciones</span>
                                      <input
                                        value={abono.observaciones}
                                        onChange={(e) => setAbono((a) => ({ ...a, observaciones: e.target.value }))}
                                        className="border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 w-full outline-none focus:border-[hsl(var(--canalco-primary))]"
                                      />
                                    </label>
                                    <Button
                                      size="sm"
                                      disabled={guardando || alTope}
                                      title={alTope
                                        ? `${MESES[abono.mes - 1]} ${abono.anio} ya tiene ${enEseMes} abonos`
                                        : undefined}
                                      onClick={() => registrarAbono(p.prestamoId)}
                                    >
                                      {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setAbonando(null); setAbono(nuevoAbono()); }}>
                                      Cancelar
                                    </Button>
                                  </div>
                                  {alTope ? (
                                    <p className="mt-2 text-[11px] text-amber-800">
                                      {MESES[abono.mes - 1]} {abono.anio} ya tiene {enEseMes} abonos, que es el
                                      tope de {MAX_ABONOS_POR_MES} por mes. Únelos en uno solo, escoge otro mes, o
                                      revisa si alguno quedó repetido.
                                    </p>
                                  ) : (
                                    <p className="mt-2 text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                                      {abono.medio === 'NOMINA'
                                        ? 'Se le suma a la cuota de ' + MESES[abono.mes - 1] + ' ' + abono.anio + ' en la nómina, y baja el saldo.'
                                        : 'Solo baja el saldo. La nómina de ese mes sigue descontando únicamente la cuota.'}
                                      {enEseMes > 0 && ` Lleva ${enEseMes} de ${MAX_ABONOS_POR_MES} abonos ese mes.`}
                                    </p>
                                  )}
                                </div>
                                );
                              })() : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 gap-1.5"
                                  onClick={() => { setAbonando(p.prestamoId); setAbono(nuevoAbono()); }}
                                >
                                  <Plus className="w-3.5 h-3.5" /> Registrar abono
                                </Button>
                              )}
                            </>
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
/**
 * El plan de pagos del préstamo, con lo que de verdad se descontó al lado.
 *
 * **Sin intereses**: estos préstamos no los cobran, así que no hay una columna de
 * intereses en cero fingiendo una amortización de banco. Lo que se amortiza es capital, y
 * lo que interesa es el calendario: qué mes toca cuánto, qué se descontó y cómo va el
 * saldo.
 *
 * Las dos columnas de saldo son distintas a propósito. «Saldo plan» es lo que debería
 * quedar si todo se pagara al día; «saldo real» es lo que queda con lo que se ha pagado.
 * Cuando se separan, ahí está el atraso o el adelanto, y se ve en qué mes empezó.
 */
/** Lo necesario para ajustar la cuota descontada de un mes desde el plan. */
interface EdicionDescontado {
  /** La cuota descontada de cada mes (sin abonos), por clave, para prellenar el input. */
  cuotaPorMes: Map<string, number>;
  /** La clave de la fila en edición, o null. */
  editando: string | null;
  input: string;
  setInput: (v: string) => void;
  guardando: boolean;
  abrir: (clave: string, cuotaDelMes: number) => void;
  guardar: () => void;
  cancelar: () => void;
}

function TablaAmortizacion({
  plan,
  edicion,
}: {
  plan: ReturnType<typeof planDeAmortizacion>;
  edicion: EdicionDescontado;
}) {
  if (plan.problema) {
    return (
      <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg px-3 py-3 text-xs">
        <p className="text-[hsl(var(--canalco-neutral-700))]">
          No se puede armar el plan: {plan.problema}
        </p>
        {plan.totalPagado > 0 && (
          <p className="mt-1 text-[hsl(var(--canalco-neutral-500))]">
            Se le han descontado {cop(plan.totalPagado)}. Completa la ficha del préstamo y el
            plan sale solo.
          </p>
        )}
      </div>
    );
  }

  const van = cuotaActual(plan);
  const ultima = plan.cuotas[plan.cuotas.length - 1];
  // Con el plan corrido, «va en la cuota N» se queda corto: puede haber descuentos
  // posteriores que no caen en ninguna cuota. Lo que no se equivoca es si ya se pagó todo.
  const saldado = plan.totalPlan > 0 && plan.totalPagado >= plan.totalPlan;

  return (
    <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
      {plan.avisos.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
          {plan.avisos.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}

      <div className="px-3 py-2 border-b border-[hsl(var(--canalco-neutral-200))] text-[11px] text-[hsl(var(--canalco-neutral-600))] flex flex-wrap gap-x-4 gap-y-1">
        {saldado ? (
          <span className="text-emerald-800 font-semibold">
            Saldado: se descontó todo el préstamo.
          </span>
        ) : (
          <span>
            Va en la cuota <strong className="text-[hsl(var(--canalco-neutral-900))]">{van}</strong> de {plan.cuotas.length}
          </span>
        )}
        <span>Descontado <strong className="text-emerald-800">{cop(plan.totalPagado)}</strong></span>
        {ultima && (
          <span>
            Última cuota <strong className="text-[hsl(var(--canalco-neutral-900))]">
              {MESES[ultima.mes - 1]} {ultima.anio}
            </strong>
          </span>
        )}
        <span className="text-[hsl(var(--canalco-neutral-400))]">Sin intereses: se amortiza capital.</span>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))] sticky top-0">
            <tr>
              <th className="px-3 py-1.5 text-right font-semibold w-10">#</th>
              <th className="px-3 py-1.5 text-left font-semibold w-24">Mes</th>
              <th className="px-3 py-1.5 text-right font-semibold w-28">Cuota</th>
              <th className="px-3 py-1.5 text-right font-semibold w-28">Descontado</th>
              <th className="px-3 py-1.5 text-right font-semibold w-28">Saldo plan</th>
              <th className="px-3 py-1.5 text-right font-semibold w-28">Saldo real</th>
            </tr>
          </thead>
          <tbody>
            {plan.cuotas.map((c) => (
              <RenglonCuota key={c.clave} c={c} edicion={edicion} />
            ))}

            {plan.fueraDePlan.length > 0 && (
              <tr className="border-t border-amber-300 bg-amber-100/70">
                <td className="px-3 py-1.5 text-[11px] text-amber-900" colSpan={3}>
                  Fuera del plan: {plan.fueraDePlan.length}{' '}
                  {plan.fueraDePlan.length === 1 ? 'mes con descuento' : 'meses con descuento'}{' '}
                  que el calendario no contempla
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-amber-900 font-semibold">
                  {cop(plan.totalFueraDePlan)}
                </td>
                <td className="px-3 py-1.5" colSpan={2} />
              </tr>
            )}

            {plan.fueraDePlan.map((f) => (
              <tr key={f.clave} className="border-t border-[hsl(var(--canalco-neutral-200))] bg-amber-50/50">
                <td className="px-3 py-1.5 text-right text-[hsl(var(--canalco-neutral-400))]">—</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{MESES[f.mes - 1]} {f.anio}</td>
                <td className="px-3 py-1.5 text-right text-[hsl(var(--canalco-neutral-400))]">
                  fuera del plan
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-800">{cop(f.pagado)}</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
            <tr className="border-t border-[hsl(var(--canalco-neutral-300))]">
              <td className="px-3 py-1.5" colSpan={2}>
                {plan.cuotas.length} {plan.cuotas.length === 1 ? 'cuota' : 'cuotas'}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{cop(plan.totalPlan)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-emerald-800">{cop(plan.totalPagado)}</td>
              <td className="px-3 py-1.5" />
              <td className="px-3 py-1.5 text-right tabular-nums text-[hsl(var(--canalco-primary))]">
                {cop(Math.max(plan.totalPlan - plan.totalPagado, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Los cuatro estados de una cuota, cada uno con su color y su palabra. */
const ESTADO_CUOTA = {
  pagada: { fila: '', texto: 'text-emerald-800', etiqueta: '' },
  parcial: { fila: 'bg-amber-50/60', texto: 'text-amber-800', etiqueta: 'parcial' },
  'de-mas': { fila: 'bg-emerald-50/60', texto: 'text-emerald-800', etiqueta: 'de más' },
  pendiente: { fila: '', texto: 'text-[hsl(var(--canalco-neutral-400))]', etiqueta: '' },
} as const;

function RenglonCuota({ c, edicion }: { c: CuotaPlan; edicion: EdicionDescontado }) {
  const e = ESTADO_CUOTA[c.estado];
  const enEdicion = edicion.editando === c.clave;

  return (
    <tr className={`border-t border-[hsl(var(--canalco-neutral-200))] ${e.fila}`}>
      <td className="px-3 py-1.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">
        {c.numero}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">{MESES[c.mes - 1]} {c.anio}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{cop(c.cuota)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${e.texto}`}>
        {enEdicion ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              autoFocus
              value={edicion.input}
              onChange={(ev) => edicion.setInput(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') edicion.guardar();
                if (ev.key === 'Escape') edicion.cancelar();
              }}
              className="w-24 rounded border border-[hsl(var(--canalco-neutral-300))] px-2 py-0.5 text-right text-sm"
            />
            <button
              onClick={edicion.guardar}
              disabled={edicion.guardando}
              title="Guardar la cuota descontada del mes"
              className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={edicion.cancelar}
              title="Cancelar"
              className="text-[hsl(var(--canalco-neutral-400))] hover:text-[hsl(var(--canalco-neutral-700))]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center justify-end gap-1.5">
            {c.pagado > 0 ? cop(c.pagado) : '—'}
            {e.etiqueta && <span className="text-[10px]">{e.etiqueta}</span>}
            <button
              onClick={() => edicion.abrir(c.clave, edicion.cuotaPorMes.get(c.clave) ?? 0)}
              title="Ajustar la cuota descontada de este mes (los abonos no se tocan)"
              className="text-[hsl(var(--canalco-neutral-300))] hover:text-[hsl(var(--canalco-primary))] transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-[hsl(var(--canalco-neutral-500))]">
        {cop(c.saldoPlan)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {/* Pasado el último pago no hay saldo real que mostrar: nadie ha pagado todavía. */}
        {c.conHistoria
          ? <span className={c.saldoReal > c.saldoPlan ? 'text-[hsl(var(--canalco-primary))]' : ''}>
              {cop(Math.max(c.saldoReal, 0))}
            </span>
          : <span className="text-[hsl(var(--canalco-neutral-300))]">—</span>}
      </td>
    </tr>
  );
}

/**
 * Los descuentos del préstamo, un renglón por mes.
 *
 * Antes eran píldoras sueltas, una por movimiento, y un mes con cuota más tres abonos
 * salían como cuatro fichas separadas que había que sumar de a ojo. Acá la pregunta que
 * se hace de verdad —«en abril, ¿cuánto se le descontó y de dónde salió?»— se responde
 * leyendo un renglón.
 *
 * La cuota y los abonos van en columnas distintas a propósito: la cuota la pone el
 * sistema mes a mes y los abonos los registra alguien, así que cuando el saldo no cuadra
 * lo primero es saber cuál de las dos mover.
 */
function TablaDePagos({ meses, onBorrar }: {
  meses: MesDePago[];
  onBorrar: (pagoId: number, etiqueta: string) => void;
}) {
  const totalCuotas = meses.reduce((s, m) => s + m.cuota, 0);
  const totalAbonos = meses.reduce(
    (s, m) => s + m.abonos.reduce((a, b) => a + (Number(b.valor) || 0), 0),
    0,
  );
  const total = totalCuotas + totalAbonos;

  return (
    <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold w-24">Mes</th>
            <th className="px-3 py-1.5 text-right font-semibold w-32">Cuota</th>
            <th className="px-3 py-1.5 text-left font-semibold">Abonos del mes</th>
            <th className="px-3 py-1.5 text-right font-semibold w-32">Total del mes</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => {
            const alTope = m.abonos.length >= MAX_ABONOS_POR_MES;
            return (
              <tr key={m.clave} className="border-t border-[hsl(var(--canalco-neutral-200))] align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {MESES[m.mes - 1]} {m.anio}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.cuota > 0
                    ? cop(m.cuota)
                    : <span className="text-[hsl(var(--canalco-neutral-400))]">—</span>}
                </td>
                <td className="px-3 py-2">
                  {m.abonos.length === 0 ? (
                    <span className="text-[hsl(var(--canalco-neutral-400))]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {m.abonos.map((a) => (
                        <span
                          key={a.pagoId}
                          title={a.observaciones ?? undefined}
                          className="group inline-flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-900 rounded px-1.5 py-0.5 tabular-nums"
                        >
                          <span className="font-medium">{cop(a.valor)}</span>
                          <span className="text-amber-700 text-[11px]">
                            {a.medio === 'DIRECTO' ? 'directo' : 'nómina'}
                          </span>
                          <button
                            onClick={() => onBorrar(a.pagoId, MESES[m.mes - 1] + ' ' + m.anio)}
                            title="Borrar este abono"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </button>
                        </span>
                      ))}
                      {/* El tope se avisa donde se ve el mes lleno, no solo al intentar guardar. */}
                      {alTope && (
                        <span className="text-[11px] text-amber-700 self-center">
                          tope de {MAX_ABONOS_POR_MES}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(m.total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
          <tr className="border-t border-[hsl(var(--canalco-neutral-300))]">
            <td className="px-3 py-1.5">{meses.length} {meses.length === 1 ? 'mes' : 'meses'}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{cop(totalCuotas)}</td>
            <td className="px-3 py-1.5 tabular-nums text-amber-800">
              {totalAbonos > 0 ? cop(totalAbonos) + ' en abonos' : ''}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{cop(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
