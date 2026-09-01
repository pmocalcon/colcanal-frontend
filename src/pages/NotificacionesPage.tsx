import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, Bell, CheckCircle2, XCircle, ShoppingCart, Package, ClipboardCheck, FileText, ClipboardList, Compass, Trash2, RotateCcw, Wallet, CalendarClock, Banknote, Clock4, Users, FileSignature, AlertTriangle, Receipt, PlayCircle, Send } from 'lucide-react';
import { Footer } from '@/components/ui/footer';

/**
 * Catálogo de los correos que el sistema despacha. Cada tarjeta es un envío real:
 * los de compras y obras salen de `notifications.service.ts`, y los de gestión del
 * conocimiento de las máquinas de estados de cada formato, que declaran a quién se
 * avisa al entrar a cada estado.
 *
 * Es documentación, no configuración: no hay interruptores porque los correos no se
 * apagan uno por uno. Al agregar un flujo nuevo hay que agregar su tarjeta acá, o la
 * pantalla pasa a decir menos de lo que el sistema hace.
 */
const NOTIFICATION_TYPES = [
  // ── Requisiciones (compras) ──
  {
    icon: ClipboardCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Nueva requisición para revisión',
    description: 'Se envía al revisor asignado cuando se crea una nueva requisición pendiente de revisión.',
    trigger: 'Al crear una requisición',
  },
  {
    icon: Compass,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    title: 'Requisición pendiente de validación',
    description: 'Se envía al Director de Proyecto para validar una obra especial antes de que pase a revisión.',
    trigger: 'Al enviar a validación',
  },
  {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Requisición validada',
    description: 'Se envía al solicitante cuando el Director de Proyecto valida la requisición y pasa a revisión.',
    trigger: 'Al validar',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Requisición rechazada en validación',
    description: 'Se envía al solicitante cuando el Director de Proyecto la rechaza en la etapa de validación.',
    trigger: 'Al rechazar en validación',
  },
  {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Requisición aprobada en revisión',
    description: 'Se envía al solicitante cuando su requisición es aprobada por el revisor.',
    trigger: 'Al aprobar en revisión',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Requisición rechazada',
    description: 'Se envía al solicitante cuando su requisición es rechazada en cualquier etapa del proceso.',
    trigger: 'Al rechazar en revisión',
  },
  {
    icon: Bell,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    title: 'Requisición pendiente de aprobación',
    description: 'Se envía al aprobador (gerencia) cuando una requisición pasa a la etapa de aprobación final.',
    trigger: 'Al pasar a aprobación gerencial',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Requisición aprobada por gerencia',
    description: 'Se envía al solicitante cuando gerencia aprueba la requisición.',
    trigger: 'Al aprobar en gerencia',
  },
  {
    icon: ShoppingCart,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    title: 'Requisición lista para cotizar',
    description: 'Se envía al equipo de compras cuando una requisición está lista para iniciar el proceso de cotización.',
    trigger: 'Al iniciar cotización',
  },
  {
    icon: Trash2,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    title: 'Solicitud de anulación',
    description: 'Se envía a la Directora Financiera cuando Compras solicita anular una requisición.',
    trigger: 'Al solicitar anulación',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Anulación aprobada',
    description: 'Se envía al solicitante cuando la Directora Financiera aprueba la anulación y la requisición queda anulada.',
    trigger: 'Al aprobar anulación',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Anulación rechazada',
    description: 'Se envía al solicitante cuando la Directora Financiera rechaza la solicitud de anulación.',
    trigger: 'Al rechazar anulación',
  },
  {
    icon: Package,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    title: 'Orden de compra emitida',
    description: 'Se notifica al solicitante cuando se genera una orden de compra para su requisición.',
    trigger: 'Al generar orden de compra',
  },

  // ── Levantamientos (obras) ──
  {
    icon: ClipboardList,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Levantamiento pendiente de revisión',
    description: 'Se envía al revisor técnico cuando un levantamiento pasa a estado de revisión.',
    trigger: 'Al enviar levantamiento a revisión',
  },
  {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Levantamiento revisado',
    description: 'Se notifica al creador cuando su levantamiento es aprobado o rechazado.',
    trigger: 'Al revisar el levantamiento',
  },
  {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Bloque de levantamiento revisado',
    description: 'Se notifica al creador cuando presupuesto, inversión, materiales o viajes son aprobados o rechazados.',
    trigger: 'Al revisar un bloque',
  },
  {
    icon: RotateCcw,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Levantamiento reabierto',
    description: 'Se notifica al creador cuando su levantamiento se reabre para edición.',
    trigger: 'Al reabrir un levantamiento',
  },

  // ── Actas ──
  {
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Acta pendiente de revisión técnica',
    description: 'Se envía a Director Técnico y PMO cuando un acta es enviada a revisión.',
    trigger: 'Al enviar acta a revisión',
  },
  {
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Acta revisada o devuelta',
    description: 'Se notifica al creador cuando el acta pasa la revisión técnica (a aprobación) o se devuelve a borrador.',
    trigger: 'Al revisar técnicamente el acta',
  },
  {
    icon: Bell,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    title: 'Acta pendiente de aprobación',
    description: 'Se envía a Gerencia de Proyectos cuando un acta revisada queda lista para aprobación.',
    trigger: 'Al aprobar revisión técnica del acta',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Acta aprobada',
    description: 'Se notifica al creador y al revisor cuando Gerencia de Proyectos aprueba el acta.',
    trigger: 'Al aprobar acta',
  },
  {
    icon: Wallet,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    title: 'Acta enviada a presupuesto',
    description: 'Se notifica a quien revisa el presupuesto cuando un acta se envía a presupuesto.',
    trigger: 'Al enviar acta a presupuesto',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Presupuesto del acta aprobado',
    description: 'Se notifica al Director Técnico cuando el presupuesto del acta queda aprobado, al autorizar Gerencia el Presupuesto del Director.',
    trigger: 'Al autorizar el Presupuesto del Director',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Presupuesto del acta rechazado',
    description: 'Se notifica al Director Técnico cuando se rechaza el presupuesto del acta.',
    trigger: 'Al rechazar presupuesto del acta',
  },

  // ── Presupuesto del Director ──
  {
    icon: Wallet,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Presupuesto pendiente de autorización',
    description: 'Se envía a Gerencia cuando un Presupuesto del Director sale a autorización.',
    trigger: 'Al enviar el presupuesto a autorización',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Presupuesto autorizado',
    description: 'Se notifica a quien elaboró el presupuesto cuando Gerencia lo autoriza.',
    trigger: 'Al autorizar el presupuesto',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Presupuesto devuelto',
    description: 'Se notifica a quien elaboró el presupuesto cuando Gerencia lo devuelve a borrador.',
    trigger: 'Al devolver el presupuesto',
  },

  // ── Cronograma ──
  {
    icon: CalendarClock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Cronograma pendiente de revisión',
    description: 'Se envía al Director Técnico cuando se envía el plan del cronograma a revisión.',
    trigger: 'Al enviar cronograma a revisión',
  },
  {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Cronograma aprobado',
    description: 'Se notifica al creador cuando el Director Técnico aprueba el plan del cronograma.',
    trigger: 'Al aprobar cronograma',
  },
  {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    title: 'Cronograma devuelto',
    description: 'Se notifica al creador cuando el Director Técnico devuelve el cronograma para corrección.',
    trigger: 'Al devolver cronograma',
  },

  // ── Acta provisional y compra anticipada ──
  {
    icon: Bell,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    title: 'Compra anticipada solicitada',
    description: 'Se envía a Gerencia cuando se pide permiso para comprar contra un acta provisional, todavía sin código de contabilidad.',
    trigger: 'Al solicitar la compra anticipada',
  },
  {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Compra anticipada resuelta',
    description: 'Se notifica a quien la solicitó cuando Gerencia la aprueba o la rechaza, con el motivo si la niega.',
    trigger: 'Al aprobar o rechazar la compra anticipada',
  },

  // ── G. jurídica · trámite de contratación (GTH-002-F) ──
  {
    icon: FileSignature,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Trámite de contratación en su siguiente etapa',
    description: 'Se envía a quien le toca actuar en cada paso del trámite: revisión jurídica, elaboración del contrato, firma, garantías y acta de inicio.',
    trigger: 'En cada paso del trámite',
  },
  {
    icon: FileText,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    title: 'Documento del contrato guardado',
    description: 'Se avisa cuando Jurídica guarda la designación del supervisor o el acta de inicio, con el supervisor y las fechas en el cuerpo.',
    trigger: 'Al guardar un documento del contrato',
  },
  {
    icon: PlayCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Inicio de contrato (interno)',
    description: 'Se avisa al supervisor designado y a las áreas cuando el acta de inicio queda firmada, con la fecha de inicio y la terminación pactada.',
    trigger: 'Al firmar el acta de inicio',
  },
  {
    icon: Send,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    title: 'Inicio de contrato (al contratista)',
    description: 'Correo externo al contratista informándole que su contrato inició. Va aparte y sin el detalle interno del trámite.',
    trigger: 'Al firmar el acta de inicio',
  },
  {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Contrato próximo a vencer',
    description: 'Aviso automático con anticipación a la terminación pactada, para definir si se prorroga, se liquida o se deja terminar.',
    trigger: 'Automático, antes del vencimiento',
  },
  // ── G. contable ──
  {
    icon: Receipt,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Solicitud de anticipo (GF-005-F)',
    description: 'Se avisa en cada paso: al jefe del solicitante, a Gerencia de Proyectos, a Gerencia y a Tesorería; al solicitante cuando queda pagado o se le devuelve.',
    trigger: 'En cada paso del anticipo',
  },
  {
    icon: Receipt,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    title: 'Legalización del anticipo (GCT-006-F)',
    description: 'Se avisa al jefe del solicitante y a Contabilidad a medida que avanza, y al solicitante cuando queda causada o se devuelve.',
    trigger: 'En cada paso de la legalización',
  },
  {
    icon: Wallet,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    title: 'Cuentas entre compañías (GF-004-F5)',
    description: 'Se avisa a Contabilidad cuando queda pendiente la conciliación mensual, y a quien lo radicó cuando se concilia.',
    trigger: 'Al radicar y al conciliar',
  },

  // ── G. de talento humano ──
  {
    icon: Banknote,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Solicitud de préstamo (GTH-007-F)',
    description: 'Se avisa a Dirección Administrativa cuando el empleado la envía, a Gerencia cuando Administrativa firma, y al empleado cuando se aprueba o se le devuelve.',
    trigger: 'En cada paso del préstamo',
  },
  {
    icon: CalendarClock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Solicitud de permiso (GTH-010-F)',
    description: 'Se avisa al jefe de área del solicitante —el que lo autoriza, no un rol fijo— y al empleado cuando su permiso se aprueba o se niega.',
    trigger: 'Al enviar y al resolver el permiso',
  },
  {
    icon: Clock4,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    title: 'Horas extras (GTH-011-F)',
    description: 'Se avisa al Director de Proyecto que tiene a cargo a quien la registró, luego a Dirección Técnica y a Gerencia de Proyectos.',
    trigger: 'En cada paso de la planilla',
  },
  {
    icon: Users,
    color: 'text-green-600',
    bg: 'bg-green-50',
    title: 'Horas extras aprobadas',
    description: 'Al quedar aprobada se avisa a quien la registró y a la Dirección Administrativa y Financiera, que es quien la liquida en nómina.',
    trigger: 'Al aprobar la planilla',
  },
];

export default function NotificacionesPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="hover:bg-[hsl(var(--canalco-neutral-200))]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">Notificaciones</h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">Alertas automáticas del sistema</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Info banner */}
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-blue-900 mb-1">Notificaciones por correo electrónico</h2>
            <p className="text-sm text-blue-800">
              El sistema envía alertas automáticas por correo a quien le toca actuar en cada etapa de compras, obras y
              gestión del conocimiento. Se despachan en el momento en que ocurre el evento, no en un resumen diario, y
              van a la dirección de notificación del usuario o, si no tiene, a su correo corporativo.
            </p>
          </div>
        </div>

        {/* Notification types grid */}
        <h2 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
          Tipos de notificaciones configuradas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {NOTIFICATION_TYPES.map((n) => {
            const Icon = n.icon;
            return (
              <div
                key={n.title}
                className="bg-white rounded-xl border border-[hsl(var(--canalco-neutral-300))] p-5 shadow-sm flex gap-4"
              >
                <div className={`p-2.5 rounded-lg ${n.bg} flex-shrink-0 h-fit`}>
                  <Icon className={`w-5 h-5 ${n.color}`} />
                </div>
                <div>
                  <p className="font-semibold text-[hsl(var(--canalco-neutral-900))] text-sm">{n.title}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">{n.description}</p>
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-[hsl(var(--canalco-neutral-200))] text-[hsl(var(--canalco-neutral-700))] rounded-full">
                    {n.trigger}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </main>

      <Footer />
    </div>
  );
}
