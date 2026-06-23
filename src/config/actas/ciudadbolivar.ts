import type { ActaConfig } from './types';

export const ciudadBolivarConfig: ActaConfig = {
  hideMunicipioBanner: true,
  consideracionNumeracion: 'decimalDash',
  docFields: {
    municipio: 'CIUDAD BOLÍVAR',
    municipioNombreCompleto: 'CIUDAD BOLÍVAR ANTIOQUIA',
    municipioNit: '890.980.330-9',
    contrato: '001 - 2022',
    tipoActa: 'DOCUMENTO DE APROBACIÓN No 02-2026 DE EXPANSIÓN DEL S.A.L.P.',
    actaYear: '2026',
    actaFecha: '',
    actaNumero: '02-2026',
    actaReferenciaAnterior: '02-2026',
    smmlvPresupuesto: '118,2',
    munNombre: 'LEÓN DARIO ACEVEDO VARGAS',
    munCc: '70.411.862',
    munCcCiudad: 'Ciudad Bolívar, Antioquia',
    munCargo: 'Alcalde Municipal',
    munPosesionFecha: '30 de diciembre de 2023',
    munDireccion: 'Calle 49 No. 51 - 20. Ciudad Bolívar, Antioquia',
    munEntidad: 'Municipio de Ciudad Bolivar',
    conNombre: 'GLORIA LUCIA ESCALANTE MANZANO',
    conCc: '66.651.423',
    conCcCiudad: '',
    conEmpresa: 'CANALES Y CONTACTOS SAS',
    conNit: '900.456.735-7',
    conDireccion: 'Calle 52 #48-24 Barrio Verdún',
    intNombre: 'SOFONIAS BANGUERO ZAPATA',
    intCc: '19.380.232',
    intCcCiudad: 'Apartadó',
    intEmpresa: 'INGENIERIA Y SOPORTE S.B.Z S.A.S',
    intNit: '900.106.742-8',
    intDireccion: 'Cra. 101A No. 99-20, Apartadó',
    intCargo: 'Representante Legal',
    supNombre: 'JUAN CARLOS RESTREPO',
    supCargo: 'Secretario de Obras Públicas',
    supRol: 'Supervisor del Contrato de Concesión.',
    supEntidad: 'Municipio de Ciudad Bolívar.',
  },

  encabezadoTabla: [
    {
      label: 'OBJETO:',
      value: 'PRESTACIÓN DE SERVICIOS DE INVERSIÓN, ADMINISTRACIÓN, OPERACIÓN, MANTENIMIENTO, REPOSICIÓN, EXPANSIÓN Y DESARROLLO TECNOLÓGICO ASOCIADO AL SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE CIUDAD BOLÍVAR',
    },
    {
      label: 'OBJETO DE ESTE DOCUMENTO',
      value: 'EXPANSIÓN DEL SISTEMA DE A.P.',
    },
    {
      label: 'CONTRATANTE:\nNIT.\nDIRECCIÓN:',
      value: 'MUNICIPIO DE CIUDAD BOLÍVAR\n890.980.330-9\nCalle 49 No. 51 - 20. Ciudad Bolívar, Antioquia',
    },
    {
      label: 'CONTRATISTA:\nNIT.\nDIRECCIÓN:',
      value: 'CANALES Y CONTACTOS SAS\n900.456.735-7\nCalle 52 #48-24 Barrio Verdún',
    },
    {
      label: 'INTERVENTORÍA:\nNIT.\nDIRECCIÓN:',
      value: 'INGENIERÍA Y SOPORTE S.B.Z SAS\n900.106.742-8\nCra. 101A No. 99-20, Apartadó',
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
      label: 'PLAZO DE EJECUCIÓN:\nDieciséis',
      value: '90 DÍAS HÁBILES',
    },
  ],

  partesIntroTemplate:
    'Entre los suscritos {{munNombre}}, identificado con la cédula de ciudadanía No. {{munCc}} expedida en {{munCcCiudad}}, en calidad de alcalde y representación legal del MUNICIPIO DE {{municipio}}, con autorización para contratar contenida en el Acta de Posesión del {{munPosesionFecha}}, en cumplimiento de sus funciones administrativas que le confieren la representación legal de esta entidad. {{conNombre}}, identificada con la cédula de ciudadanía No {{conCc}}, obrando como representante legal suplente de la Sociedad {{conEmpresa}} en calidad de Contratista, por medio de este documento hemos acordado la realización de expansión del Sistema de Alumbrado Público del Municipio de {{municipio}}, previas las siguientes',

  consideraciones: [
    'Que las partes suscribieron el contrato de la referencia, que tiene como Objeto, Concesión en exclusividad de la prestación del servicio de Alumbrado Público incluidas las Actividades de Inversión, Administración, Operación, Mantenimiento, Modernización, Reposición y Expansión del Sistema de Alumbrado Público, así como del suministro e instalación de luminarias y accesorios eléctricos, el suministro de repuestos necesarios para la modernización y expansión de la infraestructura del alumbrado público municipal, la planeación y ejecución de los desarrollos tecnológicos asociados al sistema y el acompañamiento en la compra de energía con destino al sistema de alumbrado público municipal.',
    'Que los diseños eléctricos y fotométricos de la infraestructura de alumbrado público a instalarse en estas vías y parques serán elaborados por el Concesionario, y deberán ser aprobados por la interventoría de este contrato, tal como lo expresa el contrato de interventoría No CC-001-2022 en su cláusula Sexta Obligaciones de las Partes: Por parte del Contratista - numeral 17. Revisar los estudios y diseños de Retie y Retilap que realice el operador del servicio.',
    'El Comité técnico entre la Interventoría, la Supervisión del Contrato revisaron el presupuesto de obra, conceptuando que el valor unitario de cada uno de los ítems adicionales corresponde a los precios de referencia fijados en el contrato de Concesión, actualizados de acuerdo con el Índice de Precios al Productor, que fueron debidamente analizados, encontrándolos justificados, siendo aprobado.',
    'Que el artículo 2 de la Constitución Política de Colombia de 1991 señala que son fines esenciales del Estado: servir a la comunidad, promover la prosperidad general y garantizar la efectividad de los principios, derechos y deberes consagrados en la constitución.',
    'Que de conformidad con el artículo 315 de la carta política de Colombia, corresponde a los alcaldes cumplir y hacer cumplir la constitución, la ley, los decretos del gobierno, las ordenanzas, los acuerdos de los concejos y dirigir la acción administrativa del municipio; asegurar el cumplimiento de las funciones y la prestación de los servicios a su cargo, en concordancia con el artículo 941 de la Ley 136 de 1994 modificado por el artículo 29 de la Ley 1551 de 2012.',
    'Que el artículo 365 de la Constitución Política señala que los servicios públicos son inherentes a la finalidad social del Estado, debiendo garantizar su prestación eficiente a todos los habitantes del territorio nacional.',
    'Que el Concejo Municipal de Ciudad Bolívar mediante Acuerdo 028 del 15 de octubre de 2021 autoriza al Alcalde del Municipio de Ciudad Bolívar, para que entregue en concesión la prestación del servicio no domiciliario de Alumbrado Público, de acuerdo con los lineamientos de las Leyes 80 de 1993 y 1150 de 2007, por un término inicial máximo de veinticinco (25) años.',
    'Que EL MUNICIPIO abrió proceso de licitación pública No 001-2022 de fecha 14 de enero de 2022 para contratar mediante el sistema de CONCESIÓN la prestación de servicio de Inversión, Administración, Operación, Mantenimiento, Reposición, Expansión y Desarrollo Tecnológico asociado al sistema de alumbrado público del Municipio de Ciudad Bolívar, suministrando el CONCESIONARIO a pleno costo los elementos, y asumiendo en fin, todo lo inherente y relacionado con el servicio de Alumbrado Público en todo el territorio del Municipio, a cambio de la remuneración pactada por las partes.',
    'Que EL MUNICIPIO adjudicó al CONCESIONARIO dicha licitación mediante Resolución No. 3983 del veintinueve (29) de diciembre de 2021.',
    'Que adjudicado el proceso de licitación, EL MUNICIPIO y EL CONCESIONARIO firmaron el contrato de concesión No. 001 de 2022 de fecha 14 de enero de 2022.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, la operación, el mantenimiento, la modernización, la reposición y la expansión del sistema de alumbrado público.',
    'Que el artículo 350 del Estatuto Tributario Ley 1819 de 2016 dispone que el Impuesto de alumbrado público, como actividad inherente al servicio de energía eléctrica, se destina exclusivamente a la prestación, mejora, modernización y ampliación de la prestación del servicio de alumbrado público, incluyendo el suministro, administración, operación, mantenimiento, expansión y desarrollo tecnológico asociado, entre otras acciones, lo que permite la realización de actividades de ornato y alumbrado navideño.',
    'Que, con base en la anterior autorización, en el contrato de concesión, se incluyó la CLÁUSULA SÉPTIMA: OBLIGACIONES DE LAS PARTES: Por parte del Contratista: el numeral tercero contempla: "...La expansión vegetativa anual del 1% a que se refiere la oferta aceptada por LA CONTRATANTE, o cualquier otra adicional que se requiera, se realizará siempre y cuando existan recursos disponibles para remunerar al Concesionario por ella, para lo cual las partes, y el interventor, suscribirán las actas respectivas."',
    'El desarrollo de tales actividades dependerá de la existencia de recursos suficientes para ellas, y para su realización solo requerirá de actas firmadas para el efecto, por el Municipio, la Interventoría y el Concesionario.\n\nPor lo expuesto, las partes.',
  ],

  clausulas: [
    {
      title: 'PRIMERO',
      content: 'El Contratante autoriza la ejecución de la expansión de la infraestructura del alumbrado público en los siguientes sectores: Villa Manuela, El Cabrero, Vereda el Empuje, La Floresta - Cueva del Humo, Parcelación La Arboleda de los Farallones, Puente de los Guayacanes, Los Billares - Finca de Belarmino, La Arboleda - Finca Villa Isabel, Barrio La Cabaña - Los Tubos, Cancha de Alfonso López, Finca Hotel Lagos del Cítara, Cámara y Comercio, Alfonso López - Cristo Rey, Barrio La Cabaña - Filo de Hambre y Barrio el Olimpo del Municipio de Ciudad Bolívar, de acuerdo con los ítems y los valores detallados en el presupuesto presentado por el contratista y aprobado por la interventoría, tal como reza en el numeral 3 de la Cláusula Séptima del contrato de Concesión.',
    },
    {
      title: 'SEGUNDO',
      content: 'El Contratista Concesionario ejecutará los proyectos de expansión y la infraestructura de alumbrado público de los sectores del Municipio de Ciudad Bolívar, de conformidad al presupuesto anexo y el valor total aprobado por la Contratante y la Interventoría, dentro del plazo fijado.',
    },
    {
      title: 'TERCERO: VALOR DE LA EXPANSIÓN',
      content: 'El valor de la expansión autorizada será de: {{VALOR_TOTAL}} MCTE.',
    },
    {
      title: 'CUARTO: CUADRO DE CANTIDADES DE EXPANSIÓN',
      content: 'Las cantidades de obras son las que se describen a continuación:',
    },
    {
      title: '',
      content: 'Cada cantidad de obra está definida por una unidad constructiva que se anexa al presente documento, donde se establecieron como precios de referencia los fijados en el contrato de concesión No 001-2022 actualizados con el índice de precios al productor a mes de febrero de 2026.',
    },
    {
      title: 'QUINTO: FORMA Y CONDICIONES DE PAGO',
      content: 'El costo de la presente expansión será pagado con los recursos disponibles del impuesto de alumbrado público para remunerar al Concesionario por ella tal como lo establece el contrato de Concesión en su CLÁUSULA TERCERA. Los costos de administración, operación, mantenimiento, expansión y de la inversión en modernización del Sistema de Alumbrado Público será pagada por el Contratante al Concesionario, conforme a la metodología establecida por la CREG en la Resolución No. 123 de 2011, con los recursos del impuesto de Alumbrado Público.\n\nLas partes acuerdan que el pago del costo de esta expansión del Sistema de Alumbrado Público aquí autorizada se hará a través de un único pago de la totalidad del valor de la presente acta al momento de la firma del Acta de Inicio, a partir de la cual contará el tiempo de ejecución de conformidad con el Plazo de Ejecución Acordado. Una vez ejecutada cada uno de lo(s) proyecto(s) se realizará un acta de liquidación final de conformidad con las cantidades instaladas y debidamente soportados relacionando los activos instalados con su ubicación georreferenciada. Las actas serán firmadas por el Contratante representado por el Supervisor, por la Interventoría y por el Concesionario.',
    },
    {
      title: 'SEXTO: PLAZO DE EJECUCIÓN',
      content: 'El plazo de ejecución del objeto de la presente acta será de noventa (90) días hábiles contados a partir de la firma del Acta de Inicio.',
    },
    {
      title: 'SÉPTIMO: SITIOS DE ENTREGA E INSTALACIÓN',
      content: 'Los sitios de entrega e instalación de los componentes de este proyecto serán el municipio de Ciudad Bolívar, Antioquia en Villa Manuela, El Cabrero, Vereda el Empuje, La Floresta - Cueva del Humo, Parcelación la Arboleda de los Farallones, Puente de los Guayacanes, Los Billares - Finca de Belarmino, La Arboleda - Finca Villa Isabel, Barrio la Cabaña - Los Tubos, Cancha de Alfonso López, Finca Hotel Lagos del Cítara, Cámara y Comercio, Alfonso López - Cristo Rey, Barrio la Cabaña - Filo de Hambre y barrio el Olimpo.',
    },
    {
      title: 'OCTAVO: INTERVENTORÍA, RECIBO Y LIQUIDACIÓN DE LA EXPANSIÓN',
      content: 'Le corresponde al Interventor y/o con la Supervisión del Contratante, en cumplimiento al Contrato de Interventoría No. CC-N°001 de 2022 en su cláusula SEXTA OBLIGACIONES DE LAS PARTES: POR PARTE DEL CONTRATISTA numeral 9, verificar la calidad del suministro de los materiales y elementos utilizados, en cumplimiento de la normatividad vigente.',
    },
    {
      title: 'NOVENO: CONTRATO DE CONCESIÓN',
      content: 'El presente documento se rige y da cumplimiento a las cláusulas del contrato de Concesión No. 001 de 2022 celebrado entre EL MUNICIPIO DE CIUDAD BOLÍVAR y la sociedad CANALES Y CONTACTOS SAS.',
    },
    {
      title: 'DÉCIMA: OPERACIÓN Y MANTENIMIENTO',
      content: 'A cargo del CONCESIONARIO en el marco de la propuesta que hace parte del presente documento y del contrato de Concesión No 001-2022.',
    },
    {
      title: 'DÉCIMA PRIMERA: GARANTÍAS',
      content: 'EL CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor del Municipio a través de cualquiera de los mecanismos de cobertura de riesgo permitidos por el Decreto 1082 de 2015.',
    },
    {
      title: 'DÉCIMA SEGUNDA: PERFECCIONAMIENTO, LEGALIZACIÓN',
      content: 'La presente acta se considerará perfeccionada con la suscripción de presente documento por cada una de las partes, legalizada con el acta de aprobación de las pólizas y en ejecución con la suscripción del acta de inicio.\n\nPara constancia se firma en Ciudad Bolívar, Antioquia, el presente documento, en dos (2) ejemplares del mismo texto, a los doce (12) días del mes de mayo del año Dos mil veintiséis (2026).',
    },
  ],
};
