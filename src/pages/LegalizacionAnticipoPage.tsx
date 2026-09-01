import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Eraser, Save, Loader2, Plus, Trash2, Link2, Search, History, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  type LegalizacionEstado,
  accionesDisponibles,
  calcularSla,
  estadoLabel,
  estadoBadgeClass,
  LEGALIZACION_ESTADOS,
  LEGALIZACION_PLAZO_DIAS,
  LEGALIZACION_CORTE_DIA_MES,
  esTerminal,
  esEditable,
  fueraDeCorte,
  type LegalizacionTransicion,
} from '@/utils/legalizacionWorkflow';
import { textoSla } from '@/utils/juridicaWorkflow';

/**
 * Formato GCT-006-F · "Legalización de anticipos" (G. contable y tributaria).
 * Toma la identidad de la hoja "LEGALIZACIÓN DE ANTICIPOS" (logos + recuadro MONTO).
 * Para poder diligenciarse, primero se enlaza a un anticipo (GF-005-F) por su
 * consecutivo único; de ahí se prellena empresa/NIT y el valor del anticipo.
 */

const GESTION = 'contable';
const FORMATO = 'GCT-006-F';
const FORMATO_ANTICIPO = 'GF-005-F';

interface Factura { proveedor: string; nitRut: string; fecha: string; concepto: string; valor: string; soporteUrl: string; }

interface FormState {
  anticipoConsecutivo: string;
  anticipoValor: string;
  anticipoProyecto: string;
  anticipoBeneficiario: string;
  empresa: string; nit: string; fecha: string;
  facturas: Factura[];
  /** Link general de los soportes (carpeta de SharePoint con todas las facturas). */
  soportesUrl: string;
  anticipoPorLegalizar: string;
  numConsignacion: string;
  /** Reclasificación del concepto entre anticipo y legalización (la registra Contabilidad). */
  reclasificacionConcepto: string;
  reclasificacionObs: string;
  firmaElaboro: string; fechaElaboro: string;
  firmaReviso: string; fechaReviso: string;
  firmaCauso: string; fechaCauso: string;
  totalFacturas?: number; saldoCaja?: number;
}

const emptyFactura = (): Factura => ({ proveedor: '', nitRut: '', fecha: '', concepto: '', valor: '', soporteUrl: '' });

const EMPTY: FormState = {
  anticipoConsecutivo: '', anticipoValor: '', anticipoProyecto: '', anticipoBeneficiario: '',
  empresa: '', nit: '', fecha: '',
  facturas: [emptyFactura(), emptyFactura(), emptyFactura()],
  soportesUrl: '',
  anticipoPorLegalizar: '', numConsignacion: '',
  reclasificacionConcepto: '', reclasificacionObs: '',
  firmaElaboro: '', fechaElaboro: '',
  firmaReviso: '', fechaReviso: '',
  firmaCauso: '', fechaCauso: '',
};

const hoy = () => new Date().toISOString().slice(0, 10);
// COP en enteros: se ignoran separadores de miles (puntos/comas) y símbolos.
const toNum = (s: string) => { const n = parseInt(String(s ?? '').replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; };
const money = (n: number) => '$ ' + n.toLocaleString('es-CO');
// Normaliza un consecutivo para comparar ("1" == "0001").
const normCode = (s: any) => (String(s ?? '').replace(/\D/g, '').replace(/^0+/, '') || '0');

export default function LegalizacionAnticipoPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<FormState>({ ...EMPTY, fecha: hoy() });
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState<boolean>(solicitudId !== null);
  const [saving, setSaving] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [buscando, setBuscando] = useState(false);

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
        if (!cancelled) toast.error('No se pudo cargar la legalización');
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
    // Al causar, Contabilidad envía la reclasificación del concepto y la consignación.
    let data: Record<string, any> | undefined;
    if (accion === 'causar') {
      data = {
        reclasificacionConcepto: f.reclasificacionConcepto,
        reclasificacionObs: f.reclasificacionObs,
        numConsignacion: f.numConsignacion,
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

  // Al abrir "Legalizar" desde un anticipo, viene el consecutivo en la URL (?anticipo=)
  // y se enlaza solo, sin tener que teclearlo.
  useEffect(() => {
    const pre = searchParams.get('anticipo');
    if (solicitudId === null && pre) {
      setCodeInput(pre);
      cargarAnticipo(pre);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linked = !!f.anticipoConsecutivo;
  // El formato solo se edita en borrador; una vez enviado queda bloqueado.
  const locked = !esEditable(sol?.estado);
  const esCreador = !!user && !!sol && sol.createdBy === user.userId;
  // Contabilidad diligencia la reclasificación mientras la tiene en su bandeja.
  const puedeReclasificar = !sol || sol.estado === 'pendiente_contabilidad' || !locked;

  // Cálculos de conciliación
  const totalFacturas = f.facturas.reduce((a, x) => a + toNum(x.valor), 0);
  const anticipoPorLegalizar = toNum(f.anticipoPorLegalizar);
  const saldoCaja = anticipoPorLegalizar - totalFacturas;
  // Si el anticipo cubre y sobra → se reintegra; si faltó → se reembolsa al solicitante.
  const sobranteReintegrar = Math.max(saldoCaja, 0);
  const reembolsarSolicitante = Math.max(-saldoCaja, 0);

  const cargarAnticipo = async (codeArg?: string) => {
    const code = (codeArg ?? codeInput).trim();
    if (!code) { toast.error('Escribe el consecutivo del anticipo'); return; }
    setBuscando(true);
    try {
      const all = await gestionConocimientoService.list({ gestion: GESTION });
      const ant = all.find((r) => r.formato === FORMATO_ANTICIPO && normCode(r.data?.consecutivo) === normCode(code));
      if (!ant) { toast.error(`No existe un anticipo con el código ${code}`); return; }
      // Regla: solo se legaliza un anticipo ya pagado. Antes del pago no hay nada que
      // legalizar —el dinero no ha salido de Tesorería—, así que no se deja enlazar.
      if (ant.estado !== 'pagado') {
        toast.error(
          `El anticipo N.º ${ant.data?.consecutivo ?? code} aún no está pagado. `
          + `Solo se puede legalizar cuando Tesorería registre el pago.`,
        );
        return;
      }
      setF((prev) => ({
        ...prev,
        anticipoConsecutivo: ant.data?.consecutivo ?? code,
        anticipoValor: ant.data?.valor ?? '',
        anticipoProyecto: ant.data?.proyectoCodigo ?? '',
        anticipoBeneficiario: ant.data?.benefNombre ?? '',
        empresa: prev.empresa || ant.data?.benefNombre || '',
        nit: prev.nit || ant.data?.ccNit || '',
        anticipoPorLegalizar: prev.anticipoPorLegalizar || ant.data?.valor || '',
      }));
      toast.success(`Anticipo N.º ${ant.data?.consecutivo ?? code} cargado`);
    } catch {
      toast.error('No se pudo buscar el anticipo');
    } finally {
      setBuscando(false);
    }
  };

  const setFactura = (i: number, patch: Partial<Factura>) =>
    setF((prev) => ({ ...prev, facturas: prev.facturas.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addFactura = () => setF((prev) => ({ ...prev, facturas: [...prev.facturas, emptyFactura()] }));
  const delFactura = (i: number) => setF((prev) => ({ ...prev, facturas: prev.facturas.filter((_, j) => j !== i) }));

  const handleSave = async () => {
    if (!linked) { toast.error('Primero enlaza un anticipo por su consecutivo'); return; }
    setSaving(true);
    const payload: FormState = { ...f, totalFacturas, saldoCaja };
    try {
      if (solicitudId === null) {
        const creada = await gestionConocimientoService.create({ gestion: GESTION, formato: FORMATO, data: payload });
        toast.success('Legalización guardada');
        navigate(`/dashboard/gestion-conocimiento/contable/legalizacion/${creada.solicitudId}`, { replace: true });
      } else {
        await gestionConocimientoService.update(solicitudId, { data: payload });
        toast.success('Legalización actualizada');
      }
    } catch {
      toast.error('No se pudo guardar la legalización');
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/contable/legalizaciones')} title="Volver a Legalizaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow min-w-0">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] truncate">Legalización de anticipo</h1>
            <div className="text-xs text-[hsl(var(--canalco-neutral-600))] flex items-center gap-2 flex-wrap">
              <span>G. contable · Formato GCT-006-F</span>
              {linked && <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded px-2 py-0.5 bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]"><Link2 className="w-3 h-3" /> Anticipo N.º {f.anticipoConsecutivo}</span>}
              {sol && <span className={`text-[11px] font-semibold rounded px-2 py-0.5 ${estadoBadgeClass(sol.estado)}`}>{estadoLabel(sol.estado)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            {linked && !locked && (
              <Button variant="outline" onClick={() => setF({ ...EMPTY, fecha: hoy() })} className="gap-2">
                <Eraser className="w-4 h-4" /> Limpiar
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} className="gap-2" disabled={!linked}>
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
            <Button onClick={handleSave} disabled={saving || !linked || locked} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {sol && (
          <LegalizacionWorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={esCreador}
            onAccion={handleTransition}
          />
        )}

        {/* Compuerta: enlazar un anticipo para poder diligenciar */}
        {!linked && (
          <div className="no-print max-w-xl mx-auto bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-xl shadow-sm p-6 text-center">
            <Link2 className="w-10 h-10 mx-auto text-[hsl(var(--canalco-primary))] mb-3" />
            <h2 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Enlaza el anticipo a legalizar</h2>
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-1 mb-4">
              Escribe el consecutivo del anticipo (GF-005-F). Solo así se habilita el formato de legalización.
            </p>
            <div className="flex items-center gap-2 justify-center">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') cargarAnticipo(); }}
                placeholder="Ej.: 0001"
                className="w-40 text-center font-mono text-lg border border-[hsl(var(--canalco-neutral-300))] rounded-md px-3 py-2 outline-none focus:border-[hsl(var(--canalco-primary))]"
              />
              <Button onClick={() => cargarAnticipo()} disabled={buscando} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Cargar anticipo
              </Button>
            </div>
          </div>
        )}

        {linked && (
        <div className="doc bg-white border border-[#0a2a52] mx-auto text-[13px] text-black shadow-md">
          {/* Encabezado con logos y código (estilo hoja "LEGALIZACIÓN DE ANTICIPOS") */}
          <table className="w-full border-collapse border-b border-[#0a2a52]">
            <tbody>
              <tr>
                <td className="w-[130px] border-r border-[#0a2a52] text-center align-middle p-2">
                  <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-16 object-contain inline-block" />
                </td>
                <td className="border-r border-[#0a2a52] text-center align-middle px-3 py-2 font-bold text-[17px] tracking-wide">
                  LEGALIZACIÓN DE ANTICIPOS
                </td>
                <td className="w-[160px] align-top p-0">
                  <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                    <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr] text-[11px]">
                    <CodeCell label="Código" value="GCT-006-F" />
                    <CodeCell label="Fecha" value={f.fecha || hoy()} />
                    <CodeCell label="Versión" value="2" last />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Todo el cuerpo del formato queda bloqueado cuando ya salió de borrador. */}
          <fieldset disabled={locked} className="contents">

          {/* EMPRESA/NIT/FECHA + recuadro MONTO */}
          <div className="grid grid-cols-2 border-b border-[#0a2a52]">
            <div className="border-r border-[#0a2a52]">
              <FieldRow label="EMPRESA" value={f.empresa} onChange={(v) => set('empresa', v)} />
              <FieldRow label="NIT" value={f.nit} onChange={(v) => set('nit', v)} />
              <FieldRow label="FECHA" value={f.fecha} onChange={(v) => set('fecha', v)} type="date" last />
            </div>
            <div>
              <div className="bg-[hsl(var(--canalco-neutral-100))] text-center font-bold text-[12px] py-1 border-b border-[#0a2a52]">MONTO</div>
              <MontoRow label="FACTURAS Y RECIBOS" value={money(totalFacturas)} />
              <MontoRow label="ANTICIPOS (VALES PROVISIONALES x LEGALIZAR)" editable value={f.anticipoPorLegalizar} onChange={(v) => set('anticipoPorLegalizar', v)} />
              <MontoRow label="SALDO EN CAJA" value={money(saldoCaja)} strong last />
            </div>
          </div>

          {/* Anticipo enlazado */}
          <div className="grid grid-cols-4 border-b border-[#0a2a52] text-[11px]">
            <InfoCell label="Anticipo N.º" value={f.anticipoConsecutivo} mono />
            <InfoCell label="Proyecto / Código" value={f.anticipoProyecto} />
            <InfoCell label="Beneficiario" value={f.anticipoBeneficiario} />
            <InfoCell label="Valor entregado (COP)" value={f.anticipoValor} last />
          </div>

          {/* Relación de facturas y soportes */}
          <SecBand>RELACIÓN DE FACTURAS Y SOPORTES</SecBand>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                <Th w="34px">N.º</Th>
                <Th>Proveedor / Establecimiento</Th>
                <Th w="120px">NIT / RUT</Th>
                <Th w="96px">Fecha</Th>
                <Th>Concepto</Th>
                <Th w="120px">Valor (COP)</Th>
                <Th w="150px">Soporte (link)</Th>
                <th className="no-print border border-[#0a2a52] w-8 bg-[hsl(var(--canalco-neutral-100))]" />
              </tr>
            </thead>
            <tbody>
              {f.facturas.map((x, i) => (
                <tr key={i}>
                  <td className="border border-[#0a2a52] text-center py-0.5">{i + 1}</td>
                  <td className="border border-[#0a2a52] px-1"><Cellinput value={x.proveedor} onChange={(v) => setFactura(i, { proveedor: v })} /></td>
                  <td className="border border-[#0a2a52] px-1"><Cellinput value={x.nitRut} onChange={(v) => setFactura(i, { nitRut: v })} /></td>
                  <td className="border border-[#0a2a52] px-1"><Cellinput value={x.fecha} onChange={(v) => setFactura(i, { fecha: v })} type="date" /></td>
                  <td className="border border-[#0a2a52] px-1"><Cellinput value={x.concepto} onChange={(v) => setFactura(i, { concepto: v })} /></td>
                  <td className="border border-[#0a2a52] px-1"><Cellinput value={x.valor} onChange={(v) => setFactura(i, { valor: v })} right /></td>
                  <td className="border border-[#0a2a52] px-1"><SoporteCell value={x.soporteUrl} onChange={(v) => setFactura(i, { soporteUrl: v })} /></td>
                  <td className="no-print border border-[#0a2a52] text-center">
                    <button onClick={() => delFactura(i)} title="Quitar fila" className="text-[hsl(var(--canalco-neutral-400))] hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-[hsl(var(--canalco-neutral-100))] font-bold">
                <td colSpan={5} className="border border-[#0a2a52] text-right px-2 py-1">TOTAL FACTURAS Y RECIBOS</td>
                <td className="border border-[#0a2a52] text-right px-1 py-1 tabular-nums">{money(totalFacturas)}</td>
                <td className="border border-[#0a2a52]" />
                <td className="no-print border border-[#0a2a52]" />
              </tr>
            </tbody>
          </table>
          <div className="no-print px-2 py-1.5 border-b border-x border-[#0a2a52]">
            <Button variant="outline" size="sm" onClick={addFactura} className="gap-1 h-7 text-xs">
              <Plus className="w-3.5 h-3.5" /> Agregar factura
            </Button>
          </div>

          {/* Link general de los soportes (una sola carpeta con todas las facturas) */}
          <div className="grid grid-cols-[200px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Carpeta de soportes (link)</LabelCell>
            <div className="px-2 py-1.5"><SoporteCell value={f.soportesUrl} onChange={(v) => set('soportesUrl', v)} /></div>
          </div>

          {/* Conciliación */}
          <SecBand>CONCILIACIÓN DE VALORES</SecBand>
          <div className="grid grid-cols-2 border-b border-[#0a2a52]">
            <ConcRow label="Valor anticipo entregado" value={money(anticipoPorLegalizar)} />
            <ConcRow label="Valor sobrante a reintegrar" value={money(sobranteReintegrar)} last />
            <ConcRow label="Valor ejecutado / soportado" value={money(totalFacturas)} />
            <ConcRow label="Valor a reembolsar al solicitante" value={money(reembolsarSolicitante)} last />
          </div>
          <div className="grid grid-cols-[200px_1fr] border-b border-[#0a2a52]">
            <LabelCell>N.º consignación sobrante</LabelCell>
            <div className="px-2 py-1.5"><Cellinput value={f.numConsignacion} onChange={(v) => set('numConsignacion', v)} /></div>
          </div>

          </fieldset>

          {/* Reclasificación del concepto (la registra Contabilidad al causar) */}
          <SecBand>RECLASIFICACIÓN DEL CONCEPTO (ANTICIPO ↔ LEGALIZACIÓN)</SecBand>
          <div className="grid grid-cols-[200px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Concepto reclasificado</LabelCell>
            <div className="px-2 py-1.5">
              <Cellinput value={f.reclasificacionConcepto} onChange={(v) => set('reclasificacionConcepto', v)} disabled={!puedeReclasificar} />
            </div>
          </div>
          <div className="grid grid-cols-[200px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Observaciones</LabelCell>
            <div className="px-2 py-1.5">
              <Cellinput value={f.reclasificacionObs} onChange={(v) => set('reclasificacionObs', v)} disabled={!puedeReclasificar} />
            </div>
          </div>

          {/* Firmas — las llena el flujo al aprobar cada paso */}
          <SecBand>REVISIÓN Y APROBACIÓN — FIRMAS</SecBand>
          <fieldset disabled={locked} className="contents">
          <table className="w-full border-collapse text-center text-[11px]">
            <thead>
              <tr>
                <SignTh>Elaboró / Responsable</SignTh>
                <SignTh>Revisó — Gerencia de Proyectos</SignTh>
                <SignTh>Causó — Contabilidad</SignTh>
              </tr>
            </thead>
            <tbody>
              <tr>
                <SignTd><FirmaFecha nombre={f.firmaElaboro} onNombre={(v) => set('firmaElaboro', v)} fecha={f.fechaElaboro} onFecha={(v) => set('fechaElaboro', v)} /></SignTd>
                <SignTd><FirmaFecha nombre={f.firmaReviso} onNombre={(v) => set('firmaReviso', v)} fecha={f.fechaReviso} onFecha={(v) => set('fechaReviso', v)} /></SignTd>
                <SignTd><FirmaFecha nombre={f.firmaCauso} onNombre={(v) => set('firmaCauso', v)} fecha={f.fechaCauso} onFecha={(v) => set('fechaCauso', v)} /></SignTd>
              </tr>
            </tbody>
          </table>
          </fieldset>
        </div>
        )}

        {linked && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Plazo máximo de legalización: {LEGALIZACION_PLAZO_DIAS} días calendario después de finalizada la actividad ·
            se recibe dentro de los {LEGALIZACION_CORTE_DIA_MES} primeros días del mes.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────── */

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function FieldRow({ label, value, onChange, type, last }: { label: string; value: string; onChange: (v: string) => void; type?: string; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[90px_1fr] ' + (last ? '' : 'border-b border-[#0a2a52]')}>
      <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-2 py-2 font-bold text-[11px] flex items-center">{label}</div>
      <div className="px-2 py-1.5 flex items-center">
        <input type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5" />
      </div>
    </div>
  );
}

function MontoRow({ label, value, onChange, editable, strong, last }: {
  label: string; value: string; onChange?: (v: string) => void; editable?: boolean; strong?: boolean; last?: boolean;
}) {
  return (
    <div className={'grid grid-cols-[1fr_110px] ' + (last ? '' : 'border-b border-[#0a2a52]')}>
      <div className={'px-2 py-1 text-[10px] font-semibold flex items-center ' + (strong ? 'bg-[hsl(var(--canalco-primary))]/10' : '')}>{label}</div>
      <div className={'border-l border-[#0a2a52] px-2 py-1 text-right tabular-nums flex items-center justify-end ' + (strong ? 'font-bold bg-[hsl(var(--canalco-primary))]/10' : '')}>
        {editable
          ? <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder="$" className="w-full bg-transparent outline-none text-right text-[12px] border-b border-dotted border-[hsl(var(--canalco-neutral-300))]" />
          : <span className="text-[12px]">{value}</span>}
      </div>
    </div>
  );
}

function InfoCell({ label, value, last, mono }: { label: string; value: string; last?: boolean; mono?: boolean }) {
  return (
    <div className={last ? '' : 'border-r border-[#0a2a52]'}>
      <div className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[#0a2a52] px-2 py-0.5 font-semibold text-[10px] text-black">{label}</div>
      <div className={'px-2 py-1 text-[12px] min-h-[1.6rem] ' + (mono ? 'font-mono font-semibold' : '')}>{value || ' '}</div>
    </div>
  );
}

function SecBand({ children }: { children: React.ReactNode }) {
  return <div className="bg-[hsl(var(--canalco-neutral-200))] text-black font-bold text-[12px] px-3 py-1.5 border-b border-[#0a2a52]">{children}</div>;
}

function Th({ children, w }: { children?: React.ReactNode; w?: string }) {
  return <th style={w ? { width: w } : undefined} className="border border-[#0a2a52] px-1 py-1 font-bold text-[11px]">{children}</th>;
}

function LabelCell({ children }: { children: React.ReactNode }) {
  return <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-3 py-2 font-semibold text-[12px] flex items-center text-black">{children}</div>;
}

function ConcRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[160px_1fr] border-b border-[#0a2a52] ' + (last ? 'border-l' : '')}>
      <LabelCell>{label}</LabelCell>
      <div className="px-2 py-1.5 text-right tabular-nums text-[12px] flex items-center justify-end font-semibold">{value}</div>
    </div>
  );
}

function SignTh({ children }: { children: React.ReactNode }) {
  return <th className="bg-[hsl(var(--canalco-neutral-200))] text-black font-bold text-[11px] py-1.5 px-1 border border-[#0a2a52]">{children}</th>;
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

/**
 * Celda de soporte: un enlace (SharePoint, OneDrive, Drive…) hacia el archivo de la
 * factura. Se pega la URL; el botón la abre en otra pestaña. Al imprimir se muestra la
 * URL como texto —el input conserva su valor— para que el PDF firmado deje rastro de
 * dónde está el soporte.
 */
function SoporteCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const url = (value ?? '').trim();
  const href = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
  return (
    <div className="flex items-center gap-1">
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el link…"
        className="w-full bg-transparent outline-none text-[12px] py-1 disabled:text-[hsl(var(--canalco-neutral-500))]"
      />
      {url && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title="Abrir soporte"
          className="shrink-0 text-[hsl(var(--canalco-primary))] hover:opacity-70"
        >
          <Link2 className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function Cellinput({ value, onChange, type, right, disabled }: { value: string; onChange: (v: string) => void; type?: string; right?: boolean; disabled?: boolean }) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={'w-full bg-transparent outline-none text-[12px] py-1 disabled:text-[hsl(var(--canalco-neutral-500))] ' + (right ? 'text-right tabular-nums' : '')}
    />
  );
}

/* ── Panel del flujo (GCT-006-F) ─────────────────────── */

const fmtFecha = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function LegalizacionWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as LegalizacionEstado;
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
            {textoSla(sla)}
          </span>
        )}
        {LEGALIZACION_ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">sin plazo</span>
        )}
      </div>

      {estado === 'borrador' && fueraDeCorte() && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" />
          Estamos fuera del corte de caja: la legalización se recibe dentro de los {LEGALIZACION_CORTE_DIA_MES} primeros días del mes.
        </p>
      )}

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: LegalizacionTransicion) => (
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
      {terminal && <p className="text-xs font-medium text-green-700">✓ Legalización causada por Contabilidad. Flujo finalizado.</p>}

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
