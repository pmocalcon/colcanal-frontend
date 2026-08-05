import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Boxes, ClipboardList, LineChart, Power, PowerOff, Receipt, SlidersHorizontal, Table2, TrendingUp, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';

const SUBMODULES = [
  {
    slug: 'unidades',
    nombre: 'Unidades constructivas',
    description: 'Define la hoja de costos de reposición a nuevo de cada UCAP',
    Icon: Boxes,
    permission: 'creg:unidades',
  },
  {
    slug: 'resumen',
    nombre: 'Resumen UCAP',
    description: 'Tabla resumen de todas las UCAPs con su desglose de costos y precio actualizado',
    Icon: Table2,
    permission: 'creg:resumen',
  },
  {
    slug: 'parametros',
    nombre: 'Parámetros',
    description: 'Hoja de parametrización por municipio: costos, impuestos, vida útil y factores FAOML/FAOMn',
    Icon: SlidersHorizontal,
    permission: 'creg:parametros',
  },
  {
    slug: 'ipp',
    nombre: 'IPP por mes',
    description: 'Índice de precios al productor mes a mes: una sola serie para todos los municipios',
    Icon: TrendingUp,
    permission: 'creg:parametros',
  },
  {
    slug: 'censo',
    nombre: 'Censo físico',
    description: 'Cantidad de UCAPs instaladas por mes, con rango de fechas y subtotales de costo',
    Icon: ClipboardList,
    permission: 'creg:censo',
  },
  {
    slug: 'idd-off',
    nombre: 'ID OFF',
    description: 'Índice de disponibilidad de las apagadas: horas fuera de servicio del periodo',
    Icon: PowerOff,
    permission: 'creg:iddoff',
  },
  {
    slug: 'idd-on',
    nombre: 'ID ON',
    description: 'Índice de disponibilidad de las encendidas: prendidas cuando deben estar apagadas',
    Icon: Power,
    permission: 'creg:iddon',
  },
    {
    slug: 'liquidacion',
    nombre: 'Liquidación',
    description: 'Cálculo de activo y valor a pagar del mes: AOM, inversión, ambientales y SIAP',
    Icon: Receipt,
    permission: 'creg:liquidacion',
  },
  {
    slug: 'flujo-caja',
    nombre: 'Flujo de Caja',
    description: 'Proyección mes a mes del contrato: CAOM, CINV, energía, FCM y flujo anual',
    Icon: LineChart,
    permission: 'creg:liquidacion',
  },
];

export default function CregHomePage() {
  const navigate = useNavigate();
  const { hasPermission } = useGranularPermissions();

  // Cada rol solo ve los sub-módulos que puede abrir.
  const submodules = SUBMODULES.filter((s) => hasPermission(s.permission));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Zap className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> CREG
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Unidades constructivas · costo de reposición a nuevo (Res. CREG 123 de 2011)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">Módulo CREG</h2>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            {submodules.length > 0 ? 'Selecciona una opción' : 'No tienes acceso a ningún sub-módulo de CREG'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {submodules.map(({ slug, nombre, description, Icon }) => (
            <Card
              key={slug}
              onClick={() => navigate(`/dashboard/creg/${slug}`)}
              className="group cursor-pointer border-2 border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))] hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 p-4 rounded-full bg-gradient-to-br from-[hsl(var(--canalco-primary))]/10 to-[hsl(var(--canalco-primary))]/20 group-hover:from-[hsl(var(--canalco-primary))]/20 group-hover:to-[hsl(var(--canalco-primary))]/30 transition-all">
                  <Icon className="w-10 h-10 text-[hsl(var(--canalco-primary))]" />
                </div>
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] group-hover:text-[hsl(var(--canalco-primary))] transition-colors">{nombre}</h3>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-2">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
