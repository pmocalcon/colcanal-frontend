import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Eraser, Save, Loader2, History, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  type CuentasEstado,
  accionesDisponibles,
  estadoLabel,
  estadoBadgeClass,
  esTerminal,
  esEditable,
  type CuentasTransicion,
} from '@/utils/cuentasCompaniasWorkflow';

/**
 * Formato GF-004-F5 · "Autorización de pago mediante cuentas entre compañías"
 * (G. contable y tributaria).
 *
 * De uso EXCEPCIONAL (numeral 4.11 del procedimiento GF-004-P): solo cuando la
 * compañía que paga el reembolso de caja menor es distinta de la que registró
 * contablemente el gasto.
 *
 * La sección 2 (autorización de las dos Gerencias Generales) se firma en papel: aquí
 * se escriben los nombres y fechas para que salgan impresos. La sección 3 la diligencia
 * Contabilidad al conciliar, y con eso se cierra el formato.
 */

const GESTION = 'contable';
const FORMATO = 'GF-004-F5';
const ROL_CONTABILIDAD = 'Contabilidad';

interface FormState {
  companiaGasto: string; nitGasto: string;
  companiaPaga: string; nitPaga: string;
  valorOperacion: string; fecha: string;
  justificacion: string;
  firmaGerenciaGasto: string; fechaGerenciaGasto: string;
  firmaGerenciaPaga: string; fechaGerenciaPaga: string;
  mesConciliacion: string; saldoCuenta: string;
  conciliadoPor: string; fechaConciliacion: string;
}

const EMPTY: FormState = {
  companiaGasto: '', nitGasto: '',
  companiaPaga: '', nitPaga: '',
  valorOperacion: '', fecha: '',
  justificacion: '',
  firmaGerenciaGasto: '', fechaGerenciaGasto: '',
  firmaGerenciaPaga: '', fechaGerenciaPaga: '',
  mesConciliacion: '', saldoCuenta: '',
  conciliadoPor: '', fechaConciliacion: '',
};

const hoy = () => new Date().toISOString().slice(0, 10);

export default function CuentasCompaniasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<FormState>({ ...EMPTY, fecha: hoy() });
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState<boolean>(solicitudId !== null);
  const [saving, setSaving] = useState(false);

  const estado = (sol?.estado as CuentasEstado | undefined) ?? undefined;
  const locked = !esEditable(estado ?? null); // secciones 1 y 2 solo en borrador
  const esContabilidad = (user?.nombreRol ?? '').trim() === ROL_CONTABILIDAD;
  // La sección 3 la diligencia Contabilidad mientras el formato espera conciliación.
  const lockedConciliacion = !(
    esEditable(estado ?? null) || (estado === 'pendiente_conciliacion' && esContabilidad)
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (solicitudId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await gestionConocimientoService.get(solicitudId);
        if (!cancelled) { setSol(s); setF({ ...EMPTY, ...(s.data as Partial<FormState> | null) }); }
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
      setF({ ...EMPTY, ...(s.data as Partial<FormState> | null) });
    } catch { /* noop */ }
  };

  const handleTransition = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    // Al conciliar viaja la sección 3: para entonces el formato ya no está en
    // borrador, así que no puede guardarse por la ruta normal de edición.
    let data: Record<string, any> | undefined;
    if (accion === 'conciliar') {
      if (!f.mesConciliacion.trim()) { toast.error('Indica el mes de conciliación'); return; }
      data = {
        mesConciliacion: f.mesConciliacion,
        saldoCuenta: f.saldoCuenta,
        fechaConciliacion: f.fechaConciliacion,
      };
    }
    try {
      await gestionConocimientoService.transition(solicitudId!, { accion, motivo, data });
      toast.success('Acción registrada');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (solicitudId === null) {
        const creada = await gestionConocimientoService.create({ gestion: GESTION, formato: FORMATO, data: f });
        toast.success('Formato guardado');
        navigate(`/dashboard/gestion-conocimiento/contable/cuentas-companias/${creada.solicitudId}`, { replace: true });
      } else {
        await gestionConocimientoService.update(solicitudId, { data: f });
        toast.success('Formato actualizado');
        await reload();
      }
    } catch {
      toast.error('No se pudo guardar el formato');
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

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/contable/cuentas-companias')} title="Volver a Cuentas entre compañías">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] truncate">Cuentas entre compañías</h1>
            <div className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              G. contable · Formato GF-004-F5 · uso excepcional
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            {esEditable(estado ?? null) && (
              <Button variant="outline" onClick={() => setF({ ...EMPTY, fecha: hoy() })} className="gap-2">
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        {sol && (
          <CuentasWorkflowPanel
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
                  <div className="font-bold text-[16px] leading-tight">AUTORIZACIÓN DE PAGO MEDIANTE CUENTAS<br />ENTRE COMPAÑÍAS</div>
                  <div className="text-[11px] italic mt-1">Código: GF-004-F5 &nbsp;|&nbsp; Versión: 1</div>
                </td>
                <td className="w-[160px] text-center align-middle p-2">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain inline-block" />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Secciones 1 y 2: se diligencian mientras el formato está en borrador. */}
          <fieldset disabled={locked} className="contents">

          {/* 1. Compañías involucradas */}
          <Sec n="1" title="COMPAÑÍAS INVOLUCRADAS" />
          <div className="grid grid-cols-[1fr_1fr_120px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Compañía que registró el gasto</LabelCell>
            <ValueCell><TInput value={f.companiaGasto} onChange={(v) => set('companiaGasto', v)} /></ValueCell>
            <LabelCell>NIT</LabelCell>
            <ValueCell last><TInput value={f.nitGasto} onChange={(v) => set('nitGasto', v)} /></ValueCell>
          </div>
          <div className="grid grid-cols-[1fr_1fr_120px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Compañía que efectúa el pago</LabelCell>
            <ValueCell><TInput value={f.companiaPaga} onChange={(v) => set('companiaPaga', v)} /></ValueCell>
            <LabelCell>NIT</LabelCell>
            <ValueCell last><TInput value={f.nitPaga} onChange={(v) => set('nitPaga', v)} /></ValueCell>
          </div>
          <div className="grid grid-cols-[1fr_1fr_120px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Valor de la operación (COP)</LabelCell>
            <ValueCell><TInput value={f.valorOperacion} onChange={(v) => set('valorOperacion', v)} /></ValueCell>
            <LabelCell>Fecha</LabelCell>
            <ValueCell last><TInput value={f.fecha} onChange={(v) => set('fecha', v)} type="date" /></ValueCell>
          </div>
          <div className="border-b border-[#0a2a52]">
            <div className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[#0a2a52] px-3 py-1.5 font-semibold text-[12px]">
              Justificación operativa de la operación entre compañías
            </div>
            <div className="px-3 py-2">
              <textarea
                value={f.justificacion}
                onChange={(e) => set('justificacion', e.target.value)}
                rows={4}
                className="w-full bg-transparent outline-none resize-y text-[12px] min-h-[5rem]"
              />
            </div>
          </div>

          {/* 2. Autorización previa (se firma en papel) */}
          <Sec n="2" title="AUTORIZACIÓN PREVIA — GERENCIA GENERAL DE AMBAS COMPAÑÍAS" />
          <table className="w-full border-collapse border-b border-[#0a2a52]">
            <thead>
              <tr>
                <SignTh>Gerencia General — Compañía que registra el gasto</SignTh>
                <SignTh>Gerencia General — Compañía que paga</SignTh>
              </tr>
            </thead>
            <tbody>
              <tr>
                <SignTd>
                  <FirmaFecha
                    nombre={f.firmaGerenciaGasto} onNombre={(v) => set('firmaGerenciaGasto', v)}
                    fecha={f.fechaGerenciaGasto} onFecha={(v) => set('fechaGerenciaGasto', v)}
                  />
                </SignTd>
                <SignTd>
                  <FirmaFecha
                    nombre={f.firmaGerenciaPaga} onNombre={(v) => set('firmaGerenciaPaga', v)}
                    fecha={f.fechaGerenciaPaga} onFecha={(v) => set('fechaGerenciaPaga', v)}
                  />
                </SignTd>
              </tr>
            </tbody>
          </table>

          </fieldset>

          {/* 3. Conciliación mensual — la diligencia Contabilidad */}
          <fieldset disabled={lockedConciliacion} className="contents">
            <Sec n="3" title="CONCILIACIÓN MENSUAL (control posterior)" />
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-[#0a2a52]">
              <LabelCell>Mes de conciliación</LabelCell>
              <ValueCell><TInput value={f.mesConciliacion} onChange={(v) => set('mesConciliacion', v)} type="month" /></ValueCell>
              <LabelCell>Saldo cuenta entre compañías</LabelCell>
              <ValueCell last><TInput value={f.saldoCuenta} onChange={(v) => set('saldoCuenta', v)} /></ValueCell>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-[#0a2a52]">
              <LabelCell>Conciliado por</LabelCell>
              <ValueCell>
                <span className="text-[12px]">
                  {f.conciliadoPor || <span className="italic text-[hsl(var(--canalco-neutral-400))]">lo firma el sistema al conciliar</span>}
                </span>
              </ValueCell>
              <LabelCell>Fecha de conciliación</LabelCell>
              <ValueCell last><TInput value={f.fechaConciliacion} onChange={(v) => set('fechaConciliacion', v)} type="date" /></ValueCell>
            </div>
          </fieldset>

          <p className="px-3 py-2 text-[11px] italic text-center">
            Recordatorio: esta operación debe conciliarse mensualmente entre las compañías para evitar
            duplicidad, inconsistencias o pagos improcedentes (numeral 4.11 del procedimiento).
          </p>
        </div>
      </main>
    </div>
  );
}

/* ── Panel de flujo ─────────────────────────────────────── */

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function CuentasWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as CuentasEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const terminal = esTerminal(estado);

  return (
    <div className="no-print mb-6 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado del flujo:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>{estadoLabel(estado)}</span>
      </div>

      {estado === 'borrador' && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" />
          Imprime el formato y recoge la firma de las dos Gerencias Generales antes de enviarlo a Contabilidad.
        </p>
      )}

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: CuentasTransicion) => (
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
      {terminal && <p className="text-xs font-medium text-green-700">✓ Operación conciliada. Flujo finalizado.</p>}

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

function Sec({ n, title }: { n: string; title: string }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-200))] text-black font-bold text-[12px] px-3 py-1.5 border-b border-[#0a2a52]">
      {n}. {title}
    </div>
  );
}

function LabelCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-3 py-2 font-semibold text-[12px] flex items-center text-black">
      {children}
    </div>
  );
}

function ValueCell({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'px-2 py-1.5 flex items-center ' + (last ? '' : 'border-r border-[#0a2a52]')}>
      {children}
    </div>
  );
}

function SignTh({ children }: { children: React.ReactNode }) {
  return <th className="w-1/2 bg-[hsl(var(--canalco-neutral-200))] text-black font-bold text-[11px] py-1.5 px-2 border border-[#0a2a52]">{children}</th>;
}

function SignTd({ children }: { children: React.ReactNode }) {
  return <td className="border border-[#0a2a52] align-top px-3 pt-6 pb-2">{children}</td>;
}

function FirmaFecha({ nombre, onNombre, fecha, onFecha }: {
  nombre: string; onNombre: (v: string) => void; fecha: string; onFecha: (v: string) => void;
}) {
  return (
    <div className="text-left">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[11px] font-semibold">Firma:</span>
        <input value={nombre} onChange={(e) => onNombre(e.target.value)} className="flex-1 bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] text-[12px]" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold">Fecha:</span>
        <input value={fecha} onChange={(e) => onFecha(e.target.value)} type="date" className="flex-1 bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] text-[12px]" />
      </div>
    </div>
  );
}

function TInput({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5 placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic"
    />
  );
}
