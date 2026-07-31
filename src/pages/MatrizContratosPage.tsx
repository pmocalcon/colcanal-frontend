import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Home, ArrowLeft, Loader2, Scale, Printer, Search, Clock, AlertTriangle,
  ClipboardCheck, UserCheck, FileSignature,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  ESTADOS, estadoLabel, estadoBadgeClass, calcularSla, type JuridicaEstado,
} from '@/utils/juridicaWorkflow';
import { getTipo } from '@/config/juridicaContratos';

/**
 * Matriz de contratos jurídicos: vista consolidada de todas las solicitudes del formato
 * GTH-002-F con su estado, SLA, datos del contrato y los documentos de fase 2 (chequeo,
 * designación de supervisor, acta de inicio). Buscador, filtro por estado y resumen.
 */

const ORDEN_ESTADOS = Object.keys(ESTADOS) as JuridicaEstado[];

export default function MatrizContratosPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        setRows(await gestionConocimientoService.list({ gestion: 'juridica' }));
      } catch {
        toast.error('No se pudo cargar la matriz');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dato = (s: GcSolicitud) => {
    const d = s.data ?? {};
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const checklist = d.checklist as Record<string, any> | undefined;
    return {
      contratante: (d.empresa || '').toString(),
      contratista: (d.contratista || acta.contratista || '').toString(),
      tipo: getTipo(d.tipoContrato)?.nombre || '',
      valor: (d.honorarios || acta.valor || '').toString(),
      objeto: (d.objetoProyecto || d.alcanceServicio || '').toString(),
      supervisor: (des.supervisorNombre || acta.supervisorNombre || '').toString(),
      inicio: (acta.fechaInicio || '').toString(),
      fin: (acta.fechaFinal || '').toString(),
      tieneChequeo: !!checklist && Object.keys(checklist).length > 0,
      tieneDesignacion: !!d.designacionSupervisor && Object.keys(d.designacionSupervisor).some((k) => (d.designacionSupervisor[k] ?? '') !== ''),
      tieneActa: !!d.actaInicio && Object.keys(d.actaInicio).some((k) => (d.actaInicio[k] ?? '') !== ''),
    };
  };

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((s) => {
      if (estadoFiltro && s.estado !== estadoFiltro) return false;
      if (!t) return true;
      const d = dato(s);
      return [d.contratante, d.contratista, d.tipo, d.objeto, d.supervisor]
        .join(' ').toLowerCase().includes(t);
    });
  }, [rows, q, estadoFiltro]);

  // Resumen por grandes grupos de estado.
  const resumen = useMemo(() => {
    const enProceso = new Set<JuridicaEstado>(['borrador', 'pendiente_firma_gerencia', 'en_tramite_administrativa', 'contrato_en_elaboracion', 'pendiente_firma_contrato']);
    const enEjecucion = new Set<JuridicaEstado>(['contrato_firmado', 'en_solicitud_polizas', 'en_aprobacion_polizas', 'en_pago_polizas', 'en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio']);
    let proceso = 0, ejecucion = 0, finalizados = 0, vencidos = 0;
    rows.forEach((s) => {
      const e = s.estado as JuridicaEstado;
      if (e === 'finalizado') finalizados++;
      else if (enEjecucion.has(e)) ejecucion++;
      else if (enProceso.has(e)) proceso++;
      if (calcularSla(e, s.estadoDesde)?.vencida) vencidos++;
    });
    return { total: rows.length, proceso, ejecucion, finalizados, vencidos };
  }, [rows]);

  const irA = (id: number, sub = '') => navigate(`/dashboard/gestion-conocimiento/juridica/${id}${sub}`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <style>{`
        @media print {
          @page { size: Letter landscape; margin: 8mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica')} title="Volver a Solicitudes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg md:text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Scale className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Matriz de contratos jurídicos
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Vista consolidada de todas las solicitudes y sus documentos</p>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <ResumenCard label="Total" value={resumen.total} />
              <ResumenCard label="En proceso" value={resumen.proceso} tone="amber" />
              <ResumenCard label="En ejecución" value={resumen.ejecucion} tone="blue" />
              <ResumenCard label="Finalizados" value={resumen.finalizados} tone="green" />
              <ResumenCard label="SLA vencido" value={resumen.vencidos} tone="red" />
            </div>

            {/* Controles */}
            <div className="no-print flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-grow">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por contratante, contratista, tipo, objeto o supervisor…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[hsl(var(--canalco-neutral-300))] text-sm outline-none focus:border-[hsl(var(--canalco-primary))] bg-white"
                />
              </div>
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--canalco-neutral-300))] text-sm outline-none focus:border-[hsl(var(--canalco-primary))] bg-white"
              >
                <option value="">Todos los estados</option>
                {ORDEN_ESTADOS.map((e) => (
                  <option key={e} value={e}>{estadoLabel(e)}</option>
                ))}
              </select>
            </div>

            {/* Tabla */}
            {filtradas.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-[hsl(var(--canalco-neutral-300))] rounded-xl text-[hsl(var(--canalco-neutral-600))]">
                No hay contratos que coincidan.
              </div>
            ) : (
              <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead>
                    <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left text-[11px] uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">
                      <th className="px-3 py-3 font-semibold">N.º</th>
                      <th className="px-3 py-3 font-semibold">Contratante</th>
                      <th className="px-3 py-3 font-semibold">Contratista</th>
                      <th className="px-3 py-3 font-semibold">Tipo</th>
                      <th className="px-3 py-3 font-semibold">Valor</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">SLA</th>
                      <th className="px-3 py-3 font-semibold">Inicio → Fin</th>
                      <th className="px-3 py-3 font-semibold">Supervisor</th>
                      <th className="px-3 py-3 font-semibold text-center">Documentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((s) => {
                      const d = dato(s);
                      const sla = calcularSla(s.estado as JuridicaEstado, s.estadoDesde);
                      return (
                        <tr
                          key={s.solicitudId}
                          onClick={() => irA(s.solicitudId)}
                          className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] cursor-pointer align-top"
                        >
                          <td className="px-3 py-3 font-mono text-[hsl(var(--canalco-neutral-700))]">{s.solicitudId}</td>
                          <td className="px-3 py-3 max-w-[180px] truncate" title={d.contratante}>{d.contratante || '—'}</td>
                          <td className="px-3 py-3 max-w-[150px] truncate" title={d.contratista}>{d.contratista || '—'}</td>
                          <td className="px-3 py-3 max-w-[140px] truncate" title={d.tipo}>{d.tipo || '—'}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{d.valor || '—'}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-block text-[11px] font-medium rounded px-2 py-0.5 ${estadoBadgeClass(s.estado)}`}>
                              {estadoLabel(s.estado)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {sla ? (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded px-2 py-0.5 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {sla.vencida ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                {sla.vencida ? 'Vencida' : 'A tiempo'}
                              </span>
                            ) : <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">—</span>}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-[hsl(var(--canalco-neutral-700))]">
                            {d.inicio || d.fin ? `${d.inicio || '…'} → ${d.fin || '…'}` : '—'}
                          </td>
                          <td className="px-3 py-3 max-w-[150px] truncate" title={d.supervisor}>{d.supervisor || '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <DocChip on={d.tieneChequeo} title="Lista de chequeo" onClick={() => irA(s.solicitudId, '/chequeo')}>
                                <ClipboardCheck className="w-3.5 h-3.5" />
                              </DocChip>
                              <DocChip on={d.tieneDesignacion} title="Designación de supervisor" onClick={() => irA(s.solicitudId, '/designacion-supervisor')}>
                                <UserCheck className="w-3.5 h-3.5" />
                              </DocChip>
                              <DocChip on={d.tieneActa} title="Acta de inicio" onClick={() => irA(s.solicitudId, '/acta-inicio')}>
                                <FileSignature className="w-3.5 h-3.5" />
                              </DocChip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

const TONE: Record<string, string> = {
  neutral: 'text-[hsl(var(--canalco-neutral-900))]',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
  green: 'text-green-600',
  red: 'text-red-600',
};

function ResumenCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: keyof typeof TONE }) {
  return (
    <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl px-4 py-3 shadow-sm">
      <div className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</div>
      <div className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-0.5">{label}</div>
    </div>
  );
}

function DocChip({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title}${on ? ' · diligenciado' : ' · pendiente'}`}
      className={`inline-flex items-center justify-center w-7 h-7 rounded border transition-colors ${
        on
          ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
          : 'bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-400))] border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-200))]'
      }`}
    >
      {children}
    </button>
  );
}
