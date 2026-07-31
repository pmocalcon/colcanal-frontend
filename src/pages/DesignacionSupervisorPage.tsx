import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';

/**
 * Formato GJ-003-F · "Designación de Supervisor" (fase 2 de G. jurídica).
 * Es una carta: parte del texto es fijo y las variables se diligencian. Varios campos
 * se prellenan con la información de la solicitud/contrato. La diligencia Jurídica.
 * Ruta: `.../juridica/:id/designacion-supervisor`. Se guarda en data.designacionSupervisor.
 */

interface DesignacionState {
  lugarFecha: string;
  // Destinatario (supervisor designado)
  supervisorNombre: string; supervisorCargo: string; supervisorCiudad: string;
  fechaSuscripcion: string;
  // Tabla de información del contrato
  tipologia: string;
  contratante: string; contratanteNit: string;
  contratista: string; contratistaCc: string;
  objeto: string;
  valor: string; formaPago: string;
  plazo: string;
  aprobacionGarantias: string;
  // Firmas
  funcionarioNombre: string; funcionarioCargo: string; funcionarioEmpresa: string; funcionarioNit: string;
  elaboro: string; proyectoReviso: string;
}

const EMPTY: DesignacionState = {
  lugarFecha: '',
  supervisorNombre: '', supervisorCargo: '', supervisorCiudad: '',
  fechaSuscripcion: '',
  tipologia: '',
  contratante: '', contratanteNit: '',
  contratista: '', contratistaCc: '',
  objeto: '',
  valor: '', formaPago: '',
  plazo: '',
  aprobacionGarantias: '',
  funcionarioNombre: '', funcionarioCargo: 'Representante Legal', funcionarioEmpresa: '', funcionarioNit: '',
  elaboro: '', proyectoReviso: '',
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

// Los estados en los que ya existe el contrato firmado y puede emitirse la designación.
const HABILITADO = ['en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function DesignacionSupervisorPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<DesignacionState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const set = <K extends keyof DesignacionState>(k: K, v: DesignacionState[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const d = data.data ?? {};
        const saved = (d.designacionSupervisor ?? {}) as Partial<DesignacionState>;
        // Prellenado desde la solicitud/contrato cuando el documento aún no tiene el dato.
        setF({
          ...EMPTY,
          ...saved,
          tipologia: saved.tipologia || getTipo(d.tipoContrato)?.nombre || '',
          contratante: saved.contratante || d.empresa || '',
          contratista: saved.contratista || d.contratista || '',
          objeto: saved.objeto || d.alcanceServicio || d.objetoProyecto || '',
          valor: saved.valor || d.honorarios || '',
          formaPago: saved.formaPago || d.formaPago || '',
          plazo: saved.plazo || d.duracion || '',
          funcionarioEmpresa: saved.funcionarioEmpresa || d.empresa || '',
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la designación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'designacionSupervisor', f);
      toast.success('Designación guardada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
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
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Designación de Supervisor</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Formato GJ-003-F · Solicitud N.º {solicitudId}</p>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">La designación de supervisor aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita cuando el flujo llega a «Designación de supervisor» (después de la firma del contrato).</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-[#0a2a52] shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_150px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[14px] border-r border-[#0a2a52]">
                DESIGNACIÓN DE SUPERVISOR
              </div>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
                </div>
                <div className="grid grid-cols-[auto_1fr] text-[10px]">
                  <CodeCell label="Código" value="GJ-003-F" />
                  <CodeCell label="Fecha" value="22/06/2023" />
                  <CodeCell label="Versión" value="1" last />
                </div>
              </div>
            </div>

            {/* Cuerpo de la carta */}
            <div className="px-8 py-6 space-y-4 leading-relaxed text-[12.5px]">
              <Line value={f.lugarFecha} onChange={(v) => set('lugarFecha', v)} placeholder="Ciudad - Departamento, 00 de mes de 0000." />

              <div>
                <p>Señor(a)</p>
                <Line value={f.supervisorNombre} onChange={(v) => set('supervisorNombre', v)} placeholder="NOMBRE DEL SUPERVISOR" bold />
                <Line value={f.supervisorCargo} onChange={(v) => set('supervisorCargo', v)} placeholder="Cargo" />
                <Line value={f.supervisorCiudad} onChange={(v) => set('supervisorCiudad', v)} placeholder="Ciudad - Departamento" />
              </div>

              <FieldRow label="Referencia:">
                Contrato de {textOrDash(f.tipologia)} suscrito entre {textOrDash(f.contratante)} y {textOrDash(f.contratista)}.
              </FieldRow>
              <FieldRow label="Asunto:">
                Designación de supervisor del contrato en referencia.
              </FieldRow>

              <p>
                De conformidad con el contrato de {lower(f.tipologia) || 'prestación de servicios'} suscrito el{' '}
                <Inline value={f.fechaSuscripcion} onChange={(v) => set('fechaSuscripcion', v)} placeholder="00 de mes de 0000" />,
                {' '}le informo que ha sido designado como supervisor del mencionado contrato.
              </p>

              <p>A continuación, se relaciona la información del Contrato:</p>

              {/* Tabla de información del contrato */}
              <table className="w-full border-collapse text-[12px] my-2">
                <tbody>
                  <InfoRow label="Tipología contractual" value={f.tipologia} onChange={(v) => set('tipologia', v)} />
                  <InfoRow label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                  <InfoRow label="Identificación/NIT" value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} placeholder="NIT. 000.000.000-0" />
                  <InfoRow label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
                  <InfoRow label="Identificación/CC" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="0.000.000 expedida en ..." />
                  <InfoRow label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                  <InfoRow label="Valor total del contrato" value={f.valor} onChange={(v) => set('valor', v)} area
                    extra={<InfoSub label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} />} />
                  <InfoRow label="Plazo" value={f.plazo} onChange={(v) => set('plazo', v)} area />
                  <InfoRow label="Aprobación de garantías" value={f.aprobacionGarantias} onChange={(v) => set('aprobacionGarantias', v)} area
                    placeholder="Garantía de Cumplimiento No. ..., Póliza de RCE No. ..., expedidas el ..." />
                </tbody>
              </table>

              <p>
                Con el fin de proteger la moralidad administrativa, de prevenir la ocurrencia de actos de corrupción
                y de tutelar la transparencia de la actividad contractual, le informo que ha sido designado como
                supervisor del contrato referenciado.
              </p>
              <p>
                La supervisión consistirá en el seguimiento técnico sobre el cumplimiento del objeto del contrato.
              </p>
              <p>
                <b>Facultades y deberes de los supervisores.</b> La supervisión contractual implica el seguimiento
                al ejercicio del cumplimiento obligacional por la entidad contratante sobre las obligaciones a cargo
                del contratista.
              </p>
              <p>
                Los supervisores están facultados para solicitar informes, aclaraciones y explicaciones sobre el
                desarrollo de la ejecución contractual, y serán responsables por mantener informada a la entidad
                contratante a través de su representante legal, de los hechos o circunstancias que puedan constituir
                actos de corrupción tipificados como conductas punibles, o que puedan poner o pongan en riesgo el
                cumplimiento del contrato, o cuando tal incumplimiento se presente.
              </p>
              <p>
                Adjunto al presente comunicado, copia del contrato objeto de esta designación de supervisor.
              </p>
              <p>Atentamente,</p>

              {/* Firmas */}
              <div className="grid grid-cols-2 gap-8 pt-10">
                <Firma titulo="FUNCIONARIO QUE DESIGNA">
                  <Line value={f.funcionarioNombre} onChange={(v) => set('funcionarioNombre', v)} placeholder="NOMBRE DEL REPRESENTANTE LEGAL" bold />
                  <Line value={f.funcionarioCargo} onChange={(v) => set('funcionarioCargo', v)} placeholder="Representante Legal" />
                  <Line value={f.funcionarioEmpresa} onChange={(v) => set('funcionarioEmpresa', v)} placeholder="EMPRESA / UNIÓN TEMPORAL" />
                  <Line value={f.funcionarioNit} onChange={(v) => set('funcionarioNit', v)} placeholder="Nit. 000.000.000-0" />
                </Firma>
                <Firma titulo="SUPERVISOR ASIGNADO">
                  <Line value={f.supervisorNombre} onChange={(v) => set('supervisorNombre', v)} placeholder="NOMBRE DEL SUPERVISOR" bold />
                  <Line value={f.supervisorCargo} onChange={(v) => set('supervisorCargo', v)} placeholder="Cargo" />
                </Firma>
              </div>

              {/* Pie: elaboró / revisó */}
              <div className="pt-8 text-[11px] space-y-1">
                <div className="flex gap-2">
                  <span className="font-semibold whitespace-nowrap">Elaboró:</span>
                  <Inline value={f.elaboro} onChange={(v) => set('elaboro', v)} placeholder="Nombre - Cargo" />
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold whitespace-nowrap">Proyectó y revisó:</span>
                  <Inline value={f.proyectoReviso} onChange={(v) => set('proyectoReviso', v)} placeholder="Nombre - Cargo" />
                </div>
              </div>
            </div>
          </div>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta designación. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Utilidades ─────────────────────────────────────────── */

const textOrDash = (v: string) => (v?.trim() ? v : '…');
const lower = (v: string) => (v ? v.toLowerCase() : '');

/* ── Subcomponentes ─────────────────────────────────────── */

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

/** Línea editable en bloque (una por renglón). */
function Line({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none border-b border-dotted border-transparent hover:border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12.5px] py-0.5 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')}
    />
  );
}

/** Campo editable en línea (dentro de un párrafo). */
function Inline({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size={Math.max((value || placeholder || '').length, 6)}
      className="bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12.5px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
    />
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <span className="font-bold whitespace-nowrap">{label}</span>
      <span>{children}</span>
    </p>
  );
}

function InfoRow({ label, value, onChange, area, placeholder, extra }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string; extra?: React.ReactNode;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[32%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
            className="w-full bg-transparent outline-none resize-y text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        )}
        {extra}
      </td>
    </tr>
  );
}

function InfoSub({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 pt-1 border-t border-dotted border-[hsl(var(--canalco-neutral-300))]">
      <span className="font-semibold">{label}: </span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        placeholder="Detalle de la forma de pago"
        className="w-full bg-transparent outline-none resize-y text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
    </div>
  );
}

function Firma({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-t border-[#0a2a52] pt-1 font-bold text-[11px]">{titulo}</div>
      <div className="space-y-0.5 mt-1">{children}</div>
    </div>
  );
}
