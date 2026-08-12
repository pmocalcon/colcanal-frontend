import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleCard } from '@/components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { modulesService, type ModulePermissions, type Module } from '@/services/modules.service';
import { Footer } from '@/components/ui/footer';
import { SUBMODULOS_COMPRAS, accesoCompras } from '@/config/submodulos';

export default function ComprasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<ModulePermissions | null>(null);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch permissions from backend on mount
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const modules = await modulesService.getUserModules();
        setAllModules(modules);
        // Find the "Compras" module to get its permissions
        const comprasModule = modules.find(
          (m) => m.slug === 'compras' || m.nombre.toLowerCase().includes('compras')
        );
        if (comprasModule) {
          setPermissions(comprasModule.permisos);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  /*
   * Los submódulos, su ruta y quién puede abrirlos salen de `config/submodulos`: la
   * barra lateral despliega esta misma lista y no pueden discrepar.
   */
  const comprasModules = SUBMODULOS_COMPRAS.map((s) => ({
    ...s,
    hasAccess: accesoCompras(s.slug, permissions, user?.nombreRol, allModules),
  }));

  const handleSubModuleClick = (subModule: typeof comprasModules[0]) => {
    if (!subModule.hasAccess) {
      alert('No tiene permisos para acceder a este módulo');
      return;
    }
    navigate(subModule.to);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando permisos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo 1 - Left */}
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
            </div>

            {/* Back Button & Title */}
            <div className="flex items-center gap-4 flex-grow">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  Gestión de Compras
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Requisiciones, Cotizaciones, Órdenes de Compra y Recepciones
                </p>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-12 w-full">
        {/* Welcome Section */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-3">
            Módulo de Compras
          </h2>
          <p className="text-lg text-[hsl(var(--canalco-neutral-600))]">
            Selecciona una función para gestionar el proceso de compras
          </p>
        </div>

        {/* Sub-Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {comprasModules.map((subModule) => (
            <ModuleCard
              key={subModule.slug}
              nombre={subModule.nombre}
              slug={subModule.slug}
              icono={subModule.icono}
              hasAccess={subModule.hasAccess}
              onClick={() => handleSubModuleClick(subModule)}
            />
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-16 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-6">
          <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
            Flujo del Proceso de Compras
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                1
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Requisiciones
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Solicitudes de compra
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                2
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Revisión
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Validación técnica
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                3
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Aprobación
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Autorización final
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                4
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Cotizaciones
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Comparación de precios
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                5
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Órdenes de Compra
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Emisión y seguimiento
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 bg-[hsl(var(--canalco-neutral-100))] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-bold mb-2">
                6
              </div>
              <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                Recepciones
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-1">
                Control de entregas
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
