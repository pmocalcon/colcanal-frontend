import {
  Banknote, CalendarClock, Clock4, FileSignature, FileX2, Gavel, Plane, Scale, Users,
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

// ── G. de talento humano ──
export const FORMATO_PRESTAMO = 'GTH-007-F';
export const FORMATO_PERMISO = 'GTH-009-F';
export const FORMATO_VACACIONES = 'GTH-018-F';
export const FORMATO_HORAS_EXTRAS = 'GTH-016-F';

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
        slug: 'terminacion',
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
        slug: 'tutela',
        formato: FORMATO_TUTELA,
        nombre: 'Contestación de tutela',
        descripcion: 'Contestación de la acción de tutela y solicitud de desvinculación de la representada',
        Icon: Gavel,
        singular: 'contestación',
        columnas: [
          { label: 'Radicado', campo: 'radicado' },
          { label: 'Accionante', campo: 'accionante' },
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
