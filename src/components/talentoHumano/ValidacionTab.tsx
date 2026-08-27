import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, Loader2, RotateCcw, Send, ShieldCheck, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  nominaService,
  type CuotasEnCartera,
  type EstadoValidacion,
  type PersonaValidacion,
} from '@/services/nomina.service';

/**
 * Validación de la nómina antes de mandarla a Financiera.
 *
 * Se busca a cada persona **por su cédula, escrita a mano**, se mira lo que le falta a su
 * ficha y se digita el neto a pagar. El sistema no acepta el visto bueno si lo digitado no
 * coincide con lo que calculó, ni si a la ficha le falta algo para poder pagar.
 *
 * Que haya que escribir la cifra es el punto de la pantalla, no un trámite: si el revisor
 * solo tuviera que pulsar «sí», su visto bueno no probaría que la miró. Al escribirla, un
 * error de cálculo o una cuenta cambiada salta antes de que salga la plata.
 *
 * Cuando todas las personas del periodo tienen visto bueno vigente se habilita mandar la
 * liquidación del mes —**un solo envío**, no uno por persona—.
 */

/**
 * El peso que se le perdona a lo digitado.
 *
 * Espejo de `TOLERANCIA_PESOS` en el backend, que es el que de verdad decide: aquí solo
 * evita que el campo se pinte de rojo por un redondeo. La liquidación redondea al final y
 * la planilla del revisor redondea renglón por renglón, así que un peso de diferencia no
 * quiere decir que alguno de los dos esté mal.
 */
const TOLERANCIA_PESOS = 1;

const cop = (v: number | string) => {
  const n = Number(v);
  return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const fecha = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '—');

const cuando = (f: string | null) => {
  if (!f) return '—';
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO');
};

const mensajeDeError = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

export default function ValidacionTab({ periodo }: { periodo: string }) {
  const [estado, setEstado] = useState<EstadoValidacion | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  /** La cédula de la persona abierta. Se guarda para poder refrescarla tras validar. */
  const [abierta, setAbierta] = useState<string | null>(null);
  const [encontradas, setEncontradas] = useState<PersonaValidacion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /**
   * Lo que quedó anotado en la cartera de préstamos al mandar.
   *
   * Va en su propio estado y no dentro de `estado`: el estado se refresca solo y ahí la
   * cartera vuelve en `null`, y estos avisos son justo los que no se pueden perder —cada
   * uno es un préstamo que quedó sin anotar y que alguien tiene que mirar—.
   */
  const [cartera, setCartera] = useState<CuotasEnCartera | null>(null);

  const cargarEstado = useCallback(async () => {
    setCargandoEstado(true);
    try {
      setEstado(await nominaService.estadoValidacion(periodo));
    } catch (e) {
      setEstado(null);
      toast.error(mensajeDeError(e) || 'No se pudo leer el estado del periodo');
    } finally {
      setCargandoEstado(false);
    }
  }, [periodo]);

  useEffect(() => {
    void cargarEstado();
    // Al cambiar de mes lo que había en pantalla ya no corresponde.
    setEncontradas(null);
    setAbierta(null);
    setCartera(null);
  }, [cargarEstado]);

  /**
   * Abre a una persona.
   *
   * Sigue trayéndola por cédula —es lo que identifica a la persona, no la fila— porque
   * una misma cédula puede tener varios contratos en el grupo y hay que revisarlos todos
   * juntos: el préstamo se descuenta por cédula y verlos por separado lleva a descontarlo
   * dos veces.
   */
  const abrir = async (identificacion: string) => {
    const q = identificacion.trim();
    if (!q) return;
    setAbierta(q);
    setBuscando(true);
    try {
      setEncontradas(await nominaService.buscarParaValidar(periodo, q));
    } catch (e) {
      setEncontradas([]);
      toast.error(mensajeDeError(e) || 'No se pudo abrir a esa persona');
    } finally {
      setBuscando(false);
    }
  };

  /** Después de validar o quitar, se refrescan la persona y el contador de arriba. */
  const refrescar = async () => {
    await cargarEstado();
    if (abierta) await abrir(abierta);
  };

  const enviar = async () => {
    if (!estado) return;
    if (!window.confirm(
      `¿Mandar la liquidación de ${periodo} a ${estado.destinatario ?? 'la Coordinación Financiera'}?\n\n` +
      `${estado.total} empleados, todos revisados. Después de mandarla no se pueden cambiar los vistos buenos.`,
    )) return;
    setEnviando(true);
    try {
      const resultado = await nominaService.enviarLiquidacion(periodo);
      setEstado(resultado);
      setCartera(resultado.cartera);
      toast.success(
        resultado.cartera && resultado.cartera.creadas > 0
          ? `Liquidación enviada. Se anotaron ${resultado.cartera.creadas} cuotas en los préstamos.`
          : 'Liquidación enviada',
      );
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  const anular = async () => {
    if (!window.confirm(
      `¿Anular el envío de ${periodo}? Vuelve a quedar editable, pero a Financiera ya le llegó el correo anterior.`,
    )) return;
    try {
      setEstado(await nominaService.anularEnvioLiquidacion(periodo));
      setCartera(null);
      toast.success('Envío anulado');
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo anular');
    }
  };

  const puedeEnviar = !!estado && estado.bloqueos.length === 0;
  const yaEnviada = !!estado?.envio;

  return (
    <div className="space-y-5">
      {/* Cómo va el periodo y el botón de mandarla */}
      {cargandoEstado ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--canalco-primary))]" />
        </div>
      ) : estado && (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-5">
          <div className="flex flex-wrap items-center gap-6">
            <Marcador etiqueta="Personas en la nómina" valor={estado.total} />
            <Marcador etiqueta="Con visto bueno" valor={estado.validadas} tono="verde" />
            <Marcador etiqueta="Con datos faltantes" valor={estado.conFaltantes} tono={estado.conFaltantes ? 'rojo' : undefined} />
            {estado.desactualizadas > 0 && (
              <Marcador etiqueta="Revisadas antes de un cambio" valor={estado.desactualizadas} tono="ambar" />
            )}
            <div className="ml-auto flex items-center gap-3">
              {yaEnviada ? (
                <>
                  <span className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Enviada el {cuando(estado.envio!.enviadoEn)} por {estado.envio!.enviadoPor ?? '—'}
                  </span>
                  <Button variant="outline" size="sm" onClick={anular} className="gap-2">
                    <RotateCcw className="w-4 h-4" /> Anular envío
                  </Button>
                </>
              ) : (
                <Button onClick={enviar} disabled={!puedeEnviar || enviando} className="gap-2">
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar liquidación
                </Button>
              )}
            </div>
          </div>

          {/* La barra existe para que se vea de un vistazo cuánto falta de revisar. */}
          <div className="mt-4 h-2 rounded-full bg-[hsl(var(--canalco-neutral-200))] overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${estado.total ? (estado.validadas / estado.total) * 100 : 0}%` }}
            />
          </div>

          {yaEnviada && estado.envio && !estado.envio.correoEnviado && (
            <p className="mt-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-3 py-2">
              Quedó la constancia del envío, pero <strong>el correo no salió</strong>. Avísale a
              Sistemas y mientras tanto confírmale a Financiera por otro medio.
            </p>
          )}

          {cartera && (
            <div
              className={`mt-3 text-sm rounded-md px-3 py-2 border ${
                cartera.avisos.length > 0
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
              }`}
            >
              <p>
                {cartera.creadas > 0 ? (
                  <>
                    Se anotaron <strong>{cartera.creadas} cuotas</strong> por{' '}
                    <strong>{cop(cartera.total)}</strong> en los préstamos: el saldo de esa gente
                    ya bajó y el plan de pagos marca este mes como pagado.
                  </>
                ) : (
                  <>No hubo cuotas de préstamo que anotar en este periodo.</>
                )}
                {cartera.yaEstaban > 0 && (
                  <>
                    {' '}
                    {cartera.yaEstaban}{' '}
                    {cartera.yaEstaban === 1 ? 'préstamo ya tenía' : 'préstamos ya tenían'} la
                    cuota de este mes y se{' '}
                    {cartera.yaEstaban === 1 ? 'dejó' : 'dejaron'} como{' '}
                    {cartera.yaEstaban === 1 ? 'estaba' : 'estaban'}.
                  </>
                )}
              </p>
              {cartera.avisos.length > 0 && (
                <>
                  <p className="mt-2 font-semibold">Esto quedó sin anotar:</p>
                  <ul className="list-disc ml-5 mt-1">
                    {cartera.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {!yaEnviada && estado.bloqueos.length > 0 && (
            <div className="mt-4 text-sm bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-300))] rounded-md px-3 py-2">
              <p className="font-semibold text-[hsl(var(--canalco-neutral-800))]">
                Todavía no se puede mandar:
              </p>
              <ul className="list-disc ml-5 mt-1 text-[hsl(var(--canalco-neutral-700))]">
                {estado.bloqueos.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}

          {!yaEnviada && puedeEnviar && (
            <p className="mt-4 text-sm bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md px-3 py-2">
              Las {estado.total} personas quedaron revisadas. Al enviar le llega a{' '}
              <strong>{estado.destinatario ?? 'la Coordinación Financiera'}</strong>.
            </p>
          )}

        </section>
      )}

      {/*
        La lista del periodo. Es la forma de entrar a cada persona: se revisa recorriendo
        la nómina de arriba abajo, no buscando de a una cédula que hay que saberse.
        Las pendientes van primero, que es por donde se sigue trabajando.
      */}
      {estado && estado.personas.length > 0 && (
        <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-5">
          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-3">
            Personas del periodo ({estado.personas.length})
          </p>
          <ul className="divide-y divide-[hsl(var(--canalco-neutral-200))] max-h-[26rem] overflow-y-auto">
            {[...estado.personas]
              .sort((a, b) => Number(a.validada) - Number(b.validada))
              .map((p) => (
                <li key={p.personaId}>
                  <button
                    onClick={() => void abrir(p.identificacion)}
                    className={
                      'w-full text-left py-2 px-2 -mx-2 rounded flex flex-wrap items-baseline gap-x-2 gap-y-0.5 hover:bg-[hsl(var(--canalco-neutral-100))] ' +
                      (abierta === p.identificacion ? 'bg-[hsl(var(--canalco-neutral-100))]' : '')
                    }
                  >
                    {p.validada
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 self-center" />
                      : <span className="w-4 h-4 shrink-0" />}
                    <span className="font-medium text-sm text-[hsl(var(--canalco-neutral-800))]">
                      {p.nombre}
                    </span>
                    {p.cargo && (
                      <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{p.cargo}</span>
                    )}
                    <span className={
                      'text-xs ml-auto ' +
                      (p.validada ? 'text-emerald-700' : 'text-[hsl(var(--canalco-neutral-500))]')
                    }>
                      {p.motivo}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {buscando && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--canalco-primary))]" />
        </div>
      )}

      {encontradas?.length === 0 && (
        <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-8">
          Esa persona ya no está en la nómina de {periodo}.
        </p>
      )}

      {encontradas?.map((p) => (
        <TarjetaPersona
          key={p.personaId}
          persona={p}
          periodo={periodo}
          bloqueada={yaEnviada}
          onCambio={refrescar}
        />
      ))}
    </div>
  );
}

function Marcador({ etiqueta, valor, tono }: {
  etiqueta: string;
  valor: number;
  tono?: 'verde' | 'rojo' | 'ambar';
}) {
  const color = tono === 'verde' ? 'text-emerald-700'
    : tono === 'rojo' ? 'text-red-700'
    : tono === 'ambar' ? 'text-amber-700'
    : 'text-[hsl(var(--canalco-neutral-900))]';
  return (
    <div>
      <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">{etiqueta}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

// ── La persona ──

function TarjetaPersona({ persona, periodo, bloqueada, onCambio }: {
  persona: PersonaValidacion;
  periodo: string;
  bloqueada: boolean;
  onCambio: () => Promise<void>;
}) {
  const l = persona.liquidacion;
  const neto = Math.round(l.netoPagar);
  const yaValidada = !!persona.validacion && !persona.desactualizada;

  /*
   * Arranca vacío incluso cuando ya está validada: el campo es para escribir la cifra
   * mirando el soporte, y traerla puesta convertiría la revisión en pulsar un botón, que
   * es justo lo que esta pantalla existe para evitar.
   */
  const [digitado, setDigitado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setDigitado(''); setObservaciones(''); }, [persona.personaId, persona.validacion?.validacionId]);

  const escrito = digitado.trim() === '' ? null : Math.round(Number(digitado.replace(/[^\d.-]/g, '')));
  const esNumero = escrito !== null && Number.isFinite(escrito);
  const diferencia = esNumero ? escrito - neto : 0;
  const coincide = esNumero && Math.abs(diferencia) <= TOLERANCIA_PESOS;
  /** Cuadra, pero no al peso: se deja pasar y se dice, no se esconde. */
  const porRedondeo = coincide && diferencia !== 0;
  const completa = persona.faltantes.length === 0;

  const validar = async () => {
    if (!esNumero) return;
    setGuardando(true);
    try {
      await nominaService.validarPersona({
        periodo,
        personaId: persona.personaId,
        netoDigitado: escrito,
        observaciones: observaciones.trim() || null,
      });
      toast.success(`${persona.nombre} con visto bueno`);
      await onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo dar el visto bueno');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!window.confirm(`¿Quitarle el visto bueno a ${persona.nombre}?`)) return;
    try {
      await nominaService.quitarValidacion(periodo, persona.personaId);
      toast.success('Visto bueno retirado');
      await onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo quitar');
    }
  };

  return (
    <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex flex-wrap items-center gap-3">
        <div className="flex-grow">
          <h3 className="font-bold text-[hsl(var(--canalco-neutral-900))]">{persona.nombre}</h3>
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            {persona.identificacion} · {persona.cargo || 'sin cargo'} · {persona.proyecto || 'sin proyecto'}
            {persona.estado && ` · ${persona.estado}`}
          </p>
        </div>
        {yaValidada && (
          <span className="text-xs font-semibold rounded-full px-3 py-1 bg-emerald-100 text-emerald-900 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Visto bueno de {persona.validacion!.validadoPor ?? '—'}
          </span>
        )}
        {persona.desactualizada && (
          <span className="text-xs font-semibold rounded-full px-3 py-1 bg-amber-100 text-amber-900">
            La nómina cambió después de revisarla
          </span>
        )}
      </header>

      {/* Lo que le falta, primero que todo: es lo que impide pagarle. */}
      {!completa && (
        <div className="mx-5 mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">A esta ficha le falta:</p>
            <ul className="list-disc ml-5 mt-1">
              {persona.faltantes.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="mt-1.5 text-red-800">
              Complétalo en Talento Humano → Personal. Hasta entonces no se le puede dar visto bueno.
            </p>
          </div>
        </div>
      )}

      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Bloque titulo="Devengado" filas={[
            [`Básico · ${l.diasTrabajados} días`, l.devengadoBasico],
            ['Horas extras', l.horasExtras],
            ['Recargo nocturno', l.recargoNocturno],
            ['Auxilio de rodamiento', l.auxilioRodamiento],
            ['Bonificación', l.bonificacion],
            ['Incapacidad', l.incapacidadEmpresa + l.incapacidadEmpleado + l.incapacidadOtros],
            ['Vacaciones', l.vacacionesHabiles + l.vacacionesNoHabiles],
            ['Auxilio de transporte', l.auxilioTransporte],
          ]} total={['Total devengado', l.totalDevengado]} />

          <Bloque titulo="Deducciones" filas={[
            ['Salud', l.salud],
            ['Pensión', l.pension],
            ['FSP', l.fsp],
            ['Retención en la fuente', l.retencionFuente],
            ['Préstamo', l.prestamo],
            ['Embargos', l.embargos],
            ['Servicios Grupo Recordar', l.serviciosGruporecordar],
            ['Bonificación (deducción)', l.bonificacionDeduccion],
          ]} total={['Total deducciones', l.totalDeduccion]} />

          <div className="text-xs text-[hsl(var(--canalco-neutral-500))] grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[hsl(var(--canalco-neutral-200))]">
            <Dato etiqueta="Salario básico" valor={cop(l.salarioBasico)} />
            <Dato etiqueta="IBC" valor={cop(l.ibc)} />
            <Dato etiqueta="Ingreso" valor={fecha(persona.fechaIngreso)} />
            <Dato
              etiqueta="Cuenta"
              valor={persona.cuenta ? `${persona.banco ?? ''} · ${persona.cuenta}` : 'sin cuenta'}
            />
          </div>

          {l.multiEmpresa && (
            <p className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-3 py-2">
              Tiene contrato en varias empresas del grupo. La cuota del préstamo va completa en
              cada una, sin repartir — revísala antes de dar el visto bueno.
            </p>
          )}
        </div>

        {/* La digitación */}
        <aside className="lg:border-l lg:pl-6 border-[hsl(var(--canalco-neutral-200))]">
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">Neto a pagar según el sistema</p>
          <p className="text-3xl font-bold tabular-nums text-[hsl(var(--canalco-neutral-900))] mb-5">
            {cop(neto)}
          </p>

          {bloqueada ? (
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))] bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-300))] rounded-md px-3 py-2">
              La nómina de este periodo ya se mandó a Financiera. Para cambiar algo hay que anular
              el envío.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
                  Valor de nómina a pagar
                </span>
                <input
                  value={digitado}
                  onChange={(e) => setDigitado(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && coincide && completa) void validar(); }}
                  inputMode="numeric"
                  placeholder="Escríbelo del soporte"
                  disabled={!completa}
                  className={
                    'w-full border rounded-md px-3 py-2 text-lg tabular-nums outline-none disabled:bg-[hsl(var(--canalco-neutral-100))] ' +
                    (escrito === null
                      ? 'border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))]'
                      : coincide
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-red-400 bg-red-50')
                  }
                />
              </label>

              {escrito !== null && !coincide && (
                <p className="mt-2 text-sm text-red-800 flex items-start gap-1.5">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    No coincide. {esNumero
                      ? <>Hay {cop(Math.abs(diferencia))} {diferencia > 0 ? 'de más' : 'de menos'}.</>
                      : 'Escribe solo el número.'}
                  </span>
                </p>
              )}
              {coincide && (
                <p className="mt-2 text-sm text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {porRedondeo
                    ? <>Cuadra. Hay {cop(Math.abs(diferencia))} de {diferencia > 0 ? 'más' : 'menos'} por redondeo.</>
                    : 'Coincide con el neto a pagar.'}
                </p>
              )}

              <label className="block mt-4">
                <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
                  Observaciones
                </span>
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  disabled={!completa}
                  className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm bg-white disabled:bg-[hsl(var(--canalco-neutral-100))]"
                />
              </label>

              <Button
                onClick={validar}
                disabled={!completa || !coincide || guardando}
                className="w-full mt-4 gap-2"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {yaValidada ? 'Volver a dar visto bueno' : 'Dar visto bueno'}
              </Button>

              {yaValidada && (
                <>
                  <p className="mt-3 text-xs text-[hsl(var(--canalco-neutral-500))]">
                    Revisada el {cuando(persona.validacion!.validadoEn)}
                    {persona.validacion!.observaciones && ` · ${persona.validacion!.observaciones}`}
                  </p>
                  <Button variant="ghost" size="sm" onClick={quitar} className="w-full mt-1 gap-2 text-red-700">
                    <RotateCcw className="w-4 h-4" /> Quitar visto bueno
                  </Button>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

/** Un bloque del desglose. Las líneas en cero no se muestran: solo hacen ruido. */
function Bloque({ titulo, filas, total }: {
  titulo: string;
  filas: Array<[string, number]>;
  total: [string, number];
}) {
  const visibles = useMemo(() => filas.filter(([, v]) => Math.round(v) !== 0), [filas]);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-1">
        {titulo}
      </p>
      <table className="w-full text-sm">
        <tbody>
          {visibles.map(([etiqueta, valor]) => (
            <tr key={etiqueta}>
              <td className="py-0.5 text-[hsl(var(--canalco-neutral-700))]">{etiqueta}</td>
              <td className="py-0.5 text-right tabular-nums">{cop(valor)}</td>
            </tr>
          ))}
          <tr className="border-t border-[hsl(var(--canalco-neutral-300))] font-semibold">
            <td className="pt-1">{total[0]}</td>
            <td className="pt-1 text-right tabular-nums">{cop(total[1])}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[hsl(var(--canalco-neutral-400))]">{etiqueta}</p>
      <p className="text-[hsl(var(--canalco-neutral-700))] font-medium">{valor}</p>
    </div>
  );
}

