import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd, AutoTextarea } from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig } from '@/config/actas';

/**
 * Contestación de la acción de tutela y solicitud de desvinculación.
 *
 * Formato suelto de G. jurídica: no pertenece a ningún trámite de contratación. Lo firma
 * la Directora Jurídica como **apoderada judicial** de la empresa accionada, y va dirigido
 * al juez que admitió la tutela.
 *
 * El membrete depende de la empresa representada: cada UTAP tiene el suyo. Por eso la
 * empresa se escoge de la lista de contratantes y no se escribe suelta.
 *
 * Ruta: `.../juridica/tutela/:id`.
 */

interface TutelaState {
  /**
   * La representada. Manda el membrete: cada UTAP tiene su logo.
   *
   * Se guarda el id **y** el nombre. El id resuelve el logo; el nombre queda escrito para
   * que un documento firmado siga diciendo lo mismo aunque la empresa se renombre después.
   */
  empresaId: number | null;
  empresa: string;
  empresaNit: string;
  empresaRepLegal: string;

  fecha: string;

  // ── El despacho ──
  juezNombre: string;
  juezDespacho: string;
  juezCorreo: string;

  // ── Identificación del proceso ──
  radicado: string;
  accionante: string;
  accionados: string;
  vinculada: string;

  // ── La apoderada ──
  apoderada: string;
  apoderadaCc: string;
  apoderadaCcLugar: string;
  apoderadaTp: string;

  /** Cuándo se recibieron el auto admisorio y los anexos: fija el término. */
  recibidos: string;

  /**
   * Los hechos de la tutela, con la respuesta a cada uno.
   *
   * Lista y no campos fijos: cuántos hechos tiene una tutela lo decide quien la presentó.
   * El ordinal se guarda por hecho —no se calcula al pintar— porque al eliminar uno del
   * medio los demás conservan el nombre con que quedaron citados en el escrito.
   */
  hechos: Hecho[];

  /** Los argumentos de la defensa, numerados 2.1, 2.2… */
  fundamentos: Fundamento[];

  textos: Record<string, string>;
}

interface Hecho {
  ordinal: string;
  hecho: string;
  respuesta: string;
}

interface Fundamento {
  numero: string;
  titulo: string;
  cuerpo: string;
  /**
   * La enumeración con que cierra el argumento, si la tiene. Va aparte del cuerpo para
   * que imprima con sangría francesa y no como un párrafo corrido.
   *
   * Aquí las letras **sí** se calculan por posición, al revés que los ordinales de los
   * hechos: a) y b) no identifican nada fuera del párrafo que las contiene, así que
   * eliminar una del medio debe recorrer las demás.
   */
  items: string[];
  /** Lo que sigue después de la enumeración: casi siempre la conclusión del argumento. */
  cierre: string;
}

const letra = (i: number) => `${String.fromCharCode(97 + i)})`;

const ORDINALES = [
  'PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO',
  'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO',
];

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y el formato vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: TutelaState = {
  empresaId: null,
  empresa: '',
  empresaNit: 'xxx',
  empresaRepLegal: 'xxx',

  fecha: 'Fecha',

  juezNombre: 'xxxx',
  juezDespacho: 'Juez xxxx',
  juezCorreo: 'correo',

  radicado: 'xxx',
  accionante: 'xxx',
  accionados: 'xxx',
  vinculada: 'xxx',

  apoderada: 'MARTA CECILIA RODRÍGUEZ HERRERA',
  apoderadaCc: '24.805.393',
  apoderadaCcLugar: 'Circasia (Quindío)',
  apoderadaTp: '206.594',

  recibidos: 'xxxx',

  hechos: [
    { ordinal: 'PRIMERO', hecho: '"xxxx', respuesta: 'xxx' },
    { ordinal: 'SEGUNDO', hecho: '"xxxx "', respuesta: 'xxx' },
    { ordinal: 'TERCERO', hecho: '"xxx', respuesta: 'xxx' },
  ],

  fundamentos: [
    {
      numero: '2.1.',
      titulo: 'No se acreditó la radicación o recepción de la petición ante la xxxx',
      cuerpo:
        'Para atribuir una vulneración del derecho fundamental de petición es indispensable '
        + 'demostrar, siquiera sumariamente, que la solicitud fue presentada ante el sujeto al que '
        + 'se reprocha la omisión y la fecha cierta de su recepción. La Corte Constitucional ha '
        + 'reiterado que el peticionario debe aportar prueba de la presentación de la solicitud; '
        + 'solo a partir de esa demostración se traslada al destinatario la carga de acreditar que '
        + 'respondió oportunamente. Si no se prueba la presentación, no existe el presupuesto del '
        + 'cual pueda derivarse el deber de responder (sentencias T-997 de 2005, T-878 de 2008 y '
        + 'T-370 de 2025).\n\n'
        + 'En el expediente se observa un radicado expedido por xxxxx, pero no una constancia de '
        + 'recepción por parte de la xx. En consecuencia, no puede imputarse a mi representada una '
        + 'omisión anterior al xxxx, fecha en la cual conoció la petición por conducto del Juzgado.',
      items: [],
      cierre: '',
    },
    {
      numero: '2.2.',
      titulo: 'Falta de legitimación en la causa por pasiva y ausencia de competencia material y tributaria de la Unión Temporal',
      cuerpo:
        'La legitimación en la causa por pasiva exige que la entidad o el particular accionado '
        + 'tenga aptitud jurídica para responder por la vulneración alegada y que exista una '
        + 'relación directa entre sus funciones, su conducta y la presunta afectación del derecho '
        + 'fundamental. Así lo ha precisado la Corte Constitucional, entre otras, en la Sentencia '
        + 'T-262 de 2024.\n\n'
        + 'En el presente asunto no existe conducta omisiva atribuible a la xxxxx, porque la '
        + 'petición no fue recibida en sus canales oficiales antes de la presentación de la tutela. '
        + 'Adicionalmente, mi representada actúa como concesionario encargado de ejecutar '
        + 'actividades de operación y mantenimiento del sistema de alumbrado público, dentro del '
        + 'alcance previsto en el respectivo contrato. Esta condición contractual no la convierte '
        + 'en autoridad tributaria municipal ni le transfiere facultades para administrar, '
        + 'determinar, liquidar, reliquidar, modificar, exonerar, suspender, devolver, compensar o '
        + 'extinguir obligaciones correspondientes al impuesto de alumbrado público.\n\n'
        + 'El impuesto de alumbrado público es un tributo de carácter territorial cuya titularidad '
        + 'corresponde al Municipio de xxxx. La adopción y determinación de sus elementos se '
        + 'encuentra sometida al acuerdo municipal vigente y la aplicación de tales disposiciones, '
        + 'así como la decisión de situaciones particulares y concretas, corresponde al Municipio, '
        + 'por conducto de la Secretaría de Hacienda o de la dependencia que tenga asignada la '
        + 'administración tributaria.\n\n'
        + 'En consecuencia, la Unión Temporal carece de competencia para:',
      items: [
        'Determinar si la Asociación accionante ostenta o no la calidad de sujeto pasivo del impuesto de alumbrado público.',
        'Interpretar con efectos vinculantes el hecho generador, la base gravable, la tarifa o los demás elementos de la obligación tributaria.',
        'Liquidar o reliquidar el impuesto correspondiente al contrato de energía No. 8495056.',
        'Declarar exenciones, exclusiones, tratamientos preferenciales o situaciones de no sujeción.',
        'Ordenar la suspensión, eliminación, devolución, compensación o modificación de los valores facturados.',
        'Modificar la información tributaria utilizada para efectuar el cobro.',
        'Ordenar a Empresas Públicas de Medellín E.S.P. - EPM la corrección o ajuste de la facturación.',
        'Resolver definitivamente la controversia relacionada con la legalidad o procedencia del cobro.',
      ],
      cierre:
        'El hecho de que el impuesto sea incluido y recaudado a través de la factura del servicio '
        + 'público domiciliario de energía eléctrica no modifica su naturaleza tributaria ni '
        + 'convierte al comercializador de energía o al operador encargado de la operación y '
        + 'mantenimiento del sistema de alumbrado público en autoridad competente para definir la '
        + 'existencia, legalidad o cuantía de la obligación. La actividad material de facturación o '
        + 'recaudo no equivale al ejercicio de facultades de determinación tributaria.\n\n'
        + 'En relación con la solicitud de visita técnica y con la información sobre la existencia '
        + 'de luminarias o infraestructura, la Unión Temporal podrá prestar el apoyo técnico que le '
        + 'sea requerido por el Municipio, siempre que dicha actividad se encuentre comprendida '
        + 'dentro de sus obligaciones contractuales. Sin embargo, una eventual inspección, informe '
        + 'o concepto técnico no la faculta para decidir las consecuencias tributarias de los '
        + 'hallazgos, pues la determinación de la procedencia, suspensión o modificación del '
        + 'impuesto continúa siendo competencia de la autoridad municipal.\n\n'
        + 'Por tanto, aun cuando la Unión Temporal pueda suministrar información técnica o apoyar '
        + 'verificaciones solicitadas por el Municipio, no está jurídicamente facultada para emitir '
        + 'una decisión de fondo frente a las solicitudes tributarias formuladas por el accionante. '
        + 'En consecuencia, carece de legitimación en la causa por pasiva respecto de las '
        + 'pretensiones encaminadas a obtener la liquidación, reliquidación, exoneración, '
        + 'suspensión o modificación del impuesto de alumbrado público.',
    },
    {
      numero: '2.3.',
      titulo: 'Remisión diligente por competencia e información al peticionario',
      cuerpo:
        'Sin admitir que existiera una omisión previa, una vez la Unión Temporal conoció la '
        + 'petición actuó de manera inmediata, atendiendo los principios de eficacia, colaboración '
        + 'y celeridad y, en lo pertinente, las reglas de los artículos 21 y 32 de la Ley 1755 de '
        + '2015:',
      items: [
        'El 4 de agosto de 2026, mediante oficio No. xxxx.',
        'En la misma fecha, mediante oficio No. xxxxque, la solicitud había sido remitida a la autoridad municipal competente.',
        'La comunicación al peticionario fue enviada al correo electrónico indicado por él, y se adjuntó copia del oficio remisorio.',
      ],
      cierre:
        'El artículo 21 de la Ley 1755 de 2015 establece que quien carece de competencia debe '
        + 'informar al interesado y remitir la petición al competente dentro de los cinco días '
        + 'siguientes a su recepción. La actuación de la Unión Temporal se realizó al día hábil '
        + 'siguiente a aquel en que conoció efectivamente la solicitud.\n\n'
        + 'De esta manera, la Unión Temporal cumplió integralmente la única actuación que '
        + 'eventualmente podía exigírsele frente a una petición cuyo contenido excedía su '
        + 'competencia: identificar a la autoridad competente, remitirle la solicitud con sus '
        + 'anexos e informar de esa actuación al interesado.\n\n'
        + 'No era jurídicamente exigible que mi representada emitiera una respuesta material sobre '
        + 'la liquidación, reliquidación, suspensión, exoneración, devolución o modificación del '
        + 'impuesto, pues hacerlo habría implicado ejercer atribuciones tributarias que no le han '
        + 'sido conferidas por la ley, el acuerdo municipal ni el contrato de concesión.',
    },
  ],

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function ContestacionTutelaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<TutelaState>(EMPTY);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof TutelaState>(k: K, v: TutelaState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /*
   * Los hechos y los fundamentos se editan contra el estado y no con `TextoEd`: las claves
   * de `textos` son fijas, y una lista donde se puede eliminar del medio haría que el
   * texto guardado bajo `hecho.1` acabara pintándose en el que antes era el 2.
   */
  const setHecho = <K extends keyof Hecho>(i: number, k: K, v: Hecho[K]) =>
    setF((p) => ({ ...p, hechos: p.hechos.map((h, idx) => (idx === i ? { ...h, [k]: v } : h)) }));
  const agregarHecho = () =>
    setF((p) => ({
      ...p,
      hechos: [...p.hechos, { ordinal: ORDINALES[p.hechos.length] ?? '', hecho: '', respuesta: '' }],
    }));
  const quitarHecho = (i: number) =>
    setF((p) => ({ ...p, hechos: p.hechos.filter((_, idx) => idx !== i) }));

  const setFundamento = <K extends keyof Fundamento>(i: number, k: K, v: Fundamento[K]) =>
    setF((p) => ({
      ...p,
      fundamentos: p.fundamentos.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)),
    }));
  const agregarFundamento = () =>
    setF((p) => ({
      ...p,
      fundamentos: [
        ...p.fundamentos,
        { numero: `2.${p.fundamentos.length + 1}.`, titulo: '', cuerpo: '', items: [], cierre: '' },
      ],
    }));
  const quitarFundamento = (i: number) =>
    setF((p) => ({ ...p, fundamentos: p.fundamentos.filter((_, idx) => idx !== i) }));

  /** Los literales a), b)… de un fundamento. */
  const mapItems = (i: number, fn: (items: string[]) => string[]) =>
    setF((p) => ({
      ...p,
      fundamentos: p.fundamentos.map((x, idx) => (idx === i ? { ...x, items: fn(x.items ?? []) } : x)),
    }));
  const setItem = (i: number, j: number, v: string) =>
    mapItems(i, (items) => items.map((it, jdx) => (jdx === j ? v : it)));
  const agregarItem = (i: number) => mapItems(i, (items) => [...items, '']);
  const quitarItem = (i: number, j: number) =>
    mapItems(i, (items) => items.filter((_, jdx) => jdx !== j));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<TutelaState>;
        setF({
          ...EMPTY,
          ...saved,
          // Un documento guardado sin listas dejaría la sección en blanco y sin forma de
          // volver al formato: se cae a la plantilla.
          hechos: saved.hechos?.length ? saved.hechos : EMPTY.hechos,
          fundamentos: saved.fundamentos?.length ? saved.fundamentos : EMPTY.fundamentos,
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la contestación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  // Las empresas, para el membrete. No bloquea: si falla, el documento se sigue
  // diligenciando y solo queda sin logo.
  useEffect(() => {
    masterDataService.getCompanies().then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  /*
   * El logo del municipio sale del mismo registro que usa el Acta de Obra.
   *
   * Solo si esa empresa está registrada: `getActaConfig` cae en Guacarí cuando no la
   * conoce, y un escrito judicial con el membrete de otro municipio no es un detalle
   * estético. Sin registro va el logo genérico de Alumbrado Público.
   */
  const tieneLogoPropio = hasActaConfig(f.empresaId ?? undefined);
  const logoUrl = tieneLogoPropio
    ? getActaConfig(f.empresaId!).logoUrl
    : '/assets/images/logo-alumbrado.png';

  const escogerEmpresa = (id: string) => {
    if (!id) { setF((p) => ({ ...p, empresaId: null, empresa: '' })); return; }
    const c = empresas.find((x) => x.companyId === Number(id));
    setF((p) => ({ ...p, empresaId: Number(id), empresa: c?.name ?? p.empresa }));
  };

  const handleSave = async () => {
    if (docId === null) return;
    setSaving(true);
    try {
      await gestionConocimientoService.update(docId, { data: f });
      toast.success('Contestación guardada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
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
          @page { size: Letter portrait; margin: 20mm 25mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/tutela')} title="Volver a las contestaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Contestación de tutela</h1>
            <p className="text-xs text-[#4a4a63]">
              Radicado {f.radicado || '—'} · documento N.º {docId}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>

        {/* La representada manda el membrete, así que se escoge acá arriba y no dentro
            del texto: es la primera decisión del documento. */}
        {editable && (
          <div className="max-w-4xl mx-auto px-6 pb-3 flex items-center gap-2 text-sm">
            <span className="text-[#4a4a63] shrink-0">Representada:</span>
            <select
              value={f.empresaId ?? ''}
              onChange={(e) => escogerEmpresa(e.target.value)}
              className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 text-sm bg-white"
            >
              <option value="">Sin definir</option>
              {empresas.map((c) => (
                <option key={c.companyId} value={c.companyId}>{c.name}</option>
              ))}
            </select>
            <span className="text-xs text-[#8a8aa0] shrink-0">
              {f.empresaId != null && !tieneLogoPropio
                ? 'Esa empresa no tiene logo propio · va el genérico'
                : 'Define el membrete'}
            </span>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-12 py-10 space-y-4">

            {/* Membrete */}
            <div className="flex items-start justify-between gap-4">
              <img src={logoUrl} alt={f.empresa || 'Alumbrado Público'} className="h-14 object-contain" />
              <p className="text-right text-[11px] font-semibold max-w-[45%]">
                {f.empresa || <span className="italic text-[#8a8aa0]">Escoge la empresa representada</span>}
              </p>
            </div>

            {/* Fecha y destinatario */}
            <div className="pt-6 space-y-3">
              <Linea value={f.fecha} onChange={(v) => set('fecha', v)} />
              <div className="space-y-0.5">
                <p>Doctor</p>
                <Linea value={f.juezNombre} onChange={(v) => set('juezNombre', v)} bold />
                <Linea value={f.juezDespacho} onChange={(v) => set('juezDespacho', v)} />
                <Linea value={f.juezCorreo} onChange={(v) => set('juezCorreo', v)} />
                <p>E. S. D.</p>
              </div>
            </div>

            {/* Identificación del proceso */}
            <div className="pt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-0.5">
              <Dato label="Radicado:" value={f.radicado} onChange={(v) => set('radicado', v)} />
              <Dato label="Accionante:" value={f.accionante} onChange={(v) => set('accionante', v)} />
              <Dato label="Accionados:" value={f.accionados} onChange={(v) => set('accionados', v)} />
              <Dato label="Vinculada:" value={f.vinculada} onChange={(v) => set('vinculada', v)} />
            </div>

            {/* Asunto */}
            <div className="pt-4 grid grid-cols-[120px_1fr] gap-x-3">
              <span className="font-bold tracking-wider">ASUNTO:</span>
              <TextoEd
                k="asunto"
                plantilla="CONTESTACIÓN DE LA ACCIÓN DE TUTELA Y SOLICITUD DE DESVINCULACIÓN"
                className="font-bold uppercase"
              />
            </div>

            {/* Comparecencia */}
            <div className="pt-4">
              <TextoEd
                k="comparecencia"
                plantilla={
                  `${f.apoderada}, mayor de edad, identificada con la cédula de ciudadanía No. `
                  + `${f.apoderadaCc} de ${f.apoderadaCcLugar}, abogada en ejercicio y portadora de la `
                  + `Tarjeta Profesional No. ${f.apoderadaTp} del Consejo Superior de la Judicatura, `
                  + `actuando en calidad de apoderada judicial de la ${f.empresa || 'xxxxx'}, `
                  + `identificada con NIT ${f.empresaNit} y representada legalmente por el señor `
                  + `${f.empresaRepLegal}, conforme al poder especial que se adjunta, respetuosamente `
                  + `comparezco dentro del término concedido para contestar la acción de tutela de la `
                  + `referencia, cuyo auto admisorio y anexos fueron recibidos ${f.recibidos} , y `
                  + `solicitar la desvinculación de mi representada, con fundamento en lo siguiente:`
                }
              />
            </div>

            {/* I. Pronunciamiento frente a los hechos */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">I.</span>PRONUNCIAMIENTO FRENTE A LOS HECHOS
            </p>

            <div className="space-y-2 pt-2">
              {f.hechos.map((h, i) => (
                <div key={i} className="group/hecho">
                  <div className="flex items-start gap-1">
                    <input
                      value={h.ordinal}
                      onChange={(e) => setHecho(i, 'ordinal', e.target.value)}
                      className="w-24 shrink-0 bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                    />
                    <span className="font-bold shrink-0">:</span>
                    <AutoTextarea
                      value={h.hecho}
                      onChange={(v) => setHecho(i, 'hecho', v)}
                      className="text-left"
                    />
                    {f.hechos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarHecho(i)}
                        title="Quitar este hecho"
                        className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/hecho:opacity-100 transition-opacity mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-1">
                    <span className="font-bold shrink-0">Respuesta:</span>
                    <AutoTextarea
                      value={h.respuesta}
                      onChange={(v) => setHecho(i, 'respuesta', v)}
                      className="text-left"
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={agregarHecho}
                className="no-print h-7 text-[11px] gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Agregar hecho
              </Button>
            </div>

            {/* II. Fundamentos jurídicos de la defensa */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">II.</span>FUNDAMENTOS JURÍDICOS DE LA DEFENSA
            </p>

            <div className="space-y-4 pt-2">
              {f.fundamentos.map((x, i) => (
                <div key={i} className="group/fundamento">
                  <div className="flex items-start gap-2">
                    <input
                      value={x.numero}
                      onChange={(e) => setFundamento(i, 'numero', e.target.value)}
                      className="w-12 shrink-0 bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                    />
                    <input
                      value={x.titulo}
                      onChange={(e) => setFundamento(i, 'titulo', e.target.value)}
                      className="flex-grow min-w-0 bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                    />
                    {f.fundamentos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarFundamento(i)}
                        title="Quitar este fundamento"
                        className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/fundamento:opacity-100 transition-opacity mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <AutoTextarea
                    value={x.cuerpo}
                    onChange={(v) => setFundamento(i, 'cuerpo', v)}
                  />

                  {/* Los literales del argumento, si los tiene */}
                  {(x.items ?? []).length > 0 && (
                    <div className="pl-8 pt-1 space-y-1">
                      {(x.items ?? []).map((it, j) => (
                        <div key={j} className="flex items-start gap-2 group/item">
                          <span className="font-bold shrink-0 w-5">{letra(j)}</span>
                          <AutoTextarea
                            value={it}
                            onChange={(v) => setItem(i, j, v)}
                          />
                          <button
                            type="button"
                            onClick={() => quitarItem(i, j)}
                            title="Quitar este literal"
                            className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/item:opacity-100 transition-opacity mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button type="button" variant="ghost" size="sm" onClick={() => agregarItem(i)}
                    className="no-print h-6 text-[11px] gap-1.5 text-[#4a4a63]">
                    <Plus className="w-3 h-3" /> Agregar literal
                  </Button>

                  {/* La conclusión, después de la enumeración */}
                  <AutoTextarea
                    value={x.cierre ?? ''}
                    onChange={(v) => setFundamento(i, 'cierre', v)}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={agregarFundamento}
                className="no-print h-7 text-[11px] gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Agregar fundamento
              </Button>
            </div>
          </div>

          {/* Los datos que arman el texto. En el papel no existen, pero sin ellos habría
              que reescribir el párrafo a mano para cambiar un NIT. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos del documento</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman el texto de arriba. Un párrafo que se reescriba a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="NIT de la representada" value={f.empresaNit} onChange={(v) => set('empresaNit', v)} />
              <Campo label="Representante legal" value={f.empresaRepLegal} onChange={(v) => set('empresaRepLegal', v)} />
              <Campo label="Apoderada" value={f.apoderada} onChange={(v) => set('apoderada', v)} />
              <Campo label="Cédula de la apoderada" value={f.apoderadaCc} onChange={(v) => set('apoderadaCc', v)} />
              <Campo label="Expedida en" value={f.apoderadaCcLugar} onChange={(v) => set('apoderadaCcLugar', v)} />
              <Campo label="Tarjeta profesional" value={f.apoderadaTp} onChange={(v) => set('apoderadaTp', v)} />
              <Campo label="Auto y anexos recibidos" value={f.recibidos} onChange={(v) => set('recibidos', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar este documento. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

/** Renglón suelto del encabezado (fecha, juez, correo). */
function Linea({ value, onChange, bold }: {
  value: string; onChange: (v: string) => void; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={'w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}

/** Fila «Etiqueta: valor» del bloque de identificación del proceso. */
function Dato({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <>
      <span className="font-bold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
      />
    </>
  );
}

function Campo({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
    </label>
  );
}
