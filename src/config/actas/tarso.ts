import type { ActaConfig } from './types';

const objetoContrato =
  'INVERSIÓN, ADMINISTRACIÓN, OPERACIÓN, MANTENIMIENTO, REPOSICIÓN, EXPANSIÓN Y DESARROLLO TECNOLÓGICO ASOCIADO AL SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE TARSO';

export const tarsoConfig: ActaConfig = {
  hideMunicipioBanner: true,
  consideracionNumeracion: 'decimalDash',
  tituloLineas: [
    'DOCUMENTO DE APROBACIÓN No {{actaNumero}} DE EXPANSIÓN DEL S.A.L.P.',
    'CONTRATO DE CONCESIÓN No. {{contrato}}',
  ],
  docFields: {
    municipio: 'TARSO',
    municipioNombreCompleto: 'TARSO ANTIOQUIA',
    municipioNit: '890.982.583-4',
    contrato: '185 - 2022',
    tipoActa: 'DOCUMENTO DE APROBACIÓN No 01-2026 DE EXPANSIÓN DEL S.A.L.P.',
    actaYear: '2026',
    actaFecha: '',
    actaNumero: '01-2026',
    actaReferenciaAnterior: '01-2026',
    smmlvPresupuesto: '117',
    munNombre: 'HUGO ALEXANDER OCAMPO RIOS',
    munCc: '98.454.207',
    munCcCiudad: 'Tarso, Antioquia',
    munCargo: 'alcalde',
    munCargoFirma: 'Alcalde Municipal',
    munPosesionFecha: '30 de diciembre de 2023',
    munDireccion: 'Carrera 20 No. 20 - 08. Tarso, Antioquia',
    munEntidad: 'Municipio de Tarso',
    conNombre: 'GLORIA LUCÍA ESCALANTE MANZANO',
    conCc: '66.651.423',
    conCcCiudad: '',
    conCargoFirma: 'Representante Legal Suplente',
    conEmpresa: 'CANALES Y CONTACTOS SAS',
    conNit: '900.456.735-7',
    conDireccion: 'Cra. 19 #18-77, Sector el Parque',
    intNombre: 'SOFONIAS BANGUERO ZAPATA',
    intCc: '19.380.232',
    intCcCiudad: '',
    intEmpresa: 'INGENIERIA Y SOPORTE S.B.Z S.A.S',
    intNit: '900.106.742-8',
    intDireccion: 'Cra. 101A No. 99-20, Apartadó',
    intCargo: 'Representante Legal',
  },

  encabezadoTabla: [
    {
      label: 'OBJETO:',
      value: objetoContrato,
    },
    {
      label: 'OBJETO DE ESTE DOCUMENTO',
      value: 'EXPANSIÓN DEL SISTEMA DE A.P.',
    },
    {
      label: 'CONTRATANTE:\nNIT.:\nDIRECCIÓN:',
      value: 'MUNICIPIO DE TARSO\n890.982.583-4\nCarrera 20 No. 20 - 08. Tarso, Antioquia',
    },
    {
      label: 'CONTRATISTA:\nNIT.\nDIRECCIÓN:',
      value: 'CANALES Y CONTACTOS SAS\n900.456.735-7\nCra. 19 #18-77, Sector el Parque',
    },
    {
      label: 'INTERVENTORÍA:\nNIT.\nDIRECCIÓN:',
      value: 'INGENIERIA Y SOPORTE S.B.Z SAS\n900.106.742-8\nCra. 101A No. 99-20, Apartadó',
    },
    {
      label: 'VALOR ESTIMADO EXPANSIÓN:',
      value: '{{VALOR_TOTAL}}',
    },
    {
      label: 'VALOR ACTA DE EXPANSIÓN',
      value: '{{VALOR_TOTAL}}',
    },
    {
      label: 'PLAZO DE EJECUCIÓN:',
      value: '90 DÍAS HÁBILES',
    },
  ],

  partesIntroTemplate:
    'Entre los suscritos {{munNombre}}, identificado con la cédula de ciudadanía No. {{munCc}} expedida en {{munCcCiudad}}, en calidad de alcalde y representación legal del MUNICIPIO DE {{municipio}}, con autorización para contratar contenida en el Acta de Posesión del {{munPosesionFecha}}, en cumplimiento de sus funciones administrativas que le confieren la representación legal de esta entidad. {{conNombre}}, identificada con la cédula de ciudadanía No {{conCc}}, obrando como representante legal suplente de la Sociedad {{conEmpresa}} en calidad de Contratista, por medio de este documento hemos acordado la realización de expansión del Sistema de Alumbrado Público del Municipio de {{municipio}}, previas las siguientes',

  consideraciones: [
    'Que las partes suscribieron el contrato de la referencia, que tiene como Objeto, Concesión en exclusividad de la prestación del servicio de Alumbrado Público incluidas las Actividades de Inversión, Administración, Operación, Mantenimiento, Modernización, Reposición y Expansión del Sistema de Alumbrado Público, así como del suministro e instalación de luminarias y accesorios eléctricos, el suministro de repuestos necesarios para la modernización y expansión de la infraestructura del alumbrado público municipal, la planeación y ejecución de los desarrollos tecnológicos asociados al sistema y el acompañamiento en la compra de energía con destino al sistema de alumbrado público municipal.',
    'Que los diseños eléctricos y fotométricos de la infraestructura de alumbrado público a instalarse en estas vías y parques serán elaborados por el Concesionario, y deberán ser aprobados por la interventoría de este contrato, tal como lo expresa el contrato C-INTERVENTORIA N°186-2022 en su cláusula Sexta Obligaciones de las Partes: Por parte del Contratista - numeral 14. Revisar los estudios y diseños de Retie y Retilap que realice el operador del servicio.',
    'El Comité técnico entre la Interventoría, la Supervisión del Contrato revisaron el presupuesto de obra, conceptuando que el valor unitario de cada uno de los ítems adicionales corresponde a los precios de referencia fijados en el contrato de Concesión, actualizados de acuerdo con el índice de precios al Productor, que fueron debidamente analizados, encontrándolos justificados, siendo aprobado.',
    'Que el artículo 2 de la Constitución Política de Colombia de 1991 señala que son fines esenciales del Estado: Servir a la comunidad, promover la prosperidad general y garantizar la efectividad de los principios, derechos y deberes consagrados en la constitución.',
    'Que de conformidad con el artículo 315 de la carta política de Colombia, corresponde a los alcaldes cumplir y hacer cumplir la constitución, la ley, los decretos del gobierno, las ordenanzas, los acuerdos de los concejos y dirigir la acción administrativa del municipio; asegurar el cumplimiento de las funciones y la prestación de los servicios a su cargo, en concordancia con el artículo 941 de la Ley 136 de 1994 modificado por el artículo 29 de la Ley 1551 de 2012.',
    'Que el artículo 365 de la Constitución Política señala que los servicios públicos son inherentes a la finalidad social del Estado, debiendo garantizar su prestación eficiente a todos los habitantes del territorio nacional.',
    'Que el concejo Municipal de Tarso mediante Acuerdo 004 del 11 de abril de 2022 autoriza al Alcalde del Municipio de TARSO, para que entregue en concesión la prestación del servicio no domiciliario de Alumbrado Público, de acuerdo con los lineamientos de las Leyes 80 de 1993 y 1150 de 2007, por un término inicial máximo de veinticinco (25) años.',
    'Que EL MUNICIPIO abrió proceso de licitación pública No 01 de 2022 para contratar mediante el sistema de CONCESIÓN, la prestación de servicio de Inversión, Administración, Operación, Mantenimiento, Reposición, Expansión y Desarrollo Tecnológico asociado al sistema de alumbrado público del Municipio de Tarso, suministrando el CONCESIONARIO a pleno costo los elementos, y asumiendo en fin, todo lo inherente y relacionado con el servicio de Alumbrado Público en todo el territorio del Municipio, a cambio de la remuneración pactada por las partes.',
    'Que EL MUNICIPIO adjudicó al CONCESIONARIO dicha licitación mediante Resolución No. 210 del primero (1) de agosto de 2022.',
    'Que, adjudicado el proceso de licitación, EL MUNICIPIO y EL CONCESIONARIO firmaron el contrato de concesión No. 185 de 2022 de fecha 11 agosto de 2022.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, la operación, el mantenimiento, la modernización, la reposición y la expansión del sistema de alumbrado público.',
    'Que el artículo 350 del Estatuto Tributario Ley 1819 de 2016 dispone que el Impuesto de alumbrado público, como actividad inherente al servicio de energía eléctrica, se destina exclusivamente a la prestación, mejora, modernización y ampliación de la prestación del servicio de alumbrado público, incluyendo el suministro, administración, operación, mantenimiento, expansión y desarrollo tecnológico asociado, entre otras acciones, lo que permite la realización de actividades de ornato y alumbrado navideño.',
    'Que, con base en la anterior autorización, en el contrato de concesión, se incluyó la CLÁUSULA TERCERA: OBLIGACIONES DE LAS PARTES: Por parte del Contratista: el literal c) contempla: "...La expansión vegetativa anual del 1% a que se refiere la oferta aceptada por LA CONTRATANTE, o cualquier otra adicional que se requiera, se realizará siempre y cuando existan recursos disponibles para remunerar al Concesionario por ella, para lo cual las partes, y el interventor, suscribirán las actas respectivas."',
    'El desarrollo de tales actividades dependerá de la existencia de recursos suficientes para ellas, y para su realización solo requerirá de actas firmadas para el efecto, por el Municipio, la Interventoría y el Concesionario.\n\nPor lo expuesto, las partes.',
  ],

  preAcuerdanText: 'ACUERDAN:',

  clausulas: [
    {
      title: 'PRIMERO',
      content: 'El Contratante autoriza la ejecución de la expansión de la infraestructura del alumbrado público en los siguientes sectores: Quebrada Larga, Vereda Tacamocho, Vereda Mulato, Quebrada La Llana, Sector Escuela y sector Conrado Gutiérrez, Vereda La Arboleda, Sector Guayabal, Vereda la Linda, Vereda Chaguaní, Vereda Cascabel, Vereda San Francisco, Vereda La Dolores del Municipio de Tarso de acuerdo con los ítems y los valores detallados en el presupuesto presentado por el contratista y aprobado por la interventoría tal como reza en el literal c) del numeral 1) de la Cláusula Tercera del contrato de Concesión.',
    },
    {
      title: 'SEGUNDO',
      content: 'El Contratista Concesionario ejecutará los proyectos de expansión y la infraestructura de alumbrado público de los sectores del Municipio de Tarso, de conformidad al presupuesto anexo y el valor total aprobado por la Contratante y la interventoría, dentro del plazo fijado.',
    },
    {
      title: 'TERCERO: VALOR DE LA EXPANSIÓN',
      content: 'El valor de la expansión autorizada será de: {{VALOR_TOTAL}} MCTE.',
    },
    {
      title: 'CUARTO: CUADRO DE CANTIDADES DE OBRA',
      content: 'Las cantidades de obras son las que se describen a continuación:',
    },
    {
      title: '',
      content: 'Cada cantidad de obra está definida por una unidad constructiva que se anexa al presente documento, donde se establecieron como precios de referencia los fijados en el contrato de concesión No 185-2022, actualizados con el índice de precios al productor a mes de febrero de 2026.',
    },
    {
      title: 'QUINTO: FORMA Y CONDICIONES DE PAGO',
      content: 'El costo de la presente expansión será asumido con cargo a los recursos disponibles del impuesto de alumbrado público, destinados a remunerar al Concesionario, conforme a lo establecido en la Cláusula Tercera del Contrato de Concesión. CLÁUSULA TERCERA. Los costos de administración, operación, mantenimiento, expansión y de la inversión en modernización del Sistema de Alumbrado Público será pagada por el Contratante al Concesionario, conforme a la metodología establecida por la CREG en la Resolución No. 123 de 2011, con los recursos del impuesto de Alumbrado Público.\n\nLas partes acuerdan que el pago del costo de esta expansión del Sistema de Alumbrado Público aquí autorizada se hará a través de un único pago de la totalidad del valor de la presente acta previa aceptación de las garantías acordadas por parte del contratante y al momento de la firma del Acta de Inicio, a partir de la cual contará el tiempo de ejecución de conformidad con el Plazo de Ejecución Acordado. Una vez ejecutada cada una de la(s) obra(s) se realizará un acta de liquidación final de conformidad con las cantidades instaladas y debidamente soportados relacionando los activos instalados con su ubicación georreferenciada. Las actas serán firmadas por el Contratante representado por el Supervisor, por la Interventoría y por el Concesionario.',
    },
    {
      title: 'SEXTO: PLAZO DE EJECUCIÓN',
      content: 'El plazo de ejecución del objeto de la presente acta será de noventa (90) días hábiles contados a partir de la firma del Acta de Inicio.',
    },
    {
      title: 'SÉPTIMO: SITIOS DE ENTREGA E INSTALACIÓN',
      content: 'Los sitios de entrega e instalación de los componentes de este proyecto, será en el municipio de Tarso, Antioquia en Quebrada Larga, Vereda Tacamocho, Vereda Mulato (Quebrada la Llana, Sector Escuela y sector Conrado Gutiérrez), Vereda La Arboleda, Sector Guayabal, Vereda la Linda, Vereda Chaguaní, Vereda Cascabel, Vereda San Francisco, Vereda La Dolores.',
    },
    {
      title: 'OCTAVO: INTERVENTORÍA, RECIBO Y LIQUIDACIÓN DE LA EXPANSIÓN',
      content: 'Le corresponde al Interventor y/o con la Supervisión del Contratante, en cumplimiento al Contrato de Interventoría No. C-INTERVENTORIA-N°186 de 2022 en su cláusula SEXTA OBLIGACIONES DE LAS PARTES: POR PARTE DEL CONTRATISTA numeral 6. Verificar la calidad del suministro de los materiales y elementos utilizados, en cumplimiento de la normatividad vigente.',
    },
    {
      title: 'NOVENO: CONTRATO DE CONCESIÓN',
      content: 'El presente documento se rige y da cumplimiento a las cláusulas del contrato de Concesión No. 185 de 2022 celebrado entre EL MUNICIPIO DE TARSO y la sociedad CANALES Y CONTACTOS SAS.',
    },
    {
      title: 'DÉCIMA: OPERACIÓN Y MANTENIMIENTO',
      content: 'A cargo del CONCESIONARIO en el marco de la propuesta que hace parte del presente documento y del contrato de Concesión No 185-2022.',
    },
    {
      title: 'DÉCIMA PRIMERA: GARANTÍAS',
      content: 'EL CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor del Municipio a través de cualquiera de los mecanismos de cobertura de riesgo permitidos por el Decreto 1082 de 2015.',
    },
    {
      title: 'DÉCIMA SEGUNDA: PERFECCIONAMIENTO, LEGALIZACIÓN',
      content: 'La presente acta se considerará perfeccionada con la suscripción de presente documento por cada una de las partes, legalizada con el acta de aprobación de las pólizas y en ejecución con la suscripción del acta de inicio.\n\nPara constancia se firma en Tarso, Antioquia, el presente documento, en dos (2) ejemplares del mismo texto, a los 17 días del mes de abril del año Dos mil veintiséis (2026).',
    },
  ],
};
