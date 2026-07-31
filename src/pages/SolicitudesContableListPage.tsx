import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Plus, FileText, Trash2, Loader2, Calculator, Receipt, Wallet, Inbox, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  ANTICIPO_ESTADOS,
  estadoLabel as labelAnticipo,
  estadoBadgeClass as badgeAnticipo,
} from '@/utils/anticipoWorkflow';
import {
  LEGALIZACION_ESTADOS,
  estadoLabel as labelLegalizacion,
  estadoBadgeClass as badgeLegalizacion,
} from '@/utils/legalizacionWorkflow';

/**
 * Listado de G. contable y tributaria. Dos formatos:
 *  - Solicitud de Anticipo (GF-005-F) — lleva consecutivo propio (0001, 0002…).
 *  - Legalización de Anticipo (GCT-006-F) — se enlaza a un anticipo por su consecutivo.
 */

const GESTION = 'contable';
const FORMATO_ANTICIPO = 'GF-005-F';
const FORMATO_LEGALIZACION = 'GCT-006-F';

const fmtCOP = (v: any) => {
  if (v === undefined || v === null || v === '') return '—';
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? '—' : '$' + n.toLocaleString('es-CO');
};
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Le toca actuar al usuario: el backend ya resolvió rol y jerarquía. */
const meToca = (s: GcSolicitud) => (s.accionesPendientes?.length ?? 0) > 0;

export default function SolicitudesContableListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'anticipos' | 'legalizaciones'>('anticipos');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await gestionConocimientoService.list({ gestion: GESTION }));
    } catch {
      toast.error('No se pudieron cargar los formatos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const todosAnticipos = useMemo(() => rows.filter((r) => r.formato === FORMATO_ANTICIPO), [rows]);
  const todasLegalizaciones = useMemo(() => rows.filter((r) => r.formato === FORMATO_LEGALIZACION), [rows]);

  // Cuántas esperan una acción MÍA (para el contador de la bandeja).
  const pendientesAnticipos = useMemo(() => todosAnticipos.filter(meToca).length, [todosAnticipos]);
  const pendientesLegalizaciones = useMemo(() => todasLegalizaciones.filter(meToca).length, [todasLegalizaciones]);
  const misPendientes = pendientesAnticipos + pendientesLegalizaciones;

  const aplicarFiltros = (lista: GcSolicitud[]) =>
    lista
      .filter((s) => (soloPendientes ? meToca(s) : true))
      .filter((s) => (filtroEstado ? s.estado === filtroEstado : true));

  const anticipos = useMemo(
    () => aplicarFiltros(todosAnticipos),
    [todosAnticipos, soloPendientes, filtroEstado],
  );
  const legalizaciones = useMemo(
    () => aplicarFiltros(todasLegalizaciones),
    [todasLegalizaciones, soloPendientes, filtroEstado],
  );

  // Los estados que ofrece el selector cambian según la pestaña.
  const estadosDelTab = tab === 'anticipos' ? ANTICIPO_ESTADOS : LEGALIZACION_ESTADOS;
  // Al cambiar de pestaña, un estado del otro flujo dejaría la tabla vacía.
  const cambiarTab = (t: 'anticipos' | 'legalizaciones') => { setTab(t); setFiltroEstado(''); };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el formato N.º ${id}?`)) return;
    try {
      await gestionConocimientoService.remove(id);
      toast.success('Formato eliminado');
      setRows((prev) => prev.filter((r) => r.solicitudId !== id));
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const base = '/dashboard/gestion-conocimiento/contable';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento')} title="Volver a Gestión del conocimiento">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg md:text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> G. contable y tributaria
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Anticipos (GF-005-F) y su legalización (GCT-006-F)</p>
          </div>
          {tab === 'anticipos' ? (
            <Button onClick={() => navigate(`${base}/anticipo/nueva`)} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              <Plus className="w-4 h-4" /> Nuevo anticipo
            </Button>
          ) : (
            <Button onClick={() => navigate(`${base}/legalizacion/nueva`)} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              <Plus className="w-4 h-4" /> Nueva legalización
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Pestañas */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => cambiarTab('anticipos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              tab === 'anticipos'
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            <Wallet className="w-4 h-4" /> Anticipos ({todosAnticipos.length})
            {pendientesAnticipos > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white text-[11px] font-bold px-1.5 py-0.5 leading-none">{pendientesAnticipos}</span>
            )}
          </button>
          <button
            onClick={() => cambiarTab('legalizaciones')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              tab === 'legalizaciones'
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            <Receipt className="w-4 h-4" /> Legalizaciones ({todasLegalizaciones.length})
            {pendientesLegalizaciones > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white text-[11px] font-bold px-1.5 py-0.5 leading-none">{pendientesLegalizaciones}</span>
            )}
          </button>
        </div>

        {/* Bandeja y filtro por estado */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={() => setSoloPendientes((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              soloPendientes
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
            title="Solo lo que espera una acción mía"
          >
            <Inbox className="w-4 h-4" /> Pendientes de mí ({misPendientes})
          </button>

          <div className="inline-flex items-center gap-2">
            <Filter className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
            >
              <option value="">Todos los estados</option>
              {Object.entries(estadosDelTab).map(([code, meta]) => (
                <option key={code} value={code}>{meta.label}</option>
              ))}
            </select>
          </div>

          {(soloPendientes || filtroEstado) && (
            <button
              onClick={() => { setSoloPendientes(false); setFiltroEstado(''); }}
              className="text-xs text-[hsl(var(--canalco-neutral-500))] underline hover:text-[hsl(var(--canalco-neutral-700))]"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : tab === 'anticipos' ? (
          anticipos.length === 0 ? (
            todosAnticipos.length > 0 ? (
              <EmptyState label="Ningún anticipo coincide con los filtros." onCreate={() => { setSoloPendientes(false); setFiltroEstado(''); }} cta="Limpiar filtros" />
            ) : (
            <EmptyState label="Aún no hay anticipos." onCreate={() => navigate(`${base}/anticipo/nueva`)} cta="Crear el primero" />
            )
          ) : (
            <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-xs uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">
                    <th className="px-4 py-3 font-semibold">N.º anticipo</th>
                    <th className="px-4 py-3 font-semibold">Beneficiario</th>
                    <th className="px-4 py-3 font-semibold">Concepto</th>
                    <th className="px-4 py-3 font-semibold text-right">Valor (COP)</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Actualizado</th>
                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {anticipos.map((s) => (
                    <tr
                      key={s.solicitudId}
                      onClick={() => navigate(`${base}/anticipo/${s.solicitudId}`)}
                      className={`border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer ${meToca(s) ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                        {meToca(s) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 align-middle" title="Espera una acción tuya" />}
                        {s.data?.consecutivo || `#${s.solicitudId}`}
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-900))] max-w-[16rem] truncate">{s.data?.benefNombre || '—'}</td>
                      <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-700))] max-w-[16rem] truncate">{s.data?.concepto || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtCOP(s.data?.valor)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[11px] font-medium rounded px-2 py-1 ${badgeAnticipo(s.estado)}`}>{labelAnticipo(s.estado)}</span>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{fecha(s.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {s.estado === 'borrador' && (
                          <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, s.solicitudId)} title="Eliminar" className="text-[hsl(var(--canalco-neutral-500))] hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : legalizaciones.length === 0 ? (
          todasLegalizaciones.length > 0 ? (
            <EmptyState label="Ninguna legalización coincide con los filtros." onCreate={() => { setSoloPendientes(false); setFiltroEstado(''); }} cta="Limpiar filtros" />
          ) : (
            <EmptyState label="Aún no hay legalizaciones." onCreate={() => navigate(`${base}/legalizacion/nueva`)} cta="Crear la primera" />
          )
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-xs uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">
                  <th className="px-4 py-3 font-semibold">Anticipo</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold text-right">Facturas y recibos</th>
                  <th className="px-4 py-3 font-semibold text-right">Saldo en caja</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Actualizado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {legalizaciones.map((s) => (
                  <tr
                    key={s.solicitudId}
                    onClick={() => navigate(`${base}/legalizacion/${s.solicitudId}`)}
                    className={`border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer ${meToca(s) ? 'bg-amber-50/60' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-[hsl(var(--canalco-primary))]">
                      {meToca(s) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 align-middle" title="Espera una acción tuya" />}
                      {s.data?.anticipoConsecutivo || '—'}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-900))] max-w-[16rem] truncate">{s.data?.empresa || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCOP(s.data?.totalFacturas)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCOP(s.data?.saldoCaja)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-medium rounded px-2 py-1 ${badgeLegalizacion(s.estado)}`}>{labelLegalizacion(s.estado)}</span>
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{fecha(s.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {s.estado === 'borrador' && (
                        <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, s.solicitudId)} title="Eliminar" className="text-[hsl(var(--canalco-neutral-500))] hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
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

function EmptyState({ label, onCreate, cta }: { label: string; onCreate: () => void; cta: string }) {
  return (
    <div className="text-center py-20 border-2 border-dashed border-[hsl(var(--canalco-neutral-300))] rounded-xl">
      <FileText className="w-10 h-10 text-[hsl(var(--canalco-neutral-400))] mx-auto mb-3" />
      <p className="text-[hsl(var(--canalco-neutral-600))]">{label}</p>
      <Button variant="link" onClick={onCreate} className="text-[hsl(var(--canalco-primary))]">{cta}</Button>
    </div>
  );
}
