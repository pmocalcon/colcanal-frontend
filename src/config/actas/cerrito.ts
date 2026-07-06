import type { ActaConfig } from './types';

const objetoContrato =
  'INVERSIÓN, REHABILITACIÓN, REPOSICIÓN, OPERACIÓN, MANTENIMIENTO Y GESTIÓN DEL SERVICIO DE ALUMBRADO PÚBLICO. SUMINISTRANDO A PLENO COSTO LOS ELEMENTOS, MATERIALES, EQUIPOS Y ACCESORIOS QUE REQUIERA LA REHABILITACIÓN, REPOTENCIACIÓN Y AMPLIACIÓN DEL SISTEMA, SEGÚN CANTIDADES DEFINIDAS CONFORME A LOS PLIEGOS DE CONDICIONES DE LA LICITACIÓN PÚBLICA No. L-001-2014, ASÍ MISMO, SE DEBERÁ GARANTIZAR EL MANTENIMIENTO Y REPOSICIÓN OPORTUNA, EFICAZ Y EFICIENTE DE LOS ELEMENTOS O ACCESORIOS QUE DEBAN CAMBIARSE POR DETERIORO O FIN DE VIDA ÚTIL MEDIANTE LA IMPLEMENTACIÓN DE LOS PROGRAMAS DE MANTENIMIENTO TANTO CORRECTIVOS COMO PREVENTIVOS.';

export const cerritoConfig: ActaConfig = {
  logoUrl: '/assets/images/logo-cerrito.png',
  hideMunicipioBanner: true,
  showGarantiaRceExtraParagraphs: false,
  consideracionNumeracion: 'alpha',
  tituloLineas: [
    'ACTA DE APROBACIÓN No. {{actaNumero}} EXPANSIÓN DEL',
    'SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE {{municipio}}',
    'CONTRATO DE CONCESIÓN No {{contrato}}',
  ],
  docFields: {
    municipio: 'EL CERRITO',
    municipioNombreCompleto: 'EL CERRITO - VALLE DEL CAUCA',
    municipioNit: '800.100.533-5',
    contrato: '01 DE 2014',
    tipoActa: 'ACTA DE APROBACIÓN No. 02-2026 EXPANSIÓN DEL',
    actaYear: '2026',
    actaFecha: '',
    actaNumero: '02-2026',
    actaReferenciaAnterior: '02-2026',
    smmlvPresupuesto: '372',
    munNombre: 'JOSÉ ARLES TOBÓN GIRÓN',
    munCc: '16.862.551',
    munCcCiudad: 'El Cerrito, Valle',
    munCargo: 'Alcalde',
    munPosesionFecha: 'Acta de Posesión No. 001 del 01 de enero de 2024 ante la notaría única de El Cerrito',
    munEntidad: 'MUNICIPIO DE EL CERRITO - VALLE DEL CAUCA',
    munDireccion: 'Calle 7 No. 11-62, Edf. Alcaldía Municipal, Parque El Cerrito - Valle del Cauca',
    conNombre: 'GLORIA LUCÍA ESCALANTE MANZANO',
    conCc: '66.651.423',
    conCcCiudad: 'El Cerrito, Valle del Cauca',
    conEmpresa: 'UNIÓN TEMPORAL ALUMBRADO PÚBLICO EL CERRITO',
    conNit: '900.806.389-4',
    conDireccion: 'Carrera 10 No. 6-78, B/. El Centro, El Cerrito - Valle del Cauca',
    intNombre: '',
    intCc: '',
    intCcCiudad: '',
    intEmpresa: '',
    intCargo: '',
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
      label: 'CONTRATANTE:',
      value: 'MUNICIPIO DE EL CERRITO - VALLE DEL CAUCA',
    },
    {
      label: 'NIT.:',
      value: '800.100.533-5',
    },
    {
      label: 'DIRECCIÓN:',
      value: 'Calle 7 No. 11-62, Edf. Alcaldía Municipal, Parque El Cerrito - Valle del Cauca',
    },
    {
      label: 'CONTRATISTA:',
      value: 'UNIÓN TEMPORAL ALUMBRADO PÚBLICO EL CERRITO',
    },
    {
      label: 'NIT.:',
      value: '900.806.389-4',
    },
    {
      label: 'DIRECCIÓN:',
      value: 'Carrera 10 No. 6-78, B/. El Centro, El Cerrito - Valle del Cauca',
    },
    {
      label: 'VALOR ACTA DE EXPANSIÓN:',
      value: 'SETENTA Y SEIS MILLONES OCHOCIENTOS NOVENTA Y CINCO MIL SETECIENTOS CUARENTA Y DOS PESOS MONEDA LEGAL ($76.895.742 ML)',
    },
    {
      label: 'PLAZO DE EJECUCIÓN:',
      value: '120 DÍAS HÁBILES',
    },
  ],

  partesIntroTemplate:
    'Entre los suscritos {{munNombre}}, mayor de edad, identificado con cédula de ciudadanía número {{munCc}} de {{munCcCiudad}}, quien obra en nombre y representación del MUNICIPIO DE {{municipio}}, en su Calidad de {{munCargo}} y con autorización para contratar contenida en el Acta de Posesión No. 001 del 01 de enero de 2024 ante la notaría única de El Cerrito, quien en adelante para los efectos del presente documento se denominará EL MUNICIPIO, {{conNombre}}, mayor de edad, identificada con cédula de ciudadanía número {{conCc}} de {{conCcCiudad}}, quien actúa en calidad de Representante Legal de la {{conEmpresa}}, quien en adelante para los efectos del presente documento se denominará EL CONCESIONARIO, por medio de este documento hemos acordado la ejecución y pago de la inversión de activos del Sistema de Alumbrado Público del Municipio de El Cerrito, en el marco del contrato de Concesión No 01 de 2014, previas las siguientes:',

  consideraciones: [
    'Que el artículo 2 de la Constitución Política de Colombia de 1991 señala que son fines esenciales del Estado: servir a la comunidad, promover la prosperidad general y garantizar la efectividad de los principios, derechos y deberes consagrados en la Constitución.',
    'Que de conformidad con el artículo 315 de la Carta Política de Colombia, corresponde a los alcaldes cumplir y hacer cumplir la Constitución, la ley, los decretos del Gobierno, las ordenanzas, los acuerdos de los concejos y dirigir la acción administrativa del municipio; asegurar el cumplimiento de las funciones y la prestación de los servicios a su cargo, en concordancia con el artículo 94 de la Ley 136 de 1994 modificado por el artículo 29 de la Ley 1551 de 2012.',
    'Que el artículo 365 de la Constitución Política señala que los servicios públicos son inherentes a la finalidad social del Estado, debiendo garantizar su prestación eficiente a todos los habitantes del territorio nacional.',
    'Que EL MUNICIPIO abrió proceso de licitación pública No. L-010-2014 para contratar mediante el sistema de CONCESIÓN, la prestación de servicio de Inversión, Administración, Operación, Mantenimiento, Reposición, Expansión y Desarrollo Tecnológico asociado al sistema de alumbrado público del Municipio de El Cerrito, suministrando el CONCESIONARIO a pleno costo los elementos, y asumiendo en fin, todo lo inherente y relacionado con el servicio de Alumbrado Público en todo el territorio del Municipio, a cambio de la remuneración pactada por las partes.',
    'Que EL MUNICIPIO adjudicó al CONCESIONARIO la licitación mediante Resolución No. 0934 del 30 de diciembre del 2014 modificada por la Resolución No. 0010 del 20 de enero de 2015.',
    'Que, adjudicado el proceso de licitación, EL MUNICIPIO y EL CONCESIONARIO firmaron el contrato de concesión No. 01 de 2014 de fecha 21 enero de 2015.',
    'Que el día veintiuno (21) de enero de 2015, se inició la ejecución del citado contrato, conforme a la suscripción del acta de inicio.',
    'Que de acuerdo con el Decreto 943 de 2018, el Alumbrado Público es el servicio público no domiciliario que se presta con el objeto de proporcionar exclusivamente la iluminación de los bienes de uso público y demás espacios de libre circulación con tránsito vehicular o peatonal, dentro del perímetro urbano y rural de un municipio o distrito.',
    'Que el servicio de alumbrado público comprende las actividades de suministro de energía al sistema de alumbrado público, la administración, la operación, el mantenimiento, la modernización, la reposición y la expansión del sistema de alumbrado público.',
    'Que el artículo 350 del Estatuto Tributario Ley 1819 de 2016 dispone que el impuesto de alumbrado público, como actividad inherente al servicio de energía eléctrica, se destina exclusivamente a la prestación, mejora, modernización y ampliación de la prestación del servicio de alumbrado público, incluyendo el suministro, administración, operación, mantenimiento, expansión y desarrollo tecnológico asociado.',
    'Que con base en la anterior autorización, en la Cláusula Primera del otrosí No. 4 al contrato de Concesión No. 01 de 2014, del 5 de diciembre del 2017, se encuentra "PARÁGRAFO CUARTO: Cualquier excedente que el contratante recaude por concepto del tributo de alumbrado público será invertido en obras de expansión y/o modernización que ejecutará el concesionario, para cuyo propósito se suscribirán actas de obra en las que se establezca con exactitud el monto de la obra de expansión o modernización o iluminación ornamental y navideña en los espacios públicos del Municipio a ejecutar, la fuente de financiamiento, las especificaciones técnicas, la forma de pago y la disposición de los recursos necesarios para garantizar su mantenimiento preventivo y correctivo al formar parte de la infraestructura concesionada, así como a la actividad de iluminación ornamental y navideña en los espacios públicos del Municipio".',
    'Que por lo expuesto en el literal que antecede, el desarrollo de tales actividades dependerá de la existencia de recursos suficientes para ellas, y para su realización solo requerirá de actas firmadas para el efecto, por el Municipio y el Concesionario.',
    'Que el Concesionario presentó las cantidades de expansión y presupuesto, en el cual la administración municipal aprobó que el Concesionario instalará la iluminación en el sector del Municipio. Y la Supervisión del contrato revisó el presupuesto, conceptuando que el valor unitario de cada uno de los ítems corresponde a los precios de referencia fijados en el contrato de Concesión, actualizados de acuerdo con el Índice de Precios al Productor en la oferta interna, que fueron debidamente analizados, encontrándolos justificados y siendo aprobado.',
    'Que el Municipio de El Cerrito advirtió que cuenta con los recursos necesarios para la ejecución de la expansión, toda vez, que posee el recurso correspondiente al recaudo del impuesto de alumbrado público por la sobretasa al avalúo catastral realizado a los lotes a través del impuesto predial unificado, los cuales se encuentran en las cuentas del Municipio y la destinación para la reposición por valor de setenta y seis millones ochocientos noventa y cinco mil setecientos cuarenta y dos pesos ($76.895.742 ML) será asumida desde dicho recurso.',
    'El Municipio requiere adelantar el presente proyecto de Expansión con el fin de dar cumplimiento parcial a la acción popular con número de proceso 76001333300320180003800 (01), de la demandante Sandra Liliana Montenegro, en el cual el tribunal administrativo del Valle emitió sentencia de segunda instancia, la cual confirma la sentencia de primera instancia que ampara los derechos de la comunidad.',
    'Que, con fundamento en todo lo antes motivado, las partes',
  ],

  clausulas: [
    {
      title: 'PRIMERO',
      content: 'El Contratante autoriza la ejecución de la expansión de la infraestructura de alumbrado público que se describe al interior de la presente acta en el sector: Vereda Agua Blanca, del Municipio de El Cerrito de acuerdo con los ítems y valores detallados en el presupuesto presentado por el contratista y aprobado por el supervisor.',
    },
    {
      title: 'SEGUNDA',
      content: 'El Contratista Concesionario ejecutará los proyectos de inversión de infraestructura del sistema de alumbrado público en los sectores del Municipio de El Cerrito, de conformidad al presupuesto anexo y el valor total aprobado por la Contratante, dentro del plazo fijado.',
    },
    {
      title: 'TERCERO: VALOR DE LA EXPANSIÓN',
      content: 'El valor de la presente acta de autorización será de: setenta y seis millones ochocientos noventa y cinco mil setecientos cuarenta y dos pesos ($76.895.742 ML).',
    },
    {
      title: 'CUARTO: CUADRO DE CANTIDADES DE EXPANSIÓN',
      content: 'Las cantidades de expansión son las que se describen a continuación:',
    },
    {
      title: '',
      content: 'Cada cantidad del proyecto está definida por una unidad constructiva donde se establecieron como precios de referencia los fijados en el contrato de concesión No. 01 de 2014 y el otrosí No. 12 de 2023, los cuales se actualizan con el índice de precios al productor al mes de Marzo de 2026.',
    },
    {
      title: 'QUINTO: FORMA Y CONDICIONES DE PAGO',
      content: 'El proyecto de expansión de infraestructura de uso exclusivo del Sistema de Alumbrado Público en el Municipio de El Cerrito se ejecutará con el recurso correspondiente al recaudo del impuesto de alumbrado público por la sobretasa al avalúo catastral realizado a los lotes a través del impuesto predial unificado, determinados con corte a 31 de octubre de 2025.\n\nLas partes acuerdan que el pago del costo de esta reposición de infraestructura del Sistema de Alumbrado Público aquí autorizada se hará a través de un único pago por la totalidad del valor de la presente acta por valor de setenta y seis millones ochocientos noventa y cinco mil setecientos cuarenta y dos pesos ($76.895.742 ML) al momento de la firma del Acta de Inicio, a partir de la cual contará el tiempo de ejecución de conformidad con el plazo de ejecución acordado. Una vez ejecutado el proyecto se realizará un acta de liquidación final de conformidad con las cantidades instaladas y debidamente soportado relacionando los activos instalados con su ubicación georreferenciada. Las actas serán firmadas por el Contratante o por el Supervisor y por el Concesionario.',
    },
    {
      title: 'SEXTO: SITIOS DE ENTREGA E INSTALACIÓN',
      content: 'Los sitios de entrega e instalación de los componentes de cada proyecto, será en el Municipio de El Cerrito, Valle del Cauca en la Vereda Agua Blanca.',
    },
    {
      title: 'SÉPTIMO: CONTRATO DE CONCESIÓN',
      content: 'El presente documento se rige y da cumplimiento a las cláusulas del contrato de Concesión No. 01 de 2014 celebrado entre EL MUNICIPIO DE EL CERRITO y la UNIÓN TEMPORAL ALUMBRADO PÚBLICO EL CERRITO.',
    },
    {
      title: 'OCTAVO: OPERACIÓN Y MANTENIMIENTO',
      content: 'A cargo del CONCESIONARIO en el marco de la propuesta que hace parte del presente documento y del contrato de Concesión No. 01 de 2014.',
    },
    {
      title: 'NOVENO: PLAZO DE EJECUCIÓN',
      content: 'El plazo para la ejecución de los proyectos contemplados en la presente Acta de Autorización es de ciento veinte (120) días hábiles contados a partir de la firma del acta de inicio.',
    },
    {
      title: 'DÉCIMA: GARANTÍAS',
      content: 'EL CONCESIONARIO deberá garantizar la ejecución del presente convenio, por tanto, deberá amparar a favor del Municipio a través de cualquiera de los mecanismos de cobertura de riesgo permitidos por el Decreto 1082 de 2015.',
    },
  ],
};
