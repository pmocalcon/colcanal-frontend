import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Home, Menu, ArrowLeft, ShoppingCart, ChevronRight } from 'lucide-react';

// Módulos de gestión disponibles
const GESTION_MODULES = [
  {
    slug: 'compras',
    nombre: 'Compras',
    descripcion: 'Registro de actividades del módulo de compras: requisiciones, cotizaciones, órdenes de compra y recepciones',
    icono: ShoppingCart,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
];

export default function AuditoriasPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleModuleClick = (slug: string) => {
    navigate(`/dashboard/auditorias/${slug}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo 1 */}
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Home Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>

              {/* Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>

              {/* Back Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver al Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Auditorías
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Registro de Actividades del Sistema
              </p>
            </div>

            {/* Right: Logo 2 */}
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                src="/assets/images/logo-alumbrado.png"
                alt="Alumbrado Público"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar (Mobile drawer / Desktop sidebar) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
              Módulo de Auditorías
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start bg-[hsl(var(--canalco-primary))]/10"
                onClick={() => {
                  setSidebarOpen(false);
                }}
              >
                Gestiones
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Info Message */}
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Selecciona una gestión para consultar el registro detallado de todas sus actividades. La información es de solo lectura.
          </p>
        </div>

        {/* Module Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GESTION_MODULES.map((module) => {
            const IconComponent = module.icono;
            return (
              <Card
                key={module.slug}
                className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-2 ${module.borderColor} hover:scale-105`}
                onClick={() => handleModuleClick(module.slug)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${module.bgColor} mb-4`}>
                      <IconComponent className={`w-8 h-8 ${module.color}`} />
                    </div>
                    <ChevronRight className="w-5 h-5 text-[hsl(var(--canalco-neutral-400))]" />
                  </div>
                  <CardTitle className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                    {module.nombre}
                  </CardTitle>
                  <CardDescription className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-2">
                    {module.descripcion}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="ghost"
                    className="w-full justify-between text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleModuleClick(module.slug);
                    }}
                  >
                    Ver registros
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Empty state for future modules */}
        <div className="mt-8 text-center text-[hsl(var(--canalco-neutral-500))] text-sm">
          <p>Más gestiones estarán disponibles próximamente</p>
        </div>
      </main>
    </div>
  );
}
