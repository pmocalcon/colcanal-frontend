import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, History, Loader2, X } from 'lucide-react';
import { requisitionsService } from '@/services/requisitions.service';
import type { Requisition } from '@/types/requisition.types';
import { buildXlsxBlob, downloadBlob, type XlsxRow } from '@/utils/xlsxWriter';

/**
 * Historial de RQ (requisiciones) de una obra/proyecto.
 *
 * Convierte la columna «Req.» de la tabla Presupuesto vs Órdenes de Compra —que hoy es un
 * número ciego— en algo navegable: todas las requisiciones del proyecto, con su fecha,
 * estado, solicitante y sus materiales. Si se selecciona un material (al hacer clic en su
 * fila) el listado se filtra a las RQ que lo pidieron, mostrando la cantidad de ese material.
 *
 * Se apoya en `getAllRequisitions({ projectId })`, que ya trae los ítems con su material,
 * el estado, el solicitante y las fechas. No agrega nada al backend.
 */

const fechaCorta = (iso?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/** Cantidad total de un material dentro de una requisición (por código). */
const cantidadDeMaterial = (r: Requisition, codigo: string) =>
  (r.items ?? [])
    .filter((it) => (it.material?.code ?? '').toUpperCase() === codigo.toUpperCase())
    .reduce((s, it) => s + Number(it.quantity ?? 0), 0);

export function HistorialRqObra({
  projectId,
  materialSeleccionado,
  onSeleccionarMaterial,
  nombreObra,
}: {
  projectId: number | null;
  /** Código de material por el que filtrar (se setea al hacer clic en una fila de la tabla). */
  materialSeleccionado?: string | null;
  onSeleccionarMaterial?: (code: string | null) => void;
  nombreObra?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [reqs, setReqs] = useState<Requisition[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [estadoSel, setEstadoSel] = useState('');
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());

  // Al seleccionar un material desde la tabla, abre el panel para que se vea el resultado.
  useEffect(() => {
    if (materialSeleccionado) setAbierto(true);
  }, [materialSeleccionado]);

  // La cache se descarta si cambia el proyecto.
  useEffect(() => {
    setReqs(null);
    setExpandidas(new Set());
  }, [projectId]);

  // Se cargan las requisiciones la primera vez que se abre el panel.
  useEffect(() => {
    if (!abierto || projectId == null || reqs !== null || cargando) return;
    let cancel = false;
    setCargando(true);
    setError(false);
    requisitionsService
      .getAllRequisitions({ projectId, limit: 500 })
      .then((r) => { if (!cancel) setReqs(r.data ?? []); })
      .catch(() => { if (!cancel) setError(true); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [abierto, projectId, reqs, cargando]);

  const estados = useMemo(() => {
    const set = new Set<string>();
    (reqs ?? []).forEach((r) => { if (r.status?.name) set.add(r.status.name); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [reqs]);

  const filtradas = useMemo(() => {
    let list = reqs ?? [];
    if (materialSeleccionado) {
      const code = materialSeleccionado.toUpperCase();
      list = list.filter((r) => (r.items ?? []).some((it) => (it.material?.code ?? '').toUpperCase() === code));
    }
    if (estadoSel) list = list.filter((r) => (r.status?.name ?? '') === estadoSel);
    return list;
  }, [reqs, materialSeleccionado, estadoSel]);

  const toggleFila = (id: number) =>
    setExpandidas((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const exportar = async () => {
    if (filtradas.length === 0) return;
    const filas: XlsxRow[] = [
      ['N.º RQ', 'Fecha', 'Estado', 'Solicitante', 'Obra', 'Código', 'Material', 'Cantidad', 'Unidad'].map(
        (v) => ({ v, s: 'header' as const }),
      ),
    ];
    filtradas.forEach((r) => {
      const items = materialSeleccionado
        ? (r.items ?? []).filter((it) => (it.material?.code ?? '').toUpperCase() === materialSeleccionado.toUpperCase())
        : (r.items ?? []);
      (items.length ? items : [null]).forEach((it) => {
        filas.push([
          { v: r.requisitionNumber, s: 'text' },
          { v: fechaCorta(r.createdAt), s: 'text' },
          { v: r.status?.name ?? '', s: 'text' },
          { v: r.creator?.nombre ?? '', s: 'text' },
          { v: r.obra ?? r.codigoObra ?? '', s: 'text' },
          { v: it?.material?.code ?? '', s: 'text' },
          { v: it?.material?.description ?? it?.material?.name ?? '', s: 'text' },
          { v: it ? Number(it.quantity ?? 0) : null, s: 'qty' },
          { v: it?.unit ?? '', s: 'text' },
        ]);
      });
    });
    const blob = await buildXlsxBlob('Historial RQ', filas, [16, 12, 18, 24, 20, 12, 34, 12, 10]);
    const suf = (nombreObra ? nombreObra.replace(/[^\w-]+/g, '_') : `proyecto_${projectId}`).slice(0, 40);
    downloadBlob(blob, `Historial_RQ_${suf}.xlsx`);
  };

  const total = reqs?.length ?? 0;

  return (
    <section className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between hover:bg-[hsl(var(--canalco-neutral-50))]"
      >
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] uppercase tracking-wide flex items-center gap-1.5">
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <History className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />Historial de RQ
        </h3>
        <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">
          {reqs === null ? 'ver requisiciones' : `${total} requisici${total === 1 ? 'ón' : 'ones'}`}
        </span>
      </button>

      {abierto && (
        <div className="p-4 space-y-3">
          {/* Controles */}
          <div className="flex flex-wrap items-center gap-2">
            {materialSeleccionado && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] rounded-full pl-2.5 pr-1 py-1">
                Material {materialSeleccionado}
                <button
                  type="button"
                  onClick={() => onSeleccionarMaterial?.(null)}
                  className="rounded-full hover:bg-[hsl(var(--canalco-primary))]/20 p-0.5"
                  title="Quitar filtro de material"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {estados.length > 0 && (
              <select
                value={estadoSel}
                onChange={(e) => setEstadoSel(e.target.value)}
                className="text-xs border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1 bg-white outline-none"
              >
                <option value="">Todos los estados</option>
                {estados.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">{filtradas.length} en pantalla</span>
            <button
              type="button"
              onClick={exportar}
              disabled={filtradas.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2.5 py-1 hover:bg-[hsl(var(--canalco-neutral-50))] disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>

          {cargando ? (
            <div className="flex items-center justify-center py-10 text-[hsl(var(--canalco-neutral-500))]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-500">No se pudieron cargar las requisiciones.</p>
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
              {materialSeleccionado
                ? `Ninguna RQ de esta obra pidió el material ${materialSeleccionado}.`
                : 'Esta obra no tiene requisiciones registradas.'}
            </p>
          ) : (
            <div className="overflow-auto max-h-[60vh] border border-[hsl(var(--canalco-neutral-200))] rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
                  <tr className="text-[hsl(var(--canalco-neutral-500))] text-left">
                    <th className="px-3 py-2 font-medium w-8" />
                    <th className="px-3 py-2 font-medium">N.º RQ</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Solicitante</th>
                    <th className="px-3 py-2 font-medium text-right">
                      {materialSeleccionado ? `Cant. ${materialSeleccionado}` : 'Ítems'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--canalco-neutral-100))]">
                  {filtradas.map((r) => {
                    const abierta = expandidas.has(r.requisitionId);
                    const color = r.status?.color;
                    return (
                      <Fragment key={r.requisitionId}>
                        <tr
                          onClick={() => toggleFila(r.requisitionId)}
                          className="hover:bg-[hsl(var(--canalco-neutral-50))] cursor-pointer"
                        >
                          <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-400))]">
                            {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-[hsl(var(--canalco-primary))]">{r.requisitionNumber}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fechaCorta(r.createdAt)}</td>
                          <td className="px-3 py-2">
                            <span
                              className="text-[11px] font-medium rounded px-2 py-0.5 whitespace-nowrap"
                              style={color
                                ? { backgroundColor: `${color}22`, color }
                                : { backgroundColor: '#eeeef5', color: '#4a4a63' }}
                            >
                              {r.status?.name ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate" title={r.creator?.nombre ?? ''}>{r.creator?.nombre ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            {materialSeleccionado
                              ? cantidadDeMaterial(r, materialSeleccionado).toLocaleString('es-CO')
                              : (r.items?.length ?? 0)}
                          </td>
                        </tr>
                        {abierta && (
                          <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                            <td />
                            <td colSpan={5} className="px-3 py-2">
                              <table className="w-full text-[11px]">
                                <thead className="text-[hsl(var(--canalco-neutral-400))] text-left">
                                  <tr>
                                    <th className="py-1 font-medium">Código</th>
                                    <th className="py-1 font-medium">Material</th>
                                    <th className="py-1 font-medium text-right">Cantidad</th>
                                    <th className="py-1 font-medium">Unidad</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.items ?? []).map((it) => {
                                    const resaltado = materialSeleccionado
                                      && (it.material?.code ?? '').toUpperCase() === materialSeleccionado.toUpperCase();
                                    return (
                                      <tr key={it.itemId} className={resaltado ? 'text-[hsl(var(--canalco-primary))] font-semibold' : ''}>
                                        <td className="py-1 font-mono">{it.material?.code ?? '—'}</td>
                                        <td className="py-1">{it.material?.description ?? it.material?.name ?? '—'}</td>
                                        <td className="py-1 text-right tabular-nums">{Number(it.quantity ?? 0).toLocaleString('es-CO')}</td>
                                        <td className="py-1 text-[hsl(var(--canalco-neutral-500))]">{it.unit ?? '—'}</td>
                                      </tr>
                                    );
                                  })}
                                  {(r.items ?? []).length === 0 && (
                                    <tr><td colSpan={4} className="py-1 text-[hsl(var(--canalco-neutral-400))]">Sin ítems.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
