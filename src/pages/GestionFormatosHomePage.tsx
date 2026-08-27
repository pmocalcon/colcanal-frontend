import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getGestion, rutaFormato, puedeVerFormatosDelArea } from '@/config/formatosGestion';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Portada de una gestión: un formato por tarjeta.
 *
 * La misma para todas las que se armen sobre `gc_solicitudes`. Antes cada gestión entraba
 * derecho al listado de su único formato y no había por dónde llegar a otro; ahora lo que
 * cambia entre una y otra sale de `GESTIONES_FORMATOS`.
 */

/** Le toca actuar al usuario: el backend ya resolvió rol y jerarquía. */
const meToca = (s: GcSolicitud) => (s.accionesPendientes?.length ?? 0) > 0;

export default function GestionFormatosHomePage({ gestion }: { gestion: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cfg = getGestion(gestion);
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  // Los contadores no bloquean la navegación: si la carga falla, las tarjetas siguen
  // abriendo su lista, solo que sin números.
  useEffect(() => {
    let cancelled = false;
    gestionConocimientoService
      .list({ gestion })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gestion]);

  if (!cfg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3">
        <p className="text-[hsl(var(--canalco-neutral-700))]">Esa gestión todavía no tiene formatos.</p>
        <Button variant="link" onClick={() => navigate('/dashboard/gestion-conocimiento')}>
          Ir a Gestión del conocimiento
        </Button>
      </div>
    );
  }

  const { nombre, subtitulo, Icon: GestionIcon, formatos: todosLosFormatos } = cfg;

  /*
   * Los formatos internos del área solo se le pintan al área y al PMO.
   *
   * El PMO va incluido porque es el comodín transversal del sistema —igual que en Recurso
   * Económico y en Talento Humano—; dejarlo por fuera acá sería la única excepción del
   * sistema, y la pagaría justo quien tiene que revisar que todo esto funcione.
   */
  const formatos = todosLosFormatos.filter(
    (f) => !f.soloDelArea || puedeVerFormatosDelArea(gestion, user?.nombreRol),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver a Gestión del conocimiento">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <GestionIcon className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> {nombre}
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">{subtitulo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">Formatos</h2>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Selecciona una opción</p>
        </div>

        <div className={
          'grid grid-cols-1 gap-6 '
          + (formatos.length === 1 ? 'max-w-sm mx-auto' : 'md:grid-cols-2')
        }>
          {formatos.map(({ slug, nombre: nom, formato, descripcion, Icon }) => {
            const propios = rows.filter((r) => r.formato === formato);
            const pendientes = propios.filter(meToca).length;
            return (
              <Card
                key={slug}
                onClick={() => navigate(rutaFormato(gestion, slug))}
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
                  <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] group-hover:text-[hsl(var(--canalco-primary))] transition-colors">{nom}</h3>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-2">{descripcion}</p>
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
