import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';

/**
 * Plantilla de contrato para el tipo «Prestación de servicios».
 *
 * Sigue la **plantilla marco con garantías contractuales, ajustada 2026** (el formato
 * «08 Plantilla Contrato PS Con Poliza»), que reemplazó a la versión anterior de veintidós
 * cláusulas. No es una pestaña aparte: es el contrato, y se muestra cuando la solicitud es
 * de ese tipo, igual que Término Fijo o de Obra Labor tienen la suya. La reparte
 * `ContratoPage` y se guarda en `data.contrato`, como todas.
 *
 * Lo que cambia respecto de la versión vieja, y es la razón de ser de la plantilla marco:
 * **todo lo variable vive en la ficha particular de arriba y las cláusulas la referencian**
 * en vez de repetir las cifras. Antes el valor aparecía en la ficha y otra vez en la
 * cláusula segunda, y el plazo en la ficha y otra vez en la tercera; cuando se corregía uno
 * y no el otro, el contrato se contradecía a sí mismo. Ahora la segunda dice «los indicados
 * en la ficha particular» y solo hay un lugar donde equivocarse.
 *
 * Por lo mismo desaparecieron las listas numeradas de obligaciones y de causales: la
 * plantilla las volvió redacción corrida, con las específicas «definidas para el caso».
 */

interface ContratoState {
  /* ── Control interno: no sale en la versión firmable ── */
  ciGarantias: string;
  ciTerminacionAnticipada: string;
  ciRevisionJuridica: string;

  /* ── Ficha particular ── */
  contratante: string;
  contratanteRepLegal: string;
  contratista: string;
  contratistaNit: string;
  contratistaRepLegal: string;
  /** Dirección, correo y teléfono en una sola celda, como los pide la ficha. */
  contratistaContacto: string;
  objeto: string;
  valor: string;
  formaPago: string;
  plazo: string;
  inicio: string;
  terminacion: string;
  supervisor: string;

  /**
   * Si el contrato pactó la terminación anticipada por decisión de la contratante.
   *
   * Es el módulo opcional de la plantilla y va apagado por defecto, que es lo que la
   * plantilla exige: la facultad solo existe si las partes la acordaron expresamente y
   * quedó escrita en la cláusula séptima. Encenderla acá la imprime dentro de esa
   * cláusula; apagada, ni se imprime ni se puede invocar después.
   */
  terminacionAnticipada: boolean;

  /* ── Garantías de la vigésima segunda ── */
  amparos: { amparo: string; valor: string; vigencia: string; observaciones: string }[];

  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * Los huecos van como valores y no como `placeholder`: un placeholder se ve en pantalla
 * pero no se imprime, y el formato en blanco tiene que poder imprimirse para diligenciarlo
 * a mano. Se escriben en la convención de la plantilla —corchetes en mayúscula— para que a
 * simple vista se distinga lo que falta de lo que ya se diligenció.
 */
const EMPTY: ContratoState = {
  ciGarantias: '[DEFINIR AMPAROS / % O VALOR / VIGENCIAS SEGÚN RIESGO Y APROBACIÓN JURÍDICA]',
  ciTerminacionAnticipada: '[NO APLICA / APLICA - PREAVISO ___ DÍAS, EXPRESAMENTE PACTADO]',
  ciRevisionJuridica: '[NOMBRE / FECHA / APROBADO]',

  // La contratante es siempre la misma: va escrita, no en blanco.
  contratante: 'CANALES Y CONTACTOS S.A.S. - NIT 900.456.735-7',
  contratanteRepLegal: 'GLORIA LUCÍA ESCALANTE MANZANO - C.C. 66.651.423 de El Cerrito',
  contratista: '[NOMBRE / RAZÓN SOCIAL]',
  contratistaNit: '[NÚMERO]',
  contratistaRepLegal: '[NOMBRE / IDENTIFICACIÓN / NO APLICA]',
  contratistaContacto: '[DIRECCIÓN / CORREO / TELÉFONO]',
  objeto: '[DESCRIPCIÓN PRECISA DEL SERVICIO]',
  valor: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR]) [IVA INCLUIDO / MÁS IVA / NO APLICA]',
  formaPago: '[PAGOS / PERIODICIDAD / HITOS / REQUISITOS]',
  plazo: '[NÚMERO] DÍAS / MESES',
  inicio: '[FECHA / SUJETO A APROBACIÓN DE GARANTÍAS Y/O ACTA DE INICIO]',
  terminacion: '[FECHA / REGLA DE CÁLCULO]',
  supervisor: '[NOMBRE / CARGO / POR DESIGNAR]',

  terminacionAnticipada: false,

  // Tres renglones, como la plantilla. Sin amparos ni porcentajes por defecto: la propia
  // plantilla lo prohíbe, porque fijarlos invita a firmarlos sin mirar el riesgo.
  amparos: [
    { amparo: '[AMPARO 1]', valor: '[% / $]', vigencia: '[PLAZO + EXTENSIÓN]', observaciones: '[CONDICIÓN]' },
    { amparo: '[AMPARO 2]', valor: '[% / $]', vigencia: '[PLAZO + EXTENSIÓN]', observaciones: '[CONDICIÓN]' },
    { amparo: '[AMPARO 3 / NO APLICA]', valor: '[% / $]', vigencia: '[VIGENCIA]', observaciones: '[CONDICIÓN]' },
  ],

  textos: {},
};

/**
 * Lo guardado con la plantilla vieja, traído a la nueva.
 *
 * La ficha anterior tenía dirección, teléfono y correo de la contratista en tres campos y
 * la nueva los pide en una sola celda. Un contrato a medio diligenciar perdería esos datos
 * al abrirlo, así que se juntan. Lo demás que la plantilla vieja tenía y esta no —las
 * listas de obligaciones, las causales, el cuadro de tomador y asegurado— **no se borra**:
 * sigue en `data.contrato` en la base, simplemente ya no se lee.
 */
function traerDeLaPlantillaVieja(saved: Record<string, unknown>): Partial<ContratoState> {
  const texto = (k: string) => (typeof saved[k] === 'string' ? (saved[k] as string).trim() : '');
  if (saved.contratistaContacto) return {};
  const partes = [texto('contratistaDireccion'), texto('contratistaCorreo'), texto('contratistaTelefono')]
    .filter((v) => v && v !== 'xxx' && v !== 'xx');
  return partes.length > 0 ? { contratistaContacto: partes.join(' · ') } : {};
}

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/** Se redacta con el contrato: desde su elaboración en adelante. */
const HABILITADO = [
  'contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado',
  'en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado',
];

/**
 * Las veinticuatro cláusulas, en el orden y con el texto de la plantilla 2026.
 *
 * Van en una constante y no sueltas en el JSX porque así se leen de corrido y se comparan
 * contra el formato sin tener que saltarse el marcado. El `k` es la clave con que se guarda
 * lo que Jurídica reescriba.
 *
 * Las claves llevan el prefijo `m` —de plantilla marco— y **no se reutilizaron las de la
 * plantilla vieja**. La numeración se corrió: la décima séptima era «Notificaciones» y
 * ahora es «Conservación y devolución de información». Con las mismas claves, un contrato
 * donde alguien hubiera reescrito la vieja habría mostrado ese texto bajo la cláusula
 * equivocada, que es peor que perder la edición.
 */
const CLAUSULAS: { k: string; titulo: string; texto: string }[] = [
  {
    k: 'm1',
    titulo: 'PRIMERA. OBJETO',
    texto: 'EL/LA CONTRATISTA se obliga a prestar a LA CONTRATANTE los servicios descritos en la ficha particular y a cumplir las obligaciones y entregables allí previstos, de acuerdo con la propuesta aceptada y los demás documentos incorporados al contrato.',
  },
  {
    k: 'm2',
    titulo: 'SEGUNDA. VALOR Y FORMA DE PAGO',
    texto: 'El valor y la forma de pago serán los indicados en la ficha particular. Cada pago se efectuará previa presentación de la factura electrónica o cuenta de cobro, según corresponda, los informes o entregables pactados, el visto bueno o certificación del supervisor cuando aplique, y los soportes de aportes al Sistema de Seguridad Social Integral y parafiscales legalmente exigibles. El IVA se causará únicamente cuando resulte aplicable de acuerdo con la condición tributaria de EL/LA CONTRATISTA. Se practicarán las retenciones y deducciones legalmente procedentes.',
  },
  {
    k: 'm3',
    titulo: 'TERCERA. PLAZO E INICIO',
    texto: 'El plazo de ejecución será el indicado en la ficha particular. Cuando se exijan garantías contractuales, EL/LA CONTRATISTA no podrá iniciar actividades hasta que estas hayan sido expedidas, presentadas y aprobadas por escrito. Si se exige acta de inicio, la fecha de inicio será la allí consignada. Las prórrogas deberán constar por escrito.',
  },
  {
    k: 'm4',
    titulo: 'CUARTA. OBLIGACIONES DE EL/LA CONTRATISTA',
    texto: 'Además de las obligaciones específicas definidas para el caso, EL/LA CONTRATISTA deberá ejecutar el objeto con diligencia, autonomía técnica y administrativa; entregar oportunamente los productos pactados; suministrar los recursos a su cargo; mantener la reserva de la información; cumplir las obligaciones de seguridad social, tributarias y laborales que le correspondan; atender los requerimientos del supervisor dentro del objeto contractual; y cumplir las demás obligaciones expresamente acordadas por las partes.',
  },
  {
    k: 'm5',
    titulo: 'QUINTA. OBLIGACIONES DE LA CONTRATANTE',
    texto: 'LA CONTRATANTE deberá suministrar la información y accesos que contractualmente se encuentren a su cargo, efectuar el seguimiento de la ejecución, formular observaciones a los entregables, tramitar los pagos debidamente causados y suscribir los documentos contractuales que correspondan.',
  },
  {
    k: 'm6',
    titulo: 'SEXTA. SUPERVISIÓN',
    texto: 'La supervisión será ejercida por [NOMBRE / CARGO] o por quien sea designado mediante comunicación escrita. El supervisor verificará el cumplimiento del objeto, obligaciones, entregables, plazo, soportes y condiciones de pago, sin sustituir las competencias de las áreas administrativa, financiera, tributaria, de tesorería, seguridad y salud en el trabajo u otras que correspondan. La supervisión no libera a EL/LA CONTRATISTA de responsabilidad por la ejecución integral del contrato.',
  },
  {
    k: 'm7',
    titulo: 'SÉPTIMA. TERMINACIÓN',
    texto: 'El contrato terminará por vencimiento del plazo, cumplimiento del objeto, mutuo acuerdo, imposibilidad definitiva de ejecución o por las demás causales legales o expresamente pactadas. Cuando se invoque incumplimiento grave, LA CONTRATANTE documentará los hechos, comunicará el requerimiento correspondiente y permitirá a EL/LA CONTRATISTA pronunciarse antes de adoptar las medidas contractuales procedentes, salvo que exista una regla distinta válidamente pactada o una situación que exija actuación inmediata.',
  },
  {
    k: 'm8',
    titulo: 'OCTAVA. PARTES INDEPENDIENTES',
    texto: 'Las partes actúan con autonomía e independencia jurídica, técnica, administrativa y financiera. El presente contrato no genera relación laboral entre LA CONTRATANTE y EL/LA CONTRATISTA ni con el personal que este utilice. Cada parte será responsable de sus obligaciones laborales, de seguridad social, tributarias y demás cargas legales.',
  },
  {
    k: 'm9',
    titulo: 'NOVENA. CONFIDENCIALIDAD',
    texto: 'Las partes protegerán la información confidencial o reservada conocida con ocasión del contrato y la utilizarán únicamente para su ejecución. No podrán divulgarla a terceros sin autorización, salvo obligación legal o requerimiento de autoridad competente. Al finalizar el contrato deberán devolver, eliminar o conservar la información conforme a las instrucciones contractuales y a los deberes legales aplicables. La obligación de confidencialidad permanecerá mientras la información conserve su carácter reservado o por el término expresamente pactado.',
  },
  {
    k: 'm10',
    titulo: 'DÉCIMA. RESPONSABILIDAD E INDEMNIDAD',
    texto: 'Cada parte responderá por los daños directos, comprobados e imputables que cause por incumplimiento de sus obligaciones. EL/LA CONTRATISTA mantendrá indemne a LA CONTRATANTE frente a reclamaciones atribuibles a incumplimientos laborales, de seguridad social, tributarios, de propiedad intelectual, de protección de datos o daños causados por su personal o dependientes, en los términos legalmente procedentes. Cualquier límite de responsabilidad deberá definirse expresamente para el caso y no podrá extenderse a dolo, culpa grave u obligaciones que legalmente no admitan limitación.',
  },
  {
    k: 'm11',
    titulo: 'DÉCIMA PRIMERA. PROPIEDAD INTELECTUAL',
    texto: 'Los derechos preexistentes de cada parte permanecerán en cabeza de su titular. Los entregables elaborados específicamente para LA CONTRATANTE y susceptibles de protección se regirán por el alcance de cesión o licencia definido en el contrato. Salvo pacto distinto, EL/LA CONTRATISTA cede a LA CONTRATANTE los derechos patrimoniales que legalmente pueda ceder sobre los resultados creados específicamente en ejecución del objeto, para las modalidades, territorios y término máximo permitidos por la ley, entendiéndose remunerada la cesión con el valor contractual. Los derechos morales permanecerán en cabeza de sus autores.',
  },
  {
    k: 'm12',
    titulo: 'DÉCIMA SEGUNDA. INTEGRIDAD Y NO NOVACIÓN',
    texto: 'El contrato y sus anexos contienen el acuerdo aplicable respecto de su objeto y sustituyen entendimientos previos sobre el mismo asunto. Su celebración no implica renuncia ni extinción de obligaciones anteriores que expresamente deban subsistir.',
  },
  {
    k: 'm13',
    titulo: 'DÉCIMA TERCERA. DIVISIBILIDAD',
    texto: 'La invalidez o ineficacia de una estipulación no afectará las demás disposiciones, que conservarán su vigencia en cuanto sea jurídicamente posible.',
  },
  {
    k: 'm14',
    titulo: 'DÉCIMA CUARTA. TRATAMIENTO DE DATOS PERSONALES',
    texto: 'Las partes tratarán los datos personales a los que accedan de conformidad con la Ley 1581 de 2012, sus normas reglamentarias, las disposiciones que la modifiquen o sustituyan y las políticas aplicables. El tratamiento se limitará a las finalidades necesarias para la celebración, ejecución, seguimiento, facturación, auditoría, defensa jurídica y cumplimiento de obligaciones legales.',
  },
  {
    k: 'm15',
    titulo: 'DÉCIMA QUINTA. DERECHOS DE LOS TITULARES',
    texto: 'Cada parte garantizará, dentro del ámbito de su responsabilidad, el ejercicio de los derechos de los titulares a conocer, actualizar, rectificar, solicitar prueba de la autorización cuando proceda, ser informados sobre el uso de sus datos, presentar consultas o reclamos y solicitar supresión o revocatoria cuando legalmente corresponda.',
  },
  {
    k: 'm16',
    titulo: 'DÉCIMA SEXTA. SEGURIDAD DE LA INFORMACIÓN E INCIDENTES',
    texto: 'Las partes adoptarán medidas razonables de seguridad y acceso restringido. Cualquier incidente que pueda comprometer información o datos personales relacionados con el contrato deberá informarse oportunamente a la otra parte, con la información disponible y las medidas de contención adoptadas.',
  },
  {
    k: 'm17',
    titulo: 'DÉCIMA SÉPTIMA. CONSERVACIÓN Y DEVOLUCIÓN DE INFORMACIÓN',
    texto: 'Al terminar el contrato, EL/LA CONTRATISTA devolverá o eliminará la información y los accesos de LA CONTRATANTE, salvo aquella que deba conservar por obligación legal o para la defensa de sus derechos, caso en el cual deberá mantenerla protegida y limitada a dicha finalidad.',
  },
  {
    k: 'm18',
    titulo: 'DÉCIMA OCTAVA. ÉTICA, INTEGRIDAD Y CUMPLIMIENTO',
    texto: 'EL/LA CONTRATISTA se obliga a actuar con integridad y a abstenerse de ofrecer, solicitar, recibir o entregar pagos, beneficios o dádivas indebidas. Asimismo, deberá informar conflictos de interés y cumplir las políticas de prevención de riesgos de corrupción, soborno, lavado de activos y financiación del terrorismo que le sean comunicadas y resulten aplicables.',
  },
  {
    k: 'm19',
    titulo: 'DÉCIMA NOVENA. MODIFICACIONES',
    texto: 'Toda modificación, adición, prórroga o aclaración del contrato deberá constar por escrito y ser suscrita por quienes se encuentren facultados.',
  },
  {
    k: 'm20',
    titulo: 'VIGÉSIMA. CESIÓN',
    texto: 'Ninguna parte podrá ceder total o parcialmente su posición contractual sin autorización previa, expresa y escrita de la otra, salvo disposición legal o acuerdo distinto.',
  },
  {
    k: 'm21',
    titulo: 'VIGÉSIMA PRIMERA. LEGISLACIÓN APLICABLE Y CONTROVERSIAS',
    texto: 'El contrato se regirá por las leyes de la República de Colombia. Las partes procurarán resolver directamente las diferencias durante [NÚMERO] días calendario desde el requerimiento escrito. Si no existe acuerdo, la controversia será sometida a [JURISDICCIÓN ORDINARIA / CONCILIACIÓN / ARBITRAJE ADMINISTRADO POR ___], según la alternativa expresamente seleccionada para el contrato.',
  },
];

/**
 * Quién firma por la contratante, tal como va en el bloque de firmas.
 *
 * No sale de la ficha particular aunque sean los mismos nombres: la ficha los lleva **con
 * su identificación** —«CANALES Y CONTACTOS S.A.S. - NIT 900.456.735-7», «GLORIA LUCÍA
 * ESCALANTE MANZANO - C.C. 66.651.423 de El Cerrito»— porque ahí es donde se identifica a
 * las partes, y sobre una línea de firma eso no va: la plantilla firma con el nombre solo.
 * Reutilizar las celdas imprimía la cédula y el NIT debajo de la raya.
 *
 * Van como constantes, igual que los nombres de `PieElaboracion`, porque son los mismos en
 * todos los contratos: la representante legal es una sola. Si cambia, se cambia acá una vez.
 */
const FIRMA_CONTRATANTE = {
  nombre: 'GLORIA LUCÍA ESCALANTE MANZANO',
  cargo: 'Representante Legal',
  empresa: 'CANALES Y CONTACTOS S.A.S.',
};

/** El texto del módulo opcional, ya sin el rótulo de «activar solo si...». */
const TERMINACION_ANTICIPADA =
  'TERMINACIÓN ANTICIPADA POR DECISIÓN DE LA CONTRATANTE: LA CONTRATANTE podrá dar por '
  + 'terminado anticipadamente el contrato, sin necesidad de invocar incumplimiento, mediante '
  + 'comunicación escrita remitida con una antelación mínima de [NÚMERO] días [CALENDARIO / '
  + 'HÁBILES]. En tal evento se reconocerán únicamente los valores debidamente causados y '
  + 'acreditados hasta la fecha efectiva de terminación.';

export default function ContratoPrestacionDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;

  // La solicitud llega ya cargada desde `ContratoPage`, que es quien reparte la plantilla
  // según el tipo. `sol` es estado propio para que la acción de la etapa pueda refrescarla.
  const [sol, setSol] = useState<GcSolicitud>(solicitud);
  const [saving, setSaving] = useState(false);

  // Solo lo guardado sobre la plantilla: nada se prellena desde la solicitud. El formato
  // trae sus propios huecos —«[NÚMERO]», «[FECHA / REGLA DE CÁLCULO]»— y sustituirlos por
  // datos sueltos dejaría una ficha a medias, con unas celdas diligenciadas y otras no.
  const [f, setF] = useState<ContratoState>(() => {
    const saved = (solicitud.data?.contrato ?? {}) as Record<string, unknown> & Partial<ContratoState>;
    return {
      ...EMPTY,
      ...traerDeLaPlantillaVieja(saved),
      ...saved,
      // Los amparos de la plantilla vieja no traían observaciones: la columna es nueva.
      amparos: (saved.amparos ?? EMPTY.amparos).map((a) => ({ observaciones: '', ...a })),
      textos: saved.textos ?? {},
    };
  });

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const set = <K extends keyof ContratoState>(k: K, v: ContratoState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /** Devuelve si logró guardar: la acción de la etapa guarda antes de avanzar. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId, 'contrato', f);
      toast.success('Contrato guardado');
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

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

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Contrato de prestación de servicios</h1>
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {solicitudId} · Plantilla marco 2026, con garantías</p>
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
        <div className="max-w-4xl mx-auto px-6">
          <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="contrato" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: el contrato se remite a firma acá. */}
        <AccionesFlujo
          sol={sol} documento="contrato" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">Este contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita en la etapa de elaboración del contrato.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-8 py-6">
            {/* Membrete */}
            <EncabezadoFormato
              className="mb-3"
              codigo="GJ-002-F"
              titulo={<h1 className="font-bold text-[12.5px] leading-snug">CONTRATO DE PRESTACIÓN DE SERVICIOS</h1>}
            />

            {/* Qué plantilla se está usando. Es rótulo interno: un contrato firmado no puede
                decir «plantilla marco», así que se ve en pantalla y no se imprime. */}
            <p className="no-print text-center text-[11px] text-[hsl(var(--canalco-neutral-500))] mb-1">
              PLANTILLA MARCO · CON GARANTÍAS CONTRACTUALES
            </p>
            <p className="text-[11px] font-bold mb-4">NIT 900.456.735-7</p>

            {/* ── Control interno ──
                La plantilla lo dice en su propio título: no se muestra en la versión
                firmable. Va `no-print` entero, que es la única forma de que la instrucción
                se cumpla sola y no dependa de que alguien se acuerde de borrarlo. */}
            <div className="no-print border border-[#0a2a52] mb-5">
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  <Fila label="Garantías" value={f.ciGarantias} onChange={(v) => set('ciGarantias', v)} area />
                  <Fila label="Terminación anticipada por decisión de la contratante"
                    value={f.ciTerminacionAnticipada} onChange={(v) => set('ciTerminacionAnticipada', v)} area />
                  <Fila label="Revisión jurídica" value={f.ciRevisionJuridica} onChange={(v) => set('ciRevisionJuridica', v)} />
                </tbody>
              </table>
            </div>

            <h2 className="text-center font-bold my-3">FICHA PARTICULAR DEL CONTRATO</h2>

            {/* Todo lo variable del contrato vive acá; las cláusulas la referencian. */}
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Fila label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} bold />
                <Fila label="Representante legal" value={f.contratanteRepLegal} onChange={(v) => set('contratanteRepLegal', v)} bold />
                <Fila label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} bold />
                <Fila label="CC / NIT" value={f.contratistaNit} onChange={(v) => set('contratistaNit', v)} />
                <Fila label="Representante legal" value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} />
                <Fila label="Dirección y correo" value={f.contratistaContacto} onChange={(v) => set('contratistaContacto', v)} area />
                <Fila label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area filas={3} />
                <Fila label="Valor" value={f.valor} onChange={(v) => set('valor', v)} area />
                <Fila label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} area filas={3} />
                <Fila label="Plazo" value={f.plazo} onChange={(v) => set('plazo', v)} />
                <Fila label="Inicio" value={f.inicio} onChange={(v) => set('inicio', v)} area />
                <Fila label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} />
                <Fila label="Supervisor" value={f.supervisor} onChange={(v) => set('supervisor', v)} />
              </tbody>
            </table>

            {/* Comparecencia */}
            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <TextoEd
                k="m.comparecencia"
                plantilla={'Entre los suscritos, CANALES Y CONTACTOS S.A.S., identificada con NIT 900.456.735-7, '
                  + 'representada legalmente por GLORIA LUCÍA ESCALANTE MANZANO, identificada con cédula de '
                  + 'ciudadanía No. 66.651.423 expedida en El Cerrito, quien en adelante se denominará LA '
                  + 'CONTRATANTE, y [NOMBRE / RAZÓN SOCIAL], identificado(a) con [CC/NIT] No. [NÚMERO], '
                  + '[REPRESENTADO(A) LEGALMENTE POR ___ / QUIEN ACTÚA EN NOMBRE PROPIO], quien en adelante se '
                  + 'denominará EL/LA CONTRATISTA, hemos convenido celebrar el presente CONTRATO DE PRESTACIÓN '
                  + 'DE SERVICIOS, regido por las siguientes cláusulas:'}
              />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-3">
              {CLAUSULAS.map((c) => (
                <div key={c.k} className="space-y-1">
                  <p><b>{c.titulo}:</b></p>
                  <TextoEd k={c.k} plantilla={c.texto} />
                  {/* El módulo opcional se imprime dentro de la séptima, que es donde la
                      plantilla exige que quede incorporado para poder invocarse. */}
                  {c.k === 'm7' && f.terminacionAnticipada && (
                    <TextoEd k="m.terminacionAnticipada" plantilla={TERMINACION_ANTICIPADA} />
                  )}
                </div>
              ))}

              <ModuloOpcional
                activo={f.terminacionAnticipada}
                onChange={(v) => set('terminacionAnticipada', v)}
                editable={editable}
              />

              {/* La única cláusula que la plantilla centra: abre el bloque de garantías
                  como un título, no como un renglón más de la lista. */}
              <p className="text-center font-bold pt-2">VIGÉSIMA SEGUNDA. GARANTÍAS CONTRACTUALES</p>
              <TextoEd
                k="m22.intro"
                plantilla={'EL/LA CONTRATISTA deberá constituir únicamente las garantías expresamente definidas '
                  + 'para el caso, expedidas por una aseguradora legalmente autorizada para operar en Colombia. '
                  + 'Las garantías deberán ser presentadas y aprobadas antes del inicio cuando así se haya '
                  + 'pactado. Los amparos no utilizados deberán eliminarse de la versión final.'}
              />

              <CuadroGarantias f={f} set={set} editable={editable} />

              <TextoEd
                k="m22.tomador"
                plantilla={'El tomador será EL/LA CONTRATISTA; el asegurado y beneficiario será CANALES Y '
                  + 'CONTACTOS S.A.S., salvo que el contrato requiera una estructura distinta. La póliza deberá '
                  + 'identificar el contrato y su objeto. EL/LA CONTRATISTA deberá ampliar, prorrogar o '
                  + 'restablecer las garantías cuando la modificación del contrato o una reclamación así lo exijan.'}
              />

              <p><b>VIGÉSIMA TERCERA. PERFECCIONAMIENTO Y EJECUCIÓN:</b></p>
              <TextoEd
                k="m23"
                plantilla={'El contrato se perfecciona con la firma de las partes. Su ejecución quedará sujeta '
                  + 'al cumplimiento de las condiciones de inicio definidas en la ficha particular, incluyendo '
                  + 'la aprobación de garantías cuando se hayan exigido.'}
              />

              <p><b>VIGÉSIMA CUARTA. NOTIFICACIONES:</b></p>
              <TextoEd
                k="m24"
                plantilla={'Las comunicaciones contractuales se enviarán a las direcciones y correos consignados '
                  + 'en la ficha particular. Los cambios deberán informarse por escrito.'}
              />
            </div>

            {/* Suscripción */}
            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <TextoEd
                k="m.constancia"
                plantilla="Para constancia, se suscribe en Santiago de Cali, Valle del Cauca, el [DÍA] de [MES] de [AÑO]."
              />
            </div>

            {/* La contratante firma con nombre y empresa a secas —ver FIRMA_CONTRATANTE—.
                La contratista sí sale de la ficha: es la misma parte que se identificó
                arriba y con campos propios el contrato podría nombrar a dos distintas. */}
            <div className="grid grid-cols-2 gap-8 mt-10 text-[12px]">
              <div>
                <div className="border-t border-black pt-1 mt-16">
                  <p className="font-bold">{FIRMA_CONTRATANTE.nombre}</p>
                  <p>{FIRMA_CONTRATANTE.cargo}</p>
                  <p>{FIRMA_CONTRATANTE.empresa}</p>
                  <p>LA CONTRATANTE</p>
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1 mt-16">
                  <FLine value={f.contratista} onChange={(v) => set('contratista', v)} bold />
                  <FLine value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} />
                  <p>EL/LA CONTRATISTA</p>
                </div>
              </div>
            </div>

            {/* El mismo pie que los demás documentos del trámite, y del mismo sitio: acá
                estaba copiado literal y habría quedado diciendo otra dirección. */}
            <PieMembrete />
          </div>
          {/* La plantilla 2026 pide «Revisó y aprobó», no «Proyectó y revisó»: acá Jurídica
              autoriza el contrato, que es una responsabilidad distinta de redactarlo. */}
          <PieElaboracion etiqueta="Revisó y aprobó" />
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar este contrato. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

/**
 * El módulo opcional de terminación anticipada por decisión de la contratante.
 *
 * Es un interruptor y no un texto más porque la plantilla lo condiciona: la facultad solo
 * existe si las partes la acordaron **expresamente** y quedó incorporada a la cláusula
 * séptima de la versión firmable. Si no quedó, después no se puede usar la plantilla de
 * terminación unilateral por conveniencia —y eso es justo lo que se descubre tarde—.
 *
 * Encendido, el texto se imprime dentro de la séptima. Apagado, no se imprime; el
 * recuadro que queda en pantalla es el recordatorio de que hay que decidirlo.
 */
function ModuloOpcional({ activo, onChange, editable }: {
  activo: boolean; onChange: (v: boolean) => void; editable: boolean;
}) {
  return (
    <div className={'no-print border rounded px-3 py-2 my-3 text-[11px] '
      + (activo ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-[#c9c9d8] bg-[#f6f6fa] text-[#4a4a63]')}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={activo}
          disabled={!editable}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 flex-shrink-0"
        />
        <span>
          <b>Módulo opcional · terminación anticipada por decisión de la contratante.</b>{' '}
          {activo
            ? 'Queda incorporado a la cláusula séptima y se imprime con el contrato.'
            : 'Actívalo solo si las partes lo acordaron expresamente. Si no queda en el contrato firmado, '
              + 'después no se puede terminar por conveniencia.'}
        </span>
      </label>
    </div>
  );
}

/**
 * El cuadro de amparos de la vigésima segunda.
 *
 * Los amparos se agregan y se quitan porque cuáles van depende del riesgo de cada
 * contrato; la plantilla deja tres renglones de ejemplo y advierte que los no utilizados
 * hay que eliminarlos de la versión final.
 */
function CuadroGarantias({ f, set, editable }: {
  f: ContratoState;
  set: <K extends keyof ContratoState>(k: K, v: ContratoState[K]) => void;
  editable: boolean;
}) {
  const celda = 'border border-[#0a2a52] px-2 py-1 align-top';
  const campo = 'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black';
  const cambiar = (i: number, k: 'amparo' | 'valor' | 'vigencia' | 'observaciones', v: string) =>
    set('amparos', f.amparos.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  return (
    <div className="my-3">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          {/* Verde #D9EAD3 con letra negra: es el sombreado que trae la plantilla. El gris
              oscuro con letra blanca venía del cuadro de la versión anterior. */}
          <tr className="bg-[#d9ead3] text-left">
            <th className={celda}>AMPARO</th>
            <th className={`${celda} w-[18%]`}>% / VALOR ASEGURADO</th>
            <th className={`${celda} w-[26%]`}>VIGENCIA</th>
            <th className={`${celda} w-[22%]`}>OBSERVACIONES</th>
          </tr>
        </thead>
        <tbody>
          {f.amparos.map((a, i) => (
            <tr key={i}>
              <td className={celda}>
                <textarea value={a.amparo} onChange={(e) => cambiar(i, 'amparo', e.target.value)} rows={2} className={`${campo} resize-y leading-snug`} />
              </td>
              <td className={celda}>
                <textarea value={a.valor} onChange={(e) => cambiar(i, 'valor', e.target.value)} rows={2} className={`${campo} resize-y leading-snug`} />
              </td>
              <td className={celda}>
                <textarea value={a.vigencia} onChange={(e) => cambiar(i, 'vigencia', e.target.value)} rows={2} className={`${campo} resize-y leading-snug`} />
              </td>
              <td className={celda}>
                <div className="flex gap-1 items-start">
                  <textarea value={a.observaciones} onChange={(e) => cambiar(i, 'observaciones', e.target.value)} rows={2} className={`${campo} resize-y leading-snug`} />
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
          onClick={() => set('amparos', [...f.amparos, { amparo: '', valor: '', vigencia: '', observaciones: '' }])}
          className="no-print flex items-center gap-1 mt-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar amparo
        </button>
      )}
    </div>
  );
}

/** Renglón de un bloque de firma. */
function FLine({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}

/**
 * Una fila de la ficha: etiqueta a la izquierda, dato a la derecha. `bold` es del dato
 * —las partes van en negrita en el formato—; la etiqueta va siempre en negrita, porque en
 * la plantilla las dieciséis celdas grises lo están, sin excepción.
 */
function Fila({ label, value, onChange, area, filas = 2, placeholder, bold, enlace }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  filas?: number;
  placeholder?: string;
  bold?: boolean;
  enlace?: boolean;
}) {
  const comun = 'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 '
    + (enlace ? 'text-[#0a2a52] underline ' : 'disabled:text-black ')
    + (bold ? 'font-bold ' : '');
  return (
    <tr>
      {/* Sombreado #E7E6E6: en la plantilla la columna de etiquetas va gris en las dos
          fichas, la de control interno y la particular. */}
      <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[36%] font-bold">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={filas}
            className={comun + 'resize-y leading-snug'} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={comun} />
        )}
      </td>
    </tr>
  );
}
