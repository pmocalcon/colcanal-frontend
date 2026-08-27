/**
 * Flujo de G. jurídica (fase 1) en el frontend: metadatos de estados, acciones
 * disponibles por rol/estado, y cálculo del SLA en días hábiles descontando los
 * festivos de Colombia. Espeja la máquina de estados del backend.
 */

import { esRolPmo } from './rolesPmo';

export type JuridicaEstado =
  | 'borrador'
  | 'pendiente_autorizacion_gp'
  | 'pendiente_firma_gerencia'
  | 'en_tramite_administrativa'
  | 'contrato_en_elaboracion'
  | 'pendiente_firma_contrato'
  | 'contrato_firmado'
  // Pólizas
  | 'en_solicitud_polizas'
  | 'en_aprobacion_polizas'
  | 'en_pago_polizas'
  | 'en_verificacion_garantias'
  // Fase 2
  | 'en_designacion_supervisor'
  | 'en_acta_inicio'
  | 'finalizado';

interface EstadoMeta {
  label: string;
  sla: number | null; // días hábiles objetivo
  tone: 'gray' | 'amber' | 'blue' | 'violet' | 'green';
}

export const ESTADOS: Record<JuridicaEstado, EstadoMeta> = {
  borrador: { label: 'Borrador', sla: null, tone: 'gray' },
  pendiente_autorizacion_gp: { label: 'Pendiente de autorización (Gerencia de Proyectos)', sla: 1, tone: 'amber' },
  pendiente_firma_gerencia: { label: 'Pendiente de firma de Gerencia (Dra. Gloria)', sla: 1, tone: 'amber' },
  en_tramite_administrativa: { label: 'En trámite (Administrativa)', sla: 3, tone: 'blue' },
  contrato_en_elaboracion: { label: 'Contrato en revisión (Jurídica)', sla: 3, tone: 'violet' },
  pendiente_firma_contrato: { label: 'Pendiente de firma del contrato', sla: 1, tone: 'amber' },
  contrato_firmado: { label: 'Contrato firmado', sla: null, tone: 'green' },
  // ── Pólizas ──
  en_solicitud_polizas: { label: 'Solicitud de pólizas (Administrativa)', sla: 1, tone: 'amber' },
  // Heredado: ya no se entra aquí (Jurídica no aprueba pólizas). Se conserva para
  // las solicitudes que quedaron en este estado y para leer su historial.
  en_aprobacion_polizas: { label: 'Aprobación de pólizas (Jurídica)', sla: 1, tone: 'violet' },
  en_pago_polizas: { label: 'Pago de pólizas (Administrativa)', sla: 1, tone: 'blue' },
  en_verificacion_garantias: { label: 'Verificación de garantías (Jurídica)', sla: 2, tone: 'violet' },
  // ── Fase 2 ──
  en_designacion_supervisor: { label: 'Designación de supervisor (Jurídica)', sla: 2, tone: 'violet' },
  en_acta_inicio: { label: 'Acta de inicio (Jurídica)', sla: 2, tone: 'violet' },
  finalizado: { label: 'Contrato en ejecución', sla: null, tone: 'green' },
};

/**
 * Los estados en el orden en que ocurren. `ESTADOS` se declara siguiendo el flujo, así
 * que de ahí sale sin repetir la lista. Espejo de `ORDEN_ESTADOS` del backend.
 */
export const ORDEN_ESTADOS = Object.keys(ESTADOS) as JuridicaEstado[];

/** ¿El trámite ya pasó por `desde` (o está en él)? Falso si el estado no existe. */
export const estadoAlcanzo = (estado: string | undefined | null, desde: JuridicaEstado): boolean => {
  const i = ORDEN_ESTADOS.indexOf(estado as JuridicaEstado);
  return i >= 0 && i >= ORDEN_ESTADOS.indexOf(desde);
};

export const ROLES_ADMINISTRATIVA = ['Director Financiero y Administrativo', 'Analista Administrativo'];
export const ROLES_JURIDICA = ['Director Jurídico', 'Coordinador Jurídico', 'Analista Jurídico'];
const ROLES_GERENCIA_PROYECTOS = ['Gerencia de Proyectos']; // autoriza la solicitud ("Autorizado por")
const ROLES_GERENCIA = ['Gerencia']; // aprueba/firma el contrato ("Aprobado por" · Dra. Gloria)

/**
 * Los documentos del trámite. Son también las pestañas de la cabecera
 * (`TabsDocumentos`), que toma de aquí su tipo: la lista es una sola.
 *
 * El otrosí es el único que no pertenece al flujo: no lo pide ninguna etapa ni lo espera
 * ninguna transición. Es lo que se firma **después**, cuando un contrato ya en ejecución
 * se prorroga o se le adiciona valor, y puede haber varios sobre el mismo contrato.
 */
export type DocumentoJuridica =
  | 'solicitud' | 'chequeo' | 'antecedentes' | 'contrato'
  | 'verificacion-garantias' | 'aprobacion-garantias'
  | 'designacion-supervisor' | 'acta-inicio'
  | 'otrosi';

/** Cómo se llama cada documento cuando hay que mandar al usuario a él. */
export const DOCUMENTO_LABEL: Record<DocumentoJuridica, string> = {
  solicitud: 'Solicitud',
  chequeo: 'Lista de chequeo',
  antecedentes: 'Antecedentes',
  contrato: 'Contrato',
  'verificacion-garantias': 'Verificación de garantías',
  'aprobacion-garantias': 'Aprobación de garantías',
  'designacion-supervisor': 'Designación supervisor',
  'acta-inicio': 'Acta de inicio',
  otrosi: 'Otrosí',
};

export interface Transicion {
  accion: string;
  from: JuridicaEstado;
  to: JuridicaEstado;
  roles: string[];
  soloCreador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
  /**
   * En qué documento se ejecuta la acción: el que se acaba de diligenciar y que
   * justifica el paso. "Trámite validado" se decide leyendo la lista de chequeo, no
   * la solicitud, así que el botón vive allá. Las que no tienen documento propio
   * —enviar a autorización, las firmas, el ciclo de pólizas— se quedan en la
   * solicitud, que es donde se ve el flujo completo.
   */
  documento: DocumentoJuridica;
}

export const TRANSICIONES: Transicion[] = [
  // A dónde llega la decide el backend con el rol de quien la montó: un Director de Área
  // no tiene a quién pedirle autorización por encima y va directo a la firma de Gerencia.
  // Por eso la etiqueta no nombra el paso siguiente — sería falsa la mitad de las veces.
  { accion: 'enviar', from: 'borrador', to: 'pendiente_autorizacion_gp', roles: [], soloCreador: true, label: 'Enviar la solicitud', tone: 'primary', documento: 'solicitud' },
  { accion: 'autorizar_gp', from: 'pendiente_autorizacion_gp', to: 'pendiente_firma_gerencia', roles: ROLES_GERENCIA_PROYECTOS, label: 'Autorizar y enviar a firma de Gerencia', tone: 'primary', documento: 'solicitud' },
  { accion: 'rechazar_gp', from: 'pendiente_autorizacion_gp', to: 'borrador', roles: ROLES_GERENCIA_PROYECTOS, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger', documento: 'solicitud' },
  { accion: 'aprobar_gerencia', from: 'pendiente_firma_gerencia', to: 'en_tramite_administrativa', roles: ROLES_GERENCIA, label: 'Firmar y remitir a Administrativa', tone: 'primary', documento: 'solicitud' },
  { accion: 'rechazar_gerencia', from: 'pendiente_firma_gerencia', to: 'borrador', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger', documento: 'solicitud' },
  // Administrativa valida el trámite leyendo la lista de chequeo: el botón va allá.
  { accion: 'tramitar', from: 'en_tramite_administrativa', to: 'contrato_en_elaboracion', roles: ROLES_ADMINISTRATIVA, label: 'Trámite validado · remitir a Jurídica', tone: 'primary', documento: 'chequeo' },
  { accion: 'devolver_tramite', from: 'en_tramite_administrativa', to: 'borrador', roles: ROLES_ADMINISTRATIVA, requiereMotivo: true, label: 'Devolver (faltan documentos/campos)', tone: 'danger', documento: 'chequeo' },
  { accion: 'contrato_listo', from: 'contrato_en_elaboracion', to: 'pendiente_firma_contrato', roles: ROLES_JURIDICA, label: 'Contrato listo · enviar a firma', tone: 'primary', documento: 'contrato' },
  // El camino de vuelta de "tramitar", y por eso vive en el mismo documento: lo que
  // Jurídica está mirando cuando decide devolver es la lista de chequeo. Retrocede un
  // solo paso —no a borrador—: lo que hay que rehacer es la verificación de documentos,
  // no la solicitud ni las dos firmas de autorización que ya se dieron.
  { accion: 'devolver_juridica', from: 'contrato_en_elaboracion', to: 'en_tramite_administrativa', roles: ROLES_JURIDICA, requiereMotivo: true, label: 'Devolver a Administrativa', tone: 'danger', documento: 'chequeo' },
  { accion: 'firmar_contrato', from: 'pendiente_firma_contrato', to: 'contrato_firmado', roles: ROLES_GERENCIA, label: 'Firmar el contrato', tone: 'primary', documento: 'contrato' },
  { accion: 'rechazar_contrato', from: 'pendiente_firma_contrato', to: 'contrato_en_elaboracion', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Devolver el contrato a Jurídica', tone: 'danger', documento: 'contrato' },
  // ── Pólizas (tras la firma del contrato) ──
  // No tienen documento propio en el sistema: la póliza la expide la aseguradora y lo
  // que se registra es el pago. Se quedan en la solicitud.
  { accion: 'solicitar_polizas', from: 'contrato_firmado', to: 'en_solicitud_polizas', roles: [...ROLES_ADMINISTRATIVA, ...ROLES_JURIDICA], label: 'Iniciar solicitud de pólizas', tone: 'primary', documento: 'solicitud' },
  // Jurídica no aprueba pólizas: de la solicitud se pasa al pago. Lo que Jurídica
  // revisa es la garantía recibida, en "Verificación de garantías".
  { accion: 'polizas_solicitadas', from: 'en_solicitud_polizas', to: 'en_pago_polizas', roles: ROLES_ADMINISTRATIVA, label: 'Póliza expedida · pasar a pago', tone: 'primary', documento: 'solicitud' },
  // Heredado: salida para las solicitudes que quedaron en aprobación de Jurídica.
  { accion: 'aprobar_polizas', from: 'en_aprobacion_polizas', to: 'en_pago_polizas', roles: [...ROLES_ADMINISTRATIVA, ...ROLES_JURIDICA], label: 'Continuar · registrar el pago', tone: 'primary', documento: 'solicitud' },
  { accion: 'pagar_polizas', from: 'en_pago_polizas', to: 'en_verificacion_garantias', roles: ROLES_ADMINISTRATIVA, label: 'Póliza pagada · verificar garantías', tone: 'primary', documento: 'solicitud' },
  { accion: 'garantias_verificadas', from: 'en_verificacion_garantias', to: 'en_designacion_supervisor', roles: ROLES_JURIDICA, label: 'Garantías verificadas · designar supervisor', tone: 'primary', documento: 'verificacion-garantias' },
  { accion: 'devolver_garantias', from: 'en_verificacion_garantias', to: 'en_solicitud_polizas', roles: ROLES_JURIDICA, requiereMotivo: true, label: 'Devolver (la garantía no cumple)', tone: 'danger', documento: 'verificacion-garantias' },
  // ── Fase 2 ──
  { accion: 'designar_supervisor', from: 'en_designacion_supervisor', to: 'en_acta_inicio', roles: ROLES_JURIDICA, label: 'Supervisor designado · elaborar acta de inicio', tone: 'primary', documento: 'designacion-supervisor' },
  { accion: 'acta_inicio_lista', from: 'en_acta_inicio', to: 'finalizado', roles: ROLES_JURIDICA, label: 'Acta de inicio firmada · finalizar', tone: 'primary', documento: 'acta-inicio' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre una solicitud en cierto estado. */
export function accionesDisponibles(
  estado: JuridicaEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): Transicion[] {
  const rol = nombreRol ?? '';
  const esPmo = esRolPmo(rol);
  return TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.roles.includes(rol)) return true;
    if (t.soloCreador && esCreador) return true;
    return false;
  });
}

/**
 * Documentos, distintos del actual, donde hay una acción esperando a este usuario.
 * Con esto la solicitud puede decir "esto se hace en la Lista de chequeo" en vez de
 * dejar la etapa sin botón y sin explicación.
 */
export function documentosConAccion(
  estado: JuridicaEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
  salvo: DocumentoJuridica,
): DocumentoJuridica[] {
  const docs = accionesDisponibles(estado, nombreRol, esCreador)
    .map((a) => a.documento)
    .filter((d) => d !== salvo);
  return [...new Set(docs)];
}

// ── Festivos de Colombia (Ley Emiliani + Semana Santa) ──────────────────

/** Domingo de Pascua (algoritmo de Butcher, calendario gregoriano). */
function pascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** Traslada al lunes siguiente (Ley Emiliani); si ya es lunes, no cambia. */
const trasladarLunes = (d: Date) => addDays(d, (8 - (d.getDay() || 7)) % 7);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const holidayCache = new Map<number, Set<string>>();

function festivosDeAnio(anio: number): Set<string> {
  const cached = holidayCache.get(anio);
  if (cached) return cached;

  const fijos = [
    new Date(anio, 0, 1),   // Año Nuevo
    new Date(anio, 4, 1),   // Día del Trabajo
    new Date(anio, 6, 20),  // Independencia
    new Date(anio, 7, 7),   // Batalla de Boyacá
    new Date(anio, 11, 8),  // Inmaculada Concepción
    new Date(anio, 11, 25), // Navidad
  ];

  const emiliani = [
    new Date(anio, 0, 6),   // Reyes Magos
    new Date(anio, 2, 19),  // San José
    new Date(anio, 5, 29),  // San Pedro y San Pablo
    new Date(anio, 7, 15),  // Asunción de la Virgen
    new Date(anio, 9, 12),  // Día de la Raza
    new Date(anio, 10, 1),  // Todos los Santos
    new Date(anio, 10, 11), // Independencia de Cartagena
  ].map(trasladarLunes);

  const p = pascua(anio);
  const pascuales = [
    addDays(p, -3), // Jueves Santo
    addDays(p, -2), // Viernes Santo
    trasladarLunes(addDays(p, 39)), // Ascensión del Señor
    trasladarLunes(addDays(p, 60)), // Corpus Christi
    trasladarLunes(addDays(p, 68)), // Sagrado Corazón
  ];

  const set = new Set<string>([...fijos, ...emiliani, ...pascuales].map(iso));
  holidayCache.set(anio, set);
  return set;
}

function esDiaHabil(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !festivosDeAnio(d.getFullYear()).has(iso(d));
}

/** Suma N días hábiles a partir de una fecha (excluye fines de semana y festivos). */
export function sumarDiasHabiles(desde: Date, n: number): Date {
  let cursor = new Date(desde);
  let restantes = n;
  while (restantes > 0) {
    cursor = addDays(cursor, 1);
    if (esDiaHabil(cursor)) restantes--;
  }
  return cursor;
}

/**
 * Días hábiles entre dos fechas, sin contar el día de partida.
 *
 * Negativo cuando `hasta` ya pasó: son los días de atraso.
 */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde);
  a.setHours(0, 0, 0, 0);
  const b = new Date(hasta);
  b.setHours(0, 0, 0, 0);

  const signo = b >= a ? 1 : -1;
  const cursor = signo > 0 ? new Date(a) : new Date(b);
  const fin = signo > 0 ? b : a;

  let n = 0;
  while (cursor < fin) {
    cursor.setDate(cursor.getDate() + 1);
    if (esDiaHabil(cursor)) n++;
  }
  return n * signo;
}

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  /** El plazo del estado: cuántos días hábiles se dieron. */
  diasHabiles: number;
  /** Cuántos faltan desde hoy. Negativo si ya se pasó. */
  restantes: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: JuridicaEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = ESTADOS[estado]?.sla;
  if (!sla || !estadoDesde) return null;
  const vence = sumarDiasHabiles(new Date(estadoDesde), sla);
  // El vencimiento es al cierre del día hábil.
  vence.setHours(23, 59, 59, 999);
  const ahora = new Date();
  return {
    vence,
    vencida: ahora > vence,
    diasHabiles: sla,
    restantes: diasHabilesEntre(ahora, vence),
  };
}

/**
 * El texto del distintivo de plazo.
 *
 * Dice **cuánto falta**, no cuánto se dio. Antes decía «vence 18/08/2026 (3 días háb.)»,
 * donde el 3 era el plazo del estado; pegado a una fecha de vencimiento eso se lee como
 * los días que quedan, y no eran los que quedaban. Quien mira esto quiere saber si le da
 * el tiempo, y el plazo del estado no responde esa pregunta.
 *
 * Vive acá y no en cada pantalla porque son tres las que lo pintan —la solicitud, el
 * anticipo y su legalización— y ya se habían desincronizado una vez.
 */
export function textoSla(sla: { vence: Date; vencida: boolean; restantes: number }): string {
  const fecha = sla.vence.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const dias = (n: number) => `${n} día${n !== 1 ? 's' : ''} háb.`;

  if (sla.vencida) return `Vencida · venció ${fecha} · ${dias(Math.abs(sla.restantes))} de atraso`;
  if (sla.restantes <= 0) return `A tiempo · vence hoy, ${fecha}`;
  const queda = sla.restantes === 1 ? 'queda' : 'quedan';
  return `A tiempo · vence ${fecha} · ${queda} ${dias(sla.restantes)}`;
}

/**
 * Los estados en la paleta de la sección: tinta sobre neutro, y el amarillo reservado
 * para lo que espera a una persona —una autorización, una firma, una póliza—, que es
 * lo que hay que mirar al abrir la lista.
 *
 * `blue` y `violet` distinguían Administrativa de Jurídica y ahora comparten el mismo
 * neutro: la etiqueta ya dice de quién es la etapa y el color no añadía nada.
 * El verde se conserva: un contrato en ejecución pintado del mismo gris que un
 * borrador se leería como un trámite sin empezar.
 */
const TONE_CLASSES: Record<EstadoMeta['tone'], string> = {
  gray: 'bg-[#eeeef5] text-[#4a4a63]',
  amber: 'bg-[#fff8b0] text-[#16162b] border border-[#e0cc00]',
  blue: 'bg-[#eeeef5] text-[#16162b]',
  violet: 'bg-[#eeeef5] text-[#16162b]',
  green: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
};

export const estadoLabel = (estado: string) => ESTADOS[estado as JuridicaEstado]?.label ?? estado;

/** Acción de la creación. No es una transición: la solicitud nace en borrador. */
export const ACCION_CREACION = 'creacion_solicitud';

/**
 * Acciones que el flujo ya no ofrece pero que están en bitácoras viejas.
 *
 * `iniciar_designacion` pasaba del contrato firmado directo a la designación del
 * supervisor, antes de que las pólizas entraran al flujo. Los contratos que se
 * tramitaron así siguen existiendo y su historial tiene que poder leerse. No
 * vuelven a TRANSICIONES: eso es lo que decide qué se puede hacer hoy.
 */
const ACCIONES_RETIRADAS: Record<string, string> = {
  iniciar_designacion: 'Iniciar designación de supervisor',
};

/**
 * Qué se hizo en una entrada del historial, y si fue una devolución.
 *
 * La bitácora guardaba solo el estado en que quedó la solicitud, y así una
 * devolución era indistinguible de cualquier otro paso: «Borrador · Jorge Fong»
 * tanto si la envió como si se la rechazaron. El nombre de la acción es lo que
 * de verdad se audita.
 */
export const accionInfo = (
  accion: string,
): { label: string; devuelve: boolean } | null => {
  if (accion === ACCION_CREACION) return { label: 'Solicitud creada', devuelve: false };
  const t = TRANSICIONES.find((x) => x.accion === accion);
  if (t) return { label: t.label, devuelve: t.tone === 'danger' };
  const retirada = ACCIONES_RETIRADAS[accion];
  return retirada ? { label: retirada, devuelve: false } : null;
};
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[ESTADOS[estado as JuridicaEstado]?.tone ?? 'gray'];
