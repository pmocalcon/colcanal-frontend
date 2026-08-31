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
import { buscarFicha, llenarVacios, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Solicitud de Permiso · formato GTH-010-F v2 (G. de talento humano).
 *
 * Reproduce el papel oficial en sus cuatro secciones: información del colaborador,
 * información del permiso (desde/hasta con hora, remuneración, soporte), aprobación
 * interna y las dos firmas (jefe inmediato y Dir. Administrativa y Financiera). Lo aprueba
 * el **jefe de área** del solicitante, que sale de la tabla de autorizaciones y no de un
 * rol fijo.
 *
 * El formato tiene dos dueños y el permiso de edición va por zonas:
 *  - Las secciones 1 y 2 las llena el solicitante, solo mientras es borrador.
 *  - «Observaciones» de la aprobación interna la llena el jefe, solo mientras está en su
 *    bandeja, y se guarda junto con su decisión. El solicitante no la toca.
 *
 * Compatibilidad: los permisos creados con el formato anterior guardaban `fechaPermiso`,
 * `motivo` y `horario`; al abrirlos se migran a `desde`, `descripcionMotivo` y `horaDesde`
 * para no perder lo diligenciado. El backend también lee ambos juegos de claves.
 *
 * @see permisoWorkflow — la máquina de estados, espejo de la del backend.
 *
 * Ruta: `.../talento-humano/permiso/:id`.
 */

/** Mensaje de error del backend, o el respaldo si no lo trae. */
const errMsg = (e: unknown, fallback: string): string =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** Sí y No son excluyentes; vacío = sin marcar. */
type Excl = 'si' | 'no' | '';
/** Remunerado y No remunerado son excluyentes; vacío = sin marcar. */
type Remun = 'remunerado' | 'no-remunerado' | '';

interface PermisoState {
  // ── 1. Información del colaborador ──
  fechaSolicitud: string;
  proyecto: string;
  nombre: string;
  /**
   * Solo el número de documento. En el papel la casilla dice «Tipo y número», pero se
   * guarda el número limpio: con él se trae la ficha de personal y, al aprobar, nace el
   * ausentismo en `th_ausentismos`, que cruza por identificación.
   */
  identificacion: string;
  cargo: string;
  jefeInmediato: string;

  // ── 2. Información del permiso ──
  desde: string;
  horaDesde: string;
  hasta: string;
  horaHasta: string;
  remuneracion: Remun;
  descripcionMotivo: string;
  anexaSoporte: Excl;
  tipoSoporte: string;

  // ── 3. Aprobación interna ──
  /** La pone el sistema al aprobar. */
  fechaAprobacion: string;
  observaciones: string;
  /** Nombre de quien aprobó; lo escribe el backend. */
  aprobadoPor: string;
}

const EMPTY: PermisoState = {
  fechaSolicitud: '', proyecto: '', nombre: '', identificacion: '', cargo: '', jefeInmediato: '',
  desde: '', horaDesde: '', hasta: '', horaHasta: '', remuneracion: '', descripcionMotivo: '',
  anexaSoporte: '', tipoSoporte: '',
  fechaAprobacion: '', observaciones: '', aprobadoPor: '',
};

/**
 * Lleva un permiso guardado al modelo v2, migrando las claves del formato anterior para
 * no perder lo que ya se había diligenciado.
 */
const migrar = (saved: Record<string, unknown>): PermisoState => {
  const s = saved as Partial<PermisoState> & Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ...EMPTY,
    ...(s as Partial<PermisoState>),
    desde: str(s.desde) || str(s.fechaPermiso),
    descripcionMotivo: str(s.descripcionMotivo) || str(s.motivo),
    horaDesde: str(s.horaDesde) || str(s.horario),
  };
};

/** Filas simples etiqueta/valor de la sección 1. */
type CampoColaborador = 'fechaSolicitud' | 'proyecto' | 'nombre' | 'identificacion' | 'cargo' | 'jefeInmediato';

const FILAS_COLABORADOR: { key: CampoColaborador; label: string }[] = [
  { key: 'fechaSolicitud', label: 'FECHA DE SOLICITUD:' },
  { key: 'proyecto', label: 'PROYECTO:' },
  { key: 'nombre', label: 'NOMBRE:' },
  // Al salir de esta casilla se traen nombre, cargo y proyecto de la ficha de personal.
  { key: 'identificacion', label: 'TIPO Y NÚMERO DE DOCUMENTO:' },
  { key: 'cargo', label: 'CARGO:' },
  { key: 'jefeInmediato', label: 'JEFE INMEDIATO:' },
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

  /**
   * Con la cédula llegan el nombre, el cargo y el proyecto de la ficha de personal.
   *
   * Al salir de la casilla, no en cada tecla: mientras se escribe, cada dígito sería una
   * cédula distinta y una consulta más. Solo llena lo que está en blanco, para no pisarle
   * a nadie lo que acaba de escribir. La casilla se normaliza a solo dígitos: el ausentismo
   * y la ficha cruzan por el número, no por «CC 123».
   */
  const prellenar = async () => {
    if (!editaSolicitud) return;
    const cedula = f.identificacion.replace(/\D/g, '');
    if (cedula !== f.identificacion) set('identificacion', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => llenarVacios(p, {
      nombre: nombreDeFicha(ficha),
      cargo: ficha.cargo ?? '',
      proyecto: ficha.empresaProyecto ?? '',
    }));
  };

  const set = <K extends keyof PermisoState>(k: K, v: PermisoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /** Marcar la misma opción otra vez la deja sin marcar. */
  const toggleRemun = (v: Exclude<Remun, ''>) =>
    set('remuneracion', f.remuneracion === v ? '' : v);
  const toggleSoporte = (v: Exclude<Excl, ''>) =>
    set('anexaSoporte', f.anexaSoporte === v ? '' : v);

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        setSol(row);
        setF(migrar((row.data ?? {}) as Record<string, unknown>));
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
      setF(migrar((row.data ?? {}) as Record<string, unknown>));
    } catch { /* si falla la recarga, la pantalla se queda con lo que ya tenía */ }
  };

  /**
   * El cuadro de aprobación interna viaja con la decisión, no con «Guardar»: es del jefe,
   * y solo puede escribirlo en el mismo acto en que aprueba o niega. Las casillas de firma
   * del papel las marca el backend según el rol de quien decide.
   */
  const handleTransicion = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    const data = editaAprobacion ? { observaciones: f.observaciones } : undefined;
    try {
      await gestionConocimientoService.transition(docId!, { accion, motivo, data });
      toast.success('Acción registrada');
      await recargar();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo ejecutar la acción'));
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
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
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

  const inputCls = 'w-full bg-transparent outline-none text-[11px]';

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
            <p className="text-xs text-[#4a4a63]">Formato GTH-010-F · Solicitud N.º {docId}</p>
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
              <Meta label="CÓDIGO:" value="GTH-010-F" />
              <Meta label="FECHA:" value="31/08/2026" />
              <Meta label="VERSIÓN:" value="2" last />
            </div>
          </div>

          {/* 1. Información del colaborador */}
          <Seccion titulo="1. INFORMACIÓN DEL COLABORADOR" />
          <table className="w-full border-collapse">
            <tbody>
              {FILAS_COLABORADOR.map(({ key, label }) => (
                <tr key={key}>
                  <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">
                    {label}
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <input
                      value={f[key]}
                      onChange={(e) => set(key, e.target.value)}
                      onBlur={key === 'identificacion' ? () => void prellenar() : undefined}
                      onKeyDown={(e) => {
                        if (key === 'identificacion' && e.key === 'Enter') {
                          e.preventDefault();
                          void prellenar();
                        }
                      }}
                      readOnly={!editaSolicitud}
                      className={inputCls}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 2. Información del permiso */}
          <Seccion titulo="2. INFORMACIÓN DEL PERMISO" />
          <table className="w-full border-collapse">
            <tbody>
              {/* Desde / Hasta, cada uno con su hora. */}
              {([
                ['DESDE:', 'desde', 'horaDesde'],
                ['HASTA:', 'hasta', 'horaHasta'],
              ] as const).map(([label, fechaKey, horaKey]) => (
                <tr key={fechaKey}>
                  <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] w-[24%]">{label}</td>
                  <td className="border border-black px-2 py-1 w-[38%]">
                    <input
                      type="date"
                      value={f[fechaKey]}
                      onChange={(e) => set(fechaKey, e.target.value)}
                      readOnly={!editaSolicitud}
                      className={inputCls}
                    />
                  </td>
                  <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] w-[14%]">HORA:</td>
                  <td className="border border-black px-2 py-1">
                    <input
                      type="time"
                      value={f[horaKey]}
                      onChange={(e) => set(horaKey, e.target.value)}
                      readOnly={!editaSolicitud}
                      className={inputCls}
                    />
                  </td>
                </tr>
              ))}

              {/* Remunerado / No remunerado, excluyentes. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">PERMISO REMUNERADO</td>
                <td className="border border-black px-2 py-1">
                  <Cajita checked={f.remuneracion === 'remunerado'} onToggle={() => toggleRemun('remunerado')} disabled={!editaSolicitud} />
                </td>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">PERMISO NO REMUNERADO</td>
                <td className="border border-black px-2 py-1">
                  <Cajita checked={f.remuneracion === 'no-remunerado'} onToggle={() => toggleRemun('no-remunerado')} disabled={!editaSolicitud} />
                </td>
              </tr>

              {/* Descripción del motivo. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  DESCRIPCIÓN DEL MOTIVO DEL PERMISO
                </td>
                <td className="border border-black px-2 py-1 align-top" colSpan={3}>
                  <textarea
                    value={f.descripcionMotivo}
                    onChange={(e) => set('descripcionMotivo', e.target.value)}
                    readOnly={!editaSolicitud}
                    rows={2}
                    className="w-full bg-transparent outline-none resize-y text-[11px]"
                  />
                </td>
              </tr>

              {/* Anexa soporte + tipo. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">ANEXA SOPORTE</td>
                <td className="border border-black px-2 py-1">
                  <div className="flex items-center gap-4">
                    <Cajita label="SI" checked={f.anexaSoporte === 'si'} onToggle={() => toggleSoporte('si')} disabled={!editaSolicitud} />
                    <Cajita label="NO" checked={f.anexaSoporte === 'no'} onToggle={() => toggleSoporte('no')} disabled={!editaSolicitud} />
                  </div>
                </td>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">TIPO DE SOPORTE</td>
                <td className="border border-black px-2 py-1">
                  <input
                    value={f.tipoSoporte}
                    onChange={(e) => set('tipoSoporte', e.target.value)}
                    readOnly={!editaSolicitud}
                    className={inputCls}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 3. Aprobación interna del permiso */}
          <Seccion titulo="3. APROBACIÓN INTERNA DEL PERMISO" />
          {!editaAprobacion && (
            <p className="no-print px-2 py-1 text-[10px] italic text-[#8a8aa3] border-b border-black">
              «Observaciones» las diligencia el jefe de área cuando la solicitud está en su bandeja.
            </p>
          )}
          <table className="w-full border-collapse">
            <tbody>
              {/* La firma no se teclea: se firma a mano sobre el impreso. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">
                  FIRMA DEL TRABAJADOR
                </td>
                <td className="border border-black px-2 py-6"></td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">
                  FECHA DE APROBACIÓN
                </td>
                {/* La pone el sistema al aprobar. */}
                <td className="border border-black px-2 py-1">{f.fechaAprobacion}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  OBSERVACIONES
                </td>
                <td className="border border-black px-2 py-1 align-top">
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

          {/* 4. Firmas */}
          <div className="px-2 py-2 border-t border-black">
            <p className="font-bold mb-8">4. FIRMAS</p>
            <div className="grid grid-cols-2 gap-8">
              <Firma titulo="Aprobado por:" nombre={f.aprobadoPor} cargo="Jefe inmediato" />
              <Firma titulo="Revisado por:" nombre="" cargo="Dir. Administrativa y Financiera" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Flujo de aprobación ────────────────────────────────── */

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Estado del trámite, botones del paso que toca y bitácora. No se imprime: el papel lleva
 * las firmas, no el recorrido.
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
          Decide sobre la solicitud: lo que escribas en «Observaciones» se guarda con tu decisión.
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

/** Barra de título de sección, a todo el ancho del formato. */
function Seccion({ titulo }: { titulo: string }) {
  return (
    <p className="px-2 py-1.5 font-bold border-t border-b border-black bg-[hsl(var(--canalco-neutral-100))]">
      {titulo}
    </p>
  );
}

/** Cuadrito del formato, con etiqueta opcional a la izquierda. */
function Cajita({ label, checked, onToggle, disabled }: {
  label?: string; checked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <label className={'inline-flex items-center gap-2 ' + (disabled ? '' : 'cursor-pointer')}>
      {label && <span className="font-semibold">{label}</span>}
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

/** Un bloque de firma de la sección 4: línea para firmar, nombre y cargo debajo. */
function Firma({ titulo, nombre, cargo }: { titulo: string; nombre: string; cargo: string }) {
  return (
    <div className="text-[11px]">
      <p className="mb-10">{titulo}</p>
      <div className="border-t border-black pt-1">
        <p><span className="font-semibold">Nombre:</span> {nombre}</p>
        <p>{cargo}</p>
      </div>
    </div>
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
