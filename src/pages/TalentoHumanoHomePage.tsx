import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Banknote, CalendarClock, Clock4, HeartPulse, Landmark, Percent, Plane, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { puedeVerSolicitudesPago } from '@/services/talentoHumano.service';

/**
 * Portada del módulo Talento Humano.
 *
 * Cuatro listados: el personal, los préstamos, las incapacidades y los ausentismos.
 *
 * Ojo con la distinción, porque hay dos sitios con nombres parecidos: en **G. de talento
 * humano** (dentro de Gestión del conocimiento) se *diligencian los formatos* —préstamo,
 * permiso, vacaciones, horas extras—; acá se *consulta y administra la información*.
 *
 * Se nota sobre todo en préstamos: allá se pide uno nuevo, acá está la cartera de lo
 * prestado y su saldo. Son dos cosas distintas con el mismo nombre.
 */

const SECCIONES = [

  {
    slug: 'parametros',
    nombre: 'Parámetros',
    descripcion: 'Salario mínimo y auxilio de transporte de cada año, que es de donde la nómina los toma',
    Icon: SlidersHorizontal,
  },
  {
    slug: 'personal',
    nombre: 'Personal',
    descripcion: 'La base de personal: estado, cargo, área, contrato y remuneración vigente',
    Icon: Users,
  },
  {
    slug: 'prestamos',
    nombre: 'Préstamos',
    descripcion: 'La cartera: lo prestado, lo descontado por nómina y el saldo',
    Icon: Banknote,
  },
  {
    slug: 'incapacidades',
    nombre: 'Incapacidades',
    descripcion: 'Días que asume la empresa y la EPS o ARL, y seguimiento del recobro',
    Icon: HeartPulse,
  },
  {
    slug: 'ausentismos',
    nombre: 'Ausentismos',
    descripcion: 'Los permisos concedidos y las horas que se descuentan',
    Icon: CalendarClock,
  },
  {
    slug: 'horas-extras',
    nombre: 'Horas extras',
    descripcion: 'Planillas aprobadas: horas laboradas y liquidación proyectada para nómina',
    Icon: Clock4,
  },
  {
    slug: 'vacaciones',
    nombre: 'Vacaciones',
    descripcion: 'Vacaciones aprobadas: días a disfrutar, a compensar y pendientes por periodo',
    Icon: Plane,
  },
  {
    slug: 'nomina',
    nombre: 'Nómina',
    descripcion: 'Novedades del mes y liquidación: devengado, deducciones y neto a pagar',
    Icon: Wallet,
  },
  {
    slug: 'retenciones',
    nombre: 'Tabla de retenciones',
    descripcion: 'Deducciones y rentas exentas de cada persona, de donde sale el Retefuente de la nómina',
    Icon: Percent,
  },
  {
    slug: 'pagos',
    nombre: 'Solicitudes de pago',
    descripcion: 'A quién se le consigna cuánto, y el archivo que se sube al portal bancario',
    Icon: Landmark,
  },
];

export default function TalentoHumanoHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  /*
   * Solicitudes de pago no es para todo el módulo: ahí están las cuentas bancarias de la
   * empresa entera y lo que se le gira a cada quien. A quien no entra no se le pinta la
   * tarjeta —ni siquiera apagada—: invitaría a pedir un acceso que no se va a dar.
   */
  const visibles = SECCIONES.filter(
    (s) => s.slug !== 'pagos' || puedeVerSolicitudesPago(user?.nombreRol, user?.nombre),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver al inicio">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Users className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Talento Humano
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Personal, préstamos, incapacidades, ausentismos, horas extras y vacaciones
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibles.map(({ slug, nombre, descripcion, Icon }) => (
            <Card
              key={slug}
              onClick={() => navigate(`/dashboard/talento-humano/${slug}`)}
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
    </div>
  );
}
