/**
 * Los módulos de defensa de la contestación de tutela (modelo especial de Dirección
 * Jurídica) y el catálogo de tipos de defensa que los preactiva.
 *
 * El modelo es **modular a propósito**: su bloque de control obliga a que Jurídica escoja
 * únicamente los argumentos que correspondan a los hechos y pruebas del expediente. Por eso
 * el formato nace sin ningún módulo activo y ninguno se enciende solo —ni siquiera el que
 * sugiere el tipo de defensa, que solo lo propone—: un escrito judicial que llegue al
 * despacho con un argumento que el expediente no soporta es una afirmación sin prueba.
 *
 * Los cuerpos son **instrucciones entre corchetes y no prosa terminada**. Se guardan como
 * valor y no como `placeholder` de HTML por lo mismo que el resto del formato: el modelo en
 * blanco tiene que poder imprimirse para trabajarlo a mano.
 */

/** Un argumento de la sección III, tal como queda al activarlo. */
export interface ModuloDefensa {
  /** Identifica el módulo dentro del documento guardado; sobrevive a la renumeración. */
  clave: string;
  titulo: string;
  /**
   * `[OPCIONAL]` o `[USAR SOLO SI APLICA]`: la marca con que el módulo entra al escrito.
   *
   * Va aparte del título porque cumple dos papeles distintos. En el documento se imprime
   * pegada al título —y se borra al diligenciar, como los `[SI APLICA]` de las solicitudes—,
   * pero en el panel de control sobraría: ahí todos los módulos son opcionales y repetirlo
   * siete veces solo estorba la lectura.
   */
  marca: string;
  cuerpo: string;
  /** La enumeración del argumento, si la trae. Imprime con sangría francesa. */
  items: string[];
  /** Lo que va después de la enumeración: la conclusión o una advertencia de uso. */
  cierre: string;
}

export const MODULOS_DEFENSA: ModuloDefensa[] = [
  {
    clave: 'legitimacion',
    titulo: 'Falta de legitimación en la causa por pasiva',
    marca: '[OPCIONAL]',
    cuerpo:
      'De acuerdo con los artículos 5 y 13 del Decreto 2591 de 1991, la legitimación por '
      + 'pasiva exige que la acción u omisión que presuntamente vulnera o amenaza el derecho '
      + 'fundamental sea atribuible al accionado o vinculado. En el caso concreto, [EXPLICAR '
      + 'POR QUÉ LA CONDUCTA, DECISIÓN O DEBER RECLAMADO NO ES ATRIBUIBLE A LA REPRESENTADA Y '
      + 'CUÁL ES EL SUJETO COMPETENTE, SI SE CONOCE].',
    items: [],
    cierre:
      '[INCORPORAR JURISPRUDENCIA ACTUAL Y PERTINENTE SOLO DESPUÉS DE VERIFICAR SU APLICACIÓN '
      + 'AL CASO].',
  },
  {
    clave: 'vulneracion',
    titulo: 'Ausencia de acción u omisión vulneradora',
    marca: '[OPCIONAL]',
    cuerpo:
      '[EXPLICAR QUÉ ACTUACIÓN REALIZÓ LA REPRESENTADA, EN QUÉ FECHA, CON QUÉ SOPORTE Y POR '
      + 'QUÉ NO EXISTE UNA CONDUCTA SUYA QUE HAYA PRODUCIDO LA VULNERACIÓN ALEGADA].',
    items: [],
    cierre: '',
  },
  {
    clave: 'peticion',
    titulo: 'Derecho de petición: ausencia de recepción previa',
    marca: '[OPCIONAL]',
    cuerpo:
      '[USAR SOLO SI EL EXPEDIENTE PERMITE ACREDITARLO]. Señalar que no existe soporte de '
      + 'recepción de la petición por la representada antes de la tutela, identificar los '
      + 'canales oficiales revisados y precisar la fecha en que se tuvo conocimiento efectivo. '
      + 'Evitar afirmaciones absolutas que no estén respaldadas por registros verificables.',
    items: [],
    cierre: '',
  },
  {
    clave: 'remision',
    titulo: 'Remisión por competencia e información al peticionario',
    marca: '[OPCIONAL]',
    cuerpo:
      'Si la solicitud excedía la competencia de la representada y fue remitida a la autoridad '
      + 'competente, indicar la fecha, oficio, destinatario y constancia de envío, así como la '
      + 'comunicación remitida al peticionario. Cuando resulte aplicable, el artículo 21 de la '
      + 'Ley 1755 de 2015 exige informar al interesado y remitir la petición al competente '
      + 'dentro del término legal.',
    items: [],
    cierre: '',
  },
  {
    clave: 'hecho-superado',
    titulo: 'Carencia actual de objeto por hecho superado',
    marca: '[OPCIONAL]',
    cuerpo:
      '[USAR SOLO CUANDO, ANTES DEL FALLO, LA SITUACIÓN QUE PODÍA SER ATRIBUIBLE A LA '
      + 'REPRESENTADA HAYA SIDO SATISFECHA DE MANERA COMPLETA Y PUEDA PROBARSE]. Describir la '
      + 'actuación voluntaria realizada, su fecha, el soporte y el alcance exacto de lo '
      + 'satisfecho. No utilizar este módulo para encubrir competencias o actuaciones que '
      + 'continúen pendientes.',
    items: [],
    cierre: '',
  },
  {
    clave: 'subsidiariedad',
    titulo: 'Subsidiariedad e improcedencia respecto de controversias ordinarias',
    marca: '[OPCIONAL]',
    cuerpo:
      'El artículo 6 del Decreto 2591 de 1991 regula causales de improcedencia, entre ellas la '
      + 'existencia de otros medios de defensa judicial, salvo las excepciones constitucionales '
      + 'aplicables. [EXPLICAR, SI CORRESPONDE, CUÁL ES EL MEDIO ORDINARIO IDÓNEO Y POR QUÉ LAS '
      + 'PRETENSIONES BUSCAN QUE EL JUEZ DE TUTELA RESUELVA UNA CONTROVERSIA AJENA AL AMPARO '
      + 'INMEDIATO DE DERECHOS FUNDAMENTALES].',
    items: [],
    cierre: '',
  },
  {
    clave: 'tributario',
    titulo: 'Módulo especial: asuntos tributarios de alumbrado público',
    marca: '[USAR SOLO SI APLICA]',
    cuerpo:
      'Si la representada actúa únicamente como operador, concesionario o integrante de una '
      + 'Unión Temporal encargada de actividades técnicas del sistema de alumbrado público, '
      + 'deberá verificarse el contrato y el marco municipal antes de sostener que carece de '
      + 'facultades tributarias. Solo cuando ello esté acreditado, podrá argumentarse que la '
      + 'representada no está facultada para determinar sujetos pasivos, hecho generador, base '
      + 'gravable, tarifa, liquidar o reliquidar el impuesto, reconocer exenciones o '
      + 'devoluciones, ni ordenar modificaciones de facturación por razones tributarias.\n\n'
      + 'El eventual suministro de información técnica, visita o verificación física no '
      + 'convierte por sí solo al operador en autoridad tributaria ni le otorga facultades '
      + 'decisorias que no estén previstas en la ley, el acuerdo municipal o el contrato. La '
      + 'autoridad competente deberá identificarse con base en la estructura administrativa del '
      + 'municipio y la normativa local vigente.',
    items: [],
    cierre:
      '[SI SE PRETENDE INVOCAR LA PRESUNCIÓN DE LEGALIDAD DE UN ACUERDO MUNICIPAL, VERIFICAR '
      + 'PREVIAMENTE SU VIGENCIA, AUSENCIA DE SUSPENSIÓN O ANULACIÓN Y PERTINENCIA PARA EL '
      + 'CASO. SOLO ENTONCES CONSIDERAR EL ARTÍCULO 88 DE LA LEY 1437 DE 2011].',
  },
];

export const moduloPorClave = (clave: string) =>
  MODULOS_DEFENSA.find((m) => m.clave === clave);

/**
 * Los tipos de defensa del bloque de control.
 *
 * `sugiere` es la clave del módulo que la portada propone al escoger el tipo; no lo activa.
 * Tres de los siete módulos no aparecen acá —«petición», «remisión» y «tributario» no son
 * un tipo de defensa sino argumentos que acompañan a cualquiera de ellos—, y por eso el tipo
 * escogido nunca puede ser lo único que decida qué se imprime.
 */
export const TIPOS_DEFENSA: { valor: string; label: string; sugiere?: string }[] = [
  { valor: '', label: 'Sin definir' },
  { valor: 'legitimacion', label: 'Falta de legitimación por pasiva', sugiere: 'legitimacion' },
  { valor: 'vulneracion', label: 'Ausencia de vulneración', sugiere: 'vulneracion' },
  { valor: 'hecho-superado', label: 'Hecho superado', sugiere: 'hecho-superado' },
  { valor: 'subsidiariedad', label: 'Subsidiariedad', sugiere: 'subsidiariedad' },
  { valor: 'otro', label: 'Otro' },
];

/**
 * Las solicitudes y las pruebas del modelo, con sus marcas `[SI APLICA]` intactas: son la
 * salvaguarda de que nadie pida algo que el expediente no sostiene, y se borran al
 * diligenciar.
 */
export const SOLICITUDES_MODELO = [
  'Reconocer personería a la suscrita apoderada judicial en los términos del poder conferido.',
  '[SI APLICA] Negar el amparo respecto de [ENTIDAD / UTAP] por no encontrarse acreditada '
    + 'acción u omisión vulneradora atribuible a mi representada.',
  '[SI APLICA] Desvincular a [ENTIDAD / UTAP] del trámite por falta de legitimación en la '
    + 'causa por pasiva respecto de [PRECISAR CONDUCTAS O PRETENSIONES].',
  '[SI APLICA] Declarar la carencia actual de objeto por hecho superado exclusivamente '
    + 'respecto de [DEBER O SITUACIÓN CONCRETA], por encontrarse acreditada su satisfacción '
    + 'antes del fallo.',
  '[SI APLICA] Abstenerse de impartir a mi representada órdenes sobre asuntos que se '
    + 'encuentren fuera de sus competencias legales o contractuales, específicamente '
    + '[IDENTIFICAR].',
  'Tener como pruebas los documentos relacionados en el acápite siguiente.',
  '[OTRA SOLICITUD ESTRICTAMENTE RELACIONADA CON LA DEFENSA DEL CASO].',
];

export const PRUEBAS_MODELO = [
  'Poder especial conferido para actuar dentro de la acción de tutela.',
  '[DOCUMENTO DE EXISTENCIA / CONSTITUCIÓN / REPRESENTACIÓN DE LA UTAP O ENTIDAD].',
  '[RUT / CERTIFICADO / CONTRATO / DOCUMENTO QUE ACREDITE COMPETENCIAS, SI APLICA].',
  '[OFICIOS, CORREOS, RADICADOS Y CONSTANCIAS DE ENVÍO QUE SOPORTEN LAS ACTUACIONES '
    + 'DESCRITAS].',
  '[DEMÁS PRUEBAS PERTINENTES].',
];
