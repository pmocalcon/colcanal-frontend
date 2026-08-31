import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';

/**
 * Contrato individual de trabajo a término indefinido, plantilla 2026 (el formato
 * «14 Plantilla Contrato Indefinido Ajustada_2026»).
 *
 * Ojo con el archivo de origen: en la carpeta de plantillas hay **dos** con ese nombre. El
 * que se sigue acá es el genérico —el que trae `[CARGO]`, `[DIRECCIÓN / ÁREA]`, «el jefe
 * inmediato» y las faltas graves redactadas para cualquier cargo—. El otro es un contrato
 * ya diligenciado para una abogada: dice «la Directora XXXXX» y sus faltas graves son las
 * de un cargo jurídico. Partir de ese habría dejado el oficio de una persona metido en
 * todos los contratos indefinidos de la empresa.
 *
 * Es el más largo de los laborales: **veintidós cláusulas y once parágrafos**. Frente a los
 * otros dos contratos de trabajo añade lo que solo tiene sentido en un vínculo sin plazo:
 * propiedad intelectual con cesión de derechos patrimoniales, confidencialidad que sigue
 * viva después de terminado, declaraciones de inhabilidades y conflictos de interés,
 * tratamiento de datos y prevención de lavado de activos.
 *
 * Y trae una lista de **faltas graves** en el parágrafo primero que no está en los otros:
 * ocho conductas tipificadas, cada una con la advertencia de que se valoran con debido
 * proceso, derecho de defensa y proporcionalidad. Esa última frase es la que evita que la
 * lista se lea como una causal automática de despido.
 */

interface TIState {
  /* ── Control interno: no sale en la versión firmable ── */
  ciJornada: string;
  ciPeriodoPrueba: string;
  ciRevisionRit: string;

  /* ── Datos de la vinculación ── */
  empleador: string;
  nit: string;
  representanteLegal: string;
  representanteCc: string;
  domicilioEmpleador: string;
  empleado: string;
  contacto: string;
  nacimiento: string;
  cargo: string;
  dependencia: string;
  jefeInmediato: string;
  salario: string;
  periodicidadPago: string;
  fechaInicio: string;
  horario: string;
  periodoPrueba: string;

  /* ── Firma del empleado ── */
  empleadoCc: string;
  empleadoLugarCc: string;

  /** Texto de las cláusulas que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * Los huecos van como valores y no como `placeholder`: un placeholder se ve en pantalla
 * pero no se imprime, y el formato en blanco tiene que poder imprimirse para diligenciarlo
 * a mano. Se escriben en la convención de la plantilla —corchetes en mayúscula—.
 */
const EMPTY: TIState = {
  ciJornada: '42 horas semanales, sin perjuicio de excepciones legales aplicables al cargo',
  ciPeriodoPrueba: 'DOS (2) MESES. VALIDAR VÍNCULOS LABORALES SUCESIVOS ANTES DE GENERAR.',
  ciRevisionRit: '[CONFIRMADA / PENDIENTE]',

  // El empleador es siempre el mismo: va escrito, no en blanco.
  empleador: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',
  representanteLegal: 'GLORIA LUCÍA ESCALANTE MANZANO',
  representanteCc: 'C.C. 66.651.423 expedida en El Cerrito, Valle del Cauca',
  domicilioEmpleador: 'Calle 13A No. 101-60, Ciudad Jardín, Cali, Valle del Cauca',
  empleado: '[NOMBRE COMPLETO] - C.C. [NÚMERO] de [LUGAR]',
  contacto: '[DIRECCIÓN] / [CORREO] / [TELÉFONO]',
  nacimiento: '[LUGAR / FECHA / NACIONALIDAD]',
  cargo: '[CARGO]',
  dependencia: '[DIRECCIÓN / ÁREA]',
  jefeInmediato: '[CARGO / NOMBRE SI APLICA]',
  salario: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR])',
  periodicidadPago: '[MENSUAL / QUINCENAL, SEGÚN POLÍTICA]',
  fechaInicio: '[DÍA] de [MES] de [AÑO]',
  horario: '[HORARIO CORPORATIVO APLICABLE / TURNOS]',
  periodoPrueba: 'DOS (2) MESES',

  empleadoCc: '[NÚMERO]',
  empleadoLugarCc: '[LUGAR]',

  textos: {},
};

/**
 * Lo guardado con la plantilla vieja, traído a la nueva.
 *
 * La ficha anterior separaba nombre y cédula del empleado en dos campos; la de 2026 los
 * junta en una celda —«[NOMBRE COMPLETO] - C.C. [NÚMERO] de [LUGAR]»—. Sin este puente, un
 * contrato a medio diligenciar se abriría en blanco. Lo que la plantilla vieja tenía y esta
 * no **no se borra**: sigue en `data.contrato`, solo deja de leerse.
 */
function traerDeLaPlantillaVieja(saved: Record<string, unknown>): Partial<TIState> {
  const texto = (k: string) => (typeof saved[k] === 'string' ? (saved[k] as string).trim() : '');
  const puente: Partial<TIState> = {};
  if (!saved.empleado) {
    const nombre = texto('empleado') || texto('trabajadora') || texto('trabajador');
    const cc = texto('empleadoCc') || texto('trabajadoraCc');
    if (nombre) puente.empleado = cc ? `${nombre} - C.C. ${cc}` : nombre;
  }
  if (!saved.contacto && texto('empleadoDireccion')) puente.contacto = texto('empleadoDireccion');
  if (!saved.nacimiento && texto('empleadoFechaNacimiento')) puente.nacimiento = texto('empleadoFechaNacimiento');
  return puente;
}

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

/**
 * Las veintidós cláusulas y sus once parágrafos, en el orden y con el texto de 2026.
 *
 * `parrafos` es una lista porque hay cláusulas que en el formato ocupan más de un párrafo
 * —la décima tercera, la décima quinta y la décima octava— y partirlas es lo que permite
 * que Jurídica reescriba uno sin tocar los otros.
 *
 * Las claves llevan el prefijo `i` —de indefinido— y son nuevas: la plantilla anterior no
 * guardaba texto editable, así que no hay nada que reutilizar ni con qué chocar.
 */
const BLOQUES: { k: string; titulo: string; parrafos: string[] }[] = [
  {
    k: 'i1',
    titulo: 'PRIMERA. OBJETO',
    parrafos: ['LA EMPLEADORA contrata los servicios personales de EL EMPLEADO(A) para desempeñar el cargo de [CARGO], adscrito(a) a la [DIRECCIÓN / ÁREA]. EL EMPLEADO(A) se obliga a: a) poner al servicio de LA EMPLEADORA toda su capacidad normal de trabajo, sus conocimientos y experiencia, en el desarrollo de las funciones propias del cargo, las descritas en el Manual de Funciones y el perfil de cargo, y las labores conexas y complementarias que le sean asignadas; b) cumplir las órdenes e instrucciones impartidas por LA EMPLEADORA, el jefe inmediato o quien formalmente haga sus veces; c) prestar sus servicios con diligencia, lealtad, buena fe y responsabilidad; d) guardar reserva sobre los hechos, documentos físicos o electrónicos, datos, información y asuntos que conozca por causa o con ocasión de la relación laboral; y e) abstenerse de desarrollar, durante la jornada laboral o utilizando recursos de LA EMPLEADORA, actividades ajenas a sus funciones, así como actividades que generen conflicto de interés, salvo autorización previa y escrita.'],
  },
  {
    k: 'i1.p1',
    titulo: 'PARÁGRAFO PRIMERO',
    parrafos: ['Sin perjuicio de las faltas previstas en la ley y en el Reglamento Interno de Trabajo, se califican como faltas graves, atendiendo en cada caso su naturaleza, impacto y circunstancias: a) alterar, falsificar, ocultar, destruir, sustraer o utilizar indebidamente documentos, soportes, registros, datos o información de LA EMPLEADORA o de terceros relacionados con ella; b) revelar, extraer, copiar o utilizar sin autorización información confidencial o reservada; c) comprometer, obligar o representar a LA EMPLEADORA frente a terceros sin competencia, delegación o autorización; d) utilizar indebidamente bienes, recursos, sistemas, claves, accesos o herramientas de LA EMPLEADORA, especialmente cuando ello genere un riesgo o perjuicio relevante; e) solicitar, recibir, ofrecer o aceptar pagos, beneficios o ventajas indebidas relacionados con el ejercicio de sus funciones; f) incurrir en actos de violencia, acoso, discriminación, amenaza o irrespeto grave en el entorno laboral; g) incumplir de manera grave o reiterada las instrucciones legítimas impartidas, las obligaciones de seguridad y salud en el trabajo, seguridad de la información, protección de datos, ética o cumplimiento; y h) omitir injustificadamente obligaciones esenciales del cargo cuando ello genere o pueda generar una afectación grave para LA EMPLEADORA. La valoración de estas conductas y las consecuencias que correspondan se efectuarán con observancia del debido proceso, el derecho de defensa y el principio de proporcionalidad.'],
  },
  {
    k: 'i2',
    titulo: 'SEGUNDA. LUGAR DE TRABAJO',
    parrafos: ['EL EMPLEADO(A) prestará sus servicios principalmente en la sede de CANALES Y CONTACTOS S.A.S. ubicada en Cali, Valle del Cauca, y en los demás lugares dentro del territorio nacional en los que LA EMPLEADORA desarrolle su objeto o actividad y requiera su presencia. LA EMPLEADORA podrá disponer cambios razonables del lugar de prestación del servicio o traslados, de acuerdo con las necesidades empresariales, siempre que no impliquen desmejora de las condiciones laborales, afectación de la dignidad de EL EMPLEADO(A) ni desconocimiento de sus derechos mínimos. Los gastos de traslado a que haya lugar serán reconocidos de conformidad con la ley y las políticas internas aplicables.'],
  },
  {
    k: 'i2.p',
    titulo: 'PARÁGRAFO',
    parrafos: ['La jornada y el horario de trabajo se regirán por lo dispuesto en la cláusula octava. LA EMPLEADORA podrá efectuar ajustes razonables en su distribución, de conformidad con las necesidades del servicio y dentro de los límites legales.'],
  },
  {
    k: 'i3',
    titulo: 'TERCERA. CARGO, FUNCIONES Y DEPENDENCIA',
    parrafos: ['EL EMPLEADO(A) desempeñará el cargo y estará adscrito(a) a la dependencia indicados en los datos de vinculación. Dependerá jerárquica y funcionalmente del jefe inmediato allí señalado, o de quien formalmente haga sus veces. Ejercerá las funciones descritas en el Manual de Funciones y el perfil del cargo, así como las labores conexas, complementarias y compatibles con su formación, experiencia y nivel de responsabilidad que le sean asignadas.'],
  },
  {
    k: 'i3.p1',
    titulo: 'PARÁGRAFO PRIMERO',
    parrafos: ['EL EMPLEADO(A) deberá actuar dentro de las funciones, atribuciones y niveles de autorización propios de su cargo. No podrá comprometer a LA EMPLEADORA frente a terceros, asumir obligaciones en su nombre, disponer de recursos, suscribir documentos, impartir decisiones vinculantes o ejercer representación sin contar con la competencia, delegación, poder o autorización correspondiente. Las actuaciones que, por su naturaleza o por las políticas internas, requieran aprobación previa deberán someterse al visto bueno del jefe inmediato o de la instancia competente.'],
  },
  {
    k: 'i3.p2',
    titulo: 'PARÁGRAFO SEGUNDO',
    parrafos: ['El jefe inmediato podrá distribuir o redistribuir las actividades entre los integrantes del área o dependencia, de acuerdo con las necesidades del servicio, las prioridades institucionales, las cargas de trabajo y las competencias de cada cargo, siempre que las actividades asignadas sean compatibles con las funciones, formación, experiencia y nivel de responsabilidad de EL EMPLEADO(A).'],
  },
  {
    k: 'i4',
    titulo: 'CUARTA. OBLIGACIONES DEL EMPLEADO(A)',
    parrafos: ['Además de las previstas en la ley, el Reglamento Interno de Trabajo, el Manual de Funciones y las políticas de LA EMPLEADORA, son obligaciones de EL EMPLEADO(A): a) ejecutar con diligencia las actividades asignadas; b) cumplir las instrucciones del jefe inmediato y reportar oportunamente avances, riesgos, novedades y vencimientos; c) mantener actualizados los controles, matrices, informes y registros a su cargo; d) elaborar y entregar oportunamente los documentos y productos requeridos, sometiéndolos a revisión y visto bueno; e) proteger, organizar y conservar los expedientes y archivos físicos y digitales; f) asistir a reuniones, comités, capacitaciones y actividades relacionadas con su cargo; g) cumplir las políticas de seguridad de la información, protección de datos, ética, prevención de riesgos y seguridad y salud en el trabajo; h) custodiar y devolver los elementos, accesos y documentos entregados; e i) cumplir las demás funciones compatibles con su cargo que le sean asignadas por el jefe inmediato.'],
  },
  {
    k: 'i5',
    titulo: 'QUINTA. ELEMENTOS DE TRABAJO',
    parrafos: ['Corresponde a LA EMPLEADORA suministrar los elementos, herramientas, accesos y recursos necesarios para el normal desempeño de las funciones del cargo, sin perjuicio del deber de EL EMPLEADO(A) de cuidarlos, utilizarlos exclusivamente para fines laborales y devolverlos cuando sean requeridos o al finalizar la relación laboral.'],
  },
  {
    k: 'i6',
    titulo: 'SEXTA. REMUNERACIÓN',
    parrafos: ['LA EMPLEADORA pagará a EL EMPLEADO(A), por la prestación de sus servicios, el salario básico mensual indicado en la parte inicial del presente contrato, pagadero con la periodicidad indicada en los datos de vinculación. EL EMPLEADO(A) autoriza que el salario sea consignado en una cuenta de una entidad del sistema financiero o pagado mediante otro medio legalmente autorizado. En el salario ordinario se encuentra incluida la remuneración de los descansos obligatorios de ley.'],
  },
  {
    k: 'i6.p1',
    titulo: 'PARÁGRAFO PRIMERO',
    parrafos: ['LA EMPLEADORA efectuará las deducciones y retenciones legalmente autorizadas, incluyendo los aportes a cargo de EL EMPLEADO(A) al Sistema de Seguridad Social Integral. Los gastos propios de la cuenta bancaria personal serán asumidos por su titular, salvo disposición legal o acuerdo escrito en contrario.'],
  },
  {
    k: 'i6.p2',
    titulo: 'PARÁGRAFO SEGUNDO',
    parrafos: ['Los auxilios, beneficios o reconocimientos extralegales que no tengan como finalidad remunerar directamente el servicio y que sean expresamente pactados como no salariales no constituirán factor salarial, de conformidad con la legislación aplicable. La naturaleza de cada pago atenderá a su finalidad real y a las disposiciones legales vigentes.'],
  },
  {
    k: 'i7',
    titulo: 'SÉPTIMA. TRABAJO SUPLEMENTARIO, NOCTURNO, DOMINICAL Y FESTIVO',
    parrafos: ['El trabajo suplementario o en horas extras, nocturno, dominical o festivo se remunerará con los recargos y condiciones establecidos en la ley. Para su ejecución deberá mediar autorización previa y escrita de LA EMPLEADORA o del jefe inmediato. Cuando la necesidad se presente de manera imprevista e inaplazable, EL EMPLEADO(A) deberá informar por escrito a la mayor brevedad. LA EMPLEADORA llevará el registro correspondiente y reconocerá el trabajo efectivamente ejecutado y debidamente comprobado, conforme a la ley.'],
  },
  {
    k: 'i8',
    titulo: 'OCTAVA. JORNADA DE TRABAJO',
    parrafos: ['EL EMPLEADO(A) prestará sus servicios dentro de los horarios y turnos establecidos por LA EMPLEADORA, con una jornada ordinaria máxima de cuarenta y dos (42) horas semanales, distribuida de conformidad con la legislación laboral vigente. La distribución diaria podrá organizarse bajo la modalidad de jornada flexible, sin exceder los límites legales ni afectar los descansos obligatorios.'],
  },
  {
    k: 'i8.p1',
    titulo: 'PARÁGRAFO PRIMERO',
    parrafos: ['El horario ordinario será el indicado en los datos de vinculación y deberá corresponder a la jornada legal y a la modalidad aplicable al cargo. Podrá ajustarse razonablemente, previa comunicación a EL EMPLEADO(A), de acuerdo con las necesidades del servicio y dentro de los límites legales.'],
  },
  {
    k: 'i9',
    titulo: 'NOVENA. PERÍODO DE PRUEBA',
    parrafos: ['Las partes acuerdan expresamente un período de prueba de dos (2) meses, contados a partir de la fecha de iniciación de labores indicada en los datos de vinculación, de conformidad con las disposiciones legales aplicables. Durante este período cualquiera de las partes podrá dar por terminado unilateralmente el contrato en los términos previstos por la ley. La presente cláusula constituye la estipulación escrita del período de prueba.'],
  },
  {
    k: 'i10',
    titulo: 'DÉCIMA. DURACIÓN DEL CONTRATO',
    parrafos: ['La duración del presente contrato es a TÉRMINO INDEFINIDO. Podrá terminarse por cualquiera de las causales previstas en la ley, en el presente contrato, en el Reglamento Interno de Trabajo y en las demás disposiciones aplicables, con observancia de los procedimientos y garantías que correspondan.'],
  },
  {
    k: 'i11',
    titulo: 'DÉCIMA PRIMERA. AFILIACIÓN Y PAGO AL SISTEMA DE SEGURIDAD SOCIAL INTEGRAL',
    parrafos: ['LA EMPLEADORA afiliará a EL EMPLEADO(A) a los sistemas de salud, pensiones y riesgos laborales y efectuará los aportes correspondientes. EL EMPLEADO(A) autoriza el descuento de los valores que legalmente estén a su cargo.'],
  },
  {
    k: 'i12',
    titulo: 'DÉCIMA SEGUNDA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS',
    parrafos: ['EL EMPLEADO(A) se obliga a desempeñar sus funciones con integridad, ética, transparencia y lealtad hacia CANALES Y CONTACTOS S.A.S. Queda estrictamente prohibido solicitar, recibir, aceptar, ofrecer o entregar, directa o indirectamente, pagos, comisiones, gratificaciones, beneficios, dádivas o cualquier retribución indebida de proveedores, contratistas, clientes, servidores públicos o terceros con quienes LA EMPLEADORA mantenga o pueda mantener relaciones. El incumplimiento comprobado de esta obligación constituirá falta grave y podrá dar lugar a la terminación del contrato con justa causa, previo cumplimiento del procedimiento laboral y disciplinario aplicable, sin perjuicio de las acciones legales y del resarcimiento de los perjuicios debidamente acreditados.'],
  },
  {
    k: 'i13',
    titulo: 'DÉCIMA TERCERA. TERMINACIÓN UNILATERAL',
    parrafos: [
      'El presente contrato se encuentra sujeto a las disposiciones legales que regulan las relaciones laborales y al Reglamento Interno de Trabajo de CANALES Y CONTACTOS S.A.S., el cual será puesto en conocimiento de EL EMPLEADO(A). LA EMPLEADORA podrá terminar unilateralmente el contrato con justa causa cuando se configure una causal legal o contractual válida, garantizando el debido proceso y el derecho de defensa cuando resulten aplicables.',
      'Son justas causas para terminar unilateralmente el contrato las previstas en el Código Sustantivo del Trabajo y demás normas aplicables. También podrán constituir faltas graves las conductas expresamente calificadas como tales en este contrato, en el Reglamento Interno de Trabajo, en el Manual de Funciones y en las políticas válidamente adoptadas, siempre que la conducta se encuentre debidamente comprobada y su gravedad, reiteración, impacto y circunstancias justifiquen la medida.',
    ],
  },
  {
    k: 'i14',
    titulo: 'DÉCIMA CUARTA. RESPONSABILIDAD SOBRE ELEMENTOS DE TRABAJO',
    parrafos: ['EL EMPLEADO(A) deberá cuidar y utilizar adecuadamente las herramientas, equipos, documentos, claves, accesos y demás elementos entregados por LA EMPLEADORA. Responderá por las pérdidas o daños que le sean imputables a título de dolo o culpa, previa verificación de los hechos, garantía del derecho de defensa y determinación de la responsabilidad correspondiente. No habrá responsabilidad automática por hurto, caso fortuito, fuerza mayor o deterioro normal por el uso.'],
  },
  {
    k: 'i14.p',
    titulo: 'PARÁGRAFO',
    parrafos: ['Cuando existan obligaciones económicas legalmente exigibles a cargo de EL EMPLEADO(A), cualquier descuento de salarios, prestaciones o liquidación deberá contar con autorización previa, expresa y escrita otorgada para el caso concreto, o con orden judicial, y deberá respetar los límites legales. La entrega de anticipos para gastos se sujetará a las políticas internas de legalización y soportes.'],
  },
  {
    k: 'i15',
    titulo: 'DÉCIMA QUINTA. PROPIEDAD INTELECTUAL',
    parrafos: [
      'Los documentos, conceptos, bases de datos, informes, metodologías, procedimientos, diseños, desarrollos, software, obras y demás resultados elaborados por EL EMPLEADO(A) en cumplimiento de sus funciones, utilizando recursos de LA EMPLEADORA o siguiendo sus instrucciones, pertenecerán a CANALES Y CONTACTOS S.A.S. en la medida permitida por la ley.',
      'EL EMPLEADO(A) transfiere a LA EMPLEADORA, en los términos permitidos por la legislación aplicable, los derechos patrimoniales de autor y demás derechos susceptibles de cesión sobre tales resultados, para todos los territorios, medios y modalidades de explotación, por el término máximo de protección legal. Los derechos morales permanecerán en cabeza de sus titulares conforme a la ley.',
      'EL EMPLEADO(A) se obliga a suscribir los documentos y prestar la colaboración razonablemente necesaria para formalizar, registrar o proteger los derechos de LA EMPLEADORA. Esta obligación continuará después de la terminación del contrato en cuanto resulte necesario para acreditar o proteger la titularidad correspondiente.',
    ],
  },
  {
    k: 'i16',
    titulo: 'DÉCIMA SEXTA. MODIFICACIÓN DE LAS CONDICIONES LABORALES',
    parrafos: ['En ejercicio de su facultad subordinante, LA EMPLEADORA podrá efectuar modificaciones razonables respecto del horario, lugar de prestación del servicio, distribución de funciones y organización del trabajo, de acuerdo con las necesidades empresariales, siempre que sean compatibles con el cargo y no impliquen desmejora salarial o profesional, afectación de la dignidad, desconocimiento de derechos mínimos ni perjuicios graves para EL EMPLEADO(A). La remuneración no podrá ser reducida unilateralmente. Los gastos derivados de traslados se asumirán conforme a la ley.'],
  },
  {
    k: 'i17',
    titulo: 'DÉCIMA SÉPTIMA. DIRECCIÓN Y DATOS DE CONTACTO DEL EMPLEADO(A)',
    parrafos: ['EL EMPLEADO(A) se obliga a informar por escrito y de manera oportuna cualquier cambio en su dirección de residencia, correo electrónico, número telefónico u otros datos de contacto. Para efectos laborales se tendrá como válida la última información registrada en su hoja de vida o comunicada formalmente a LA EMPLEADORA.'],
  },
  {
    k: 'i18',
    titulo: 'DÉCIMA OCTAVA. CONFIDENCIALIDAD Y RESERVA',
    parrafos: [
      'Se considera información confidencial o reservada toda información corporativa, jurídica, contractual, financiera, contable, comercial, técnica, operativa, laboral, personal o estratégica de LA EMPLEADORA, sus vinculadas, clientes, proveedores, contratistas, municipios y terceros, conocida por EL EMPLEADO(A) con ocasión de sus funciones, independientemente del medio en que se encuentre y de que haya sido marcada o no como confidencial.',
      'EL EMPLEADO(A) se obliga a: a) utilizar la información únicamente para el cumplimiento de sus funciones; b) abstenerse de divulgarla, copiarla, extraerla, almacenarla en dispositivos o cuentas personales, remitirla a terceros o utilizarla en beneficio propio o ajeno sin autorización; c) adoptar medidas razonables de seguridad; d) informar de inmediato cualquier pérdida, acceso no autorizado, incidente o requerimiento de autoridad; e) cumplir las políticas de seguridad de la información y protección de datos; y f) devolver o eliminar, según las instrucciones de LA EMPLEADORA, los documentos, archivos, copias, accesos y soportes al finalizar el vínculo o cuando sean requeridos.',
    ],
  },
  {
    k: 'i18.p1',
    titulo: 'PARÁGRAFO PRIMERO',
    parrafos: ['No se considerará incumplimiento la revelación de información que sea de dominio público sin intervención de EL EMPLEADO(A), que hubiera sido obtenida legítimamente de un tercero o que deba entregarse por mandato legal o de autoridad competente. En este último caso, EL EMPLEADO(A) deberá informar previamente a LA EMPLEADORA cuando la ley lo permita y limitar la revelación a lo estrictamente requerido.'],
  },
  {
    k: 'i18.p2',
    titulo: 'PARÁGRAFO SEGUNDO',
    parrafos: ['Las obligaciones de confidencialidad permanecerán vigentes después de la terminación del contrato mientras la información conserve su carácter reservado o durante el término exigido por la ley. Su incumplimiento podrá constituir falta grave y dar lugar a las acciones disciplinarias o legales correspondientes y a la reparación de los perjuicios debidamente demostrados, con respeto del debido proceso.'],
  },
  {
    k: 'i19',
    titulo: 'DÉCIMA NOVENA. DECLARACIONES, INHABILIDADES Y CONFLICTOS DE INTERÉS',
    parrafos: ['EL EMPLEADO(A) declara que, a la fecha de suscripción del contrato, no conoce la existencia de inhabilidades, incompatibilidades o conflictos de interés que le impidan desempeñar el cargo, que los recursos que maneja o utiliza provienen de actividades lícitas y que la información suministrada a LA EMPLEADORA es veraz. Se obliga a informar oportunamente cualquier situación sobreviniente que pueda afectar su idoneidad, independencia, integridad o el cumplimiento de sus funciones. Esta declaración se limita a hechos propios o que razonablemente sean de su conocimiento y no implica garantizar la situación jurídica de familiares o terceros.'],
  },
  {
    k: 'i20',
    titulo: 'VIGÉSIMA. TRATAMIENTO DE DATOS PERSONALES',
    parrafos: ['EL EMPLEADO(A) autoriza a LA EMPLEADORA, de manera previa, expresa e informada, para recolectar, almacenar, usar, circular, actualizar, transmitir, transferir y, cuando proceda, suprimir sus datos personales para fines relacionados con la selección, vinculación, administración de personal, nómina, seguridad social, seguridad y salud en el trabajo, formación, evaluación, control de acceso, seguridad de la información, cumplimiento legal y gestión documental. EL EMPLEADO(A) podrá ejercer los derechos de conocer, actualizar, rectificar, solicitar prueba de la autorización, presentar consultas o reclamos, solicitar la supresión y revocar la autorización cuando legalmente proceda, de conformidad con la política de tratamiento de datos de LA EMPLEADORA y las normas aplicables.'],
  },
  {
    k: 'i21',
    titulo: 'VIGÉSIMA PRIMERA. PREVENCIÓN DEL LAVADO DE ACTIVOS, FINANCIACIÓN DEL TERRORISMO, CORRUPCIÓN Y SOBORNO',
    parrafos: ['EL EMPLEADO(A) se obliga a cumplir las políticas y procedimientos adoptados por LA EMPLEADORA para prevenir el lavado de activos, la financiación del terrorismo, la proliferación de armas, la corrupción, el soborno y demás riesgos de cumplimiento; a abstenerse de participar en operaciones ilícitas; a suministrar información veraz; a declarar y gestionar conflictos de interés; y a reportar oportunamente las operaciones, hechos o señales de alerta que conozca con ocasión de sus funciones. El incumplimiento grave y comprobado podrá dar lugar a las medidas disciplinarias o a la terminación del contrato con justa causa, con observancia del debido proceso y sin que la sola existencia de una investigación constituya automáticamente una causal de terminación.'],
  },
  {
    k: 'i22',
    titulo: 'VIGÉSIMA SEGUNDA. INTEGRIDAD Y CONOCIMIENTO DE DOCUMENTOS INTERNOS',
    parrafos: ['EL EMPLEADO(A) declara que ha leído el presente contrato y manifiesta estar de acuerdo con su contenido. Asimismo, declara conocer o se obliga a conocer el Reglamento Interno de Trabajo, el Manual de Funciones, el perfil de cargo, las políticas y procedimientos internos que le sean comunicados, los cuales harán parte integral de la relación laboral en cuanto sean compatibles con la ley y con el presente contrato.'],
  },
  {
    k: 'i22.p',
    titulo: 'PARÁGRAFO',
    parrafos: ['El presente contrato se rige por el Código Sustantivo del Trabajo, la Ley 50 de 1990, la Ley 789 de 2002, las normas que las modifiquen, adicionen o sustituyan y las demás disposiciones laborales aplicables. Si alguna estipulación resulta inválida o ineficaz, las restantes conservarán su vigencia y deberán interpretarse de manera compatible con la legislación laboral.'],
  },
];

export default function ContratoTerminoIndefinidoDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;

  /*
   * La solicitud se guarda en estado propio porque la acción de la etapa la cambia: al
   * remitir el contrato a firma, `AccionesFlujo` devuelve la solicitud recargada y con ella
   * se repintan las pestañas y el propio panel.
   */
  const [sol, setSol] = useState(solicitud);
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<TIState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Record<string, unknown> & Partial<TIState>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    /*
     * Lo que ya se escribió en la solicitud y en el acta se trae. Solo entra donde el hueco
     * sigue intacto: una vez que alguien escribió en la celda, manda lo escrito.
     */
    const delTramite: Partial<TIState> = {
      salario: (d.honorarios as string) || '',
      fechaInicio: acta.fechaInicio || '',
    };
    const base = { ...EMPTY, ...traerDeLaPlantillaVieja(saved), ...saved };
    for (const [k, v] of Object.entries(delTramite)) {
      const clave = k as keyof TIState;
      if (v && base[clave] === EMPTY[clave]) (base as Record<string, unknown>)[clave] = v;
    }
    return { ...base, textos: saved.textos ?? {} };
  });

  const set = <K extends keyof TIState>(k: K, v: TIState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /**
   * Devuelve si se guardó, porque `AccionesFlujo` lo usa para decidir si sigue: remitir a
   * firma un contrato que no se alcanzó a guardar adelantaría el trámite sobre un texto
   * que nadie escribió.
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
          /* Una cláusula no se parte entre dos hojas si cabe entera. */
          .bloque { break-inside: avoid; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Término indefinido</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Contrato individual de trabajo a término indefinido · Solicitud N.º {solicitudId} · Plantilla 2026
            </p>
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
        <AccionesFlujo
          sol={sol} documento="contrato" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">Este contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita en la etapa de elaboración del contrato.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={irSolicitud}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-8 py-6">

            {/* Membrete */}
            <EncabezadoFormato
              className="mb-3"
              codigo="GJ-003-F"
              titulo={<>
                <h1 className="font-bold text-[13px]">CONTRATO INDIVIDUAL DE TRABAJO</h1>
                <p className="font-bold text-[12px]">A TÉRMINO INDEFINIDO</p>
              </>}
            />

            <p className="text-[11px] font-bold mb-4">NIT 900.456.735-7</p>

            {/* La plantilla lo dice en su propio título: no se muestra en la versión
                firmable. Va `no-print`, que es la única forma de que la instrucción se
                cumpla sola y no dependa de que alguien se acuerde de borrarlo. */}
            <table className="no-print w-full border-collapse text-[12px] mb-4">
              <tbody>
                <tr>
                  <td className="border border-[#0a2a52] bg-[#fff2cc] px-2 py-1.5 align-middle w-[34%] font-bold text-[11px]">
                    CONTROL INTERNO - NO MOSTRAR EN VERSIÓN FIRMABLE
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1.5 align-top text-[11px] leading-snug">
                    Diligenciar cargo, dependencia, salario, horario y responsable jerárquico. Para este formato
                    el período de prueba se pacta expresamente por DOS (2) MESES y consta por escrito en la
                    cláusula novena. Antes de generar el contrato debe validarse si ya existió un vínculo laboral
                    con el mismo empleado(a); si existe, deberá verificarse si legalmente procede pactar período
                    de prueba.
                  </td>
                </tr>
                <Fila label="Jornada máxima" value={f.ciJornada} onChange={(v) => set('ciJornada', v)} area />
                <Fila label="Período de prueba" value={f.ciPeriodoPrueba} onChange={(v) => set('ciPeriodoPrueba', v)} area />
                <Fila label="Revisión de RIT y manual de funciones" value={f.ciRevisionRit} onChange={(v) => set('ciRevisionRit', v)} />
                <tr>
                  <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[34%] font-bold">Texto contractual</td>
                  <td className="border border-[#0a2a52] px-2 py-1 align-top text-[11px] leading-snug">
                    Conservar las cláusulas jurídicas de esta versión. PMO parametriza únicamente los campos
                    variables y conservar la denominación EL EMPLEADO(A) en toda la versión contractual.
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 className="text-center font-bold my-3">DATOS DE LA VINCULACIÓN</h2>

            <table className="w-full border-collapse text-[12px] bloque">
              <tbody>
                <Fila label="Empleador" value={f.empleador} onChange={(v) => set('empleador', v)} />
                <Fila label="NIT" value={f.nit} onChange={(v) => set('nit', v)} />
                <Fila label="Representante legal" value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} />
                <Fila label="Identificación representante legal" value={f.representanteCc} onChange={(v) => set('representanteCc', v)} />
                <Fila label="Domicilio empleador" value={f.domicilioEmpleador} onChange={(v) => set('domicilioEmpleador', v)} />
                <Fila label="Empleado(a)" value={f.empleado} onChange={(v) => set('empleado', v)} />
                <Fila label="Dirección / correo / celular" value={f.contacto} onChange={(v) => set('contacto', v)} />
                <Fila label="Lugar y fecha de nacimiento" value={f.nacimiento} onChange={(v) => set('nacimiento', v)} />
                <Fila label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
                <Fila label="Dependencia" value={f.dependencia} onChange={(v) => set('dependencia', v)} />
                <Fila label="Jefe inmediato" value={f.jefeInmediato} onChange={(v) => set('jefeInmediato', v)} />
                <Fila label="Salario básico mensual" value={f.salario} onChange={(v) => set('salario', v)} />
                <Fila label="Periodicidad de pago" value={f.periodicidadPago} onChange={(v) => set('periodicidadPago', v)} />
                <Fila label="Fecha de inicio" value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
                <Fila label="Horario ordinario" value={f.horario} onChange={(v) => set('horario', v)} />
                <Fila label="Período de prueba" value={f.periodoPrueba} onChange={(v) => set('periodoPrueba', v)} />
              </tbody>
            </table>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <div className="bloque">
                <TextoEd
                  k="i.comparecencia"
                  plantilla={'Entre los suscritos a saber, GLORIA LUCÍA ESCALANTE MANZANO, mayor de edad, '
                    + 'identificada con cédula de ciudadanía No. 66.651.423 expedida en El Cerrito, quien actúa '
                    + 'en calidad de representante legal de CANALES Y CONTACTOS S.A.S., identificada con NIT No. '
                    + '900.456.735-7, y para efectos del presente contrato se denominará LA EMPLEADORA; y, por '
                    + 'otra parte, [NOMBRE COMPLETO], mayor de edad, identificado(a) con cédula de ciudadanía No. '
                    + '[NÚMERO] expedida en [LUGAR], quien actúa en nombre propio y para efectos del presente '
                    + 'contrato se denominará EL EMPLEADO(A), hemos convenido celebrar el presente contrato '
                    + 'individual de trabajo a término indefinido, que se regirá por las siguientes cláusulas:'}
                />
              </div>

              {BLOQUES.map((b) => (
                <div key={b.k} className="bloque space-y-1">
                  <p><b>{b.titulo}:</b></p>
                  {b.parrafos.map((texto, i) => (
                    <TextoEd key={i} k={b.parrafos.length > 1 ? `${b.k}.${i + 1}` : b.k} plantilla={texto} />
                  ))}
                </div>
              ))}

              <div className="bloque">
                <TextoEd
                  k="i.constancia"
                  plantilla={'Para constancia se firma en Santiago de Cali, Valle del Cauca, el día XX (XX) de '
                    + 'XXX de dos mil XXX (202X), en dos ejemplares del mismo tenor y valor, uno de los cuales '
                    + 'recibe EL EMPLEADO(A).'}
                />
              </div>
            </div>

            {/* Firmas. La empleadora firma con nombre y empresa a secas —es la misma en
                todos los contratos—; el empleado sale de los datos de vinculación. */}
            <div className="grid grid-cols-2 gap-8 mt-12 text-[12px] bloque">
              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">GLORIA LUCÍA ESCALANTE MANZANO</p>
                  <p>Representante Legal</p>
                  <p>CANALES Y CONTACTOS S.A.S.</p>
                  <p>LA EMPLEADORA</p>
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  <FLine value={f.empleado} onChange={(v) => set('empleado', v)} bold />
                  <p className="flex items-baseline gap-1">
                    C.C. <FLine value={f.empleadoCc} onChange={(v) => set('empleadoCc', v)} ancho="w-[38%]" /> de{' '}
                    <FLine value={f.empleadoLugarCc} onChange={(v) => set('empleadoLugarCc', v)} ancho="w-[38%]" />
                  </p>
                  <p>EL EMPLEADO(A)</p>
                </div>
              </div>
            </div>
          </div>
          {/* «Revisó y aprobó», como la plantilla. */}
          <PieElaboracion etiqueta="Revisó y aprobó" />
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar este contrato. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

/**
 * Una fila de la ficha: etiqueta a la izquierda, dato a la derecha.
 *
 * La etiqueta va **siempre en negrita**. En el .docx cinco de las diecinueve celdas grises
 * quedaron sin negrita —Empleador, NIT, Representante legal, su identificación y
 * Empleado(a)—, pero es un descuido del archivo, no una distinción: son las mismas
 * etiquetas de la misma tabla, y en las otras cinco plantillas 2026 van todas en negrita.
 */
function Fila({ label, value, onChange, area, filas = 2 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  filas?: number;
}) {
  const comun = 'w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black ';
  return (
    <tr>
      <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[34%] font-bold">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={filas}
            className={comun + 'resize-y leading-snug'} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} className={comun} />
        )}
      </td>
    </tr>
  );
}

/** Renglón de un bloque de firma. */
function FLine({ value, onChange, bold, ancho }: {
  value: string; onChange: (v: string) => void; bold?: boolean; ancho?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={(ancho ?? 'w-full') + ' bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}
