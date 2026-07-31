/**
 * Flujo de G. jurídica (fase 1) en el frontend: metadatos de estados, acciones
 * disponibles por rol/estado, y cálculo del SLA en días hábiles descontando los
 * festivos de Colombia. Espeja la máquina de estados del backend.
 */

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
  en_aprobacion_polizas: { label: 'Aprobación de pólizas (Jurídica)', sla: 1, tone: 'violet' },
  en_pago_polizas: { label: 'Pago de pólizas (Administrativa)', sla: 1, tone: 'blue' },
  en_verificacion_garantias: { label: 'Verificación de garantías (Jurídica)', sla: 2, tone: 'violet' },
  // ── Fase 2 ──
  en_designacion_supervisor: { label: 'Designación de supervisor (Jurídica)', sla: 2, tone: 'violet' },
  en_acta_inicio: { label: 'Acta de inicio (Jurídica)', sla: 2, tone: 'violet' },
  finalizado: { label: 'Contrato en ejecución', sla: null, tone: 'green' },
};

const ROLES_ADMINISTRATIVA = ['Director Financiero y Administrativo', 'Analista Administrativo'];
const ROLES_JURIDICA = ['Director Jurídico', 'Coordinador Jurídico', 'Analista Jurídico'];
const ROLES_GERENCIA_PROYECTOS = ['Gerencia de Proyectos']; // autoriza la solicitud ("Autorizado por")
const ROLES_GERENCIA = ['Gerencia']; // aprueba/firma el contrato ("Aprobado por" · Dra. Gloria)
const ROL_PMO = 'Analista PMO';

export interface Transicion {
  accion: string;
  from: JuridicaEstado;
  to: JuridicaEstado;
  roles: string[];
  soloCreador?: boolean;
  requiereMotivo?: boolean;
  label: string;
  tone: 'primary' | 'danger';
}

export const TRANSICIONES: Transicion[] = [
  { accion: 'enviar', from: 'borrador', to: 'pendiente_autorizacion_gp', roles: [], soloCreador: true, label: 'Enviar a autorización', tone: 'primary' },
  { accion: 'autorizar_gp', from: 'pendiente_autorizacion_gp', to: 'pendiente_firma_gerencia', roles: ROLES_GERENCIA_PROYECTOS, label: 'Autorizar y enviar a firma de Gerencia', tone: 'primary' },
  { accion: 'rechazar_gp', from: 'pendiente_autorizacion_gp', to: 'borrador', roles: ROLES_GERENCIA_PROYECTOS, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
  { accion: 'aprobar_gerencia', from: 'pendiente_firma_gerencia', to: 'en_tramite_administrativa', roles: ROLES_GERENCIA, label: 'Firmar y remitir a Administrativa', tone: 'primary' },
  { accion: 'rechazar_gerencia', from: 'pendiente_firma_gerencia', to: 'borrador', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Rechazar la solicitud', tone: 'danger' },
  { accion: 'tramitar', from: 'en_tramite_administrativa', to: 'contrato_en_elaboracion', roles: ROLES_ADMINISTRATIVA, label: 'Trámite validado · remitir a Jurídica', tone: 'primary' },
  { accion: 'devolver_tramite', from: 'en_tramite_administrativa', to: 'borrador', roles: ROLES_ADMINISTRATIVA, requiereMotivo: true, label: 'Devolver (faltan documentos/campos)', tone: 'danger' },
  { accion: 'contrato_listo', from: 'contrato_en_elaboracion', to: 'pendiente_firma_contrato', roles: ROLES_JURIDICA, label: 'Contrato listo · enviar a firma', tone: 'primary' },
  { accion: 'firmar_contrato', from: 'pendiente_firma_contrato', to: 'contrato_firmado', roles: ROLES_GERENCIA, label: 'Firmar el contrato', tone: 'primary' },
  { accion: 'rechazar_contrato', from: 'pendiente_firma_contrato', to: 'contrato_en_elaboracion', roles: ROLES_GERENCIA, requiereMotivo: true, label: 'Devolver el contrato a Jurídica', tone: 'danger' },
  // ── Pólizas (tras la firma del contrato) ──
  { accion: 'solicitar_polizas', from: 'contrato_firmado', to: 'en_solicitud_polizas', roles: [...ROLES_ADMINISTRATIVA, ...ROLES_JURIDICA], label: 'Iniciar solicitud de pólizas', tone: 'primary' },
  { accion: 'polizas_solicitadas', from: 'en_solicitud_polizas', to: 'en_aprobacion_polizas', roles: ROLES_ADMINISTRATIVA, label: 'Pólizas solicitadas · enviar a aprobación (Jurídica)', tone: 'primary' },
  { accion: 'aprobar_polizas', from: 'en_aprobacion_polizas', to: 'en_pago_polizas', roles: ROLES_JURIDICA, label: 'Aprobar pólizas · enviar a pago', tone: 'primary' },
  { accion: 'rechazar_polizas', from: 'en_aprobacion_polizas', to: 'en_solicitud_polizas', roles: ROLES_JURIDICA, requiereMotivo: true, label: 'Devolver pólizas (rechazar)', tone: 'danger' },
  { accion: 'pagar_polizas', from: 'en_pago_polizas', to: 'en_verificacion_garantias', roles: ROLES_ADMINISTRATIVA, label: 'Póliza pagada · verificar garantías', tone: 'primary' },
  { accion: 'garantias_verificadas', from: 'en_verificacion_garantias', to: 'en_designacion_supervisor', roles: ROLES_JURIDICA, label: 'Garantías verificadas · designar supervisor', tone: 'primary' },
  { accion: 'devolver_garantias', from: 'en_verificacion_garantias', to: 'en_solicitud_polizas', roles: ROLES_JURIDICA, requiereMotivo: true, label: 'Devolver (la garantía no cumple)', tone: 'danger' },
  // ── Fase 2 ──
  { accion: 'designar_supervisor', from: 'en_designacion_supervisor', to: 'en_acta_inicio', roles: ROLES_JURIDICA, label: 'Supervisor designado · elaborar acta de inicio', tone: 'primary' },
  { accion: 'acta_inicio_lista', from: 'en_acta_inicio', to: 'finalizado', roles: ROLES_JURIDICA, label: 'Acta de inicio firmada · finalizar', tone: 'primary' },
];

/** Acciones que el usuario (por su rol) puede ejecutar sobre una solicitud en cierto estado. */
export function accionesDisponibles(
  estado: JuridicaEstado,
  nombreRol: string | undefined,
  esCreador: boolean,
): Transicion[] {
  const rol = nombreRol ?? '';
  const esPmo = rol === ROL_PMO;
  return TRANSICIONES.filter((t) => {
    if (t.from !== estado) return false;
    if (esPmo) return true;
    if (t.roles.includes(rol)) return true;
    if (t.soloCreador && esCreador) return true;
    return false;
  });
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

export interface SlaInfo {
  vence: Date;
  vencida: boolean;
  diasHabiles: number;
}

/** Calcula el vencimiento del SLA del estado actual. Null si el estado no tiene plazo. */
export function calcularSla(estado: JuridicaEstado, estadoDesde: string | null): SlaInfo | null {
  const sla = ESTADOS[estado]?.sla;
  if (!sla || !estadoDesde) return null;
  const vence = sumarDiasHabiles(new Date(estadoDesde), sla);
  // El vencimiento es al cierre del día hábil.
  vence.setHours(23, 59, 59, 999);
  return { vence, vencida: new Date() > vence, diasHabiles: sla };
}

const TONE_CLASSES: Record<EstadoMeta['tone'], string> = {
  gray: 'bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))]',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-green-100 text-green-800',
};

export const estadoLabel = (estado: string) => ESTADOS[estado as JuridicaEstado]?.label ?? estado;
export const estadoBadgeClass = (estado: string) =>
  TONE_CLASSES[ESTADOS[estado as JuridicaEstado]?.tone ?? 'gray'];
