import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, FileText, Trash2, Loader2, Scale, Clock, AlertTriangle, Pencil, Table2, Inbox, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { ESTADOS, estadoLabel, estadoBadgeClass, calcularSla, type JuridicaEstado } from '@/utils/juridicaWorkflow';
import { getTipo } from '@/config/juridicaContratos';
import { FORMATO_CONTRATACION } from '@/config/formatosGestion';

/** Le toca actuar al usuario: el backend ya resolvió rol y jerarquía. */
const meToca = (s: GcSolicitud) => (s.accionesPendientes?.length ?? 0) > 0;

/**
 * Listado del trámite de contratación (GTH-002-F): desde aquí se crea uno nuevo o se abre
 * uno existente para editar/imprimir.
 *
 * Ya no es la entrada de la gestión —esa es la portada de formatos— sino la de **este**
 * formato, y por eso filtra por él.
 */
export default function SolicitudesJuridicaListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      // Filtrado por formato: la gestión ya no tiene un solo formato, y sin esto las
      // actas de terminación saldrían acá con estado y SLA de un trámite que no tienen.
      const todas = await gestionConocimientoService.list({ gestion: 'juridica' });
      setRows(todas.filter((r) => r.formato === FORMATO_CONTRATACION));
    } catch {
      toast.error('No se pudieron cargar las solicitudes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const misPendientes = useMemo(() => rows.filter(meToca).length, [rows]);

  const visibles = useMemo(
    () =>
      rows
        .filter((s) => (soloPendientes ? meToca(s) : true))
        .filter((s) => (filtroEstado ? s.estado === filtroEstado : true))
        // Del más nuevo al más viejo por su consecutivo. El backend las ordena por fecha
        // de actualización, y así la columna del número se veía saltada —2, 26, 6, 5, 3—
        // aunque las filas estuvieran bien ordenadas por otra cosa. Los borradores, que
        // todavía no tienen número, encabezan: son los que están sin terminar.
        .slice()
        .sort((a, b) => (b.numero ?? Infinity) - (a.numero ?? Infinity)),
    [rows, soloPendientes, filtroEstado],
  );

  const limpiarFiltros = () => { setSoloPendientes(false); setFiltroEstado(''); };

  const handleDelete = async (e: React.MouseEvent, id: number, numero?: number | null) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la solicitud N.º ${numero ?? id}?`)) return;
    try {
      await gestionConocimientoService.remove(id);
      toast.success('Solicitud eliminada');
      setRows((prev) => prev.filter((r) => r.solicitudId !== id));
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  /**
   * Con qué se contrata, que es lo que distingue una solicitud de otra en la lista.
   *
   * Antes iba el objeto del proyecto, pero es texto largo que se corta a media frase y
   * las requisiciones de personal ni siquiera lo tienen —ese campo es del GTH-002-F—,
   * así que salían todas como «Sin objeto diligenciado».
   */
  const resumen = (s: GcSolicitud): string =>
    getTipo(s.data?.tipoContrato)?.nombre || 'Sin tipo de contrato';

  /** El objeto, que pasa al tooltip de la fila. Vacío en las requisiciones de personal. */
  const objeto = (s: GcSolicitud): string => {
    const d = s.data || {};
    const texto = (d.objetoProyecto || d.alcanceServicio || '').toString().trim();
    return texto || 'Sin objeto diligenciado';
  };

  /**
   * Con quién se contrata. Antes de que se defina hay una persona o empresa sugerida,
   * que es lo mejor que se puede mostrar: dejar la celda vacía haría parecer que la
   * solicitud no tiene destinatario cuando sí lo tiene, solo que todavía sin cerrar.
   */
  const contratista = (s: GcSolicitud): { texto: string; sugerido: boolean } => {
    const d = s.data || {};
    const firme = (d.contratista || '').toString().trim();
    if (firme) return { texto: firme, sugerido: false };
    const sug = (d.sugNombre || '').toString().trim();
    if (sug) return { texto: sug, sugerido: true };
    return { texto: '—', sugerido: false };
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const renderSla = (s: GcSolicitud) => {
    const sla = calcularSla(s.estado as JuridicaEstado, s.estadoDesde);
    if (!sla) return <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">—</span>;
    const cls = sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-0.5 ${cls}`}>
        {sla.vencida ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
        {sla.vencida ? 'Vencida' : 'A tiempo'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento')} title="Volver a Gestión del conocimiento">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg md:text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Scale className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> G. jurídica · Solicitudes
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Formato GTH-002-F · Prestación de servicios, alquiler, obra y/o suministro</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/matriz')} className="gap-2">
            <Table2 className="w-4 h-4" /> Matriz contratos
          </Button>
          <Button onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/nueva')} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
            <Plus className="w-4 h-4" /> Nueva solicitud
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Bandeja y filtro por estado */}
        {!loading && rows.length > 0 && (
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
                {Object.entries(ESTADOS).map(([code, meta]) => (
                  <option key={code} value={code}>{meta.label}</option>
                ))}
              </select>
            </div>

            <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
              {visibles.length} de {rows.length}
            </span>

            {(soloPendientes || filtroEstado) && (
              <button onClick={limpiarFiltros} className="text-xs text-[hsl(var(--canalco-neutral-500))] underline hover:text-[hsl(var(--canalco-neutral-700))]">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-[hsl(var(--canalco-neutral-300))] rounded-xl">
            <FileText className="w-10 h-10 text-[hsl(var(--canalco-neutral-400))] mx-auto mb-3" />
            <p className="text-[hsl(var(--canalco-neutral-600))]">Aún no hay solicitudes.</p>
            <Button variant="link" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica/nueva')} className="text-[hsl(var(--canalco-primary))]">
              Crear la primera
            </Button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-[hsl(var(--canalco-neutral-300))] rounded-xl">
            <Inbox className="w-10 h-10 text-[hsl(var(--canalco-neutral-400))] mx-auto mb-3" />
            <p className="text-[hsl(var(--canalco-neutral-600))]">
              {soloPendientes ? 'No tienes solicitudes esperando una acción tuya.' : 'Ninguna solicitud coincide con los filtros.'}
            </p>
            <Button variant="link" onClick={limpiarFiltros} className="text-[hsl(var(--canalco-primary))]">Limpiar filtros</Button>
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-xs uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">
                  <th className="px-4 py-3 font-semibold">N.º</th>
                  <th className="px-4 py-3 font-semibold">Tipo de contrato</th>
                  <th className="px-4 py-3 font-semibold">Contratista</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">SLA</th>
                  <th className="px-4 py-3 font-semibold">Actualizada</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => (
                  <tr
                    key={s.solicitudId}
                    onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${s.solicitudId}`)}
                    className={`border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer ${meToca(s) ? 'bg-amber-50/60' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-[hsl(var(--canalco-neutral-700))]">
                      {meToca(s) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 align-middle" title="Espera una acción tuya" />}
                      {/*
                        Un borrador todavía no gastó número —se asigna la primera vez que
                        deja de serlo—, así que acá va la raya con que la tabla marca lo
                        que aún no existe, igual que en Contratista y en SLA. Decía
                        «borrador», que es la misma palabra que la columna Estado muestra
                        dos celdas más allá: repetirla no informaba y hacía leer la
                        columna del número como si fuera texto.
                      */}
                      {s.numero ?? (
                        <span
                          className="text-[hsl(var(--canalco-neutral-400))]"
                          title="Sin número: se asigna cuando el borrador se envía"
                        >
                          —
                        </span>
                      )}
                    </td>
                    {/* El objeto no desaparece: pasa al tooltip, que es donde sirve
                        para distinguir dos contratos del mismo tipo. */}
                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-900))]" title={objeto(s)}>
                      {resumen(s)}
                    </td>
                    {(() => {
                      const c = contratista(s);
                      return (
                        <td
                          className={'px-4 py-3 max-w-xs truncate ' + (c.sugerido
                            ? 'italic text-[hsl(var(--canalco-neutral-500))]'
                            : 'text-[hsl(var(--canalco-neutral-900))]')}
                          title={c.sugerido ? `${c.texto} · sugerido, aún sin definir` : c.texto}
                        >
                          {c.texto}
                        </td>
                      );
                    })()}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${estadoBadgeClass(s.estado)}`}>
                        {estadoLabel(s.estado)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{renderSla(s)}</td>
                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{fecha(s.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/gestion-conocimiento/juridica/${s.solicitudId}`); }}
                          title="Editar"
                          className="text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-primary))]"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {s.estado === 'borrador' && (
                          <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, s.solicitudId, s.numero)} title="Eliminar" className="text-[hsl(var(--canalco-neutral-500))] hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
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
