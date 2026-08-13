import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, BookOpen, Lock,
  Compass, LineChart, Building2, Users, MonitorSmartphone, FolderArchive,
  Wallet, Calculator, ShoppingCart, Scale, Handshake, HardHat, Wrench, ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Las 14 gestiones del sistema de gestión de la organización.
// De momento solo "G. jurídica" abre un formato; el resto queda como "Próximamente"
// hasta que se defina su formato correspondiente.
interface Gestion {
  slug: string;
  nombre: string;
  descripcion: string;
  Icon: LucideIcon;
  ready: boolean;
}

const GESTIONES: Gestion[] = [
  { slug: 'estrategica', nombre: '01. G. estratégica', descripcion: 'Direccionamiento estratégico, políticas y objetivos de la organización', Icon: Compass, ready: false },
  { slug: 'planeacion', nombre: '02. G. de planeación, monitoreo y control', descripcion: 'Planeación, seguimiento de indicadores y control de la gestión', Icon: LineChart, ready: false },
  { slug: 'administrativa', nombre: '03. G. administrativa', descripcion: 'Recursos físicos, servicios generales y apoyo administrativo', Icon: Building2, ready: false },
  { slug: 'talento-humano', nombre: '04. G. de talento humano', descripcion: 'Selección, contratación, bienestar y desarrollo del personal', Icon: Users, ready: true },
  { slug: 'tics', nombre: "05. G. Tic's", descripcion: 'Tecnologías de la información, sistemas y soporte', Icon: MonitorSmartphone, ready: false },
  { slug: 'documental', nombre: '06. G. documental', descripcion: 'Gestión, control y archivo de la documentación', Icon: FolderArchive, ready: false },
  { slug: 'financiera', nombre: '07. G. financiera', descripcion: 'Tesorería, presupuesto y gestión financiera', Icon: Wallet, ready: false },
  { slug: 'contable', nombre: '08. G. contable y tributaria', descripcion: 'Contabilidad, impuestos y obligaciones tributarias', Icon: Calculator, ready: true },
  { slug: 'compras', nombre: '09. G. de compras', descripcion: 'Adquisición de bienes y servicios y gestión de proveedores', Icon: ShoppingCart, ready: false },
  { slug: 'juridica', nombre: '10. G. jurídica', descripcion: 'Contratación, asuntos legales y modalidades de contratación', Icon: Scale, ready: true },
  { slug: 'comercial', nombre: '11. G. Comercial', descripcion: 'Relación con clientes, licitaciones y gestión comercial', Icon: Handshake, ready: false },
  { slug: 'tecnica', nombre: '12. G. técnica', descripcion: 'Gestión técnica de proyectos de alumbrado público', Icon: HardHat, ready: false },
  { slug: 'operativa', nombre: '13. G. operativa', descripcion: 'Ejecución operativa en campo y mantenimiento', Icon: Wrench, ready: false },
  { slug: 'sst', nombre: '14. G. SST', descripcion: 'Seguridad y salud en el trabajo', Icon: ShieldCheck, ready: false },
];

export default function GestionConocimientoPage() {
  const navigate = useNavigate();

  const handleOpen = (g: Gestion) => {
    if (!g.ready) return;
    navigate(`/dashboard/gestion-conocimiento/${g.slug}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver al Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Gestión del conocimiento
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Formatos y documentación por gestión
            </p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Selecciona una gestión para consultar y diligenciar sus formatos. Por ahora
            <b> G. jurídica</b>, <b>G. contable y tributaria</b> y <b>G. de talento humano</b> están disponibles; las demás se habilitarán a medida que se definan sus formatos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GESTIONES.map((g) => {
            const Icon = g.Icon;
            return (
              <Card
                key={g.slug}
                onClick={() => handleOpen(g)}
                className={
                  'border-2 transition-all duration-200 ' +
                  (g.ready
                    ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))]'
                    : 'opacity-60 cursor-not-allowed border-[hsl(var(--canalco-neutral-200))]')
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={'p-3 rounded-lg mb-3 ' + (g.ready ? 'bg-[hsl(var(--canalco-primary))]/10' : 'bg-[hsl(var(--canalco-neutral-200))]')}>
                      <Icon className={'w-7 h-7 ' + (g.ready ? 'text-[hsl(var(--canalco-primary))]' : 'text-[hsl(var(--canalco-neutral-500))]')} />
                    </div>
                    {g.ready
                      ? <ChevronRight className="w-5 h-5 text-[hsl(var(--canalco-neutral-400))]" />
                      : <Lock className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />}
                  </div>
                  <CardTitle className="text-base font-bold text-[hsl(var(--canalco-neutral-900))]">
                    {g.nombre}
                  </CardTitle>
                  <CardDescription className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-1">
                    {g.descripcion}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {g.ready ? (
                    <Button
                      variant="ghost"
                      className="w-full justify-between text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10"
                      onClick={(e) => { e.stopPropagation(); handleOpen(g); }}
                    >
                      Abrir formato
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <span className="inline-block text-xs font-medium text-[hsl(var(--canalco-neutral-500))] bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))] rounded px-2 py-1">
                      Próximamente
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
