import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Clock, History, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { FORMATO_PERMISO } from '@/config/formatosGestion';
import {
  type PermisoEstado,
  type PermisoTransicion,
  accionesDisponibles,
  calcularSla,
  estadoLabel,
  estadoBadgeClass,
  PERMISO_ESTADOS,
  esTerminal,
  puedeEditarSolicitud,
  puedeEditarAprobacion,
} from '@/utils/permisoWorkflow';
import { textoSla } from '@/utils/juridicaWorkflow';

/**
 * Solicitud de Permiso · formato GTH-009-F (G. de talento humano).
 *
 * Formulario impreso de una sola tabla: etiqueta a la izquierda, espacio para escribir a
 * la derecha. Lo aprueba el **jefe de área** del solicitante, que sale de la tabla de
 * autorizaciones y no de un rol fijo.
 *
 * El formato tiene dos dueños y el permiso de edición va por zonas:
 *  - Arriba lo llena el solicitante, solo mientras es borrador.
 *  - El cuadro «Aprobación interna» lo llena el jefe, solo mientras está en su bandeja,
 *    y se guarda junto con su decisión. El solicitante no lo toca nunca.
 *
 * @see permisoWorkflow — la máquina de estados, espejo de la del backend.
 *
 * Ruta: `.../talento-humano/permiso/:id`.
 */

/** Sí y No son excluyentes; vacío = la dirección todavía no se pronunció. */
type Decision = 'si' | 'no' | '';

interface PermisoState {
  fechaSolicitud: string;
  proyecto: string;
  nombre: string;
  cargo: string;
  tipoPermiso: string;
  motivo: string;
  fechaPermiso: string;
  horario: string;
  nombreSolicitante: string;

  // ── Aprobación interna ──
  /** Por clave de dirección. Las firmas van a mano sobre el impreso. */
  aprobaciones: Record<string, Decision>;
  fechaAprobacion: string;
  observaciones: string;
}

const EMPTY: PermisoState = {
  fechaSolicitud: '', proyecto: '', nombre: '', cargo: '', tipoPermiso: '',
  motivo: '', fechaPermiso: '', horario: '', nombreSolicitante: '',
  aprobaciones: {}, fechaAprobacion: '', observaciones: '',
};

/**
 * Las direcciones que se pronuncian, tal como están impresas.
 *
 * Se guardan por **clave estable** y no por su etiqueta: si mañana una dirección se
 * renombra, lo marcado sigue donde estaba en vez de perderse.
 */
const DIRECCIONES: { key: string; label: string }[] = [
  { key: 'comercial', label: 'APROBACIÓN DIRECCIÓN COMERCIAL' },
  { key: 'financiera', label: 'APROBACIÓN DIRECCIÓN FINANCIERA' },
  { key: 'operativa', label: 'APROBACIÓN DIRECCIÓN OPERATIVA' },
  { key: 'juridica', label: 'APROBACIÓN DIRECCIÓN JURIDICA' },
  { key: 'pmo', label: 'APROBACIÓN DIRECCIÓN PMO' },
  { key: 'gerencia-proyectos', label: 'APROBACIÓN GERENCIA DE PROYECTOS' },
  { key: 'tecnica', label: 'APROBACIÓN DE DIRECCIÓN TECNICA' },
  { key: 'tics', label: "APROBACIÓN DIRECCIÓN TIC's" },
  { key: 'administrativa-financiera', label: 'APROBACIÓN DIRECCIÓN ADMINISTRATIVA Y FINANCIERA' },
  // Va de última, antes de la fecha de aprobación: Gerencia se pronuncia sobre lo que
  // ya dijeron las direcciones, no en paralelo con ellas.
  { key: 'gerencia', label: 'APROBACIÓN GERENCIA' },
];

/**
 * Las filas del formato, en su orden. El renglón de la firma va aparte: se firma a mano.
 *
 * El tipo se restringe a los campos de texto —no a todo `PermisoState`— porque estas
 * filas pintan un `input`, y `aprobaciones` no es un texto.
 */
type CampoTexto =
  | 'fechaSolicitud' | 'proyecto' | 'nombre' | 'cargo' | 'tipoPermiso'
  | 'motivo' | 'fechaPermiso' | 'horario' | 'nombreSolicitante';

const FILAS: { key: CampoTexto; label: string; area?: boolean }[] = [
  { key: 'fechaSolicitud', label: 'FECHA DE SOLICITUD:' },
  { key: 'proyecto', label: 'PROYECTO:' },
  { key: 'nombre', label: 'NOMBRE:' },
  { key: 'cargo', label: 'CARGO:' },
  // Va antes del motivo: primero de qué tipo es el permiso y después por qué.
  { key: 'tipoPermiso', label: 'TIPO DE PERMISO:' },
  { key: 'motivo', label: 'MOTIVO:', area: true },
  { key: 'fechaPermiso', label: 'FECHA DE PERMISO:' },
  { key: 'horario', label: 'HORARIO:' },
  { key: 'nombreSolicitante', label: 'NOMBRE DEL SOLICITANTE' },
];

export default function SolicitudPermisoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PermisoState>(EMPTY);
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const estado = (sol?.estado as PermisoEstado | undefined) ?? undefined;
  const esCreador = sol?.createdBy != null && sol.createdBy === user?.userId;
  const editaSolicitud = puedeEditarSolicitud(estado ?? null);
  const editaAprobacion = puedeEditarAprobacion(estado ?? null, user?.nombreRol, esCreador);

  const set = <K extends keyof PermisoState>(k: K, v: PermisoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /** Marcar Sí apaga No, y volver a marcar lo mismo deja la fila sin pronunciar. */
  const decidir = (key: string, valor: Exclude<Decision, ''>) =>
    setF((p) => ({
      ...p,
      aprobaciones: { ...p.aprobaciones, [key]: p.aprobaciones[key] === valor ? '' : valor },
    }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        setSol(row);
        const saved = (row.data ?? {}) as Partial<PermisoState>;
        setF({ ...EMPTY, ...saved, aprobaciones: saved.aprobaciones ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const recargar = async () => {
    if (docId === null) return;
    try {
      const row = await gestionConocimientoService.get(docId);
      setSol(row);
      const saved = (row.data ?? {}) as Partial<PermisoState>;
      setF({ ...EMPTY, ...saved, aprobaciones: saved.aprobaciones ?? {} });
    } catch { /* si falla la recarga, la pantalla se queda con lo que ya tenía */ }
  };

  /**
   * El cuadro de aprobación interna viaja con la decisión, no con «Guardar»: es del
   * jefe, y solo puede escribirlo en el mismo acto en que aprueba o niega.
   */
  const handleTransicion = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    const data = editaAprobacion
      ? { aprobaciones: f.aprobaciones, observaciones: f.observaciones }
      : undefined;
    try {
      await gestionConocimientoService.transition(docId!, { accion, motivo, data });
      toast.success('Acción registrada');
      await recargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'talento-humano',
        formato: FORMATO_PERMISO,
        data: f,
      });
      setSol(guardada);
      toast.success('Solicitud guardada');
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda solicitud.
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/permiso/${guardada.solicitudId}`,
          { replace: true },
        );
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#16162b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 15mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/permiso')} title="Volver a las solicitudes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Solicitud de permiso</h1>
            <p className="text-xs text-[#4a4a63]">Formato GTH-009-F · Solicitud N.º {docId}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {/* «Guardar» es del solicitante. Lo que escribe el jefe va con su decisión. */}
          {editaSolicitud && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {sol && (
          <PermisoWorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={esCreador}
            onAccion={handleTransicion}
          />
        )}

        <div className="doc bg-white border border-black text-[11px] text-black shadow-md">

          {/* Encabezado del formato */}
          <div className="grid grid-cols-[110px_1fr_110px_170px] border-b border-black">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[12px] tracking-wide border-r border-black text-[#4a4a63]">
              SOLICITUD DE PERMISO
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[10px] content-start">
              <Meta label="CÓDIGO:" value="GTH-009-F" />
              <Meta label="FECHA:" value="20/08/2026" />
              <Meta label="VERSIÓN:" value="2" last />
            </div>
          </div>

          {/* Cuerpo */}
          <table className="w-full border-collapse">
            <tbody>
              {FILAS.map(({ key, label, area }) => (
                <tr key={key}>
                  <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">
                    {label}
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    {area ? (
                      <textarea
                        value={f[key]}
                        onChange={(e) => set(key, e.target.value)}
                        readOnly={!editaSolicitud}
                        rows={2}
                        className="w-full bg-transparent outline-none resize-y text-[11px]"
                      />
                    ) : (
                      <input
                        value={f[key]}
                        onChange={(e) => set(key, e.target.value)}
                        readOnly={!editaSolicitud}
                        className="w-full bg-transparent outline-none text-[11px]"
                      />
                    )}
                  </td>
                </tr>
              ))}
              {/* La firma no se teclea: se firma a mano sobre el impreso. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  FIRMA DEL SOLICITANTE
                </td>
                <td className="border border-black px-2 py-6"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Aprobación interna. Cuadro aparte, como en el papel: lo diligencia el jefe
            del área, no quien pide el permiso, y solo mientras está en su bandeja. */}
        <div className="doc bg-white border border-black text-[11px] text-black shadow-md mt-6">
          <p className="px-2 py-1.5 font-bold border-b border-black">
            APROBACIÓN INTERNA DE LA SOLICITUD DE PERMISO
          </p>
          {!editaAprobacion && (
            <p className="no-print px-2 py-1 text-[10px] italic text-[#8a8aa3] border-b border-black">
              Este cuadro lo diligencia el jefe de área cuando la solicitud está en su bandeja.
            </p>
          )}

          <table className="w-full border-collapse">
            <tbody>
              {/* La fecha no se vuelve a teclear: es la de arriba. Con dos campos, el
                  mismo papel podría acabar mostrando dos fechas de solicitud distintas. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] w-[38%]">
                  FECHA DE SOLICITUD
                </td>
                <td className="border border-black px-2 py-1" colSpan={3}>{f.fechaSolicitud}</td>
              </tr>

              {DIRECCIONES.map(({ key, label }) => {
                const d = f.aprobaciones[key] ?? '';
                return (
                  <tr key={key}>
                    <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-middle">
                      {label}
                    </td>
                    <td className="border border-black px-2 py-1 w-[14%]">
                      <Casilla label="SI" checked={d === 'si'} onToggle={() => decidir(key, 'si')} disabled={!editaAprobacion} />
                    </td>
                    <td className="border border-black px-2 py-1 w-[14%]">
                      <Casilla label="NO" checked={d === 'no'} onToggle={() => decidir(key, 'no')} disabled={!editaAprobacion} />
                    </td>
                    {/* La firma va a mano sobre el impreso. */}
                    <td className="border border-black px-2 py-1 w-[26%]">FIRMA:</td>
                  </tr>
                );
              })}

              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">
                  FECHA DE APROBACIÓN
                </td>
                {/* La pone el sistema al aprobar: es la fecha en que se aprobó, no una
                    que se teclee después. */}
                <td className="border border-black px-2 py-1" colSpan={3}>{f.fechaAprobacion}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  OBSERVACIONES
                </td>
                <td className="border border-black px-2 py-1 align-top" colSpan={3}>
                  <textarea
                    value={f.observaciones}
                    onChange={(e) => set('observaciones', e.target.value)}
                    readOnly={!editaAprobacion}
                    rows={3}
                    className="w-full bg-transparent outline-none resize-y text-[11px]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

/* ── Flujo de aprobación ────────────────────────────────── */

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Estado del trámite, botones del paso que toca y bitácora. No se imprime: el papel
 * lleva el cuadro de aprobación, no el recorrido.
 */
function PermisoWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as PermisoEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = esTerminal(estado);

  return (
    <div className="no-print mb-6 bg-white border border-[#e6e6f0] rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[#4a4a63]">Estado del trámite:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>
          {estadoLabel(estado)}
        </span>
        {sla && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {textoSla(sla)}
          </span>
        )}
        {PERMISO_ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[#8a8aa3]">sin plazo</span>
        )}
      </div>

      {estado === 'pendiente_jefe' && acciones.length > 0 && (
        <p className="text-xs text-[#4a4a63]">
          Marca las casillas del cuadro de abajo y decide: lo que marques se guarda con tu decisión.
        </p>
      )}

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: PermisoTransicion) => (
            <Button
              key={a.accion}
              onClick={() => onAccion(a.accion, a.requiereMotivo)}
              variant={a.tone === 'danger' ? 'outline' : 'default'}
              className={a.tone === 'danger'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {acciones.length === 0 && !terminal && (
        <p className="text-xs text-[#8a8aa3]">No tienes acciones disponibles en este estado.</p>
      )}
      {terminal && <p className="text-xs font-medium text-green-700">✓ Permiso aprobado.</p>}

      {sol.historial && sol.historial.length > 0 && (
        <div className="pt-3 border-t border-[#e6e6f0]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8a8aa3] uppercase tracking-wide mb-2">
            <History className="w-3.5 h-3.5" /> Historial
          </p>
          <ul className="space-y-1.5">
            {[...sol.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[#4a4a63] flex flex-wrap gap-x-2">
                <span className="text-[#a8a8bd] font-mono">{fmtFechaHora(h.fecha)}</span>
                <span className="font-medium">{estadoLabel(h.estado)}</span>
                {h.userName && <span className="text-[#8a8aa3]">· {h.userName}</span>}
                {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

/** Casilla del formato: etiqueta y cuadrito, como se imprime. */
function Casilla({ label, checked, onToggle, disabled }: {
  label: string; checked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <label className={'inline-flex items-center gap-2 ' + (disabled ? '' : 'cursor-pointer')}>
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="w-3.5 h-3.5 accent-black"
      />
    </label>
  );
}

function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold ' + (last ? '' : 'border-b border-black')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-black ' + (last ? '' : 'border-b border-black')}>{value}</div>
    </>
  );
}
