import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';

/**
 * Formato GJ-006-F · "Acta de inicio para contrato por prestación de servicios,
 * alquiler o suministro" (fase 2 de G. jurídica). La diligencia Jurídica.
 * Reutiliza datos del contrato (solicitud) y de la designación de supervisor, y el texto
 * se puede reescribir. Ruta: `.../juridica/:id/acta-inicio`. Se guarda en data.actaInicio.
 */

interface ActaState {
  // Encabezado / título
  contratante: string; identTributaria: string; tipologia: string; contratista: string;
  /**
   * Representante legal de la contratante. No hay un campo aparte para el supervisor
   * porque el formato no lo tiene: en la tabla figura como representante legal y al pie
   * firma como «La Supervisora». Son la misma persona y con dos campos podrían discrepar.
   */
  representanteLegal: string; representanteCc: string;
  /** La contratista puede ser una empresa: identificación propia y representante legal. */
  contratistaCc: string;
  contratistaRepLegal: string; contratistaRepCc: string;
  direccion: string; celular: string; correo: string;
  objeto: string;
  valor: string; formaPago: string;
  plazo: string;
  aprobacionGarantias: string;
  inicio: string; terminacion: string;
  /** Ciudad de la reunión de inicio. Solo aparece dentro del párrafo de apertura. */
  ciudadReunion: string;
  // Fechas
  fechaInicio: string; plazoCorto: string; fechaFinal: string;
  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: ActaState = {
  contratante: '', identTributaria: '', tipologia: '', contratista: '',
  representanteLegal: '', representanteCc: '',
  contratistaCc: '',
  contratistaRepLegal: '', contratistaRepCc: '',
  direccion: '', celular: '', correo: '',
  objeto: '',
  valor: '', formaPago: '',
  plazo: '',
  aprobacionGarantias: '',
  inicio: '', terminacion: '',
  ciudadReunion: '',
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
        // `viejoSup` son los campos del acta anterior, que tenía supervisor aparte del
        // representante legal. Se leen para que un acta ya guardada no pierda la firma.
        const viejoSup = (d.actaInicio ?? {}) as Record<string, string>;
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
          representanteLegal: saved.representanteLegal || viejoSup.supervisorNombre || des.firmanteNombre || '',
          representanteCc: saved.representanteCc || viejoSup.supervisorCc || des.firmanteCc || '',
          contratistaCc: saved.contratistaCc || des.contratistaNit || '',
          aprobacionGarantias: saved.aprobacionGarantias || des.aprobacionGarantias || '',
          inicio: saved.inicio || des.inicio || '',
          terminacion: saved.terminacion || des.terminacion || '',
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

  /** Devuelve si logró guardar: la acción de la etapa guarda antes de avanzar. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'actaInicio', f);
      toast.success('Acta de inicio guardada');
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
      return false;
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
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Acta de Inicio</h1>
            <p className="text-xs text-[#4a4a63]">Formato GJ-006-F · Solicitud N.º {solicitudId}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
        {/* Los documentos del trámite: se navega entre ellos sin volver a la solicitud. */}
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="acta-inicio" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: se firma el acta y se finaliza acá. */}
        <AccionesFlujo
          sol={sol} documento="acta-inicio" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
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
                  `CONTRATO DE ${(f.tipologia || 'prestación de servicios').toUpperCase()}\n` +
                  // La contratista va primero, como en el formato.
                  `SUSCRITO ENTRE ${tx(f.contratista).toUpperCase()} Y ${tx(f.contratante).toUpperCase()}`
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
                <Row label="IDENTIFICACIÓN" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="NIT 000.000.000-0" />
                <Row label="REPRESENTANTE LEGAL" value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} />
                <Row label="IDENTIFICACIÓN" value={f.contratistaRepCc} onChange={(v) => set('contratistaRepCc', v)} placeholder="C.C. 00.000.000 expedida en ..." />
                <Row label="DIRECCIÓN DEL DOMICILIO" value={f.direccion} onChange={(v) => set('direccion', v)} />
                <Row label="CELULAR" value={f.celular} onChange={(v) => set('celular', v)} />
                <Row label="CORREO ELECTRÓNICO" value={f.correo} onChange={(v) => set('correo', v)} />
                <Row label="OBJETO DEL CONTRATO" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                <Row label="VALOR TOTAL DEL CONTRATO Y FORMA DE PAGO" value={f.valor} onChange={(v) => set('valor', v)} area
                  extra={<Sub label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} />} />
                <Row label="PLAZO DE EJECUCIÓN" value={f.plazo} onChange={(v) => set('plazo', v)} area />
                <Row label="APROBACIÓN DE GARANTÍAS" value={f.aprobacionGarantias} onChange={(v) => set('aprobacionGarantias', v)} area
                  placeholder="Garantía de Cumplimiento No. ..., Póliza de RCE No. ..., aprobadas el ..." />
                {/* En minúscula porque así van en el formato, no por descuido. */}
                <Row label="Inicio" value={f.inicio} onChange={(v) => set('inicio', v)}
                  placeholder="00 de mes de 0000" />
                <Row label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)}
                  placeholder="00 de mes de 0000" />
              </tbody>
            </table>

            {/* Reunión de inicio. Clave nueva y no `reunion`: esa la usaba el formato
                anterior con otra redacción —y otros datos— y un acta que la hubiera
                reescrito heredaría aquí el párrafo equivocado. */}
            <div className="px-6 py-4 leading-relaxed text-[12.5px] border-t border-[#0a2a52]">
              <TextoEd
                k="apertura"
                plantilla={`En ${tx(f.ciudadReunion)}, a los … días del mes de … de dos mil … (…), se reunieron la doctora ${tx(f.representanteLegal).toUpperCase()}, identificada con cédula de ciudadanía No. ${tx(f.representanteCc)}, en calidad de supervisora del contrato por parte de ${tx(f.contratante)}, y la señora ${tx(f.contratistaRepLegal).toUpperCase()}, identificada con cédula de ciudadanía No. ${tx(f.contratistaRepCc)}, actuando como representante legal de ${tx(f.contratista)}, en calidad de contratista. Una vez verificada la expedición, presentación y aprobación de las garantías contractuales exigidas, efectuada el ${tx(f.aprobacionGarantias)}, las partes acuerdan dar inicio a la ejecución del contrato a partir del ${tx(f.inicio)}, de conformidad con el cronograma y las condiciones contractuales pactadas.`}
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

            {/* Firmas. La supervisora es la representante legal de la contratante —el
                formato no tiene fila de supervisor—, y por la contratista firma su
                representante legal, con el nombre de la empresa debajo. */}
            <div className="grid grid-cols-2 gap-8 px-6 pt-16 pb-4">
              <Firma>
                <FLine value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} placeholder="NOMBRE DE LA SUPERVISORA" bold />
                <FLine value={f.representanteCc} onChange={(v) => set('representanteCc', v)} placeholder="Cédula. No. 00.000.000 de ..." />
                <div className="font-bold">La Supervisora</div>
              </Firma>
              <Firma>
                <FLine value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} placeholder="NOMBRE DE QUIEN FIRMA" bold />
                <FLine value={f.contratistaRepCc} onChange={(v) => set('contratistaRepCc', v)} placeholder="C.C. 00.000.000 expedida en ..." />
                <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="NOMBRE DE LA CONTRATISTA" bold />
                <div>Representante Legal</div>
                <div className="font-bold">La Contratista</div>
              </Firma>
            </div>

          </div>
          <PieElaboracion />
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
