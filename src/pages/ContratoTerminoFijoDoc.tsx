import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';

/**
 * Plantilla de contrato para el tipo "Término Fijo" (contrato laboral).
 * Estructura distinta al de prestación de servicios: empleadora/trabajadora, salario,
 * jornada y prestaciones de ley. Recibe la solicitud ya cargada. Se guarda en data.contrato.
 */

interface TFState {
  empleadora: string; empleadoraCc: string; domicilioEmpleadora: string;
  trabajadora: string; trabajadoraCc: string; direccionTrabajadora: string; lugarFechaNacimiento: string;
  cargo: string; salario: string; periodosPago: string;
  fechaIniciacion: string; fechaTerminacion: string;
  duracion: string; inicio: string; fin: string; periodoPrueba: string;
  ciudadFirma: string; fechaFirma: string;
  empleadoraFirmante: string; empleadoraFirmanteCc: string;
}

const EMPTY: TFState = {
  empleadora: '', empleadoraCc: '', domicilioEmpleadora: '',
  trabajadora: '', trabajadoraCc: '', direccionTrabajadora: '', lugarFechaNacimiento: '',
  cargo: '', salario: '', periodosPago: '',
  fechaIniciacion: '', fechaTerminacion: '',
  duracion: '', inicio: '', fin: '', periodoPrueba: '',
  ciudadFirma: '', fechaFirma: '',
  empleadoraFirmante: '', empleadoraFirmanteCc: '',
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function ContratoTerminoFijoDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;
  /*
   * La solicitud se guarda en estado propio porque la acción de la etapa la cambia:
   * al remitir el contrato a firma, `AccionesFlujo` devuelve la solicitud recargada y
   * con ella se repintan las pestañas y el propio panel. Leyendo siempre la prop, la
   * pantalla se quedaría mostrando la etapa anterior hasta que alguien recargara.
   */
  const [sol, setSol] = useState(solicitud);
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<TFState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Partial<TFState>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    return {
      ...EMPTY,
      ...saved,
      empleadora: saved.empleadora || d.empresa || '',
      domicilioEmpleadora: saved.domicilioEmpleadora || '',
      trabajadora: saved.trabajadora || d.contratista || '',
      trabajadoraCc: saved.trabajadoraCc || des.contratistaCc || acta.contratistaCc || '',
      direccionTrabajadora: saved.direccionTrabajadora || acta.direccion || '',
      salario: saved.salario || d.honorarios || '',
      periodosPago: saved.periodosPago || d.formaPago || '',
      fechaIniciacion: saved.fechaIniciacion || acta.fechaInicio || '',
      fechaTerminacion: saved.fechaTerminacion || acta.fechaFinal || '',
      inicio: saved.inicio || acta.fechaInicio || '',
      fin: saved.fin || acta.fechaFinal || '',
      empleadoraFirmante: saved.empleadoraFirmante || des.funcionarioNombre || '',
    };
  });

  const set = <K extends keyof TFState>(k: K, v: TFState[K]) => setF((p) => ({ ...p, [k]: v }));

  /**
   * Devuelve si se guardó, porque `AccionesFlujo` lo usa para decidir si sigue: la acción
   * afirma lo que el documento dice, y remitir a firma un contrato que no se alcanzó a
   * guardar adelantaría el trámite sobre un texto que nadie escribió.
   */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId, 'contrato', f);
      toast.success('Contrato guardado');
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const irSolicitud = () => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`);

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Término Fijo</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Contrato de trabajo a término fijo · Solicitud N.º {solicitudId}</p>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>

        <div className="max-w-4xl mx-auto px-6 pb-2">
          <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="contrato" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: el contrato se remite a firma acá.
            Guardar el documento no mueve el flujo; esto sí. */}
        <AccionesFlujo
          sol={sol} documento="contrato" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se genera en la etapa «Contrato en revisión (Jurídica)».</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={irSolicitud}>Ir a la solicitud</Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_130px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] border-r border-[#0a2a52]">
                CONTRATO DE TRABAJO A TÉRMINO FIJO
              </div>
              <div className="flex items-center justify-center p-1">
                <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
              </div>
            </div>

            <div className="px-8 py-6">
              {/* Tabla de datos */}
              <table className="w-full border-collapse text-[12px] mb-5">
                <tbody>
                  <Row label="LA EMPLEADORA" value={f.empleadora} onChange={(v) => set('empleadora', v)} />
                  <Row label="DOMICILIO LA EMPLEADORA" value={f.domicilioEmpleadora} onChange={(v) => set('domicilioEmpleadora', v)} placeholder="Ciudad (Valle)" />
                  <Row label="LA TRABAJADORA" value={f.trabajadora} onChange={(v) => set('trabajadora', v)} />
                  <Row label="Identificación" value={f.trabajadoraCc} onChange={(v) => set('trabajadoraCc', v)} placeholder="C.C. ..." />
                  <Row label="DIRECCIÓN DE LA TRABAJADORA" value={f.direccionTrabajadora} onChange={(v) => set('direccionTrabajadora', v)} placeholder="... (Valle)" />
                  <Row label="LUGAR Y FECHA DE NACIMIENTO" value={f.lugarFechaNacimiento} onChange={(v) => set('lugarFechaNacimiento', v)} />
                  <Row label="CARGO A DESEMPEÑAR" value={f.cargo} onChange={(v) => set('cargo', v)} />
                  <Row label="SALARIO BÁSICO MENSUAL" value={f.salario} onChange={(v) => set('salario', v)} area placeholder="Un ... pesos M/L, más todas sus prestaciones de Ley." />
                  <Row label="PERIODOS DE PAGO" value={f.periodosPago} onChange={(v) => set('periodosPago', v)} />
                  <Row label="FECHA DE INICIACIÓN DE LABORES" value={f.fechaIniciacion} onChange={(v) => set('fechaIniciacion', v)} />
                  <Row label="FECHA DE TERMINACIÓN DE LABORES" value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} />
                </tbody>
              </table>

              <div className="space-y-3 text-justify leading-relaxed text-[12px]">
                <p>
                  Entre las suscritas a saber <b>{f.empleadora || '…'}</b>, mayor de edad, identificada con cédula de ciudadanía No.{' '}
                  <Inline value={f.empleadoraCc} onChange={(v) => set('empleadoraCc', v)} placeholder="No." />, quien en adelante se
                  denominará <b>LA EMPLEADORA</b> y por otra parte <b>{f.trabajadora || '…'}</b>, mayor de edad, identificada con cédula
                  de ciudadanía No. {tx(f.trabajadoraCc)}, actuando en nombre propio y quien en adelante se denominará{' '}
                  <b>LA TRABAJADORA</b>, hemos convenido celebrar contrato a término fijo, que se regirá por las siguientes cláusulas:
                </p>

                <Clausula titulo="PRIMERA. OBJETO.">
                  LA TRABAJADORA se obliga para con LA EMPLEADORA, a incorporar a su servicio toda su capacidad normal de trabajo, de
                  manera personal y exclusiva en el desempeño normal de sus funciones de{' '}
                  <Inline value={f.cargo} onChange={(v) => set('cargo', v)} placeholder="cargo" />, y en las anexas y complementarias que
                  se originen en el mismo cargo, de conformidad con las órdenes e instrucciones que en forma verbal o escrita le imparta
                  LA EMPLEADORA o sus representantes o estimen necesarias para el desarrollo de sus funciones. Igualmente se obliga a no
                  prestar directa ni indirectamente servicios laborales a otros empleadores, ni a trabajar por cuenta propia en el mismo
                  oficio, a no atender en horas de trabajo asuntos u ocupaciones distintas de las que LA EMPLEADORA le encomiende sin la
                  previa autorización de éste, así como abstenerse de realizar fuera del lugar destinado a su trabajo, salvo y ocasiones
                  desgastes de su organismo de forma tal que impidan una adecuada prestación del servicio convenido.
                </Clausula>

                <Clausula titulo="SEGUNDA. JORNADA DE TRABAJO.">
                  LA TRABAJADORA se compromete a cumplir una jornada de cuarenta y seis (46) horas semanales, en los turnos y dentro de
                  los horarios que determine LA EMPLEADORA.
                </Clausula>

                <Clausula titulo="TERCERA. LUGAR DE PRESTACIÓN DEL SERVICIO.">
                  La labor aquí contratada la desarrollará LA TRABAJADORA en los lugares o sitios que para tal efecto le indique LA
                  EMPLEADORA. Igualmente, LA TRABAJADORA acepta cualquier orden de traslado que se le imparta para desempeñar otro cargo
                  o función.
                </Clausula>

                <Clausula titulo="CUARTA. SALARIO.">
                  LA EMPLEADORA reconocerá y pagará como retribución por los servicios LA TRABAJADORA, un SALARIO ORDINARIO BÁSICO por la
                  suma de <Inline value={f.salario} onChange={(v) => set('salario', v)} placeholder="$ ... PESOS M/L" />, pagaderos en dos
                  fracciones en pagos quincenales, dentro del cual se establece la remuneración de los descansos dominicales y festivos de
                  que tratan los Capítulos I, II y III del Título VII del Código Sustantivo del Trabajo.
                </Clausula>
                <P><b>Parágrafo 1:</b> Toda remuneración variable que llegue a recibir LA TRABAJADORA se entenderá distribuida así: El 82.5% que remunera la labor ordinaria y el 17.5% restante que remunera el descanso en días dominicales y festivos.</P>
                <P><b>Parágrafo 2:</b> Con base en lo previsto en el Artículo 128 del Código Sustantivo del Trabajo, subrogado por el Artículo 15 de la Ley 50 de 1.990, LA TRABAJADORA y LA EMPLEADORA han convenido que, además de lo previsto legalmente, tampoco tendrán carácter salarial en dinero o en especie para efectos del presente contrato, ni inciden por la razón en la liquidación de prestaciones sociales y demás derechos, los siguientes: a) Eventuales bonos que LA TRABAJADORA pudiese recibir; b) Cualquier tipo de gasto y el respectivo reembolso por cuenta de gastos u otro medio cuando LA TRABAJADORA realice viajes de negocios en asuntos de LA EMPLEADORA (incluye pero no se limita a gastos de transporte, de representación, manutención y alojamiento, sean éstos de carácter permanente, habitual u ocasional); c) Los suministros en especie, tales como la alimentación, habitación o vestuario, lavado de ropas, los servicios de campamento y casinos u otro servicio de cualquier naturaleza que LA EMPLEADORA otorgue o llegue a otorgar en el futuro a LA TRABAJADORA; y, d) En general, los estipendios, bonificaciones, prestaciones sociales, beneficios, auxilios, suministros, gratificaciones y devengos de cualquier naturaleza otorgados por LA EMPLEADORA de acuerdo con sus planes y políticas administrativas internas sin que se tome en cuenta su origen, su finalidad o la periodicidad de su percepción.</P>

                <Clausula titulo="QUINTA. JUSTAS CAUSAS DE TERMINACIÓN.">
                  Son justas causas para dar por terminado el contrato de trabajo, el incumplimiento a cualquiera de las obligaciones aquí
                  establecidas, así como las previstas en el Artículo 7º del Decreto 2351 de 1965 y además por parte LA EMPLEADORA las
                  siguientes faltas que por el efecto se califican como graves: a) La violación grave por parte LA TRABAJADORA de cualquiera
                  de sus obligaciones legales, contractuales o reglamentarias; b) La no asistencia al trabajo, sin motivos justificados a
                  juicio de LA EMPLEADORA, por dos veces dentro de un mismo mes calendario; c) La ejecución por parte LA TRABAJADORA de
                  labores remuneradas al servicio de terceros sin autorización de LA EMPLEADORA; d) Las repetidas desavenencias con
                  compañeros de trabajo; e) El incumplimiento de las obligaciones de confidencialidad contenidas en la cláusula octava del
                  presente contrato; f) El hecho que LA TRABAJADORA llegue embriagada al trabajo o ingiera bebidas embriagantes en el sitio
                  de trabajo, aún por la primera vez; g) El hecho de que LA TRABAJADORA abandone el sitio de trabajo sin permiso de sus
                  superiores o sin una clara justificación; h) La no asistencia a una sesión completa de la jornada de trabajo, o más, sin
                  excusa suficiente a juicio de LA EMPLEADORA salvo fuerza mayor o caso fortuito.
                </Clausula>
                <P><b>Parágrafo:</b> LA TRABAJADORA declara conocer los siguientes documentos existentes en LA EMPLEADORA y se obliga de manera especial a dar cumplimiento a las obligaciones contenidas en ellos: Reglamento Interno de Trabajo, Política de seguridad y salud en el trabajo. La violación de dichas obligaciones también podrá dar lugar a la terminación del contrato de trabajo con justa causa.</P>

                <Clausula titulo="SEXTA. DURACIÓN Y PERÍODO DE PRUEBA.">
                  El presente contrato es a Término Fijo, con una duración de{' '}
                  <Inline value={f.duracion} onChange={(v) => set('duracion', v)} placeholder="un (01) año" /> contado del{' '}
                  <Inline value={f.inicio} onChange={(v) => set('inicio', v)} placeholder="fecha de inicio" /> al{' '}
                  <Inline value={f.fin} onChange={(v) => set('fin', v)} placeholder="fecha final" />, ambas fechas inclusive. Por lo tanto,
                  para este caso, el período de prueba no puede exceder la quinta parte del contrato, lo que equivale a{' '}
                  <Inline value={f.periodoPrueba} onChange={(v) => set('periodoPrueba', v)} placeholder="60" /> días laborales que
                  corresponden a período de prueba.
                </Clausula>

                <Clausula titulo="SÉPTIMA. VIGENCIA Y MODIFICACIÓN.">
                  El presente contrato reemplaza en su integridad y deja sin efecto alguno cualquier otro contrato verbal o escrito celebrado
                  entre las partes con anterioridad. En consecuencia, las partes manifiestan que no reconocerán validez a estipulaciones
                  verbales relacionadas con el presente contrato el cual conformará el acuerdo completo y total acerca de su objeto, de tal
                  forma que cualquier modificación que sufra el presente contrato deberá hacerse constar por escrito.
                </Clausula>

                <Clausula titulo="OCTAVA. CONFIDENCIALIDAD.">
                  LA TRABAJADORA {f.trabajadora || '…'}, guardará absoluta confidencialidad sobre toda la información reservada que maneje y
                  a la que pudiere tener acceso. LA TRABAJADORA se obliga a conservar, mantener y manejar la reserva y confidencialidad de
                  toda la información que reciba de los funcionarios, empleados de manera directa o indirecta, en forma verbal, escrita,
                  gráfica, en medio magnético, electrónico, o bajo cualquier otra forma, que sea entregada con el ánimo de realizar
                  operaciones propias de su objeto social y/o relativas al objeto del presente Acuerdo, sin que para el efecto sea necesario
                  que la parte reveladora la califique como confidencial o reservada, en adelante denominada la "Información Confidencial" o
                  la "información" indistintamente. En dicho sentido, se obliga LA TRABAJADORA a tomar todas las medidas necesarias para que
                  la información no llegue a manos de terceros ni de la competencia en ninguna circunstancia y se obliga a utilizarla
                  únicamente para adelantar las tareas que se requieran para llevar a cabo el desarrollo, estructuración y puesta en marcha
                  de negocios conjuntos, que redunden en beneficios económicos para LA EMPLEADORA, acceso a la información o realizar las
                  operaciones que tiene disponibles para ello.
                </Clausula>
                <P><b>PARÁGRAFO PRIMERO:</b> LA TRABAJADORA se compromete a guardar confidencialidad absoluta, respecto del conocimiento directo o indirecto que, por ocasión de su labor, llegase a tener de la empleadora, filiales, controladas o subordinadas, que guardan estrecha relación comercial, financiera, contable y laboral de LA EMPLEADORA.</P>
                <P><b>PARÁGRAFO SEGUNDO:</b> LA TRABAJADORA se abstendrá, por sí, por su personal o por terceros, directa o indirectamente, de comportamientos que puedan constituir competencia desleal o actos de esta naturaleza, para con LA EMPLEADORA, sus usuarios o terceros, o conductas contrarias a la confidencialidad exigida por la ley y el Contrato.</P>
                <P><b>PARÁGRAFO TERCERO:</b> LA TRABAJADORA conoce y acepta desde ya que la divulgación y el uso indebido o no autorizado de la información que conozca o maneje puede causar un perjuicio irreparable a LA EMPLEADORA. Por lo mismo, se compromete a no hacer ningún tipo de uso indebido o no autorizado de la información. Asimismo, se compromete a manejar la información que conozca o maneje con un mayor grado de cuidado de aquel con el cual maneja su propia información confidencial y sus propios secretos industriales. LA TRABAJADORA se compromete a que deberá resarcir a LA EMPLEADORA, por cualquier uso indebido o no autorizado, culpable o no, que ella, sus empleados, socios, subcontratistas, asesores y demás personas puedan llegar a dar a la información que conozca o maneje. Los términos y condiciones aquí contenidos son de obligatorio cumplimiento y aceptación, por parte de quienes sean autorizados para tener acceso a la información o realizar las operaciones que tiene disponibles para ello.</P>
                <P><b>PARÁGRAFO CUARTO – EXIGENCIA DE INDEMNIZACIÓN:</b> En el evento de violación de este Acuerdo por parte LA TRABAJADORA, dicho evento dará derecho a LA EMPLEADORA, a exigir por los medios judiciales pertinentes, la indemnización de perjuicios, incluyendo dentro de dicha indemnización las costas judiciales y agencias en derecho a que hubiere lugar. En ese caso, LA EMPLEADORA tendrá toda la facultad de demandar y exigir judicialmente la reparación de perjuicios a la parte cumplida. En virtud de lo pactado en esta cláusula y, sin perjuicio del derecho de LA EMPLEADORA, LA TRABAJADORA reconocerá y pagará incondicional e irrevocablemente a LA EMPLEADORA el valor que se estime por la ley para reconocer el perjuicio creado. Así las cosas, LA TRABAJADORA se compromete y acepta expresamente que la presente obligación presta mérito ejecutivo y que, por lo tanto, puede ser ejecutada mediante proceso ejecutivo sin requerimiento o reconvención alguna al que se renuncia expresamente.</P>

                <Clausula titulo="NOVENA. DIRECCIONES Y NOTIFICACIONES.">
                  En el encabezado de este contrato LA TRABAJADORA ha suministrado y anotado la dirección actual de su residencia
                  permanente. Toda notificación que LA EMPLEADORA tuviere que hacerle a LA TRABAJADORA debido al desarrollo o terminación
                  del presente contrato, se entenderá válida y legalmente hecha si se dirige a la dirección de LA TRABAJADORA que figura en
                  las oficinas de LA EMPLEADORA. En caso de cambio de residencia LA TRABAJADORA está obligada a avisar dicha circunstancia a
                  LA EMPLEADORA dentro de los cinco (5) días siguientes a dicho cambio, de no hacerlo se entenderá que siguen rigiendo para
                  todos los efectos legales los datos que posee LA EMPLEADORA.
                </Clausula>

                <Clausula titulo="DÉCIMA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS.">
                  LA TRABAJADORA se obliga a desempeñar sus funciones con integridad, ética y lealtad hacia LA EMPLEADORA. En este sentido,
                  queda estrictamente prohibido solicitar, recibir, aceptar directa o indirectamente cualquier pago, comisión, gratificación,
                  beneficio, dádiva o cualquier otra retribución de proveedores, contratistas, clientes o cualquier tercero con quien la
                  empleadora mantenga o pueda mantener relaciones comerciales o contractuales. El incumplimiento de esta disposición
                  constituirá una falta grave y será causal de terminación inmediata del contrato de trabajo con justa causa, sin perjuicio
                  de las acciones legales que LA EMPLEADORA pueda ejercer en contra de LA TRABAJADORA por los daños y perjuicios ocasionados.
                </Clausula>

                <Clausula titulo="DÉCIMA PRIMERA. PROTECCIÓN DE DATOS PERSONALES.">
                  LA TRABAJADORA en su condición de titular de la información, autoriza a la empleadora para almacenar en sus bases los datos
                  personales y tener acceso a los mismos en cualquier momento, tanto durante la vigencia de la relación laboral como con
                  posterioridad a la misma; esta autorización abarca la posibilidad de recolectar y almacenar dichos datos en las bases de
                  datos y sistemas o software de la institución. LA TRABAJADORA entiende que el tratamiento de sus datos personales por parte
                  de la empleadora tiene una finalidad legítima de acuerdo con la ley y la Constitución y obedece al manejo interno de los
                  datos en desarrollo de la relación laboral existente entre las partes y que la información personal será manejada con las
                  medidas técnicas, humanas y administrativas necesarias para garantizar la seguridad y reserva de la información.
                </Clausula>
                <P><b>Parágrafo 1:</b> LA EMPLEADORA ha enterado a LA TRABAJADORA de su derecho a conocer el uso dado a sus datos personales, acceder a ellos, actualizarlos y rectificarlos en cualquier momento. Igualmente, LA EMPLEADORA ha informado sobre el carácter facultativo de la respuesta a las preguntas que versen sobre datos sensibles.</P>
                <P><b>Parágrafo 2:</b> LA TRABAJADORA se compromete a respetar la legislación en materia de protección de datos, las políticas de privacidad y de seguridad de la información que LA EMPLEADORA ha implementado, como también a: (i) Utilizar los datos de carácter personal a los que tenga acceso única y exclusivamente para cumplir con sus obligaciones para con LA EMPLEADORA; (ii) Cumplir con las medidas de seguridad que LA EMPLEADORA haya implementado para asegurar la confidencialidad, secreto e integridad de los datos de carácter personal a los que tenga acceso, así como no ceder en ningún caso a terceras personas los datos de carácter personal a los que tenga acceso, ni tan siquiera a efectos de su conservación.</P>

                <p className="pt-4">
                  Para constancia de todo lo anterior, se firma el presente contrato de trabajo en la ciudad de{' '}
                  <Inline value={f.ciudadFirma} onChange={(v) => set('ciudadFirma', v)} placeholder="ciudad" /> a los{' '}
                  <Inline value={f.fechaFirma} onChange={(v) => set('fechaFirma', v)} placeholder="00 de mes de 0000" />.
                </p>

                {/* Firmas */}
                <div className="grid grid-cols-2 gap-8 pt-12">
                  <div>
                    <p className="font-bold mb-8">LA EMPLEADORA</p>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.empleadoraFirmante} onChange={(v) => set('empleadoraFirmante', v)} placeholder="Nombre" bold />
                      <div className="flex gap-1"><span>C.C.</span><FLine value={f.empleadoraFirmanteCc} onChange={(v) => set('empleadoraFirmanteCc', v)} placeholder="..." /></div>
                    </div>
                  </div>
                  <div>
                    <p className="font-bold mb-8">LA TRABAJADORA</p>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.trabajadora} onChange={(v) => set('trabajadora', v)} placeholder="Nombre" bold />
                      <div className="flex gap-1"><span>C.C.</span><FLine value={f.trabajadoraCc} onChange={(v) => set('trabajadoraCc', v)} placeholder="..." /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <PieElaboracion />
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar el contrato. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

const tx = (v: string) => (v?.trim() ? v : '…');

function Row({ label, value, onChange, area, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[42%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
            className="w-full bg-transparent outline-none resize-y text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        )}
      </td>
    </tr>
  );
}

function Clausula({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <p className="text-justify"><b>{titulo}</b> {children}</p>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-justify">{children}</p>;
}

function Inline({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size={Math.max((value || placeholder || '').length, 5)}
      className="bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
    />
  );
}

function FLine({ value, onChange, placeholder, bold }: { value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')} />
  );
}
