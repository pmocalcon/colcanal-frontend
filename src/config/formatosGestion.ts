import {
  Banknote, CalendarClock, Clock4, FileQuestion, FileSignature, FileX2, Forward, Gavel, HeartPulse,
  Hourglass, MailCheck, Plane, Scale, ScrollText, Users,
  type LucideIcon,
} from 'lucide-react';
import {
  estadoLabel as prestamoEstadoLabel,
  estadoBadgeClass as prestamoEstadoBadge,
} from '@/utils/prestamoWorkflow';
import {
  estadoLabel as permisoEstadoLabel,
  estadoBadgeClass as permisoEstadoBadge,
} from '@/utils/permisoWorkflow';
import {
  estadoLabel as horasExtrasEstadoLabel,
  estadoBadgeClass as horasExtrasEstadoBadge,
} from '@/utils/horasExtrasWorkflow';
import {
  estadoLabel as vacacionesEstadoLabel,
  estadoBadgeClass as vacacionesEstadoBadge,
} from '@/utils/vacacionesWorkflow';

/**
 * Los formatos de cada gestión, y de qué gestiones hay portada.
 *
 * `gc_solicitudes` no es una tabla de contratos ni de solicitudes: guarda **formatos**,
 * con una columna `gestion` y una columna `formato`, y el cuerpo en `jsonb`. Agregar un
 * formato es una entrada acá, su página y su ruta. Nada de base de datos.
 *
 * De este catálogo salen la portada de la gestión —una tarjeta por formato— y el filtro
 * de cada listado. Con una copia en cada sitio, un formato nuevo aparecería en la portada
 * y sus registros acabarían saliendo en la lista del otro.
 */

// ── G. jurídica ──
/** Trámite de contratación: la solicitud (GTH-002-F) y sus documentos. */
export const FORMATO_CONTRATACION = 'GTH-002-F';
/**
 * ⚠️ Claves provisionales: esos formatos no traen código impreso. Cuando se sepan, se
 * cambian acá **y** se actualiza el `formato` de los registros ya creados, que es la
 * columna por la que se listan.
 */
export const FORMATO_TERMINACION = 'ACTA-TERMINACION';
export const FORMATO_TUTELA = 'CONTESTACION-TUTELA';
export const FORMATO_PODER = 'PODER-TUTELA';
export const FORMATO_REQUERIMIENTO = 'REQUERIMIENTO-ACLARACION';
export const FORMATO_RESPUESTA_PETICION = 'RESPUESTA-PETICION';
export const FORMATO_REMISION = 'REMISION-COMPETENCIA';
export const FORMATO_PLAZO = 'PLAZO-ADICIONAL';

// ── G. de talento humano ──
export const FORMATO_PRESTAMO = 'GTH-007-F';
export const FORMATO_PERMISO = 'GTH-009-F';
export const FORMATO_VACACIONES = 'GTH-018-F';
export const FORMATO_HORAS_EXTRAS = 'GTH-016-F';
export const FORMATO_OTROSI_SALARIAL = 'OTROSI-SALARIAL';
export const FORMATO_SUSTITUCION_EMPLEADOR = 'SUSTITUCION-EMPLEADOR';
export const FORMATO_PETICION_INCAPACIDAD = 'PETICION-INCAPACIDAD';
export const FORMATO_CONSTANCIA_TERMINACION_SJC = 'CONSTANCIA-TERMINACION-SJC';
export const FORMATO_NOTIFICACION_TERMINACION_JC = 'NOTIFICACION-TERMINACION-JC';
export const FORMATO_TERMINACION_PERIODO_PRUEBA = 'TERMINACION-PERIODO-PRUEBA';
export const FORMATO_TERMINACION_ANTICIPADA_UNILATERAL = 'TERMINACION-ANTICIPADA-UNILATERAL';

/**
 * Los roles del área dueña de cada gestión, para los formatos marcados `soloDelArea`.
 *
 * Va por gestión y no como una lista suelta porque el día que otra gestión tenga formatos
 * internos —Talento Humano los va a tener— la respuesta no puede ser la misma.
 */
const ROLES_DEL_AREA: Record<string, readonly string[]> = {
  juridica: ['Director Jurídico', 'Coordinador Jurídico', 'Analista Jurídico'],
};

/** El PMO es el comodín transversal del sistema, igual que en el resto de los módulos. */
const ROLES_PMO_FORMATOS = ['Analista PMO', 'Director PMO'];

/** Si a este rol se le muestran los formatos internos de esa gestión. */
export const puedeVerFormatosDelArea = (
  gestion: string,
  nombreRol?: string | null,
): boolean => {
  const rol = (nombreRol ?? '').trim();
  return (ROLES_DEL_AREA[gestion] ?? []).includes(rol) || ROLES_PMO_FORMATOS.includes(rol);
};

/** Columna del listado: cómo se titula y de dónde sale. */
export interface ColumnaListado {
  label: string;
  /** Clave dentro de `data`. */
  campo: string;
}

export interface FormatoDoc {
  /** Segmento de la ruta bajo `/gestion-conocimiento/<gestion>/`. */
  slug: string;
  /** Valor de la columna `formato`. Es lo que separa un listado del otro. */
  formato: string;
  nombre: string;
  descripcion: string;
  Icon: LucideIcon;
  /**
   * Qué muestra su listado. Solo la llevan los formatos que comparten la pantalla de
   * listado genérica —los que no tienen flujo—. El trámite de contratación tiene la suya,
   * con estados y SLA.
   */
  columnas?: ColumnaListado[];
  /** Cómo se nombra un registro suyo en los botones y los vacíos. */
  singular?: string;
  /**
   * El formato es **de trabajo interno del área** y no se le pinta en la portada al resto
   * de la empresa.
   *
   * No es lo mismo que un formato que cualquiera diligencia: el trámite de contratación
   * lo inicia quien necesita contratar, desde cualquier área, mientras que una
   * contestación de tutela o un poder los redacta la Dirección Jurídica y a nadie más le
   * sirven —ni le corresponden—.
   *
   * Esconder la tarjeta no es la restricción de fondo: lo que cada quien alcanza a ver ya
   * lo recorta el servidor en el listado. Esto es para que la portada muestre lo que a
   * cada uno le sirve, en vez de ocho tarjetas de las que siete no puede usar.
   */
  soloDelArea?: boolean;
  /**
   * Cómo se rotula y colorea el estado en el listado. Solo la llevan los formatos con
   * flujo de aprobación; con ella, el listado genérico les pinta la columna «Estado» y
   * protege del borrado los que ya salieron del borrador.
   *
   * Va acá y no en el listado para que la pantalla genérica no tenga que conocer la
   * máquina de estados de cada formato.
   */
  estadoMeta?: { label: (estado: string) => string; badgeClass: (estado: string) => string };
}

export interface GestionFormatos {
  nombre: string;
  subtitulo: string;
  Icon: LucideIcon;
  formatos: FormatoDoc[];
}

export const GESTIONES_FORMATOS: Record<string, GestionFormatos> = {
  juridica: {
    nombre: 'G. jurídica',
    subtitulo: 'Contratación y actas de la Dirección Jurídica',
    Icon: Scale,
    formatos: [
      {
        slug: 'contratos',
        formato: FORMATO_CONTRATACION,
        nombre: 'Trámite de contratación',
        descripcion: 'Solicitud (GTH-002-F) y sus documentos: chequeo, contrato, garantías, acta de inicio y otrosíes',
        Icon: FileSignature,
      },
      {
        slug: 'tutela',
        soloDelArea: true,
        formato: FORMATO_TUTELA,
        nombre: 'Contestación de tutela',
        descripcion: 'Modelo especial de la Dirección Jurídica: contestación de la acción de tutela y solicitud de desvinculación, con módulos de defensa que se activan según el expediente',
        Icon: Gavel,
        singular: 'contestación',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Accionante', campo: 'accionante' },
        ],
      },
      {
        slug: 'poder',
        soloDelArea: true,
        formato: FORMATO_PODER,
        nombre: 'Poder especial para tutela',
        descripcion: 'Poder que confiere el representante legal a la apoderada para contestar la acción de tutela y ejercer la defensa judicial',
        Icon: ScrollText,
        singular: 'poder',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Poderdante', campo: 'repLegal' },
        ],
      },
      {
        slug: 'requerimiento',
        soloDelArea: true,
        formato: FORMATO_REQUERIMIENTO,
        nombre: 'Requerimiento de aclaración',
        descripcion: 'Devolución de un derecho de petición cuya finalidad u objeto no se comprende, para que el peticionario lo aclare (artículo 19 de la Ley 1755 de 2015)',
        Icon: FileQuestion,
        singular: 'requerimiento',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Peticionario', campo: 'peticionario' },
        ],
      },
      {
        slug: 'respuesta-peticion',
        soloDelArea: true,
        formato: FORMATO_RESPUESTA_PETICION,
        nombre: 'Respuesta a derecho de petición',
        descripcion: 'Respuesta de fondo a un derecho de petición: antecedentes, consideraciones y pronunciamiento sobre cada solicitud formulada',
        Icon: MailCheck,
        singular: 'respuesta',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Peticionario', campo: 'peticionario' },
        ],
      },
      {
        slug: 'remision',
        soloDelArea: true,
        formato: FORMATO_REMISION,
        nombre: 'Remisión por competencia',
        descripcion: 'Traslado de un derecho de petición a la autoridad competente, con aviso al peticionario (artículo 21 del CPACA)',
        Icon: Forward,
        singular: 'remisión',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Autoridad competente', campo: 'autoridad' },
        ],
      },
      {
        slug: 'plazo-adicional',
        soloDelArea: true,
        formato: FORMATO_PLAZO,
        nombre: 'Plazo adicional para responder',
        descripcion: 'Aviso al peticionario, antes de que venza el término, de que la respuesta se demora: motivos y fecha cierta en que se resolverá (parágrafo del artículo 14 de la Ley 1755 de 2015)',
        Icon: Hourglass,
        singular: 'comunicación',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Peticionario', campo: 'peticionario' },
          { label: 'Nueva fecha máxima', campo: 'nuevaFecha' },
        ],
      },
    ],
  },

  'talento-humano': {
    nombre: 'G. de talento humano',
    subtitulo: 'Formatos del personal',
    Icon: Users,
    formatos: [
      {
        slug: 'prestamo',
        formato: FORMATO_PRESTAMO,
        nombre: 'Solicitud de préstamo',
        descripcion: 'Préstamo al empleado, descontado de nómina previa aprobación de Gerencia',
        Icon: Banknote,
        singular: 'solicitud',
        columnas: [
          { label: 'Empleado', campo: 'nombreCompleto' },
          { label: 'Valor solicitado', campo: 'valorSolicitado' },
        ],
        estadoMeta: { label: prestamoEstadoLabel, badgeClass: prestamoEstadoBadge },
      },
      {
        slug: 'permiso',
        formato: FORMATO_PERMISO,
        nombre: 'Solicitud de permiso',
        descripcion: 'Permiso del empleado (GTH-009-F): motivo, fecha y horario',
        Icon: CalendarClock,
        singular: 'solicitud',
        columnas: [
          { label: 'Nombre', campo: 'nombre' },
          { label: 'Fecha del permiso', campo: 'fechaPermiso' },
        ],
        estadoMeta: { label: permisoEstadoLabel, badgeClass: permisoEstadoBadge },
      },
      {
        slug: 'vacaciones',
        formato: FORMATO_VACACIONES,
        nombre: 'Solicitud de vacaciones',
        descripcion: 'Vacaciones del empleado (GTH-018-F): periodo solicitado, días a disfrutar y a compensar',
        Icon: Plane,
        singular: 'solicitud',
        columnas: [
          { label: 'Empleado', campo: 'nombres' },
          { label: 'Periodo', campo: 'periodoResumen' },
        ],
        estadoMeta: { label: vacacionesEstadoLabel, badgeClass: vacacionesEstadoBadge },
      },
      {
        slug: 'horas-extras',
        formato: FORMATO_HORAS_EXTRAS,
        nombre: 'Horas extras',
        descripcion: 'Horas extras del personal (GTH-016-F): registro diario y liquidación proyectada',
        Icon: Clock4,
        singular: 'planilla',
        columnas: [
          { label: 'Trabajador', campo: 'nombre' },
          { label: 'Periodo', campo: 'periodo' },
        ],
        estadoMeta: { label: horasExtrasEstadoLabel, badgeClass: horasExtrasEstadoBadge },
      },
      {
        slug: 'terminacion',
        soloDelArea: true,
        formato: FORMATO_TERMINACION,
        nombre: 'Terminación anticipada',
        descripcion: 'Acta de terminación anticipada de mutuo acuerdo a un contrato de prestación de servicios',
        Icon: FileX2,
        singular: 'acta',
        columnas: [
          { label: 'Contratista', campo: 'contratista' },
          { label: 'Contrato suscrito el', campo: 'fechaContrato' },
        ],
      },
      {
        slug: 'otrosi-salarial',
        soloDelArea: true,
        formato: FORMATO_OTROSI_SALARIAL,
        nombre: 'Otrosí de modificación salarial',
        descripcion: 'Otrosí de modificación salarial a un contrato individual de trabajo a término indefinido',
        Icon: Banknote,
        singular: 'otrosí',
        columnas: [
          { label: 'Trabajador', campo: 'nombre' },
          { label: 'Cargo', campo: 'cargo' },
        ],
      },
      {
        slug: 'sustitucion-empleador',
        soloDelArea: true,
        formato: FORMATO_SUSTITUCION_EMPLEADOR,
        nombre: 'Sustitución de empleador',
        descripcion: 'Acta de sustitución de empleador y continuidad laboral',
        Icon: Users,
        singular: 'acta',
        columnas: [
          { label: 'Trabajador', campo: 'trabajador' },
          { label: 'Sustitución efectiva', campo: 'fechaSustitucion' },
        ],
      },
      {
        slug: 'peticion-incapacidad',
        soloDelArea: true,
        formato: FORMATO_PETICION_INCAPACIDAD,
        nombre: 'Derecho de petición — incapacidad',
        descripcion: 'Derecho de petición ante la EPS/EOC: solicitud de reconocimiento y pago de incapacidad',
        Icon: HeartPulse,
        singular: 'petición',
        columnas: [
          { label: 'Trabajador', campo: 'trabajador' },
          { label: 'Incapacidad N.º', campo: 'incapacidadNumero' },
        ],
      },
      {
        slug: 'constancia-terminacion-sjc',
        soloDelArea: true,
        formato: FORMATO_CONSTANCIA_TERMINACION_SJC,
        nombre: 'Constancia de terminación sin justa causa',
        descripcion: 'Constancia de comunicación de terminación sin justa causa y negativa a firmar recibido',
        Icon: FileX2,
        singular: 'constancia',
        columnas: [
          { label: 'Trabajador', campo: 'nombreTrabajador' },
          { label: 'Fecha efectiva', campo: 'fechaEfectiva' },
        ],
      },
      {
        slug: 'notificacion-terminacion-jc',
        soloDelArea: true,
        formato: FORMATO_NOTIFICACION_TERMINACION_JC,
        nombre: 'Notificación de terminación con justa causa',
        descripcion: 'Notificación de terminación del contrato de trabajo con justa causa (modelo de uso especial)',
        Icon: FileX2,
        singular: 'notificación',
        columnas: [
          { label: 'Trabajador', campo: 'nombreTrabajador' },
          { label: 'Fecha de la decisión', campo: 'fechaDecision' },
        ],
      },
      {
        slug: 'terminacion-periodo-prueba',
        soloDelArea: true,
        formato: FORMATO_TERMINACION_PERIODO_PRUEBA,
        nombre: 'Terminación en período de prueba',
        descripcion: 'Terminación del contrato de trabajo durante el período de prueba',
        Icon: FileX2,
        singular: 'comunicación',
        columnas: [
          { label: 'Trabajador', campo: 'nombreTrabajador' },
          { label: 'Fecha efectiva', campo: 'fechaEfectiva' },
        ],
      },
      {
        slug: 'terminacion-anticipada-unilateral',
        soloDelArea: true,
        formato: FORMATO_TERMINACION_ANTICIPADA_UNILATERAL,
        nombre: 'Terminación anticipada unilateral (prestación)',
        descripcion: 'Notificación de terminación anticipada unilateral de un contrato de prestación de servicios',
        Icon: FileX2,
        singular: 'notificación',
        columnas: [
          { label: 'Contratista', campo: 'contratista' },
          { label: 'Fecha efectiva', campo: 'fechaEfectiva' },
        ],
      },
    ],
  },
};

export const getGestion = (gestion: string): GestionFormatos | undefined =>
  GESTIONES_FORMATOS[gestion];

export const getFormato = (gestion: string, slug: string): FormatoDoc | undefined =>
  GESTIONES_FORMATOS[gestion]?.formatos.find((f) => f.slug === slug);

export const rutaFormato = (gestion: string, slug: string) =>
  `/dashboard/gestion-conocimiento/${gestion}/${slug}`;

export const rutaGestion = (gestion: string) =>
  `/dashboard/gestion-conocimiento/${gestion}`;
