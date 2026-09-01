import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { FORMATO_PETICION_INCAPACIDAD } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Derecho de petición · Solicitud de reconocimiento y pago de incapacidad.
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = PETICION-INCAPACIDAD). Se diligencia, se guarda y se imprime para radicarlo
 * ante la EPS/EOC; no tiene máquina de estados, así que se queda en borrador y siempre se
 * puede corregir.
 *
 * El bloque de CONTROL INTERNO va marcado `no-print`: guía a quien diligencia pero no
 * aparece en la versión radicable, tal como lo exige el modelo oficial.
 *
 * Con la cédula del trabajador se traen el nombre y el cargo de la ficha de personal.
 *
 * Ruta: `.../talento-humano/peticion-incapacidad/:id`.
 */

interface PeticionIncapacidadState {
  // ── La empleadora (constantes de la empresa) ──
  repLegal: string;
  repLegalCc: string;
  repLegalCcLugar: string;
  empleadora: string;
  nit: string;

  // ── Control interno (no se imprime) ──
  tipoPrestacion: string;
  entidadDestinataria: string;
  revisionPrevia: string;

  // ── Encabezado y asunto ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;
  eps: string;
  epsCiudadCorreo: string;
  asuntoNumero: string;

  // ── El trabajador y la incapacidad ──
  trabajador: string;
  trabajadorCc: string;
  entidadExpide: string;
  incapacidadNumero: string;
  fechaInicio: string;
  fechaFin: string;
  totalDias: string;

  // ── Radicaciones y respuestas ──
  entidadRadicada: string;
  fechaRadicacion: string;
  radicadoNumero: string;
  relacionRadicados: string;
  fechaComunicacion: string;
  resumenRespuesta: string;
  estadoActual: string;
  valorPendiente: string;

  // ── Notificaciones ──
  direccionNotificacion: string;
  correoTramite: string;

  // ── Pie de elaboración ──
  elaboro: string;
  reviso: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y la petición vacía tiene que poder imprimirse para
 * diligenciarla a mano. Los corchetes en mayúscula marcan lo que falta.
 */
const EMPTY: PeticionIncapacidadState = {
  repLegal: 'GLORIA LUCÍA ESCALANTE MANZANO',
  repLegalCc: '66.651.423',
  repLegalCcLugar: 'El Cerrito',
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  tipoPrestacion: '[INCAPACIDAD ORIGEN COMÚN / OTRA - VALIDAR]',
  entidadDestinataria: '[EPS / EOC / OTRA]',
  revisionPrevia: '[TALENTO HUMANO / FINANCIERA / JURIDICA, SEGÚN CASO]',

  ciudad: 'Santiago de Cali',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',
  eps: '[NOMBRE DE LA EPS / ENTIDAD]',
  epsCiudadCorreo: '[CIUDAD / CORREO DE RADICACIÓN]',
  asuntoNumero: '[NÚMERO / IDENTIFICACIÓN]',

  trabajador: '[NOMBRE DEL TRABAJADOR]',
  trabajadorCc: '[NÚMERO]',
  entidadExpide: '[ENTIDAD / PROFESIONAL / IPS]',
  incapacidadNumero: '[NÚMERO]',
  fechaInicio: '[FECHA]',
  fechaFin: '[FECHA]',
  totalDias: '[NÚMERO]',

  entidadRadicada: '[EPS / ENTIDAD]',
  fechaRadicacion: '[FECHA]',
  radicadoNumero: '[NÚMERO]',
  relacionRadicados: '[RELACIÓN CRONOLÓGICA DE RADICADOS Y RESPUESTAS]',
  fechaComunicacion: '[FECHA]',
  resumenRespuesta: '[RESUMEN FIEL DE LA RESPUESTA / OBJECIÓN]',
  estadoActual: '[NO SE HA EFECTUADO EL PAGO / NO SE HA INFORMADO FECHA DE PAGO / PERSISTE LA OBJECIÓN / EXISTE DIFERENCIA EN EL VALOR]',
  valorPendiente: '[VALOR]',

  direccionNotificacion: 'Calle 13A No. 101-60, Ciudad Jardín, Santiago de Cali',
  correoTramite: '[CORREO DESIGNADO PARA EL TRÁMITE]',

  elaboro: '[NOMBRE - CARGO]',
  reviso: '[NOMBRE - CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function DerechoPeticionIncapacidadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const peticionId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PeticionIncapacidadState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof PeticionIncapacidadState>(k: K, v: PeticionIncapacidadState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (peticionId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(peticionId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<PeticionIncapacidadState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la petición');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [peticionId]);

  /**
   * Con la cédula llega el nombre del trabajador de la ficha de personal. Se dispara al
   * salir de la casilla y solo llena lo que sigue como plantilla, para no pisar lo escrito.
   */
  const prellenar = async () => {
    if (!editable) return;
    const cedula = f.trabajadorCc.replace(/\D/g, '');
    if (cedula !== f.trabajadorCc) set('trabajadorCc', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => ({
      ...p,
      trabajador: (!p.trabajador.trim() || p.trabajador === EMPTY.trabajador) ? nombreDeFicha(ficha) : p.trabajador,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(peticionId, {
        gestion: 'talento-humano',
        formato: FORMATO_PETICION_INCAPACIDAD,
        data: f,
      });
      toast.success('Petición guardada');
      if (peticionId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/peticion-incapacidad/${guardado.solicitudId}`,
          { replace: true },
        );
      }
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
          @page { size: Letter portrait; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/peticion-incapacidad')} title="Volver a las peticiones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Derecho de petición — incapacidad</h1>
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {peticionId ?? 'nuevo'}</p>
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
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-3">

            {/* Membrete */}
            <div className="flex items-start justify-between gap-4">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="h-12 object-contain" />
              <div className="text-center px-3 self-center">
                <h2 className="font-bold text-[13px]">DERECHO DE PETICIÓN</h2>
                <p className="font-bold text-[11px]">SOLICITUD DE RECONOCIMIENTO Y PAGO DE INCAPACIDAD</p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Control interno — no se imprime en la versión radicable */}
            <div className="no-print border border-[#e6d200] rounded overflow-hidden text-[11px]">
              <div className="bg-[#fff6c2] font-bold px-3 py-1.5 border-b border-[#e6d200]">
                CONTROL INTERNO · NO SE IMPRIME EN LA VERSIÓN RADICABLE
              </div>
              <p className="px-3 py-1.5 text-[10px] text-[#4a4a63] border-b border-[#e6d200]">
                Verificar origen de la incapacidad, entidad responsable del reconocimiento, período,
                radicaciones previas y calidad del solicitante. Este modelo está orientado principalmente
                a incapacidades de origen común manejadas por el empleador ante EPS/EOC.
              </p>
              <CtrlRow label="Tipo de prestación" value={f.tipoPrestacion} onChange={(v) => set('tipoPrestacion', v)} />
              <CtrlRow label="Entidad destinataria" value={f.entidadDestinataria} onChange={(v) => set('entidadDestinataria', v)} />
              <CtrlRow label="Revisión previa" value={f.revisionPrevia} onChange={(v) => set('revisionPrevia', v)} last />
            </div>

            {/* Fecha y destinatario */}
            <div className="pt-1">
              <p>{f.ciudad}, {f.dia} de {f.mes} de {f.anio}</p>
              <p className="pt-2">Señores</p>
              <p className="font-bold">{f.eps}</p>
              <p>Área de Prestaciones Económicas</p>
              <p>{f.epsCiudadCorreo}</p>
            </div>

            <TextoEd
              k="asunto"
              plantilla={
                `Asunto: Derecho de petición - solicitud de reconocimiento y pago de incapacidad No. `
                + `${f.asuntoNumero}.`
              }
            />

            {/* Encabezado / comparecencia */}
            <TextoEd
              k="intro"
              plantilla={
                `${f.repLegal}, identificada con cédula de ciudadanía No. ${f.repLegalCc} expedida en `
                + `${f.repLegalCcLugar}, actuando en calidad de representante legal de ${f.empleadora}, `
                + `identificada con NIT ${f.nit}, en ejercicio del derecho fundamental de petición previsto `
                + `en el artículo 23 de la Constitución Política y desarrollado por la Ley 1755 de 2015, `
                + `respetuosamente presento solicitud de reconocimiento, pago y/o definición de estado de la `
                + `prestación económica indicada en el asunto, con fundamento en los siguientes:`
              }
            />

            {/* HECHOS */}
            <Titulo>HECHOS</Titulo>
            <TextoEd
              k="hecho1"
              plantilla={
                `1. ${f.entidadExpide} expidió la incapacidad No. ${f.incapacidadNumero} a favor de `
                + `${f.trabajador}, identificado(a) con C.C. ${f.trabajadorCc}, por el período comprendido `
                + `entre ${f.fechaInicio} y ${f.fechaFin}, para un total de ${f.totalDias} días.`
              }
            />
            <TextoEd
              k="hecho2"
              plantilla={
                `2. ${f.empleadora} radicó la incapacidad ante ${f.entidadRadicada} el ${f.fechaRadicacion}, `
                + `bajo el radicado No. ${f.radicadoNumero}, adjuntando los documentos exigidos.`
              }
            />
            <TextoEd
              k="hecho3"
              plantilla={
                `3. [SI APLICA] Se realizaron radicaciones, subsanaciones o seguimientos adicionales en las `
                + `siguientes fechas: ${f.relacionRadicados}.`
              }
            />
            <TextoEd
              k="hecho4"
              plantilla={
                `4. [SI APLICA] Mediante comunicación de ${f.fechaComunicacion}, la entidad informó: `
                + `"${f.resumenRespuesta}".`
              }
            />
            <TextoEd
              k="hecho5"
              plantilla={
                `5. A la fecha de presentación de esta petición, ${f.estadoActual}, pese a los soportes radicados.`
              }
            />
            <TextoEd
              k="hecho6"
              plantilla={
                `6. La falta de definición o pago afecta la recuperación de los valores asumidos por el `
                + `empleador y exige una respuesta clara, precisa, congruente y de fondo.`
              }
            />

            {/* FUNDAMENTOS */}
            <Titulo>FUNDAMENTOS</Titulo>
            <TextoEd
              k="fundamento1"
              plantilla={
                `El artículo 23 de la Constitución Política consagra el derecho a presentar peticiones `
                + `respetuosas y obtener pronta resolución. La Ley 1755 de 2015 regula este derecho y, en su `
                + `artículo 32, contempla su ejercicio ante organizaciones privadas en los eventos previstos `
                + `por la ley.`
              }
            />
            <TextoEd
              k="fundamento2"
              plantilla={
                `En materia de incapacidades de origen común, el artículo 206 de la Ley 100 de 1993 dispone `
                + `el reconocimiento de incapacidades en el régimen contributivo conforme a las reglas vigentes. `
                + `El Decreto 780 de 2016, con sus modificaciones, establece las condiciones de reconocimiento y `
                + `pago de las prestaciones económicas del Sistema General de Seguridad Social en Salud. Para `
                + `enfermedad general, los dos (2) primeros días se encuentran a cargo del empleador y, a partir `
                + `del tercer (3) día, el reconocimiento corresponde a la EPS/EOC en los términos de la normativa `
                + `aplicable. El Decreto 1427 de 2022 reglamenta condiciones y trámites para el reconocimiento de `
                + `incapacidades de origen común.`
              }
            />
            <TextoEd
              k="fundamento3"
              plantilla={
                `[INCLUIR ÚNICAMENTE SI ES PERTINENTE AL CASO] La presente solicitud se formula respecto de un `
                + `período que, según la documentación aportada, corresponde a la entidad destinataria. Si la `
                + `entidad considera que el reconocimiento compete a un tercero, deberá indicar de manera clara `
                + `el fundamento y la actuación que corresponda.`
              }
            />

            {/* PETICIONES */}
            <Titulo>PETICIONES</Titulo>
            <TextoEd
              k="peticion1"
              plantilla={`1. Dar respuesta completa y de fondo a la presente petición dentro del término legal aplicable.`}
            />
            <TextoEd
              k="peticion2"
              plantilla={
                `2. Informar el estado actual de la solicitud de reconocimiento y pago de la incapacidad No. `
                + `${f.incapacidadNumero}, correspondiente al período ${f.fechaInicio} a ${f.fechaFin}.`
              }
            />
            <TextoEd
              k="peticion3"
              plantilla={
                `3. En caso de encontrarse cumplidos los requisitos, efectuar el reconocimiento y pago de la `
                + `prestación económica y comunicar el valor reconocido, fecha de pago y medio de giro.`
              }
            />
            <TextoEd
              k="peticion4"
              plantilla={
                `4. En caso de existir objeción, inconsistencia, glosa, falta de documento o causal de rechazo, `
                + `identificarla de manera concreta, indicar su fundamento jurídico y fáctico y precisar el `
                + `mecanismo de subsanación o recurso disponible.`
              }
            />
            <TextoEd
              k="peticion5"
              plantilla={
                `5. Informar el detalle de las radicaciones y actuaciones asociadas al caso, incluyendo fechas, `
                + `estado y número de trámite, cuando dicha información repose en sus sistemas.`
              }
            />
            <TextoEd
              k="peticion6"
              plantilla={
                `6. [SI APLICA] Reconocer o ajustar el valor pendiente de pago por la suma de $${f.valorPendiente}, `
                + `según los soportes anexos.`
              }
            />

            {/* PRUEBAS Y ANEXOS */}
            <Titulo>PRUEBAS Y ANEXOS</Titulo>
            <TextoEd
              k="anexo1"
              plantilla={`1. Certificado de existencia y representación legal de ${f.empleadora} [SI APLICA].`}
            />
            <TextoEd k="anexo2" plantilla={`2. Copia de la incapacidad No. ${f.incapacidadNumero}.`} />
            <TextoEd k="anexo3" plantilla={`3. Soporte de afiliación y/o certificación requerida.`} />
            <TextoEd k="anexo4" plantilla={`4. Relación y soportes de radicaciones previas.`} />
            <TextoEd k="anexo5" plantilla={`5. Respuestas, objeciones o comunicaciones emitidas por la entidad.`} />
            <TextoEd k="anexo6" plantilla={`6. Copia del documento de identidad del trabajador [SI ES NECESARIO Y PROCEDENTE].`} />
            <TextoEd k="anexo7" plantilla={`7. [OTROS DOCUMENTOS PERTINENTES].`} />

            {/* NOTIFICACIONES */}
            <Titulo>NOTIFICACIONES</Titulo>
            <TextoEd
              k="notificaciones"
              plantilla={
                `${f.empleadora} recibirá notificaciones relacionadas con esta petición en la `
                + `${f.direccionNotificacion}, y en el correo ${f.correoTramite}.`
              }
            />

            <p className="pt-2">Atentamente,</p>

            {/* Firma */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black pt-1 font-bold inline-block">{f.repLegal}</p>
              <p>Representante Legal</p>
              <p className="font-bold">{f.empleadora}</p>
              <p>NIT {f.nit}</p>
            </div>

            {/* Pie de elaboración (Talento Humano) */}
            <div className="pt-6 text-[10px] space-y-0.5">
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {f.reviso}</p>
            </div>

            <PieMembrete />
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos de la petición</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman los párrafos de arriba. Escribe la cédula del trabajador y se trae su nombre de la
                ficha de personal. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="N.º / identificación (asunto)" value={f.asuntoNumero} onChange={(v) => set('asuntoNumero', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />
              <Campo label="EPS / entidad destinataria" value={f.eps} onChange={(v) => set('eps', v)} />
              <Campo label="Ciudad / correo de radicación" value={f.epsCiudadCorreo} onChange={(v) => set('epsCiudadCorreo', v)} />

              <Campo label="Cédula del trabajador" value={f.trabajadorCc} onChange={(v) => set('trabajadorCc', v)} onBlur={prellenar} />
              <Campo label="Nombre del trabajador" value={f.trabajador} onChange={(v) => set('trabajador', v)} />
              <Campo label="Entidad / profesional / IPS que expide" value={f.entidadExpide} onChange={(v) => set('entidadExpide', v)} />
              <Campo label="Incapacidad N.º" value={f.incapacidadNumero} onChange={(v) => set('incapacidadNumero', v)} />
              <Campo label="Período — desde" value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
              <Campo label="Período — hasta" value={f.fechaFin} onChange={(v) => set('fechaFin', v)} />
              <Campo label="Total de días" value={f.totalDias} onChange={(v) => set('totalDias', v)} />

              <Campo label="Entidad ante la que se radicó" value={f.entidadRadicada} onChange={(v) => set('entidadRadicada', v)} />
              <Campo label="Fecha de radicación" value={f.fechaRadicacion} onChange={(v) => set('fechaRadicacion', v)} />
              <Campo label="Radicado N.º" value={f.radicadoNumero} onChange={(v) => set('radicadoNumero', v)} />
              <Campo label="Relación de radicados (si aplica)" value={f.relacionRadicados} onChange={(v) => set('relacionRadicados', v)} area />
              <Campo label="Fecha de comunicación (si aplica)" value={f.fechaComunicacion} onChange={(v) => set('fechaComunicacion', v)} />
              <Campo label="Resumen de la respuesta / objeción" value={f.resumenRespuesta} onChange={(v) => set('resumenRespuesta', v)} area />
              <Campo label="Estado actual" value={f.estadoActual} onChange={(v) => set('estadoActual', v)} area />
              <Campo label="Valor pendiente (COP)" value={f.valorPendiente} onChange={(v) => set('valorPendiente', v)} />

              <Campo label="Dirección de notificación" value={f.direccionNotificacion} onChange={(v) => set('direccionNotificacion', v)} area />
              <Campo label="Correo designado para el trámite" value={f.correoTramite} onChange={(v) => set('correoTramite', v)} />
              <Campo label="Elaboró (nombre - cargo)" value={f.elaboro} onChange={(v) => set('elaboro', v)} />
              <Campo label="Revisó (nombre - cargo)" value={f.reviso} onChange={(v) => set('reviso', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta petición. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="font-bold text-center pt-2">{children}</p>;
}

function CtrlRow({ label, value, onChange, last }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={'grid grid-cols-[150px_1fr] ' + (last ? '' : 'border-b border-[#e6d200]')}>
      <div className="bg-[#fffbe0] font-semibold px-3 py-1.5 border-r border-[#e6d200]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 outline-none bg-transparent text-[11px]"
      />
    </div>
  );
}

function Campo({ label, value, onChange, onBlur, area }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; area?: boolean;
}) {
  return (
    <label className={'block ' + (area ? 'md:col-span-2' : '')}>
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={3}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      )}
    </label>
  );
}
