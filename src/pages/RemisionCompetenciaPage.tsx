import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_REMISION } from '@/config/formatosGestion';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig } from '@/config/actas';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import {
  Linea, Campo, BloqueControl, MembreteOficio,
} from '@/components/juridica/camposDocumento';

/**
 * Remisión por competencia de un derecho de petición —artículo 21 del CPACA, sustituido por
 * el artículo 1 de la Ley 1755 de 2015.
 *
 * Es el tercer camino que puede tomar una petición, junto con responderla de fondo y
 * devolverla para que la aclaren. Comparte con esos dos el membrete de los dos logos y el
 * pie de la casa, pero **no el destinatario**: este oficio va dirigido a la autoridad
 * competente, no al peticionario. Al peticionario se le manda copia, y el modelo lo exige
 * expresamente —el artículo 21 obliga a informarle— por eso la copia es parte del texto y no
 * un detalle administrativo.
 *
 * Ruta: `.../juridica/remision/:id`.
 */

interface RemisionState {
  /** La UTAP remitente. Su logo acompaña al de la casa. */
  empresaId: number | null;
  empresa: string;

  // ── Control interno, no se imprime ──
  tipoRemision: string;
  autoridadControl: string;

  municipio: string;
  fecha: string;

  // ── El destinatario: la autoridad competente ──
  autoridad: string;
  autoridadAtn: string;
  autoridadCorreo: string;
  autoridadCiudad: string;

  // ── La petición que se remite ──
  peticionario: string;
  fechaPeticion: string;
  radicado: string;
  entidadRemitente: string;
  fechaRecepcion: string;
  descripcionSolicitud: string;

  /** Qué parte se remite: la totalidad o unos numerales concretos. */
  alcanceCompetencia: string;
  razonesCompetencia: string;
  comprende: string;
  numeroAnexos: string;
  relacionAnexos: string;

  /** Cómo se le avisa al peticionario. El artículo 21 obliga a hacerlo. */
  correoPeticionario: string;
  medioAlterno: string;

  // ── Quien firma ──
  responsable: string;
  responsableCargo: string;
  responsableEntidad: string;

  elaboro: string;
  reviso: string;

  textos: Record<string, string>;
}

const TIPOS_REMISION = ['Sin definir', 'Total', 'Parcial'];

/**
 * El formato en blanco, con su texto guía como **valor**: un `placeholder` de HTML se ve en
 * pantalla pero no se imprime, y el modelo vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: RemisionState = {
  empresaId: null,
  empresa: '',

  tipoRemision: '',
  autoridadControl: '[NOMBRE / DEPENDENCIA / CORREO]',

  municipio: '[MUNICIPIO]',
  fecha: '[DÍA] de [MES] de [AÑO]',

  autoridad: '[AUTORIDAD / ENTIDAD COMPETENTE]',
  autoridadAtn: '[NOMBRE / CARGO, SI SE CONOCE]',
  autoridadCorreo: '[CORREO]',
  autoridadCiudad: '[CIUDAD]',

  peticionario: '[PETICIONARIO]',
  fechaPeticion: '[FECHA]',
  radicado: '[RADICADO]',
  entidadRemitente: '[ENTIDAD / UTAP REMITENTE]',
  fechaRecepcion: '[FECHA]',
  descripcionSolicitud: '[DESCRIPCIÓN BREVE]',

  alcanceCompetencia: '[LA TOTALIDAD / LOS NUMERALES ___]',
  razonesCompetencia:
    '[EXPLICAR DE MANERA CONCRETA LA COMPETENCIA LEGAL, REGLAMENTARIA, CONTRACTUAL O '
    + 'FUNCIONAL DEL DESTINATARIO]',
  comprende: '[PETICIÓN COMPLETA / NUMERALES O ASUNTOS ESPECÍFICOS]',
  numeroAnexos: '[NÚMERO]',
  relacionAnexos: '[RELACIÓN BREVE]',

  correoPeticionario: '[CORREO DEL PETICIONARIO]',
  medioAlterno: '[OTRO]',

  responsable: '[NOMBRE DEL RESPONSABLE]',
  responsableCargo: '[CARGO]',
  responsableEntidad: '[ENTIDAD / UTAP REMITENTE]',

  elaboro: '[NOMBRE - CARGO]',
  reviso: '[NOMBRE - CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function RemisionCompetenciaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<RemisionState>(EMPTY);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof RemisionState>(k: K, v: RemisionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<RemisionState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la remisión');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  useEffect(() => {
    masterDataService.getCompanies().then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  const logoUtap = hasActaConfig(f.empresaId ?? undefined)
    ? getActaConfig(f.empresaId!).logoUrl
    : undefined;

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
        formato: FORMATO_REMISION,
        data: f,
      });
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/remision/${guardada.solicitudId}`,
          { replace: true },
        );
      }
      toast.success('Remisión guardada');
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

  /** «Remisión total por competencia» mientras no se escoja; el modelo lo deja abierto. */
  const tipoEnAsunto = f.tipoRemision ? f.tipoRemision.toLowerCase() : '[total/parcial]';

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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/remision')} title="Volver a las remisiones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Remisión por competencia</h1>
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
            <span className="text-[#4a4a63] shrink-0">UTAP remitente:</span>
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
              {f.empresaId != null && !logoUtap
                ? 'Esa empresa no tiene logo propio · va el genérico'
                : 'Su logo acompaña al de Canales & Contactos'}
            </span>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-12 py-10 space-y-4">

            <MembreteOficio
              logoUtap={logoUtap}
              empresa={f.empresa}
              titulo="REMISIÓN POR COMPETENCIA"
              subtitulo="DERECHO DE PETICIÓN"
            />

            <BloqueControl
              titulo="CONTROL INTERNO — NO SE IMPRIME"
              nota={
                <>
                  Úsalo cuando la entidad receptora carezca de competencia total o parcial. Remite
                  dentro del término legal, <strong>informa al peticionario</strong> y conserva el
                  soporte de envío: el artículo 21 exige las tres cosas.
                </>
              }
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-40 shrink-0">Tipo de remisión</span>
                <select
                  value={f.tipoRemision}
                  onChange={(e) => set('tipoRemision', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                >
                  {TIPOS_REMISION.map((x) => (
                    <option key={x} value={x === 'Sin definir' ? '' : x}>{x}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-40 shrink-0">Autoridad competente</span>
                <input
                  value={f.autoridadControl}
                  onChange={(e) => set('autoridadControl', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>
            </BloqueControl>

            {/* Municipio y fecha */}
            <div className="pt-4 flex items-baseline">
              <Linea
                value={f.municipio}
                onChange={(v) => set('municipio', v)}
                className="shrink-0"
                style={{ width: `${Math.max(f.municipio.length, 10)}ch` }}
              />
              <span className="shrink-0">,&nbsp;</span>
              <Linea value={f.fecha} onChange={(v) => set('fecha', v)} />
            </div>

            {/* El destinatario: la autoridad, no el peticionario */}
            <div className="space-y-0.5">
              <p>Señores</p>
              <Linea value={f.autoridad} onChange={(v) => set('autoridad', v)} bold />
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Atn.</span>
                <Linea value={f.autoridadAtn} onChange={(v) => set('autoridadAtn', v)} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Correo:</span>
                <Linea value={f.autoridadCorreo} onChange={(v) => set('autoridadCorreo', v)} />
              </div>
              <Linea value={f.autoridadCiudad} onChange={(v) => set('autoridadCiudad', v)} />
            </div>

            {/* Referencia y asunto */}
            <div className="pt-4 space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Referencia:</span>
                <TextoEd
                  k="referencia"
                  plantilla={
                    `Derecho de petición presentado por ${f.peticionario} el ${f.fechaPeticion}, `
                    + `radicado No. ${f.radicado}.`
                  }
                />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Asunto:</span>
                <TextoEd
                  k="asunto"
                  plantilla={`Remisión ${tipoEnAsunto} por competencia.`}
                />
              </div>
            </div>

            <p className="pt-4">Cordial saludo:</p>

            {/* Qué se recibió */}
            <div className="pt-2">
              <TextoEd
                k="recepcion"
                plantilla={
                  `${f.entidadRemitente} recibió el ${f.fechaRecepcion} la petición identificada en `
                  + `la referencia, mediante la cual el/la señor(a) ${f.peticionario} solicita `
                  + `${f.descripcionSolicitud}.`
                }
              />
            </div>

            {/* Por qué no es competencia propia */}
            <div className="pt-2">
              <TextoEd
                k="competencia"
                plantilla={
                  `Revisado su contenido, se advierte que ${f.alcanceCompetencia} corresponden al `
                  + `ámbito de competencia de ${f.autoridad}, por las siguientes razones: `
                  + `${f.razonesCompetencia}.`
                }
              />
            </div>

            {/* El fundamento de la remisión */}
            <div className="pt-2">
              <TextoEd
                k="fundamento"
                plantilla={
                  'En consecuencia, de conformidad con el artículo 21 del Código de Procedimiento '
                  + 'Administrativo y de lo Contencioso Administrativo, sustituido por el artículo 1 '
                  + 'de la Ley 1755 de 2015, se remite la petición y sus anexos para que se adelante '
                  + 'el trámite y se emita la respuesta que corresponda dentro del ámbito de su '
                  + 'competencia.'
                }
              />
            </div>

            {/* El alcance y los anexos */}
            <div className="pt-2">
              <TextoEd
                k="alcance"
                plantilla={
                  `La presente remisión comprende: ${f.comprende}. Se anexan ${f.numeroAnexos} `
                  + `archivos/folios: ${f.relacionAnexos}.`
                }
              />
            </div>

            {/* El aviso al peticionario: lo exige el artículo 21 */}
            <div className="pt-2">
              <TextoEd
                k="avisoPeticionario"
                plantilla={
                  `De manera simultánea se informa al peticionario de esta remisión y se le envía `
                  + `copia del presente oficio al correo ${f.correoPeticionario} / medio `
                  + `${f.medioAlterno}, dejando soporte de dicha comunicación.`
                }
              />
            </div>

            <div className="pt-2">
              <TextoEd
                k="acuse"
                plantilla="Agradecemos acusar recibo de la presente remisión, cuando resulte procedente."
              />
            </div>

            <p className="pt-2">Atentamente,</p>

            {/* Firma */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.responsable}</p>
              <p>{f.responsableCargo}</p>
              <p>{f.responsableEntidad}</p>
            </div>

            {/* Trazabilidad */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Copia: {f.peticionario} - {f.correoPeticionario}</p>
              <p>Anexos: {f.relacionAnexos}</p>
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {f.reviso}</p>
            </div>

            <PieMembrete />
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
              <Campo label="Peticionario" value={f.peticionario} onChange={(v) => set('peticionario', v)} />
              <Campo label="Correo del peticionario" value={f.correoPeticionario} onChange={(v) => set('correoPeticionario', v)} />
              <Campo label="Radicado" value={f.radicado} onChange={(v) => set('radicado', v)} />
              <Campo label="Fecha de la petición" value={f.fechaPeticion} onChange={(v) => set('fechaPeticion', v)} />
              <Campo label="Fecha de recepción" value={f.fechaRecepcion} onChange={(v) => set('fechaRecepcion', v)} />
              <Campo label="Entidad remitente" value={f.entidadRemitente} onChange={(v) => set('entidadRemitente', v)} />
              <Campo label="Qué solicita (breve)" value={f.descripcionSolicitud} onChange={(v) => set('descripcionSolicitud', v)} />
              <Campo label="Alcance de la incompetencia" value={f.alcanceCompetencia} onChange={(v) => set('alcanceCompetencia', v)} />
              <Campo label="Qué comprende la remisión" value={f.comprende} onChange={(v) => set('comprende', v)} />
              <Campo label="Número de anexos" value={f.numeroAnexos} onChange={(v) => set('numeroAnexos', v)} />
              <Campo label="Relación de anexos" value={f.relacionAnexos} onChange={(v) => set('relacionAnexos', v)} />
              <Campo label="Medio alterno de aviso" value={f.medioAlterno} onChange={(v) => set('medioAlterno', v)} />
              <Campo label="Responsable que firma" value={f.responsable} onChange={(v) => set('responsable', v)} />
              <Campo label="Cargo" value={f.responsableCargo} onChange={(v) => set('responsableCargo', v)} />
              <Campo label="Entidad que firma" value={f.responsableEntidad} onChange={(v) => set('responsableEntidad', v)} />
              <Campo label="Elaboró" value={f.elaboro} onChange={(v) => set('elaboro', v)} />
              <Campo label="Revisó" value={f.reviso} onChange={(v) => set('reviso', v)} />
            </div>
            <div className="px-5 pb-5">
              <label className="block">
                <span className="block text-xs font-semibold text-[#4a4a63] mb-1">
                  Razones de la competencia del destinatario
                </span>
                <textarea
                  rows={2}
                  value={f.razonesCompetencia}
                  onChange={(e) => set('razonesCompetencia', e.target.value)}
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
