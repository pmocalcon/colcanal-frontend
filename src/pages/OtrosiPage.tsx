import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { MembreteOficio, BloqueControl } from '@/components/juridica/camposDocumento';

/**
 * Otrosí al contrato. Se firma **después** del acta de inicio, sobre un contrato que ya
 * está corriendo: prorroga el plazo, adiciona el valor o precisa las obligaciones.
 *
 * A diferencia de los otros documentos del trámite, aquí no hay uno sino **varios**: el
 * mismo contrato puede modificarse más de una vez, cada otrosí se numera y los siguientes
 * citan a los anteriores («…modificar el contrato y el Otrosí No. 01»). Por eso se guarda
 * una lista en `data.otrosies.lista` y la pantalla tiene un selector arriba.
 *
 * Los antecedentes y las cláusulas son listas editables y no un número fijo de párrafos:
 * un Otrosí No. 03 arrastra más antecedentes que el No. 01, y clavar cinco obligaría a
 * escribir dos modificaciones dentro del mismo literal.
 *
 * Ruta: `.../juridica/:id/otrosi`.
 */

/**
 * Los módulos del otrosí: qué se está modificando.
 *
 * El modelo es modular a propósito y su control lo dice: «activar solo los módulos que
 * correspondan al caso». Un otrosí que solo prorroga no debe llevar una cláusula de valor
 * en blanco, porque una cláusula vacía en un documento firmado no se lee como «no aplica»
 * sino como un descuido.
 *
 * `adicion` y `formaPago` alimentan la misma cláusula —así la trae el modelo, «modificación
 * del valor y forma de pago»— pero se activan por separado: se puede adicionar sin cambiar
 * la forma de pago, y al revés.
 */
const MODULOS_OTROSI = [
  { clave: 'prorroga', label: 'Prórroga del plazo' },
  { clave: 'adicion', label: 'Adición del valor' },
  { clave: 'formaPago', label: 'Forma de pago' },
  { clave: 'obligaciones', label: 'Obligaciones' },
  { clave: 'otra', label: 'Otra modificación' },
];

/** Los ordinales de las cláusulas. Se asignan por posición: ver el cálculo en el render. */
const ORDINAL_CLAUSULA = [
  'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA',
  'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA',
];

interface Otrosi {
  /** Número de este otrosí dentro del contrato: «02». Sale en el título y en el cuerpo. */
  numero: string;

  // ── Control interno de parametrización, no se imprime ──
  /** Claves de `MODULOS_OTROSI` activas. */
  modulos: string[];
  contratoFuente: string;
  validacionJuridica: string;
  /**
   * El submódulo de la cláusula de obligaciones para los contratos de apoyo a la Dirección
   * Jurídica. Va aparte porque no es una modificación más: es un régimen de reparto y visto
   * bueno previo que solo aplica a esos contratos.
   */
  apoyoJuridico: boolean;

  // ── Identificación del contrato ──
  contratanteNit: string;
  contratoPrincipal: string;
  fechaContrato: string;
  objeto: string;
  valorVigente: string;
  plazoVigente: string;
  otrosiesAnteriores: string;
  garantias: string;
  /** Desde cuándo produce efectos lo modificado. */
  fechaEfectos: string;
  /** Quién lo elaboró. Quien revisa y aprueba es siempre Jurídica. */
  elaboro: string;

  tipologia: string;
  contratante: string;
  /** Quien firma por la contratante, y la contratista con su identificación. */
  firmanteNombre: string;
  firmanteCargo: string;
  contratista: string;
  contratistaCc: string;
  /**
   * El cuadro de valores de la versión anterior del formato. El modelo nuevo redacta el
   * valor en prosa y ya no lo lleva, pero los campos se conservan para no borrar las cifras
   * de los otrosíes guardados con él: si un documento viejo se vuelve a guardar, lo que
   * decía sigue ahí.
   */
  valorInicial: string;
  valorOtrosi01: string;
  valorOtrosi02: string;
  valorAcumulado: string;
  antecedentes: string[];
  /** Las obligaciones numeradas de la cláusula tercera. */
  obligaciones: string[];
  clausulas: { titulo: string; texto: string }[];
  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const ANTECEDENTE_NUEVO = '';

const nuevoOtrosi = (numero: string, base: Partial<Otrosi>): Otrosi => ({
  numero,

  // Nace sin módulos: los enciende Jurídica contra el contrato, como pide el control.
  modulos: [],
  contratoFuente: '[NÚMERO / FECHA / CLÁUSULAS A MODIFICAR]',
  validacionJuridica: '[NOMBRE / FECHA / APROBADO]',
  apoyoJuridico: false,

  contratanteNit: '900.456.735-7',
  contratoPrincipal: '[NÚMERO / IDENTIFICACIÓN]',
  fechaContrato: '[FECHA]',
  objeto: '',
  valorVigente: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR]) [IVA INCLUIDO / MÁS IVA / NO APLICA]',
  plazoVigente: '[FECHA INICIAL] a [FECHA FINAL]',
  otrosiesAnteriores: 'No aplica',
  garantias: 'No aplican al contrato',
  fechaEfectos: '[FECHA]',
  elaboro: '',

  tipologia: '',
  contratante: '',
  firmanteNombre: '',
  firmanteCargo: 'Representante Legal',
  contratista: '',
  contratistaCc: 'C.C. xxxx, xx',
  // Las celdas del cuadro llevan los huecos del formato como valor y no como
  // `placeholder`: el placeholder se ve en pantalla pero no se imprime, y el otrosí en
  // blanco tiene que poder imprimirse para diligenciarlo a mano.
  valorInicial: 'x',
  valorOtrosi01: 'x',
  valorOtrosi02: 'x',
  valorAcumulado: '$ x',
  // Los cinco literales del formato: suscripción, vigencia, valor, el otrosí anterior y la
  // voluntad de modificar. Se dejan vacíos para que cada uno caiga sobre su plantilla y
  // solo se guarde lo que se reescriba.
  antecedentes: ['', '', '', '', ''],
  obligaciones: ['', '', '', '', '', ''],
  clausulas: [],
  textos: {},
  ...base,
});

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/** El otrosí modifica un contrato en ejecución: antes del acta no hay qué modificar. */
const HABILITADO = ['en_acta_inicio', 'finalizado'];

const tx = (v: string) => (v?.trim() ? v : '…');

export default function OtrosiPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [lista, setLista] = useState<Otrosi[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const f = lista[idx];

  /** Datos del contrato que el otrosí cita. Salen de la solicitud, no se vuelven a pedir. */
  const delContrato = useMemo(() => {
    const d = sol?.data ?? {};
    return {
      tipologia: getTipo(d.tipoContrato)?.nombre || 'Prestación de servicios',
      contratante: d.empresa || '',
      contratista: d.contratista || '',
      objeto: d.alcanceServicio || d.objetoProyecto || '',
    };
  }, [sol]);

  const set = <K extends keyof Otrosi>(k: K, v: Otrosi[K]) =>
    setLista((l) => l.map((o, i) => (i === idx ? { ...o, [k]: v } : o)));

  const alternarModulo = (clave: string) =>
    setLista((l) => l.map((o, i) => (i === idx
      ? {
        ...o,
        modulos: (o.modulos ?? []).includes(clave)
          ? (o.modulos ?? []).filter((x) => x !== clave)
          : [...(o.modulos ?? []), clave],
      }
      : o)));

  /*
   * Qué cláusulas van y con qué ordinal.
   *
   * El ordinal se calcula por posición y no se guarda: el modelo está hecho para omitir las
   * que no apliquen, y un otrosí que solo prorroga tiene que llamar «PRIMERA» a su cláusula
   * de plazo. Numerarlas fijo dejaría un documento firmado que empieza en la SEGUNDA.
   *
   * Garantías, aplicación y vigencia van siempre y cierran la lista: no son modificaciones
   * sino el marco de lo modificado.
   */
  const activos = f?.modulos ?? [];
  const modulares: string[] = [];
  if (activos.includes('adicion') || activos.includes('formaPago')) modulares.push('valor');
  if (activos.includes('prorroga')) modulares.push('plazo');
  if (activos.includes('obligaciones')) modulares.push('obligaciones');
  const extras = activos.includes('otra') ? (f?.clausulas?.length ?? 0) : 0;
  const ordinal = (i: number) => ORDINAL_CLAUSULA[i] ?? `N.º ${i + 1}`;
  const ordinalDe = (clave: string) => ordinal(modulares.indexOf(clave));
  /** Dónde empiezan las tres cláusulas fijas del cierre. */
  const inicioFijas = modulares.length + extras;

  // El contexto de textos se arma a mano y no con `useTextosDocumento` porque el estado no
  // es un documento sino una lista: lo que se reescribe pertenece al otrosí abierto.
  const textosCtx = useMemo(
    () => ({
      get: (clave: string, plantilla: string) => f?.textos?.[clave] ?? plantilla,
      set: (clave: string, valor: string) =>
        setLista((l) =>
          l.map((o, i) => (i === idx ? { ...o, textos: { ...(o.textos ?? {}), [clave]: valor } } : o)),
        ),
    }),
    [f?.textos, idx],
  );

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const guardado = (data.data?.otrosies ?? {}) as { lista?: Otrosi[] };
        setLista(guardado.lista ?? []);
      } catch {
        if (!cancelled) toast.error('No se pudieron cargar los otrosíes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const agregar = () => {
    // El número viene del formato, como todo lo demás: la plantilla es la del Otrosí No. 02.
    // Es una casilla del título y se cambia escribiendo encima.
    setLista((l) => [...l, nuevoOtrosi('02', {
      tipologia: delContrato.tipologia,
      contratante: delContrato.contratante,
      contratista: l[0]?.contratista || delContrato.contratista,
      // Sin nada que copiar del anterior, se deja el hueco del formato.
      contratistaCc: l[0]?.contratistaCc || 'C.C. xxxx, xx',
      // Quien firma por la contratante es siempre la representante legal, la misma que ya
      // va nombrada en la comparecencia. Se prellena para no teclearla dos veces.
      firmanteNombre: l[0]?.firmanteNombre || 'GLORIA LUCÍA ESCALANTE MANZANO',
      // El valor inicial es del contrato, no del otrosí: se copia del primero para no
      // volver a teclearlo —y para que los dos documentos no digan cifras distintas—.
      valorInicial: l[0]?.valorInicial || '',
    })]);
    setIdx(lista.length);
  };

  const eliminar = () => {
    // No se renumeran los que quedan: el No. 02 se llama así en el papel firmado y en los
    // otrosíes que lo citan. Renumerar aquí desmentiría documentos que ya existen.
    setLista((l) => l.filter((_, i) => i !== idx));
    setIdx((i) => Math.max(0, i - 1));
  };

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'otrosies', { lista });
      toast.success(lista.length === 1 ? 'Otrosí guardado' : 'Otrosíes guardados');
      return true;
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#16162b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Otrosí</h1>
            <p className="text-xs text-[#4a4a63]">Modificación al contrato · Solicitud N.º {solicitudId}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && lista.length > 0 && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="otrosi" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El otrosí aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Un otrosí modifica un contrato que ya está en ejecución: se habilita desde el acta de inicio.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : lista.length === 0 ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">Este contrato no tiene otrosíes.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se redacta uno cuando hay que prorrogar el plazo, adicionar el valor o precisar las obligaciones.</p>
            {editable && (
              <Button onClick={agregar} className="gap-2 mt-4 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
                <Plus className="w-4 h-4" /> Redactar el primer otrosí
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Selector: cuál otrosí se está viendo. Los anteriores no se archivan porque
                cada uno sigue vigente y el siguiente los cita por número. */}
            <div className="no-print mb-4 flex flex-wrap items-center gap-2">
              {lista.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={'rounded-lg px-3 py-1.5 text-sm transition-colors '
                    + (i === idx
                      ? 'bg-[#ffe81a] text-[#16162b] font-semibold'
                      : 'text-[#4a4a63] font-medium hover:bg-[#f6f6fa] hover:text-[#16162b]')}
                >
                  Otrosí No. {o.numero || i + 1}
                </button>
              ))}
              {editable && (
                <>
                  <Button variant="outline" size="sm" onClick={agregar} className="gap-1 ml-2 text-[#4a4a63] border-[#c9c9dc] hover:bg-[#f6f6fa]">
                    <Plus className="w-3.5 h-3.5" /> Nuevo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={eliminar} className="gap-1 text-[#4a4a63] hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar este
                  </Button>
                </>
              )}
            </div>

            <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
            <TextosDocumento value={textosCtx}>
            <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-10 py-8">
              <MembreteOficio
                titulo="OTROSÍ AL CONTRATO DE PRESTACIÓN DE SERVICIOS"
                subtitulo="MODELO MODULAR - SIN GARANTÍAS CONTRACTUALES"
              />

              <BloqueControl
                titulo="CONTROL INTERNO — NO SE IMPRIME"
                nota={
                  <>
                    Este modelo es <strong>sin garantías</strong>: úsalo solo si el contrato fuente
                    no las exige, o si Jurídica validó expresamente que la modificación no obliga a
                    constituirlas. Enciende únicamente los módulos que correspondan al caso.
                  </>
                }
              >
                <label className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Otrosí N.º</span>
                  <input
                    value={f.numero}
                    onChange={(e) => set('numero', e.target.value)}
                    placeholder="02"
                    className="w-24 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                  />
                </label>

                <div>
                  <p className="text-[11px] font-semibold text-[#4a4a63] mb-1.5">
                    Módulos a activar · {activos.length} de {MODULOS_OTROSI.length}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {MODULOS_OTROSI.map((m) => (
                      <label key={m.clave} className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activos.includes(m.clave)}
                          onChange={() => alternarModulo(m.clave)}
                          className="shrink-0"
                        />
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Solo tiene sentido ofrecerlo si se están modificando las obligaciones. */}
                {activos.includes('obligaciones') && (
                  <label className="flex items-start gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!f.apoyoJuridico}
                      onChange={(e) => set('apoyoJuridico', e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      Contrato de apoyo a la Dirección Jurídica
                      <span className="block text-[10.5px] text-[#8a6d00]">
                        Agrega el régimen de reparto y visto bueno previo. Actívalo únicamente si el
                        contrato es de esa clase.
                      </span>
                    </span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Contrato fuente</span>
                  <input
                    value={f.contratoFuente ?? ''}
                    onChange={(e) => set('contratoFuente', e.target.value)}
                    className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                  />
                </label>

                <label className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Validación jurídica</span>
                  <input
                    value={f.validacionJuridica ?? ''}
                    onChange={(e) => set('validacionJuridica', e.target.value)}
                    className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                  />
                </label>
              </BloqueControl>

              {/* Identificación del contrato */}
              <h2 className="text-center font-bold my-4">IDENTIFICACIÓN DEL CONTRATO</h2>

              <table className="w-full border-collapse text-[12px] mb-4">
                <tbody>
                  <FilaId label="Contratante">
                    <Celda value={f.contratante || delContrato.contratante} onChange={(v) => set('contratante', v)} placeholder="Razón social" />
                    <span className="shrink-0">- NIT</span>
                    <Celda value={f.contratanteNit ?? ''} onChange={(v) => set('contratanteNit', v)} />
                  </FilaId>
                  <FilaId label="Contratista">
                    <Celda value={f.contratista || delContrato.contratista} onChange={(v) => set('contratista', v)} placeholder="Nombre / razón social" />
                    <span className="shrink-0">-</span>
                    <Celda value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="CC / NIT" />
                  </FilaId>
                  <FilaId label="Contrato principal">
                    <Celda value={f.contratoPrincipal ?? ''} onChange={(v) => set('contratoPrincipal', v)} />
                    <span className="shrink-0">suscrito el</span>
                    <Celda value={f.fechaContrato ?? ''} onChange={(v) => set('fechaContrato', v)} />
                  </FilaId>
                  <FilaId label="Objeto">
                    <Celda value={f.objeto || delContrato.objeto} onChange={(v) => set('objeto', v)} placeholder="Objeto contractual" />
                  </FilaId>
                  <FilaId label="Valor vigente antes del otrosí">
                    <Celda value={f.valorVigente ?? ''} onChange={(v) => set('valorVigente', v)} />
                  </FilaId>
                  <FilaId label="Plazo vigente antes del otrosí">
                    <Celda value={f.plazoVigente ?? ''} onChange={(v) => set('plazoVigente', v)} />
                  </FilaId>
                  <FilaId label="Otrosíes anteriores">
                    <Celda value={f.otrosiesAnteriores ?? ''} onChange={(v) => set('otrosiesAnteriores', v)} />
                  </FilaId>
                  <FilaId label="Garantías">
                    <Celda value={f.garantias ?? ''} onChange={(v) => set('garantias', v)} />
                  </FilaId>
                </tbody>
              </table>

              {/* Comparecencia */}
              <div className="leading-relaxed text-[12.5px] text-justify">
                <TextoEd
                  k="v2.comparecencia"
                  plantilla={`Entre los suscritos, GLORIA LUCÍA ESCALANTE MANZANO, identificada con cédula de ciudadanía No. 66.651.423 expedida en El Cerrito, actuando en calidad de representante legal de ${tx(f.contratante || delContrato.contratante)}, identificada con NIT ${tx(f.contratanteNit)}, quien en adelante se denominará LA CONTRATANTE, y ${tx(f.contratista || delContrato.contratista)}, identificado(a) con ${tx(f.contratistaCc)}, quien en adelante se denominará EL/LA CONTRATISTA, hemos convenido celebrar el presente Otrosí No. ${f.numero || 'xx'} al contrato identificado anteriormente, previas las siguientes:`}
                />
              </div>

              {/* I. Antecedentes */}
              <h2 className="text-center font-bold my-4">I.&nbsp;&nbsp;&nbsp;ANTECEDENTES</h2>
              <ListaLiteral
                items={f.antecedentes}
                onChange={(v) => set('antecedentes', v)}
                clave="v2.ant"
                editable={editable}
                plantillas={PLANTILLAS_ANTECEDENTE}
                etiqueta="antecedente"
              />

              <h2 className="text-center font-bold my-4">II.&nbsp;&nbsp;&nbsp;CLÁUSULAS</h2>

              {modulares.length === 0 && (
                <p className="no-print text-[11.5px] text-[#8a8aa0] italic mb-2">
                  Sin módulos activos. Enciende arriba, en el control interno, lo que este otrosí
                  modifica. Las cláusulas de garantías, aplicación y vigencia van siempre.
                </p>
              )}

              {/* Valor y forma de pago. Se enciende con «adición» o con «forma de pago». */}
              {modulares.includes('valor') && (
                <div className="space-y-3 leading-relaxed text-[12.5px] text-justify">
                  <p><b>CLÁUSULA {ordinalDe('valor')}. MODIFICACIÓN DEL VALOR Y FORMA DE PAGO:</b></p>

                  {activos.includes('adicion') && (
                    <TextoEd
                      k="v2.c.valor"
                      plantilla="El valor total acumulado del contrato será de [VALOR EN LETRAS] PESOS M/CTE ($[VALOR]) [IVA INCLUIDO / MÁS IVA / NO APLICA]. El valor adicionado mediante el presente Otrosí corresponde a [VALOR EN LETRAS] PESOS M/CTE ($[VALOR])."
                    />
                  )}

                  {activos.includes('formaPago') && (
                    <>
                      <TextoEd
                        k="v2.c.formaPago"
                        plantilla="La forma de pago del valor adicionado será: [FORMA DE PAGO / PERIODOS / VALORES / REQUISITOS]."
                      />
                      <TextoEd
                        k="v2.c.requisitos"
                        plantilla="Los pagos se efectuarán previa presentación de [FACTURA / CUENTA DE COBRO], informe o entregable correspondiente, certificación o visto bueno del supervisor cuando aplique y acreditación de los aportes al Sistema de Seguridad Social Integral exigibles al período objeto de cobro. Se efectuarán las retenciones y deducciones legalmente procedentes."
                      />
                    </>
                  )}
                </div>
              )}

              {/* Prórroga del plazo. */}
              {modulares.includes('plazo') && (
                <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                  <p><b>CLÁUSULA {ordinalDe('plazo')}. MODIFICACIÓN DEL PLAZO:</b></p>
                  <TextoEd
                    k="v2.c.plazo"
                    plantilla="El plazo total de ejecución quedará comprendido entre el [FECHA INICIAL] y el [FECHA FINAL]. La prórroga acordada mediante este Otrosí inicia el [FECHA] y finaliza el [FECHA]. Cualquier prórroga posterior deberá constar por escrito y ser suscrita por quienes se encuentren facultados."
                  />
                </div>
              )}

              {/* Obligaciones, con su submódulo de apoyo jurídico. */}
              {modulares.includes('obligaciones') && (
                <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                  <p><b>CLÁUSULA {ordinalDe('obligaciones')}. MODIFICACIÓN DE OBLIGACIONES:</b></p>
                  <TextoEd
                    k="v2.c.oblIntro"
                    plantilla="A partir del [FECHA], las obligaciones de EL/LA CONTRATISTA serán las siguientes:"
                  />

                  <ListaLiteral
                    items={f.obligaciones}
                    onChange={(v) => set('obligaciones', v)}
                    clave="v2.obl"
                    marca="numero"
                    editable={editable}
                    plantillas={PLANTILLAS_OBLIGACION}
                    etiqueta="obligación"
                  />

                  {/* El régimen de apoyo jurídico no es una obligación más de la lista:
                      cambia quién decide y qué necesita visto bueno antes de salir. Por eso
                      va como bloque aparte y solo cuando el contrato es de esa clase. */}
                  {f.apoyoJuridico && (
                    <div className="pt-1 space-y-2">
                      <p><b>MÓDULO OPCIONAL - CONTRATOS DE APOYO A LA DIRECCIÓN JURÍDICA</b></p>
                      <TextoEd
                        k="v2.c.apoyo"
                        plantilla="Los asuntos serán asignados mediante reparto por la Directora Jurídica o quien formalmente haga sus veces. Todo concepto, proyecto, informe, respuesta, memorial, recurso, comunicación o documento elaborado deberá someterse a revisión y visto bueno previo antes de su firma, radicación, remisión o presentación a terceros. La asignación de un asunto no confiere facultades autónomas de decisión, aprobación o representación, salvo poder o autorización formal para la actuación específica."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Las demás modificaciones, cuando el caso trae alguna que no encaja arriba. */}
              {activos.includes('otra') && (
                <Clausulas
                  items={f.clausulas}
                  onChange={(v) => set('clausulas', v)}
                  editable={editable}
                  desde={modulares.length}
                />
              )}

              {/* Las tres que van siempre. La de garantías es la que sostiene que este
                  modelo se puede usar: si el contrato principal sí las exige, lo dice y
                  advierte que la plantilla no sirve sin el ajuste y la aprobación previa. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA {ordinal(inicioFijas)}. GARANTÍAS:</b></p>
                <TextoEd
                  k="v2.c.garantias"
                  plantilla="Las partes dejan constancia de que, conforme al contrato fuente y a la validación jurídica efectuada para el presente caso, no se exige constitución de garantía contractual para la ejecución de este Otrosí. Si el contrato principal sí exige garantías o la modificación altera riesgos que deban ser amparados, esta plantilla no deberá utilizarse sin el ajuste correspondiente y la aprobación previa de la garantía."
                />
              </div>

              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA {ordinal(inicioFijas + 1)}. APLICACIÓN DE LAS MODIFICACIONES:</b></p>
                <TextoEd
                  k="v2.c.aplicacion"
                  plantilla={`Las modificaciones contenidas en el presente Otrosí producirán efectos a partir del ${tx(f.fechaEfectos)}, salvo que en una cláusula específica se establezca una fecha distinta.`}
                />
              </div>

              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA {ordinal(inicioFijas + 2)}. VIGENCIA DE LAS DEMÁS ESTIPULACIONES:</b></p>
                <TextoEd
                  k="v2.c.vigencia"
                  plantilla="Las cláusulas y condiciones del contrato principal y de sus modificatorios anteriores que no hayan sido expresamente modificadas mediante el presente Otrosí conservan plena vigencia y fuerza obligatoria."
                />
              </div>

              {/* Suscripción y firmas */}
              <div className="leading-relaxed text-[12.5px] text-justify mt-5">
                <TextoEd k="v2.suscripcion" plantilla="Para constancia, se suscribe en Santiago de Cali, Valle del Cauca, el [DÍA] de [MES] de [AÑO]." />
              </div>

              <div className="grid grid-cols-2 gap-10 mt-16 text-[12px]">
                <div className="border-t border-[#0a2a52] pt-1 space-y-0.5">
                  <FLine value={f.firmanteNombre} onChange={(v) => set('firmanteNombre', v)} placeholder="NOMBRE DE QUIEN FIRMA" bold />
                  <FLine value={f.firmanteCargo} onChange={(v) => set('firmanteCargo', v)} placeholder="Representante Legal" />
                  <FLine value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="EMPRESA CONTRATANTE" />
                  <p className="font-bold">LA CONTRATANTE</p>
                </div>
                <div className="border-t border-[#0a2a52] pt-1 space-y-0.5">
                  <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="NOMBRE / RAZÓN SOCIAL" bold />
                  <FLine value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="CC / NIT" />
                  <p className="font-bold">EL/LA CONTRATISTA</p>
                </div>
              </div>

              <PieMembrete />
            </div>
            {/* Quien elabora varía; Jurídica revisa y aprueba. El modelo distingue las dos
                cosas, y aprobar no es lo mismo que haber redactado. */}
            <div className="px-8 pt-3 text-[10px] text-black">
              <span>Elaboró: </span>
              <input
                value={f.elaboro ?? ''}
                onChange={(e) => set('elaboro', e.target.value)}
                placeholder="Nombre - Cargo"
                className="bg-transparent outline-none text-[10px] w-64 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
              />
            </div>
            <PieElaboracion soloRevision etiqueta="Revisó y aprobó" className="pt-0" />
            </TextosDocumento>
            </fieldset>
          </>
        )}

        {habilitada && !editable && lista.length > 0 && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede redactar otrosíes. Puedes consultarlos e imprimirlos.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Plantillas ─────────────────────────────────────────── */

/**
 * Los cinco antecedentes, con el texto del formato tal cual. Los huecos van con la misma
 * convención del documento —«xxx», «(0x)», «20xx»— y no con puntos suspensivos: es lo que
 * Jurídica reconoce como «falta llenar esto» al leerlo.
 *
 * Ojo con el literal B: trae fechas de un contrato concreto porque así viene el formato.
 * Se reescriben en cada otrosí; si no se tocan, se imprimen tal como están.
 */
const PLANTILLAS_ANTECEDENTE = [
  'El día xxx (0x) de x de 20xx, las partes suscribieron un contrato de prestación de servicios, cuyo objeto consiste en la "PRESTACIÓN DE SERVICIOS PROFESIONALES DE xxxx".',
  'La vigencia inicial del contrato de prestación de servicios se pactó por un término de seis (06) meses, comprendido entre el cinco (05) de agosto de 2025 y el cinco (05) de febrero de 2026.',
  'El valor inicial del contrato se pactó en la suma de xxx DE PESOS MONEDA LEGAL ($xxx M/CTE), pagaderos a LA CONTRATISTA mes vencido, en pagos mensuales de xxx PESOS MONEDA LEGAL ($xx M/CTE).',
  'El día veintiséis (26) de enero de 2026, las partes suscribieron el Otrosí No. 01, mediante el cual se prorrogó el término de duración del contrato hasta el cinco (05) de agosto de dos mil veintiséis (2026) y se adicionó su valor en la suma de xxxx PESOS MONEDA LEGAL ($xxx M/CTE).',
  'Conforme a lo anterior, y teniendo en cuenta que la cláusula tercera del contrato prevé que este podrá ser prorrogado de común acuerdo entre las partes mediante documento escrito, las partes manifiestan su voluntad de celebrar el presente Otrosí No. 02 con el fin de: (i) prorrogar el plazo de ejecución desde el seis (06) de agosto de 2026 hasta el treinta y uno (31) de diciembre de 2026; (ii) adicionar su valor en la suma de xxx PESOS MONEDA LEGAL ($xxx M/CTE); y (iii) precisar y actualizar las obligaciones específicas de LA CONTRATISTA, las cuales se ejecutarán únicamente respecto de los asuntos y actividades que le sean asignados mediante reparto por la Directora Jurídica y cuyos productos deberán contar con su revisión y visto bueno previo.',
];

/** Las seis obligaciones del formato. La primera queda abierta: cambia en cada contrato. */
const PLANTILLAS_OBLIGACION = [
  'Apoyar xxxxxx',
  'Prestar los servicios objeto del presente contrato.',
  'Mantener la reserva de la información y de los documentos que conozca con ocasión de la ejecución del presente contrato.',
  'Disponer de los recursos que sean necesarios para la correcta ejecución del presente contrato.',
  'Antes de su inicio, informar a LA CONTRATANTE cualquier actividad que pretenda realizar y que guarde similitud con las actividades desarrolladas por LA CONTRATANTE.',
  'Cumplir las demás obligaciones que sean de la esencia del objeto contratado y aquellas que resulten necesarias para el logro de la obligación de medio que lo caracteriza, siempre que le sean asignadas mediante reparto por la Dirección Jurídica.',
];

/* ── Subcomponentes ─────────────────────────────────────── */

/** Renglón de un bloque de firma. */
/**
 * Fila de la tabla de identificación. Los hijos son las celdas del valor: van varias
 * cuando el modelo junta dos datos en el mismo renglón —«razón social - NIT»— pero se
 * guardan por separado, porque el texto del otrosí los cita cada uno por su lado.
 */
function FilaId({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[34%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        <div className="flex items-baseline gap-1">{children}</div>
      </td>
    </tr>
  );
}

function Celda({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-grow min-w-0 bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
    />
  );
}

function FLine({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}

/**
 * Lista numerada o con literales A., B., C.… Cada punto es un bloque editable con su propia
 * clave, y se pueden agregar o quitar: cuántos antecedentes arrastra un otrosí depende de
 * cuántas veces se haya modificado el contrato, y las obligaciones cambian con el objeto.
 */
function ListaLiteral({ items, onChange, clave, editable, plantillas, etiqueta, marca = 'letra' }: {
  items: string[];
  onChange: (v: string[]) => void;
  clave: string;
  editable: boolean;
  plantillas: string[];
  etiqueta: string;
  marca?: 'letra' | 'numero';
}) {
  // La marca es también la clave del texto guardado. Con el índice, quitar un punto
  // correría todos los de abajo y cada uno heredaría el texto del siguiente.
  const marcar = (i: number) => (marca === 'numero' ? String(i + 1) : String.fromCharCode(65 + i));
  return (
    <div className="space-y-3">
      {items.map((_, i) => (
        <div key={i} className="flex gap-3 items-start text-justify leading-relaxed text-[12.5px]">
          <span className="font-bold w-6 flex-shrink-0">{marcar(i)}.</span>
          <div className="flex-grow min-w-0">
            <TextoEd k={`${clave}${marcar(i)}`} plantilla={plantillas[i] ?? ''} />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title={`Quitar este ${etiqueta}`}
              className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          type="button"
          onClick={() => onChange([...items, ANTECEDENTE_NUEVO])}
          className="no-print flex items-center gap-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar {etiqueta}
        </button>
      )}
    </div>
  );
}


/**
 * Las modificaciones que no encajan en ningún módulo. No tienen plantilla porque lo que se
 * modifica cambia en cada otrosí; la numeración sí se pone sola.
 *
 * `desde` es cuántas cláusulas modulares quedaron antes. Antes era fijo —estas empezaban
 * siempre en la QUINTA— y con los módulos dejó de serlo: en un otrosí que solo prorroga,
 * la primera de estas es la SEGUNDA.
 */
function Clausulas({ items, onChange, editable, desde }: {
  items: { titulo: string; texto: string }[];
  onChange: (v: { titulo: string; texto: string }[]) => void;
  editable: boolean;
  desde: number;
}) {
  const cambiar = (i: number, campo: 'titulo' | 'texto', valor: string) =>
    onChange(items.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  return (
    <div className="space-y-4 mt-5">
      {items.map((c, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="flex-grow min-w-0 text-justify leading-relaxed text-[12.5px]">
            <input
              value={c.titulo}
              onChange={(e) => cambiar(i, 'titulo', e.target.value)}
              placeholder={`CLÁUSULA ${ORDINAL_CLAUSULA[desde + i] ?? `N.º ${desde + i + 1}`}. TÍTULO DE LA MODIFICACIÓN:`}
              className="w-full bg-transparent outline-none font-bold [font-size:inherit] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black"
            />
            <textarea
              value={c.texto}
              onChange={(e) => cambiar(i, 'texto', e.target.value)}
              rows={3}
              placeholder="Texto de la cláusula"
              className="w-full bg-transparent outline-none resize-y text-justify [font-size:inherit] leading-relaxed placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black"
            />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title="Quitar esta cláusula"
              className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0 mt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          type="button"
          onClick={() => onChange([...items, { titulo: '', texto: '' }])}
          className="no-print flex items-center gap-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar cláusula
        </button>
      )}
    </div>
  );
}
