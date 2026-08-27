import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_TUTELA } from '@/config/formatosGestion';
import { TextosDocumento, useTextosDocumento, TextoEd, AutoTextarea } from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig, datoContratista } from '@/config/actas';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import {
  MODULOS_DEFENSA, TIPOS_DEFENSA, moduloPorClave,
  SOLICITUDES_MODELO, PRUEBAS_MODELO,
} from '@/config/tutelaModulos';
import {
  Campo, Guia, BloqueControl, ListaNumerada, EncabezadoJudicial, type DatosJudiciales,
} from '@/components/juridica/camposDocumento';

/**
 * Contestación de la acción de tutela y solicitud de desvinculación —modelo especial de
 * uso exclusivo de Dirección Jurídica.
 *
 * Formato suelto de G. jurídica: no pertenece a ningún trámite de contratación. Lo firma
 * la Directora Jurídica como **apoderada judicial** de la empresa accionada, y va dirigido
 * al juez que admitió la tutela.
 *
 * El membrete depende de la empresa representada: cada UTAP tiene el suyo. Por eso la
 * empresa se escoge de la lista de contratantes y no se escribe suelta.
 *
 * Los argumentos de la sección III **no van quemados**: son módulos que Jurídica activa
 * según el expediente, y el formato nace sin ninguno. El modelo lo exige en su bloque de
 * control, y con razón: la versión anterior traía como plantilla los argumentos de un
 * expediente tributario concreto —con su número de contrato de energía adentro—, de modo
 * que toda contestación nueva arrancaba afirmando hechos de otro proceso.
 *
 * El bloque de control lleva `no-print`: se diligencia en pantalla y no viaja al despacho.
 * Lo mismo las notas que explican cómo llenar cada sección.
 *
 * Ruta: `.../juridica/tutela/:id`.
 */

interface TutelaState extends DatosJudiciales {
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
  /** Sede y correo de la representada: van en el pie, bajo la dirección de Cali. */
  empresaSede: string;
  empresaCorreo: string;

  /**
   * El tipo de defensa del bloque de control. **Solo documenta y sugiere**: el escrito lo
   * arman los módulos activos, no este campo. Si decidiera por sí solo qué se imprime, un
   * cambio de criterio a mitad de redacción borraría argumentos ya trabajados.
   */
  tipoDefensa: string;

  // El despacho y las partes viven en `DatosJudiciales`: son los mismos del poder especial.

  // ── La apoderada ──
  apoderada: string;
  apoderadaCc: string;
  apoderadaCcLugar: string;
  apoderadaTp: string;
  apoderadaCorreo: string;

  /** Cuándo se recibieron el auto admisorio y los anexos: fija el término. */
  recibidos: string;

  /** II. Qué se responde a cada pretensión de la tutela. */
  pretensiones: string;

  /** IV. El resumen de la posición, después de los fundamentos. */
  oposicion: string;

  /** V y VI. Listas numeradas; se agregan y quitan renglones como en los hechos. */
  solicitudes: string[];
  pruebas: string[];

  /** VII. Dónde recibe notificaciones la representada; la apoderada las recibe siempre igual. */
  notificacionesRepresentada: string;

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
  /**
   * De qué módulo del catálogo salió, para no poder activarlo dos veces y para marcarlo en
   * el panel. Los fundamentos escritos a mano no lo llevan.
   */
  modulo?: string;
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

/**
 * El número del fundamento —3.1, 3.2…— se calcula por posición y no se guarda, al revés
 * que los ordinales de los hechos.
 *
 * Un hecho conserva su ordinal porque así quedó citado en la tutela que se contesta: es
 * ajeno. La numeración de los módulos, en cambio, es interna del escrito, y el modelo está
 * hecho para borrar los que no apliquen; guardarla dejaría un 3.1 seguido de un 3.3.
 */
const numeroFundamento = (i: number) => `3.${i + 1}.`;

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
  empresaNit: '[NIT]',
  empresaRepLegal: '[NOMBRE DEL REPRESENTANTE LEGAL]',
  empresaSede: '[DIRECCIÓN / MUNICIPIO]',
  empresaCorreo: '[CORREO DE LA UTAP]',

  tipoDefensa: '',

  ciudad: '[CIUDAD]',
  fecha: '[FECHA]',

  juezNombre: '[NOMBRE DEL JUEZ]',
  juezDespacho: '[DESPACHO JUDICIAL]',
  juezCorreo: '[CORREO DEL DESPACHO]',

  radicado: '[RADICADO]',
  accionante: '[NOMBRE / CALIDAD]',
  accionados: '[ENTIDADES / PERSONAS]',
  vinculada: '[ENTIDADES / PERSONAS / NO APLICA]',

  apoderada: 'MARTA CECILIA RODRÍGUEZ HERRERA',
  apoderadaCc: '24.605.393',
  apoderadaCcLugar: 'Circasia (Quindío)',
  apoderadaTp: '206.594',
  apoderadaCorreo: 'director.juridico@alumbrados.co',

  recibidos: 'el [FECHA Y HORA]',

  hechos: [
    { ordinal: 'PRIMERO', hecho: '[TRANSCRIBIR O RESUMIR FIELMENTE EL HECHO]', respuesta: '[PRONUNCIAMIENTO CONCRETO Y SOPORTE]' },
    { ordinal: 'SEGUNDO', hecho: '[TRANSCRIBIR O RESUMIR FIELMENTE EL HECHO]', respuesta: '[PRONUNCIAMIENTO CONCRETO Y SOPORTE]' },
    { ordinal: 'TERCERO', hecho: '[TRANSCRIBIR O RESUMIR FIELMENTE EL HECHO]', respuesta: '[PRONUNCIAMIENTO CONCRETO Y SOPORTE]' },
  ],

  pretensiones:
    '[IDENTIFICAR CADA PRETENSIÓN Y SEÑALAR SI LA ENTIDAD SE OPONE, NO TIENE COMPETENCIA, YA '
    + 'LA SATISFIZO O ADOPTA OTRA POSICIÓN, SIN EXTENDER ARGUMENTOS QUE NO SEAN NECESARIOS].',

  /*
   * Sin ningún módulo activo, y es lo correcto: el bloque de control del modelo prohíbe que
   * el formato genere argumentos por su cuenta. Los enciende Jurídica contra el expediente,
   * desde el catálogo de `tutelaModulos.ts`.
   */
  fundamentos: [],

  oposicion:
    '[RESUMIR EN UNO O DOS PÁRRAFOS LA POSICIÓN DE LA REPRESENTADA FRENTE A LAS PRETENSIONES. '
    + 'EVITAR REPETIR EXTENSAMENTE LOS FUNDAMENTOS YA EXPUESTOS].',

  solicitudes: [...SOLICITUDES_MODELO],
  pruebas: [...PRUEBAS_MODELO],

  notificacionesRepresentada: '[CORREO INSTITUCIONAL / DIRECCIÓN / OTRO MEDIO]',

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
  /*
   * Nace con su texto guía como valor y no en blanco: vacío se ve como un «3.1.» suelto que
   * parece un error de pintado, y además no se podría imprimir para trabajarlo a mano.
   */
  const agregarFundamento = () =>
    setF((p) => ({
      ...p,
      fundamentos: [
        ...p.fundamentos,
        {
          titulo: '[TÍTULO DEL ARGUMENTO]',
          cuerpo: '[DESARROLLAR EL ARGUMENTO CON SU FUNDAMENTO NORMATIVO Y EL SOPORTE DEL EXPEDIENTE].',
          items: [],
          cierre: '',
        },
      ],
    }));
  const quitarFundamento = (i: number) =>
    setF((p) => ({ ...p, fundamentos: p.fundamentos.filter((_, idx) => idx !== i) }));

  const moduloActivo = (clave: string) => f.fundamentos.some((x) => x.modulo === clave);

  /** El módulo que propone el tipo de defensa escogido, si ese tipo tiene uno. */
  const sugerido = moduloPorClave(
    TIPOS_DEFENSA.find((t) => t.valor === f.tipoDefensa)?.sugiere ?? '',
  );

  /**
   * Enciende o apaga un módulo del catálogo.
   *
   * Al apagarlo se pierde lo que se hubiera escrito encima, y por eso el panel pregunta
   * antes: el módulo se activa para redactarlo, no para leerlo, y a los diez minutos ya no
   * es el texto del catálogo sino el argumento del caso.
   */
  const alternarModulo = (clave: string) => {
    if (moduloActivo(clave)) {
      const m = moduloPorClave(clave);
      const escrito = f.fundamentos.find((x) => x.modulo === clave);
      const tocado = escrito && m
        && (escrito.cuerpo !== m.cuerpo || escrito.cierre !== m.cierre || escrito.items.length > 0);
      if (tocado && !confirm(`Quitar «${m!.titulo}». Se pierde lo que hayas escrito en él. ¿Seguir?`)) return;
      setF((p) => ({ ...p, fundamentos: p.fundamentos.filter((x) => x.modulo !== clave) }));
      return;
    }
    const m = moduloPorClave(clave);
    if (!m) return;
    setF((p) => ({
      ...p,
      fundamentos: [
        ...p.fundamentos,
        {
          modulo: m.clave,
          titulo: `${m.titulo} ${m.marca}`,
          cuerpo: m.cuerpo,
          items: [...m.items],
          cierre: m.cierre,
        },
      ],
    }));
  };

  /** Las listas de solicitudes y pruebas: mismo renglón numerado, distinta clave. */
  const setLista = (k: 'solicitudes' | 'pruebas', i: number, v: string) =>
    setF((p) => ({ ...p, [k]: p[k].map((x, idx) => (idx === i ? v : x)) }));
  const agregarLinea = (k: 'solicitudes' | 'pruebas') =>
    setF((p) => ({ ...p, [k]: [...p[k], ''] }));
  const quitarLinea = (k: 'solicitudes' | 'pruebas', i: number) =>
    setF((p) => ({ ...p, [k]: p[k].filter((_, idx) => idx !== i) }));

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
          solicitudes: saved.solicitudes?.length ? saved.solicitudes : EMPTY.solicitudes,
          pruebas: saved.pruebas?.length ? saved.pruebas : EMPTY.pruebas,
          /*
           * Los fundamentos **no** se caen a la plantilla: acá vacío quiere decir «Jurídica
           * todavía no ha escogido módulos», que es como nace el formato. Rellenarlo le
           * volvería a meter argumentos que nadie activó, justo lo que el modelo prohíbe.
           */
          fundamentos: saved.fundamentos ?? [],
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

  /**
   * Escoger la representada arrastra sus datos: el NIT y la sede salen del mismo registro
   * que el logo.
   *
   * A mano acabarían diciendo cosas distintas de una contestación a otra, y el NIT de la
   * representada en un escrito judicial no es un campo cualquiera. Solo se copia lo que el
   * registro sabe con certeza —`datoContratista` calla cuando las configuraciones de esa
   * empresa discrepan—; lo demás se deja como estaba, para llenarlo a mano.
   */
  const escogerEmpresa = (id: string) => {
    if (!id) { setF((p) => ({ ...p, empresaId: null, empresa: '' })); return; }
    const companyId = Number(id);
    const c = empresas.find((x) => x.companyId === companyId);
    const nit = datoContratista(companyId, 'conNit');
    const sede = datoContratista(companyId, 'conDireccion');
    setF((p) => ({
      ...p,
      empresaId: companyId,
      empresa: c?.name ?? p.empresa,
      empresaNit: nit ?? p.empresaNit,
      empresaSede: sede ?? p.empresaSede,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'juridica',
        formato: FORMATO_TUTELA,
        data: f,
      });
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda contestación.
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/tutela/${guardada.solicitudId}`,
          { replace: true },
        );
      }
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
              <div className="text-right text-[11px] font-semibold max-w-[45%]">
                <p>
                  {f.empresa || (
                    <span className="italic font-normal text-[#8a8aa0]">Escoge la empresa representada</span>
                  )}
                </p>
                <p>NIT {f.empresaNit}</p>
              </div>
            </div>

            {/* Título del modelo */}
            <div className="text-center pt-3">
              <p className="font-bold text-[13px]">
                CONTESTACIÓN DE ACCIÓN DE TUTELA Y SOLICITUD DE DESVINCULACIÓN
              </p>
              <p className="font-bold text-[10px] tracking-wide">
                MODELO ESPECIAL - USO EXCLUSIVO DIRECCIÓN JURÍDICA
              </p>
            </div>

            {/* El control jurídico: se diligencia en pantalla y no viaja al despacho. */}
            <BloqueControl
              titulo="CONTROL JURÍDICO OBLIGATORIO — NO SE IMPRIME"
              nota="Este modelo no genera argumentos ni solicitudes por su cuenta. Escoge únicamente los módulos que correspondan a los hechos, derechos invocados, pretensiones, competencias y pruebas del expediente."
            >
                <label className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#4a4a63] w-28 shrink-0">Tipo de defensa</span>
                  <select
                    value={f.tipoDefensa}
                    onChange={(e) => set('tipoDefensa', e.target.value)}
                    className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                  >
                    {TIPOS_DEFENSA.map((t) => (
                      <option key={t.valor} value={t.valor}>{t.label}</option>
                    ))}
                  </select>
                </label>

                {/* Propone, no activa: el argumento entra cuando Jurídica lo decide. */}
                {sugerido && !moduloActivo(sugerido.clave) && (
                  <p className="text-[11px] text-[#4a4a63]">
                    Ese tipo de defensa sugiere el módulo «{sugerido.titulo}».{' '}
                    <button
                      type="button"
                      onClick={() => alternarModulo(sugerido.clave)}
                      className="underline font-semibold text-[#16162b]"
                    >
                      Activarlo
                    </button>
                  </p>
                )}

                <div>
                  <p className="text-[11px] font-semibold text-[#4a4a63] mb-1.5">
                    Módulos de la sección III · {f.fundamentos.filter((x) => x.modulo).length} de{' '}
                    {MODULOS_DEFENSA.length} activos
                  </p>
                  <div className="space-y-1">
                    {MODULOS_DEFENSA.map((m) => (
                      <label key={m.clave} className="flex items-start gap-2 text-[11.5px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={moduloActivo(m.clave)}
                          onChange={() => alternarModulo(m.clave)}
                          className="mt-0.5 shrink-0"
                        />
                        <span>
                          {m.titulo}
                          {m.clave === 'tributario' && (
                            <span className="block text-[10.5px] text-[#8a6d00]">
                              Activar solo si el caso es realmente tributario y la UTAP carece de
                              competencia decisoria.
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
            </BloqueControl>

            <EncabezadoJudicial f={f} set={(k, v) => set(k, v)} />

            {/* Asunto */}
            <div className="pt-4 flex items-baseline gap-2">
              <span className="font-bold tracking-wider shrink-0">ASUNTO:</span>
              <TextoEd
                k="asunto"
                plantilla="CONTESTACIÓN DE LA ACCIÓN DE TUTELA Y SOLICITUD DE DESVINCULACIÓN"
                className="uppercase"
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
                  + `actuando en calidad de apoderada judicial de ${f.empresa || '[NOMBRE DE LA UTAP / ENTIDAD]'}, `
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

            <Guia>
              Responde cada hecho por separado, indicando si es cierto, no es cierto, es
              parcialmente cierto, no consta o corresponde a una valoración jurídica, y señala el
              soporte cuando sea relevante.
            </Guia>

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

            {/* II. Pronunciamiento frente a las pretensiones */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">II.</span>PRONUNCIAMIENTO FRENTE A LAS PRETENSIONES
            </p>

            <div className="pt-2">
              <AutoTextarea
                value={f.pretensiones}
                onChange={(v) => set('pretensiones', v)}
              />
            </div>

            {/* III. Fundamentos jurídicos de la defensa */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">III.</span>FUNDAMENTOS JURÍDICOS DE LA DEFENSA
            </p>

            <Guia>
              Módulos opcionales. Se activan arriba, en el control jurídico, y solo los que
              correspondan al caso concreto.
            </Guia>

            {f.fundamentos.length === 0 && (
              <p className="no-print text-[11.5px] text-[#8a8aa0] italic pt-1">
                Sin módulos activos. Enciende en el control jurídico los argumentos que sostenga
                el expediente.
              </p>
            )}

            <div className="space-y-4 pt-2">
              {f.fundamentos.map((x, i) => (
                <div key={i} className="group/fundamento">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 font-bold">{numeroFundamento(i)}</span>
                    <input
                      value={x.titulo}
                      onChange={(e) => setFundamento(i, 'titulo', e.target.value)}
                      className="flex-grow min-w-0 bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                    />
                    <button
                      type="button"
                      onClick={() => (x.modulo ? alternarModulo(x.modulo) : quitarFundamento(i))}
                      title="Quitar este fundamento"
                      className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/fundamento:opacity-100 transition-opacity mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                <Plus className="w-3.5 h-3.5" /> Agregar fundamento fuera del catálogo
              </Button>
            </div>

            {/* IV. Oposición a las pretensiones */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">IV.</span>OPOSICIÓN A LAS PRETENSIONES
            </p>
            <div className="pt-2">
              <AutoTextarea value={f.oposicion} onChange={(v) => set('oposicion', v)} />
            </div>

            {/* V. Solicitudes */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">V.</span>SOLICITUDES
            </p>
            <ListaNumerada
              items={f.solicitudes}
              onChange={(i, v) => setLista('solicitudes', i, v)}
              onQuitar={(i) => quitarLinea('solicitudes', i)}
              onAgregar={() => agregarLinea('solicitudes')}
              etiqueta="solicitud"
            />

            {/* VI. Pruebas y anexos */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">VI.</span>PRUEBAS Y ANEXOS
            </p>
            <ListaNumerada
              items={f.pruebas}
              onChange={(i, v) => setLista('pruebas', i, v)}
              onQuitar={(i) => quitarLinea('pruebas', i)}
              onAgregar={() => agregarLinea('pruebas')}
              etiqueta="prueba"
            />

            {/* VII. Notificaciones */}
            <p className="font-bold text-center pt-6">
              <span className="mr-8">VII.</span>NOTIFICACIONES
            </p>
            <div className="pt-2">
              <TextoEd
                k="notificaciones"
                plantilla={
                  `La suscrita apoderada recibirá notificaciones en el correo electrónico `
                  + `${f.apoderadaCorreo}. La representada las recibirá en `
                  + `${f.notificacionesRepresentada}.`
                }
              />
            </div>

            {/* Firma */}
            <div className="pt-8">
              <p>Atentamente,</p>
              <div className="pt-12 space-y-0.5">
                <p className="border-t border-black w-72 pt-1 font-bold">{f.apoderada}</p>
                <p>C.C. {f.apoderadaCc} de {f.apoderadaCcLugar}</p>
                <p>T.P. {f.apoderadaTp} del C.S.J.</p>
                <p>Apoderada judicial</p>
                <p>{f.apoderadaCorreo}</p>
              </div>
            </div>

            <PieMembrete sede={f.empresaSede} correo={f.empresaCorreo} />
          </div>
          <PieElaboracion />

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
              <Campo label="Correo de la apoderada" value={f.apoderadaCorreo} onChange={(v) => set('apoderadaCorreo', v)} />
              <Campo label="Auto y anexos recibidos" value={f.recibidos} onChange={(v) => set('recibidos', v)} />
              <Campo label="Sede de la representada" value={f.empresaSede} onChange={(v) => set('empresaSede', v)} />
              <Campo label="Correo de la representada" value={f.empresaCorreo} onChange={(v) => set('empresaCorreo', v)} />
              <Campo label="Notificaciones de la representada" value={f.notificacionesRepresentada} onChange={(v) => set('notificacionesRepresentada', v)} />
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
