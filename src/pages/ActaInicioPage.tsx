import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';

/**
 * Formato GJ-006-F · "Acta de inicio para contrato por prestación de servicios,
 * alquiler o suministro" (fase 2 de G. jurídica). La diligencia Jurídica.
 * Reutiliza datos del contrato (solicitud) y de la designación de supervisor, y el texto
 * se puede reescribir. Ruta: `.../juridica/:id/acta-inicio`. Se guarda en data.actaInicio.
 */

interface ActaState {
  // Encabezado / título
  contratante: string; identTributaria: string; tipologia: string; contratista: string;
  // Tabla de datos
  representanteLegal: string; representanteCc: string;
  contratistaCc: string;
  direccion: string; celular: string; correo: string;
  objeto: string;
  valor: string; formaPago: string;
  plazo: string;
  aprobacionGarantias: string;
  // Reunión de inicio
  ciudadReunion: string;
  supervisorNombre: string; supervisorCc: string;
  // Fechas
  fechaInicio: string; plazoCorto: string; fechaFinal: string;
  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: ActaState = {
  contratante: '', identTributaria: '', tipologia: '', contratista: '',
  representanteLegal: '', representanteCc: '',
  contratistaCc: '',
  direccion: '', celular: '', correo: '',
  objeto: '',
  valor: '', formaPago: '',
  plazo: '',
  aprobacionGarantias: '',
  ciudadReunion: '',
  supervisorNombre: '', supervisorCc: '',
  fechaInicio: '', plazoCorto: '', fechaFinal: '',
  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['en_acta_inicio', 'finalizado'];

export default function ActaInicioPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<ActaState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const set = <K extends keyof ActaState>(k: K, v: ActaState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const d = data.data ?? {};
        const saved = (d.actaInicio ?? {}) as Partial<ActaState>;
        const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
        // Prellenado: primero lo guardado del acta; luego el contrato (solicitud) y la designación.
        setF({
          ...EMPTY,
          ...saved,
          contratante: saved.contratante || d.empresa || '',
          tipologia: saved.tipologia || getTipo(d.tipoContrato)?.nombre || '',
          contratista: saved.contratista || d.contratista || '',
          objeto: saved.objeto || d.alcanceServicio || d.objetoProyecto || '',
          valor: saved.valor || d.honorarios || '',
          formaPago: saved.formaPago || d.formaPago || '',
          plazo: saved.plazo || d.duracion || '',
          plazoCorto: saved.plazoCorto || d.duracion || '',
          // De la designación de supervisor (mismo contrato):
          identTributaria: saved.identTributaria || des.contratanteNit || '',
          representanteLegal: saved.representanteLegal || des.funcionarioNombre || '',
          contratistaCc: saved.contratistaCc || des.contratistaCc || '',
          supervisorNombre: saved.supervisorNombre || des.supervisorNombre || '',
          aprobacionGarantias: saved.aprobacionGarantias || des.aprobacionGarantias || '',
          ciudadReunion: saved.ciudadReunion || des.supervisorCiudad || '',
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el acta de inicio');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'actaInicio', f);
      toast.success('Acta de inicio guardada');
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
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Acta de Inicio</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Formato GJ-006-F · Solicitud N.º {solicitudId}</p>
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
            <p className="text-[hsl(var(--canalco-neutral-700))]">El acta de inicio aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita en la etapa «Acta de inicio» (después de la designación de supervisor).</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[150px_1fr_190px] border-b border-[#0a2a52]">
              <div className="flex flex-col items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
                <span className="text-[11px] font-bold mt-1">{f.identTributaria || '—'}</span>
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[12px] border-r border-[#0a2a52]">
                ACTA DE INICIO PARA CONTRATO POR PRESTACIÓN DE SERVICIOS, ALQUILER O SUMINISTRO
              </div>
              <div className="grid grid-cols-[auto_1fr] text-[11px] content-start">
                <CodeCell label="CÓDIGO:" value="GJ-006-F" />
                <CodeCell label="FECHA:" value="27/04/2023" />
                <CodeCell label="VERSIÓN:" value="1" last />
              </div>
            </div>

            {/* Título del acta. Se arma con la tabla de abajo mientras nadie lo toque. */}
            <div className="text-center font-bold px-6 py-4 leading-snug border-b border-[#0a2a52] text-[12px]">
              <TextoEd
                k="titulo"
                plantilla={
                  'ACTA DE INICIO\n' +
                  `CONTRATO ${(f.tipologia || 'prestación de servicios').toUpperCase()}\n` +
                  `SUSCRITO ENTRE ${(f.contratante || '…').toUpperCase()} y ${(f.contratista || '…').toUpperCase()}`
                }
                className="text-center"
              />
            </div>

            {/* Tabla de datos del contrato */}
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Row label="ENTIDAD CONTRATANTE" value={f.contratante} onChange={(v) => set('contratante', v)} />
                <Row label="IDENTIFICACIÓN TRIBUTARIA" value={f.identTributaria} onChange={(v) => set('identTributaria', v)} placeholder="NIT" />
                <Row label="REPRESENTANTE LEGAL" value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} />
                <Row label="IDENTIFICACIÓN" value={f.representanteCc} onChange={(v) => set('representanteCc', v)} placeholder="C.C. 000.000.000 de ..." />
                <Row label="CONTRATISTA" value={f.contratista} onChange={(v) => set('contratista', v)} />
                <Row label="IDENTIFICACIÓN" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="C.C 000.000.000 expedida en ..." />
                <Row label="DIRECCIÓN DEL DOMICILIO" value={f.direccion} onChange={(v) => set('direccion', v)} />
                <Row label="CELULAR" value={f.celular} onChange={(v) => set('celular', v)} />
                <Row label="CORREO ELECTRÓNICO" value={f.correo} onChange={(v) => set('correo', v)} />
                <Row label="OBJETO DEL CONTRATO" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                <Row label="VALOR TOTAL DEL CONTRATO Y FORMA DE PAGO" value={f.valor} onChange={(v) => set('valor', v)} area
                  extra={<Sub label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} />} />
                <Row label="PLAZO DE EJECUCIÓN" value={f.plazo} onChange={(v) => set('plazo', v)} area />
                <Row label="APROBACIÓN DE GARANTÍAS" value={f.aprobacionGarantias} onChange={(v) => set('aprobacionGarantias', v)} area
                  placeholder="Garantía de Cumplimiento No. ..., Póliza de RCE No. ..., expedidas el ..." />
              </tbody>
            </table>

            {/* Reunión de inicio */}
            <div className="px-6 py-4 leading-relaxed text-[12.5px] border-t border-[#0a2a52]">
              <TextoEd
                k="reunion"
                plantilla={`En la ciudad de ${tx(f.ciudadReunion)}, se reunió el señor ${tx(f.supervisorNombre)}, identificado con número de cédula No. ${tx(f.supervisorCc)}, en calidad de SUPERVISOR por parte de EL CONTRATANTE y el señor ${tx(f.contratista)} identificado con número de cédula No. ${tx(f.contratistaCc)}, en calidad de CONTRATISTA, con el propósito de iniciar la ejecución del contrato.`}
              />
            </div>

            {/* Fechas */}
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                  <th className="border border-[#0a2a52] px-2 py-1">FECHA DE INICIO</th>
                  <th className="border border-[#0a2a52] px-2 py-1">PLAZO</th>
                  <th className="border border-[#0a2a52] px-2 py-1">FECHA FINAL</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-center font-semibold">
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} placeholder="dd/mm/aaaa"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.plazoCorto} onChange={(e) => set('plazoCorto', e.target.value)} placeholder="Quince (15) días"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.fechaFinal} onChange={(e) => set('fechaFinal', e.target.value)} placeholder="dd/mm/aaaa"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Firmas */}
            <div className="grid grid-cols-2 gap-8 px-6 pt-16 pb-4">
              <Firma>
                <FLine value={f.supervisorNombre} onChange={(v) => set('supervisorNombre', v)} placeholder="NOMBRE DEL SUPERVISOR" bold />
                <FLine value={f.supervisorCc} onChange={(v) => set('supervisorCc', v)} placeholder="Cédula. No. 00.000.000" />
                <div className="font-bold">El Supervisor</div>
              </Firma>
              <Firma>
                <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="NOMBRE DEL CONTRATISTA" bold />
                <FLine value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="C.C. 0.000.000" />
                <div className="font-bold">El Contratista</div>
              </Firma>
            </div>

          </div>
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta acta. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function Row({ label, value, onChange, area, placeholder, extra }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string; extra?: React.ReactNode;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[34%]">{label}</td>
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

function Sub({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 pt-1 border-t border-dotted border-[hsl(var(--canalco-neutral-300))]">
      <span className="font-semibold">{label}: </span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        placeholder="Detalle de la forma de pago"
        className="w-full bg-transparent outline-none resize-y text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
    </div>
  );
}

/** Marca de dato faltante en el texto: mejor un vacío visible que un hueco. */
const tx = (v: string) => (v?.trim() ? v : '…');

function Firma({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-t border-[#0a2a52] pt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function FLine({ value, onChange, placeholder, bold }: { value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')}
    />
  );
}
