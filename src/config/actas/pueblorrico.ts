import type { ActaConfig } from './types';

export const pueblorricoConfig: ActaConfig = {
  hideMunicipioBanner: true,
  // El documento numera las consideraciones 1., 2., … 12.; por defecto irían en
  // romanos.
  consideracionNumeracion: 'decimal',
  docFields: {
    municipio: 'PUEBLORRICO',
    municipioNombreCompleto: 'PUEBLORRICO ANTIOQUIA',
    municipioNit: '890981105-2',
    contrato: '001-2022',
    tipoActa: '',
    actaYear: String(new Date().getFullYear()),
    actaFecha: '',
    actaNumero: '',
    actaReferenciaAnterior: '',
    smmlvPresupuesto: '',
    munNombre: 'CRISTIAN CAMILO ZAPATA RAMIREZ',
    munCc: '1.039.421.406',
    munCcCiudad: 'Pueblorrico',
    munCargo: 'Alcalde',
    // En la comparecencia firma como «Alcalde»; al pie del acta, como «Alcalde
    // Municipal». Son los dos rótulos del documento, no una corrección.
    munCargoFirma: 'Alcalde Municipal',
    munPosesionFecha: '30 de diciembre de 2023',
    conNombre: 'GLORIA LUCIA ESCALANTE MANZANO',
    conCc: '66.651.423',
    conCcCiudad: 'Cali Valle del Cauca',
    conCargoFirma: 'Representante Legal Suplente',
    conEmpresa: 'CANALES Y CONTACTOS S.A.S.',
    conNit: '900.456.735-7',
    intNombre: 'SOFONÍAS BANGUERO ZAPATA',
    intCc: '19.380.232',
    intCcCiudad: 'Bogotá',
    intEmpresa: 'INGENIERÍA Y SOPORTE S.B.Z S.A.S',
    intCargo: 'Representante Legal',
  },

  consideraciones: [
    'Que el artículo 2 de la Constitución Política de Colombia de 1991 señala que son fines esenciales del Estado: Servir a la comunidad, promover la prosperidad general y garantizar la efectividad de los principios, derechos y deberes consagrados en la constitución.',
    'Que de conformidad con el artículo 315 de la carta política de Colombia, corresponde a los alcaldes cumplir y hacer cumplir la constitución, la ley, los decretos del gobierno, las ordenanzas, los acuerdos de los concejos y dirigir la acción administrativa del municipio; asegurar el cumplimiento de las funciones y la prestación de los servicios a su cargo, en concordancia con el artículo 941 de la Ley 136 de 1994 modificado por el artículo 29 de la ley 1551 de 2012.',
    'Que el artículo 365 de la Constitución Política señala que los servicios públicos son inherentes a la finalidad social del Estado, debiendo garantizar su prestación eficiente a todos los habitantes del territorio nacional.',
    'Que EL MUNICIPIO abrió proceso de licitación pública No 002 de 2022 para contratar mediante el sistema de CONCESIÓN, la prestación del servicio de Inversión, Administración, Operación, Mantenimiento, Reposición, Expansión y Desarrollo Tecnológico asociado al sistema de alumbrado público del Municipio de Pueblorrico, suministrando el CONCESIONARIO a pleno costo los elementos, y asumiendo en fin, todo lo inherente y relacionado con el servicio de Alumbrado Público en todo el territorio del Municipio, a cambio de la remuneración pactada por las partes.',
    'Que EL MUNICIPIO adjudicó al CONCESIONARIO dicha licitación mediante Resolución No. 3.0.29.10-132 del veintinueve (29) de julio de 2022.',
    'Que, adjudicado el proceso de licitación, EL MUNICIPIO y EL CONCESIONARIO firmaron el contrato de concesión No. 01 de 2022 de fecha 11 de agosto de 2022.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, la operación, el mantenimiento, la modernización, la reposición y la expansión del sistema de alumbrado público.',
    'Que el artículo 350 del Estatuto Tributario Ley 1819 de 2016 dispone que el Impuesto de alumbrado público, como actividad inherente al servicio de energía eléctrica, se destina exclusivamente a la prestación, mejora, modernización y ampliación de la prestación del servicio de alumbrado público, incluyendo el suministro, administración, operación, mantenimiento, expansión y desarrollo tecnológico asociado.',
    'Que con base en la anterior autorización, en el contrato de Concesión No 001 de 2022 se encuentra el literal c) de la CLÁUSULA TERCERA, OBLIGACIONES DE LAS PARTES: 1) POR PARTE DEL CONTRATISTA que dice: "... La Expansión vegetativa anual del 1% a que se refiere la oferta aceptada por LA CONTRATANTE, o cualquier otra adicional que se requiera, se realizará siempre y cuando existan recursos disponibles para remunerar al Concesionario por ella, para lo cual las partes y el interventor, suscribirán las actas respectivas."',
    'El desarrollo de tales actividades dependerá de la existencia de recursos suficientes para ellas, y para su realización solo requerirá de actas firmadas para el efecto, por el Municipio, la Interventoría y el Concesionario.',
    'Que en el comité técnico mensual del 26 de septiembre de 2024 se presentaron los diferentes proyectos de expansión, cantidades y presupuestos, en el cual la administración municipal aprobó los proyectos que se describen en el presente documento con los valores determinados para ello.',
    'Que El Municipio cuenta con los recursos necesarios para la ejecución de la obra de expansión, según los excedentes a favor del Municipio de Pueblorrico que se encuentran en la cuenta de la Fiducia del Banco de Bogotá y la destinación para la expansión por valor de VEINTITRES MILLONES QUINIENTOS CINCUENTA Y UN MIL SEISCIENTOS CINCUENTA Y OCHO PESOS MONEDA LEGAL ($23.551.658,28) M/CTE.',
  ],

  // Cierra las consideraciones y entra a ACUERDAN. No es una consideración más:
  // en el documento va sin numerar, y numerada quedaba como la número 13 y con
  // su propio botón de borrar.
  preAcuerdanText: 'Que con fundamento en lo anterior, las partes',

  // Las tablas del presupuesto van después de la SÉPTIMA, que es la que las
  // anuncia («…aprobadas mediante la presente Acta de Obra así:»), y antes de la
  // OCTAVA. Sin esto se insertan tras la CUARTA, que es el valor por defecto.
  insertTablesAfterClauseTitle: 'SÉPTIMA',

  // Los amparos del acta de Pueblorrico se calculan sobre el CONTRATO, no sobre
  // el acta de autorización como en los demás municipios, y el del anticipo se
  // llama distinto. Con el texto por defecto la tabla diría algo que la póliza
  // no dice.
  garantiaAmparos: [
    {
      amparo: 'CUMPLIMIENTO DEL CONTRATO.',
      porcentaje: '10% del valor total del contrato.',
      vigencia: 'Por el plazo de ejecución del contrato y tres (3) meses más, contados a partir de la fecha de perfeccionamiento del contrato.',
    },
    {
      amparo: 'CORRECTA INVERSIÓN Y BUEN MANEJO DEL ANTICIPO.',
      porcentaje: '100% del valor total del contrato',
      vigencia: 'Por el 100% del valor pagado de manera anticipada por parte del municipio, la cual tendrá una vigencia por el término de duración de la presente acta.',
    },
  ],
  // El acta cierra en la tabla de cumplimiento: no exige póliza de
  // responsabilidad civil extracontractual.
  showGarantiaRce: false,

  clausulas: [
    {
      title: 'CLÁUSULA PRIMERA — OBJETO',
      content: '"EJECUTAR POR PARTE DE LA EMPRESA CANALES Y CONTACTOS LAS OBRAS DE EXPANSIÓN EN LOS SECTORES VEREDA LA ENVIDIA, BARRIO AGUACATAL, BARRIO CASA DE LA CULTURA, BARRIO CUATRO ESQUINAS, BARRIO SAN ANTONIO Y BARRIO EL RETÉN."',
    },
    {
      title: 'CLÁUSULA SEGUNDA — VALOR DEL PROYECTO',
      content: 'El valor total del proyecto de la expansión es de VEINTITRÉS MILLONES QUINIENTOS CINCUENTA Y UN MIL SEISCIENTOS CINCUENTA Y OCHO PESOS MONEDA LEGAL ($23.551.658,28) M/CTE así:',
    },
    {
      // Va como bloque aparte y no dentro de la SEGUNDA: en el documento tiene su
      // propio título en negrita, igual que en Guacarí.
      title: 'PARÁGRAFO — FUENTE DE FINANCIAMIENTO',
      content: 'El proyecto de expansión para iluminación del sistema de alumbrado público en el municipio de Pueblorrico se ejecutará con los excedentes del recaudo de Alumbrado Público, determinados con corte a 31 de agosto de 2024.',
    },
    {
      title: 'CLÁUSULA TERCERA — ALCANCE DE LAS OBRAS A EJECUTAR',
      content: 'Realizar las obras de expansión y puesta en funcionamiento en los sectores VEREDA LA ENVIDIA, BARRIO AGUACATAL, BARRIO CASA DE LA CULTURA, BARRIO CUATRO ESQUINAS, BARRIO SAN ANTONIO Y BARRIO EL RETÉN.',
    },
    {
      title: 'CLÁUSULA CUARTA — ESPECIFICACIONES TÉCNICAS',
      content: 'El proyecto de iluminación se realizará con Luminarias de 35W, Proyectores de 130W, Con postes de fibra de vidrio 9°510 KG y con Cable Red Triplex 2x4+4 Neutro Desnudo, para las acometidas y conexiones aéreas en la infraestructura de Alumbrado Público que determina la CREG 123 de 2011.',
    },
    {
      title: 'CLÁUSULA QUINTA — OPERACIÓN Y MANTENIMIENTO',
      content: 'A cargo del CONCESIONARIO en el marco de la propuesta que hace parte del presente documento y del contrato de Concesión No 001 de 2022.',
    },
    {
      title: 'CLÁUSULA SEXTA — FORMA DE PAGO',
      content: 'El MUNICIPIO pagará al CONCESIONARIO el valor total de la presente acta de Obra No 1, a la firma del acta de inicio con excedentes del impuesto de alumbrado público correspondiente a la vigencia 2026, la suma de VEINTITRÉS MILLONES QUINIENTOS CINCUENTA Y UN MIL SEISCIENTOS CINCUENTA Y OCHO PESOS MONEDA LEGAL ($23.551.658,28 M/L), previa aprobación de garantías y expedición del registro presupuestal.',
    },
    {
      title: 'CLÁUSULA SÉPTIMA — VALORES PRESUPUESTOS DE EXPANSIÓN',
      content: 'Los valores que conforman el presupuesto corresponden a las UCAPs aceptadas por el Municipio dentro de la oferta económica y las nuevas UCAPs aprobadas mediante la presente Acta de Obra así:',
    },
    {
      title: 'CLÁUSULA OCTAVA — PLAZO DE EJECUCIÓN',
      content: 'El plazo para la ejecución de los proyectos de Iluminación contemplados en la presente Acta de Obra es de ciento veinte (120) días contados a partir de la firma del acta de iniciación.',
    },
    {
      // El título lleva GARANTÍAS porque es lo que dispara la tabla de amparos.
      title: 'CLÁUSULA NOVENA — GARANTÍAS',
      content: 'EL CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor del Municipio a través de cualquiera de los mecanismos de cobertura de riesgo permitidos por el Decreto 1082 de 2015.',
    },
    {
      // El documento la rotula «OCTAVA» por segunda vez; va como DÉCIMA para que
      // el acta no quede con dos cláusulas octavas.
      title: 'CLÁUSULA DÉCIMA — PERFECCIONAMIENTO, LEGALIZACIÓN',
      content: 'La presente acta se considerará perfeccionada con la suscripción de presente documento por cada una de las partes, legalizada con el acta de aprobación de las pólizas y expedición del registro presupuestal.\n\nPara constancia se firma por las partes en dos (2) ejemplares al mismo tenor al primer (1) día del mes de Octubre de 2024.',
    },
  ],
};
