import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Eraser, Save, Loader2, Receipt, History, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  type AnticipoEstado,
  accionesDisponibles,
  calcularSla,
  estadoLabel,
  estadoBadgeClass,
  ANTICIPO_ESTADOS,
  esTerminal,
  esEditable,
  type AnticipoTransicion,
} from '@/utils/anticipoWorkflow';

/**
 * Formato GF-005-F · "Solicitud de anticipo" (G. contable y tributaria).
 * Se diligencia, se guarda (una fila en gc_solicitudes, cuerpo en `data`) y se imprime.
 * Al crearse, el backend le asigna un consecutivo único (0001, 0002…) que es el código
 * con el que luego se enlaza su Legalización (GCT-006-F).
 */

const GESTION = 'contable';
const FORMATO = 'GF-005-F';

interface FormState {
  consecutivo: string;
  fechaSolicitud: string; proyectoCodigo: string;
  solicitante: string; cargoSolicitante: string;
  tipoBeneficiario: string; terceroCreado: string; ccNit: string;
  benefNombre: string; banco: string; numeroCuenta: string;
  concepto: string; naturaleza: string;
  valor: string; fechaPago: string; formaPago: string;
  anexoRut: string; anexoCertBancaria: string; anexoRequisicion: string;
  firmaSolicitante: string; fechaFirmaSolicitante: string;
  firmaJefe: string; fechaFirmaJefe: string;
  firmaGerenteProy: string; fechaFirmaGerenteProy: string;
  firmaGerenciaGral: string; fechaFirmaGerenciaGral: string;
  // Entrega y pago (Tesorería · Aurora): registra cuándo quedó pagado el anticipo.
  entregaRecibidoPor: string; pagoRealizado: string; fechaPagoRealizado: string;
}

const EMPTY: FormState = {
  consecutivo: '',
  fechaSolicitud: '', proyectoCodigo: '',
  solicitante: '', cargoSolicitante: '',
  tipoBeneficiario: '', terceroCreado: '', ccNit: '',
  benefNombre: '', banco: '', numeroCuenta: '',
  concepto: '', naturaleza: '',
  valor: '', fechaPago: '', formaPago: '',
  anexoRut: '', anexoCertBancaria: '', anexoRequisicion: '',
  firmaSolicitante: '', fechaFirmaSolicitante: '',
  firmaJefe: '', fechaFirmaJefe: '',
  firmaGerenteProy: '', fechaFirmaGerenteProy: '',
  firmaGerenciaGral: '', fechaFirmaGerenciaGral: '',
  entregaRecibidoPor: '', pagoRealizado: '', fechaPagoRealizado: '',
};

const hoy = () => new Date().toISOString().slice(0, 10);

export default function SolicitudAnticipoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<FormState>({ ...EMPTY, fechaSolicitud: hoy() });
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState<boolean>(solicitudId !== null);
  const [saving, setSaving] = useState(false);

  const estado = (sol?.estado as AnticipoEstado | undefined) ?? undefined;
  const locked = !esEditable(estado ?? null); // el formato solo se edita en borrador
  const esTesoreria = (user?.nombreRol ?? '').trim() === 'Coordinador Financiero';
  // Tesorería puede diligenciar la sección de pago cuando el anticipo está en pendiente_pago.
  const lockedPago = !(esEditable(estado ?? null) || (estado === 'pendiente_pago' && esTesoreria));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // Prefill del solicitante y su firma con el usuario en sesión (solo al crear).
  // La firma del Solicitante se llena sola (quien crea la solicitud es quien la firma).
  useEffect(() => {
    if (solicitudId !== null) return;
    setF((prev) => ({
      ...prev,
      solicitante: prev.solicitante || user?.nombre || '',
      cargoSolicitante: prev.cargoSolicitante || user?.cargo || '',
      firmaSolicitante: prev.firmaSolicitante || user?.nombre || '',
      fechaFirmaSolicitante: prev.fechaFirmaSolicitante || hoy(),
    }));
  }, [user, solicitudId]);

  useEffect(() => {
    if (solicitudId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await gestionConocimientoService.get(solicitudId);
        if (!cancelled) { setSol(s); setF({ ...EMPTY, ...(s.data as Partial<FormState> | null) }); }
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el anticipo');
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
    // Al registrar el pago se envían los datos de la sección de Tesorería.
    let data: Record<string, any> | undefined;
    if (accion === 'registrar_pago') {
      if (!f.fechaPagoRealizado) { toast.error('Indica la fecha de pago'); return; }
      data = { entregaRecibidoPor: f.entregaRecibidoPor, fechaPagoRealizado: f.fechaPagoRealizado };
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
        toast.success(`Anticipo guardado · N.º ${creada.data?.consecutivo ?? ''}`);
        navigate(`/dashboard/gestion-conocimiento/contable/anticipo/${creada.solicitudId}`, { replace: true });
      } else {
        await gestionConocimientoService.update(solicitudId, { data: f });
        toast.success('Anticipo actualizado');
        await reload();
      }
    } catch {
      toast.error('No se pudo guardar el anticipo');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/contable/anticipos')} title="Volver a Anticipos">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] truncate">Solicitud de anticipo</h1>
            <div className="text-xs text-[hsl(var(--canalco-neutral-600))] flex items-center gap-2 flex-wrap">
              <span>G. contable · Formato GF-005-F</span>
              {f.consecutivo
                ? <span className="inline-block text-[11px] font-semibold rounded px-2 py-0.5 bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">N.º {f.consecutivo}</span>
                : <span className="inline-block text-[11px] font-medium rounded px-2 py-0.5 bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))]">N.º se asigna al guardar</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <Button variant="outline" onClick={() => setF({ ...EMPTY, fechaSolicitud: hoy(), consecutivo: f.consecutivo })} className="gap-2">
              <Eraser className="w-4 h-4" /> Limpiar
            </Button>
            {solicitudId !== null && f.consecutivo && (
              <Button variant="outline" onClick={() => navigate(`/dashboard/gestion-conocimiento/contable/legalizacion/nueva?anticipo=${encodeURIComponent(f.consecutivo)}`)} className="gap-2" title="Crear la legalización de este anticipo">
                <Receipt className="w-4 h-4" /> Legalizar
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
          <AnticipoWorkflowPanel
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
                  <div className="font-bold text-[16px] leading-tight">FORMATO DE SOLICITUD DE ANTICIPO</div>
                  <div className="text-[11px] tracking-wide text-[hsl(var(--canalco-neutral-600))]">ÁREA ADMINISTRATIVA Y FINANCIERA</div>
                </td>
                <td className="w-[160px] align-top p-0">
                  <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                    <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr] text-[11px]">
                    <CodeCell label="Código" value="GF-005-F" />
                    <CodeCell label="Versión" value="1" last />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Secciones 1–6: se diligencian mientras el anticipo está en borrador. */}
          <fieldset disabled={locked} className="contents">

          {/* 1. Datos generales */}
          <Sec n="1" title="DATOS GENERALES DE LA SOLICITUD" />
          <div className="grid grid-cols-3 border-b border-[#0a2a52]">
            <Cell label="Fecha de solicitud"><TInput value={f.fechaSolicitud} onChange={(v) => set('fechaSolicitud', v)} type="date" /></Cell>
            <Cell label="N.º solicitud">
              <span className="text-[12px] font-semibold font-mono">{f.consecutivo || <span className="italic font-normal text-[hsl(var(--canalco-neutral-400))]">se asigna al guardar</span>}</span>
            </Cell>
            <Cell label="Proyecto / Código" last><TInput value={f.proyectoCodigo} onChange={(v) => set('proyectoCodigo', v)} /></Cell>
          </div>
          <div className="grid grid-cols-2 border-b border-[#0a2a52]">
            <Cell label="Solicitante"><TInput value={f.solicitante} onChange={(v) => set('solicitante', v)} /></Cell>
            <Cell label="Cargo" last><TInput value={f.cargoSolicitante} onChange={(v) => set('cargoSolicitante', v)} /></Cell>
          </div>

          {/* 2. Datos del beneficiario */}
          <Sec n="2" title="DATOS DEL BENEFICIARIO" />
          <div className="grid grid-cols-3 border-b border-[#0a2a52]">
            <Cell label="Tipo beneficiario">
              <select value={f.tipoBeneficiario} onChange={(e) => set('tipoBeneficiario', e.target.value)} className="w-full bg-transparent outline-none text-[12px] py-0.5">
                <option value="">— Selecciona —</option>
                <option value="empleado">Empleado</option>
                <option value="tercero-proveedor">Tercero/Proveedor</option>
              </select>
            </Cell>
            <Cell label="¿Tercero creado en BD?">
              <select value={f.terceroCreado} onChange={(e) => set('terceroCreado', e.target.value)} className="w-full bg-transparent outline-none text-[12px] py-0.5">
                <option value="">— Selecciona —</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Cell>
            <Cell label="C.C. / NIT" last><TInput value={f.ccNit} onChange={(v) => set('ccNit', v)} /></Cell>
          </div>
          <div className="grid grid-cols-3 border-b border-[#0a2a52]">
            <Cell label="Nombre / Razón social"><TInput value={f.benefNombre} onChange={(v) => set('benefNombre', v)} /></Cell>
            <Cell label="Banco"><TInput value={f.banco} onChange={(v) => set('banco', v)} /></Cell>
            <Cell label="N.º de cuenta" last><TInput value={f.numeroCuenta} onChange={(v) => set('numeroCuenta', v)} /></Cell>
          </div>

          {/* 3. Concepto y naturaleza */}
          <Sec n="3" title="CONCEPTO Y NATURALEZA DEL ANTICIPO" />
          <div className="border-b border-[#0a2a52]">
            <div className="grid grid-cols-[160px_1fr]">
              <LabelCell>Concepto / Descripción</LabelCell>
              <div className="px-2 py-1.5"><TArea value={f.concepto} onChange={(v) => set('concepto', v)} /></div>
            </div>
          </div>
          <div className="border-b border-[#0a2a52]">
            <div className="grid grid-cols-[160px_1fr]">
              <LabelCell>Naturaleza del anticipo</LabelCell>
              <div className="px-2 py-1.5">
                <select value={f.naturaleza} onChange={(e) => set('naturaleza', e.target.value)} className="w-full bg-transparent outline-none text-[12px] py-0.5">
                  <option value="">— Selecciona —</option>
                  <option value="operativo">Operativo (proyecto)</option>
                  <option value="administrativo">Administrativo (inventarios/viáticos/reparaciones/vehículos)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 4. Valor y forma de pago */}
          <Sec n="4" title="VALOR SOLICITADO Y FORMA DE PAGO" />
          <div className="grid grid-cols-3 border-b border-[#0a2a52]">
            <Cell label="Valor solicitado (COP)"><TInput value={f.valor} onChange={(v) => set('valor', v)} placeholder="$" /></Cell>
            <Cell label="Fecha requerida de pago"><TInput value={f.fechaPago} onChange={(v) => set('fechaPago', v)} type="date" /></Cell>
            <Cell label="Forma de pago" last><TInput value={f.formaPago} onChange={(v) => set('formaPago', v)} placeholder="Transferencia / Cheque / …" /></Cell>
          </div>

          {/* 5. Anexos */}
          <Sec n="5" title="ANEXOS" />
          <div className="grid grid-cols-3 border-b border-[#0a2a52]">
            <Cell label="RUT (tercero nuevo)"><SelectSNA value={f.anexoRut} onChange={(v) => set('anexoRut', v)} /></Cell>
            <Cell label="Certificación bancaria"><SelectSNA value={f.anexoCertBancaria} onChange={(v) => set('anexoCertBancaria', v)} /></Cell>
            <Cell label="Requisición GC-001-F" last><SelectSNA value={f.anexoRequisicion} onChange={(v) => set('anexoRequisicion', v)} /></Cell>
          </div>

          {/* 6. Flujo de aprobación — firmas (se llenan solas en cada aprobación) */}
          <Sec n="6" title="FLUJO DE APROBACIÓN — FIRMAS" />
          <table className="w-full border-collapse text-center text-[11px]">
            <thead>
              <tr>
                <SignTh>Solicitante</SignTh>
                <SignTh>Jefe inmediato</SignTh>
                <SignTh>Gerente de Proyectos</SignTh>
                <SignTh>Gerencia General</SignTh>
              </tr>
            </thead>
            <tbody>
              <tr>
                <SignTd><FirmaFecha nombre={f.firmaSolicitante} onNombre={(v) => set('firmaSolicitante', v)} fecha={f.fechaFirmaSolicitante} onFecha={(v) => set('fechaFirmaSolicitante', v)} /></SignTd>
                <SignTd><FirmaFecha nombre={f.firmaJefe} onNombre={(v) => set('firmaJefe', v)} fecha={f.fechaFirmaJefe} onFecha={(v) => set('fechaFirmaJefe', v)} /></SignTd>
                <SignTd><FirmaFecha nombre={f.firmaGerenteProy} onNombre={(v) => set('firmaGerenteProy', v)} fecha={f.fechaFirmaGerenteProy} onFecha={(v) => set('fechaFirmaGerenteProy', v)} /></SignTd>
                <SignTd><FirmaFecha nombre={f.firmaGerenciaGral} onNombre={(v) => set('firmaGerenciaGral', v)} fecha={f.fechaFirmaGerenciaGral} onFecha={(v) => set('fechaFirmaGerenciaGral', v)} /></SignTd>
              </tr>
            </tbody>
          </table>

          </fieldset>

          {/* 7. Entrega y pago (Tesorería · Aurora) — la diligencia Tesorería en el paso de pago. */}
          <fieldset disabled={lockedPago} className="contents">
          <Sec n="7" title="ENTREGA Y PAGO (TESORERÍA)" />
          <div className="grid grid-cols-3 border-t border-[#0a2a52]">
            <Cell label="Recibido por (Tesorería)"><TInput value={f.entregaRecibidoPor} onChange={(v) => set('entregaRecibidoPor', v)} placeholder="Nombre de quien recibe y paga" /></Cell>
            <Cell label="¿Pago realizado?">
              <select value={f.pagoRealizado} onChange={(e) => set('pagoRealizado', e.target.value)} className="w-full bg-transparent outline-none text-[12px] py-0.5">
                <option value="">— Selecciona —</option>
                <option value="si">Sí, pagado</option>
                <option value="no">Pendiente</option>
              </select>
            </Cell>
            <Cell label="Fecha de pago" last><TInput value={f.fechaPagoRealizado} onChange={(v) => set('fechaPagoRealizado', v)} type="date" /></Cell>
          </div>
          </fieldset>
        </div>

        <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
          Al guardar por primera vez se asigna el consecutivo del anticipo; con ese número se diligencia la Legalización (GCT-006-F).
        </p>
      </main>
    </div>
  );
}

/* ── Panel de flujo del anticipo ────────────────────────── */

const fmtFecha = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function AnticipoWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as AnticipoEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = esTerminal(estado);

  return (
    <div className="no-print mb-6 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado del flujo:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>{estadoLabel(estado)}</span>
        {sla && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {sla.vencida ? 'Vencida' : 'A tiempo'} · vence {fmtFecha(sla.vence)} ({sla.diasHabiles} día{sla.diasHabiles !== 1 ? 's' : ''} háb.)
          </span>
        )}
        {ANTICIPO_ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">sin plazo</span>
        )}
      </div>

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: AnticipoTransicion) => (
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
      {terminal && <p className="text-xs font-medium text-green-700">✓ Anticipo pagado. Flujo finalizado.</p>}

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

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

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

function Cell({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[1fr] ' + (last ? '' : 'border-r border-[#0a2a52]')}>
      <div className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[#0a2a52] px-2 py-1 font-semibold text-[11px] text-black">{label}</div>
      <div className="px-2 py-1.5 min-h-[2rem] flex items-center">{children}</div>
    </div>
  );
}

function SelectSNA({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent outline-none text-[12px] py-0.5">
      <option value="">— Selecciona —</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
      <option value="na">N/A</option>
    </select>
  );
}

function SignTh({ children }: { children: React.ReactNode }) {
  return <th className="w-1/4 bg-[hsl(var(--canalco-neutral-200))] text-black font-bold text-[11px] py-1.5 px-1 border border-[#0a2a52]">{children}</th>;
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

function TArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full bg-transparent outline-none resize-y text-[12px] py-0.5 min-h-[2.6rem] placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic"
    />
  );
}
