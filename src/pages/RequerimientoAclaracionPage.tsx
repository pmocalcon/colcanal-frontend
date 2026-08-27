import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_REQUERIMIENTO } from '@/config/formatosGestion';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig } from '@/config/actas';
import {
  Linea, Campo, Guia, BloqueControl, ListaNumerada,
} from '@/components/juridica/camposDocumento';

/**
 * Requerimiento de aclaración o corrección de un derecho de petición oscuro —artículo 19 de
 * la Ley 1755 de 2015.
 *
 * A diferencia de los otros escritos de la gestión, este **no va a un juzgado**: se dirige
 * al peticionario, lo firma el responsable de la dependencia que responde y su pie es la
 * dirección de esa entidad, no la de Cali. Por eso no reusa el encabezado judicial ni el
 * membrete de la casa: quien requiere puede ser el Municipio, una Secretaría, una UTAP o
 * Canales & Contactos, y el papel tiene que decir cuál.
 *
 * El formato es de uso restringido y su bloque de control lo dice: el artículo 19 permite
 * devolver la petición **solo** cuando no se comprende su finalidad u objeto, y prohíbe
 * expresamente devolverla por considerarla inadecuada o incompleta. Usarlo fuera de ese
 * supuesto convierte un requerimiento en una negativa encubierta a resolver.
 *
 * Ruta: `.../juridica/requerimiento/:id`.
 */

interface RequerimientoState {
  /** La entidad que responde: manda el membrete y firma. */
  empresaId: number | null;
  empresa: string;

  // ── Control interno, no se imprime ──
  entidadResponde: string;
  fechaRecepcion: string;
  puntoNoComprendido: string;

  ciudad: string;
  fecha: string;

  // ── El peticionario ──
  peticionario: string;
  peticionarioCorreo: string;
  peticionarioDireccion: string;
  peticionarioCiudad: string;
  saludo: string;

  // ── La petición que se requiere ──
  fechaPeticion: string;
  radicado: string;
  /**
   * La dependencia concreta que recibió la petición. Va aparte de `empresa` porque el
   * membrete puede ser el del municipio y quien responde una secretaría suya.
   */
  entidadDependencia: string;
  /** Qué es exactamente lo que no se comprende. El corazón del formato. */
  ininteligible: string;

  aspectos: string[];
  canalRespuesta: string;

  // ── Quien firma ──
  responsable: string;
  responsableCargo: string;
  responsableEntidad: string;

  /**
   * Elaboró, revisó y copia son campos y no constantes, al revés que en los documentos de
   * contratación: este formato lo puede expedir cualquiera de las entidades del control, y
   * quien lo proyecta no es siempre Jurídica.
   */
  elaboro: string;
  reviso: string;
  copia: string;

  /** El pie: los datos de contacto de la entidad que requiere, no los de la casa. */
  pieEntidad: string;

  textos: Record<string, string>;
}

const ASPECTOS_MODELO = [
  '[INDICAR QUÉ SOLICITUD, FRASE, PERÍODO, DOCUMENTO O PRETENSIÓN NO SE COMPRENDE].',
  '[FORMULAR UNA PREGUNTA CONCRETA QUE PERMITA IDENTIFICAR EL OBJETO O FINALIDAD].',
  '[SI APLICA] Precisar el período, vigencia, predio, contrato, cuenta, usuario o actuación '
    + 'a la que se refiere.',
  '[SI APLICA] Identificar los documentos, datos o actuaciones concretas que pretende obtener.',
  '[OTRO ELEMENTO ESTRICTAMENTE NECESARIO PARA COMPRENDER LA PETICIÓN].',
];

const ENTIDADES = ['Sin definir', 'Municipio', 'Secretaría', 'UTAP', 'Canales & Contactos', 'Otra'];

/**
 * El formato en blanco, con su texto guía como **valor**: un `placeholder` de HTML se ve en
 * pantalla pero no se imprime, y el modelo vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: RequerimientoState = {
  empresaId: null,
  empresa: '',

  entidadResponde: '',
  fechaRecepcion: '[FECHA]',
  puntoNoComprendido: '[DESCRIBIR]',

  ciudad: '[CIUDAD]',
  fecha: '[DÍA] de [MES] de [AÑO]',

  peticionario: '[NOMBRE DEL PETICIONARIO]',
  peticionarioCorreo: '[CORREO]',
  peticionarioDireccion: '[DIRECCIÓN, SI APLICA]',
  peticionarioCiudad: '[CIUDAD]',
  saludo: '[SEÑOR/SEÑORA + APELLIDO]',

  fechaPeticion: '[FECHA]',
  radicado: '[RADICADO]',
  entidadDependencia: '[ENTIDAD / DEPENDENCIA]',
  ininteligible:
    '[IDENTIFICAR CONCRETAMENTE LA FINALIDAD, EL OBJETO O LA PARTE DE LA SOLICITUD QUE '
    + 'RESULTA ININTELIGIBLE]',

  aspectos: [...ASPECTOS_MODELO],
  canalRespuesta: '[CORREO / CANAL OFICIAL / DIRECCIÓN]',

  responsable: '[NOMBRE DEL RESPONSABLE]',
  responsableCargo: '[CARGO]',
  responsableEntidad: '[ENTIDAD / DEPENDENCIA]',

  elaboro: '[NOMBRE - CARGO]',
  reviso: '[NOMBRE - CARGO]',
  copia: '[SI APLICA]',

  pieEntidad: '[DIRECCIÓN / CORREO / TELÉFONO DE LA ENTIDAD]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function RequerimientoAclaracionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<RequerimientoState>(EMPTY);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof RequerimientoState>(k: K, v: RequerimientoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  const setAspecto = (i: number, v: string) =>
    setF((p) => ({ ...p, aspectos: p.aspectos.map((x, idx) => (idx === i ? v : x)) }));
  const agregarAspecto = () => setF((p) => ({ ...p, aspectos: [...p.aspectos, ''] }));
  const quitarAspecto = (i: number) =>
    setF((p) => ({ ...p, aspectos: p.aspectos.filter((_, idx) => idx !== i) }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<RequerimientoState>;
        setF({
          ...EMPTY,
          ...saved,
          // Un documento guardado sin la lista dejaría la sección en blanco y sin forma de
          // volver al formato: se cae a la plantilla.
          aspectos: saved.aspectos?.length ? saved.aspectos : EMPTY.aspectos,
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el requerimiento');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  useEffect(() => {
    masterDataService.getCompanies().then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  const tieneLogoPropio = hasActaConfig(f.empresaId ?? undefined);
  const logoUrl = tieneLogoPropio
    ? getActaConfig(f.empresaId!).logoUrl
    : '/assets/images/logo-alumbrado.png';

  const escogerEmpresa = (id: string) => {
    if (!id) { setF((p) => ({ ...p, empresaId: null, empresa: '' })); return; }
    const companyId = Number(id);
    const c = empresas.find((x) => x.companyId === companyId);
    setF((p) => ({ ...p, empresaId: companyId, empresa: c?.name ?? p.empresa }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'juridica',
        formato: FORMATO_REQUERIMIENTO,
        data: f,
      });
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/requerimiento/${guardada.solicitudId}`,
          { replace: true },
        );
      }
      toast.success('Requerimiento guardado');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/requerimiento')} title="Volver a los requerimientos">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Requerimiento de aclaración</h1>
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

        {editable && (
          <div className="max-w-4xl mx-auto px-6 pb-3 flex items-center gap-2 text-sm">
            <span className="text-[#4a4a63] shrink-0">Membrete:</span>
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
                : 'Define el logo'}
            </span>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-12 py-10 space-y-4">

            {/* Encabezado: el membrete a la izquierda y el título a la derecha, en tabla */}
            <div className="flex items-stretch border border-black">
              <div className="w-[38%] border-r border-black p-2 flex flex-col items-center justify-center gap-1">
                <img src={logoUrl} alt={f.empresa || 'Entidad'} className="h-10 object-contain" />
                <p className="text-[10px] font-bold text-center">
                  {f.empresa || (
                    <span className="italic font-normal text-[#8a8aa0]">[ENTIDAD / MUNICIPIO / UTAP]</span>
                  )}
                </p>
              </div>
              <div className="flex-grow p-2 text-center flex flex-col justify-center">
                <p className="font-bold text-[13px]">REQUERIMIENTO DE ACLARACIÓN O CORRECCIÓN</p>
                <p className="font-bold text-[10px]">
                  DERECHO DE PETICIÓN OSCURO - ARTÍCULO 19 LEY 1755 DE 2015
                </p>
              </div>
            </div>

            <BloqueControl
              titulo="CONTROL INTERNO — NO SE IMPRIME"
              nota={
                <>
                  Úsalo <strong>únicamente</strong> cuando no se comprenda la finalidad u objeto de
                  la petición. El artículo 19 prohíbe devolver una petición por considerarla
                  simplemente inadecuada, extensa, inconveniente o carente de anexos.
                </>
              }
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-44 shrink-0">Entidad que responde</span>
                <select
                  value={f.entidadResponde}
                  onChange={(e) => set('entidadResponde', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                >
                  {ENTIDADES.map((x) => (
                    <option key={x} value={x === 'Sin definir' ? '' : x}>{x}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-44 shrink-0">Fecha de recepción</span>
                <input
                  value={f.fechaRecepcion}
                  onChange={(e) => set('fechaRecepcion', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>

              <label className="flex items-start gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-44 shrink-0 pt-1">
                  Punto que no se comprende
                </span>
                <textarea
                  rows={2}
                  value={f.puntoNoComprendido}
                  onChange={(e) => set('puntoNoComprendido', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white resize-y"
                />
              </label>
            </BloqueControl>

            {/* Ciudad y fecha */}
            <div className="pt-4 flex items-baseline">
              <Linea
                value={f.ciudad}
                onChange={(v) => set('ciudad', v)}
                className="shrink-0"
                style={{ width: `${Math.max(f.ciudad.length, 8)}ch` }}
              />
              <span className="shrink-0">,&nbsp;</span>
              <Linea value={f.fecha} onChange={(v) => set('fecha', v)} />
            </div>

            {/* El destinatario */}
            <div className="space-y-0.5">
              <p>Señor(a)</p>
              <Linea value={f.peticionario} onChange={(v) => set('peticionario', v)} bold />
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Correo electrónico:</span>
                <Linea value={f.peticionarioCorreo} onChange={(v) => set('peticionarioCorreo', v)} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Dirección:</span>
                <Linea value={f.peticionarioDireccion} onChange={(v) => set('peticionarioDireccion', v)} />
              </div>
              <Linea value={f.peticionarioCiudad} onChange={(v) => set('peticionarioCiudad', v)} />
            </div>

            {/* Referencia y asunto */}
            <div className="pt-4 space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Referencia:</span>
                <TextoEd
                  k="referencia"
                  plantilla={`Derecho de petición presentado el ${f.fechaPeticion}, radicado No. ${f.radicado}.`}
                />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Asunto:</span>
                <TextoEd
                  k="asunto"
                  plantilla="Requerimiento de aclaración o corrección por no comprenderse la finalidad u objeto de la petición."
                />
              </div>
            </div>

            {/* Saludo */}
            <div className="pt-4 flex items-baseline">
              <span className="shrink-0">Cordial saludo,&nbsp;</span>
              <Linea value={f.saludo} onChange={(v) => set('saludo', v)} />
              <span className="shrink-0">:</span>
            </div>

            {/* Lo que no se comprende */}
            <div className="pt-2">
              <TextoEd
                k="hechos"
                plantilla={
                  `${f.entidadDependencia} recibió el ${f.fechaRecepcion} la petición indicada en `
                  + `la referencia. Una vez revisado su contenido, se observa que no resulta posible `
                  + `comprender con claridad ${f.ininteligible}, circunstancia que impide emitir una `
                  + `respuesta de fondo congruente con lo realmente solicitado.`
                }
              />
            </div>

            {/* El marco normativo */}
            <div className="pt-2">
              <TextoEd
                k="marco"
                plantilla={
                  'El artículo 23 de la Constitución Política reconoce el derecho fundamental de '
                  + 'petición. La Ley 1755 de 2015 regula su ejercicio y establece en el artículo 19 '
                  + 'que, solo cuando no se comprenda la finalidad u objeto de la petición, esta se '
                  + 'devolverá al interesado para que la corrija o aclare dentro de los diez (10) '
                  + 'días siguientes; si no se corrige o aclara, procederá su archivo. La misma '
                  + 'disposición precisa que no deben devolverse peticiones por considerarlas '
                  + 'simplemente inadecuadas o incompletas.'
                }
              />
            </div>

            {/* La aclaración de que no es una negativa */}
            <div className="pt-2">
              <TextoEd
                k="noNegativa"
                plantilla={
                  'Este requerimiento no constituye una negativa a resolver ni un rechazo de la '
                  + 'petición. Su finalidad es precisar el alcance de lo solicitado para poder emitir '
                  + 'una respuesta adecuada, completa y coherente.'
                }
              />
            </div>

            <p className="font-bold text-center pt-4">ASPECTOS QUE SE REQUIERE ACLARAR</p>

            <Guia>
              Pide solo lo que haga falta para entender la petición. Cada punto que no sea
              estrictamente necesario alarga el trámite sin aclarar nada.
            </Guia>

            <ListaNumerada
              items={f.aspectos}
              onChange={setAspecto}
              onQuitar={quitarAspecto}
              onAgregar={agregarAspecto}
              etiqueta="aspecto"
            />

            {/* El término y el canal */}
            <div className="pt-4">
              <TextoEd
                k="termino"
                plantilla={
                  'Por lo anterior, se le requiere para que, dentro de los diez (10) días siguientes '
                  + 'al recibo de esta comunicación, aclare o corrija los aspectos antes indicados. '
                  + 'En caso de no hacerlo dentro de dicho término, la petición será archivada de '
                  + 'conformidad con el artículo 19 de la Ley 1755 de 2015.'
                }
              />
            </div>

            <div className="pt-2">
              <TextoEd
                k="canal"
                plantilla={
                  `La aclaración podrá remitirse a ${f.canalRespuesta}, indicando el número de `
                  + `radicado ${f.radicado}.`
                }
              />
            </div>

            <p className="pt-2">Atentamente,</p>

            {/* Firma */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.responsable}</p>
              <p>{f.responsableCargo}</p>
              <p>{f.responsableEntidad}</p>
            </div>

            {/* Trazabilidad de quién lo proyectó */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {f.reviso}</p>
              <p>Copia: {f.copia}</p>
            </div>

            {/* El pie es de la entidad que requiere, no el de la casa */}
            <div className="mt-10 pt-3 text-center text-[9.5px] leading-snug text-[#0a2a52]">
              {f.pieEntidad}
            </div>
          </div>

          {/* Los datos que arman el texto. En el papel no existen, pero sin ellos habría
              que reescribir el párrafo a mano para cambiar un radicado. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos del documento</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman el texto de arriba. Un párrafo que se reescriba a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Radicado de la petición" value={f.radicado} onChange={(v) => set('radicado', v)} />
              <Campo label="Fecha de la petición" value={f.fechaPeticion} onChange={(v) => set('fechaPeticion', v)} />
              <Campo label="Entidad o dependencia que recibió" value={f.entidadDependencia} onChange={(v) => set('entidadDependencia', v)} />
              <Campo label="Canal para la aclaración" value={f.canalRespuesta} onChange={(v) => set('canalRespuesta', v)} />
              <Campo label="Responsable que firma" value={f.responsable} onChange={(v) => set('responsable', v)} />
              <Campo label="Cargo" value={f.responsableCargo} onChange={(v) => set('responsableCargo', v)} />
              <Campo label="Entidad que firma" value={f.responsableEntidad} onChange={(v) => set('responsableEntidad', v)} />
              <Campo label="Elaboró" value={f.elaboro} onChange={(v) => set('elaboro', v)} />
              <Campo label="Revisó" value={f.reviso} onChange={(v) => set('reviso', v)} />
              <Campo label="Copia" value={f.copia} onChange={(v) => set('copia', v)} />
              <Campo label="Pie: dirección, correo y teléfono" value={f.pieEntidad} onChange={(v) => set('pieEntidad', v)} />
            </div>
            <div className="px-5 pb-5">
              <label className="block">
                <span className="block text-xs font-semibold text-[#4a4a63] mb-1">
                  Lo que no se comprende de la petición
                </span>
                <textarea
                  rows={2}
                  value={f.ininteligible}
                  onChange={(e) => set('ininteligible', e.target.value)}
                  className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))] resize-y"
                />
              </label>
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
