import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { TextosDocumento, useTextosDocumento, ClausulaEd } from '@/components/juridica/textoEditable';

/**
 * Plantilla de contrato para el tipo "Término Indefinido" (contrato laboral, GJ-002-F).
 * Empleador/empleado, salario, jornada de 44h, período de prueba y prestaciones de ley.
 * Recibe la solicitud ya cargada. Se guarda en data.contrato.
 *
 * **Las cláusulas se pueden reescribir**, igual que en el contrato de prestación de
 * servicios: la plantilla vive en el código y en la base solo se guarda lo que alguien
 * haya cambiado (ver `textoEditable`). Un contrato laboral se negocia —el período de
 * prueba, el horario, la exclusividad— y hasta ahora la única salida era imprimir y
 * corregir a mano, con lo que el sistema dejaba de tener el texto que de verdad se firmó.
 */

interface TIState {
  empleador: string; empleadorNit: string; domicilioEmpleador: string;
  representanteLegal: string; representanteCc: string;
  empleado: string; empleadoCc: string; ciudadExpedicion: string;
  empleadoDireccion: string; empleadoCorreo: string; empleadoCelular: string;
  lugarFechaNacimiento: string;
  cargo: string; salario: string; periodosPago: string; fechaIniciacion: string;
  ciudadFirma: string; fechaFirma: string;
  /** Solo los bloques reescritos, por clave. Lo no tocado sigue saliendo de la plantilla. */
  textos: Record<string, string>;
}

const EMPTY: TIState = {
  empleador: '', empleadorNit: '', domicilioEmpleador: '',
  representanteLegal: '', representanteCc: '',
  empleado: '', empleadoCc: '', ciudadExpedicion: '',
  empleadoDireccion: '', empleadoCorreo: '', empleadoCelular: '',
  lugarFechaNacimiento: '',
  cargo: '', salario: '', periodosPago: 'Mensuales', fechaIniciacion: '',
  ciudadFirma: '', fechaFirma: '',
  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

/**
 * El articulado, como datos.
 *
 * Va en una lista y no suelto en el JSX para que se vea de un golpe el orden de las
 * cláusulas y sus parágrafos, que es lo que hay que cotejar contra el formato impreso.
 * Los parágrafos son bloques del mismo tipo: en el papel se ven igual y se reescriben
 * igual, y separarlos en dos componentes solo obligaba a mantener dos.
 *
 * Recibe el formulario porque tres bloques nombran el cargo o al empleado. Esos llegan
 * con el dato **ya interpolado**: se rearman solos mientras nadie los toque y se congelan
 * en cuanto alguien reescribe el bloque.
 */
const articulado = (f: TIState): { k: string; titulo: string; texto: string }[] => {
  const cargo = f.cargo.trim() || 'el cargo indicado';
  const empleado = f.empleado.trim() || '…';

  return [
    {
      k: 'c1',
      titulo: 'PRIMERA. OBJETO.',
      texto: `LA EMPLEADORA contrata los servicios personales de EL EMPLEADO y éste se obliga a: a) A poner al servicio de LA EMPLEADORA toda su capacidad normal de trabajo, en el desempeño como ${cargo} y de las funciones propias del oficio mencionado, descritas en su manual de funciones, en el perfil de cargo, y en labores anexas y complementarias del mismo, de conformidad con las órdenes e instrucciones que le imparta LA EMPLEADORA directamente o a través de sus representantes; b) A prestar sus servicios en forma exclusiva a LA EMPLEADORA; es decir, a no prestar directa o indirectamente servicios laborales a otros EMPLEADORES, ni a trabajar por cuenta propia en el mismo oficio, durante la vigencia del contrato; c) Guardar absoluta reserva sobre los hechos, documentos físicos y/o electrónicos, informaciones y en general, sobre todos los asuntos y materias que llegue a su conocimiento por causa o con ocasión de este contrato de trabajo.`,
    },
    {
      k: 'c1.p1',
      titulo: 'PARÁGRAFO PRIMERO:',
      texto: 'Las partes desde ya acuerdan que serán calificadas como faltas graves, además de las consignadas en la Codificación laboral: La realización de labores ajenas a la empresa y el incumplimiento de las funciones que interrumpan la operación de la empresa.',
    },
    {
      k: 'c2',
      titulo: 'SEGUNDA. LUGAR.',
      texto: 'La labor aquí contratada la prestará EL EMPLEADO vinculado a favor de LA EMPLEADORA con su capacidad normal de trabajo, la cual se desarrollará en todos los lugares o sitios donde LA EMPLEADORA adelante su objeto o actividad, cualquiera sea el mismo dentro del territorio nacional o fuera de él, situación que conoce EL EMPLEADO y desde luego acepta al celebrar este contrato. Para tales fines bastará que LA EMPLEADORA le indique el lugar de trabajo. Igualmente, EL EMPLEADO acepta cualquier orden de traslado o cambio que se le imparta para desempeñar su mismo cargo, otro cargo o funciones, en la misma empresa, establecimiento o fuera de ellos, declarando que está en disponibilidad de hacerlo.',
    },
    {
      k: 'c2.p1',
      titulo: 'PARÁGRAFO:',
      texto: 'La jornada laboral la determinará LA EMPLEADORA pudiendo hacer las modificaciones y ajustes de acuerdo con las necesidades de producción, servicios o cualquiera otra que tenga LA EMPLEADORA. Así como los descansos que LA EMPLEADORA voluntariamente conceda.',
    },
    {
      k: 'c3',
      titulo: 'TERCERA. FUNCIONES.',
      texto: `LA EMPLEADORA contrata a EL EMPLEADO para desempeñarse como ${cargo}, desempeñando las funciones que se encuentran descritas en su manual de funciones o perfil de cargo.`,
    },
    {
      k: 'c4',
      titulo: 'CUARTA. OBLIGACIONES DEL CONTRATADO.',
      texto: 'EL EMPLEADO por su parte, prestará su fuerza laboral con fidelidad y entrega, cumpliendo con las funciones propias de su cargo, las órdenes e instrucciones que le imparta LA EMPLEADORA o sus representantes, al igual que no laborar por cuenta propia o a otro EMPLEADOR en el mismo oficio, mientras esté vigente este contrato. Asimismo, dará cumplimiento a todos los reglamentos y políticas internas de la empresa.',
    },
    {
      k: 'c5',
      titulo: 'QUINTA. ELEMENTOS DE TRABAJO.',
      texto: 'Corresponde a LA EMPLEADORA suministrar los elementos necesarios para el normal desempeño de las funciones del cargo contratado.',
    },
    {
      k: 'c6',
      titulo: 'SEXTA. REMUNERACIÓN.',
      texto: 'LA EMPLEADORA pagará a EL EMPLEADO por la prestación de sus servicios el salario indicado, pagadero en las oportunidades señaladas arriba. EL EMPLEADO autoriza a LA EMPLEADORA para que su salario le sea consignado en una entidad del sistema financiero o pago mediante cualquier otro sistema de pago que decida LA EMPLEADORA, aclarando que EL EMPLEADO pagará directamente a la entidad financiera los gastos de operación de su cuenta personal. En ese salario quedan incluidos los descansos obligatorios de ley, así como los descansos que LA EMPLEADORA voluntariamente conceda.',
    },
    {
      k: 'c6.p1',
      titulo: 'PARÁGRAFO PRIMERO:',
      texto: 'Dentro del salario ordinario se encuentra incluida la remuneración de los descansos en dominicales y festivos de que tratan los Capítulos I y II del Título VII del Código Sustantivo del Trabajo.',
    },
    {
      k: 'c6.p2',
      titulo: 'PARÁGRAFO SEGUNDO:',
      texto: 'Las partes expresamente acuerdan que en los casos en que se le reconozcan a EL EMPLEADO beneficios diferentes al salario ordinario, por concepto de alimentación, comunicación, habitación o vivienda, transporte o vestuario, bonificaciones ocasionales o cualquier otra que medie durante la vigencia del contrato de trabajo en dinero o en especie, se considerarán tales beneficios o reconocimientos como no salariales y por lo tanto no se tendrán en cuenta como factor salarial para la liquidación de acreencias laborales, ni para el pago de aportes parafiscales, y cotizaciones a la seguridad social, de conformidad con los Arts. 15 y 16 de la ley 50/90 en concordancia con el artículo 17 de la ley 344/96.',
    },
    {
      k: 'c7',
      titulo: 'SÉPTIMA.',
      texto: 'Todo trabajo suplementario o en horas extras y todo trabajo en domingo o festivo en los que legalmente deba concederse descanso, se remunerará conforme a la ley, así como los correspondientes recargos nocturnos. Para el reconocimiento y el pago del trabajo suplementario, dominical o festivo LA EMPLEADORA o su representante deben autorizarlo previamente por escrito. Cuando la necesidad de este trabajo se presente de manera imprevista o inaplazable, deberá ejecutarse y darse cuenta de él, por escrito, a la mayor brevedad, a LA EMPLEADORA o sus representantes. EL EMPLEADO, en consecuencia, no reconocerá ningún trabajo suplementario o en días de descanso legalmente obligatorio que no haya sido autorizado previamente o avisado inmediatamente, como queda dicho.',
    },
    {
      k: 'c8',
      titulo: 'OCTAVA. JORNADA DE TRABAJO.',
      texto: 'EL EMPLEADO se obliga para con LA EMPLEADORA a prestar sus servicios dentro de los horarios y turnos establecidos por ella. La jornada de trabajo que rige el presente contrato es jornada máxima legal establecida en la normatividad laboral vigente de 44 horas semanales.',
    },
    {
      k: 'c8.p1',
      titulo: 'PARÁGRAFO PRIMERO:',
      texto: 'El horario de trabajo será de lunes a viernes 7:00 a.m. a 12:00 p.m. y de 1:00 p.m. a 4:30 p.m., sábados de 7:00 a.m. a 12:00 p.m.',
    },
    {
      k: 'c9',
      titulo: 'NOVENA. PERIODO DE PRUEBA.',
      texto: 'Las partes acuerdan un período de prueba de dos (2) meses, contados a partir de la fecha de inicio y, por consiguiente, cualquiera de las partes podrá terminar el contrato unilateralmente, en cualquier momento durante dicho período, de conformidad con el artículo 80 del Código Sustantivo del Trabajo, modificado por el art. 3° del decreto 617 de 1954.',
    },
    {
      k: 'c10',
      titulo: 'DÉCIMA. DURACIÓN DEL CONTRATO.',
      texto: 'Expresamente las partes convienen que la duración del presente contrato es a TÉRMINO INDEFINIDO. Se podrá dar por terminado según lo estipulado en la cláusula primera - parágrafo primero, cláusula novena y cláusula décima segunda del presente contrato de trabajo.',
    },
    {
      k: 'c11',
      titulo: 'DÉCIMA PRIMERA. AFILIACIÓN Y PAGO A SEGURIDAD SOCIAL.',
      texto: 'Es obligación de LA EMPLEADORA afiliar a EL EMPLEADO a la seguridad social como es salud, pensión y riesgos profesionales, autorizando EL EMPLEADO el descuento en su salario de los valores que le corresponda aportar en la proporción establecida por la ley.',
    },
    {
      k: 'c12',
      titulo: 'DÉCIMA SEGUNDA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS.',
      texto: 'EL EMPLEADO se obliga a desempeñar sus funciones con integridad, ética y lealtad hacia CANALES Y CONTACTOS S.A.S. En este sentido, queda estrictamente prohibido solicitar, recibir, aceptar directa o indirectamente cualquier pago, comisión, gratificación, beneficio, dádiva o cualquier otra retribución de proveedores, contratistas, clientes o cualquier tercero con quien la empresa mantenga o pueda mantener relaciones comerciales o contractuales. El incumplimiento de esta disposición constituirá una falta grave y será causal de terminación inmediata del contrato de trabajo con justa causa, sin perjuicio de las acciones legales que CANALES Y CONTACTOS S.A.S pueda ejercer en contra de EL EMPLEADO por los daños o perjuicios ocasionados.',
    },
    {
      k: 'c13',
      titulo: 'DÉCIMA TERCERA. TERMINACIÓN UNILATERAL.',
      texto: 'El presente contrato queda sujeto a las disposiciones legales que regulan las relaciones entre EMPLEADORES y EMPLEADOS y al reglamento interno de trabajo de CANALES Y CONTACTOS S.A.S., el cual se dará a conocer al empleado y se dejará constancia de su conocimiento. De manera específica, las partes acuerdan que LA EMPLEADORA podrá terminar unilateralmente el presente contrato con justa causa y sin indemnización de perjuicios, cuando el Empleado incurra en alguna de las conductas previstas en la Ley como justa causa y cuando EL EMPLEADO transgreda los acuerdos aquí establecidos. Son justas causas para dar por terminado unilateralmente este contrato, por cualquiera de las partes, las enumeradas en los Arts. 62 y 63 del C.S.T. modificados por el Art. 7 del Decreto 2351 de 1965 y, además, por parte de LA EMPLEADORA, las faltas que para el efecto se califican como graves en reglamentos y demás documentos que contengan reglamentaciones, órdenes, instrucciones o prohibiciones de carácter general o particular, pactos, convenciones colectivas, laudos arbitrales y las que expresamente convengan calificar así en escritos que formarán parte integrante del presente contrato. Expresamente se califican en este acto como faltas graves la violación a las obligaciones y prohibiciones contenidas en la cláusula primera del presente contrato.',
    },
    {
      k: 'c14',
      titulo: 'DÉCIMA CUARTA.',
      texto: 'EL EMPLEADO responde por las herramientas, elementos de trabajo, de propiedad de LA EMPLEADORA, las cuales le son entregados en perfecto estado y en tal virtud, deberá responder por ellos, en caso de hurto o daños sin causa justificada.',
    },
    {
      k: 'c14.p1',
      titulo: 'PARÁGRAFO:',
      texto: 'Cuando por causa emanada directa o indirectamente de la relación contractual, existan relaciones económicas a cargo de EL EMPLEADO y a favor de LA EMPLEADORA como, por ejemplo: préstamos económicos, anticipos para gastos y que estos se encuentren sin justificar por parte del Empleado, conforme a las políticas de LA EMPLEADORA, El Empleado autoriza desde ya el descuento de dichos valores.',
    },
    {
      k: 'c15',
      titulo: 'DÉCIMA QUINTA. PROPIEDAD INTELECTUAL.',
      texto: 'El empleado reconoce y acepta que todas las invenciones, desarrollos, mejoras, diseños, metodologías, procedimientos, software, documentación, obras, descubrimientos o cualquier otro resultado derivado de su trabajo dentro de la empresa, ya sea de forma individual o en colaboración con otros, y que se realicen durante la vigencia de su relación laboral con CANALES Y CONTACTOS S.A.S, serán de exclusiva propiedad de la empresa. Asimismo, EL EMPLEADO reconoce de manera irrevocable y sin necesidad de compensación adicional todos los derechos de propiedad intelectual, incluyendo, pero sin limitarse a, derechos de autor, patentes, marcas, diseños industriales y secretos comerciales, que puedan derivarse de dichas invenciones o desarrollos. EL EMPLEADO se compromete a cooperar con la empresa para formalizar cualquier documento necesario para la protección de estos derechos, incluyendo registros de propiedad intelectual, patentes u otros mecanismos legales aplicables. Esta obligación se mantiene incluso después de la terminación de la relación laboral, en la medida en que sea razonablemente necesario para garantizar la titularidad de la empresa sobre dichas invenciones o desarrollos.',
    },
    {
      k: 'c16',
      titulo: 'DÉCIMA SEXTA. MODIFICACIÓN DE LAS CONDICIONES LABORALES.',
      texto: 'EL EMPLEADO acepta desde ahora expresamente todas las modificaciones de las condiciones laborales determinadas por LA EMPLEADORA en ejercicio de su poder subordinante, tales como los turnos y jornadas de trabajo, el lugar de prestación de servicio, el cargo y oficio y/o funciones y la forma de remuneración, siempre que tales modificaciones no impliquen desmejoras que afecten su dignidad o sus derechos mínimos, de conformidad con lo dispuesto por el Art. 23 del C.S.T. modificado por el Art. 1° de la Ley 50/90. Los gastos que se originen con el traslado de lugar de prestación del servicio serán cubiertos por LA EMPLEADORA, de conformidad con el numeral 8° del Art. 57 del C.S.T.',
    },
    {
      k: 'c17',
      titulo: 'DÉCIMA SÉPTIMA. DIRECCIÓN DE EL EMPLEADO.',
      texto: 'EL EMPLEADO para todos los efectos legales indica la dirección anotada en el parágrafo 1 del Artículo 29 de la Ley 789/02, norma que modificó el 65 del C.S.T.; se compromete a informar por escrito y de manera inmediata a LA EMPLEADORA cualquier cambio en su dirección de residencia, teniéndose en todo caso como suya, la última dirección registrada en su hoja de vida.',
    },
    {
      k: 'c18',
      titulo: 'DÉCIMA OCTAVA. CONFIDENCIALIDAD.',
      texto: `EL EMPLEADO ${empleado}, guardará absoluta confidencialidad sobre toda la información reservada que maneje y a la que pudiere tener acceso. EL EMPLEADO se obliga a conservar, mantener y manejar la reserva y confidencialidad de toda la información que reciba de los funcionarios, empleados o asesores de LA COMPAÑÍA, de manera directa o indirecta, en forma verbal, escrita, gráfica, en medio magnético, electrónico, o bajo cualquier otra forma, que sea entregada con el ánimo de realizar operaciones propias de su objeto social y/o relativas al objeto del presente Acuerdo, sin que para el efecto sea necesario que la parte reveladora la califique como confidencial o reservada, en adelante denominada la "Información Confidencial" o la "información" indistintamente. En dicho sentido, se obliga EL EMPLEADO a tomar todas las medidas necesarias para que la información no llegue a manos de terceros ni de la competencia en ninguna circunstancia y se obliga a utilizarla únicamente para adelantar las tareas que se requieran para llevar a cabo el desarrollo, estructuración y puesta en marcha de negocios conjuntos, que redunden en beneficios económicos para LA COMPAÑÍA. Al suscribir el presente, EL EMPLEADO está obligado a responder legalmente por cualquier perjuicio que pueda surgir como resultado del incumplimiento de cualquiera de los compromisos contenidos en la presente cláusula. Las obligaciones señaladas continuarán vigentes aún después del vencimiento o terminación del ACUERDO. Asimismo, se obliga EL EMPLEADO a: 1) No utilizar para su propio beneficio la Información Confidencial en caso de no concretarse ninguna operación por escrito entre las partes; 2) No divulgar a terceros la Información Confidencial; 3) No realizar, o requerir que terceros realicen desarrollos o negocios a partir de la Información Confidencial, que resulten real o potencialmente en competencia con los productos y/o bienes y/o servicios comercializados o desarrollados por LA COMPAÑÍA.`,
    },
    {
      k: 'c18.p1',
      titulo: 'PARÁGRAFO PRIMERO:',
      texto: 'EL EMPLEADO se compromete a guardar confidencialidad absoluta, respecto del conocimiento directo o indirecto que, por ocasión de su labor, llegase a tener de las empresas filiales, controladas o subordinadas, que guardan estrecha relación comercial, financiera, contable y laboral de su EMPLEADOR.',
    },
    {
      k: 'c18.p2',
      titulo: 'PARÁGRAFO SEGUNDO:',
      texto: 'EL EMPLEADO se abstendrá, por sí, por su personal o por terceros, directa o indirectamente, de comportamientos que puedan constituir competencia desleal o actos de esta naturaleza, para con LA COMPAÑÍA, sus usuarios o terceros, o conductas contrarias a la confidencialidad exigida por la ley y el Contrato.',
    },
    {
      k: 'c18.p3',
      titulo: 'PARÁGRAFO TERCERO:',
      texto: 'EL EMPLEADO conoce y acepta desde ya que la divulgación y el uso indebido o no autorizado de la información que conozca o maneje puede causar un perjuicio irreparable a LA COMPAÑÍA. Por lo mismo, se compromete a no hacer ningún tipo de uso indebido o no autorizado de la información. Asimismo, se compromete a manejar la información que conozca o maneje con un mayor grado de cuidado de aquel con el cual maneja su propia información confidencial y sus propios secretos industriales. EL EMPLEADO es consciente de que deberá resarcir a LA COMPAÑÍA, por cualquier uso indebido o no autorizado, culpable o no, que él, sus empleados, socios, subcontratistas, asesores y demás personas puedan llegar a dar a la información que conozca o maneje. Los términos y condiciones aquí contenidos son de obligatorio cumplimiento y aceptación, por parte de quienes sean autorizados para tener acceso a la información o realizar las operaciones que tiene disponibles para ello.',
    },
    {
      k: 'c18.p4',
      titulo: 'PARÁGRAFO CUARTO – EXIGENCIA DE INDEMNIZACIÓN:',
      texto: 'En el evento de violación del presente Acuerdo por parte EL EMPLEADO, dicho evento dará derecho a LA COMPAÑÍA, a exigir por los medios judiciales pertinentes, la indemnización de perjuicios, incluyendo dentro de dicha indemnización las costas judiciales y agencias en derecho a que hubiere lugar. En ese caso, LA COMPAÑÍA tendrá toda la facultad de demandar y exigir judicialmente la reparación de perjuicios a la parte cumplida. En virtud de lo pactado en esta cláusula y, sin perjuicio del derecho de LA COMPAÑÍA a la indemnización de todos los daños, EL EMPLEADO reconocerá y pagará incondicional e irrevocablemente a LA COMPAÑÍA el valor que se estime por la ley para reconocer el perjuicio creado. Así las cosas, EL EMPLEADO reconoce y acepta expresamente que la presente obligación presta mérito ejecutivo y que, por lo tanto, puede ser ejecutada mediante proceso ejecutivo sin requerimiento o reconvención alguna al que se renuncia expresamente.',
    },
    {
      k: 'c18.p5',
      titulo: 'PARÁGRAFO QUINTO – MODIFICACIONES:',
      texto: 'Cualquier modificación a los términos y condiciones del presente ACUERDO, deberá constar por escrito mediante otrosí suscrito por ambas partes, el cual hará parte integral de este documento.',
    },
    {
      k: 'c19',
      titulo: 'DÉCIMA NOVENA. DECLARACIÓN DE SEGURIDAD.',
      texto: 'EL EMPLEADO manifiesta que no se encuentra inmerso en lista Clinton, OFAC o cualquier otra antiterrorista, en procesos penales, políticos ilícitos, disciplinarios, fiscales, sancionatorios, concursales o de insolvencia de persona natural no comerciante, no es deudor de alimentos conforme a la ley 311 de 1996, que su patrimonio y recursos han sido producto de una labor lícita, que él, sus parientes hasta 4º de consanguinidad, 2º de afinidad y 1° civil no se encuentran bajo inhabilidad, incompatibilidad y/o conflicto de intereses con LA EMPLEADORA y sus accionistas o socios.',
    },
    {
      k: 'c20',
      titulo: 'VIGÉSIMA. AUTORIZACIÓN PARA TRATAMIENTO DE DATOS.',
      texto: 'EL EMPLEADO autoriza de conformidad con las leyes 1266 de 2008 y 1581 de 2012 de manera irrevocable a LA EMPLEADORA y/o a la persona que ésta delegue, para que, con fines estadísticos, de control, supervisión y de información comercial, consulte y reporte a la Central de Información de la Asociación Bancaria y de Entidades Financieras de Colombia CIFIN, DATACRÉDITO y a cualquier otra entidad que maneje bases de datos con los mismos fines en Colombia o en otros países, el comportamiento CREDITICIO con el sistema financiero y el retardo o incumplimiento de las obligaciones que se deriven de este contrato.',
    },
    {
      k: 'c21',
      titulo: 'VIGÉSIMA PRIMERA. PREVENCIÓN DE LAVADO DE ACTIVOS Y FINANCIACIÓN DEL TERRORISMO.',
      texto: 'EL EMPLEADO se obliga con LA EMPLEADORA a implementar las medidas tendientes a evitar que sus operaciones puedan ser utilizadas como instrumentos para el ocultamiento, manejo, inversión o aprovechamiento en cualquier forma de dinero u otros bienes provenientes de actividades ilícitas o para dar apariencia de legalidad a estas actividades. En tal sentido, LA EMPLEADORA podrá dar por terminado de manera unilateral e inmediata la relación existente, sin que haya lugar al pago de indemnización alguna, cuando EL EMPLEADO, sus auxiliares o socios lleguen a ser: i) condenados por el delito de lavado de activos, sus delitos fuente, delitos contra la administración pública, financiación del terrorismo o administración de recursos relacionados con actividades terroristas; ii) sancionados administrativamente por violaciones a cualquier norma anticorrupción; iii) incluidos en listas administradas por cualquier autoridad nacional o extranjera para el control de lavado de activos, financiación del terrorismo o corrupción; iv) vinculados a cualquier investigación, proceso judicial o administrativo por la presunta comisión de tales delitos o infracciones.',
    },
    {
      k: 'c22',
      titulo: 'VIGÉSIMA SEGUNDA.',
      texto: 'EL EMPLEADO declara que ha leído el presente Contrato de Trabajo y manifiesta que está de acuerdo con él en su integridad. Asimismo, EL EMPLEADO declara conocer el Reglamento de Trabajo y el Manual de Funciones, los cuales hacen parte integrante del Contrato de Trabajo.',
    },
    {
      k: 'c22.p1',
      titulo: 'PARÁGRAFO:',
      texto: 'El presente Contrato de Trabajo se rige íntegramente por las disposiciones contenidas en el Código Sustantivo del Trabajo, la Ley 50 de 1990, la Ley 789 de 2002 y demás disposiciones concordantes.',
    },
  ];
};

export default function ContratoTerminoIndefinidoDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(solicitud.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<TIState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Partial<TIState>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    return {
      ...EMPTY,
      ...saved,
      empleador: saved.empleador || d.empresa || '',
      representanteLegal: saved.representanteLegal || des.funcionarioNombre || '',
      empleado: saved.empleado || d.contratista || '',
      empleadoCc: saved.empleadoCc || des.contratistaCc || acta.contratistaCc || '',
      empleadoDireccion: saved.empleadoDireccion || acta.direccion || '',
      empleadoCorreo: saved.empleadoCorreo || acta.correo || '',
      empleadoCelular: saved.empleadoCelular || acta.celular || '',
      salario: saved.salario || d.honorarios || '',
      fechaIniciacion: saved.fechaIniciacion || acta.fechaInicio || '',
      textos: saved.textos ?? {},
    };
  });

  const set = <K extends keyof TIState>(k: K, v: TIState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

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
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Término Indefinido</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Formato GJ-002-F · Solicitud N.º {solicitudId}</p>
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
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_170px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] border-r border-[#0a2a52]">
                CONTRATO A TÉRMINO INDEFINIDO
              </div>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-9 object-contain" />
                </div>
                <div className="grid grid-cols-[auto_1fr] text-[10px]">
                  <CodeCell label="CÓDIGO:" value="GJ-002-F" />
                  <CodeCell label="FECHA:" value="14/04/2026" />
                  <CodeCell label="VERSIÓN:" value="2" last />
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              {/* Tabla de datos */}
              <table className="w-full border-collapse text-[12px] mb-5">
                <tbody>
                  <Row label="Nombre del empleador" value={f.empleador} onChange={(v) => set('empleador', v)} />
                  <Row label="Domicilio del empleador" value={f.domicilioEmpleador} onChange={(v) => set('domicilioEmpleador', v)} />
                  <Row label="Nombre del empleado" value={f.empleado} onChange={(v) => set('empleado', v)} />
                  <Row label="Dirección" value={f.empleadoDireccion} onChange={(v) => set('empleadoDireccion', v)} />
                  <Row label="Correo electrónico" value={f.empleadoCorreo} onChange={(v) => set('empleadoCorreo', v)} />
                  <Row label="No. de celular" value={f.empleadoCelular} onChange={(v) => set('empleadoCelular', v)} />
                  <Row label="Lugar, fecha de nacimiento y nacionalidad" value={f.lugarFechaNacimiento} onChange={(v) => set('lugarFechaNacimiento', v)} />
                  <Row label="Cargo a desempeñar" value={f.cargo} onChange={(v) => set('cargo', v)} />
                  <Row label="Salario básico mensual" value={f.salario} onChange={(v) => set('salario', v)} placeholder="... pesos M/L ($ /L)" />
                  <Row label="Periodos de pago" value={f.periodosPago} onChange={(v) => set('periodosPago', v)} />
                  <Row label="Fecha de iniciación de labores" value={f.fechaIniciacion} onChange={(v) => set('fechaIniciacion', v)} />
                </tbody>
              </table>

              <div className="space-y-3 text-justify leading-relaxed text-[12px]">
                {/*
                  La comparecencia se queda con casillas y no pasa a texto reescribible: el
                  NIT, las cédulas y la ciudad de expedición no tienen otro sitio donde
                  capturarse, y disolverlos en un párrafo los volvería texto suelto que nada
                  más puede leer.

                  Pero **todos** los datos se escriben acá, incluidos los cuatro que antes
                  salían impresos desde la tabla y el bloque de firmas. Verlos como texto
                  fijo en medio de un párrafo que sí se deja escribir hacía pensar que el
                  documento estaba trabado; y el nombre del representante legal y la cédula
                  del empleado ni siquiera tenían casilla en esta página. Como es el mismo
                  estado, escribirlos acá los actualiza también arriba y en las firmas.
                */}
                <p>
                  Entre los suscritos a saber{' '}
                  <Inline value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} placeholder="representante legal" bold />, identificada con la cédula de ciudadanía No.{' '}
                  <Inline value={f.representanteCc} onChange={(v) => set('representanteCc', v)} placeholder="No." />, actuando en calidad de
                  representante legal de{' '}
                  <Inline value={f.empleador} onChange={(v) => set('empleador', v)} placeholder="empresa empleadora" bold />, identificado con NIT No.{' '}
                  <Inline value={f.empleadorNit} onChange={(v) => set('empleadorNit', v)} placeholder="NIT" />, quien en adelante se
                  denominará <b>LA EMPLEADORA</b> y por otra parte{' '}
                  <Inline value={f.empleado} onChange={(v) => set('empleado', v)} placeholder="nombre del empleado" bold />, mayor de edad, identificado con cédula de
                  ciudadanía No.{' '}
                  <Inline value={f.empleadoCc} onChange={(v) => set('empleadoCc', v)} placeholder="cédula" /> expedida en la ciudad de{' '}
                  <Inline value={f.ciudadExpedicion} onChange={(v) => set('ciudadExpedicion', v)} placeholder="ciudad" />, actuando en
                  nombre propio y quien en adelante se denominará <b>EL EMPLEADO</b>, hemos convenido celebrar contrato a término
                  indefinido, que se regirá por las siguientes cláusulas:
                </p>

                {/* El articulado: cada cláusula y cada parágrafo se pueden reescribir. */}
                {articulado(f).map((c) => (
                  <ClausulaEd key={c.k} k={c.k} titulo={c.titulo} texto={c.texto} />
                ))}

                <p className="pt-4">
                  Para constancia se firma en <Inline value={f.ciudadFirma} onChange={(v) => set('ciudadFirma', v)} placeholder="ciudad" />, el día{' '}
                  <Inline value={f.fechaFirma} onChange={(v) => set('fechaFirma', v)} placeholder="00 de mes de 0000" /> en dos o más
                  ejemplares del mismo tenor y valor, un ejemplar de los cuales recibe EL EMPLEADO en este acto, en la ciudad y fecha ya
                  indicados.
                </p>

                {/* Firmas */}
                <div className="grid grid-cols-2 gap-8 pt-12">
                  <div>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.empleador} onChange={(v) => set('empleador', v)} placeholder="Empresa empleadora" bold />
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
          <PieElaboracion />
          </TextosDocumento>
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
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[42%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
      </td>
    </tr>
  );
}

/**
 * Casilla que va dentro de un párrafo y se lee como parte de él.
 *
 * `bold` es para los nombres de las partes: en el formato van en negrita, y una casilla
 * que se ve distinta de lo que reemplaza rompe la lectura del documento.
 */
function Inline({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size={Math.max((value || placeholder || '').length, 5)}
      className={
        'bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] '
        + 'focus:border-[hsl(var(--canalco-primary))] text-[12px] placeholder:italic '
        + 'placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:font-normal '
        + (bold ? 'font-bold' : '')
      }
    />
  );
}

function FLine({ value, onChange, placeholder, bold }: { value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')} />
  );
}
