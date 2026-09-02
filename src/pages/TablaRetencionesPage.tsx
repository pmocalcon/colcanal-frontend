import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Search, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  talentoHumanoService,
  type ThRetencionFila,
  type ThParametroNomina,
} from '@/services/talentoHumano.service';
import { nominaService } from '@/services/nomina.service';
import {
  calcularRetencion,
  fichaDesde,
  pesos,
  porcentaje,
  enPesos,
  TOPES_UVT,
  type DetalleRetencion,
  type BaseRetencion,
} from '@/utils/retencionFuente';

/**
 * Tabla de retenciones — lo que cada persona puede restar de su base gravable durante
 * el año (Procedimiento 1, Art. 383 E.T.).
 *
 * Es anual, como el certificado de deducciones que el empleado entrega en enero y que
 * es el soporte de estas cifras. Alimenta la columna Retefuente de la liquidación: la
 * nómina calcula con la ficha del año del periodo y lo digitado a mano manda.
 *
 * Los aportes obligatorios —salud, pensión y fondo de solidaridad— NO se diligencian
 * aquí: son los ingresos no constitutivos de renta y la nómina ya los calcula. Volver
 * a escribirlos sería tener la misma cifra en dos sitios.
 */

const anioActual = new Date().getFullYear();
const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/**
 * Hay DOS orígenes de cifras y se leen distinto; confundirlos multiplica o divide por
 * mil sin que nada falle:
 *
 *   deDb    — lo que devuelve la base. TypeORM entrega los `numeric` como «790195.00»,
 *             donde el punto es el DECIMAL.
 *   pesos() — lo que escribe una persona. Acá el punto es el separador de MILES:
 *             «790.195» son setecientos noventa mil.
 */
const deDb = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Los campos editables de una fila, como texto: es lo que hay en las casillas. */
interface Borrador {
  viviendaModo: 'FIJO' | 'PORCENTAJE';
  viviendaValor: string;
  viviendaPorcentaje: string;
  dependientes: string;
  medicinaPrepagada: string;
  pensionesVoluntarias: string;
  afc: string;
  sujeto: boolean;
}

/**
 * La ficha guardada a lo que se ve en las casillas. El dinero se muestra ya formateado
 * («790.195»), que es como se va a volver a leer al guardar: así lo que está en pantalla
 * y lo que entiende el sistema son lo mismo.
 */
const borradorDe = (f: ThRetencionFila): Borrador => ({
  viviendaModo: f.ficha?.viviendaModo === 'PORCENTAJE' ? 'PORCENTAJE' : 'FIJO',
  viviendaValor: enPesos(deDb(f.ficha?.viviendaValor)),
  viviendaPorcentaje: f.ficha && deDb(f.ficha.viviendaPorcentaje) ? String(deDb(f.ficha.viviendaPorcentaje)) : '',
  dependientes: enPesos(deDb(f.ficha?.dependientes)),
  medicinaPrepagada: enPesos(deDb(f.ficha?.medicinaPrepagada)),
  pensionesVoluntarias: enPesos(deDb(f.ficha?.pensionesVoluntarias)),
  afc: enPesos(deDb(f.ficha?.afc)),
  sujeto: f.ficha ? f.ficha.sujeto !== false : true,
});

export default function TablaRetencionesPage() {
  const navigate = useNavigate();
  const [anio, setAnio] = useState(anioActual);
  const [filas, setFilas] = useState<ThRetencionFila[]>([]);
  const [parametro, setParametro] = useState<ThParametroNomina | null>(null);
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloRetienen, setSoloRetienen] = useState(false);
  const [detalleDe, setDetalleDe] = useState<ThRetencionFila | null>(null);
  /**
   * Sobre qué mes se estima. La retención se liquida contra el TOTAL DEVENGADO del
   * periodo —básico más extras, recargos, bonificaciones y auxilios—, no contra el
   * sueldo: son cifras distintas y la diferencia cambia el tramo de la tabla.
   */
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [bases, setBases] = useState<Map<number, BaseRetencion>>(new Map());

  const uvt = deDb(parametro?.uvt);

  const cargar = async (a: number) => {
    setLoading(true);
    try {
      const [f, p] = await Promise.all([
        talentoHumanoService.listRetenciones(a),
        talentoHumanoService.getParametros(a),
      ]);
      setFilas(f);
      setParametro(p);
      setBorradores(Object.fromEntries(f.map((x) => [x.personaId, borradorDe(x)])));
    } catch {
      toast.error('No se pudo cargar la tabla de retenciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(anio); }, [anio]);

  /*
   * Las bases salen de la vista previa de la nómina del periodo, que ya trae el
   * devengado y los tres aportes obligatorios calculados por el backend. Así la
   * estimación usa exactamente las mismas cifras con las que se va a liquidar, en vez
   * de una aproximación sobre el sueldo.
   */
  useEffect(() => {
    const smmlv = deDb(parametro?.smmlv);
    const aux = deDb(parametro?.auxilioTransporte);
    if (!periodo || !smmlv) { setBases(new Map()); return; }
    let cancelado = false;
    nominaService
      .getNomina(periodo, smmlv, aux)
      .then(({ filas }) => {
        if (cancelado) return;
        setBases(new Map(filas.map((f) => [f.personaId, {
          totalDevengado: f.totalDevengado, salud: f.salud, pension: f.pension, fsp: f.fsp,
        }])));
      })
      .catch(() => { if (!cancelado) setBases(new Map()); });
    return () => { cancelado = true; };
  }, [periodo, parametro]);

  const set = (personaId: number, campo: keyof Borrador, valor: string | boolean) =>
    setBorradores((prev) => ({
      ...prev,
      [personaId]: { ...prev[personaId], [campo]: valor } as Borrador,
    }));

  const guardar = async (fila: ThRetencionFila) => {
    const b = borradores[fila.personaId];
    if (!b) return;
    setGuardando(fila.personaId);
    try {
      await talentoHumanoService.guardarRetencion({
        personaId: fila.personaId,
        anio,
        viviendaModo: b.viviendaModo,
        viviendaValor: String(pesos(b.viviendaValor)),
        viviendaPorcentaje: String(porcentaje(b.viviendaPorcentaje)),
        dependientes: String(pesos(b.dependientes)),
        medicinaPrepagada: String(pesos(b.medicinaPrepagada)),
        pensionesVoluntarias: String(pesos(b.pensionesVoluntarias)),
        afc: String(pesos(b.afc)),
        sujeto: b.sujeto,
      });
      toast.success(`Ficha de ${fila.nombre} guardada`);
      await cargar(anio);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar la ficha');
    } finally {
      setGuardando(null);
    }
  };

  /**
   * La base del cálculo: el total devengado del periodo y los tres aportes obligatorios,
   * tal como los liquida la nómina.
   *
   * Si la persona no aparece en ese periodo —entró después, o el mes no tiene novedades—
   * se cae al sueldo con los aportes de ley, que es una aproximación y así se dice en
   * pantalla. Sin este respaldo la fila quedaría en cero y parecería que no retiene.
   */
  const baseDe = (fila: ThRetencionFila): { base: BaseRetencion; real: boolean } => {
    const real = bases.get(fila.personaId);
    if (real) return { base: real, real: true };
    const salario = deDb(fila.salario);
    return {
      base: { totalDevengado: salario, salud: salario * 0.04, pension: salario * 0.04, fsp: 0 },
      real: false,
    };
  };

  /** La retención que le saldría con lo que hay en pantalla, sin tener que guardarlo. */
  const estimar = (fila: ThRetencionFila): DetalleRetencion => {
    const b = borradores[fila.personaId];
    return calcularRetencion(
      baseDe(fila).base,
      b ? fichaDesde(b) : fichaDesde(borradorDe(fila)),
      uvt,
    );
  };

  /**
   * La retención de todos, en una sola pasada. Se calcula acá y no dentro de la fila
   * porque el filtro y el resumen la necesitan antes de pintar: quién retiene no es una
   * lista aparte que haya que mantener, sale del propio cálculo.
   */
  const retenciones = useMemo(
    () => new Map(filas.map((f) => [f.personaId, estimar(f).retencion])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, borradores, bases, uvt],
  );
  const retienen = filas.filter((f) => (retenciones.get(f.personaId) ?? 0) > 0);
  const totalRetenido = retienen.reduce((s, f) => s + (retenciones.get(f.personaId) ?? 0), 0);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas
      .filter((f) => (soloRetienen ? (retenciones.get(f.personaId) ?? 0) > 0 : true))
      .filter((f) => (!q ? true : f.nombre.toLowerCase().includes(q) || f.identificacion.includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, soloRetienen, retenciones]);

  const conFicha = filas.filter((f) => f.ficha).length;

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Tabla de retenciones</h1>
            <div className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Deducciones y rentas exentas de cada persona · Procedimiento 1 (Art. 383 E.T.)
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))]">Año</label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg px-2 py-1.5 text-sm"
            >
              {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {/* La ficha es anual; el mes solo dice sobre qué devengado se estima. */}
            <label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] ml-2" title="Sobre el devengado de qué mes se estima la retención">
              Estimar sobre
            </label>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Sin UVT no hay retención posible: se dice de una vez y con el camino para arreglarlo. */}
        {!loading && uvt <= 0 && (
          <div className="mb-4 flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 mt-0.5 flex-none" />
            <span>
              El año {anio} no tiene UVT cargada, así que la retención sale en cero para todos.
              Cárgala en{' '}
              <button className="underline font-semibold" onClick={() => navigate('/dashboard/talento-humano/parametros')}>
                Parámetros
              </button>
              , junto al salario mínimo.
            </span>
          </div>
        )}

        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o cédula"
              className="pl-8 pr-3 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-lg w-72"
            />
          </div>
          <button
            onClick={() => setSoloRetienen((v) => !v)}
            className={'text-xs font-medium rounded-lg border px-3 py-1.5 transition-colors '
              + (soloRetienen
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]')}
            title="Solo quienes pasan las 95 UVT de base gravable"
          >
            Solo los que retienen ({retienen.length})
          </button>
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            {filas.length} persona(s) · {conFicha} con ficha
            {uvt > 0 && <> · UVT {anio}: {cop(uvt)}</>}
            {retienen.length > 0 && <> · total del mes: <b>{cop(totalRetenido)}</b></>}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[1280px]">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-xs uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">
                  <th className="px-3 py-3 font-semibold sticky left-0 bg-[hsl(var(--canalco-neutral-100))]">Persona</th>
                  <th className="px-3 py-3 font-semibold text-right" title="Total devengado del periodo: básico más extras, recargos, bonificaciones y auxilios">Devengado</th>
                  <th className="px-3 py-3 font-semibold" title={`Intereses de vivienda o leasing. Tope ${TOPES_UVT.vivienda} UVT`}>Vivienda</th>
                  <th className="px-3 py-3 font-semibold text-right" title={`Tope ${TOPES_UVT.dependientes} UVT mensuales`}>Dependientes</th>
                  <th className="px-3 py-3 font-semibold text-right" title={`Tope ${TOPES_UVT.medicinaPrepagada} UVT mensuales`}>Med. prepagada</th>
                  <th className="px-3 py-3 font-semibold text-right">Pens. voluntarias</th>
                  <th className="px-3 py-3 font-semibold text-right">AFC</th>
                  <th className="px-3 py-3 font-semibold text-center">Sujeto</th>
                  <th className="px-3 py-3 font-semibold text-right">Retención estimada</th>
                  <th className="px-3 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((fila) => {
                  const b = borradores[fila.personaId];
                  const det = estimar(fila);
                  return (
                    <tr key={fila.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))]/50">
                      <td className="px-3 py-2 sticky left-0 bg-white">
                        <div className="font-medium text-[hsl(var(--canalco-neutral-900))]">{fila.nombre}</div>
                        <div className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                          {fila.identificacion}{fila.cargo ? ` · ${fila.cargo}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--canalco-neutral-600))]">
                        {cop(det.ingresos)}
                        {/* Se avisa cuando la cifra no es el devengado real sino el sueldo. */}
                        {!baseDe(fila).real && (
                          <span className="block text-[10px] text-amber-700" title={`No aparece en la nómina de ${periodo}: se estima sobre el sueldo`}>
                            sueldo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <select
                            value={b?.viviendaModo ?? 'FIJO'}
                            onChange={(e) => set(fila.personaId, 'viviendaModo', e.target.value)}
                            className="border border-[hsl(var(--canalco-neutral-300))] rounded px-1 py-1 text-[11px]"
                          >
                            <option value="FIJO">Fijo</option>
                            <option value="PORCENTAJE">% devengado</option>
                          </select>
                          {b?.viviendaModo === 'PORCENTAJE' ? (
                            <Cifra value={b?.viviendaPorcentaje ?? ''} onChange={(v) => set(fila.personaId, 'viviendaPorcentaje', v)} sufijo="%" ancho="w-16" />
                          ) : (
                            <Cifra value={b?.viviendaValor ?? ''} onChange={(v) => set(fila.personaId, 'viviendaValor', v)} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2"><Cifra value={b?.dependientes ?? ''} onChange={(v) => set(fila.personaId, 'dependientes', v)} /></td>
                      <td className="px-3 py-2"><Cifra value={b?.medicinaPrepagada ?? ''} onChange={(v) => set(fila.personaId, 'medicinaPrepagada', v)} /></td>
                      <td className="px-3 py-2"><Cifra value={b?.pensionesVoluntarias ?? ''} onChange={(v) => set(fila.personaId, 'pensionesVoluntarias', v)} /></td>
                      <td className="px-3 py-2"><Cifra value={b?.afc ?? ''} onChange={(v) => set(fila.personaId, 'afc', v)} /></td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={b?.sujeto !== false}
                          onChange={(e) => set(fila.personaId, 'sujeto', e.target.checked)}
                          className="w-4 h-4 accent-[hsl(var(--canalco-primary))]"
                          title="Si se desmarca, no se le practica retención"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {det.retencion > 0
                          ? <span className="text-[hsl(var(--canalco-primary))]">{cop(det.retencion)}</span>
                          : <span className="text-[hsl(var(--canalco-neutral-400))]">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => setDetalleDe(fila)} title="Ver el desglose del cálculo" className="text-[hsl(var(--canalco-neutral-500))]">
                          <Info className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => guardar(fila)} disabled={guardando === fila.personaId} title="Guardar la ficha" className="text-[hsl(var(--canalco-primary))]">
                          {guardando === fila.personaId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-[hsl(var(--canalco-neutral-500))] max-w-3xl leading-relaxed">
          La <b>retención estimada</b> se calcula sobre el <b>total devengado</b> del periodo que elija
          arriba —básico más extras, recargos, bonificaciones y auxilios—, con los aportes obligatorios
          que liquida esa misma nómina. Son las mismas cifras con las que se va a pagar. Quien no aparezca
          en ese mes se estima sobre el sueldo y la fila lo dice. Los aportes a salud, pensión y fondo de
          solidaridad no se digitan aquí: la nómina ya los calcula y de ahí los toma la retención.
          {' '}<b>Quién retiene no se decide: se calcula.</b> Hay retención cuando la base gravable pasa de
          95 UVT{uvt > 0 && <> ({cop(95 * uvt)})</>}, lo que con las deducciones de ley suele empezar
          alrededor de los {uvt > 0 ? cop(Math.round((95 * uvt) / 0.69 / 1000) * 1000) : '—'} de devengado
          mensual. Las deducciones de cada quien suben ese piso.
        </p>
      </main>

      {detalleDe && (
        <DesgloseModal
          fila={detalleDe}
          detalle={estimar(detalleDe)}
          onClose={() => setDetalleDe(null)}
        />
      )}
    </div>
  );
}

/**
 * Casilla de dinero. Al salir del campo se reescribe formateada («790.195»), para que
 * se vea qué entendió el sistema: escribir el punto de miles y que se lea como decimal
 * no falla ni avisa, solo deja la deducción mil veces más pequeña.
 */
function Cifra({ value, onChange, sufijo, ancho }: {
  value: string; onChange: (v: string) => void; sufijo?: string; ancho?: string;
}) {
  const esPorcentaje = sufijo === '%';
  return (
    <div className="flex items-center justify-end gap-0.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!esPorcentaje) onChange(enPesos(pesos(value))); }}
        placeholder="0"
        className={`${ancho ?? 'w-28'} border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-[12px] text-right tabular-nums focus:border-[hsl(var(--canalco-primary))] outline-none`}
      />
      {sufijo && <span className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">{sufijo}</span>}
    </div>
  );
}

/** El cálculo paso a paso, en el mismo orden de la hoja del contador. */
function DesgloseModal({ fila, detalle, onClose }: {
  fila: ThRetencionFila; detalle: DetalleRetencion; onClose: () => void;
}) {
  const R = ({ label, valor, fuerte, sangria }: { label: string; valor: number; fuerte?: boolean; sangria?: boolean }) => (
    <div className={`flex justify-between gap-4 py-1.5 ${fuerte ? 'font-semibold border-t border-[hsl(var(--canalco-neutral-200))]' : ''}`}>
      <span className={`text-[12px] ${sangria ? 'pl-4 text-[hsl(var(--canalco-neutral-600))]' : ''}`}>{label}</span>
      <span className="text-[12px] tabular-nums whitespace-nowrap">{cop(valor)}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-[hsl(var(--canalco-neutral-200))] px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[hsl(var(--canalco-neutral-900))]">{fila.nombre}</h2>
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Desglose sobre el devengado del periodo</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="px-5 py-3">
          <R label="Ingresos por rentas de trabajo" valor={detalle.ingresos} />
          <R label="Aportes obligatorios (pensión, FSP y salud)" valor={-detalle.ingresosNoConstitutivos} sangria />
          <R label="Subtotal 1" valor={detalle.subtotal1} fuerte />

          <R label="Intereses de vivienda" valor={-detalle.vivienda} sangria />
          <R label="Dependientes" valor={-detalle.dependientes} sangria />
          <R label="Medicina prepagada" valor={-detalle.medicinaPrepagada} sangria />
          <R label="Subtotal 2" valor={detalle.subtotal2} fuerte />

          <R label="Rentas exentas (pens. voluntarias y AFC)" valor={-detalle.rentasExentas} sangria />
          <R label="Subtotal 3" valor={detalle.subtotal3} fuerte />

          <R label="Renta de trabajo exenta (25 %)" valor={-detalle.rentaExenta25} sangria />
          <R label="Subtotal 4" valor={detalle.subtotal4} fuerte />

          <div className="mt-3 rounded-lg bg-[hsl(var(--canalco-neutral-100))] px-3 py-2">
            <R label="Deducciones y rentas exentas del mes" valor={detalle.deduccionesYExentas} />
            <R label="Límite del 40 % del Subtotal 1" valor={detalle.limite40} />
            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] pt-1">
              Se resta la menor de las dos: <b>{cop(detalle.aplicado)}</b>.
              {detalle.aplicado < detalle.deduccionesYExentas && ' El tope recortó la deducción.'}
            </p>
          </div>

          <R label="Base gravable" valor={detalle.baseGravable} fuerte />
          <div className="flex justify-between gap-4 py-1.5">
            <span className="text-[12px] text-[hsl(var(--canalco-neutral-600))] pl-4">En UVT</span>
            <span className="text-[12px] tabular-nums">{detalle.baseUvt.toFixed(2)} UVT · tarifa {(detalle.tarifa * 100).toFixed(0)} %</span>
          </div>
          <div className="flex justify-between gap-4 py-2 border-t-2 border-[hsl(var(--canalco-neutral-300))] mt-1">
            <span className="font-bold">Retención a practicar</span>
            <span className="font-bold tabular-nums text-[hsl(var(--canalco-primary))]">{cop(detalle.retencion)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
