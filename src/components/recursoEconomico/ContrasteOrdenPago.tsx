import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, ScanText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  filasDeLaOrden, fmtCOP, type BloqueContraste,
} from '@/services/recursoEconomico.service';
import { GuardarContraste, SelloContraste } from './ContrasteGuardado';
import { extraerOrdenPago, leerOrdenPagoPdf, type LecturaOrdenPago } from '@/utils/ordenPago';
import { ocrDelPdf, type ProgresoOcr } from '@/utils/ocrPdf';
import { FilaComparada, type RetencionEsperada } from './ContrasteFactura';

/**
 * La orden de pago del municipio contra lo que el sistema tiene asentado.
 *
 * Es el otro extremo del ciclo. La factura dice **lo que se cobró**; la orden de pago
 * dice **lo que el municipio manda girar**, y entre las dos está lo que se retiene. Por
 * eso este contraste hace lo que el de la factura no puede: la factura casi nunca trae
 * las retenciones —las practica quien paga, no quien factura—, y acá sí están, con su
 * tarifa. Cotejarlas es la única forma de saber si el municipio retuvo lo que se
 * esperaba, antes de que el dinero llegue y no cuadre.
 *
 * La orden no es una tabla sino una carta a la fiduciaria, con las cifras metidas en las
 * frases; de leerla se encarga `utils/ordenPago`. Acá solo se enfrentan sus cifras con
 * las asentadas.
 *
 * Como todo en esta pantalla: el archivo se lee en el navegador, no se sube ni se
 * guarda, y no llena ningún campo.
 */

/**
 * Lo que se perdona al comparar.
 *
 * El sistema redondea cada retención al peso —es lo que va a la orden de pago— y la
 * carta del municipio las trae con centavos: $ 348.363.979,60 contra $ 348.363.979. Con
 * dos retenciones redondeadas, la diferencia acumulada no pasa de dos pesos, y ese es el
 * tope. Sin esta holgura toda orden correcta se pintaría en rojo, y a fuerza de alarmas
 * falsas nadie mira las ciertas.
 */
const TOLERANCIA = 2;

export function ContrasteOrdenPago({
  subtotal, pago, retenciones, periodo,
  guardado, quien, onGuardar, onBorrar, guardando = false, borrando = false,
}: {
  /** AOM + inversión + otros, como lo tiene el sistema. */
  subtotal: number;
  /** El subtotal menos las retenciones: lo que se espera recibir. */
  pago: number;
  retenciones: RetencionEsperada[];
  /** 'YYYY-MM' del mes facturado. */
  periodo: string;
  /** El contraste que ya quedó guardado de este mes, si lo hay. */
  guardado?: BloqueContraste;
  quien?: { nombre: string; rol?: string; fecha: string };
  onGuardar?: (bloque: BloqueContraste) => void | Promise<void>;
  onBorrar?: () => void | Promise<void>;
  guardando?: boolean;
  borrando?: boolean;
}) {
  /** La orden ya buena para comparar. */
  const [orden, setOrden] = useState<LecturaOrdenPago | null>(null);
  /**
   * Lo que propuso el reconocedor, todavía sin confirmar.
   *
   * Va en su propio estado y no en `orden` a propósito: mientras esté acá no se compara
   * nada. Una cifra que salió de leer una imagen no puede entrar al cotejo sin que una
   * persona la haya mirado.
   */
  const [propuesta, setPropuesta] = useState<LecturaOrdenPago | null>(null);
  /** El archivo que resultó ser un escaneo y espera que le den permiso de reconocerlo. */
  const [escaneo, setEscaneo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState<ProgresoOcr | null>(null);
  const [archivo, setArchivo] = useState<string>('');
  /**
   * Si lo que se está comparando salió de reconocer una imagen y no de la capa de texto.
   *
   * Se guarda con el contraste porque cambia cuánto vale la constancia: una cifra que una
   * persona confirmó después de un OCR no es lo mismo que una que venía escrita en el PDF,
   * y quien lea el registro dentro de tres meses tiene que poder distinguirlas.
   */
  const [porOcr, setPorOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setOrden(null); setPropuesta(null); setEscaneo(null); setProgreso(null); setError(null);
    setPorOcr(false);
  };

  const cargar = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    limpiar();
    setArchivo(file.name);
    try {
      setOrden(await leerOrdenPagoPdf(await file.arrayBuffer()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      /*
       * El escaneo no es un error del usuario sino el caso corriente: las órdenes llegan
       * fotocopiadas. En vez de dejarlo en un mensaje rojo, se le ofrece el otro camino.
       */
      if (/escaneada/.test(msg)) setEscaneo(file);
      else setError(msg || 'No se pudo leer el PDF de la orden de pago.');
    } finally {
      setLeyendo(false);
      // Para que volver a cargar el mismo archivo dispare el evento otra vez.
      if (entrada.current) entrada.current.value = '';
    }
  };

  const reconocer = async () => {
    if (!escaneo) return;
    setLeyendo(true);
    setError(null);
    setProgreso({ pagina: 1, paginas: 1, avance: 0 });
    try {
      const renglones = await ocrDelPdf(await escaneo.arrayBuffer(), setProgreso);
      setPropuesta(extraerOrdenPago(renglones));
      setEscaneo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la imagen.');
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  if (subtotal <= 0) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white">
      <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center justify-between gap-3">
        <span>CONTRASTE CON LA ORDEN DE PAGO</span>
        {orden && (
          <button
            type="button"
            onClick={limpiar}
            className="font-normal text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))] flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> quitar
          </button>
        )}
      </header>

      <div className="p-4 space-y-3">
        {/*
          Con un contraste guardado, lo primero es lo que ya se revisó: quien vuelve a un
          mes revisado viene a mirar qué salió, no a repetirlo.
        */}
        {!orden && !propuesta && !escaneo && guardado && (
          <SelloContraste
            bloque={guardado}
            quien={quien}
            ahora={filasDeLaOrden(subtotal, pago, retenciones)}
            documento="la orden de pago"
            onBorrar={() => void onBorrar?.()}
            borrando={borrando}
          />
        )}

        {!orden && !propuesta && !escaneo && !guardado && (
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            Cargue el <strong>PDF</strong> de la orden de pago —la carta con que el municipio
            le pide a la fiduciaria que gire— y el sistema compara el valor presentado, cada
            retención y el neto a girar con lo asentado. Es donde se puede revisar si
            retuvieron lo que correspondía: la factura no trae las retenciones.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={entrada}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void cargar(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={leyendo}
            onClick={() => entrada.current?.click()}
          >
            {leyendo
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Leyendo…</>
              : <><FileUp className="w-4 h-4 mr-2" /> {orden ? 'Cargar otra orden' : 'Cargar la orden de pago (PDF)'}</>}
          </Button>
          {orden && (
            <span className="text-xs text-[hsl(var(--canalco-neutral-500))] truncate max-w-[22rem]">
              {archivo}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}

        {/*
          El escaneo no se reconoce solo. Leer una imagen tarda y gasta memoria, y sobre
          todo entrega cifras que hay que revisar: conviene que sea una decisión y no algo
          que pasa por haber soltado un archivo.
        */}
        {escaneo && !leyendo && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-3 space-y-2">
            <p className="text-sm text-amber-900 flex items-start gap-2">
              <ScanText className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Este PDF es un escaneo: es una foto del papel y no trae texto que leer. Se
                le puede pasar un <strong>reconocedor de texto</strong> a la imagen, que
                propone las cifras para que usted las revise antes de comparar nada.
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void reconocer()}>
              <ScanText className="w-4 h-4 mr-2" /> Leer la imagen
            </Button>
          </div>
        )}

        {progreso && (
          <div className="rounded-md bg-[hsl(var(--canalco-neutral-100))] px-3 py-2">
            <p className="text-xs text-[hsl(var(--canalco-neutral-700))] flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Leyendo la imagen · página {progreso.pagina} de {progreso.paginas}
            </p>
            <div className="mt-1.5 h-1.5 rounded-full bg-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div
                className="h-full bg-[hsl(var(--canalco-primary))] transition-all"
                style={{ width: `${Math.round(progreso.avance * 100)}%` }}
              />
            </div>
          </div>
        )}

        {propuesta && (
          <Revision
            propuesta={propuesta}
            retenciones={retenciones}
            onConfirmar={(confirmada) => { setPropuesta(null); setOrden(confirmada); setPorOcr(true); }}
            onDescartar={limpiar}
          />
        )}

        {orden && (
          <Resultado
            orden={orden}
            subtotal={subtotal}
            pago={pago}
            retenciones={retenciones}
            periodo={periodo}
            archivo={archivo}
            origen={porOcr ? 'ocr' : 'texto'}
            guardado={guardado}
            onGuardar={onGuardar}
            guardando={guardando}
          />
        )}
      </div>
    </div>
  );
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function Resultado({
  orden, subtotal, pago, retenciones, periodo, archivo, origen,
  guardado, onGuardar, guardando,
}: {
  orden: LecturaOrdenPago;
  subtotal: number;
  pago: number;
  retenciones: RetencionEsperada[];
  periodo: string;
  /** El nombre del archivo que se cargó, para dejarlo en la constancia. */
  archivo: string;
  /** Si las cifras salieron de la capa de texto del PDF o de reconocer la imagen. */
  origen: 'texto' | 'ocr';
  guardado?: BloqueContraste;
  onGuardar?: (bloque: BloqueContraste) => void | Promise<void>;
  guardando?: boolean;
}) {
  const totalRetenidoSistema = subtotal - pago;

  /** Lo que la orden retuvo por cada concepto del sistema. */
  const enLaOrden = (key: string): number | null =>
    orden.retenciones.find((r) => r.key === key)?.valor ?? null;

  const porcentajeEnLaOrden = (key: string): number | null =>
    orden.retenciones.find((r) => r.key === key)?.porcentaje ?? null;

  /*
   * El total de descuentos se toma de la propia carta si lo dice, y si no se suma lo que
   * se le encontró. No es lo mismo: si la carta declara un total que no cuadra con sus
   * propias retenciones, eso es un hallazgo —y se avisa aparte—, no algo que se deba
   * tapar sumando por nuestra cuenta.
   */
  const sumaRetenciones = orden.retenciones.reduce((s, r) => s + r.valor, 0);
  const totalOrden = orden.totalDescuentos ?? (orden.retenciones.length > 0 ? sumaRetenciones : null);

  const avisos: string[] = [];

  if (orden.totalDescuentos != null && orden.retenciones.length > 0
      && Math.abs(orden.totalDescuentos - sumaRetenciones) > TOLERANCIA) {
    avisos.push(
      `La orden no cuadra consigo misma: dice descontar ${fmtCOP(Math.round(orden.totalDescuentos))} `
      + `pero sus retenciones suman ${fmtCOP(Math.round(sumaRetenciones))}.`,
    );
  }

  if (orden.valorPresentado != null && orden.valorNeto != null && totalOrden != null
      && Math.abs(orden.valorPresentado - totalOrden - orden.valorNeto) > TOLERANCIA) {
    avisos.push(
      'En la orden, el valor presentado menos los descuentos no da el neto a girar. '
      + 'Revise el documento antes de darlo por bueno.',
    );
  }

  if (orden.mesServicio) {
    const mesPantalla = MESES[Number(periodo.split('-')[1]) - 1];
    if (orden.mesServicio !== mesPantalla) {
      avisos.push(
        `La orden habla del servicio de ${orden.mesServicio} y en pantalla está `
        + `${mesPantalla}. Revise que sea la orden de este mes.`,
      );
    }
  }

  // Las retenciones que el municipio practicó y el sistema no esperaba.
  for (const r of orden.retenciones) {
    const esperada = retenciones.find((x) => x.key === r.key);
    if (esperada && esperada.valor == null) {
      avisos.push(
        `El municipio descontó ${r.nombre} por ${fmtCOP(Math.round(r.valor))}, y en `
        + 'Parámetros ese concepto está como «no aplica» para este municipio.',
      );
    }
  }

  const difNeto = orden.valorNeto == null ? null : Math.round(orden.valorNeto) - Math.round(pago);

  /*
   * Lo que se guardaría: las mismas cifras que están a la vista.
   *
   * `cuadra` se mide por el neto a girar y no por el valor presentado, porque el neto es
   * la cifra que de verdad se va a recibir: una orden con el presentado bueno y el neto
   * malo es una orden que no cuadra. Se acepta la tolerancia de dos pesos por la misma
   * razón que en la tabla: la orden trae centavos y el sistema redondea al peso.
   */
  const bloqueGuardable: BloqueContraste = {
    archivo,
    fuente: origen,
    referencia: orden.oficio || orden.numeroFactura || null,
    fecha: orden.mesServicio ?? null,
    filas: [
      { key: 'presentado', label: 'Valor presentado', sistema: subtotal, documento: orden.valorPresentado },
      ...retenciones.map((r) => ({
        key: r.key,
        label: r.label,
        sistema: r.valor,
        documento: enLaOrden(r.key),
      })),
      { key: 'retenido', label: 'Total retenido', sistema: totalRetenidoSistema, documento: totalOrden },
      { key: 'neto', label: 'Neto a girar', sistema: pago, documento: orden.valorNeto },
    ],
    cuadra: difNeto != null && Math.abs(difNeto) <= TOLERANCIA,
    avisos,
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Dato termino="Factura que manda pagar" valor={orden.numeroFactura ?? '—'} />
        <Dato termino="Oficio" valor={orden.oficio ?? '—'} />
        <Dato termino="Municipio" valor={orden.municipio ?? '—'} />
        <Dato termino="Servicio del mes" valor={orden.mesServicio ?? '—'} />
      </dl>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[hsl(var(--canalco-neutral-600))]">
            <th className="text-left font-semibold py-1.5">Concepto</th>
            <th className="text-right font-semibold py-1.5">En el sistema</th>
            <th className="text-right font-semibold py-1.5">En la orden</th>
            <th className="text-right font-semibold py-1.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
          <FilaComparada
            concepto="Valor presentado"
            sistema={subtotal}
            documento={orden.valorPresentado}
            tolerancia={TOLERANCIA}
            fuerte
          />

          {retenciones.map((r) => {
            const pct = porcentajeEnLaOrden(r.key);
            return (
              <FilaComparada
                key={r.key}
                concepto={r.label}
                sistema={r.valor}
                documento={enLaOrden(r.key)}
                tolerancia={TOLERANCIA}
                nota={
                  r.valor == null && enLaOrden(r.key) == null
                    ? 'no aplica en este municipio'
                    : pct != null ? `la orden retiene al ${pct}%` : undefined
                }
              />
            );
          })}

          <FilaComparada
            concepto="Total retenido"
            sistema={totalRetenidoSistema > 0 ? totalRetenidoSistema : null}
            documento={totalOrden}
            tolerancia={TOLERANCIA}
          />

          <FilaComparada
            concepto="Neto a girar"
            sistema={pago}
            documento={orden.valorNeto}
            tolerancia={TOLERANCIA}
            fuerte
          />
        </tbody>
      </table>

      {/* El veredicto es el neto: es la plata que de verdad va a entrar. */}
      {difNeto == null ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>La orden no dice cuánto se gira: sin esa cifra no hay contraste del neto.</span>
        </p>
      ) : Math.abs(difNeto) <= TOLERANCIA ? (
        <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>
            El municipio gira lo que el sistema esperaba.
            {difNeto !== 0 && ` La diferencia de ${fmtCOP(Math.abs(difNeto))} es el redondeo al peso.`}
          </span>
        </p>
      ) : (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El neto a girar difiere en <strong>{fmtCOP(Math.abs(difNeto))}</strong>: el
            municipio va a girar {difNeto > 0 ? 'más' : 'menos'} de lo que el sistema
            esperaba. Mire arriba en cuál renglón se abre la diferencia.
          </span>
        </p>
      )}

      {avisos.map((a) => (
        <p key={a} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{a}</span>
        </p>
      ))}

      {/*
        El texto leído. La orden es una carta y las cifras se sacan de sus frases: si algo
        sale raro, acá se ve si fue porque se leyó otro número.
      */}
      <details className="text-xs">
        <summary className="cursor-pointer text-[hsl(var(--canalco-neutral-600))] font-medium">
          El texto que se leyó de la orden ({orden.lineas.length} renglones)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap bg-[hsl(var(--canalco-neutral-100))] rounded-md p-3 text-[11px] leading-relaxed">
          {orden.lineas.join('\n')}
        </pre>
      </details>

      {/* Guardar va al final, después del veredicto: es lo último que se hace. */}
      {onGuardar && (
        <GuardarContraste
          onGuardar={() => void onGuardar(bloqueGuardable)}
          guardando={!!guardando}
          guardado={guardado}
          etiqueta="el contraste de la orden"
        />
      )}
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[hsl(var(--canalco-neutral-500))]">{termino}</dt>
      <dd className="font-medium text-[hsl(var(--canalco-neutral-800))] truncate" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * Las cifras que propuso el reconocedor, para revisarlas antes de comparar.
 *
 * Este paso es el que hace aceptable leer una imagen en un cotejo de plata. El
 * reconocedor confunde un 3 con un 8 y se come un punto de millar, y una cifra así no se
 * puede meter a una comparación que después alguien firma. Acá se ven todas juntas, se
 * corrigen las que estén mal, y solo entonces entran.
 *
 * Se muestra el texto reconocido al lado para poder cotejar sin abrir el PDF aparte.
 */
function Revision({ propuesta, retenciones, onConfirmar, onDescartar }: {
  propuesta: LecturaOrdenPago;
  retenciones: RetencionEsperada[];
  onConfirmar: (o: LecturaOrdenPago) => void;
  onDescartar: () => void;
}) {
  /** Lo escrito en cada casilla. Se guarda como texto: es lo que la persona teclea. */
  const [campos, setCampos] = useState<Record<string, string>>(() => {
    const num = (v: number | null) => (v == null ? '' : String(v));
    const base: Record<string, string> = {
      valorPresentado: num(propuesta.valorPresentado),
      totalDescuentos: num(propuesta.totalDescuentos),
      valorNeto: num(propuesta.valorNeto),
    };
    for (const r of retenciones) {
      base[r.key] = num(propuesta.retenciones.find((x) => x.key === r.key)?.valor ?? null);
    }
    return base;
  });

  const set = (k: string, v: string) => setCampos((p) => ({ ...p, [k]: v }));

  /** Vacío es «la orden no lo dice», que no es lo mismo que cero. */
  const cifra = (k: string): number | null => {
    const t = (campos[k] ?? '').trim();
    if (!t) return null;
    const n = Number(t.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const confirmar = () => {
    onConfirmar({
      ...propuesta,
      valorPresentado: cifra('valorPresentado'),
      totalDescuentos: cifra('totalDescuentos'),
      valorNeto: cifra('valorNeto'),
      retenciones: retenciones
        .map((r) => {
          const valor = cifra(r.key);
          if (valor == null) return null;
          const previa = propuesta.retenciones.find((x) => x.key === r.key);
          return {
            key: r.key,
            nombre: previa?.nombre ?? r.label,
            valor,
            porcentaje: previa?.porcentaje ?? null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 space-y-3">
      <p className="text-sm text-amber-900 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Estas cifras las leyó un reconocedor sobre la imagen: <strong>todavía no se ha
          comparado nada</strong>. Revíselas contra el documento y corrija lo que esté mal.
          Deje en blanco lo que la orden no diga.
        </span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <Casilla etiqueta="Valor presentado" valor={campos.valorPresentado} onValor={(v) => set('valorPresentado', v)} />
        {retenciones.map((r) => (
          <Casilla key={r.key} etiqueta={r.label} valor={campos[r.key] ?? ''} onValor={(v) => set(r.key, v)} />
        ))}
        <Casilla etiqueta="Total descuentos" valor={campos.totalDescuentos} onValor={(v) => set('totalDescuentos', v)} />
        <Casilla etiqueta="Neto a girar" valor={campos.valorNeto} onValor={(v) => set('valorNeto', v)} />
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-amber-900 font-medium">
          El texto que reconoció ({propuesta.lineas.length} renglones)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap bg-white rounded-md p-3 text-[11px] leading-relaxed border border-amber-200">
          {propuesta.lineas.join('\n')}
        </pre>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={confirmar}>
          <CheckCircle2 className="w-4 h-4 mr-2" /> Confirmar y comparar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDescartar}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

function Casilla({ etiqueta, valor, onValor }: {
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[hsl(var(--canalco-neutral-700))]">{etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        inputMode="decimal"
        placeholder="no la dice"
        className="w-44 h-8 px-2 text-right tabular-nums text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
    </label>
  );
}
