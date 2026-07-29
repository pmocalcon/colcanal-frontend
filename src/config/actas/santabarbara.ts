import type { ActaConfig } from './types';

/**
 * Acta de Obra No 01-2026 — UT Alumbrado Público Santa Bárbara (companyId 8).
 * Contrato de concesión LP 002-2022. Las tablas de sectores/UCAPs las arma la
 * página con los datos reales de las obras; aquí va el texto del acta.
 */
export const santabarbaraConfig: ActaConfig = {
  insertTablesAfterClauseTitle: 'SÉPTIMA',
  consideracionNumeracion: 'decimal',
  garantiaCumplimientoTitle: 'I. GARANTÍA DE CUMPLIMIENTO DEL CONTRATO Y DEVOLUCIÓN DEL PAGO ANTICIPADO:',
  garantiaRceTitle: 'II. GARANTÍA DE RESPONSABILIDAD CIVIL EXTRACONTRACTUAL:',
  tituloLineas: [
    'SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE {{municipio}}',
    'CONTRATO DE CONCESIÓN No {{contrato}}',
    'ACTA DE OBRA No {{actaNumero}}',
    '({{actaFecha}})',
  ],
  docFields: {
    municipio: 'SANTA BÁRBARA',
    municipioNombreCompleto: 'SANTA BÁRBARA, ANTIOQUIA',
    municipioNit: '890.980.344-1',
    contrato: 'LP 002-2022',
    tipoActa: 'ACTA DE OBRA',
    actaYear: '2026',
    actaFecha: 'XX DE MARZO DE 2026',
    actaNumero: '01-2026',
    actaReferenciaAnterior: '01-2026',
    // Presupuesto en SMMLV (verificar contra el acta): $57.629.710 / SMMLV.
    smmlvPresupuesto: '40.48',
    munNombre: 'JORGE MARIO QUINTANA CAÑAVERAL',
    munCc: '15.338.145',
    munCcCiudad: 'Santa Bárbara, Antioquia',
    munCargo: 'Alcalde',
    munCargoFirma: 'Alcalde Municipal',
    munPosesionFecha: '01 de enero de 2024',
    munEntidad: 'MUNICIPIO DE SANTA BÁRBARA',
    conNombre: 'GONZALO GARCÉS LLOREDA',
    conCc: '14.972.154',
    conCcCiudad: 'Cali Valle del Cauca',
    conEmpresa: 'UNIÓN TEMPORAL ALUMBRADO PÚBLICO SANTA BÁRBARA',
    conEmpresaFirma: 'UTAP Santa Bárbara',
    conNit: '',
    intNombre: 'SOFONÍAS BANGUERO ZAPATA',
    intCc: '10.380.232',
    intCcCiudad: 'Bogotá',
    intEmpresa: 'INGENIERÍA Y SOPORTE S.B.Z S.A.S',
    intCargo: 'Representante Legal',
  },

  partesIntroTemplate:
    'Entre los suscritos {{munNombre}}, mayor de edad, identificado con cédula de ciudadanía No. {{munCc}} de {{munCcCiudad}}, quien obra en nombre y representación del MUNICIPIO DE {{municipio}}, en su calidad de {{munCargo}}, y de conformidad con las facultades legalmente conferidas para contratar mediante el sistema de CONCESIÓN, según consta en el acta de posesión del {{munPosesionFecha}} y en los numerales 1 y 3, literal l) de la Ley 80 de 1993, quien en adelante para los efectos del presente documento se denominará EL MUNICIPIO, y {{conNombre}}, mayor de edad, identificado con cédula de ciudadanía No. {{conCc}} de {{conCcCiudad}}, quien actúa en nombre y representación de la {{conEmpresa}}, quien en adelante para los efectos del presente documento se denominará EL CONCESIONARIO, y {{intNombre}}, mayor de edad, identificado con cédula de ciudadanía No. {{intCc}} de {{intCcCiudad}}, quien actúa en calidad de representante legal de {{intEmpresa}} y Director de Interventoría del Contrato de Concesión, hemos convenido suscribir la presente Acta de Obra No. {{actaNumero}} para la realización de las obras de expansión en diferentes sectores de la zona rural del municipio de {{municipio}} en el año {{actaYear}}, en el marco del contrato de concesión No. {{contrato}}, cuyo objeto es: Contrato de concesión para la prestación del servicio de alumbrado público incluidas las actividades de suministro, instalación, reposición, repotenciación (modernización), adecuación, mantenimiento, operación, expansión y administración de la infraestructura del servicio de alumbrado público en la zona urbana y rural del municipio de Santa Bárbara, departamento de Antioquia, la cual se regirá por las siguientes cláusulas, previas las siguientes.',

  preAcuerdanText: 'Que, con fundamento en lo anterior, las partes',

  consideraciones: [
    'Que el artículo 2 de la Constitución Política de Colombia de 1991 señala que son fines esenciales del Estado, servir a la comunidad, promover la prosperidad general y garantizar la efectividad de los principios, derechos y deberes consagrados en la constitución.',
    'Que conforme con el artículo 315 de la carta política de Colombia, corresponde a los alcaldes cumplir y hacer cumplir la constitución, la ley, los decretos del gobierno, las ordenanzas, los acuerdos de los concejos y dirigir la acción administrativa del municipio; asegurar el cumplimiento de las funciones y la prestación de los servicios a su cargo, en concordancia con el artículo 941 de la Ley 136 de 1994 modificado por el artículo 29 de la ley 1551 de 2012.',
    'Que el artículo 365 de la Constitución Política señala que los servicios públicos son inherentes a la finalidad social del Estado, debiendo garantizar su prestación eficiente a todos los habitantes del territorio nacional.',
    'Que el Municipio abrió proceso de licitación pública No LP-002 de 2022 para contratar mediante el sistema de CONCESIÓN, la inversión, administración, operación, mantenimiento, reposición, repotenciación (modernización), expansión y desarrollo tecnológico asociado al sistema de alumbrado público del Municipio de Santa Bárbara, suministrando el CONCESIONARIO a pleno costo los elementos, materiales, equipos y accesorios que requiera la rehabilitación, repotenciación y ampliación del sistema, según cantidades definidas en los Pliegos de Condiciones y asumiendo, en fin, todo lo inherente y relacionado con el servicio de Alumbrado Público en todo el territorio del Municipio, a cambio de la remuneración pactada por las partes.',
    'Que el Municipio adjudicó al CONCESIONARIO dicha licitación mediante acta de adjudicación No. 319 del 30 de noviembre de 2022.',
    'Que, adjudicada la licitación, el MUNICIPIO y el CONCESIONARIO firmaron el contrato de concesión No. LP 002-2022 de fecha 02 de diciembre de 2022.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, la operación, el mantenimiento, la modernización, la reposición y la expansión del sistema de alumbrado público.',
    'Que el artículo 350 del Estatuto Tributario Ley 1819 de 2016 dispone que el impuesto de alumbrado público, como actividad inherente al servicio de energía eléctrica, se destina exclusivamente a la prestación, mejora, modernización y ampliación de la prestación del servicio de alumbrado público, incluyendo el suministro, administración, operación, mantenimiento, expansión y desarrollo tecnológico asociado, entre otras acciones que permite la realización de actividades de ornato y alumbrado navideño.',
    'Que, con base en la anterior autorización, en el contrato de concesión se incluyó la CLÁUSULA TERCERA: OBLIGACIONES DE LAS PARTES: Por parte del Contratista, el numeral tercero contempla: "La expansión vegetativa anual del 1% a que se refiere la oferta aceptada por LA CONTRATANTE, o cualquier otra adicional que se requiera, se realizará siempre y cuando existan recursos disponibles para remunerar al Concesionario por la misma, para lo cual las partes, y el interventor, suscribirán las actas respectivas."',
    'Que de conformidad con la CLÁUSULA SÉPTIMA: OBLIGACIONES DE LAS PARTES: Por parte del Contratista, el numeral catorce (14) contempla: "Ejecutar dentro del componente de inversión, los proyectos de expansión de la infraestructura de iluminación y obras asociadas que el contratante indique."',
    'Que el desarrollo de estas actividades dependerá de la existencia de recursos suficientes para ellas, y para su realización solo requerirá de actas firmadas para el efecto, por el Municipio, la Interventoría y el Concesionario.',
  ],

  clausulas: [
    { title: 'CLÁUSULA PRIMERA — OBJETO', content: 'Ejecutar por parte de la empresa Unión Temporal Alumbrado Público Santa Bárbara, las obras de expansión con saldos disponibles en los sectores Vereda La Liboriana Camino por la Cerrajería, Corregimiento de Damasco Sector El Cementerio, Vereda Camino a la Planta y en el Corregimiento de Versalles Calle Placa Polideportiva.' },
    { title: 'CLÁUSULA SEGUNDA — VALOR DEL PROYECTO', content: 'El valor total del proyecto de la expansión con saldos disponibles es de CINCUENTA Y SIETE MILLONES SEISCIENTOS VEINTINUEVE MIL SETECIENTOS DIEZ PESOS ($57.629.710) M/CTE, así:' },
    { title: 'PARÁGRAFO — FUENTE DE FINANCIAMIENTO', content: 'El proyecto de expansión para iluminación en el sistema de alumbrado público de los diferentes sectores determinados en el municipio de Santa Bárbara se ejecutará con los saldos disponibles del recaudo de Alumbrado Público, determinados con corte a 28 de febrero de 2026.' },
    { title: 'CLÁUSULA TERCERA — ALCANCE DE LAS OBRAS A EJECUTAR', content: 'Realizar las obras de expansión y puesta en funcionamiento en los sectores donde se llevará a cabo la expansión correspondiente, esto es: Vereda La Liboriana Camino por la Cerrajería, Corregimiento de Damasco Sector El Cementerio, Vereda Camino a la Planta y en el Corregimiento de Versalles Calle Placa Polideportiva.' },
    { title: 'CLÁUSULA CUARTA — ESPECIFICACIONES TÉCNICAS', content: 'El proyecto de iluminación se realizará con luminarias led de 35W, luminarias led de 80W, brazos galvanizados, postes en fibra de vidrio de 9 m x 510 Kg y red de aluminio aislado #4 aéreo.' },
    { title: 'CLÁUSULA QUINTA — OPERACIÓN Y MANTENIMIENTO', content: 'A cargo del CONCESIONARIO en el marco de la propuesta que hace parte del presente documento y del contrato de Concesión No. LP 002 de 2022.' },
    { title: 'CLÁUSULA SEXTA — FORMA DE PAGO', content: 'El MUNICIPIO pagará al CONCESIONARIO el valor total de la presente Acta de Obra No 1, a la firma del acta de inicio con los saldos disponibles del impuesto de alumbrado público, la suma de CINCUENTA Y SIETE MILLONES SEISCIENTOS VEINTINUEVE MIL SETECIENTOS DIEZ PESOS ($57.629.710) M/CTE, previa aprobación de garantías.' },
    { title: 'CLÁUSULA SÉPTIMA — VALORES PRESUPUESTOS DE EXPANSIÓN CON SALDOS DEL IMPUESTO', content: 'Los valores que conforman el presupuesto corresponden a las UCAPs, aceptadas por el Municipio dentro de la oferta económica mediante la presente Acta de Obra, así:' },
    { title: 'CLÁUSULA OCTAVA — PLAZO DE EJECUCIÓN', content: 'El plazo para la ejecución de los proyectos de iluminación contemplados en la presente Acta de Obra es de noventa (90) días hábiles contados a partir del inicio de ejecución de las obras, esto cuando se suscriba el acta de inicio.' },
    { title: 'CLÁUSULA NOVENA — GARANTÍAS', content: 'El CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor del Municipio a través de cualquiera de los mecanismos de cobertura de riesgo permitidos por el Decreto 1082 de 2015.' },
    { title: 'CLÁUSULA DÉCIMA — PERFECCIONAMIENTO, LEGALIZACIÓN', content: 'La presente acta se considerará perfeccionada con la suscripción del presente documento por cada una de las partes, legalizada con el acta de aprobación de las pólizas y la expedición del registro presupuestal, y en ejecución con la suscripción del acta de inicio.\n\nPara constancia se firma por las partes en dos (2) ejemplares al mismo tenor a los XX (XX) días del mes de marzo (03) de dos mil veintiséis (2026).' },
  ],
};
