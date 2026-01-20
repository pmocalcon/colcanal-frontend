import { useNavigate } from 'react-router-dom';
import { ModuleCard } from '@/components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';

export default function LevantamientoObrasPage() {
  const navigate = useNavigate();
  const { hasPermission } = useGranularPermissions();

  const getSubModuleAccess = (slug: string): boolean => {
    switch (slug) {
      case 'obras':
        return hasPermission('levantamientos:ver');
      case 'crear-obra':
        return hasPermission('levantamientos:crear');
      case 'levantamientos':
        return hasPermission('levantamientos:ver');
      case 'revisar-levantamientos':
        return hasPermission('levantamientos:revisar');
      default:
        return false;
    }
  };

  const subModules = [
    {
      gestionId: 401,
      nombre: 'Obras',
      slug: 'obras',
      icono: 'Building2',
      hasAccess: getSubModuleAccess('obras'),
      description: 'Ver listado de obras registradas',
    },
    {
      gestionId: 402,
      nombre: 'Nueva Obra',
      slug: 'crear-obra',
      icono: 'Plus',
      hasAccess: getSubModuleAccess('crear-obra'),
      description: 'Registrar una nueva obra',
    },
    {
      gestionId: 403,
      nombre: 'Levantamientos',
      slug: 'levantamientos',
      icono: 'ClipboardList',
      hasAccess: getSubModuleAccess('levantamientos'),
      description: 'Ver levantamientos realizados',
    },
    {
      gestionId: 404,
      nombre: 'Revisar Levantamientos',
      slug: 'revisar-levantamientos',
      icono: 'CheckSquare',
      hasAccess: getSubModuleAccess('revisar-levantamientos'),
      description: 'Aprobar o rechazar levantamientos pendientes',
    },
  ];

  const handleSubModuleClick = (subModule: (typeof subModules)[0]) => {
    // Si no tiene acceso, no hacer nada (la tarjeta ya se ve en gris)
    if (!subModule.hasAccess) {
      return;
    }

    // Navegar directamente - la protección la hace ProtectedRoute en App.tsx
    switch (subModule.slug) {
      case 'obras':
        navigate('/dashboard/levantamiento-obras/obras');
        break;
      case 'crear-obra':
        navigate('/dashboard/levantamiento-obras/obras/crear');
        break;
      case 'levantamientos':
        navigate('/dashboard/levantamiento-obras/levantamientos');
        break;
      case 'revisar-levantamientos':
        navigate('/dashboard/levantamiento-obras/levantamientos/revisar');
        break;
    }
  };

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
                  Levantamiento de Obras
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Gestión de obras y levantamientos de campo
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
            Módulo de Levantamiento de Obras
          </h2>
          <p className="text-lg text-[hsl(var(--canalco-neutral-600))]">
            Selecciona una opción para gestionar obras y levantamientos
          </p>
        </div>

        {/* Sub-Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {subModules.map((subModule) => (
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
        <div className="mt-16 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-6 max-w-3xl mx-auto">
          <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
            Información
          </h3>
          <ul className="space-y-3 text-sm text-[hsl(var(--canalco-neutral-600))]">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
              <span>
                <strong>Obras:</strong> Consulta y administra el listado de obras registradas en el sistema.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
              <span>
                <strong>Nueva Obra:</strong> Registra una nueva obra con todos sus datos de presentación.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-primary))] mt-1.5 flex-shrink-0" />
              <span>
                <strong>Levantamientos:</strong> Gestiona los levantamientos de campo asociados a las obras.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--canalco-warning))] mt-1.5 flex-shrink-0" />
              <span>
                Los levantamientos requieren aprobación antes de ser procesados.
              </span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
