import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Inbox, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getFormato, rutaFormato, rutaGestion } from '@/config/formatosGestion';

/**
 * Listado de un formato suelto: terminación anticipada, contestación de tutela, solicitud
 * de préstamo, y los que vengan, de cualquier gestión.
 *
 * Uno solo para todos, porque todos son la misma pantalla: crear, abrir y eliminar. Lo que
 * cambia —el título, el icono, las columnas— sale de `GESTIONES_FORMATOS`, que ya lo tiene
 * declarado para pintar la portada.
 *
 * La mayoría no tiene flujo: se diligencian, se guardan y se imprimen para firmarlos en
 * papel. Los que sí lo tienen —hoy la solicitud de préstamo— declaran `estadoMeta` en el
 * catálogo y entonces el listado les pinta la columna «Estado»; sin ella la columna no
 * aparece, porque diría lo mismo en todas las filas.
 *
 * **Sin semáforo de SLA**, a diferencia del listado de contratación: el plazo se ve al
 * abrir el formato, que es donde se actúa.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function FormatoListPage({ gestion, slug }: { gestion: string; slug: string }) {
  const navigate = useNavigate();
  const cfg = getFormato(gestion, slug);
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrando, setBorrando] = useState<number | null>(null);

  useEffect(() => {
    if (!cfg) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    gestionConocimientoService
      .list({ gestion })
      .then((todas) => {
        if (!cancelled) setRows(todas.filter((r) => r.formato === cfg.formato));
      })
      .catch(() => { if (!cancelled) toast.error('No se pudo cargar el listado'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gestion, cfg?.formato]);

  // Una ruta con un slug que no está en el catálogo: mejor decirlo que pintar una tabla
  // vacía que parecería «todavía no hay registros».
  if (!cfg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3">
        <p className="text-[hsl(var(--canalco-neutral-700))]">Ese formato no existe.</p>
        <Button variant="link" onClick={() => navigate(rutaGestion(gestion))}>
          Ir a la gestión
        </Button>
      </div>
    );
  }

  const { Icon, nombre, descripcion, formato } = cfg;
  const singular = cfg.singular ?? 'registro';
  const columnas = cfg.columnas ?? [];
  const estadoMeta = cfg.estadoMeta;
  // Un formato con flujo solo se borra mientras es borrador: más adelante ya lo firmó
  // alguien, y el listado no es el sitio para deshacer un trámite aprobado.
  const sePuedeBorrar = (r: GcSolicitud) => !estadoMeta || r.estado === 'borrador';

  /**
   * Abre el formato en blanco SIN crearlo todavía.
   *
   * La solicitud nace al guardar por primera vez. Creándola aquí, quien entraba
   * y se arrepentía dejaba una fila vacía en el listado y gastaba un número de
   * solicitud, que no se recicla.
   */
  const crear = () => navigate(`${rutaFormato(gestion, slug)}/nuevo`);

  const eliminar = async (id: number) => {
    if (!window.confirm(`¿Eliminar esta ${singular}? No se puede deshacer.`)) return;
    setBorrando(id);
    try {
      await gestionConocimientoService.remove(id);
      setRows((p) => p.filter((r) => r.solicitudId !== id));
      toast.success('Eliminada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo eliminar');
    } finally {
      setBorrando(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(rutaGestion(gestion))} title="Volver a la gestión">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Icon className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> {nombre}
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))] truncate">{descripcion}</p>
          </div>
          <Button onClick={crear} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white shrink-0">
            <Plus className="w-4 h-4" /> Nueva {singular}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-12 text-center">
            <Inbox className="w-10 h-10 mx-auto text-[hsl(var(--canalco-neutral-400))] mb-3" />
            <p className="text-[hsl(var(--canalco-neutral-700))]">Aún no hay registros.</p>
            <Button variant="link" onClick={crear} className="text-[hsl(var(--canalco-primary))]">
              Crear el primero
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  {columnas.map((c) => (
                    <th key={c.campo} className="text-left px-4 py-2 font-semibold">{c.label}</th>
                  ))}
                  {estadoMeta && <th className="text-left px-4 py-2 font-semibold">Estado</th>}
                  <th className="text-left px-4 py-2 font-semibold">Actualizada</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.solicitudId}
                    onClick={() => navigate(`${rutaFormato(gestion, slug)}/${r.solicitudId}`)}
                    className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer"
                  >
                    {columnas.map((c, i) => (
                      <td
                        key={c.campo}
                        className={'px-4 py-2 ' + (i === 0
                          ? 'font-medium text-[hsl(var(--canalco-neutral-900))]'
                          : 'text-[hsl(var(--canalco-neutral-700))]')}
                      >
                        {r.data?.[c.campo] || (
                          <span className="italic text-[hsl(var(--canalco-neutral-400))]">Sin diligenciar</span>
                        )}
                      </td>
                    ))}
                    {estadoMeta && (
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium rounded px-2 py-1 ${estadoMeta.badgeClass(r.estado)}`}>
                          {estadoMeta.label(r.estado)}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-600))]">{fecha(r.updatedAt)}</td>
                    <td className="px-4 py-2">
                      {sePuedeBorrar(r) && (
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={(e) => { e.stopPropagation(); void eliminar(r.solicitudId); }}
                          disabled={borrando === r.solicitudId}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {borrando === r.solicitudId
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
