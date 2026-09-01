import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { FORMATO_NOTIFICACION_TERMINACION_JC } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Notificación de terminación del contrato de trabajo con justa causa (modelo de uso especial).
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = NOTIFICACION-TERMINACION-JC). Se diligencia, se guarda y se imprime para
 * entregarlo al trabajador; no tiene máquina de estados, así que se queda en borrador y
 * siempre se puede corregir.
 *
 * Modelo de uso especial: no genera una decisión automática. La firma es la del
 * Representante Legal y la revisión jurídica al pie es constante (Dirección Jurídica). El
 * bloque de CONTROL JURÍDICO va marcado `no-print`: recuerda validar hechos, pruebas,
 * descargos, causal legal y procedimiento antes de usar, y no aparece en la carta final.
 *
 * Ruta: `.../talento-humano/notificacion-terminacion-jc/:id`.
 */

/** La empleadora y quien firma. Constantes de la empresa. */
const REP_LEGAL = { nombre: 'GLORIA LUCÍA ESCALANTE MANZANO', cargo: 'Representante Legal' };
/** Quien revisa jurídicamente. Constante: siempre la Dirección Jurídica. */
const REVISO = 'Marta Cecilia Rodríguez Herrera - Directora Jurídica';

interface NotificacionState {
  empleadora: string;
  nit: string;

  // ── Control jurídico (no se imprime) ──
  revisionJuridicaPrevia: string;
  causalLegalCtrl: string;
  soporteInterno: string;

  // ── Fecha ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  // ── Destinatario ──
  nombreTrabajador: string;
  ccTrabajador: string;
  cargo: string;
  saludoApellido: string;

  // ── Datos interpolados en el cuerpo ──
  fechaEfectos: string;
  fechaComunicacionPrevia: string;
  fechaDescargos: string;
  fechaDecision: string;

  // ── Pie ──
  elaboro: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: NotificacionState = {
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  revisionJuridicaPrevia: '[NOMBRE / FECHA / APROBADO]',
  causalLegalCtrl: '[ART. 62 CST, LITERAL / NUMERAL U OTRA NORMA APLICABLE]',
  soporteInterno: '[CLÁUSULA CONTRATO / RIT / POLÍTICA / MANUAL]',

  ciudad: '[CIUDAD]',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',

  nombreTrabajador: '[NOMBRE DEL TRABAJADOR]',
  ccTrabajador: '[NÚMERO]',
  cargo: '[CARGO]',
  saludoApellido: '[SEÑOR/SEÑORA + APELLIDO]',

  fechaEfectos: '[FECHA / HORA, SI APLICA]',
  fechaComunicacionPrevia: '[FECHA]',
  fechaDescargos: '[FECHA]',
  fechaDecision: '[FECHA]',

  elaboro: '[NOMBRE - CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function NotificacionTerminacionJustaCausaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const notiId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<NotificacionState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof NotificacionState>(k: K, v: NotificacionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (notiId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(notiId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<NotificacionState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la notificación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notiId]);

  /**
   * Con la cédula llega el nombre del trabajador de la ficha de personal. Se dispara al
   * salir de la casilla y solo llena lo que sigue como plantilla, para no pisar lo escrito.
   */
  const prellenar = async () => {
    if (!editable) return;
    const cedula = f.ccTrabajador.replace(/\D/g, '');
    if (cedula !== f.ccTrabajador) set('ccTrabajador', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => ({
      ...p,
      nombreTrabajador: (!p.nombreTrabajador.trim() || p.nombreTrabajador === EMPTY.nombreTrabajador) ? nombreDeFicha(ficha) : p.nombreTrabajador,
      cargo: (!p.cargo.trim() || p.cargo === EMPTY.cargo) ? (ficha.cargo ?? '') : p.cargo,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(notiId, {
        gestion: 'talento-humano',
        formato: FORMATO_NOTIFICACION_TERMINACION_JC,
        data: f,
      });
      toast.success('Notificación guardada');
      if (notiId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/notificacion-terminacion-jc/${guardado.solicitudId}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/notificacion-terminacion-jc')} title="Volver a las notificaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Notificación de terminación con justa causa</h1>
            <p className="text-xs text-[#4a4a63]">Notificación N.º {notiId ?? 'nuevo'}</p>
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
                <h2 className="font-bold text-[13px] leading-tight">NOTIFICACIÓN DE TERMINACIÓN DEL CONTRATO DE TRABAJO</h2>
                <p className="font-bold text-[11px]">CON JUSTA CAUSA - MODELO DE USO ESPECIAL</p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Control jurídico — no se imprime en la carta final */}
            <div className="no-print border border-[#e6d200] rounded overflow-hidden text-[11px]">
              <div className="grid grid-cols-[240px_1fr] border-b border-[#e6d200]">
                <div className="bg-[#fff6c2] font-bold px-3 py-1.5 border-r border-[#e6d200]">
                  CONTROL JURÍDICO OBLIGATORIO · NO SE IMPRIME EN LA CARTA FINAL
                </div>
                <p className="px-3 py-1.5 text-[10px] text-[#4a4a63]">
                  No generar decisión automática. Antes de usar: validar hechos, pruebas, descargos,
                  RIT/contrato, proporcionalidad, inmediatez, procedimiento aplicable y causal legal específica.
                </p>
              </div>
              <CtrlRow label="Revisión jurídica previa" value={f.revisionJuridicaPrevia} onChange={(v) => set('revisionJuridicaPrevia', v)} />
              <CtrlRow label="Causal legal" value={f.causalLegalCtrl} onChange={(v) => set('causalLegalCtrl', v)} />
              <CtrlRow label="Soporte interno" value={f.soporteInterno} onChange={(v) => set('soporteInterno', v)} last />
            </div>

            {/* Fecha */}
            <p className="pt-1">{f.ciudad}, {f.dia} de {f.mes} de {f.anio}</p>

            {/* Destinatario */}
            <div>
              <p>Señor(a)</p>
              <p className="font-bold">{f.nombreTrabajador}</p>
              <p>C.C. No. {f.ccTrabajador}</p>
              <p>Cargo: {f.cargo}</p>
              <p>Presente</p>
            </div>

            <p><span className="font-bold">Asunto:</span> Terminación del contrato de trabajo con justa causa.</p>

            <p>Cordial saludo, {f.saludoApellido}:</p>

            {/* Encabezado */}
            <TextoEd
              k="intro"
              plantilla={
                `Por medio de la presente, ${f.empleadora} le comunica la decisión de dar por terminado su `
                + `contrato individual de trabajo con justa causa, con efectos a partir del ${f.fechaEfectos}, `
                + `con fundamento exclusivo en los hechos, pruebas y disposiciones que se exponen a continuación.`
              }
            />

            {/* 1. HECHOS OBJETO DE LA DECISIÓN */}
            <Titulo>1. HECHOS OBJETO DE LA DECISIÓN</Titulo>
            <TextoEd
              k="hechos"
              plantilla={
                `[DESCRIBIR DE FORMA CLARA, CONCRETA Y CRONOLÓGICA LOS HECHOS ACREDITADOS. IDENTIFICAR FECHAS, `
                + `DOCUMENTOS, ACTUACIONES Y CIRCUNSTANCIAS RELEVANTES. NO INCLUIR HECHOS QUE NO HAYAN SIDO `
                + `PUESTOS EN CONOCIMIENTO DEL TRABAJADOR CUANDO EL PROCEDIMIENTO EXIJA DESCARGOS].`
              }
            />

            {/* 2. OPORTUNIDAD DE DESCARGOS Y DEFENSA */}
            <Titulo>2. OPORTUNIDAD DE DESCARGOS Y DEFENSA</Titulo>
            <TextoEd
              k="descargos1"
              plantilla={
                `Mediante comunicación de fecha ${f.fechaComunicacionPrevia}, la empresa puso en su conocimiento `
                + `los hechos objeto de revisión y le brindó la oportunidad de presentar sus explicaciones y `
                + `aportar los soportes que considera pertinentes. La diligencia / respuesta de descargos tuvo `
                + `lugar el ${f.fechaDescargos}, oportunidad en la cual usted manifestó, en síntesis: `
                + `[RESUMEN FIEL Y OBJETIVO DE LOS DESCARGOS].`
              }
            />
            <TextoEd
              k="descargos2"
              plantilla={`Los soportes presentados por usted fueron revisados junto con [IDENTIFICAR PRUEBAS RELEVANTES].`}
            />

            {/* 3. VALORACIÓN */}
            <Titulo>3. VALORACIÓN</Titulo>
            <TextoEd
              k="valoracion"
              plantilla={
                `Analizados los descargos y las pruebas disponibles, la empresa concluye: [EXPLICAR POR QUÉ LOS `
                + `HECHOS SE CONSIDERAN ACREDITADOS Y POR QUÉ LOS DESCARGOS NO DESVIRTÚAN / SÍ MODIFICAN `
                + `PARCIALMENTE LOS HECHOS. EVITAR AFIRMACIONES GENÉRICAS].`
              }
            />

            {/* 4. FUNDAMENTO DE LA JUSTA CAUSA */}
            <Titulo>4. FUNDAMENTO DE LA JUSTA CAUSA</Titulo>
            <TextoEd
              k="fundamento1"
              plantilla={
                `La conducta descrita se subsume en [INDICAR CAUSAL LEGAL ESPECÍFICA, POR EJEMPLO ARTÍCULO 62, `
                + `LITERAL A), NUMERAL __ DEL CÓDIGO SUSTANTIVO DEL TRABAJO], en concordancia con [ARTÍCULO 58 / `
                + `60 CST, SI REALMENTE APLICA], así como con [CLÁUSULA CONTRACTUAL / ARTÍCULO DEL RIT / POLÍTICA] `
                + `que establece: "[TRANSCRIBIR SOLO EL APARTE PERTINENTE]".`
              }
            />
            <TextoEd
              k="fundamento2"
              plantilla={
                `La empresa considera que, atendiendo las circunstancias concretas, la gravedad de la conducta, `
                + `sus efectos, el cargo desempeñado y los antecedentes relevantes que legalmente puedan valorarse, `
                + `se configura la justa causa indicada. [INCLUIR AQUÍ LA JUSTIFICACIÓN DE PROPORCIONALIDAD `
                + `CUANDO SEA NECESARIA].`
              }
            />

            {/* 5. DECISIÓN */}
            <Titulo>5. DECISIÓN</Titulo>
            <TextoEd
              k="decision1"
              plantilla={
                `En consecuencia, ${f.empleadora} da por terminado su contrato de trabajo con justa causa a `
                + `partir del ${f.fechaDecision}. La empresa realizará la liquidación definitiva de salarios, `
                + `prestaciones sociales y demás acreencias laborales legalmente causadas hasta la fecha de `
                + `terminación, así como los trámites de retiro que correspondan.`
              }
            />
            <TextoEd
              k="decision2"
              plantilla={
                `La presente comunicación contiene las razones concretas de la decisión y se entrega para su `
                + `conocimiento y constancia.`
              }
            />

            <p className="pt-1">Atentamente,</p>

            {/* Firma del representante legal */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black pt-1 font-bold inline-block">{REP_LEGAL.nombre}</p>
              <p>{REP_LEGAL.cargo}</p>
              <p className="font-bold">{f.empleadora}</p>
            </div>

            {/* Recibido por el trabajador (se firma a mano al entregar) */}
            <div className="pt-4 text-[11px]">
              <p>Recibido por el/la trabajador(a):</p>
              <p>Nombre: _______________________________________</p>
              <p>C.C.: _________________________________________</p>
              <p>Firma: ________________________________________</p>
              <p>Fecha y hora: _________________________________</p>
              <p>Copia: Historia laboral</p>
            </div>

            {/* Pie de elaboración */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {REVISO}</p>
            </div>

            <PieMembrete />
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato.
              Las secciones narrativas (hechos, valoración, fundamento) se escriben directamente
              sobre el documento. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos de la notificación</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman el encabezado y los párrafos. Escribe la cédula del trabajador y se traen su nombre y
                cargo de la ficha de personal. Las secciones 1 a 5 se redactan directamente sobre el documento;
                un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />

              <Campo label="Cédula del trabajador" value={f.ccTrabajador} onChange={(v) => set('ccTrabajador', v)} onBlur={prellenar} />
              <Campo label="Nombre del trabajador" value={f.nombreTrabajador} onChange={(v) => set('nombreTrabajador', v)} />
              <Campo label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
              <Campo label="Saludo (Señor/Señora + apellido)" value={f.saludoApellido} onChange={(v) => set('saludoApellido', v)} />

              <Campo label="Fecha de efectos (intro)" value={f.fechaEfectos} onChange={(v) => set('fechaEfectos', v)} />
              <Campo label="Fecha comunicación previa (descargos)" value={f.fechaComunicacionPrevia} onChange={(v) => set('fechaComunicacionPrevia', v)} />
              <Campo label="Fecha de la diligencia de descargos" value={f.fechaDescargos} onChange={(v) => set('fechaDescargos', v)} />
              <Campo label="Fecha efectiva de la decisión" value={f.fechaDecision} onChange={(v) => set('fechaDecision', v)} />

              <Campo label="Elaboró (nombre - cargo)" value={f.elaboro} onChange={(v) => set('elaboro', v)} />

              <Campo label="Control jurídico · Revisión previa" value={f.revisionJuridicaPrevia} onChange={(v) => set('revisionJuridicaPrevia', v)} />
              <Campo label="Control jurídico · Causal legal" value={f.causalLegalCtrl} onChange={(v) => set('causalLegalCtrl', v)} />
              <Campo label="Control jurídico · Soporte interno" value={f.soporteInterno} onChange={(v) => set('soporteInterno', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta notificación. Puedes consultarla e imprimirla.
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
    <div className={'grid grid-cols-[240px_1fr] ' + (last ? '' : 'border-b border-[#e6d200]')}>
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
