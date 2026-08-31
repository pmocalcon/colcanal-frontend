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
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { BloqueControl } from '@/components/juridica/camposDocumento';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';

/**
 * "Designación y aceptación de supervisión contractual" (fase 2 de G. jurídica). La
 * diligencia Jurídica.
 *
 * La Representante Legal designa a quien ejercerá la supervisión del contrato, y esa
 * persona acepta. Por eso el acta cierra con **dos firmas**: quien designa y quien acepta.
 *
 * Puede ocurrir que sean la misma persona —la Representante Legal supervisando ella
 * misma—, y para ese caso el modelo pide expresamente un solo bloque de firma. Se resuelve
 * con una casilla en el control de parametrización y no comparando los nombres: dos firmas
 * con el mismo nombre encima es un error visible en un papel que ya se firmó, y no es algo
 * que deba depender de si alguien escribió el segundo apellido.
 *
 * Ruta: `.../juridica/:id/designacion-supervisor`. Se guarda en data.designacionSupervisor.
 */

interface DesignacionState {
  // ── Control interno de parametrización, no se imprime ──
  codigoDocumental: string;
  version: string;
  /** Designante y supervisor son la misma persona: entonces va un solo bloque de firma. */
  mismaPersona: boolean;

  lugarFecha: string;

  /** Quien designa: la Representante Legal de la contratante. */
  firmanteNombre: string;
  firmanteCc: string;
  firmanteCcLugar: string;
  firmanteCargo: string;

  /** Quien es designado. En el formato anterior no existía: supervisaba quien firmaba. */
  supervisorNombre: string;
  supervisorId: string;
  supervisorCargo: string;

  /**
   * Qué sustenta la supervisión. Antes era siempre una cláusula del contrato («la sexta»);
   * el modelo nuevo admite además un documento o una decisión interna, así que es texto
   * libre y no un número de cláusula.
   */
  sustento: string;

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
  garantias: string;

  /** Lugar y fecha de suscripción del acta, al pie. */
  suscripcion: string;

  /** Quién lo elaboró. Quien lo revisa es siempre Jurídica y va en `PieElaboracion`. */
  elaboro: string;

  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: DesignacionState = {
  codigoDocumental: '[ASIGNAR / VALIDAR POR GESTIÓN DOCUMENTAL]',
  version: '[VERSIÓN]',
  mismaPersona: false,

  lugarFecha: '',

  firmanteNombre: '', firmanteCc: '', firmanteCcLugar: '',
  firmanteCargo: 'Gerente y Representante Legal',

  supervisorNombre: '', supervisorId: '', supervisorCargo: '',

  sustento: '',

  tipologia: '',
  contratante: '', contratanteNit: '',
  contratista: '', contratistaNit: '',
  objeto: '',
  valor: '',
  formaPago: '',
  plazo: '',
  inicio: '',
  terminacion: '',
  garantias: '',

  suscripcion: '',
  elaboro: '',
  textos: {},
};

/**
 * Las diez responsabilidades de la supervisión, como plantilla. Cada una se puede
 * reescribir por separado —van con su propia clave en `textos`— porque en un contrato
 * concreto suele cambiar una sola.
 */
const RESPONSABILIDADES = [
  'Verificar el cumplimiento oportuno y adecuado del objeto contractual, las obligaciones, entregables, productos y resultados pactados.',
  'Solicitar al contratista los informes, aclaraciones, explicaciones y soportes razonablemente necesarios para comprobar la ejecución contractual.',
  'Revisar y aprobar, cuando corresponda a sus funciones, los informes de ejecución y los soportes que habilitan el trámite de pago, sin perjuicio de las verificaciones de las demás áreas competentes.',
  '[SI APLICA] Verificar antes del inicio que las garantías contractuales exigidas se encuentren expedidas, presentadas y aprobadas, y advertir oportunamente la necesidad de modificación, prórroga, ampliación o restablecimiento.',
  'Dejar trazabilidad escrita de reuniones, observaciones, requerimientos, aprobaciones, novedades, instrucciones y demás actuaciones relevantes de la supervisión en el expediente contractual.',
  'Advertir oportunamente hechos o riesgos que puedan afectar la ejecución y solicitar la adopción de las medidas contractuales o administrativas que correspondan.',
  'Velar por el cumplimiento de las obligaciones de confidencialidad, protección de datos, seguridad de la información, propiedad intelectual y demás deberes transversales que resulten aplicables.',
  'Abstenerse de modificar por sí mismo(a) el objeto, valor, plazo, forma de pago o demás condiciones contractuales, salvo que exista documento suscrito por quienes se encuentren legalmente facultados.',
  'Informar oportunamente a la Dirección Jurídica y a las áreas competentes sobre posibles incumplimientos, controversias o situaciones que requieran decisión diferente al seguimiento ordinario.',
  'Cumplir las demás obligaciones de supervisión previstas en el contrato y en los procedimientos internos aplicables.',
];

/**
 * Las claves de `textos` de esta versión del formato van con prefijo `v2.`.
 *
 * El texto de casi todos los bloques cambió, y varios conservan el mismo papel dentro del
 * acta —la referencia, el alcance, la aceptación, las responsabilidades—. Reusar las claves
 * viejas haría que una designación anterior que hubiera reescrito «resp3» heredara ese
 * párrafo dentro de una lista que ahora dice otra cosa y tiene diez ítems en vez de ocho.
 * Con prefijo propio, lo guardado antes se queda donde estaba y esta versión arranca de su
 * plantilla.
 */
const claveTexto = (clave: string) => `v2.${clave}`;

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
          /*
           * Las designaciones del formato anterior no tienen supervisor: lo ejercía quien
           * firmaba. Se abren con la casilla marcada para que sigan imprimiendo una sola
           * firma, que es lo que dicen esos documentos.
           */
          mismaPersona: saved.mismaPersona ?? (!!viejo.clausula && !saved.supervisorNombre),
          sustento: saved.sustento || (viejo.clausula ? `la cláusula ${viejo.clausula} del contrato` : ''),
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
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
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

  /** Cómo se nombra al supervisor en el cuerpo: si es la misma persona, es quien firma. */
  const supervisor = f.mismaPersona ? f.firmanteNombre : f.supervisorNombre;
  const supervisorCargo = f.mismaPersona ? f.firmanteCargo : f.supervisorCargo;

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
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {solicitudId}</p>
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
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-4">

            <EncabezadoFormato
              codigo="GJ-009-F"
              titulo={<>
                <h1 className="font-bold text-[13px]">DESIGNACIÓN Y ACEPTACIÓN DE SUPERVISIÓN</h1>
                <p className="font-bold text-[10px]">CONTRACTUAL</p>
              </>}
            />

            <BloqueControl
              titulo="CONTROL INTERNO DE PARAMETRIZACIÓN — NO SE IMPRIME"
              nota="El supervisor, lo que sustenta la supervisión y la exigencia de garantías son campos variables. Revísalos contra el contrato antes de imprimir."
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Código documental</span>
                <input
                  value={f.codigoDocumental}
                  onChange={(e) => set('codigoDocumental', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>

              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Versión</span>
                <input
                  value={f.version}
                  onChange={(e) => set('version', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>

              {/* La regla del modelo: si coinciden, un solo bloque de firma. */}
              <label className="flex items-start gap-2 text-[11.5px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.mismaPersona}
                  onChange={(e) => set('mismaPersona', e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  Quien designa ejerce la supervisión
                  <span className="block text-[10.5px] text-[#8a6d00]">
                    El acta se imprime con un solo bloque de firma y el texto habla en primera
                    persona.
                  </span>
                </span>
              </label>
            </BloqueControl>

            {/* Cuerpo del acta */}
            <div className="space-y-4 leading-relaxed text-[12.5px]">
              <Line value={f.lugarFecha} onChange={(v) => set('lugarFecha', v)} placeholder="Santiago de Cali, 00 de mes de 0000." />

              <FieldRow label="Referencia:">
                <TextoEd
                  k={claveTexto('referencia')}
                  plantilla={`Contrato de ${lower(f.tipologia) || 'prestación de servicios'} suscrito entre ${textOrDash(f.contratante)} y ${textOrDash(f.contratista)}.`}
                />
              </FieldRow>
              <FieldRow label="Asunto:">
                <TextoEd k={claveTexto('asunto')} plantilla="Designación y aceptación de supervisión contractual." />
              </FieldRow>

              {/*
                La designación. Cambia de raíz según quién supervisa: designar a un tercero
                y asumirla uno mismo no son la misma frase con otro nombre, son dos
                declaraciones distintas —y el acta la firman personas distintas en cada caso.
              */}
              <TextoEd
                k={claveTexto('designa')}
                plantilla={
                  f.mismaPersona
                    ? `${textOrDash(f.firmanteNombre).toUpperCase()}, identificada con cédula de ciudadanía No. ${textOrDash(f.firmanteCc)} expedida en ${textOrDash(f.firmanteCcLugar)}, actuando en calidad de ${lower(f.firmanteCargo) || 'gerente y representante legal'} de ${textOrDash(f.contratante)}, y en ejercicio de sus facultades legales, estatutarias y contractuales, deja constancia de que ejercerá directamente la supervisión del contrato de referencia, de conformidad con ${textOrDash(f.sustento)}.`
                    : `${textOrDash(f.firmanteNombre).toUpperCase()}, identificada con cédula de ciudadanía No. ${textOrDash(f.firmanteCc)} expedida en ${textOrDash(f.firmanteCcLugar)}, actuando en calidad de ${lower(f.firmanteCargo) || 'gerente y representante legal'} de ${textOrDash(f.contratante)}, y en ejercicio de sus facultades legales, estatutarias y contractuales, por medio de la presente designa a ${textOrDash(f.supervisorNombre).toUpperCase()}, identificado(a) con ${textOrDash(f.supervisorId)}, quien se desempeña como ${textOrDash(f.supervisorCargo)}, para ejercer la supervisión del contrato de referencia, de conformidad con ${textOrDash(f.sustento)}.`
                }
              />

              {/* Tabla de información del contrato */}
              <h3 className="font-bold text-center pt-2">INFORMACIÓN PRINCIPAL DEL CONTRATO</h3>

              <table className="w-full border-collapse text-[12px] my-2">
                <tbody>
                  <InfoRow label="Tipología contractual" value={f.tipologia} onChange={(v) => set('tipologia', v)} />
                  <InfoRow label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                  <InfoRow label="Identificación/NIT" value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} placeholder="NIT 000.000.000-0" />
                  <InfoRow label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
                  <InfoRow label="Identificación/NIT" value={f.contratistaNit} onChange={(v) => set('contratistaNit', v)} placeholder="CC / NIT 000.000.000-0" />
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
                    placeholder="00 de mes de 0000, o sujeto a acta de inicio." />
                  <InfoRow label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} />
                  <InfoRow label="Garantías" value={f.garantias} onChange={(v) => set('garantias', v)} area
                    placeholder="No aplican, o aplican identificando el acta de aprobación." />
                  {/*
                    El supervisor no se vuelve a teclear acá: se arma con lo que ya se
                    escribió arriba. Dos casillas para el mismo dato acaban diciendo cosas
                    distintas, y esta fila es la que se lee de un vistazo.
                  */}
                  <tr>
                    <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[32%]">
                      Supervisor designado
                    </td>
                    <td className="border border-[#0a2a52] px-2 py-1 align-top">
                      {supervisor
                        ? `${supervisor}${supervisorCargo ? ` - ${supervisorCargo}` : ''}`
                        : <span className="italic text-[hsl(var(--canalco-neutral-400))]">Se llena con el nombre y el cargo del supervisor</span>}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Alcance y responsabilidades */}
              <h3 className="font-bold text-center pt-2">ALCANCE Y RESPONSABILIDADES DE LA SUPERVISIÓN</h3>

              <TextoEd
                k={claveTexto('alcanceIntro')}
                plantilla="La supervisión comprenderá el seguimiento integral al cumplimiento del objeto, obligaciones, alcance, plazo, valor y demás condiciones del contrato, dentro de las competencias del supervisor y sin sustituir las responsabilidades de las áreas financiera, administrativa, tributaria, de tesorería, seguridad y salud en el trabajo u otras que correspondan. En particular, el/la supervisor(a) deberá:"
              />

              <ol className="list-decimal pl-6 space-y-1.5">
                {RESPONSABILIDADES.map((texto, i) => (
                  <li key={i} className="text-justify">
                    <TextoEd k={claveTexto(`resp${i + 1}`)} plantilla={texto} />
                  </li>
                ))}
              </ol>

              {/* Aceptación */}
              <h3 className="font-bold text-center pt-2">ACEPTACIÓN</h3>
              <TextoEd
                k={claveTexto('aceptacion')}
                plantilla={
                  f.mismaPersona
                    ? `En mi calidad de ${lower(f.firmanteCargo) || 'gerente y representante legal'} de ${textOrDash(f.contratante)}, manifiesto que conozco y acepto la designación aquí consignada y me comprometo a ejercer la supervisión con diligencia, objetividad, trazabilidad y sujeción a las estipulaciones contractuales y a los procedimientos internos aplicables.`
                    : `Yo, ${textOrDash(f.supervisorNombre).toUpperCase()}, en calidad de ${textOrDash(f.supervisorCargo)}, manifiesto que conozco y acepto la designación aquí consignada y me comprometo a ejercer la supervisión con diligencia, objetividad, trazabilidad y sujeción a las estipulaciones contractuales y a los procedimientos internos aplicables.`
                }
              />

              <div className="pt-2">
                <span>En constancia, se suscribe en </span>
                <Line value={f.suscripcion} onChange={(v) => set('suscripcion', v)} placeholder="Santiago de Cali el 00 (cero) de mes de 0000." />
              </div>

              {/*
                Dos firmas: quien designa y quien acepta. Cuando coinciden va una sola —lo
                pide el modelo—, porque el mismo nombre firmando dos veces el mismo papel
                se lee como un error de armado, no como una formalidad.
              */}
              <div className={'pt-12 ' + (f.mismaPersona ? 'max-w-[60%]' : 'grid grid-cols-2 gap-10')}>
                <Firma>
                  <Line value={f.firmanteNombre} onChange={(v) => set('firmanteNombre', v)} placeholder="NOMBRE DE QUIEN DESIGNA" bold />
                  <Line value={f.firmanteCargo} onChange={(v) => set('firmanteCargo', v)} placeholder="Gerente y Representante Legal" />
                  <Line value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="EMPRESA CONTRATANTE" />
                  <p>{f.mismaPersona ? 'Quien designa y ejerce la supervisión' : 'Quien designa'}</p>
                </Firma>

                {!f.mismaPersona && (
                  <Firma>
                    <Line value={f.supervisorNombre} onChange={(v) => set('supervisorNombre', v)} placeholder="NOMBRE DEL SUPERVISOR" bold />
                    <Line value={f.supervisorCargo} onChange={(v) => set('supervisorCargo', v)} placeholder="Cargo" />
                    <p>Supervisor(a) designado(a)</p>
                    <p>Quien acepta</p>
                  </Firma>
                )}
              </div>

              <div className="pt-6 text-[11px]">
                <TextoEd k={claveTexto('anexo')} plantilla="Anexo: copia del contrato objeto de supervisión, si aplica." />
              </div>
            </div>

            <PieMembrete />
          </div>

          {/* Quien elabora varía; quien revisa es siempre la Dirección Jurídica. */}
          <div className="px-8 pt-3 text-[10px] text-black">
            <span>Elaboró: </span>
            <input
              value={f.elaboro}
              onChange={(e) => set('elaboro', e.target.value)}
              placeholder="Nombre - Cargo"
              className="bg-transparent outline-none text-[10px] w-64 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
            />
          </div>
          <PieElaboracion soloRevision className="pt-0" />
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

function InfoRow({ label, value, onChange, area, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string;
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
      </td>
    </tr>
  );
}

function Firma({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-t border-[#0a2a52] pt-1" />
      <div className="space-y-0.5 mt-1 text-[11.5px]">{children}</div>
    </div>
  );
}
