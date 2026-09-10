import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, Save, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { esRolPmo } from '@/utils/rolesPmo';
import { mensajeDeError } from '@/utils/errorMensaje';
import { MarcoCep } from '@/components/cep/MarcoCep';
import {
  cepService, fmtCep, MESES_CEP, nombreDePeriodo,
  type CepAnio, type CepCapturado, type CepMesCalculado, type Pagador,
} from '@/services/cep.service';

/**
 * Control de Excedentes (CEP): la conciliación mensual de la fiducia de un municipio.
 *
 * Responde una sola pregunta —de la plata del impuesto de alumbrado, ¿cuánta sobra y
 * cuánta falta?— y la responde mes a mes, porque los saldos encadenan: el de agosto sale
 * del de julio.
 *
 * **Lo que se digita y lo que se calcula van separados a la vista.** Es deliberado: en el
 * archivo de Excel las dos cosas están en la misma fila y por eso hay celdas con la
 * fórmula pisada a mano que llevan años arrastrando un error que nadie ve. Acá lo
 * calculado no tiene casilla donde escribir.
 */

/** Una casilla de plata. Vacía es cero, pero se ve vacía: un cero escrito es una decisión. */
function Casilla({ valor, onChange, editable, sugerencia }: {
  valor: number;
  onChange: (v: number) => void;
  editable: boolean;
  sugerencia?: string;
}) {
  const [texto, setTexto] = useState<string>(valor ? String(valor) : '');
  useEffect(() => { setTexto(valor ? String(valor) : ''); }, [valor]);

  if (!editable) {
    return <span className="tabular-nums text-right block px-2 py-1">{valor ? fmtCep(valor) : '–'}</span>;
  }
  return (
    <input
      value={texto}
      inputMode="decimal"
      placeholder={sugerencia ?? '0'}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className="w-full text-right tabular-nums px-2 py-1 border border-[hsl(var(--canalco-neutral-300))] rounded outline-none focus:border-[hsl(var(--canalco-primary))]"
    />
  );
}

/** Un renglón calculado: rótulo a la izquierda, cifra a la derecha, sin casilla. */
function Derivado({ rotulo, valor, fuerte, nota }: {
  rotulo: string; valor: number; fuerte?: boolean; nota?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-3 py-1.5 ${fuerte ? 'font-semibold' : ''}`}>
      <span className="text-[hsl(var(--canalco-neutral-700))]">
        {rotulo}
        {nota && (
          <span className="ml-2 text-[11px] font-normal text-[hsl(var(--canalco-neutral-500))]">
            {nota}
          </span>
        )}
      </span>
      <span className="tabular-nums">{fmtCep(valor)}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white overflow-hidden">
      <header className="px-3 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide">
        {titulo}
      </header>
      <div className="divide-y divide-[hsl(var(--canalco-neutral-200))] text-sm">{children}</div>
    </div>
  );
}

/** Un campo digitado dentro de un bloque. */
function Campo({ rotulo, valor, onChange, editable, nota }: {
  rotulo: string; valor: number; onChange: (v: number) => void; editable: boolean; nota?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_10rem] items-center gap-3 px-3 py-1.5">
      <span className="text-[hsl(var(--canalco-neutral-700))]">
        {rotulo}
        {nota && (
          <span className="ml-2 text-[11px] text-[hsl(var(--canalco-neutral-500))]">{nota}</span>
        )}
      </span>
      <Casilla valor={valor} onChange={onChange} editable={editable} />
    </div>
  );
}

export default function CepPage() {
  const { user } = useAuth();
  const puedeEscribir = esRolPmo(user?.nombreRol);

  return (
    <MarcoCep
      titulo="Control de excedentes"
      subtitulo="La conciliación mensual de la fiducia, municipio por municipio"
      Icono={Scale}
    >
      {({ companyId, anio, empresa }) => (
        <CuerpoCep
          key={`${companyId}-${anio}`}
          companyId={companyId}
          anio={anio}
          municipio={empresa?.name ?? ''}
          puedeEscribir={puedeEscribir}
        />
      )}
    </MarcoCep>
  );
}

function CuerpoCep({ companyId, anio, municipio, puedeEscribir }: {
  companyId: number; anio: string; municipio: string; puedeEscribir: boolean;
}) {
  const [datos, setDatos] = useState<CepAnio | null>(null);
  const [pagadores, setPagadores] = useState<Pagador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mesAbierto, setMesAbierto] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<CepCapturado | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([cepService.cep(companyId, anio), cepService.catalogo()])
      .then(([cep, cat]) => { setDatos(cep); setPagadores(cat.pagadores); setError(null); })
      .catch((e) => setError(mensajeDeError(e, 'No se pudo cargar el CEP.')))
      .finally(() => setCargando(false));
  }, [companyId, anio]);

  useEffect(cargar, [cargar]);

  const porPeriodo = useMemo(() => {
    const m = new Map<string, CepMesCalculado>();
    for (const mes of datos?.meses ?? []) m.set(mes.periodo, mes);
    return m;
  }, [datos]);

  const abrir = (periodo: string) => {
    const mes = porPeriodo.get(periodo);
    setMesAbierto(periodo);
    setBorrador(mes ? { ...mes.capturado } : vacio(pagadores));
  };

  const guardar = async () => {
    if (!mesAbierto || !borrador) return;
    setGuardando(true);
    try {
      await cepService.guardarMes(companyId, mesAbierto, borrador, datos?.notas?.[mesAbierto]);
      cargar();
      setMesAbierto(null);
      setBorrador(null);
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo guardar el mes.'));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando el control de excedentes…
      </div>
    );
  }

  const arranque = datos?.arranque;
  const sinArranque = !arranque?.desde;

  return (
    <div className="space-y-5">
      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/*
        Sin arranque los acumulados salen desde cero, y eso no es «vacío»: es una cifra
        equivocada con toda la pinta de ser buena. Se dice antes de que alguien lea la
        tabla, no después.
      */}
      {sinArranque && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <strong>{municipio} todavía no tiene saldos de arranque.</strong> Mientras no se
          carguen, los acumulados —saldo acumulado, recursos del impuesto y rendimientos—
          arrancan en cero, así que las cifras del año son correctas solo si este municipio
          de verdad empieza aquí. Los saldos se toman del último mes del archivo de Excel.
        </p>
      )}

      {/* ── El año de un vistazo ── */}
      <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white overflow-hidden">
        <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center justify-between">
          <span>CONTROL DE EXCEDENTES · {municipio} · {anio}</span>
          <Link
            to={`/dashboard/recurso-economico/informe?municipio=${companyId}&anio=${anio}`}
            className="font-normal normal-case text-[hsl(var(--canalco-primary))] hover:underline"
          >
            Ver el informe financiero →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-200))]">
                <th className="text-left px-3 py-2 font-semibold">Mes</th>
                <th className="text-right px-3 py-2 font-semibold">Ingresos</th>
                <th className="text-right px-3 py-2 font-semibold">Egresos</th>
                <th className="text-right px-3 py-2 font-semibold">Saldo</th>
                <th className="text-right px-3 py-2 font-semibold">Saldo acum.</th>
                <th className="text-right px-3 py-2 font-semibold">Recursos del impuesto</th>
                <th className="text-left px-3 py-2 font-semibold">Estado</th>
                <th className="text-left px-3 py-2 font-semibold">Conciliación</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
              {MESES_CEP.map((nombre, i) => {
                const periodo = `${anio}-${String(i + 1).padStart(2, '0')}`;
                const mes = porPeriodo.get(periodo);
                const fuera = !!arranque?.desde && periodo < arranque.desde;
                return (
                  <tr key={periodo} className={mes ? '' : 'text-[hsl(var(--canalco-neutral-400))]'}>
                    <td className="px-3 py-1.5 font-medium">{nombre}</td>
                    {mes ? (
                      <>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCep(mes.totalIngresos)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCep(mes.totalEgresos)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCep(mes.saldo)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCep(mes.saldoAcumulado)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                          {fmtCep(mes.recursosDelImpuesto)}
                        </td>
                        <td className="px-3 py-1.5">
                          <Distintivo
                            texto={mes.estado}
                            tono={mes.estado === 'Déficit' ? 'rojo' : mes.estado === 'Excedente' ? 'verde' : 'gris'}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Conciliacion mes={mes} />
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-1.5 text-xs" colSpan={7}>
                        {fuera ? 'anterior al arranque' : 'sin diligenciar'}
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right">
                      {!fuera && (
                        <button
                          onClick={() => abrir(periodo)}
                          className="text-xs text-[hsl(var(--canalco-primary))] hover:underline"
                        >
                          {mes ? 'Abrir' : 'Diligenciar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── La ficha del mes ── */}
      {mesAbierto && borrador && (
        <FichaMes
          periodo={mesAbierto}
          municipio={municipio}
          companyId={companyId}
          capturado={borrador}
          calculado={porPeriodo.get(mesAbierto) ?? null}
          pagadores={pagadores}
          editable={puedeEscribir}
          guardando={guardando}
          onCambio={setBorrador}
          onGuardar={guardar}
          onCerrar={() => { setMesAbierto(null); setBorrador(null); }}
        />
      )}
    </div>
  );
}

function Distintivo({ texto, tono }: { texto: string; tono: 'verde' | 'rojo' | 'gris' | 'ambar' }) {
  const clases = {
    verde: 'bg-green-100 text-green-800',
    rojo: 'bg-red-100 text-red-800',
    ambar: 'bg-amber-100 text-amber-800',
    gris: 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]',
  }[tono];
  return <span className={`text-xs font-medium rounded px-2 py-0.5 ${clases}`}>{texto}</span>;
}

/**
 * Si el mes cuadra con el extracto de la fiducia, y por cuánto no.
 *
 * La diferencia se muestra siempre que exista, no solo cuando pasa del peso: saber que
 * un mes está descuadrado por trescientos mil es distinto de saber que lo está por dos,
 * y la palabra «Revisar» sola no distingue.
 */
function Conciliacion({ mes }: { mes: CepMesCalculado }) {
  if (mes.validacion === 'Conciliado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> Conciliado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-800" title="Diferencia contra el extracto">
      <AlertTriangle className="w-3.5 h-3.5" /> Revisar · {fmtCep(mes.control)}
    </span>
  );
}

const vacio = (pagadores: Pagador[]): CepCapturado => ({
  ingresos: Object.fromEntries(pagadores.map((p) => [p.clave, 0])),
  energiaAforo: 0, caom: 0, cinv: 0, comision: 0, gmf: 0, otrosEgresos: 0,
  interventoriaCausada: 0,
  pendienteEnergia: 0, pendienteInterventoria: 0, pendienteObras: 0,
  pendienteNavideno: 0, pendienteOtros: 0,
  rendimientos: 0, saldoFiducia: 0,
});

function FichaMes({
  periodo, municipio, companyId, capturado, calculado, pagadores,
  editable, guardando, onCambio, onGuardar, onCerrar,
}: {
  periodo: string;
  municipio: string;
  companyId: number;
  capturado: CepCapturado;
  calculado: CepMesCalculado | null;
  pagadores: Pagador[];
  editable: boolean;
  guardando: boolean;
  onCambio: (c: CepCapturado) => void;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  const set = (k: keyof CepCapturado) => (v: number) => onCambio({ ...capturado, [k]: v });
  const setIngreso = (clave: string) => (v: number) =>
    onCambio({ ...capturado, ingresos: { ...capturado.ingresos, [clave]: v } });

  const giros = calculado?.giros;

  return (
    <div className="rounded-lg border-2 border-[hsl(var(--canalco-primary))] bg-white">
      <header className="px-4 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-[hsl(var(--canalco-neutral-900))]">
            {nombreDePeriodo(periodo)} · {municipio}
          </h2>
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            Lo que se lee del extracto de la fiducia. Lo demás lo calcula el sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
          {editable && (
            <Button onClick={onGuardar} disabled={guardando}>
              {guardando
                ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                : <Save className="w-4 h-4 mr-1" />}
              Guardar el mes
            </Button>
          )}
        </div>
      </header>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Bloque titulo="Recaudo bruto · lo que consignó cada pagador">
          {pagadores.map((p) => (
            <Campo
              key={p.clave}
              rotulo={p.etiqueta}
              valor={Number(capturado.ingresos?.[p.clave]) || 0}
              onChange={setIngreso(p.clave)}
              editable={editable}
            />
          ))}
          {calculado && (
            <Derivado rotulo="Total ingresos" valor={calculado.totalIngresos} fuerte />
          )}
        </Bloque>

        <Bloque titulo="Costos de la prestación">
          <Campo rotulo="Energía por aforo" valor={capturado.energiaAforo} onChange={set('energiaAforo')} editable={editable} />
          <Campo rotulo="AOM causado" valor={capturado.caom} onChange={set('caom')} editable={editable} />
          <Campo rotulo="Inversión causada" valor={capturado.cinv} onChange={set('cinv')} editable={editable} />
          <Campo
            rotulo="Interventoría causada"
            valor={capturado.interventoriaCausada}
            onChange={set('interventoriaCausada')}
            editable={editable}
          />
          <Campo rotulo="Comisión fiduciaria" valor={capturado.comision} onChange={set('comision')} editable={editable} />
          <Campo rotulo="GMF" valor={capturado.gmf} onChange={set('gmf')} editable={editable} nota="4x1000" />
          <Campo rotulo="Otros egresos" valor={capturado.otrosEgresos} onChange={set('otrosEgresos')} editable={editable} />
          {calculado && (
            <>
              <Derivado rotulo="Concesión" valor={calculado.concesion} nota="AOM + inversión" />
              <Derivado rotulo="Total egresos" valor={calculado.totalEgresos} fuerte />
            </>
          )}
        </Bloque>

        <Bloque titulo="Fiducia">
          <Campo rotulo="Rendimientos del mes" valor={capturado.rendimientos} onChange={set('rendimientos')} editable={editable} />
          <Campo
            rotulo="Saldo del extracto"
            valor={capturado.saldoFiducia}
            onChange={set('saldoFiducia')}
            editable={editable}
            nota="al cierre"
          />
          {calculado && (
            <>
              <Derivado rotulo="Saldo que debería haber" valor={calculado.saldoFiduciaValidado} />
              <Derivado rotulo="Diferencia" valor={calculado.control} fuerte />
              <div className="px-3 py-2">
                <Conciliacion mes={calculado} />
              </div>
            </>
          )}
        </Bloque>

        {/*
          Lo que sale de las órdenes de pago no tiene casilla, y no es un descuido: si se
          pudiera escribir aquí, la cifra dejaría de coincidir con las órdenes que la
          componen y no habría forma de saber cuál de las dos está bien.
        */}
        <Bloque titulo="Lo girado · viene de las órdenes de pago">
          {giros ? (
            <>
              <Derivado rotulo="Concesión AOM - INV" valor={giros.caomCinv} />
              <Derivado rotulo="Interventoría" valor={giros.interventoria} nota="girada al mes siguiente" />
              <Derivado rotulo="Obras" valor={giros.obras} />
              <Derivado rotulo="Navideño" valor={giros.navideno} />
              <Derivado rotulo="Energía por medición" valor={giros.energiaMedicion} />
              <Derivado rotulo="Giro total a la concesión" valor={calculado!.giroFiduciaConcesion} fuerte />
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-[hsl(var(--canalco-neutral-500))]">
              Guarda el mes para ver lo girado.
            </p>
          )}
          <div className="px-3 py-2">
            <Link
              to={`/dashboard/recurso-economico/ordenes-pago?municipio=${companyId}&anio=${periodo.slice(0, 4)}`}
              className="text-xs text-[hsl(var(--canalco-primary))] hover:underline"
            >
              Ver las órdenes de {nombreDePeriodo(periodo)} →
            </Link>
          </div>
        </Bloque>

        <Bloque titulo="Egresos pendientes · causado que aún no se gira">
          <Campo rotulo="Energía" valor={capturado.pendienteEnergia} onChange={set('pendienteEnergia')} editable={editable} />
          <Campo rotulo="Interventoría" valor={capturado.pendienteInterventoria} onChange={set('pendienteInterventoria')} editable={editable} />
          <Campo rotulo="Obras" valor={capturado.pendienteObras} onChange={set('pendienteObras')} editable={editable} />
          <Campo rotulo="Navideño" valor={capturado.pendienteNavideno} onChange={set('pendienteNavideno')} editable={editable} />
          <Campo rotulo="Otros" valor={capturado.pendienteOtros} onChange={set('pendienteOtros')} editable={editable} />
          {calculado && (
            <>
              <Derivado rotulo="Concesión pendiente" valor={calculado.pendienteConcesion} nota="AOM + inversión" />
              <Derivado rotulo="Comisión pendiente" valor={calculado.pendienteComision} />
              <Derivado rotulo="Egresos cancelados" valor={calculado.egresosCancelados} />
              <Derivado rotulo="Total pendientes" valor={calculado.totalEgresosPendientes} fuerte />
            </>
          )}
        </Bloque>

        <Bloque titulo="Excedente del municipio">
          {calculado ? (
            <>
              <Derivado rotulo="Derechos del concesionario en fiducia" valor={calculado.derechosConcesionarioEnFiducia} />
              <Derivado rotulo="Saldo del mes" valor={calculado.saldo} />
              <Derivado rotulo="Saldo acumulado" valor={calculado.saldoAcumulado} />
              <Derivado rotulo="Saldo final" valor={calculado.saldoFinal} />
              <Derivado rotulo="Recursos del impuesto" valor={calculado.recursosDelImpuesto} fuerte />
              <Derivado rotulo="Rendimientos acumulados" valor={calculado.rendimientosAcumulados} />
              <Derivado rotulo="Saldo de recursos del impuesto" valor={calculado.saldoRecursosDelImpuesto} fuerte />
              <div className="px-3 py-2">
                <Distintivo
                  texto={calculado.estado}
                  tono={calculado.estado === 'Déficit' ? 'rojo' : calculado.estado === 'Excedente' ? 'verde' : 'gris'}
                />
              </div>
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-[hsl(var(--canalco-neutral-500))]">
              Guarda el mes para ver el excedente.
            </p>
          )}
        </Bloque>
      </div>
    </div>
  );
}
