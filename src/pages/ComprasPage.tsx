import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleCard } from '@/components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ComprasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  /**
   * Determines if a user has access to a specific sub-module based on their role.
   * Permission rules from database seed:
   * - Requisiciones: Roles with "Crear" permission (PQRS, Analistas, Coordinadores, Directors)
   * - Revisión: Roles with "Revisar" permission (All Directors)
   * - Aprobación: Only Gerencia (has "Aprobar" permission)
   * - Cotizaciones: Only Compras (has "Cotizar" permission)
   * - Órdenes de Compra: Only Compras
   * - Recepciones: Everyone who can CREATE (user requirement: "todo el que puede crear puede recibir el material")
   */
  const getSubModuleAccess = (slug: string): boolean => {
    if (!user?.nombreRol) return false;

    const userRole = user.nombreRol;

    // Roles that can CREATE requisitions
    const canCreateRoles = [
      'PQRS El Cerrito',
      'PQRS Guacarí',
      'PQRS Circasia',
      'PQRS Quimbaya',
      'PQRS Jericó',
      'PQRS Ciudad Bolívar',
      'PQRS Tarso',
      'PQRS Pueblo Rico',
      'PQRS Santa Bárbara',
      'PQRS Puerto Asís',
      'Analista PMO',
      'Analista Comercial',
      'Analista Jurídico',
      'Analista Administrativo',
      'Coordinador Financiero',
      'Coordinador Jurídico',
      'Director de Proyecto Antioquia',
      'Director de Proyecto Quindío',
      'Director de Proyecto Valle',
      'Director de Proyecto Putumayo',
      'Director PMO',
      'Director Comercial',
      'Director Jurídico',
      'Director Financiero y Administrativo',
      'Director Técnico',
    ];

    // Roles that can REVIEW requisitions (only Directors)
    const canReviewRoles = [
      'Director de Proyecto Antioquia',
      'Director de Proyecto Quindío',
      'Director de Proyecto Valle',
      'Director de Proyecto Putumayo',
      'Director PMO',
      'Director Comercial',
      'Director Jurídico',
      'Director Financiero y Administrativo',
      'Director Técnico',
    ];

    switch (slug) {
      case 'requisiciones':
        // Can create requisitions
        return canCreateRoles.includes(userRole);

      case 'revision':
        // Can review requisitions (only Directors)
        return canReviewRoles.includes(userRole);

      case 'autorizacion':
        // Only Gerencia de Proyectos can authorize requisitions
        return userRole === 'Gerencia de Proyectos';

      case 'aprobacion':
      case 'aprobacion-ordenes':
        // Only Gerencia can approve requisitions and purchase orders
        return userRole === 'Gerencia';

      case 'cotizaciones':
      case 'ordenes-compra':
      case 'facturas':
        // Only Compras can quote, manage purchase orders, and manage invoices
        return userRole === 'Compras';

      case 'recepciones':
        // Everyone who can create can also receive materials
        return canCreateRoles.includes(userRole);

      default:
        return false;
    }
  };

  // Sub-módulos de Compras (Flujo completo del proceso)
  const comprasModules = [
    {
      gestionId: 101,
      nombre: 'Requisiciones',
      slug: 'requisiciones',
      icono: 'FileText',
      hasAccess: getSubModuleAccess('requisiciones'),
    },
    {
      gestionId: 102,
      nombre: 'Revisión',
      slug: 'revision',
      icono: 'ClipboardCheck',
      hasAccess: getSubModuleAccess('revision'),
    },
    {
      gestionId: 109,
      nombre: 'Autorización',
      slug: 'autorizacion',
      icono: 'Shield',
      hasAccess: getSubModuleAccess('autorizacion'),
    },
    {
      gestionId: 103,
      nombre: 'Aprobar Requisiciones',
      slug: 'aprobacion',
      icono: 'CheckCircle2',
      hasAccess: getSubModuleAccess('aprobacion'),
    },
    {
      gestionId: 104,
      nombre: 'Cotizaciones',
      slug: 'cotizaciones',
      icono: 'DollarSign',
      hasAccess: getSubModuleAccess('cotizaciones'),
    },
    {
      gestionId: 105,
      nombre: 'Órdenes de Compra',
      slug: 'ordenes-compra',
      icono: 'ShoppingBag',
      hasAccess: getSubModuleAccess('ordenes-compra'),
    },
    {
      gestionId: 108,
      nombre: 'Gestión de Facturas',
      slug: 'facturas',
      icono: 'FileText',
      hasAccess: getSubModuleAccess('facturas'),
    },
    {
      gestionId: 107,
      nombre: 'Aprobar Órdenes de Compra',
      slug: 'aprobacion-ordenes',
      icono: 'CheckCheck',
      hasAccess: getSubModuleAccess('aprobacion-ordenes'),
    },
    {
      gestionId: 106,
      nombre: 'Recepciones',
      slug: 'recepciones',
      icono: 'PackageCheck',
      hasAccess: getSubModuleAccess('recepciones'),
    },
  ];

  const handleSubModuleClick = (subModule: typeof comprasModules[0]) => {
    // Check if user has access
    if (!subModule.hasAccess) {
      alert('No tiene permisos para acceder a este módulo');
      return;
    }

    // Navigate to the sub-module
    if (subModule.slug === 'requisiciones') {
      navigate('/dashboard/compras/requisiciones');
    } else if (subModule.slug === 'revision' || subModule.slug === 'aprobacion') {
      navigate('/dashboard/compras/requisiciones/revisar');
    } else if (subModule.slug === 'autorizacion') {
      navigate('/dashboard/compras/requisiciones/autorizar');
    } else if (subModule.slug === 'aprobacion-ordenes') {
      navigate('/dashboard/compras/ordenes-compra/aprobar');
    } else if (subModule.slug === 'cotizaciones') {
      navigate('/dashboard/compras/cotizaciones');
    } else if (subModule.slug === 'ordenes-compra') {
      navigate('/dashboard/compras/ordenes');
    } else if (subModule.slug === 'facturas') {
      navigate('/dashboard/compras/facturas');
    } else if (subModule.slug === 'recepciones') {
      navigate('/dashboard/compras/recepciones');
    } else {
      // TODO: Implementar navegación a las otras sub-páginas
      alert(`Navegando a ${subModule.nombre}. Esta funcionalidad estará disponible próximamente.`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
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
      <main className="max-w-7xl mx-auto px-6 py-12">
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
    </div>
  );
}
