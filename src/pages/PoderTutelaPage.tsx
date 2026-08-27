import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_PODER } from '@/config/formatosGestion';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig, datoContratista } from '@/config/actas';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import {
  Campo, BloqueControl, EncabezadoJudicial, type DatosJudiciales,
} from '@/components/juridica/camposDocumento';

/**
 * Poder especial para contestar una acción de tutela y ejercer la defensa judicial.
 *
 * Es el documento que acompaña a la contestación —su prueba número uno— y por eso comparte
 * con ella el encabezado, el membrete y el pie. Lo que cambia es quién firma: acá el
 * poderdante es el **representante legal** de la UTAP, y la Directora Jurídica aparece como
 * apoderada que acepta, no como quien suscribe.
 *
 * Va aparte de la contestación y no como una pestaña suya porque se otorga antes y se
 * conserva después: sobrevive al trámite que lo motivó y puede tener que reexpedirse sin
 * que la contestación cambie.
 *
 * Ruta: `.../juridica/poder/:id`.
 */

interface PoderState extends DatosJudiciales {
  empresaId: number | null;
  empresa: string;
  empresaNit: string;
  empresaSede: string;
  empresaCorreo: string;

  /**
   * Cómo se confiere el poder. No se imprime: es control interno.
   *
   * Importa porque un poder por mensaje de datos tiene requisitos propios —artículo 5 de la
   * Ley 2213 de 2022— y el soporte de envío hay que conservarlo. Tenerlo como campo hace que
   * la pantalla pueda recordarlo en el momento en que se escoge.
   */
  medioOtorgamiento: string;

  /** El poderdante: quien confiere el poder en nombre de la representada. */
  repLegal: string;
  repLegalCc: string;
  repLegalCcLugar: string;
  /** Con qué se acredita que esa persona representa a la entidad. */
  acreditacion: string;

  /** La apoderada. Los mismos datos que firman la contestación. */
  apoderada: string;
  apoderadaCc: string;
  apoderadaCcLugar: string;
  apoderadaTp: string;
  apoderadaCorreo: string;

  textos: Record<string, string>;
}

const MEDIOS = ['Sin definir', 'Documento firmado', 'Mensaje de datos'];

/**
 * El formato en blanco, con su texto guía como **valor**: un `placeholder` de HTML se ve en
 * pantalla pero no se imprime, y el modelo vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: PoderState = {
  empresaId: null,
  empresa: '',
  empresaNit: '[NIT]',
  empresaSede: '[DIRECCIÓN / MUNICIPIO]',
  empresaCorreo: '[CORREO DE LA UTAP]',

  medioOtorgamiento: '',

  ciudad: '[CIUDAD]',
  fecha: '[FECHA]',

  juezNombre: '[NOMBRE DEL JUEZ]',
  juezDespacho: '[DESPACHO JUDICIAL]',
  juezCorreo: '[CORREO DEL DESPACHO]',

  radicado: '[RADICADO]',
  accionante: '[NOMBRE]',
  accionados: '[ENTIDADES / PERSONAS]',
  vinculada: '[ENTIDADES / PERSONAS / NO APLICA]',

  repLegal: '[NOMBRE DEL REPRESENTANTE LEGAL]',
  repLegalCc: '[NÚMERO]',
  repLegalCcLugar: '[LUGAR]',
  acreditacion: '[DOCUMENTO DE CONSTITUCIÓN / CERTIFICADO / SOPORTE]',

  apoderada: 'MARTA CECILIA RODRÍGUEZ HERRERA',
  apoderadaCc: '24.605.393',
  apoderadaCcLugar: 'Circasia (Quindío)',
  apoderadaTp: '206.594',
  apoderadaCorreo: 'director.juridico@alumbrados.co',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function PoderTutelaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PoderState>(EMPTY);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof PoderState>(k: K, v: PoderState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<PoderState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el poder');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  useEffect(() => {
    masterDataService.getCompanies().then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  // El membrete depende de la representada, igual que en la contestación: un poder con el
  // logo de otra UTAP no es un detalle estético.
  const tieneLogoPropio = hasActaConfig(f.empresaId ?? undefined);
  const logoUrl = tieneLogoPropio
    ? getActaConfig(f.empresaId!).logoUrl
    : '/assets/images/logo-alumbrado.png';

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
        formato: FORMATO_PODER,
        data: f,
      });
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/poder/${guardada.solicitudId}`,
          { replace: true },
        );
      }
      toast.success('Poder guardado');
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

  const entidad = f.empresa || '[NOMBRE DE LA UTAP / ENTIDAD]';

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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/poder')} title="Volver a los poderes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Poder especial para tutela</h1>
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
              <p className="font-bold text-[13px]">PODER ESPECIAL - ACCIÓN DE TUTELA</p>
              <p className="font-bold text-[11px]">PARA CONTESTAR Y EJERCER LA DEFENSA JUDICIAL</p>
            </div>

            <BloqueControl
              titulo="CONTROL INTERNO DE PARAMETRIZACIÓN — NO SE IMPRIME"
              nota="Parametriza poderdante, entidad, juzgado, radicado y partes antes de imprimir."
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-40 shrink-0">Medio de otorgamiento</span>
                <select
                  value={f.medioOtorgamiento}
                  onChange={(e) => set('medioOtorgamiento', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                >
                  {MEDIOS.map((m) => (
                    <option key={m} value={m === 'Sin definir' ? '' : m}>{m}</option>
                  ))}
                </select>
              </label>

              {/* La advertencia aparece justo cuando se escoge el medio que la activa. */}
              {f.medioOtorgamiento === 'Mensaje de datos' && (
                <p className="text-[11px] text-[#8a6d00]">
                  Verifica el cumplimiento del artículo 5 de la Ley 2213 de 2022 y conserva el
                  soporte de envío junto con el expediente.
                </p>
              )}

              <p className="text-[11px] text-[#4a4a63]">
                Apoderada: <span className="font-semibold">{f.apoderada}</span> — T.P. {f.apoderadaTp} C.S.J.
              </p>
            </BloqueControl>

            <EncabezadoJudicial
              f={f}
              set={(k, v) => set(k, v)}
              labelVinculados="Vinculado(s):"
            />

            {/* Asunto */}
            <div className="pt-4 flex items-baseline gap-2">
              <span className="font-bold tracking-wider shrink-0">ASUNTO:</span>
              <TextoEd k="asunto" plantilla="PODER ESPECIAL - ACCIÓN DE TUTELA" className="uppercase" />
            </div>

            {/* El otorgamiento */}
            <div className="pt-4">
              <TextoEd
                k="otorgamiento"
                plantilla={
                  `Yo, ${f.repLegal}, mayor de edad, identificado(a) con cédula de ciudadanía No. `
                  + `${f.repLegalCc} expedida en ${f.repLegalCcLugar}, obrando en calidad de `
                  + `representante legal de ${entidad}, identificada con NIT ${f.empresaNit}, `
                  + `calidad que se acredita con ${f.acreditacion}, por medio del presente escrito `
                  + `CONFIERO PODER ESPECIAL, AMPLIO Y SUFICIENTE a la doctora ${f.apoderada}, `
                  + `identificada con cédula de ciudadanía No. ${f.apoderadaCc} de `
                  + `${f.apoderadaCcLugar}, abogada en ejercicio, portadora de la Tarjeta `
                  + `Profesional No. ${f.apoderadaTp} del Consejo Superior de la Judicatura y correo `
                  + `electrónico ${f.apoderadaCorreo}, para que represente los intereses de `
                  + `${entidad} dentro de la acción de tutela de la referencia.`
                }
              />
            </div>

            {/* Las facultades */}
            <div className="pt-2">
              <TextoEd
                k="facultades"
                plantilla={
                  'La apoderada queda facultada para notificarse, contestar la acción de tutela, '
                  + 'pronunciarse sobre hechos y pretensiones, solicitar, aportar y controvertir '
                  + 'pruebas, presentar memoriales, intervenir en las actuaciones que se adelanten, '
                  + 'impugnar el fallo cuando corresponda, solicitar aclaración, corrección o adición, '
                  + 'promover o atender incidentes, sustituir y reasumir el poder cuando sea '
                  + 'jurídicamente procedente, recibir comunicaciones y realizar las demás actuaciones '
                  + 'necesarias para la adecuada defensa de los intereses de mi representada, en los '
                  + 'términos del artículo 10 del Decreto 2591 de 1991, los artículos 74 y 77 del '
                  + 'Código General del Proceso y las demás normas aplicables.'
                }
              />
            </div>

            {/* El límite del poder */}
            <div className="pt-2">
              <TextoEd
                k="limite"
                plantilla={
                  'El presente poder se limita al trámite constitucional identificado en la '
                  + 'referencia y a las actuaciones que se deriven directamente de este, sin '
                  + 'perjuicio de las facultades que requieran autorización expresa conforme a la ley.'
                }
              />
            </div>

            <p className="pt-2">Atentamente,</p>

            {/* Firma del poderdante */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.repLegal}</p>
              <p>C.C. {f.repLegalCc} de {f.repLegalCcLugar}</p>
              <p>Representante Legal</p>
              <p>{entidad}</p>
              <p>NIT {f.empresaNit}</p>
            </div>

            <p className="font-bold pt-6">ACEPTACIÓN [INCLUIR SI CORRESPONDE]</p>

            {/* Firma de quien acepta el poder */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.apoderada}</p>
              <p>C.C. {f.apoderadaCc} de {f.apoderadaCcLugar}</p>
              <p>T.P. {f.apoderadaTp} del C.S.J.</p>
              <p>Correo: {f.apoderadaCorreo}</p>
              <p>Apoderada</p>
            </div>

            <p className="pt-4 text-[11px]">
              Anexo: documento que acredite la representación legal del poderdante.
            </p>

            <PieMembrete sede={f.empresaSede} correo={f.empresaCorreo} />
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
              <Campo label="Representante legal (poderdante)" value={f.repLegal} onChange={(v) => set('repLegal', v)} />
              <Campo label="Cédula del poderdante" value={f.repLegalCc} onChange={(v) => set('repLegalCc', v)} />
              <Campo label="Expedida en" value={f.repLegalCcLugar} onChange={(v) => set('repLegalCcLugar', v)} />
              <Campo label="La calidad se acredita con" value={f.acreditacion} onChange={(v) => set('acreditacion', v)} />
              <Campo label="Apoderada" value={f.apoderada} onChange={(v) => set('apoderada', v)} />
              <Campo label="Cédula de la apoderada" value={f.apoderadaCc} onChange={(v) => set('apoderadaCc', v)} />
              <Campo label="Expedida en" value={f.apoderadaCcLugar} onChange={(v) => set('apoderadaCcLugar', v)} />
              <Campo label="Tarjeta profesional" value={f.apoderadaTp} onChange={(v) => set('apoderadaTp', v)} />
              <Campo label="Correo de la apoderada" value={f.apoderadaCorreo} onChange={(v) => set('apoderadaCorreo', v)} />
              <Campo label="Sede de la representada" value={f.empresaSede} onChange={(v) => set('empresaSede', v)} />
              <Campo label="Correo de la representada" value={f.empresaCorreo} onChange={(v) => set('empresaCorreo', v)} />
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
