import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';

/**
 * Acta de revisión y aprobación de garantías contractuales, plantilla 2026 (el formato
 * «11 Acta Revision Aprobacion Garantias»). La levanta Jurídica al revisar las pólizas.
 *
 * Va **después de la Verificación de garantías** y no dentro de ella: la verificación es
 * el papel de trabajo —los ítems Sí/No y la matriz de riesgo, cómo se llegó a la
 * conclusión—; el acta es la conclusión ya firmada. La lista de chequeo también los pide
 * por separado: «Pólizas» y «Aprobación de pólizas» son dos filas.
 *
 * No es una etapa del flujo: se levanta en el mismo momento en que se verifica, así que se
 * habilita en los mismos estados y no mueve la máquina de estados.
 *
 * Frente a la versión anterior el acta se enderezó: antes era una lista de bloques, uno por
 * garantía, cada uno con su aseguradora y su cuadro. La plantilla 2026 trae **una póliza
 * por acta** y, debajo, la tabla de sus amparos —cumplimiento, calidad, salarios, buen
 * manejo, RCE—, que es como se emiten de verdad: una póliza de cumplimiento ampara varios
 * riesgos. Un contrato con dos pólizas separadas lleva dos actas.
 *
 * Y añade lo que antes no se dejaba escrito: la verificación de autenticidad de la póliza,
 * las validaciones previas y la decisión motivada.
 *
 * Ruta: `.../juridica/:id/aprobacion-garantias`. Se guarda en data.aprobacionGarantias.
 */

/** Un renglón de la tabla de amparos: lo exigido contra lo acreditado. */
interface FilaAmparo {
  amparo: string;
  exigencia: string;
  valor: string;
  vigenciaExigida: string;
  vigenciaAcreditada: string;
  cumple: string;
  observaciones: string;
}

interface AprobacionState {
  /* ── Referencia del contrato ── */
  contrato: string;
  contratante: string;
  contratista: string;
  objeto: string;
  valorContractual: string;
  plazo: string;
  fechaRevision: string;

  /* ── 1. Datos de la póliza o garantía ── */
  aseguradora: string;
  numeroPoliza: string;
  tipoPoliza: string;
  tomador: string;
  asegurado: string;
  fechaExpedicion: string;
  autenticidad: string;

  /* ── 2. Verificación de amparos ── */
  amparos: FilaAmparo[];

  /* ── 3. Validaciones previas ── */
  vCoherencia: string;
  vPartes: string;
  vCuantias: string;
  vAnexos: string;
  vAsesor: string;
  vPendientes: string;

  /* ── 4. Decisión ── */
  decisionObservaciones: string;

  /** Quién firma el acta. La aprueba la Dirección Jurídica. */
  firmanteNombre: string;
  firmanteCargo: string;
  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/** Los seis amparos que la plantilla deja listos. El último es el hueco para otro. */
const AMPAROS_DEL_FORMATO = [
  'Cumplimiento',
  'Calidad del servicio / obra / bienes',
  'Salarios, prestaciones e indemnizaciones laborales',
  'Buen manejo / devolución de anticipo',
  'Responsabilidad civil extracontractual',
  '[OTRO AMPARO]',
];

const filaAmparo = (amparo: string): FilaAmparo => ({
  amparo,
  exigencia: '[PORCENTAJE / CONDICIÓN]',
  valor: '[$ VALOR]',
  vigenciaExigida: '[DESDE - HASTA]',
  vigenciaAcreditada: '[DESDE - HASTA]',
  cumple: '[SÍ / NO / N.A.]',
  observaciones: '[OBSERVACIÓN]',
});

/**
 * El acta en blanco, con el texto del formato como **valor** y no como placeholder: el
 * placeholder se ve en pantalla pero no se imprime, y el formato vacío tiene que poder
 * imprimirse para diligenciarlo a mano.
 *
 * Los amparos vienen con su exigencia y su vigencia en corchetes, sin porcentajes ni
 * cuantías: la propia plantilla lo prohíbe en su nota de control interno, porque un valor
 * por defecto se firma sin mirar si es el que el contrato exigía.
 */
const EMPTY: AprobacionState = {
  contrato: '[TIPO Y NÚMERO]',
  contratante: 'CANALES Y CONTACTOS S.A.S. / [OTRA ENTIDAD]',
  contratista: '[NOMBRE / RAZÓN SOCIAL - NIT/CC]',
  objeto: '[OBJETO CONTRACTUAL]',
  valorContractual: '[$ VALOR]',
  plazo: '[PLAZO / FECHA INICIO - FECHA TERMINACIÓN]',
  fechaRevision: '[DÍA/MES/AÑO]',

  aseguradora: '[RAZÓN SOCIAL]',
  numeroPoliza: '[NÚMERO]',
  tipoPoliza: '[CUMPLIMIENTO / RCE / OTRA]',
  tomador: '[NOMBRE - NIT/CC]',
  asegurado: '[NOMBRE - NIT]',
  fechaExpedicion: '[FECHA]',
  autenticidad: '[MEDIO / FECHA / RESULTADO / SOPORTE]',

  amparos: AMPAROS_DEL_FORMATO.map(filaAmparo),

  vCoherencia: '[CUMPLE / NO CUMPLE]',
  vPartes: '[CUMPLE / NO CUMPLE]',
  vCuantias: '[CUMPLE / NO CUMPLE]',
  vAnexos: '[CUMPLE / NO CUMPLE / N.A.]',
  vAsesor: '[NOMBRE / FECHA / SOPORTE / CUMPLE]',
  vPendientes: '[NINGUNA / DETALLAR]',

  decisionObservaciones: '[DETALLAR O INDICAR “NINGUNA”]',

  firmanteNombre: 'MARTA CECILIA RODRÍGUEZ HERRERA',
  firmanteCargo: 'Directora Jurídica',
  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

// Los mismos estados que la verificación de garantías: el acta es su conclusión y se
// levanta en la misma sesión. Antes del pago de la póliza no hay nada que aprobar.
const HABILITADO = ['en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function AprobacionGarantiasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<AprobacionState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const saved = (data.data?.aprobacionGarantias ?? {}) as Partial<AprobacionState>;
        setF({
          ...EMPTY,
          ...saved,
          // Un acta guardada sin amparos dejaría la tabla en blanco y sin forma de volver
          // al formato: se cae a la plantilla.
          amparos: saved.amparos?.length ? saved.amparos : EMPTY.amparos,
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el acta de aprobación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const set = <K extends keyof AprobacionState>(k: K, v: AprobacionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const setAmparo = <K extends keyof FilaAmparo>(i: number, k: K, v: FilaAmparo[K]) =>
    setF((p) => ({ ...p, amparos: p.amparos.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'aprobacionGarantias', f);
      toast.success('Acta de aprobación guardada');
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
          @page { size: Letter portrait; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
          /* Una sección del acta no se parte entre dos hojas si cabe entera. */
          .bloque { break-inside: avoid; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Acta de revisión y aprobación de garantías</h1>
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {solicitudId} · Plantilla 2026</p>
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
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="aprobacion-garantias" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Sin `AccionesFlujo`: el acta no es una etapa. La transición de la etapa
            —«Garantías verificadas · designar supervisor»— vive en la verificación. */}
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El acta de aprobación aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">
              Se habilita junto con la verificación de garantías, cuando la póliza está pagada.
            </p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
            <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-8 py-7 space-y-4">

              <EncabezadoFormato
                codigo="GJ-008-F"
                titulo={<h1 className="font-bold text-[13px] leading-snug">ACTA DE REVISIÓN Y APROBACIÓN DE GARANTÍAS CONTRACTUALES</h1>}
              />

              {/* Referencia del contrato */}
              <table className="w-full border-collapse text-[12px] bloque">
                <tbody>
                  <Fila label="Contrato / negocio jurídico" value={f.contrato} onChange={(v) => set('contrato', v)} />
                  <Fila label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                  <Fila label="Contratista / tomador" value={f.contratista} onChange={(v) => set('contratista', v)} />
                  <Fila label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                  <Fila label="Valor contractual" value={f.valorContractual} onChange={(v) => set('valorContractual', v)} />
                  <Fila label="Plazo" value={f.plazo} onChange={(v) => set('plazo', v)} />
                  <Fila label="Fecha de revisión" value={f.fechaRevision} onChange={(v) => set('fechaRevision', v)} />
                </tbody>
              </table>

              {/* Alcance de la revisión */}
              <TextoEd
                k="a.alcance"
                plantilla={'En la fecha indicada se efectúa la revisión documental de las garantías exigidas en el '
                  + 'contrato de referencia, con el fin de verificar su correspondencia con las condiciones '
                  + 'contractuales, los amparos requeridos, las cuantías, las vigencias, los asegurados/beneficiarios '
                  + 'y la identificación de las partes. La aprobación contenida en esta acta se limita a dicha '
                  + 'verificación documental y contractual.'}
                className="text-justify leading-relaxed"
              />

              {/* ── 1 ── */}
              <h2 className="text-center font-bold pt-1">1. DATOS DE LA PÓLIZA O GARANTÍA</h2>
              <table className="w-full border-collapse text-[12px] bloque">
                <tbody>
                  <Fila label="Aseguradora / garante" value={f.aseguradora} onChange={(v) => set('aseguradora', v)} />
                  <Fila label="No. póliza / garantía" value={f.numeroPoliza} onChange={(v) => set('numeroPoliza', v)} />
                  <Fila label="Tipo de póliza" value={f.tipoPoliza} onChange={(v) => set('tipoPoliza', v)} />
                  <Fila label="Tomador" value={f.tomador} onChange={(v) => set('tomador', v)} />
                  <Fila label="Asegurado / beneficiario" value={f.asegurado} onChange={(v) => set('asegurado', v)} />
                  <Fila label="Fecha de expedición" value={f.fechaExpedicion} onChange={(v) => set('fechaExpedicion', v)} />
                  <Fila label="Verificación de autenticidad" value={f.autenticidad} onChange={(v) => set('autenticidad', v)} />
                </tbody>
              </table>

              {/* ── 2 ── */}
              <h2 className="text-center font-bold pt-1">2. VERIFICACIÓN DE AMPAROS</h2>
              <div className="bloque">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    {/* Azul #D9E2F3 con letra negra: el sombreado que trae la plantilla. */}
                    <tr className="bg-[#d9e2f3] text-center font-bold">
                      <th className={TH}>Amparo</th>
                      <th className={TH}>Exigencia contractual</th>
                      <th className={TH}>Valor asegurado</th>
                      <th className={TH}>Vigencia exigida</th>
                      <th className={TH}>Vigencia acreditada</th>
                      <th className={TH}>Cumple</th>
                      <th className={TH}>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.amparos.map((a, i) => (
                      <tr key={i}>
                        <Celda value={a.amparo} onChange={(v) => setAmparo(i, 'amparo', v)} />
                        <Celda value={a.exigencia} onChange={(v) => setAmparo(i, 'exigencia', v)} />
                        <Celda value={a.valor} onChange={(v) => setAmparo(i, 'valor', v)} />
                        <Celda value={a.vigenciaExigida} onChange={(v) => setAmparo(i, 'vigenciaExigida', v)} />
                        <Celda value={a.vigenciaAcreditada} onChange={(v) => setAmparo(i, 'vigenciaAcreditada', v)} />
                        <Celda value={a.cumple} onChange={(v) => setAmparo(i, 'cumple', v)} />
                        <td className={TD}>
                          <div className="flex gap-1 items-start">
                            <textarea
                              value={a.observaciones}
                              onChange={(e) => setAmparo(i, 'observaciones', e.target.value)}
                              rows={2}
                              className={CAMPO + ' resize-y leading-snug'}
                            />
                            {editable && (
                              <button
                                type="button"
                                onClick={() => set('amparos', f.amparos.filter((_, j) => j !== i))}
                                title="Quitar este amparo"
                                className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editable && (
                  <button
                    type="button"
                    onClick={() => set('amparos', [...f.amparos, filaAmparo('')])}
                    className="no-print flex items-center gap-1 mt-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar amparo
                  </button>
                )}
              </div>

              {/* La plantilla lo dice en mayúscula sostenida: no debe aparecer en el
                  documento final. Va `no-print`, que es la única forma de que se cumpla
                  sola y no dependa de que alguien se acuerde de borrarla. */}
              <p className="no-print border border-[#0a2a52] bg-[#fff2cc] px-3 py-2 text-[11px] font-bold leading-snug">
                CONTROL INTERNO DE PARAMETRIZACIÓN - NO DEBE APARECER EN EL DOCUMENTO FINAL: habilitar
                únicamente los amparos exigidos en el contrato concreto. No fijar porcentajes, cuantías ni
                vigencias por defecto cuando no estén expresamente definidos en el contrato o en la
                instrucción aprobada para el caso.
              </p>

              {/* ── 3 ── */}
              <h2 className="text-center font-bold pt-1">3. VALIDACIONES PREVIAS</h2>
              <table className="w-full border-collapse text-[12px] bloque">
                <tbody>
                  <Fila label="Coherencia entre contrato y póliza" value={f.vCoherencia} onChange={(v) => set('vCoherencia', v)} />
                  <Fila label="Datos de contratante, contratista, tomador y asegurado" value={f.vPartes} onChange={(v) => set('vPartes', v)} />
                  <Fila label="Cuantías y vigencias" value={f.vCuantias} onChange={(v) => set('vCuantias', v)} />
                  <Fila label="Anexos / modificaciones / prórrogas reflejadas en la póliza" value={f.vAnexos} onChange={(v) => set('vAnexos', v)} />
                  <Fila label="Validación del asesor de seguros" value={f.vAsesor} onChange={(v) => set('vAsesor', v)} />
                  <Fila label="Observaciones pendientes" value={f.vPendientes} onChange={(v) => set('vPendientes', v)} area />
                </tbody>
              </table>

              {/* ── 4 ── */}
              <h2 className="text-center font-bold pt-1">4. DECISIÓN</h2>
              <TextoEd
                k="a.decision"
                plantilla={'Con fundamento en la revisión anterior, se deja constancia de que las garantías '
                  + '[CUMPLEN / NO CUMPLEN] con las condiciones exigidas para el contrato de referencia. En '
                  + 'consecuencia, [SE APRUEBAN / NO SE APRUEBAN] para efectos contractuales. Si el inicio de la '
                  + 'ejecución se encuentra condicionado a la aprobación de garantías, no deberá suscribirse el '
                  + 'acta de inicio ni autorizarse la ejecución hasta que la aprobación se encuentre '
                  + 'perfeccionada y documentada.'}
                className="text-justify leading-relaxed"
              />
              {/* Renglón corrido, sin negrita: en la plantilla es un párrafo más de la
                  decisión, no un rótulo de ficha. */}
              <p className="leading-relaxed">
                Observaciones / condiciones de la aprobación:{' '}
                <input
                  value={f.decisionObservaciones}
                  onChange={(e) => set('decisionObservaciones', e.target.value)}
                  className="w-[55%] bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
                />
              </p>

              {/* Firma */}
              <div className="pt-12 text-[12px] bloque">
                <div className="w-[62%] border-t border-black pt-1">
                  <input
                    value={f.firmanteNombre}
                    onChange={(e) => set('firmanteNombre', e.target.value)}
                    className="w-full bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                  />
                  <input
                    value={f.firmanteCargo}
                    onChange={(e) => set('firmanteCargo', e.target.value)}
                    className="w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
                  />
                </div>
              </div>

              <PieMembrete />
            </div>
            {/* La plantilla pide «Revisó», a secas: quien aprueba ya firmó arriba. */}
            <PieElaboracion etiqueta="Revisó" />
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

const TH = 'border border-[#0a2a52] px-1.5 py-1 align-middle';
const TD = 'border border-[#0a2a52] px-1.5 py-1 align-top';
const CAMPO = 'w-full bg-transparent outline-none text-[10.5px] disabled:opacity-100 disabled:text-black';

/** Una celda de la tabla de amparos. */
function Celda({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className={TD}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        className={CAMPO + ' resize-y leading-snug'} />
    </td>
  );
}

/**
 * Una fila de las fichas: etiqueta a la izquierda, dato a la derecha.
 *
 * La columna de etiquetas va sombreada en #E7E6E6, que es como la trae la plantilla en sus
 * tres tablas —la de referencia, la de la póliza y la de validaciones—.
 */
function Fila({ label, value, onChange, area, filas = 2 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  filas?: number;
}) {
  const comun = 'w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black ';
  return (
    <tr>
      <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[40%] font-bold">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={filas}
            className={comun + 'resize-y leading-snug'} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} className={comun} />
        )}
      </td>
    </tr>
  );
}
