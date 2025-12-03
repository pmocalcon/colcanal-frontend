import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModuleCard } from '@/components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { modulesService, type ModulePermissions } from '@/services/modules.service';

export default function MaterialesPage() {
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState<ModulePermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const modules = await modulesService.getUserModules();
        const materialesModule = modules.find(
          (m) => m.slug === 'materiales' || m.nombre.toLowerCase().includes('materiales')
        );
        if (materialesModule) {
          setPermissions(materialesModule.permisos);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const getSubModuleAccess = (slug: string): boolean => {
    if (!permissions) return false;

    switch (slug) {
      case 'grupos-materiales':
      case 'lista-materiales':
        // Acceso basado en permiso de ver
        return permissions.ver === true;
      default:
        return false;
    }
  };

  const materialesModules = [
    {
      gestionId: 301,
      nombre: 'Grupos de Materiales',
      slug: 'grupos-materiales',
      icono: 'FolderOpen',
      hasAccess: getSubModuleAccess('grupos-materiales'),
    },
    {
      gestionId: 302,
      nombre: 'Materiales',
      slug: 'lista-materiales',
      icono: 'Package',
      hasAccess: getSubModuleAccess('lista-materiales'),
    },
  ];

  const handleSubModuleClick = (subModule: typeof materialesModules[0]) => {
    if (!subModule.hasAccess) {
      alert('No tiene permisos para acceder a este módulo');
      return;
    }

    if (subModule.slug === 'grupos-materiales') {
      navigate('/dashboard/materiales/grupos');
    } else if (subModule.slug === 'lista-materiales') {
      navigate('/dashboard/materiales/lista');
    }
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
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
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
                  Gestión de Materiales
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Administración de grupos y materiales del sistema
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-3">
            Módulo de Materiales
          </h2>
          <p className="text-lg text-[hsl(var(--canalco-neutral-600))]">
            Selecciona una opción para gestionar los datos maestros de materiales
          </p>
        </div>

        {/* Sub-Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {materialesModules.map((subModule) => (
            <ModuleCard
              key={subModule.gestionId}
              nombre={subModule.nombre}
              slug={subModule.slug}
              icono={subModule.icono}
              hasAccess={subModule.hasAccess}
              onClick={() => handleSubModuleClick(subModule)}
            />
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-16 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
            Información
          </h3>
          <ul className="space-y-3 text-sm text-[hsl(var(--canalco-neutral-600))]">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
              <span>
                <strong>Grupos de Materiales:</strong> Organiza los materiales en categorías para facilitar su gestión y búsqueda.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
              <span>
                <strong>Materiales:</strong> Administra el catálogo de materiales con código, descripción y grupo asignado.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-warning))] mt-1.5 flex-shrink-0" />
              <span>
                El sistema detecta automáticamente materiales similares para evitar duplicados.
              </span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
