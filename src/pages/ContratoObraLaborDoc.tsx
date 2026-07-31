import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';

/**
 * Plantilla de contrato para el tipo "Obra o Labor" (contrato laboral, GJ-004-F).
 * Duración por la obra o labor contratada. Recibe la solicitud ya cargada.
 * Se guarda en data.contrato.
 */

interface OLState {
  empleadora: string; empleadoraNit: string; representanteLegal: string; representanteCc: string;
  empleadoraDireccion: string; empleadoraTelefono: string;
  empleado: string; empleadoCc: string; empleadoFechaNacimiento: string;
  empleadoDireccion: string; empleadoCelular: string;
  tipoContratoTexto: string; objeto: string; cargo: string;
  salario: string; lugarEjecucion: string; fechaInicio: string; fechaTerminacion: string;
  ciudadFirma: string; fechaFirma: string;
}

const EMPTY: OLState = {
  empleadora: '', empleadoraNit: '', representanteLegal: '', representanteCc: '',
  empleadoraDireccion: '', empleadoraTelefono: '',
  empleado: '', empleadoCc: '', empleadoFechaNacimiento: '',
  empleadoDireccion: '', empleadoCelular: '',
  tipoContratoTexto: 'CONTRATO DE TRABAJO DE DURACIÓN POR LA OBRA O LABOR CONTRATADA',
  objeto: '', cargo: '',
  salario: '', lugarEjecucion: 'Cali Valle', fechaInicio: '', fechaTerminacion: '',
  ciudadFirma: '', fechaFirma: '',
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function ContratoObraLaborDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(solicitud.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<OLState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Partial<OLState>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    return {
      ...EMPTY,
      ...saved,
      empleadora: saved.empleadora || d.empresa || '',
      representanteLegal: saved.representanteLegal || des.funcionarioNombre || '',
      empleado: saved.empleado || d.contratista || '',
      empleadoCc: saved.empleadoCc || des.contratistaCc || acta.contratistaCc || '',
      empleadoDireccion: saved.empleadoDireccion || acta.direccion || '',
      empleadoCelular: saved.empleadoCelular || acta.celular || '',
      objeto: saved.objeto || d.alcanceServicio || d.objetoProyecto || '',
      salario: saved.salario || d.honorarios || '',
      fechaInicio: saved.fechaInicio || acta.fechaInicio || '',
      fechaTerminacion: saved.fechaTerminacion || acta.fechaFinal || '',
    };
  });

  const set = <K extends keyof OLState>(k: K, v: OLState[K]) => setF((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId, 'contrato', f);
      toast.success('Contrato guardado');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Obra o Labor</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Formato GJ-004-F · Solicitud N.º {solicitudId}</p>
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se genera en la etapa «Contrato en revisión (Jurídica)».</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={irSolicitud}>Ir a la solicitud</Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-[#0a2a52] shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_170px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] border-r border-[#0a2a52]">
                CONTRATO OBRA LABOR
              </div>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-9 object-contain" />
                </div>
                <div className="grid grid-cols-[auto_1fr] text-[10px]">
                  <CodeCell label="CÓDIGO:" value="GJ-004-F" />
                  <CodeCell label="FECHA:" value="14/04/2026" />
                  <CodeCell label="VERSIÓN:" value="2" last />
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <p className="text-center font-bold mb-4 leading-snug">
                CONTRATO DE TRABAJO DE DURACIÓN POR LA OBRA O LABOR CONTRATADA SUSCRITO ENTRE {(f.empleadora || '…').toUpperCase()} Y {(f.empleado || '…').toUpperCase()}
              </p>

              {/* Tabla de datos */}
              <table className="w-full border-collapse text-[12px] mb-5">
                <tbody>
                  <Row label="Empleadora" value={f.empleadora} onChange={(v) => set('empleadora', v)} />
                  <Row label="Identificación Tributaria" value={f.empleadoraNit} onChange={(v) => set('empleadoraNit', v)} placeholder="Nit." />
                  <Row label="Representante Legal" value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} />
                  <Row label="Identificación" value={f.representanteCc} onChange={(v) => set('representanteCc', v)} placeholder="CC. ... de ..." />
                  <Row label="Dirección" value={f.empleadoraDireccion} onChange={(v) => set('empleadoraDireccion', v)} />
                  <Row label="Teléfono" value={f.empleadoraTelefono} onChange={(v) => set('empleadoraTelefono', v)} />
                  <Row label="Empleado" value={f.empleado} onChange={(v) => set('empleado', v)} />
                  <Row label="Identificación" value={f.empleadoCc} onChange={(v) => set('empleadoCc', v)} placeholder="CC. ..." />
                  <Row label="Fecha de nacimiento" value={f.empleadoFechaNacimiento} onChange={(v) => set('empleadoFechaNacimiento', v)} />
                  <Row label="Dirección del Domicilio" value={f.empleadoDireccion} onChange={(v) => set('empleadoDireccion', v)} />
                  <Row label="Celular" value={f.empleadoCelular} onChange={(v) => set('empleadoCelular', v)} />
                  <Row label="Tipo de contrato" value={f.tipoContratoTexto} onChange={(v) => set('tipoContratoTexto', v)} />
                  <Row label="Objeto Del Contrato" value={f.objeto} onChange={(v) => set('objeto', v)} placeholder="PRESTACIÓN DE SERVICIOS COMO ..." />
                  <Row label="Asignación salarial mensual" value={f.salario} onChange={(v) => set('salario', v)} placeholder="... pesos M/L, más prestaciones de Ley." />
                  <Row label="Lugar de ejecución del contrato" value={f.lugarEjecucion} onChange={(v) => set('lugarEjecucion', v)} />
                  <Row label="Fecha de inicio" value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
                  <Row label="Fecha de terminación" value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} />
                </tbody>
              </table>

              <div className="space-y-3 text-justify leading-relaxed text-[12px]">
                <p>
                  Entre la empleadora y el empleado, en las condiciones ya dichas identificados como aparece al pie de sus correspondientes
                  firmas, se ha celebrado el presente contrato individual de trabajo, regido además por las siguientes cláusulas:
                </p>

                <Clausula titulo="CLÁUSULA PRIMERA. OBJETO:">
                  “PRESTACIÓN DE SERVICIOS COMO <Inline value={f.cargo} onChange={(v) => set('cargo', v)} placeholder="cargo" />”, de conformidad
                  con las órdenes que imparta la empleadora o sus representantes, y a no prestar directa ni indirectamente servicios a otros
                  EMPLEADORES, ni a trabajar por cuenta propia en el mismo oficio, durante la vigencia de este contrato.
                </Clausula>
                <P><b>PARÁGRAFO:</b> Las partes desde ya acuerdan que serán calificadas como faltas graves además de las consignadas en la Codificación laboral: La realización de labores ajenas a la empresa y el incumplimiento de las funciones que interrumpan la operación de la empresa.</P>

                <Clausula titulo="CLÁUSULA SEGUNDA. LUGAR:">
                  La labor aquí contratada la prestará EL EMPLEADO vinculado a favor de LA EMPLEADORA con su capacidad normal de trabajo, la
                  cual se desarrollará en todos los lugares o sitios donde LA EMPLEADORA adelante su objeto o actividad, cualquiera sea el
                  mismo dentro del territorio nacional o fuera de él, situación que conoce EL EMPLEADO y desde luego acepta al celebrar este
                  contrato. Para tales fines bastará que LA EMPLEADORA le indique el lugar de trabajo. Igualmente, EL EMPLEADO acepta cualquier
                  orden de traslado o cambio que se le imparta para desempeñar su mismo cargo, otro cargo o funciones diferentes, en la misma
                  empresa, establecimiento o fuera de ellos, declarando que está en disponibilidad de hacerlo. Cualquier modificación del
                  lugar de trabajo, que signifique cambio de ciudad, se hará conforme al Código Sustantivo de Trabajo.
                </Clausula>
                <P><b>PARÁGRAFO PRIMERO:</b> La jornada laboral la determinará LA EMPLEADORA pudiendo hacer las modificaciones y ajustes de acuerdo con las necesidades de producción, servicios o cualquiera otra que tenga LA EMPLEADORA. Así como los descansos que la empleadora voluntariamente conceda.</P>
                <P><b>PARÁGRAFO SEGUNDO:</b> LA EMPLEADORA asumirá los costos de alojamiento, alimentación a que haya lugar, cuando se requiera labores fuera del Centro de Trabajo asignado.</P>

                <Clausula titulo="CLÁUSULA TERCERA. OBLIGACIONES DEL CONTRATADO:">
                  El empleado por su parte, prestará su fuerza laboral con fidelidad y entrega, cumpliendo debidamente el Reglamento Interno de
                  Trabajo, cumpliendo las órdenes e instrucciones que le imparta la empleadora o sus representantes, al igual que no laborar por
                  cuenta propia o a otro empleador en el mismo oficio, mientras esté vigente este contrato.
                </Clausula>

                <Clausula titulo="CLÁUSULA CUARTA. ELEMENTOS DE TRABAJO:">
                  Corresponde al empleador suministrar los elementos necesarios para el normal desempeño de las funciones del cargo contratado.
                </Clausula>

                <Clausula titulo="CLÁUSULA QUINTA. REMUNERACIÓN:">
                  LA EMPLEADORA pagará al empleado por la prestación de sus servicios el salario indicado, pagadero en las oportunidades también
                  señaladas arriba. EL EMPLEADO autoriza a LA EMPLEADORA para que su salario le sea consignado en una entidad del sistema
                  financiero, o pagado mediante cualquier otro sistema de pago que decida LA EMPLEADORA, aclarando que EL EMPLEADO pagará
                  directamente a la entidad financiera los gastos de operación de su cuenta personal. En este salario quedan incluidos los
                  descansos obligatorios de ley, así como los descansos que LA EMPLEADORA voluntariamente conceda.
                </Clausula>
                <P><b>PARÁGRAFO PRIMERO:</b> Dentro del salario ordinario se encuentra incluida la remuneración de los descansos en dominicales y festivos de que tratan los Capítulos I y II del Título VII del Código Sustantivo de Trabajo.</P>
                <P><b>PARÁGRAFO SEGUNDO:</b> Las partes expresamente acuerdan que en los casos en que se le reconozcan al empleado beneficios diferentes al salario ordinario, por concepto de alimentación, comunicación, habitación o vivienda, transporte o vestuario, bonificaciones ocasionales o cualquier otra que reciba durante la vigencia del contrato de trabajo en dinero o en especie, se considerarán tales beneficios o reconocimientos como no salariales y por lo tanto no se tendrán en cuenta como factor salarial para la liquidación de acreencias laborales, ni para el pago de aportes parafiscales, y cotizaciones a la seguridad social, de conformidad con los Arts. 15 y 16 de la ley 50/90 en concordancia con el artículo 17 de la ley 344/96.</P>

                <Clausula titulo="CLÁUSULA SEXTA:">
                  Todo trabajo suplementario o en horas extras y todo trabajo en domingo o festivo en los que legalmente deba concederse
                  descanso, se remunerará conforme a la ley, así como los correspondientes recargos nocturnos. Para el reconocimiento y el pago
                  del trabajo suplementario, dominical o festivo LA EMPLEADORA o su representante deben autorizarlo previamente por escrito.
                  Cuando la necesidad de este trabajo se presente de manera imprevista o inaplazable, deberá ejecutarse y darse cuenta de él por
                  escrito, a la mayor brevedad, al empleador o sus representantes. La empleadora, en consecuencia, no reconocerá ningún trabajo
                  suplementario o en días de descanso legalmente obligatorio que no haya sido autorizado previamente o avisado inmediatamente,
                  como queda dicho.
                </Clausula>

                <Clausula titulo="CLÁUSULA SÉPTIMA. JORNADA DE TRABAJO:">
                  EL EMPLEADO se compromete a cumplir una jornada de Cuarenta y Cuatro (44) horas semanales, en los turnos y dentro de los
                  horarios que determine LA EMPLEADORA.
                </Clausula>

                <Clausula titulo="CLÁUSULA OCTAVA. DURACIÓN DEL CONTRATO:">
                  La duración del presente contrato que se celebra inicia el{' '}
                  <Inline value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} placeholder="fecha de inicio" /> y tendrá vigencia hasta
                  cuando termine de realizar la obra o labor contratada, es decir el{' '}
                  <Inline value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} placeholder="fecha de terminación" />.
                </Clausula>
                <P><b>PARÁGRAFO PRIMERO:</b> Teniendo en cuenta que el presente contrato se suscribe por duración de la obra o labor determinada, al finalizar el tiempo que dure la novedad por la cual fue contratado y para el cual fue vinculado EL EMPLEADO, dará lugar a la terminación automática del presente contrato de trabajo por justa causa por la finalización del objeto contratado, sin que haya lugar a pago de indemnización alguna a favor del EMPLEADO.</P>
                <P><b>PARÁGRAFO SEGUNDO – NUEVA OBRA O CAMBIO DEL TÉRMINO DEL CONTRATO:</b> Si al finalizar la obra contratada, la empleadora desea continuar con el empleado en otra obra distinta a la contratada o vinculándolo mediante un período fijo o término indefinido, se deberá hacer un nuevo contrato de trabajo y no se entenderá como prórroga por desaparecer las causas contractuales que dieron origen a este contrato.</P>

                <Clausula titulo="CLÁUSULA NOVENA. AFILIACIÓN Y PAGO A SEGURIDAD SOCIAL:">
                  Es obligación de la empleadora afiliar al empleado a la seguridad social como es salud, pensión y riesgos profesionales,
                  autorizando el empleado el descuento en su salario de los valores que le corresponda aportar, en la proporción establecida por
                  la ley.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA. TERMINACIÓN UNILATERAL:">
                  El presente contrato queda sujeto a las disposiciones legales que regulan las relaciones entre Empleadores y Empleados y al
                  reglamento interno de trabajo de CANALES Y CONTACTOS S.A.S., el cual se dará a conocer al empleado y se dejará constancia de su
                  conocimiento. De manera específica, las partes acuerdan que la empleadora podrá terminar unilateralmente el presente contrato
                  con justa causa y sin indemnización de perjuicios, cuando el Empleado incurra en alguna de las conductas previstas en la Ley
                  como justa causa y cuando el empleado viole los acuerdos aquí establecidos. Son justas causas para dar por terminado
                  unilateralmente este contrato, por cualquiera de las partes, las enumeradas en los Arts. 62 y 63 del C.S.T. modificados por el
                  Art. 7 del Decreto 2351 de 1965 y, además, por parte de la empleadora, las faltas que para el efecto se califican como graves en
                  reglamentos y demás documentos que contengan reglamentaciones, órdenes, instrucciones o prohibiciones de carácter general o
                  particular, pactos, convenciones colectivas, laudos arbitrales y las que expresamente convengan calificar así en escritos que
                  formarán parte integrante del presente contrato. Expresamente se califican en este acto como faltas graves la violación a las
                  obligaciones y prohibiciones contenidas en la cláusula primera del presente contrato.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA PRIMERA.">
                  El Empleado responde por las herramientas, elementos de trabajo, de propiedad de LA EMPLEADORA, las cuales le son entregados en
                  perfecto estado y en tal virtud, deberá responder por ellos, en caso de hurto o daños sin causa justificada.
                </Clausula>
                <P><b>PARÁGRAFO:</b> Cuando por causa emanada directa o indirectamente de la relación contractual, existan relaciones económicas a cargo del Empleado y a favor de la empleadora, como, por ejemplo: préstamos económicos, anticipos para gastos y que estos se encuentren sin justificar por parte del Empleado, conforme a las políticas de la empleadora, el Empleado autoriza desde ya el descuento de dichos valores.</P>

                <Clausula titulo="CLÁUSULA DÉCIMA SEGUNDA. CONFIDENCIALIDAD:">
                  EL EMPLEADO, guardará absoluta confidencialidad sobre toda la información reservada que maneje y a la que pudiere tener acceso.
                  EL EMPLEADO se obliga a conservar, mantener y manejar la reserva y confidencialidad de toda la información que reciba de los
                  funcionarios, empleados o asesores de la empresa, de manera directa o indirecta, en forma verbal, escrita, gráfica, en medio
                  magnético, electrónico, o bajo cualquier otra forma, que sea entregada con el ánimo de realizar operaciones propias de su
                  objeto social y/o relativas al objeto del presente Acuerdo, sin que para el efecto sea necesario que la parte reveladora la
                  califique como confidencial o reservada, en adelante denominada la "Información Confidencial" o la "información"
                  indistintamente. En dicho sentido, se obliga EL EMPLEADO a tomar todas las medidas necesarias para que la información no llegue
                  a manos de terceros ni de la competencia en ninguna circunstancia y se obliga a utilizarla únicamente para adelantar las tareas
                  que se requieran para llevar a cabo el desarrollo, estructuración y puesta en marcha de negocios conjuntos, que redunden en
                  beneficios económicos para LA EMPLEADORA. Al suscribir el presente, EL EMPLEADO está obligado a responder legalmente por
                  cualquier perjuicio que pueda surgir como resultado del incumplimiento de cualquiera de los compromisos contenidos en la
                  presente cláusula. Las obligaciones señaladas continuarán vigentes aún después del vencimiento o terminación del ACUERDO.
                  Asimismo, se obliga EL EMPLEADO a: 1) No utilizar para su propio beneficio la Información Confidencial en caso de no concretarse
                  ninguna operación por escrito entre las partes; 2) No divulgar a terceros la Información Confidencial; 3) No realizar, o
                  requerir que terceros realicen desarrollos o negocios a partir de la Información Confidencial, que resulten real o
                  potencialmente en competencia con los productos y/o bienes y/o servicios comercializados o desarrollados por LA EMPLEADORA.
                </Clausula>
                <P><b>PARÁGRAFO PRIMERO:</b> EL EMPLEADO se compromete a guardar confidencialidad absoluta, respecto del conocimiento directo o indirecto que, por ocasión de su labor, llegase a tener de la empleadora, filiales, controladas o subordinadas, que guardan estrecha relación comercial, financiera, contable y laboral de la EMPLEADORA.</P>
                <P><b>PARÁGRAFO SEGUNDO:</b> EL EMPLEADO se abstendrá, por sí, por su personal o por terceros, directa o indirectamente, de comportamientos que puedan constituir competencia desleal o actos de esta naturaleza, para con LA EMPLEADORA, sus usuarios o terceros, o conductas contrarias a la confidencialidad exigida por la ley y el Contrato.</P>
                <P><b>PARÁGRAFO TERCERO:</b> EL EMPLEADO conoce y acepta desde ya que la divulgación o el uso indebido o no autorizado de la información que conozca o maneje puede causar un perjuicio irreparable a LA EMPLEADORA. Por lo mismo, se compromete a no hacer ningún tipo de uso indebido o no autorizado de la información. Asimismo, se compromete a manejar la información que conozca o maneje con un mayor grado de cuidado de aquel con el cual maneja su propia información confidencial y sus propios secretos industriales. EL EMPLEADO es consciente de que deberá resarcir a LA EMPLEADORA, por cualquier uso indebido o no autorizado, culpable o no, que él, sus empleados, socios, subcontratistas, asesores y demás personas puedan llegar a dar a la información que conozca o maneje. Los términos y condiciones aquí contenidos son de obligatorio cumplimiento y aceptación, por parte de quienes sean autorizados para tener acceso a la información o realizar las operaciones que tiene disponibles para ello.</P>
                <P><b>PARÁGRAFO CUARTO – EXIGENCIA DE INDEMNIZACIÓN:</b> En el evento de violación del presente Acuerdo por parte EL EMPLEADO, dicho evento dará derecho a LA EMPLEADORA, a exigir por los medios judiciales pertinentes, la indemnización de perjuicios, incluyendo dentro de dicha indemnización las costas judiciales y agencias en derecho a que hubiere lugar. En ese caso, LA EMPLEADORA tendrá toda la facultad de demandar y exigir judicialmente la reparación de perjuicios a la parte cumplida. En virtud de lo pactado en esta cláusula y, sin perjuicio del derecho de LA EMPLEADORA a la indemnización de todos los daños, EL EMPLEADO reconocerá y pagará incondicional e irrevocablemente a LA EMPLEADORA el valor que se estime por la ley para reconocer el perjuicio creado. Así las cosas, EL EMPLEADO reconoce y acepta expresamente que la presente obligación presta mérito ejecutivo y que, por lo tanto, puede ser ejecutada mediante proceso ejecutivo sin requerimiento o reconvención alguna al que se renuncia expresamente.</P>

                <Clausula titulo="CLÁUSULA DÉCIMA TERCERA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS:">
                  EL EMPLEADO se obliga a desempeñar sus funciones con integridad, ética y lealtad hacia LA EMPLEADORA. En este sentido, queda
                  estrictamente prohibido solicitar, recibir, aceptar directa o indirectamente cualquier pago, comisión, gratificación,
                  beneficio, dádiva o cualquier otra retribución de proveedores, contratistas, clientes o cualquier tercero con quien la
                  empleadora mantenga o pueda mantener relaciones comerciales o contractuales. El incumplimiento de esta disposición constituirá
                  una falta grave y será causal de terminación inmediata del contrato de trabajo con justa causa, sin perjuicio de las acciones
                  legales que LA EMPLEADORA pueda ejercer en contra de EL EMPLEADO por los daños y perjuicios ocasionados.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA CUARTA. PROTECCIÓN DE DATOS PERSONALES:">
                  EL EMPLEADO en su condición de titular de la información, autoriza a la empleadora para almacenar en sus bases los datos
                  personales y tener acceso a los mismos en cualquier momento, tanto durante la vigencia de la relación laboral como con
                  posterioridad a la misma; esta autorización abarca la posibilidad de recolectar y almacenar dichos datos en las bases de datos
                  y sistemas o software de la institución. EL EMPLEADO entiende que el tratamiento de los datos personales por parte de la
                  empleadora tiene una finalidad legítima de acuerdo con la ley y la Constitución y obedece al manejo interno de los datos en
                  desarrollo de la relación laboral existente entre las partes y que la información personal será manejada con las medidas
                  técnicas, humanas y administrativas necesarias para garantizar la seguridad y reserva de la información.
                </Clausula>
                <P><b>PARÁGRAFO 1:</b> LA EMPLEADORA ha enterado al empleado de su derecho a conocer el uso dado a sus datos personales, acceder a ellos, actualizarlos y rectificarlos en cualquier momento. Igualmente, LA EMPLEADORA ha informado sobre el carácter facultativo de la respuesta a las preguntas que versen sobre datos sensibles.</P>
                <P><b>PARÁGRAFO 2:</b> EL EMPLEADO se compromete a respetar la legislación en materia de protección de datos, las políticas de privacidad y de seguridad de la información que LA EMPLEADORA ha implementado, como también a: (i) Utilizar los datos de carácter personal a los que tenga acceso única y exclusivamente para cumplir con sus obligaciones para con LA EMPLEADORA; (ii) Cumplir con las medidas de seguridad que LA EMPLEADORA haya implementado para asegurar la confidencialidad, secreto e integridad de los datos de carácter personal a los que tenga acceso, así como no ceder en ningún caso a terceras personas los datos de carácter personal a los que tenga acceso, ni tan siquiera a efectos de su conservación.</P>

                <Clausula titulo="CLÁUSULA DÉCIMA QUINTA. MODIFICACIÓN DE LAS CONDICIONES LABORALES:">
                  EL EMPLEADO acepta desde ahora expresamente todas las modificaciones de las condiciones laborales determinadas por la
                  empleadora en ejercicio de su poder subordinante, tales como los turnos y jornadas de trabajo, el lugar de prestación de
                  servicio, el cargo y oficio y/o funciones y la forma de remuneración, siempre que tales modificaciones no afecten su honor,
                  dignidad o sus derechos mínimos, de conformidad con lo dispuesto por el Art. 23 del C.S.T. modificado por el Art. 1° de la Ley
                  50/90. Los gastos que se originen con el traslado de lugar de prestación del servicio serán cubiertos por LA EMPLEADORA, de
                  conformidad con el numeral 8° del Art. 57 del C.S.T.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA SEXTA. DIRECCIÓN DEL EMPLEADO:">
                  EL EMPLEADO para todos los efectos legales y en especial para la aplicación del parágrafo 1 del Artículo 29 de la Ley 789/02,
                  norma que modificó el 65 del C.S.T., se compromete a informar por escrito y de manera inmediata a LA EMPLEADORA cualquier
                  cambio en su dirección de residencia, teniéndose en todo caso como suya, la última dirección registrada en su hoja de vida.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA SÉPTIMA. EFECTOS:">
                  El presente contrato reemplaza en su integridad y deja sin efecto cualquier otro contrato, verbal o escrito, celebrado entre las
                  partes con anterioridad, pudiendo las partes convenir por escrito modificaciones al mismo, las que formarán parte integrante de
                  este contrato.
                </Clausula>

                <Clausula titulo="CLÁUSULA DÉCIMA OCTAVA.">
                  EL EMPLEADO declara que ha leído el presente Contrato de Trabajo y manifiesta que está de acuerdo con él en su integridad. Así
                  mismo EL EMPLEADO declara conocer el Reglamento de Trabajo y el Manual de Funciones, los cuales hacen parte integrante del
                  Contrato de Trabajo.
                </Clausula>
                <P><b>PARÁGRAFO:</b> El presente Contrato de Trabajo se rige íntegramente por las disposiciones contenidas en el Código Sustantivo del Trabajo, la Ley 50 de 1990, la Ley 789 de 2002, Ley 2466 de 2025 “Por medio de la cual se modifica parcialmente normas laborales y se adopta una Reforma Laboral para el trabajo decente y digno en Colombia” y demás disposiciones concordantes.</P>

                <p className="pt-4">
                  Para constancia se firma en la ciudad de <Inline value={f.ciudadFirma} onChange={(v) => set('ciudadFirma', v)} placeholder="ciudad" />,
                  a los <Inline value={f.fechaFirma} onChange={(v) => set('fechaFirma', v)} placeholder="00 días del mes de ... de 0000" />.
                </p>

                {/* Firmas */}
                <div className="grid grid-cols-2 gap-8 pt-12">
                  <div>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} placeholder="Representante legal" bold />
                      <div>Representante Legal</div>
                      <div className="font-bold">LA EMPLEADORA</div>
                    </div>
                  </div>
                  <div>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.empleado} onChange={(v) => set('empleado', v)} placeholder="Nombre del empleado" bold />
                      <div className="flex gap-1"><span>C.C.</span><FLine value={f.empleadoCc} onChange={(v) => set('empleadoCc', v)} placeholder="..." /></div>
                      <div className="font-bold">EL EMPLEADO</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function Row({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
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
