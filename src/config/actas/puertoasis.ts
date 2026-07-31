import type { ActaConfig } from './types';

/**
 * Acta de Obras de Expansión No. 002-2025 — UT Alumbrado Público Puerto Asís (companyId 6).
 * Contrato de concesión No. 001 de 2015 (Licitación LP-01-2015). El CONTRATANTE es la
 * EAAAP E.S.P. (no un Alcalde). Las tablas de sectores/UCAPs las arma la página con los
 * datos reales de las obras; aquí va el texto del acta.
 *
 * Considerandos I–VI, cláusulas PRIMERA→DÉCIMA, garantías y firmantes están transcritos
 * literalmente del acta (págs. 1-10). Las tablas de sectores/UCAPs las arma la página con
 * los datos reales; todos los campos son editables en la UI antes de generar el Word.
 */
export const puertoasisConfig: ActaConfig = {
  insertTablesAfterClauseTitle: 'SÉPTIMA',
  consideracionNumeracion: 'roman',
  // RCE es el ítem "I." en este acta; el amparo de cumplimiento no lleva título numerado.
  garantiaRceTitle: 'I. GARANTÍA DE RESPONSABILIDAD CIVIL EXTRACONTRACTUAL:',
  showGarantiaRceExtraParagraphs: true,
  tituloLineas: [
    'SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE {{municipio}}',
    'CONTRATO DE CONCESIÓN No {{contrato}}',
    'ACTA DE OBRAS DE EXPANSIÓN No {{actaNumero}}',
    '({{actaFecha}})',
  ],
  docFields: {
    municipio: 'PUERTO ASÍS',
    municipioNombreCompleto: 'PUERTO ASÍS, PUTUMAYO',
    municipioNit: '800.111.304-2',
    contrato: '001 de 2015',
    tipoActa: 'ACTA DE OBRA',
    actaYear: '2025',
    actaFecha: '4 DE SEPTIEMBRE DE 2025',
    actaNumero: '002-2025',
    actaReferenciaAnterior: '002-2025',
    // Presupuesto oficial expresado en SMMLV (Cláusula Novena — garantía RCE).
    smmlvPresupuesto: '568.46',
    // CONTRATANTE: EAAAP E.S.P., representada por su Gerente General (no es un Alcalde).
    munNombre: 'OSDEIRY GÓMEZ NARVÁEZ',
    munCc: '1.087.752.922',
    munCcCiudad: 'Policarpa, Nariño',
    munCargo: 'Gerente General',
    munCargoFirma: 'Gerente General',
    munPosesionFecha: 'Acta de Posesión No. 035 del 16 de junio de 2025',
    munEntidad:
      'EMPRESA DE ACUEDUCTO, ALCANTARILLADO Y ASEO DEL MUNICIPIO DE PUERTO ASÍS E.S.P. — EAAAP E.S.P.',
    conNombre: 'GLORIA LUCÍA ESCALANTE MANZANO',
    conCc: '66.651.423',
    conCcCiudad: 'El Cerrito, Valle del Cauca',
    conEmpresa: 'UNIÓN TEMPORAL ALUMBRADO PÚBLICO PUERTO ASÍS',
    conEmpresaFirma: 'UTAP Puerto Asís',
    conNit: '900.918.887-1',
    intNombre: 'DANIELA FERNANDA SALINAS GONGORA',
    intCc: '1.117.554.708',
    intCcCiudad: '', // TODO VERIFICAR: ciudad de expedición de la cédula
    intEmpresa: 'INGENIO OBRAS SAS',
    intCargo: 'Representante Legal',
  },

  // Transcrito literal (pág. 1). En este acta la interventoría NO figura en las partes.
  partesIntroTemplate:
    'Entre los suscritos {{munNombre}}, mayor de edad, identificado con cédula de ciudadanía número {{munCc}} de {{munCcCiudad}}, quien obra en nombre y representación de la Empresa de Acueducto, Alcantarillado y Aseo del Municipio de Puerto Asís E.S.P., identificada tributariamente con el NIT. {{municipioNit}}, en su calidad de {{munCargo}}, de conformidad con el {{munPosesionFecha}}. En concordancia con la autorización expresa mediante Decreto N° 103 del 16 de junio de 2025, "por medio del cual se nombra al gerente de la Empresa de Acueducto, Alcantarillado y Aseo del Municipio de Puerto Asís", quien dentro del contrato de concesión del servicio de alumbrado público número {{contrato}} se denomina EAAAP E.S.P. y {{conNombre}}, mayor de edad, identificada con cédula de ciudadanía número {{conCc}} de {{conCcCiudad}}, quien actúa en calidad de Representante Legal de la {{conEmpresa}}, identificada tributariamente con NIT. {{conNit}}, quien dentro del mismo contrato aplica como EL CONCESIONARIO, hemos convenido suscribir la presente Acta de Obras de Expansión No. 02 de 2025 en el marco del contrato de concesión No. {{contrato}} y otro Sí No. 5 del 18 de noviembre de 2020, la cual se regirá por las siguientes cláusulas, previas las siguientes.',

  preAcuerdanText: 'Que, con fundamento en lo anterior, las partes',

  // Considerandos I–VI transcritos literal del acta (págs. 1-2).
  consideraciones: [
    'Que, LA EAAAP E.S.P. y EL CONCESIONARIO firmaron el contrato de concesión No. 01 de 2015 (de fecha 17 de diciembre de 2015, luego de que fue adjudicado mediante resolución No. 242 del 09 de diciembre de 2015, en el proceso administrativo de licitación LP-01-2015) cuyo objeto es: "Prestación del servicio de Alumbrado Público en Puerto Asís y la operación de la infraestructura correspondiente incluyendo el suministro, instalación, reemplazo, renovación, expansión y mantenimiento y de los accesorios eléctricos, y en fin todo lo inherente y relacionado con el servicio de alumbrado público en todo el territorio de Puerto Asís - Putumayo, de conformidad con los requisitos y condiciones establecidas en los pliegos de condiciones de la Licitación No. LP.001-2015 y la propuesta presentada por el concesionario. El concesionario dando total cumplimiento a todas las especificaciones técnicas, condiciones y obligaciones exigidas y emanadas de este proceso, la oferta y los términos de referencia de la licitación. El concesionario suministrara los bienes y prestara los servicios en las cantidades y la forma a continuación se especifica".',
    'Que el día cinco (5) de diciembre de 2016, se inició la ejecución del citado contrato, conforme a la suscripción del acta de inicio.',
    'Que de acuerdo con el Decreto 943 de 2018, el Alumbrado público es el servicio público no domiciliario que se presta con el objeto de proporcionar exclusivamente la iluminación de los bienes de uso público y demás espacios de libre circulación con tránsito vehicular o peatonal, dentro del perímetro urbano y rural de un municipio o distrito.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, operación, el mantenimiento, modernización, reposición y expansión del sistema de alumbrado público.',
    'Que, conforme al marco normativo expuesto, las partes suscribieron el Otro Sí No. 5 del 18 de noviembre de 2020, al contrato de concesión No. 01 de 2015 en el cual contrató así: CLÁUSULA PRIMERA: ADICIONESE el parágrafo cuarto a la cláusula novena del contrato de concesión No. 01 de 2015 así: "PARÁGRAFO CUARTO: En caso de que existan saldos de manera posterior a la aplicación mensual de la determinación de los costos Máximos de las Actividades de Inversión, Administración, Operación y Mantenimiento previstas en los Capítulos IV y V de la Resolución CREG 123 de 2011, el CONCEDENTE y el CONCESIONARIO, mediante acta, podrán autorizar la destinación directa de dichos saldos a la ejecución de las actividades de expansión del Servicio de Alumbrado Público".',
    'Que el artículo 2.1.2 de la resolución 40150 de 2024 por el cual se modifica el reglamento técnico de iluminación y alumbrado público – RETILAP, estipula la prohibición para la comercialización de los suministros de bombillas de sodio de alta presión después de un año de la entrada en vigencia de la resolución mencionada.',
  ],

  clausulas: [
    {
      title: 'CLÁUSULA PRIMERA — ALCANCE DE LAS OBRAS DE EXPANSIÓN A EJECUTAR',
      content:
        'La Unión Temporal Alumbrado Público Puerto Asís – UTAP ejecutará diferentes proyectos de iluminación en sectores urbanos y rurales del territorio del Municipio de Puerto Asís conforme con la presente acta de obras de expansión para lo cual utilizarán saldos del recaudo del impuesto de Alumbrado Público.',
    },
    {
      title: 'CLÁUSULA SEGUNDA — VALOR DEL PROYECTO DE ILUMINACIÓN',
      content:
        'El valor total del proyecto de iluminación es de OCHOCIENTOS NUEVE MILLONES DOSCIENTOS SESENTA Y SIETE MIL SEISCIENTOS DOCE PESOS CON CUARENTA Y CINCO CENTAVOS MONEDA CORRIENTE ($809.267.612,45) que corresponde al valor de las obras de expansión en la infraestructura del servicio de alumbrado público en los puntos previamente identificados con sus coordenadas (georeferenciación), con la salvedad de existencia de margen de error una vez se haga la instalación, indicados en el documento ANEXO 1, el cual forma parte integral del presente negocio jurídico, pertenecientes a los sectores urbanos y rurales del municipio de Puerto Asís que a continuación se relacionan:',
    },
    {
      title: 'CLÁUSULA TERCERA — FUENTE DE FINANCIAMIENTO',
      content:
        'Las obras y actividades del proyecto de expansión de luminarias del sistema de alumbrado público en los sectores urbanos y rurales del Municipio de Puerto Asís, indicados en la cláusula segunda del presente acuerdo, se ejecutarán con los saldos existentes en cuenta de fiducia que maneja el recaudo del impuesto de alumbrado público, determinados con corte a 31 de julio de 2025, según certificación del saldo de los recursos del impuesto de alumbrado público existentes en dicha fiducia, una vez descontada la aplicación mensual de la determinación de los costos máximos de las actividades de inversión, administración, operación y mantenimiento prevista en los capítulos IV y V de la Resolución CREG 123 de 2011, o Norma que la modifique o reemplace, expedida por LA INTERVENTORÍA y que corresponde al documento denominado Anexo 2, el cual hace parte integral del presente acuerdo jurídico.',
    },
    {
      title: 'CLÁUSULA CUARTA — ESPECIFICACIONES TÉCNICAS',
      content:
        'Las obras y actividades del proyecto de expansión del sistema de alumbrado público en los sectores urbanos y rurales del Municipio de Puerto Asís, indicados en la cláusula segunda del presente acuerdo, se llevarán a cabo con luminarias led de 35W y 80W, brazos galvanizados en caliente, postes en fibra de vidrio de 9 m y cable aislado en aluminio #6, conforme las especificaciones técnicas de los materiales a instalar descritos en el documento ANEXO 3 ESPECIFICACIONES, ofertadas por el concesionario y avaladas por la interventoría, el cual hace parte integral del presente negocio jurídico.',
    },
    {
      title: 'CLÁUSULA QUINTA — FORMA DE PAGO',
      content:
        'La EAAAP E.S.P. pagará al CONCESIONARIO, el valor de las obras de expansión objeto de la presente acta, acordado en la cláusula segunda, de la siguiente manera: 1) Un primer pago a título de anticipo, equivalente al 50% del valor total de la presente acta de obra de expansión número 02 de 2025, previa constitución y aprobación de la garantía única de cumplimiento que ampare el riesgo de buen manejo del mismo; 2) Un segundo pago equivalente al 50% del valor total de la presente acta de obras de expansión número 02 de 2025 una vez entregadas y recibidas a entera satisfacción de la interventoría la totalidad de las obras contratadas.',
    },
    {
      title: 'CLÁUSULA SEXTA — OPERACIÓN Y MANTENIMIENTO',
      content:
        'A cargo de la Unión Temporal Alumbrado Público de Puerto Asís — UTAP en el marco del contrato de concesión No. 001 del 2015 y el Otrosí No. 5 del 18 de noviembre de 2020.',
    },
    {
      title: 'CLÁUSULA SÉPTIMA — VALOR PRESUPUESTOS DE OBRAS',
      content:
        'Los valores que conforman el presupuesto corresponden a las UCAPs aceptadas por la EAAAP y aprobadas mediante la presente acta de obras de expansión, calculadas según cuadro explicativo de la estructura de costos de las unidades objeto de expansión debidamente validadas por la interventoría, contenido en el documento ANEXO 1, el cual hace parte integral del presente negocio jurídico, así:',
    },
    {
      title: 'CLÁUSULA OCTAVA — PLAZO DE EJECUCIÓN',
      content:
        'El plazo para la ejecución de los proyectos de iluminación de Alumbrado Público contemplados en la presente acta de obra es de seis (6) meses, contado a partir de la suscripción del acta de inicio.',
    },
    {
      title: 'CLÁUSULA NOVENA — GARANTÍAS',
      content:
        'EL CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor de EAAAP E.S.P. a través de cualquiera de los mecanismos de cobertura del riesgo permitidos por el Decreto 1082 de 2015.',
    },
    {
      title: 'CLÁUSULA DÉCIMA — PERFECCIONAMIENTO, LEGALIZACIÓN Y EJECUCIÓN',
      content:
        'La presente acta se considerará perfeccionada con la suscripción de presente documento por cada una de las partes, legalizada con el acta de aprobación de las pólizas y aprobación del anticipo y en ejecución con la suscripción del acta de inicio.\n\nEn constancia de aceptación se firma por las partes en dos (2) ejemplares al mismo tenor el día 4 de septiembre de 2025.',
    },
  ],
};
