import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, SlidersHorizontal, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Footer } from '@/components/ui/footer';
import { useAuth } from '@/contexts/AuthContext';
import { esRolPmo } from '@/utils/rolesPmo';

/**
 * Portada de Recurso Económico.
 *
 * Dos submódulos, y la división no es de acomodo: **Parámetros se configura una vez al
 * año y Factura se diligencia todos los meses**. Tenerlos en la misma pantalla obligaba
 * a pasar por los contratos de interventoría para llegar a lo que de verdad se usa mes
 * a mes.
 *
 * Los dos escriben sobre el mismo registro, así que un cambio en los porcentajes de
 * Parámetros se ve de inmediato en las facturas que nadie haya escrito a mano.
 */

const SECCIONES = [
  {
    /** Solo del PMO: acá se configuran los porcentajes con los que se calcula todo. */
    soloPmo: true,
    slug: 'parametros',
    nombre: 'Parámetros',
    descripcion: 'Interventoría por año y los porcentajes de retención de cada municipio',
    Icon: SlidersHorizontal,
  },
  {
    // El director de proyecto entra a validar la factura de su municipio.
    soloPmo: false,
    slug: 'factura',
    nombre: 'Factura',
    descripcion: 'La factura de concesión de cada municipio, mes a mes, y su valor neto',
    Icon: Receipt,
  },
];

export default function RecursoEconomicoHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const esPmo = esRolPmo(user?.nombreRol);
  const visibles = SECCIONES.filter((s) => esPmo || !s.soloPmo);

  if (!esPmo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">
            Recurso Económico
          </h1>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Este módulo es del PMO. Si necesitas consultarlo, pídeselo al Analista o al
            Director de PMO.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--canalco-neutral-50))]">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Volver al inicio">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Wallet className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Recurso Económico
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Parámetros del contrato · Factura de concesión
            </p>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-4xl mx-auto px-6 py-12 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibles.map(({ slug, nombre, descripcion, Icon }) => (
            <Card
              key={slug}
              onClick={() => navigate(`/dashboard/recurso-economico/${slug}`)}
              className="group cursor-pointer border-2 border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 p-4 rounded-full bg-gradient-to-br from-[hsl(var(--canalco-primary))]/10 to-[hsl(var(--canalco-primary))]/20 group-hover:from-[hsl(var(--canalco-primary))]/20 group-hover:to-[hsl(var(--canalco-primary))]/30 transition-all">
                  <Icon className="w-10 h-10 text-[hsl(var(--canalco-primary))]" />
                </div>
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] group-hover:text-[hsl(var(--canalco-primary))] transition-colors">
                  {nombre}
                </h3>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-2">{descripcion}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
