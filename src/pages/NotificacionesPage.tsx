import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, Bell, CheckCircle2, XCircle, ShoppingCart, Package, ClipboardCheck } from 'lucide-react';
import { Footer } from '@/components/ui/footer';

const NOTIFICATION_TYPES = [
  {
    icon: ClipboardCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Nueva requisición para revisión',
    description: 'Se envía al revisor asignado cuando se crea una nueva requisición pendiente de revisión.',
    trigger: 'Al crear una requisición',
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
    icon: Package,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    title: 'Orden de compra emitida',
    description: 'Se notifica al solicitante cuando se genera una orden de compra para su requisición.',
    trigger: 'Al generar orden de compra',
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
              El sistema envía alertas automáticas por email a los usuarios involucrados en cada etapa del proceso de compras.
              Las notificaciones se despachan en tiempo real cuando ocurre un evento relevante.
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

        {/* Config note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm text-amber-800">
            <strong>Configuración SMTP:</strong> Para que las notificaciones se envíen correctamente, el administrador del sistema
            debe configurar las variables de entorno <code className="bg-amber-100 px-1 rounded">SMTP_HOST</code>,{' '}
            <code className="bg-amber-100 px-1 rounded">SMTP_USER</code> y{' '}
            <code className="bg-amber-100 px-1 rounded">SMTP_PASS</code> en el servidor backend.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
