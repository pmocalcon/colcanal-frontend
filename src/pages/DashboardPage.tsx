import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { modulesService } from '@/services/modules.service';
import type { Module } from '@/services/modules.service';
import { ModuleCard } from '@/components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import { LogOut, User, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoading(true);
        const modulesData = await modulesService.getUserModules();
        setModules(modulesData);
      } catch (err) {
        console.error('Error loading modules:', err);
        setError('Error al cargar los módulos del sistema');
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, []);

  const handleModuleClick = (module: Module) => {
    if (!module.hasAccess) {
      alert('No tiene permisos para acceder a este módulo.');
      return;
    }

    // Navigate to the module
    navigate(`/dashboard/${module.slug}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando módulos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-[hsl(var(--canalco-error))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-900))] font-semibold text-xl mb-2">Error</p>
          <p className="text-[hsl(var(--canalco-neutral-600))]">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo 1 - Canales Contactos - Left */}
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                src="/assets/images/logo-canalco.png"
                alt="Canales Contactos"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Title */}
            <div className="flex-grow">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Canalcongroup
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Sistema de Gestión Empresarial
              </p>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
              <div className="text-right hidden md:block">
                <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {user?.nombre || 'Usuario'}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <Badge
                    variant="secondary"
                    className="text-xs bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]"
                  >
                    {user?.nombreRol || 'Sin Rol'}
                  </Badge>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(var(--canalco-primary))] to-[hsl(var(--canalco-primary-hover))] flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleLogout}
                className="border-[hsl(var(--canalco-error))] text-[hsl(var(--canalco-error))] hover:bg-[hsl(var(--canalco-error))]/10"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-3">
            Bienvenido, {user?.nombre?.split(' ')[0] || 'Usuario'}
          </h2>
          <p className="text-lg text-[hsl(var(--canalco-neutral-600))]">
            Selecciona un módulo para comenzar a trabajar
          </p>
        </div>

        {/* Quick Access for Gerencia de Proyectos */}
        {user?.nombreRol === 'Gerencia de Proyectos' && (
          <div className="mb-8">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-amber-900 mb-2">
                    Autorización de Requisiciones
                  </h3>
                  <p className="text-sm text-amber-700">
                    Revisa y autoriza requisiciones pendientes de autorización
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/dashboard/compras/requisiciones/autorizar')}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Ver Requisiciones
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((module) => (
            <ModuleCard
              key={module.gestionId}
              nombre={module.nombre}
              slug={module.slug}
              icono={module.icono}
              hasAccess={module.hasAccess}
              onClick={() => handleModuleClick(module)}
            />
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center">
          <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
            Los módulos marcados con candado no están disponibles para tu rol actual
          </p>
        </div>
      </main>
    </div>
  );
}
