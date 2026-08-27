import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_PLAZO } from '@/config/formatosGestion';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { Linea, Campo, MembreteOficio, FilaTabla } from '@/components/juridica/camposDocumento';

/**
 * Comunicación de plazo adicional para responder un derecho de petición —parágrafo del
 * artículo 14 de la Ley 1755 de 2015.
 *
 * Es el oficio que se manda **antes** de que venza el término, no después: la norma exige
 * informar la demora con el plazo todavía corriendo, explicar sus motivos y señalar una
 * fecha cierta. Enviado tarde no sirve de nada, y por eso la tabla del término va en el
 * cuerpo del documento —vencimiento inicial y nueva fecha, uno al lado del otro— en vez de
 * quedar como control interno: quien lo firma tiene que ver las dos fechas.
 *
 * A diferencia de los otros oficios de petición lleva **un solo logo**. No se suscribe en la
 * doble condición: lo firma el responsable del trámite.
 *
 * Tampoco tiene bloque de control. El formato no lo trae, y agregárselo habría sido inventar
 * una parametrización que el modelo no pide.
 *
 * Ruta: `.../juridica/plazo-adicional/:id`.
 */

interface PlazoState {
  ciudad: string;
  fecha: string;
  radicado: string;

  // ── El peticionario ──
  peticionario: string;
  peticionarioDireccion: string;
  peticionarioCorreo: string;

  // ── La petición ──
  fechaRecepcion: string;
  asunto: string;

  // ── La tabla del término: se imprime, es el corazón del oficio ──
  modalidad: string;
  terminoLegal: string;
  vencimientoInicial: string;
  nuevaFecha: string;

  // ── Los motivos ──
  circunstancias: string;
  gestionesPendientes: string;

  // ── Quien firma ──
  responsable: string;
  responsableCargo: string;

  elaboro: string;
  reviso: string;

  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su texto guía como **valor**: un `placeholder` de HTML se ve en
 * pantalla pero no se imprime, y el modelo vacío tiene que poder imprimirse para
 * diligenciarlo a mano.
 */
const EMPTY: PlazoState = {
  ciudad: '[CIUDAD]',
  fecha: '[DÍA] de [MES] de [AÑO]',
  radicado: '[RADICADO]',

  peticionario: '[NOMBRE DEL PETICIONARIO]',
  peticionarioDireccion: '[DIRECCIÓN, SI APLICA]',
  peticionarioCorreo: '[CORREO]',

  fechaRecepcion: '[FECHA DE RECEPCIÓN]',
  asunto: '[ASUNTO]',

  modalidad: '[GENERAL / INFORMACIÓN-DOCUMENTOS / CONSULTA / OTRA]',
  terminoLegal: '[NÚMERO] días [HÁBILES / CALENDARIO, SEGÚN CORRESPONDA]',
  vencimientoInicial: '[FECHA]',
  nuevaFecha: '[FECHA - DEBE SER RAZONABLE Y RESPETAR EL LÍMITE LEGAL]',

  circunstancias:
    '[DESCRIBIR DE MANERA ESPECÍFICA LAS CIRCUNSTANCIAS EXCEPCIONALES: información pendiente '
    + 'de otra dependencia o tercero, necesidad de validaciones técnicas, volumen o complejidad '
    + 'objetiva de la información, contingencia acreditada u otra causa]',
  gestionesPendientes: '[DETALLAR GESTIONES PENDIENTES Y ESTADO ACTUAL]',

  responsable: '[NOMBRE DEL RESPONSABLE / FUNCIONARIO]',
  responsableCargo: '[CARGO / ENTIDAD / UTAP]',

  elaboro: '[NOMBRE - CARGO]',
  reviso: '[NOMBRE - CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

export default function ComunicacionPlazoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PlazoState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof PlazoState>(k: K, v: PlazoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<PlazoState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la comunicación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'juridica',
        formato: FORMATO_PLAZO,
        data: f,
      });
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/juridica/plazo-adicional/${guardada.solicitudId}`,
          { replace: true },
        );
      }
      toast.success('Comunicación guardada');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/plazo-adicional')} title="Volver a las comunicaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Comunicación de plazo adicional</h1>
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-12 py-10 space-y-4">

            <MembreteOficio
              soloCasa
              titulo="COMUNICACIÓN DE PLAZO ADICIONAL PARA"
              subtitulo="RESPONDER DERECHO DE PETICIÓN"
            />

            {/* Ciudad y fecha a la izquierda, radicado a la derecha: van en el mismo renglón */}
            <div className="pt-4 flex items-baseline justify-between gap-6">
              <div className="flex items-baseline min-w-0 flex-grow">
                <Linea
                  value={f.ciudad}
                  onChange={(v) => set('ciudad', v)}
                  className="shrink-0"
                  style={{ width: `${Math.max(f.ciudad.length, 8)}ch` }}
                />
                <span className="shrink-0">,&nbsp;</span>
                <Linea value={f.fecha} onChange={(v) => set('fecha', v)} />
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="shrink-0">Radicado:</span>
                <Linea
                  value={f.radicado}
                  onChange={(v) => set('radicado', v)}
                  className="shrink-0"
                  style={{ width: `${Math.max(f.radicado.length, 10)}ch` }}
                />
              </div>
            </div>

            {/* El destinatario */}
            <div className="space-y-0.5">
              <p>Señor(a)</p>
              <Linea value={f.peticionario} onChange={(v) => set('peticionario', v)} bold />
              <Linea value={f.peticionarioDireccion} onChange={(v) => set('peticionarioDireccion', v)} />
              <div className="flex items-baseline gap-1">
                <span className="shrink-0">Correo electrónico:</span>
                <Linea value={f.peticionarioCorreo} onChange={(v) => set('peticionarioCorreo', v)} />
              </div>
            </div>

            {/* Referencia y asunto */}
            <div className="pt-4 space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Referencia:</span>
                <TextoEd
                  k="referencia"
                  plantilla={
                    `Derecho de petición radicado el ${f.fechaRecepcion} bajo el No. `
                    + `${f.radicado}, relacionado con ${f.asunto}.`
                  }
                />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold shrink-0">Asunto:</span>
                <TextoEd
                  k="asunto"
                  plantilla="Información de circunstancia excepcional y plazo adicional para emitir respuesta de fondo."
                />
              </div>
            </div>

            <p className="pt-2">Cordial saludo:</p>

            {/* El fundamento normativo */}
            <div>
              <TextoEd
                k="fundamento"
                plantilla={
                  'De conformidad con el parágrafo del artículo 14 de la Ley 1755 de 2015, cuando '
                  + 'excepcionalmente no sea posible resolver una petición dentro del término legal '
                  + 'aplicable, la autoridad o el responsable del trámite debe informar esta '
                  + 'circunstancia al interesado antes del vencimiento del plazo inicial, explicar '
                  + 'los motivos de la demora y señalar el plazo razonable en el que se resolverá, '
                  + 'sin exceder el límite legal correspondiente.'
                }
              />
            </div>

            {/* La tabla del término. Esta sí se imprime. */}
            <p className="font-bold text-center pt-4">INFORMACIÓN DEL TÉRMINO</p>

            <div className="border border-black">
              <FilaTabla label="Modalidad de petición" value={f.modalidad} onChange={(v) => set('modalidad', v)} />
              <FilaTabla label="Fecha de recepción" value={f.fechaRecepcion} onChange={(v) => set('fechaRecepcion', v)} />
              <FilaTabla label="Término legal inicialmente aplicable" value={f.terminoLegal} onChange={(v) => set('terminoLegal', v)} />
              <FilaTabla label="Fecha de vencimiento inicial" value={f.vencimientoInicial} onChange={(v) => set('vencimientoInicial', v)} />
              <FilaTabla label="Nueva fecha máxima informada" value={f.nuevaFecha} onChange={(v) => set('nuevaFecha', v)} />
            </div>

            {/* Los motivos */}
            <p className="font-bold text-center pt-4">MOTIVOS EXCEPCIONALES</p>

            <div>
              <TextoEd
                k="circunstancias"
                plantilla={
                  `En el presente caso no ha sido posible emitir la respuesta definitiva dentro del `
                  + `término inicialmente previsto por las siguientes razones concretas: `
                  + `${f.circunstancias}.`
                }
              />
            </div>

            <div className="pt-2">
              <TextoEd
                k="pendientes"
                plantilla={
                  `Actualmente se encuentran pendientes las siguientes actuaciones necesarias para `
                  + `emitir una respuesta completa y de fondo: ${f.gestionesPendientes}.`
                }
              />
            </div>

            <div className="pt-2">
              <TextoEd
                k="nuevaFecha"
                plantilla={
                  `Por lo anterior, se informa que la respuesta de fondo será emitida a más tardar `
                  + `el ${f.nuevaFecha}, fecha que se establece como un plazo razonable atendiendo `
                  + `las circunstancias descritas y dentro del límite previsto en el parágrafo del `
                  + `artículo 14 de la Ley 1755 de 2015.`
                }
              />
            </div>

            {/* La salvedad: no es respuesta ni suspensión */}
            <div className="pt-2">
              <TextoEd
                k="salvedad"
                plantilla={
                  'La presente comunicación no constituye una respuesta de fondo a la petición ni '
                  + 'implica suspensión indefinida del trámite; su finalidad es informar '
                  + 'oportunamente la situación excepcional y la fecha cierta en la que se dará '
                  + 'respuesta.'
                }
              />
            </div>

            <p className="pt-2">Cordialmente,</p>

            {/* Firma */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black w-72 pt-1 font-bold">{f.responsable}</p>
              <p>{f.responsableCargo}</p>
            </div>

            {/* Trazabilidad */}
            <div className="pt-4 text-[10px] space-y-0.5">
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
              <Campo label="Asunto de la petición" value={f.asunto} onChange={(v) => set('asunto', v)} />
              <Campo label="Responsable que firma" value={f.responsable} onChange={(v) => set('responsable', v)} />
              <Campo label="Cargo, entidad o UTAP" value={f.responsableCargo} onChange={(v) => set('responsableCargo', v)} />
              <Campo label="Elaboró" value={f.elaboro} onChange={(v) => set('elaboro', v)} />
              <Campo label="Revisó" value={f.reviso} onChange={(v) => set('reviso', v)} />
            </div>
            <div className="px-5 pb-5 space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-[#4a4a63] mb-1">
                  Circunstancias excepcionales
                </span>
                <textarea
                  rows={2}
                  value={f.circunstancias}
                  onChange={(e) => set('circunstancias', e.target.value)}
                  className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))] resize-y"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-[#4a4a63] mb-1">
                  Gestiones pendientes y estado actual
                </span>
                <textarea
                  rows={2}
                  value={f.gestionesPendientes}
                  onChange={(e) => set('gestionesPendientes', e.target.value)}
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
