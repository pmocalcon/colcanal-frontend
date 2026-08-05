import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Calculator, Home, Loader2, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';

/**
 * Portada de G. contable y tributaria: un sub-módulo por formato.
 *
 * Antes los dos formatos convivían en una sola lista con pestañas; ahora cada uno
 * entra por su propia tarjeta, igual que los sub-módulos de CREG.
 */

const GESTION = 'contable';
const FORMATO_ANTICIPO = 'GF-005-F';
const FORMATO_LEGALIZACION = 'GCT-006-F';
const FORMATO_CUENTAS = 'GF-004-F5';

/** Le toca actuar al usuario: el backend ya resolvió rol y jerarquía. */
const meToca = (s: GcSolicitud) => (s.accionesPendientes?.length ?? 0) > 0;

const SUBMODULOS = [
  {
    slug: 'anticipos',
    nombre: 'Anticipos',
    formato: FORMATO_ANTICIPO,
    description: 'Solicitud de anticipo (GF-005-F): autorización, aprobación y pago',
    Icon: Wallet,
  },
  {
    slug: 'legalizaciones',
    nombre: 'Legalizaciones',
    formato: FORMATO_LEGALIZACION,
    description: 'Legalización de anticipo (GCT-006-F): soportes, saldo en caja y cierre',
    Icon: Receipt,
  },
  {
    slug: 'cuentas-companias',
    nombre: 'Cuentas entre compañías',
    formato: FORMATO_CUENTAS,
    description: 'Autorización de pago entre compañías (GF-004-F5): uso excepcional y conciliación mensual',
    Icon: ArrowLeftRight,
  },
];

export default function ContableHomePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  // Los contadores no bloquean la navegación: si la carga falla, las tarjetas
  // siguen abriendo su lista, solo que sin números.
  useEffect(() => {
    gestionConocimientoService
      .list({ gestion: GESTION })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Ir al inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver a Gestión del conocimiento">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Calculator className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> G. contable y tributaria
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Anticipos (GF-005-F) y su legalización (GCT-006-F)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">Formatos</h2>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Selecciona una opción</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SUBMODULOS.map(({ slug, nombre, formato, description, Icon }) => {
            const propios = rows.filter((r) => r.formato === formato);
            const pendientes = propios.filter(meToca).length;
            return (
              <Card
                key={slug}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/contable/${slug}`)}
                className="group cursor-pointer border-2 border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="relative mb-4 p-4 rounded-full bg-gradient-to-br from-[hsl(var(--canalco-primary))]/10 to-[hsl(var(--canalco-primary))]/20 group-hover:from-[hsl(var(--canalco-primary))]/20 group-hover:to-[hsl(var(--canalco-primary))]/30 transition-all">
                    <Icon className="w-10 h-10 text-[hsl(var(--canalco-primary))]" />
                    {pendientes > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[1.5rem] rounded-full bg-amber-500 text-white text-xs font-bold px-1.5 py-1 leading-none"
                        title={`${pendientes} espera${pendientes === 1 ? '' : 'n'} una acción tuya`}
                      >
                        {pendientes}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] group-hover:text-[hsl(var(--canalco-primary))] transition-colors">{nombre}</h3>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-2">{description}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-4 inline-flex items-center gap-1.5">
                    {loading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Cargando…</>
                    ) : (
                      `${propios.length} ${propios.length === 1 ? 'registro' : 'registros'}`
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
