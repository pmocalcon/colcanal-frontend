/**
 * La línea de tiempo del trámite: qué tardó cada paso y qué se había estipulado.
 *
 * El recorrido se mostraba como una hilera de fichas con la fecha de cada movimiento.
 * Servía para saber por dónde pasó, pero no para lo que de verdad se pregunta en una
 * auditoría —dónde se detuvo y si se cumplió el plazo—, que obligaba a restar fechas a
 * mano. Aquí cada paso dice cuánto duró, cuánto podía durar y si se pasó.
 *
 * Los estados sin plazo definido se muestran igual, sin juzgarlos: son la mayor parte
 * del calendario de una requisición —la espera de la recepción puede llevarse semanas—
 * y ocultarlos daría la impresión de un trámite más corto de lo que fue.
 *
 * Entre los pasos van los hitos de la factura —emitida, enviada a Contabilidad,
 * registrada—. No son estados de la requisición y no se miden como tales: se muestran
 * en el sitio que les toca por fecha para poder responder lo que se pregunta al
 * auditar, que es qué factura movió cada paso. En una requisición con varias órdenes,
 * «registrar factura» aparece dos veces en el recorrido y sin los hitos no hay manera
 * de saber cuál de las dos fue cuál.
 *
 * Es la única línea de tiempo de compras. Había dos —esta y la del detalle, que decía
 * quién hizo cada cosa y qué anotó pero no los plazos ni las facturas—, y contaban el
 * mismo recorrido con distinto detalle, así que había que abrir las dos para tener la
 * historia completa. Ahora el detalle le pasa sus eventos por `eventos` y sale todo en
 * una: el estado, quién lo movió, qué escribió, cuánto tardó, el plazo y las facturas.
 */

import { Fragment } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Circle, Receipt, User } from 'lucide-react';
import { msHabiles, formatElapsedLargo } from '@/utils/tiempoHabil';
import { getColombianHolidays } from '@/utils/colombianCalendar';
import { formatDiaCalendario } from '@/utils/dateUtils';
import type {
  RequisitionEstado,
  RequisitionPurchaseOrder,
  RequisitionRecorridoResumen,
  TimelineEvent,
} from '@/services/audit.service';

/** Los estados en el nombre que usa la gente, no el del código. */
const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente de revisión',
  pendiente_validacion: 'Pendiente de validación de obra',
  pendiente_autorizacion: 'Pendiente de autorización',
  autorizado: 'Autorizada',
  aprobada_revisor: 'Aprobada por el revisor',
  aprobada_gerencia: 'Aprobada por Gerencia',
  en_cotizacion: 'En cotización',
  cotizada: 'Cotizada',
  en_orden_compra: 'Órdenes de compra generadas',
  pendiente_recepcion: 'Pendiente de recepción',
  en_recepcion: 'En recepción',
  recepcion_completa: 'Recepción completa',
  sin_factura: 'Sin factura',
  factura_parcial: 'Factura parcial',
  factura_completa: 'Factura registrada',
  enviada_contabilidad: 'Factura enviada a Contabilidad',
  recibida_contabilidad: 'Factura recibida por Contabilidad',
  rechazada_revisor: 'Rechazada por el revisor',
  rechazada_validador: 'Rechazada por el validador de obra',
  rechazada_autorizador: 'Rechazada por el autorizador',
  rechazada_gerencia: 'Rechazada por Gerencia',
  pendiente_anulacion: 'Pendiente de anulación',
  anulada: 'Anulada',
};

/**
 * Qué se hizo, en el nombre de la gente. El estado dice dónde quedó la requisición y
 * esto dice qué la movió, que no siempre es lo mismo: reenviarla tras un rechazo y
 * crearla la dejan igual de «Pendiente de revisión», y sin el nombre de la acción los
 * dos renglones se leen idénticos.
 *
 * Están las treinta acciones que existen en la bitácora. Los mapas que había en las dos
 * pantallas cubrían ocho y el resto salía en crudo —«revisar_aprobar_pendiente_
 * autorizacion»—, que es lo que se veía en el detalle.
 */
const ACCION_LABELS: Record<string, string> = {
  crear_requisicion: 'Creación',
  crear_requisicion_obra: 'Creación (obra)',
  crear_requisicion_obra_autorizacion: 'Creación (obra, con autorización)',
  crear_requisicion_directo_gerencia: 'Creación (directo a Gerencia)',
  crear_requisicion_poliza: 'Creación (póliza)',
  editar_requisicion: 'Edición',
  reenviar_requisicion: 'Reenvío tras rechazo',
  validar_obra: 'Validación de obra',
  rechazar_validacion_obra: 'Validación de obra rechazada',
  auto_review: 'Revisión automática',
  revisar_aprobar: 'Revisión aprobada',
  revisar_aprobar_pendiente_autorizacion: 'Revisión aprobada, pasa a autorización',
  revisar_rechazar: 'Revisión rechazada',
  autorizar_aprobar: 'Autorización',
  autorizar_rechazar: 'Autorización rechazada',
  auto_aprobacion_director: 'Autoaprobación del director',
  aprobar_gerencia: 'Aprobación de Gerencia',
  rechazar_gerencia: 'Rechazo de Gerencia',
  gestionar_cotizacion: 'Cotización',
  asignar_precios: 'Asignación de precios',
  crear_ordenes_compra: 'Creación de órdenes de compra',
  aprobar_todas_ordenes_compra: 'Aprobación de las órdenes',
  registrar_recepcion: 'Registro de recepción',
  registrar_factura: 'Registro de factura',
  enviar_facturas_contabilidad: 'Envío a Contabilidad',
  recibir_facturas_contabilidad: 'Recepción por Contabilidad',
  devolver_facturas_contabilidad: 'Devolución de Contabilidad',
  solicitar_anulacion: 'Solicitud de anulación',
  aprobar_anulacion: 'Anulación aprobada',
  anular_requisicion: 'Anulación',
  correccion_estado: 'Corrección de estado',
};

const fecha = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

/** «2 días hábiles», «1 día hábil». Para nombrar el plazo, que sí viene en días. */
const enDias = (n: number) => (n === 1 ? '1 día hábil' : `${n} días hábiles`);

/**
 * Un día del calendario —«2026-08-06»— puesto en la línea de tiempo.
 *
 * Se arma con los números sueltos y no con `new Date(texto)`, que lo tomaría como
 * medianoche UTC y lo dejaría cinco horas antes: la factura emitida el 6 se ordenaría
 * como si fuera del 5 y podría colarse delante del paso que la registró.
 */
const inicioDelDia = (dia: string): Date => {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
};

/**
 * Los festivos de los años que toca el recorrido.
 *
 * Se generan en el navegador en vez de pedirlos: la lista es determinista —Ley
 * Emiliani— y un trámite puede cruzar dos años, así que pedirla obligaría a saber de
 * antemano cuáles hacen falta.
 */
const festivosDe = (fechas: (string | null)[]): Set<string> => {
  const años = new Set(
    fechas.filter(Boolean).map((f) => new Date(f as string).getFullYear()),
  );
  const salida = new Set<string>();
  for (const a of años) {
    for (const d of getColombianHolidays(a)) salida.add(d);
    for (const d of getColombianHolidays(a + 1)) salida.add(d);
  }
  return salida;
};

/** Un momento de la vida de la factura, para intercalarlo en el recorrido. */
interface HitoFactura {
  /** Para ordenarlo entre los pasos. */
  cuando: Date;
  /** Ya formateado: unos hitos son un día y otros un instante del sistema. */
  texto: string;
  titulo: string;
  /** La orden a la que pertenece. Solo se nombra si la requisición tiene varias. */
  oc: string | null;
  nota?: string;
  alerta?: string;
}

/**
 * Los hitos de las facturas de la requisición.
 *
 * Cuando una factura tiene las dos fechas de envío —la del sistema y la que digitó
 * quien la envió— se ubica por la del sistema y la declarada se dice al lado en vez de
 * poner dos puntos que se contradicen: son la misma acción contada dos veces, y en las
 * cuatro facturas que tienen ambas no coinciden.
 */
function hitosDeFacturas(ordenes: RequisitionPurchaseOrder[]): {
  hitos: HitoFactura[];
  enviadasSinFecha: string[];
} {
  const varias = ordenes.length > 1;
  const hitos: HitoFactura[] = [];
  const enviadasSinFecha: string[] = [];

  for (const o of ordenes) {
    if (!o.invoiceNumbers) continue;
    const oc = varias ? o.purchaseOrderNumber : null;
    const nombre = `Factura ${o.invoiceNumbers}`;

    const emitida = o.invoiceIssueDate ? inicioDelDia(o.invoiceIssueDate) : null;
    if (emitida) {
      hitos.push({
        cuando: emitida,
        texto: formatDiaCalendario(o.invoiceIssueDate),
        titulo: `${nombre} emitida`,
        oc,
      });
    }

    if (o.sentToAccountingAt || o.sentToAccountingDeclarada) {
      const porSistema = !!o.sentToAccountingAt;
      const cuando = porSistema
        ? new Date(o.sentToAccountingAt as string)
        : inicioDelDia(o.sentToAccountingDeclarada as string);
      hitos.push({
        cuando,
        texto: porSistema
          ? fecha(o.sentToAccountingAt)
          : `${formatDiaCalendario(o.sentToAccountingDeclarada)}°`,
        titulo: `${nombre} enviada a Contabilidad`,
        oc,
        nota: porSistema
          ? o.sentToAccountingDeclarada
            ? `quien la envió declaró el ${formatDiaCalendario(o.sentToAccountingDeclarada)}`
            : undefined
          : 'fecha digitada por quien la envió; el sistema no registró el envío',
        // El envío no puede ser anterior a la factura. Cuando lo es, la fecha está mal
        // digitada, y callarlo dejaría un hito fuera de sitio que parece un error de la
        // pantalla.
        alerta:
          emitida && cuando < emitida
            ? 'el envío quedó antes de la emisión de la factura'
            : undefined,
      });
    } else if (o.algunaEnviada) {
      // Sin fecha no hay dónde ponerla en la línea; se dice aparte para que no
      // desaparezca del recorrido.
      enviadasSinFecha.push(o.invoiceNumbers);
    }

    if (o.invoiceRegisteredAt) {
      hitos.push({
        cuando: new Date(o.invoiceRegisteredAt),
        texto: fecha(o.invoiceRegisteredAt),
        titulo: `${nombre} registrada en el sistema`,
        oc,
      });
    }
  }

  hitos.sort((a, b) => +a.cuando - +b.cuando);
  return { hitos, enviadasSinFecha };
}

/**
 * El evento que corresponde a un paso: quién lo hizo y qué escribió.
 *
 * Los dos vienen de la misma tabla y en el mismo orden, así que casi siempre es el de
 * la misma posición; se confirma con la acción y el instante antes de usarlo, porque
 * emparejar mal pondría el comentario de un paso en la boca de otro. Si no cuadra, se
 * busca por acción y fecha, y si tampoco, el paso se muestra sin autor: falta un dato,
 * no sobra uno inventado.
 */
const eventoDelPaso = (
  paso: RequisitionEstado,
  i: number,
  eventos: TimelineEvent[],
): TimelineEvent | null => {
  const mismo = (e: TimelineEvent) =>
    e.action === paso.action &&
    !!paso.date &&
    +new Date(e.createdAt) === +new Date(paso.date);
  const porPosicion = eventos[i];
  if (porPosicion && mismo(porPosicion)) return porPosicion;
  return eventos.find(mismo) ?? null;
};

export function LineaTiempoRequisicion({
  pasos,
  resumen,
  ordenes = [],
  eventos = [],
  titulo = 'Línea de tiempo del trámite',
}: {
  pasos: RequisitionEstado[];
  resumen: RequisitionRecorridoResumen | null;
  ordenes?: RequisitionPurchaseOrder[];
  /**
   * Quién movió cada paso y qué anotó. Va aparte de `pasos` porque lo trae otra
   * consulta: la del detalle. Sin esto la línea sirve igual —así se usa en el
   * desplegable de la matriz—, solo que sin nombres ni comentarios.
   */
  eventos?: TimelineEvent[];
  /** Nulo cuando quien la usa ya la encabeza —la tarjeta del detalle, por ejemplo—. */
  titulo?: string | null;
}) {
  if (pasos.length === 0) return null;

  /*
   * El tiempo se cuenta acá y no en el servidor: los días hábiles empiezan y terminan
   * en hora de Colombia y el backend corre en UTC, así que un paso resuelto un viernes
   * por la noche caería en sábado. Del servidor viene solo el veredicto del plazo, que
   * es el mismo que marca «Vencida» en los listados.
   */
  const festivos = festivosDe(pasos.map((p) => p.date));
  const ahora = new Date();
  const duracion = (i: number): number => {
    const p = pasos[i];
    if (!p.date) return 0;
    const desde = new Date(p.date);
    const sig = pasos[i + 1];
    const hasta = sig?.date ? new Date(sig.date) : p.abierto ? ahora : desde;
    return msHabiles(desde, hasta, festivos);
  };
  const duraciones = pasos.map((_, i) => duracion(i));
  const total =
    resumen && resumen.inicio
      ? msHabiles(new Date(resumen.inicio), new Date(resumen.fin), festivos)
      : 0;

  /* El paso más lento del trámite. Se señala aunque no tenga plazo: es la respuesta a
     «¿dónde se nos fue el tiempo?», que casi nunca cae en un estado con SLA. */
  const maxMs = Math.max(...duraciones);

  /* Cada hito cuelga del último paso que ya había ocurrido cuando pasó. Así se
     intercala sin tocar el orden ni las duraciones de los pasos, que se miden entre
     ellos: los hitos acompañan el recorrido, no lo parten. */
  const { hitos, enviadasSinFecha } = hitosDeFacturas(ordenes);
  const hitosDelPaso = new Map<number, HitoFactura[]>();
  for (const h of hitos) {
    let idx = -1;
    pasos.forEach((p, i) => {
      if (p.date && new Date(p.date) <= h.cuando) idx = i;
    });
    const lista = hitosDelPaso.get(idx) ?? [];
    lista.push(h);
    hitosDelPaso.set(idx, lista);
  }

  const renderHito = (h: HitoFactura, k: string) => (
    <li key={k} className="relative pl-5 pb-4 last:pb-0">
      <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center">
        <Receipt className="w-2.5 h-2.5 text-indigo-600" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-medium text-indigo-900">{h.titulo}</span>
        <span className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
          {h.texto}
        </span>
        {h.oc && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]">
            {h.oc}
          </span>
        )}
      </div>
      {(h.nota || h.alerta) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
          {h.alerta && (
            <span className="inline-flex items-center gap-1 text-amber-800">
              <AlertTriangle className="w-3 h-3" /> {h.alerta}
            </span>
          )}
          {h.nota && (
            <span className="text-[hsl(var(--canalco-neutral-500))]">{h.nota}</span>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        {titulo ? (
          <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-500))]">
            {titulo}
          </p>
        ) : (
          <span />
        )}
        {resumen && (
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            <b>{formatElapsedLargo(total)}</b>
            {resumen.enCurso && ' · en curso'}
            {resumen.pasosVencidos > 0 && (
              <span className="text-red-700 font-semibold">
                {' '}· {resumen.pasosVencidos} de {resumen.pasosConPlazo} fuera de plazo
              </span>
            )}
            {resumen.pasosVencidos === 0 && resumen.pasosConPlazo > 0 && (
              <span className="text-green-700"> · todos los plazos cumplidos</span>
            )}
          </p>
        )}
      </div>

      <ol className="relative border-l-2 border-[hsl(var(--canalco-neutral-300))] ml-2">
        {/* Lo que pasó antes del primer movimiento del log —una factura emitida antes,
            por ejemplo— va arriba, en su sitio por fecha. */}
        {(hitosDelPaso.get(-1) ?? []).map((h, j) => renderHito(h, `pre-${j}`))}

        {pasos.map((p, i) => {
          const vencido = p.vencido === true;
          const conPlazo = p.slaDiasHabiles != null;
          const ms = duraciones[i];
          const esFinal = i === pasos.length - 1 && !p.abierto;
          const ev = eventos.length > 0 ? eventoDelPaso(p, i, eventos) : null;
          // Solo se señala si de verdad pesa: en un trámite de horas, el «más largo»
          // no dice nada. Un día hábil es el umbral desde el que alguien esperó.
          const cuelloBotella = ms === maxMs && ms >= 86400000;

          return (
            <Fragment key={`${p.action}-${i}`}>
            <li className="relative pl-5 pb-4 last:pb-0">
              <span
                className={`absolute -left-[9px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                  vencido
                    ? 'bg-red-100'
                    : conPlazo
                      ? 'bg-green-100'
                      : 'bg-[hsl(var(--canalco-neutral-200))]'
                }`}
              >
                {vencido ? (
                  <AlertTriangle className="w-2.5 h-2.5 text-red-700" />
                ) : conPlazo ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-green-700" />
                ) : (
                  <Circle className="w-2 h-2 text-[hsl(var(--canalco-neutral-500))]" />
                )}
              </span>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">
                  {p.status ? (ESTADO_LABELS[p.status] ?? p.status) : p.action}
                </span>
                <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                  {fecha(p.date)}
                </span>
                {/* Qué se hizo, al lado de dónde quedó: dos pasos pueden dejar la
                    requisición en el mismo estado por motivos distintos. */}
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-600))]">
                  {ACCION_LABELS[p.action] ?? p.action}
                </span>
                {p.abierto && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    estado actual
                  </span>
                )}
              </div>

              {ev && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[hsl(var(--canalco-neutral-700))]">
                  <User className="w-3 h-3 text-[hsl(var(--canalco-neutral-500))]" />
                  <span className="font-medium">{ev.user?.nombre ?? 'Sin usuario'}</span>
                  {ev.user?.cargo && (
                    <span className="text-[hsl(var(--canalco-neutral-500))]">
                      ({ev.user.cargo})
                    </span>
                  )}
                </div>
              )}

              {ev?.comments && (
                <p className="mt-1 text-xs text-[hsl(var(--canalco-neutral-600))] border-l-2 border-[hsl(var(--canalco-neutral-300))] pl-2">
                  {ev.comments}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                {/* En el último paso de un trámite cerrado no hay espera que medir: ahí
                    se acabó. Sin esto salía «tardó unos segundos», que suena a que algo
                    duró un instante cuando lo que pasó es que no duró nada. */}
                {esFinal ? (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--canalco-neutral-700))]">
                    <Clock className="w-3 h-3" /> aquí terminó el trámite
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--canalco-neutral-700))]">
                    <Clock className="w-3 h-3" />
                    {/* «se quedó así» y no «tardó»: el número es lo que la
                        requisición pasó **en este estado**, no lo que tardó quien hizo
                        la acción. Con «tardó», el renglón de la aprobación de Gerencia
                        parecía decir que Gerencia se demoró cinco días cuando había
                        aprobado en hora y media y lo que se quedó quieto fue el
                        trámite, esperando el paso siguiente. */}
                    {p.abierto ? 'lleva así ' : 'se quedó así '}
                    <b>{formatElapsedLargo(ms)}</b>
                  </span>
                )}

                {conPlazo ? (
                  /* La fecha límite va en el título y no en el renglón: llenaba la
                     línea de texto repetido —dos pasos seguidos suelen vencer el mismo
                     día— y lo que se lee de un vistazo es si se cumplió o no. Queda a
                     mano para quien necesite comprobarla, que es lo que hace falta
                     cuando el plazo se cuenta en jornadas y el transcurrido en días. */
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      vencido ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}
                    title={p.fechaLimite ? `Vencía el ${fecha(p.fechaLimite)}` : undefined}
                  >
                    plazo {enDias(p.slaDiasHabiles as number)} ·{' '}
                    {vencido ? 'fuera de plazo' : 'a tiempo'}
                  </span>
                ) : (
                  <span className="text-[hsl(var(--canalco-neutral-400))]">
                    sin plazo definido
                  </span>
                )}

                {cuelloBotella && !p.abierto && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    el paso más largo
                  </span>
                )}
              </div>
            </li>
            {(hitosDelPaso.get(i) ?? []).map((h, j) => renderHito(h, `${i}-${j}`))}
            </Fragment>
          );
        })}
      </ol>

      {/* Se dice una vez acá y no en cada renglón: son once pasos y repetirlo los llena
          de texto que ya se leyó. */}
      <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-2">
        El tiempo de cada renglón es lo que la requisición se quedó en ese estado,
        desde que entró hasta el siguiente movimiento; lo que tardó quien hizo la
        acción es el tiempo del renglón anterior. Descuenta fines de semana y festivos
        colombianos, y cuenta las 24 horas de cada día hábil. Los plazos son los que el
        sistema exige para cada estado y vencen al cierre de la jornada del día hábil
        que toca —4:30 p. m., y 4:00 p. m. los viernes—: por eso un paso puede haberse
        quedado «1 día hábil» y seguir a tiempo.
        {hitos.length > 0 && (
          <>
            {' '}Los renglones con recibo son hitos de la factura, no estados de la
            requisición: van en su sitio por fecha y no tienen plazo. Los marcados con °
            son fechas digitadas por quien envió la factura, no registradas por el
            sistema.
          </>
        )}
        {enviadasSinFecha.length > 0 && (
          <>
            {' '}
            <span className="text-amber-700">
              {enviadasSinFecha.length === 1
                ? `La factura ${enviadasSinFecha[0]} está marcada como enviada a Contabilidad pero sin ninguna fecha, así que no puede ubicarse en la línea.`
                : `Las facturas ${enviadasSinFecha.join(', ')} están marcadas como enviadas a Contabilidad pero sin ninguna fecha, así que no pueden ubicarse en la línea.`}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
