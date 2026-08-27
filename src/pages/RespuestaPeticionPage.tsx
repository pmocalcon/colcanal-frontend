import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_RESPUESTA_PETICION } from '@/config/formatosGestion';
import {
  TextosDocumento, useTextosDocumento, TextoEd, AutoTextarea,
} from '@/components/juridica/textoEditable';
import { masterDataService, type Company } from '@/services/master-data.service';
import { getActaConfig, hasActaConfig } from '@/config/actas';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import {
  Linea, Campo, Guia, BloqueControl, MembreteOficio,
} from '@/components/juridica/camposDocumento';

/**
 * Respuesta general a un derecho de petición.
 *
 * Es la contraparte del requerimiento de aclaración: aquel devuelve una petición que no se
 * entiende, este la resuelve de fondo. Comparte con él el destinatario —el peticionario, no
 * un juzgado— pero no el pie: la respuesta se expide a nombre de la casa y lleva el membrete
 * de Cali, mientras que el requerimiento puede expedirlo el Municipio con el suyo.
 *
 * El membrete lleva **dos logos**, Canales & Contactos y el de la UTAP, porque la respuesta
 * se suscribe en esa doble condición: el de la representada va al lado y no en lugar del de
 * la casa, al revés que en los escritos judiciales.
 *
 * Ruta: `.../juridica/respuesta-peticion/:id`.
 */

/** Un par «solicitud transcrita / respuesta», tal como los numera el modelo. */
interface Peticion {
  solicitud: string;
  respuesta: string;
}

interface RespuestaState {
  /** La UTAP a cuyo nombre se responde. Su logo acompaña al de la casa. */
  empresaId: number | null;
  empresa: string;

  // ── Control interno, no se imprime ──
  entidadResponde: string;
  revisionJuridica: string;

  municipio: string;
  fecha: string;

  // ── El peticionario ──
  peticionario: string;
  peticionarioId: string;
  peticionarioCorreo: string;
  peticionarioDireccion: string;
  saludo: string;

  // ── La petición que se responde ──
  fechaRadicado: string;
  radicado: string;
  asunto: string;
  entidadRecibio: string;
  fechaRecepcion: string;

  antecedentes: string;
  consideraciones: string;
  peticiones: Peticion[];
  anexos: string;

  // ── 5. Notificaciones y cierre ──
  medioContacto: string;

  // ── Quien firma ──
  responsable: string;
  responsableCargo: string;
  responsableEntidad: string;

  /**
   * Campos y no constantes, igual que en el requerimiento: la respuesta la puede proyectar
   * la UTAP o la casa, y `PieElaboracion` fija nombres que aquí serían falsos.
   */
  elaboro: string;
  reviso: string;
  numeroAnexos: string;

  textos: Record<string, string>;
}

const RESPUESTA_GUIA =
  '[RESPONDER DE MANERA DIRECTA Y COMPLETA. SI SE NIEGA INFORMACIÓN O UNA SOLICITUD, '
  + 'IDENTIFICAR EL FUNDAMENTO JURÍDICO Y FÁCTICO APLICABLE. SI SE REMITE POR COMPETENCIA UNA '
  + 'PARTE, INDICAR AUTORIDAD, FECHA Y SOPORTE DE REMISIÓN].';

const nuevaPeticion = (n: number): Peticion => ({
  solicitud: `[TRANSCRIBIR O RESUMIR FIELMENTE LA SOLICITUD ${n}]`,
  respuesta: RESPUESTA_GUIA,
});

const ENTIDADES = ['Sin definir', 'Canales & Contactos S.A.S.', 'UTAP', 'Otra'];

/**
 * El formato en blanco, con su texto guía como **valor**: un `placeholder` de HTML se ve en
 * pantalla pero no se imprime, y el modelo vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: RespuestaState = {
  empresaId: null,
  empresa: '',

  entidadResponde: '',
  revisionJuridica: '[SI APLICA / NOMBRE - FECHA]',

  municipio: '[MUNICIPIO]',
  fecha: '[DÍA] de [MES] de [AÑO]',

  peticionario: '[NOMBRE DEL PETICIONARIO]',
  peticionarioId: '[IDENTIFICACIÓN, SI APLICA]',
  peticionarioCorreo: '[CORREO]',
  peticionarioDireccion: '[DIRECCIÓN / CIUDAD, SI APLICA]',
  saludo: '[SEÑOR/SEÑORA + APELLIDO]',

  fechaRadicado: '[FECHA]',
  radicado: '[RADICADO]',
  asunto: '[ASUNTO]',
  entidadRecibio: '[ENTIDAD / UTAP]',
  fechaRecepcion: '[FECHA]',

  antecedentes:
    '[RELACIONAR ÚNICAMENTE LOS HECHOS, ACTUACIONES Y DOCUMENTOS NECESARIOS PARA '
    + 'CONTEXTUALIZAR LA RESPUESTA, EN ORDEN CRONOLÓGICO. EVITAR INCLUIR HECHOS QUE NO TENGAN '
    + 'RELACIÓN CON LO SOLICITADO].',
  consideraciones:
    '[INCORPORAR SOLO LAS NORMAS, CLÁUSULAS CONTRACTUALES, ACTOS ADMINISTRATIVOS, SOPORTES '
    + 'TÉCNICOS O CRITERIOS QUE SEAN REALMENTE APLICABLES AL CASO. NO UTILIZAR FUNDAMENTOS '
    + 'PREDETERMINADOS SI NO CORRESPONDEN A LA SOLICITUD].',
  peticiones: [nuevaPeticion(1), nuevaPeticion(2), nuevaPeticion(3)],
  anexos: '[RELACIÓN DE DOCUMENTOS / "NO APLICA"]',

  medioContacto: '[CORREO / DIRECCIÓN / OTRO]',

  responsable: '[NOMBRE DEL RESPONSABLE]',
  responsableCargo: '[CARGO]',
  responsableEntidad: '[ENTIDAD / UTAP]',

  elaboro: '[NOMBRE - CARGO]',
  reviso: '[NOMBRE - CARGO]',
  numeroAnexos: '[NÚMERO / NO APLICA]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function RespuestaPeticionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<RespuestaState>(EMPTY);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof RespuestaState>(k: K, v: RespuestaState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /*
   * Las peticiones se editan contra el estado y no con `TextoEd`: las claves de `textos` son
   * fijas, y una lista donde se puede eliminar del medio haría que el texto guardado bajo
   * `peticion.1` acabara pintándose en la que antes era la 2.
   */
  const setPeticion = <K extends keyof Peticion>(i: number, k: K, v: Peticion[K]) =>
    setF((p) => ({
      ...p,
      peticiones: p.peticiones.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)),
    }));
  const agregarPeticion = () =>
    setF((p) => ({ ...p, peticiones: [...p.peticiones, nuevaPeticion(p.peticiones.length + 1)] }));
  const quitarPeticion = (i: number) =>
    setF((p) => ({ ...p, peticiones: p.peticiones.filter((_, idx) => idx !== i) }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<RespuestaState>;
        setF({
          ...EMPTY,
          ...saved,
          // Un documento guardado sin la lista dejaría la sección en blanco y sin forma de
          // volver al formato: se cae a la plantilla.
          peticiones: saved.peticiones?.length ? saved.peticiones : EMPTY.peticiones,
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la respuesta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  useEffect(() => {
    masterDataService.getCompanies().then(setEmpresas).catch(() => setEmpresas([]));
  }, []);

  /*
   * A diferencia de los demás formatos, acá el logo de la UTAP **acompaña** al de la casa en
   * vez de reemplazarlo. Cuando la empresa escogida no tiene logo propio simplemente no se
   * pinta el segundo: repetir el genérico de Alumbrado Público al lado del de Canales &
   * Contactos no diría nada.
   */
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
        formato: FORMATO_RESPUESTA_PETICION,
        data: f,
      });
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/respuesta-peticion/${guardada.solicitudId}`,
          { replace: true },
        );
      }
      toast.success('Respuesta guardada');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/respuesta-peticion')} title="Volver a las respuestas">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Respuesta a derecho de petición</h1>
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
            <span className="text-[#4a4a63] shrink-0">UTAP:</span>
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
                ? 'Esa empresa no tiene logo propio · va solo el de la casa'
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
              titulo="RESPUESTA GENERAL A DERECHO DE PETICIÓN"
            />

            <BloqueControl
              titulo="CONTROL INTERNO — NO SE IMPRIME"
              nota="Verifica competencia, término legal, identidad del peticionario, solicitudes concretas, anexos y medio de notificación antes de expedir."
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Entidad que responde</span>
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
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Revisión jurídica</span>
                <input
                  value={f.revisionJuridica}
                  onChange={(e) => set('revisionJuridica', e.target.value)}
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

            {/* El destinatario */}
            <div className="space-y-0.5">
              <p>Señor(a)</p>
              <Linea value={f.peticionario} onChange={(v) => set('peticionario', v)} bold />
              <Linea value={f.peticionarioId} onChange={(v) => set('peticionarioId', v)} />
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Correo electrónico:</span>
                <Linea value={f.peticionarioCorreo} onChange={(v) => set('peticionarioCorreo', v)} />
              </div>
              <Linea value={f.peticionarioDireccion} onChange={(v) => set('peticionarioDireccion', v)} />
            </div>

            {/* Referencia y asunto */}
            <div className="pt-4 space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Referencia:</span>
                <TextoEd
                  k="referencia"
                  plantilla={`Derecho de petición radicado el ${f.fechaRadicado} bajo el No. ${f.radicado}.`}
                />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Asunto:</span>
                <TextoEd
                  k="asunto"
                  plantilla={`Respuesta de fondo a solicitud relacionada con ${f.asunto}.`}
                />
              </div>
            </div>

            {/* Saludo */}
            <div className="pt-4 flex items-baseline">
              <span className="shrink-0">Cordial saludo,&nbsp;</span>
              <Linea value={f.saludo} onChange={(v) => set('saludo', v)} />
              <span className="shrink-0">:</span>
            </div>

            <div>
              <TextoEd
                k="apertura"
                plantilla={
                  `En atención al derecho de petición indicado en la referencia, recibido por `
                  + `${f.entidadRecibio} el ${f.fechaRecepcion}, se procede a emitir respuesta dentro `
                  + `del ámbito de sus competencias, de manera clara, precisa, congruente y de fondo `
                  + `respecto de las solicitudes formuladas.`
                }
              />
            </div>

            {/* 1. Antecedentes */}
            <p className="font-bold text-center pt-4">1. ANTECEDENTES RELEVANTES</p>
            <AutoTextarea value={f.antecedentes} onChange={(v) => set('antecedentes', v)} />

            {/* 2. Consideraciones */}
            <p className="font-bold text-center pt-4">2. CONSIDERACIONES APLICABLES</p>
            <AutoTextarea value={f.consideraciones} onChange={(v) => set('consideraciones', v)} />

            {/* 3. Respuesta a las peticiones */}
            <p className="font-bold text-center pt-4">3. RESPUESTA A LAS PETICIONES</p>

            <Guia>
              Un bloque por cada solicitud realmente formulada. La numeración se recalcula sola
              al agregar o quitar.
            </Guia>

            <div className="space-y-2">
              {f.peticiones.map((p, i) => (
                <div key={i} className="group/peticion">
                  <div className="flex items-start gap-1">
                    <span className="font-bold shrink-0">PETICIÓN {i + 1}:</span>
                    <AutoTextarea
                      value={p.solicitud}
                      onChange={(v) => setPeticion(i, 'solicitud', v)}
                      className="text-left"
                    />
                    {f.peticiones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarPeticion(i)}
                        title="Quitar esta petición"
                        className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/peticion:opacity-100 transition-opacity mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-1">
                    <span className="font-bold shrink-0">Respuesta:</span>
                    <AutoTextarea
                      value={p.respuesta}
                      onChange={(v) => setPeticion(i, 'respuesta', v)}
                      className="text-left"
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={agregarPeticion}
                className="no-print h-7 text-[11px] gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Agregar petición
              </Button>
            </div>

            {/* 4. Documentos anexos */}
            <p className="font-bold text-center pt-4">4. DOCUMENTOS ANEXOS, SI APLICA</p>
            <div className="flex items-baseline gap-1">
              <span className="shrink-0">Se anexan:</span>
              <Linea value={f.anexos} onChange={(v) => set('anexos', v)} />
            </div>

            {/* 5. Notificaciones y cierre */}
            <p className="font-bold text-center pt-4">5. NOTIFICACIONES Y CIERRE</p>

            <div>
              <TextoEd
                k="notificacion"
                plantilla={
                  `La presente respuesta se remite al medio de contacto informado por el `
                  + `peticionario: ${f.medioContacto}.`
                }
              />
            </div>

            <div className="pt-2">
              <TextoEd
                k="cierre"
                plantilla={
                  `Con lo anterior se atienden las solicitudes que se encuentran dentro de la `
                  + `competencia de ${f.responsableEntidad}, sin perjuicio de las remisiones por `
                  + `competencia que, de ser necesarias, se hayan efectuado conforme a la ley.`
                }
              />
            </div>

            <p className="pt-2">Cordialmente,</p>

            {/* Firma */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.responsable}</p>
              <p>{f.responsableCargo}</p>
              <p>{f.responsableEntidad}</p>
            </div>

            {/* Trazabilidad de quién la proyectó */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {f.reviso}</p>
              <p>Anexos: {f.numeroAnexos}</p>
            </div>

            {/* Sin sede ni correo de UTAP: el modelo trae solo el membrete de la casa. */}
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
              <Campo label="Radicado" value={f.radicado} onChange={(v) => set('radicado', v)} />
              <Campo label="Fecha de radicación" value={f.fechaRadicado} onChange={(v) => set('fechaRadicado', v)} />
              <Campo label="Asunto de la solicitud" value={f.asunto} onChange={(v) => set('asunto', v)} />
              <Campo label="Entidad que recibió" value={f.entidadRecibio} onChange={(v) => set('entidadRecibio', v)} />
              <Campo label="Fecha de recepción" value={f.fechaRecepcion} onChange={(v) => set('fechaRecepcion', v)} />
              <Campo label="Medio de contacto informado" value={f.medioContacto} onChange={(v) => set('medioContacto', v)} />
              <Campo label="Responsable que firma" value={f.responsable} onChange={(v) => set('responsable', v)} />
              <Campo label="Cargo" value={f.responsableCargo} onChange={(v) => set('responsableCargo', v)} />
              <Campo label="Entidad que firma" value={f.responsableEntidad} onChange={(v) => set('responsableEntidad', v)} />
              <Campo label="Elaboró" value={f.elaboro} onChange={(v) => set('elaboro', v)} />
              <Campo label="Revisó" value={f.reviso} onChange={(v) => set('reviso', v)} />
              <Campo label="Número de anexos" value={f.numeroAnexos} onChange={(v) => set('numeroAnexos', v)} />
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
