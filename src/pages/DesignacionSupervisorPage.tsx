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
 * Formato GJ-003-F · "Acta de designación y aceptación de supervisión contractual"
 * (fase 2 de G. jurídica). La diligencia Jurídica.
 *
 * No es una carta a un tercero: es un acta en la que quien firma —la Representante
 * Legal de la contratante— deja constancia de que ejercerá **ella misma** la
 * supervisión y la acepta. Por eso no hay destinatario ni dos firmas: designante y
 * supervisora son la misma persona, y el propio texto del formato lo dice («la
 * suscrita actúa simultáneamente como Representante Legal de LA CONTRATANTE y como
 * supervisora»). Si alguna vez se designara a un tercero, ese párrafo y el de
 * aceptación necesitarían otra redacción, no solo otro nombre.
 *
 * Ruta: `.../juridica/:id/designacion-supervisor`. Se guarda en data.designacionSupervisor.
 */

interface DesignacionState {
  lugarFecha: string;
  /** Quien firma: representante legal que además ejerce la supervisión. */
  firmanteNombre: string;
  firmanteCc: string;
  firmanteCcLugar: string;
  firmanteCargo: string;
  /** Cláusula del contrato que asigna la supervisión (en el modelo, la sexta). */
  clausula: string;
  // Tabla de información del contrato
  tipologia: string;
  contratante: string; contratanteNit: string;
  contratista: string; contratistaNit: string;
  objeto: string;
  valor: string;
  formaPago: string;
  plazo: string;
  inicio: string;
  terminacion: string;
  /** Lugar y fecha de suscripción del acta, al pie. */
  suscripcion: string;
  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: DesignacionState = {
  lugarFecha: '',
  firmanteNombre: '', firmanteCc: '', firmanteCcLugar: '',
  firmanteCargo: 'Gerente y Representante Legal',
  clausula: 'sexta',
  tipologia: '',
  contratante: '', contratanteNit: '',
  contratista: '', contratistaNit: '',
  objeto: '',
  valor: '',
  formaPago: '',
  plazo: '',
  inicio: '',
  terminacion: '',
  suscripcion: '',
  textos: {},
};

/**
 * Las ocho responsabilidades de la supervisión, como plantilla. Cada una se puede
 * reescribir por separado —van con su propia clave en `textos`— porque en un contrato
 * concreto suele cambiar una sola.
 */
const RESPONSABILIDADES = [
  'Verificar el cumplimiento oportuno y adecuado del objeto contractual, especialmente el acompañamiento brindado por LA CONTRATISTA a la supervisión de los proyectos de infraestructura de alumbrado público, así como de las demás obligaciones y resultados pactados.',
  'Solicitar a LA CONTRATISTA los informes, aclaraciones, explicaciones y soportes que resulten necesarios para comprobar el desarrollo de la ejecución contractual.',
  'Revisar y aprobar, cuando corresponda, las facturas y los demás soportes presentados por LA CONTRATISTA, sin perjuicio de las verificaciones contables, financieras, tributarias y de tesorería que deban efectuar las áreas competentes de la empresa.',
  'Verificar, antes del inicio de la ejecución, que las garantías contractuales se encuentren expedidas, presentadas y aprobadas, y controlar su ampliación, prórroga o restablecimiento cuando haya lugar.',
  'Dejar constancia escrita de las reuniones, observaciones, requerimientos, aprobaciones, novedades y demás actuaciones relevantes de la supervisión dentro del expediente contractual.',
  'Advertir oportunamente cualquier hecho que pueda afectar la correcta ejecución del contrato y promover las medidas contractuales o administrativas internas que correspondan.',
  'Velar por el manejo reservado de la información y por el cumplimiento de las obligaciones relacionadas con confidencialidad, propiedad intelectual y tratamiento de datos personales.',
  'Abstenerse de autorizar modificaciones al objeto, valor, plazo o demás condiciones del contrato sin el documento contractual suscrito por quienes se encuentren legalmente facultados.',
];

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
        // `viejo` son los campos del formato anterior (la carta a un tercero). Se leen
        // para que las designaciones ya guardadas no aparezcan en blanco: el nombre de
        // quien designaba pasa a ser el del firmante, y la cédula del contratista, su
        // identificación. Se escriben con las claves nuevas al guardar.
        const saved = (d.designacionSupervisor ?? {}) as Partial<DesignacionState>;
        const viejo = (d.designacionSupervisor ?? {}) as Record<string, string>;
        // Prellenado desde la solicitud/contrato cuando el documento aún no tiene el dato.
        setF({
          ...EMPTY,
          ...saved,
          firmanteNombre: saved.firmanteNombre || viejo.funcionarioNombre || '',
          tipologia: saved.tipologia || getTipo(d.tipoContrato)?.nombre || '',
          contratante: saved.contratante || d.empresa || '',
          contratanteNit: saved.contratanteNit || viejo.funcionarioNit || '',
          contratista: saved.contratista || d.contratista || '',
          contratistaNit: saved.contratistaNit || viejo.contratistaCc || '',
          objeto: saved.objeto || d.alcanceServicio || d.objetoProyecto || '',
          valor: saved.valor || d.honorarios || '',
          formaPago: saved.formaPago || d.formaPago || '',
          plazo: saved.plazo || d.duracion || '',
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la designación');
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
      await gestionConocimientoService.saveDocumento(solicitudId!, 'designacionSupervisor', f);
      toast.success('Designación guardada');
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
            <h1 className="text-lg font-bold text-[#16162b]">Designación de Supervisor</h1>
            <p className="text-xs text-[#4a4a63]">Formato GJ-003-F · Solicitud N.º {solicitudId}</p>
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
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="designacion-supervisor" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: se designa al supervisor acá. */}
        <AccionesFlujo
          sol={sol} documento="designacion-supervisor" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
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
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_150px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[14px] border-r border-[#0a2a52]">
                DESIGNACIÓN Y ACEPTACIÓN DE SUPERVISIÓN
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
              <Line value={f.lugarFecha} onChange={(v) => set('lugarFecha', v)} placeholder="Santiago de Cali, 00 de mes de 0000." />

              <h2 className="text-center font-bold text-[13px] pt-2">
                ACTA DE DESIGNACIÓN Y ACEPTACIÓN DE SUPERVISIÓN CONTRACTUAL
              </h2>

              {/* Los bloques que citan datos se arman con la tabla de abajo mientras nadie
                  los toque; al editarlos quedan como los dejó Jurídica. */}
              <FieldRow label="Referencia:">
                <TextoEd
                  k="referencia"
                  plantilla={`Contrato de ${lower(f.tipologia) || 'prestación de servicios'} suscrito entre ${textOrDash(f.contratante)} y ${textOrDash(f.contratista)}.`}
                />
              </FieldRow>
              <FieldRow label="Asunto:">
                <TextoEd k="asunto" plantilla="Designación y aceptación de la supervisión contractual." />
              </FieldRow>

              {/* La constancia: quien firma asume la supervisión. Se arma con los datos
                  del firmante y de la contratante, y se puede reescribir entera. */}
              <TextoEd
                k="constancia"
                plantilla={`${textOrDash(f.firmanteNombre).toUpperCase()}, identificada con cédula de ciudadanía No. ${textOrDash(f.firmanteCc)} de ${textOrDash(f.firmanteCcLugar)}, actuando en calidad de ${lower(f.firmanteCargo) || 'gerente y representante legal'} de ${textOrDash(f.contratante)}, y en ejercicio de sus facultades legales, estatutarias y contractuales, deja constancia de que, de conformidad con la cláusula ${f.clausula || 'sexta'} del contrato de referencia, ejercerá directamente la supervisión del contrato y acepta las funciones y responsabilidades asociadas a dicha labor.`}
              />

              <TextoEd k="preTabla" plantilla="La información principal del contrato objeto de supervisión es la siguiente:" />

              {/* Tabla de información del contrato */}
              <table className="w-full border-collapse text-[12px] my-2">
                <tbody>
                  <InfoRow label="Tipología contractual" value={f.tipologia} onChange={(v) => set('tipologia', v)} />
                  <InfoRow label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                  <InfoRow label="Identificación/NIT" value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} placeholder="NIT 000.000.000-0" />
                  <InfoRow label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
                  <InfoRow label="Identificación/NIT" value={f.contratistaNit} onChange={(v) => set('contratistaNit', v)} placeholder="NIT 000.000.000-0" />
                  <InfoRow label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                  {/* El valor va en una sola celda, como en el formato: el desglose del
                      IVA se escribe como texto corrido y no en tres campos. */}
                  <InfoRow label="Valor total del contrato" value={f.valor} onChange={(v) => set('valor', v)} area
                    placeholder="Valor antes de IVA: $0 M/CTE. IVA del 19%: $0 M/CTE. Valor total incluido IVA: $0 M/CTE." />
                  <InfoRow label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} area
                    placeholder="0 (0) pagos mensuales vencidos, cada uno por $0 M/CTE, más IVA del 19%…" />
                  <InfoRow label="Plazo" value={f.plazo} onChange={(v) => set('plazo', v)} area
                    placeholder="0 (0) meses, comprendidos entre el 00 de mes y el 00 de mes de 0000." />
                  <InfoRow label="Inicio" value={f.inicio} onChange={(v) => set('inicio', v)} area
                    placeholder="00 de mes de 0000, previa expedición, presentación y aprobación de las garantías contractuales exigidas." />
                  <InfoRow label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} />
                </tbody>
              </table>

              {/* Alcance y responsabilidades */}
              <h3 className="font-bold pt-2">ALCANCE Y RESPONSABILIDADES DE LA SUPERVISIÓN</h3>
              {/* Clave nueva y no `alcance`: esa la usaba el formato anterior con otro
                  texto, y una designación vieja que la hubiera reescrito heredaría aquí
                  el párrafo equivocado. */}
              <TextoEd k="alcanceIntro" plantilla="La supervisión comprenderá el seguimiento integral al cumplimiento de las obligaciones a cargo de LA CONTRATISTA, de acuerdo con el objeto, alcance, plazo, valor y demás condiciones previstas en el contrato. Para el efecto, la supervisora deberá:" />

              <ol className="list-decimal pl-6 space-y-1.5">
                {RESPONSABILIDADES.map((texto, i) => (
                  <li key={i} className="text-justify">
                    <TextoEd k={`resp${i + 1}`} plantilla={texto} />
                  </li>
                ))}
              </ol>

              <TextoEd k="trazabilidad" plantilla="Teniendo en cuenta que la suscrita actúa simultáneamente como Representante Legal de LA CONTRATANTE y como supervisora, todas las decisiones, aprobaciones, observaciones y requerimientos propios de la supervisión deberán quedar documentados por escrito en el expediente contractual, con el fin de garantizar su trazabilidad." />

              {/* Aceptación */}
              <h3 className="font-bold pt-2">ACEPTACIÓN</h3>
              <TextoEd
                k="aceptacion"
                plantilla={`En mi calidad de ${lower(f.firmanteCargo) || 'gerente y representante legal'} de ${textOrDash(f.contratante)}, manifiesto que conozco y acepto la designación aquí consignada y me comprometo a ejercer directamente la supervisión del contrato con diligencia, objetividad y sujeción a sus estipulaciones.`}
              />

              <div className="pt-2">
                <span>En constancia, se suscribe en </span>
                <Line value={f.suscripcion} onChange={(v) => set('suscripcion', v)} placeholder="Santiago de Cali el 00 (cero) de mes de 0000." />
              </div>

              {/* Una sola firma: designante y supervisora son la misma persona, y la
                  línea de calidad lo deja escrito en el papel. */}
              <div className="pt-12 max-w-[60%]">
                <Firma titulo="">
                  <Line value={f.firmanteNombre} onChange={(v) => set('firmanteNombre', v)} placeholder="NOMBRE DE QUIEN FIRMA" bold />
                  <Line value={f.firmanteCargo} onChange={(v) => set('firmanteCargo', v)} placeholder="Gerente y Representante Legal" />
                  <Line value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="EMPRESA CONTRATANTE" />
                  <TextoEd k="calidad" plantilla="Contratante y supervisora del contrato" />
                  <Line value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} placeholder="NIT 000.000.000-0" />
                </Firma>
              </div>

              <div className="pt-6">
                <TextoEd k="anexo" plantilla="Anexo: copia del contrato objeto de supervisión." />
              </div>

            </div>
          </div>

          <PieElaboracion />
          </TextosDocumento>
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="font-bold whitespace-nowrap">{label}</span>
      <span className="flex-grow min-w-0">{children}</span>
    </div>
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

function Firma({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-t border-[#0a2a52] pt-1 font-bold text-[11px]">{titulo}</div>
      <div className="space-y-0.5 mt-1">{children}</div>
    </div>
  );
}
