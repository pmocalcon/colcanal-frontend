import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Eraser, Save, Loader2, Plus, Trash2, History, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  type CajaMenorEstado,
  type CajaMenorTransicion,
  type ItemCajaMenor,
  accionesDisponibles,
  estadoLabel,
  estadoBadgeClass,
  esTerminal,
  esEditable,
  calcularArqueo,
  num,
} from '@/utils/cajaMenorWorkflow';

/**
 * Formato GF-007-F · "Reembolso de caja menor" (G. contable y tributaria).
 *
 * Reproduce la hoja: encabezado con logos, recuadro de arqueo, tabla de facturas y
 * el pie de tres firmas. El recuadro NO es de cuatro casillas sueltas —es un arqueo—,
 * así que «facturas y recibos» y «saldo en efectivo» se calculan y no se digitan.
 *
 * La primera firma lleva el cargo de quien elabora (`elaboradoCargo`): la hoja dice
 * «AUXILIAR ADMINISTRATIVO», pero el formato también lo usan PQRS y la Coordinadora
 * Financiera, y el impreso tiene que decir quién firmó de verdad.
 */

const GESTION = 'contable';
const FORMATO = 'GF-007-F';
const FORMATO_ANTICIPO = 'GF-005-F';
const FORMATO_LEGALIZACION = 'GCT-006-F';

interface FormState {
  proyecto: string;
  fechaReembolso: string;
  responsable: string;
  montoFijo: string;
  anticipos: string;
  items: ItemCajaMenor[];
  /** Estampados por el backend; se muestran en el pie pero no se editan aquí. */
  elaboradoNombre?: string;
  elaboradoCargo?: string;
  firmaDirectorNombre?: string;
  firmaDirectorFecha?: string;
  firmaGerenteNombre?: string;
  firmaGerenteFecha?: string;
  firmaContabilidadNombre?: string;
  firmaContabilidadFecha?: string;
  firmaPagoNombre?: string;
  firmaPagoFecha?: string;
}

const ITEM_VACIO: ItemCajaMenor = {
  fecha: '', factura: '', ccNit: '', beneficiario: '', detalle: '', obra: '', valor: '',
};

/** La hoja impresa trae 14 renglones; se arranca con los mismos para que se vea igual. */
const FILAS_INICIALES = 14;

const EMPTY: FormState = {
  proyecto: '',
  fechaReembolso: '',
  responsable: '',
  montoFijo: '',
  anticipos: '',
  items: Array.from({ length: FILAS_INICIALES }, () => ({ ...ITEM_VACIO })),
};

const hoy = () => new Date().toISOString().slice(0, 10);
const cop = (n: number) => '$ ' + Math.round(n).toLocaleString('es-CO');
const normCode = (v: unknown) => String(v ?? '').trim().replace(/^0+/, '').toLowerCase();

export default function ReembolsoCajaMenorPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<FormState>({ ...EMPTY, fechaReembolso: hoy() });
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState<boolean>(solicitudId !== null);
  const [saving, setSaving] = useState(false);
  const [buscandoAnticipos, setBuscandoAnticipos] = useState(false);

  const estado = (sol?.estado as CajaMenorEstado | undefined) ?? undefined;
  const locked = !esEditable(estado ?? null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const setItem = (i: number, key: keyof ItemCajaMenor, value: string) =>
    setF((prev) => {
      const items = [...prev.items];
      items[i] = { ...items[i], [key]: value };
      return { ...prev, items };
    });

  const agregarFila = () => setF((p) => ({ ...p, items: [...p.items, { ...ITEM_VACIO }] }));
  const quitarFila = (i: number) =>
    setF((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));

  const arqueo = useMemo(
    () => calcularArqueo(f.montoFijo, f.anticipos, f.items),
    [f.montoFijo, f.anticipos, f.items],
  );

  useEffect(() => {
    if (solicitudId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await gestionConocimientoService.get(solicitudId);
        if (!cancelled) { setSol(s); setF(mezclar(s.data)); }
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el formato');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const reload = async () => {
    if (solicitudId === null) return;
    try {
      const s = await gestionConocimientoService.get(solicitudId);
      setSol(s);
      setF(mezclar(s.data));
    } catch { /* noop */ }
  };

  /**
   * Trae los vales que aún están por legalizar: anticipos (GF-005-F) ya pagados cuyo
   * consecutivo no aparece en ninguna legalización (GCT-006-F). Es una propuesta, no
   * una imposición — puede haber vales de papel que nunca se registraron, así que la
   * casilla queda editable.
   */
  const traerAnticipos = async () => {
    setBuscandoAnticipos(true);
    try {
      const all = await gestionConocimientoService.list({ gestion: GESTION });
      const legalizados = new Set(
        all
          .filter((r) => r.formato === FORMATO_LEGALIZACION)
          .map((r) => normCode(r.data?.anticipoConsecutivo))
          .filter(Boolean),
      );
      const pendientes = all.filter(
        (r) =>
          r.formato === FORMATO_ANTICIPO &&
          r.estado === 'pagado' &&
          !legalizados.has(normCode(r.data?.consecutivo)),
      );
      if (pendientes.length === 0) {
        toast.info('No hay anticipos pagados pendientes de legalizar.');
        return;
      }
      const total = pendientes.reduce((s, r) => s + num(r.data?.valor), 0);
      set('anticipos', String(total));
      toast.success(
        `${pendientes.length} anticipo(s) por legalizar · ${cop(total)}. Puedes ajustarlo si hay vales sin registrar.`,
      );
    } catch {
      toast.error('No se pudieron consultar los anticipos');
    } finally {
      setBuscandoAnticipos(false);
    }
  };

  const handleTransition = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    try {
      await gestionConocimientoService.transition(solicitudId!, { accion, motivo });
      toast.success('Acción registrada');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Los renglones en blanco no se guardan: la hoja trae catorce para que se vea
      // como el papel, pero el documento son solo los que tienen algo escrito.
      const data = { ...f, items: f.items.filter((it) => Object.values(it).some((v) => String(v).trim())) };
      if (solicitudId === null) {
        const creada = await gestionConocimientoService.create({ gestion: GESTION, formato: FORMATO, data });
        toast.success('Reembolso guardado');
        navigate(`/dashboard/gestion-conocimiento/contable/caja-menor/${creada.solicitudId}`, { replace: true });
      } else {
        await gestionConocimientoService.update(solicitudId, { data });
        toast.success('Reembolso actualizado');
        await reload();
      }
    } catch {
      toast.error('No se pudo guardar el reembolso');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-100))]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  const numeroReembolso = sol?.numero ? String(sol.numero).padStart(4, '0') : '';

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <style>{`
        @media print {
          @page { size: Letter landscape; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/contable/caja-menor')} title="Volver a Caja menor">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] truncate">
              Reembolso de caja menor {numeroReembolso && `N.º ${numeroReembolso}`}
            </h1>
            <div className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              G. contable · Formato GF-007-F · Versión 2
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            {esEditable(estado ?? null) && (
              <Button variant="outline" onClick={() => setF({ ...EMPTY, fechaReembolso: hoy(), items: Array.from({ length: FILAS_INICIALES }, () => ({ ...ITEM_VACIO })) })} className="gap-2">
                <Eraser className="w-4 h-4" /> Limpiar
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
            {esEditable(estado ?? null) && (
              <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {sol && (
          <CajaMenorWorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={sol.createdBy === user?.userId}
            onAccion={handleTransition}
          />
        )}

        <div className="doc bg-white border border-[#0a2a52] mx-auto text-[13px] text-black shadow-md">

          {/* Encabezado con logos y código */}
          <table className="w-full border-collapse border-b border-[#0a2a52]">
            <tbody>
              <tr>
                <td className="w-[130px] border-r border-[#0a2a52] text-center align-middle p-2">
                  <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-16 object-contain inline-block" />
                </td>
                <td className="border-r border-[#0a2a52] text-center align-middle px-3 py-2">
                  <div className="font-bold text-[16px] leading-tight">REEMBOLSO CAJA MENOR</div>
                </td>
                <td className="w-[120px] border-r border-[#0a2a52] text-center align-middle p-2">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain inline-block" />
                </td>
                <td className="w-[190px] align-middle text-[11px]">
                  <div className="border-b border-[#0a2a52] px-2 py-1 font-semibold">Código: GF-007-F</div>
                  <div className="border-b border-[#0a2a52] px-2 py-1 font-semibold">Fecha: 15/12/2025</div>
                  <div className="px-2 py-1 font-semibold text-center">Versión: 2</div>
                </td>
              </tr>
            </tbody>
          </table>

          <fieldset disabled={locked} className="contents">

          {/* Encabezado del reembolso + recuadro de arqueo */}
          <div className="grid grid-cols-2 border-b border-[#0a2a52]">
            <div className="border-r border-[#0a2a52]">
              <CampoCab label="PROYECTO"><TInput value={f.proyecto} onChange={(v) => set('proyecto', v)} /></CampoCab>
              <CampoCab label="FECHA DE REEMBOLSO"><TInput value={f.fechaReembolso} onChange={(v) => set('fechaReembolso', v)} type="date" /></CampoCab>
              <CampoCab label="RESPONSABLE"><TInput value={f.responsable} onChange={(v) => set('responsable', v)} /></CampoCab>
              <CampoCab label="NÚMERO DE REEMBOLSO" last>
                {/* Lo asigna el sistema al salir de borrador: mientras tanto no existe. */}
                <span className="text-[12px] font-semibold tabular-nums">
                  {numeroReembolso || <span className="italic font-normal text-[hsl(var(--canalco-neutral-400))]">se asigna al enviar</span>}
                </span>
              </CampoCab>
            </div>

            <div>
              <CampoArqueo label="MONTO FIJO DE CAJA MENOR">
                <TInput value={f.montoFijo} onChange={(v) => set('montoFijo', v)} placeholder="0" alignRight />
              </CampoArqueo>
              <CampoArqueo label="FACTURAS Y RECIBOS">
                <span className="block text-right font-semibold tabular-nums">{cop(arqueo.facturas)}</span>
              </CampoArqueo>
              <CampoArqueo label="ANTICIPOS (VALES PROVISIONALES x LEGALIZAR)">
                <div className="flex items-center gap-1">
                  <TInput value={f.anticipos} onChange={(v) => set('anticipos', v)} placeholder="0" alignRight />
                  <button
                    type="button"
                    onClick={traerAnticipos}
                    disabled={buscandoAnticipos || locked}
                    title="Sumar los anticipos pagados que aún no se han legalizado"
                    className="no-print flex-none rounded p-1 text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-neutral-100))] disabled:opacity-40"
                  >
                    {buscandoAnticipos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </CampoArqueo>
              <CampoArqueo label="SALDO EN EFECTIVO" last>
                {/* Puede quedar negativo: significa que se gastó por encima del monto
                    fijo, que pasa. Se muestra tal cual, sin tratarlo como una falla. */}
                <span className="block text-right font-semibold tabular-nums">
                  {cop(arqueo.saldoEfectivo)}
                </span>
              </CampoArqueo>
            </div>
          </div>

          {/* Tabla de facturas y recibos */}
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <Th colSpan={2}>DOCUMENTO</Th>
                <Th rowSpan={2}>C.C / NIT</Th>
                <Th rowSpan={2}>BENEFICIARIO</Th>
                <Th rowSpan={2}>DETALLE</Th>
                <Th rowSpan={2}>OBRA</Th>
                <Th rowSpan={2}>VALOR</Th>
                <th className="no-print w-8 border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-200))]" rowSpan={2} />
              </tr>
              <tr>
                <Th>FECHA</Th>
                <Th># FACTURA</Th>
              </tr>
            </thead>
            <tbody>
              {f.items.map((it, i) => (
                <tr key={i}>
                  <Td><CInput value={it.fecha} onChange={(v) => setItem(i, 'fecha', v)} type="date" /></Td>
                  <Td><CInput value={it.factura} onChange={(v) => setItem(i, 'factura', v)} /></Td>
                  <Td><CInput value={it.ccNit} onChange={(v) => setItem(i, 'ccNit', v)} /></Td>
                  <Td><CInput value={it.beneficiario} onChange={(v) => setItem(i, 'beneficiario', v)} /></Td>
                  <Td><CInput value={it.detalle} onChange={(v) => setItem(i, 'detalle', v)} /></Td>
                  <Td><CInput value={it.obra} onChange={(v) => setItem(i, 'obra', v)} /></Td>
                  <Td right><CInput value={it.valor} onChange={(v) => setItem(i, 'valor', v)} alignRight /></Td>
                  <td className="no-print border border-[#0a2a52] text-center align-middle">
                    {!locked && f.items.length > 1 && (
                      <button type="button" onClick={() => quitarFila(i)} title="Quitar el renglón" className="p-1 text-[hsl(var(--canalco-neutral-400))] hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={6} className="border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-200))] text-center font-bold py-1.5">
                  TOTAL REEMBOLSO
                </td>
                <td className="border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-200))] text-right font-bold px-2 py-1.5 tabular-nums">
                  {cop(arqueo.facturas)}
                </td>
                <td className="no-print border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-200))]" />
              </tr>
            </tbody>
          </table>

          {!locked && (
            <div className="no-print px-3 py-2 border-b border-[#0a2a52]">
              <Button variant="outline" size="sm" onClick={agregarFila} className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" /> Agregar renglón
              </Button>
            </div>
          )}

          </fieldset>

          {/* Pie de firmas. La primera lleva el cargo real de quien elaboró. */}
          <table className="w-full border-collapse text-center">
            <tbody>
              <tr>
                <FirmaTd
                  cargo={(f.elaboradoCargo || 'AUXILIAR ADMINISTRATIVO').toUpperCase()}
                  nombre={f.elaboradoNombre}
                />
                <FirmaTd cargo="DIRECTOR DE PROYECTO" nombre={f.firmaDirectorNombre} fecha={f.firmaDirectorFecha} />
                <FirmaTd cargo="GERENTE DE PROYECTO" nombre={f.firmaGerenteNombre} fecha={f.firmaGerenteFecha} last />
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

/**
 * Une lo guardado con el formulario vacío. `items` va aparte: si el documento no
 * trae ninguno hay que reponer los renglones en blanco, porque un `[]` dejaría la
 * tabla sin una sola fila donde escribir.
 */
function mezclar(data: Record<string, any> | null): FormState {
  const guardado = (data ?? {}) as Partial<FormState>;
  const items = Array.isArray(guardado.items) && guardado.items.length > 0
    ? guardado.items
    : Array.from({ length: FILAS_INICIALES }, () => ({ ...ITEM_VACIO }));
  return { ...EMPTY, ...guardado, items };
}

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function CajaMenorWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as CajaMenorEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const terminal = esTerminal(estado);

  return (
    <div className="no-print mb-6 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado del flujo:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>{estadoLabel(estado)}</span>
      </div>

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: CajaMenorTransicion) => (
            <Button
              key={a.accion}
              onClick={() => onAccion(a.accion, a.requiereMotivo)}
              variant={a.tone === 'danger' ? 'outline' : 'default'}
              className={a.tone === 'danger'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {acciones.length === 0 && !terminal && (
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">No tienes acciones disponibles en este estado.</p>
      )}
      {terminal && <p className="text-xs font-medium text-green-700">✓ Caja repuesta. Flujo finalizado.</p>}

      {sol.historial && sol.historial.length > 0 && (
        <div className="pt-3 border-t border-[hsl(var(--canalco-neutral-200))]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mb-2">
            <History className="w-3.5 h-3.5" /> Historial
          </p>
          <ul className="space-y-1.5">
            {[...sol.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[hsl(var(--canalco-neutral-700))] flex flex-wrap gap-x-2">
                <span className="text-[hsl(var(--canalco-neutral-400))] font-mono">{fmtFechaHora(h.fecha)}</span>
                <span className="font-medium">{estadoLabel(h.estado)}</span>
                {h.userName && <span className="text-[hsl(var(--canalco-neutral-500))]">· {h.userName}</span>}
                {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes de maquetación ─────────────────────── */

function CampoCab({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[190px_1fr] ' + (last ? '' : 'border-b border-[#0a2a52]')}>
      <div className="px-3 py-1.5 font-semibold text-[11px] flex items-center">{label}:</div>
      <div className="px-2 py-1 flex items-center">{children}</div>
    </div>
  );
}

function CampoArqueo({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[1fr_150px] ' + (last ? '' : 'border-b border-[#0a2a52]')}>
      <div className="px-3 py-1.5 font-semibold text-[11px] flex items-center">{label}</div>
      <div className="border-l border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))] px-2 py-1 flex items-center">{children}</div>
    </div>
  );
}

function Th({ children, colSpan, rowSpan }: { children?: React.ReactNode; colSpan?: number; rowSpan?: number }) {
  return (
    <th colSpan={colSpan} rowSpan={rowSpan} className="border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-200))] font-bold px-1.5 py-1">
      {children}
    </th>
  );
}

function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={'border border-[#0a2a52] px-1 py-0.5 ' + (right ? 'text-right' : '')}>{children}</td>;
}

function FirmaTd({ cargo, nombre, fecha, last }: { cargo: string; nombre?: string; fecha?: string; last?: boolean }) {
  return (
    <td className={'align-bottom px-3 pt-10 pb-2 border-t border-[#0a2a52] ' + (last ? '' : 'border-r border-[#0a2a52]')}>
      {/* El nombre lo estampa el sistema cuando la persona firma; antes queda la línea. */}
      <div className="border-b border-black h-5 text-[11px] flex items-end justify-center pb-0.5">{nombre ?? ''}</div>
      <div className="font-semibold text-[11px] mt-1">{cargo}</div>
      <div className="text-[10px] text-[hsl(var(--canalco-neutral-500))]">{fecha ? fecha : '(NOMBRE)'}</div>
    </td>
  );
}

function TInput({ value, onChange, placeholder, type, alignRight }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; alignRight?: boolean;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5 placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic '
        + (alignRight ? 'text-right tabular-nums' : '')}
    />
  );
}

function CInput({ value, onChange, type, alignRight }: {
  value: string; onChange: (v: string) => void; type?: string; alignRight?: boolean;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={'w-full bg-transparent outline-none text-[11px] py-0.5 ' + (alignRight ? 'text-right tabular-nums' : '')}
    />
  );
}
