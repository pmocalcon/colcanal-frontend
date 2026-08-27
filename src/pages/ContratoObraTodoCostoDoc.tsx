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
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';

/**
 * Contrato de obra a todo costo, plantilla marco de régimen privado 2026 (el formato
 * «17 Contrato Obra A Todo Costo»).
 *
 * Es un **tipo de contrato nuevo** en el trámite: no es laboral —no hay empleadora ni
 * trabajador— ni es de prestación de servicios. Se contrata una obra con un tercero, por
 * su cuenta y riesgo, y el precio comprende todos los costos.
 *
 * De ahí lo que este contrato tiene y los otros no:
 *
 *  - la **cláusula segunda**, que define «a todo costo»: salvo exclusión escrita, el precio
 *    cubre todos los costos directos e indirectos, y no se pueden cobrar adicionales que
 *    correspondan al alcance pactado;
 *  - una **regla de prelación** entre los documentos, para cuando el anexo técnico y el
 *    contrato se contradigan;
 *  - la **décima**, que es la que evita el pleito: ninguna instrucción verbal autoriza
 *    obras extras, y lo ejecutado sin autorización escrita lo asume el contratista;
 *  - **recibo, estabilidad y suspensión** como cláusulas propias.
 *
 * Las obligaciones de cada parte van como listas numeradas y no como redacción corrida
 * —doce del contratista y cinco de la contratante—, porque así las trae el formato y
 * porque en una obra son la lista que alguien revisa renglón por renglón.
 *
 * Lo reparte `ContratoPage` según el tipo y se guarda en `data.contrato`, como las demás.
 */

interface TCState {
  /* ── Control interno: no sale en la versión firmable ── */
  ciCodigo: string;
  ciAnexoTecnico: string;
  ciGarantias: string;

  /* ── Ficha particular ── */
  contratante: string;
  contratanteRepLegal: string;
  contratista: string;
  contratistaNit: string;
  contratistaRepLegal: string;
  objeto: string;
  lugarEjecucion: string;
  valorTotal: string;
  anticipo: string;
  plazo: string;
  supervisor: string;
  documentosIntegrantes: string;

  /** Las dos listas de obligaciones. Se agregan y se quitan renglones. */
  obligacionesContratista: string[];
  obligacionesContratante: string[];

  /* ── Firma del contratista ── */
  firmanteContratista: string;
  firmanteCargo: string;
  firmanteRazonSocial: string;

  /** Texto de las cláusulas que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/** Las doce obligaciones del contratista, tal como las trae el formato. */
const OBLIGACIONES_CONTRATISTA = [
  'Ejecutar la obra de conformidad con el contrato, el Anexo Técnico, planos, especificaciones, normas técnicas aplicables y buenas prácticas del oficio.',
  'Suministrar oportunamente personal idóneo, materiales nuevos y de calidad adecuada, equipos, herramientas y recursos necesarios, salvo aquellos expresamente asignados a LA CONTRATANTE.',
  'Mantener un responsable técnico de la obra cuando la naturaleza del proyecto lo requiera y atender las instrucciones del supervisor dentro del alcance contractual.',
  'Presentar programación, informes de avance, registros fotográficos, actas, pruebas, certificados, planos récord/as built, manuales, garantías de fabricante y expediente final cuando corresponda.',
  'Corregir por su cuenta y dentro del plazo indicado los defectos, errores, omisiones o trabajos que no cumplan las especificaciones contratadas.',
  'Cumplir las obligaciones laborales, de seguridad social, parafiscales y del Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST) respecto del personal que utilice, incluyendo requisitos aplicables a trabajo en alturas, elementos de protección personal, inducciones, permisos y gestión de riesgos.',
  'Adoptar medidas de seguridad para proteger personas, bienes, redes, instalaciones y terceros; reportar inmediatamente incidentes, accidentes, daños o condiciones que puedan afectar la ejecución.',
  'Cumplir las obligaciones ambientales y de manejo, retiro y disposición de residuos que resulten aplicables a la obra.',
  'Custodiar los bienes, materiales, áreas o instalaciones que reciba y devolverlos en el estado exigible, salvo deterioro normal autorizado.',
  'No ceder el contrato ni subcontratar actividades esenciales sin autorización previa y escrita de LA CONTRATANTE. La autorización de un subcontrato no libera a EL CONTRATISTA de responsabilidad.',
  'Mantener vigentes las garantías contractuales exigidas y tramitar oportunamente sus modificaciones por prórrogas, adiciones u otros cambios.',
  'Mantener indemne a LA CONTRATANTE frente a reclamaciones atribuibles a incumplimientos laborales, daños a terceros, infracciones de propiedad intelectual, ambientales o de seguridad imputables a EL CONTRATISTA o a su personal, en los términos legalmente procedentes.',
];

/** Las cinco de la contratante. */
const OBLIGACIONES_CONTRATANTE = [
  'Entregar oportunamente la información, accesos o áreas que contractualmente se encuentren a su cargo y sean necesarios para la ejecución.',
  'Designar o informar la supervisión del contrato y efectuar el seguimiento correspondiente.',
  'Revisar los entregables y formular observaciones dentro de un plazo razonable.',
  'Pagar los valores debidamente causados y soportados de acuerdo con la forma de pago pactada.',
  'Suscribir las actas o documentos contractuales que correspondan cuando se cumplan los requisitos aplicables.',
];

/**
 * Los huecos van como valores y no como `placeholder`: un placeholder se ve en pantalla
 * pero no se imprime, y el formato en blanco tiene que poder imprimirse para diligenciarlo
 * a mano. Se escriben en la convención de la plantilla —corchetes en mayúscula—.
 */
const EMPTY: TCState = {
  ciCodigo: '[ASIGNAR POR PMO / GESTIÓN DOCUMENTAL]',
  ciAnexoTecnico: '[OBLIGATORIO / IDENTIFICACIÓN]',
  ciGarantias: '[SEGÚN MATRIZ DE RIESGO Y APROBACIÓN JURÍDICA]',

  // La contratante es siempre la misma: va escrita, no en blanco.
  contratante: 'CANALES Y CONTACTOS S.A.S. - NIT 900.456.735-7',
  contratanteRepLegal: 'GLORIA LUCÍA ESCALANTE MANZANO - C.C. 66.651.423 de El Cerrito',
  contratista: '[RAZÓN SOCIAL / NOMBRE]',
  contratistaNit: '[NÚMERO]',
  contratistaRepLegal: '[NOMBRE / IDENTIFICACIÓN]',
  objeto: '[DESCRIPCIÓN PRECISA DE LA OBRA]',
  lugarEjecucion: '[MUNICIPIO / SEDE / PROYECTO]',
  valorTotal: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR]) [IVA INCLUIDO / MÁS IVA / NO APLICA]',
  anticipo: '[NO APLICA / % Y VALOR]',
  plazo: '[NÚMERO] DÍAS / MESES, CONTADOS DESDE [ACTA DE INICIO / CONDICIÓN]',
  supervisor: '[NOMBRE / CARGO / POR DESIGNAR]',
  documentosIntegrantes: '[ANEXO TÉCNICO / COTIZACIÓN / PRESUPUESTO / CRONOGRAMA / PLANOS / OTROS]',

  obligacionesContratista: [...OBLIGACIONES_CONTRATISTA],
  obligacionesContratante: [...OBLIGACIONES_CONTRATANTE],

  firmanteContratista: '[NOMBRE REPRESENTANTE / CONTRATISTA]',
  firmanteCargo: '[CARGO]',
  firmanteRazonSocial: '[RAZÓN SOCIAL / NIT]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = [
  'contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado',
  'en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado',
];

/** Las cláusulas anteriores a las dos listas de obligaciones. */
const CLAUSULAS_ANTES: { k: string; titulo: string; texto: string }[] = [
  {
    k: 'tc1',
    titulo: 'PRIMERA. OBJETO Y ALCANCE',
    texto: 'EL CONTRATISTA se obliga, por su cuenta y riesgo, a ejecutar y entregar a satisfacción de LA CONTRATANTE la obra descrita en la ficha particular y en el Anexo Técnico, incluyendo todas las actividades, suministros, materiales, mano de obra, equipos, herramientas, transporte, pruebas, certificados, permisos y demás recursos expresamente asignados a su cargo. El alcance específico será el previsto en el Anexo Técnico y en los documentos incorporados al contrato.',
  },
  {
    k: 'tc2',
    titulo: 'SEGUNDA. NATURALEZA “A TODO COSTO”',
    texto: 'Salvo exclusión expresa consignada por escrito, el precio comprende todos los costos directos e indirectos necesarios para la ejecución integral de la obra conforme al alcance contratado. EL CONTRATISTA declara haber evaluado las condiciones ordinariamente previsibles de ejecución y no podrá cobrar actividades, materiales o costos adicionales que correspondan al alcance pactado. Las obras adicionales, mayores cantidades o cambios de especificación requerirán autorización escrita previa de LA CONTRATANTE y, cuando impliquen modificación del valor, plazo o alcance, el correspondiente documento contractual.',
  },
  {
    k: 'tc3',
    titulo: 'TERCERA. DOCUMENTOS CONTRACTUALES Y PRELACIÓN',
    texto: 'Forman parte del contrato, según corresponda: la ficha particular, el Anexo Técnico, la propuesta aceptada, el presupuesto, el cronograma, los planos, especificaciones, actas, modificaciones y demás documentos expresamente incorporados. En caso de contradicción prevalecerá el contrato y sus otrosíes; luego el Anexo Técnico; y posteriormente los demás documentos, salvo que las partes acuerden por escrito otra regla de prelación.',
  },
  {
    k: 'tc4',
    titulo: 'CUARTA. VALOR Y FORMA DE PAGO',
    texto: 'El valor total será el indicado en la ficha particular. Los pagos se efectuarán contra los hitos allí definidos y previa presentación de factura o cuenta de cobro, acta de avance o recibo correspondiente, soportes de seguridad social y parafiscales cuando apliquen, informe del supervisor y demás documentos exigidos. Ningún pago implica aceptación definitiva de trabajos defectuosos ni libera a EL CONTRATISTA de sus obligaciones de corrección, calidad o estabilidad.',
  },
  {
    k: 'tc5',
    titulo: 'QUINTA. ANTICIPO, SI APLICA',
    texto: 'Cuando se pacte anticipo, su porcentaje, destinación, forma de desembolso, amortización, soportes y garantía se definirán en la ficha particular o anexo financiero. EL CONTRATISTA deberá utilizarlo exclusivamente en la ejecución del contrato y rendir los soportes que le sean requeridos. Si no se diligencia este campo, se entenderá que no existe anticipo.',
  },
  {
    k: 'tc6',
    titulo: 'SEXTA. PLAZO, INICIO Y CRONOGRAMA',
    texto: 'La ejecución iniciará cuando se cumplan las condiciones pactadas y se suscriba el acta de inicio, cuando esta sea exigida. EL CONTRATISTA ejecutará la obra dentro del plazo contractual y del cronograma aprobado. Las prórrogas, suspensiones o reinicios deberán constar por escrito. Los retrasos imputables a EL CONTRATISTA no generan ampliación automática del plazo.',
  },
];

/** Las que van después de las obligaciones, de la novena a la vigésima segunda. */
const CLAUSULAS_DESPUES: { k: string; titulo: string; texto: string }[] = [
  {
    k: 'tc9',
    titulo: 'NOVENA. SUPERVISIÓN',
    texto: 'La supervisión verificará el cumplimiento del objeto, plazo, calidad, avance, soportes y demás condiciones del contrato. Sus observaciones no modifican por sí solas el alcance, valor o plazo. Cualquier modificación deberá formalizarse por quienes tengan facultad para ello.',
  },
  {
    k: 'tc10',
    titulo: 'DÉCIMA. CAMBIOS, MAYORES CANTIDADES Y OBRAS ADICIONALES',
    texto: 'Ninguna instrucción verbal autoriza obras extras ni genera derecho automático a pago adicional. Antes de ejecutar una actividad no incluida en el alcance, deberá existir autorización escrita que identifique la actividad y, cuando corresponda, su precio, impacto en el plazo y fuente de recursos. Lo ejecutado sin dicha autorización será asumido por EL CONTRATISTA, salvo reconocimiento escrito posterior de LA CONTRATANTE.',
  },
  {
    k: 'tc11',
    titulo: 'DÉCIMA PRIMERA. GARANTÍAS',
    texto: 'EL CONTRATISTA constituirá únicamente las garantías expresamente exigidas para el caso, con los amparos, valores y vigencias definidos en el contrato, en la ficha particular o en la instrucción aprobada de riesgos. Cuando el inicio dependa de su aprobación, no podrá iniciarse la ejecución hasta que dicha aprobación conste por escrito. EL CONTRATISTA deberá ampliar, prorrogar o restablecer las garantías cuando corresponda.',
  },
  {
    k: 'tc12',
    titulo: 'DÉCIMA SEGUNDA. RECIBO DE LA OBRA',
    texto: 'El recibo se documentará mediante acta o constancia suscrita por quienes correspondan. Si existen pendientes menores que no impidan el uso seguro de la obra, podrán identificarse en una lista de pendientes con plazo de corrección. El recibo no extingue las garantías de calidad, estabilidad ni la responsabilidad por defectos ocultos cuando legal o contractualmente procedan.',
  },
  {
    k: 'tc13',
    titulo: 'DÉCIMA TERCERA. ESTABILIDAD Y GARANTÍA DE LOS TRABAJOS',
    texto: 'EL CONTRATISTA responderá por la calidad y estabilidad de la obra durante el período contractual o legal aplicable y atenderá, a su costo, las reparaciones derivadas de defectos imputables a la ejecución, materiales o procedimientos a su cargo. La duración concreta de la garantía se indicará en la ficha particular, el Anexo Técnico o la póliza aprobada.',
  },
  {
    k: 'tc14',
    titulo: 'DÉCIMA CUARTA. RESPONSABILIDAD',
    texto: 'Cada parte responderá por los daños que le sean jurídicamente imputables. EL CONTRATISTA conserva la dirección técnica y administrativa de su personal y de los medios utilizados para la ejecución, sin que exista subordinación laboral frente a LA CONTRATANTE.',
  },
  {
    k: 'tc15',
    titulo: 'DÉCIMA QUINTA. SUSPENSIÓN',
    texto: 'La ejecución podrá suspenderse por acuerdo escrito de las partes o por circunstancias que objetivamente impidan continuar. El acta de suspensión deberá indicar causa, fecha, obligaciones que continúan vigentes y, cuando sea posible, condiciones de reinicio. La suspensión no implica por sí misma reconocimiento de mayores costos.',
  },
  {
    k: 'tc16',
    titulo: 'DÉCIMA SEXTA. TERMINACIÓN',
    texto: 'El contrato terminará por cumplimiento del objeto y recibo final, vencimiento del plazo cuando corresponda, mutuo acuerdo, imposibilidad definitiva de ejecución, incumplimiento grave o por las demás causales pactadas o legalmente procedentes. Cuando se invoque incumplimiento, se documentará la situación y se garantizará la oportunidad de pronunciamiento de la parte requerida antes de adoptar las medidas contractuales que correspondan, salvo urgencia o excepción legal debidamente sustentada.',
  },
  {
    k: 'tc17',
    titulo: 'DÉCIMA SÉPTIMA. CONFIDENCIALIDAD Y DATOS',
    texto: 'Las partes protegerán la información reservada o confidencial a la que accedan y tratarán los datos personales de conformidad con la finalidad autorizada y la normativa aplicable. Al terminar el contrato, EL CONTRATISTA deberá devolver o eliminar la información cuando así se le instruya y no exista deber legal de conservación.',
  },
  {
    k: 'tc18',
    titulo: 'DÉCIMA OCTAVA. FUERZA MAYOR O CASO FORTUITO',
    texto: 'La parte afectada deberá informar oportunamente la ocurrencia del evento, acreditar su incidencia sobre la ejecución y adoptar medidas razonables para mitigar sus efectos. Las partes definirán por escrito los ajustes que resulten necesarios.',
  },
  {
    k: 'tc19',
    titulo: 'DÉCIMA NOVENA. CESIÓN',
    texto: 'Ninguna de las partes podrá ceder su posición contractual sin autorización previa, expresa y escrita de la otra, salvo disposición legal o acuerdo distinto.',
  },
  {
    k: 'tc20',
    titulo: 'VIGÉSIMA. SOLUCIÓN DE CONTROVERSIAS Y LEY APLICABLE',
    texto: 'El contrato se regirá por las leyes de la República de Colombia. Las partes procurarán resolver directamente cualquier diferencia durante [NÚMERO] días calendario desde el requerimiento escrito. Si no existe acuerdo, la controversia se someterá a [JURISDICCIÓN ORDINARIA / CONCILIACIÓN / ARBITRAJE, SEGÚN DEFINICIÓN DEL CASO].',
  },
  {
    k: 'tc21',
    titulo: 'VIGÉSIMA PRIMERA. NOTIFICACIONES',
    texto: 'Las comunicaciones contractuales se enviarán a los correos y direcciones consignados en la ficha particular. Los cambios deberán informarse por escrito.',
  },
  {
    k: 'tc22',
    titulo: 'VIGÉSIMA SEGUNDA. INTEGRIDAD Y MODIFICACIONES',
    texto: 'El contrato y sus anexos constituyen el acuerdo aplicable sobre su objeto. Cualquier modificación, adición, prórroga o aclaración deberá constar por escrito y ser suscrita por quienes se encuentren facultados.',
  },
];

export default function ContratoObraTodoCostoDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;

  const [sol, setSol] = useState(solicitud);
  const [saving, setSaving] = useState(false);

  // Solo lo guardado sobre la plantilla: nada se prellena desde la solicitud. El formato
  // trae sus propios huecos y sustituirlos por datos sueltos dejaría una ficha a medias,
  // con unas celdas diligenciadas y otras no.
  const [f, setF] = useState<TCState>(() => {
    const saved = (solicitud.data?.contrato ?? {}) as Partial<TCState>;
    return {
      ...EMPTY,
      ...saved,
      obligacionesContratista: saved.obligacionesContratista?.length
        ? saved.obligacionesContratista : EMPTY.obligacionesContratista,
      obligacionesContratante: saved.obligacionesContratante?.length
        ? saved.obligacionesContratante : EMPTY.obligacionesContratante,
      textos: saved.textos ?? {},
    };
  });

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const set = <K extends keyof TCState>(k: K, v: TCState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

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

  const irSolicitud = () => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`);

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
          /* Una cláusula no se parte entre dos hojas si cabe entera. */
          .bloque { break-inside: avoid; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Contrato de obra a todo costo</h1>
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {solicitudId} · Plantilla marco 2026, régimen privado</p>
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
        <AccionesFlujo
          sol={sol} documento="contrato" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">Este contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita en la etapa de elaboración del contrato.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={irSolicitud}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-8 py-6">

            {/* Membrete */}
            <div className="flex items-center justify-between mb-3">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
              <div className="text-center px-3">
                <h1 className="font-bold text-[13px]">CONTRATO DE OBRA A TODO COSTO</h1>
                {/* Rótulo interno: un contrato firmado no puede decir «plantilla marco». */}
                <p className="no-print font-bold text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                  PLANTILLA MARCO - RÉGIMEN PRIVADO
                </p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-14 object-contain" />
            </div>

            <p className="text-[11px] font-bold mb-4">NIT 900.456.735-7</p>

            {/* La plantilla lo dice en su propio título: no se muestra en la versión
                firmable. Va `no-print`, que es la única forma de que la instrucción se
                cumpla sola y no dependa de que alguien se acuerde de borrarlo. */}
            <table className="no-print w-full border-collapse text-[12px] mb-4">
              <tbody>
                <tr>
                  <td className="border border-[#0a2a52] bg-[#fff2cc] px-2 py-1.5 align-middle w-[36%] font-bold text-[11px]">
                    CONTROL INTERNO - NO MOSTRAR EN VERSIÓN FIRMABLE
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1.5 align-top text-[11px] leading-snug">
                    La ficha particular, el anexo técnico, el presupuesto, el cronograma, los hitos de pago y
                    las garantías deben diligenciarse para cada contratación.
                  </td>
                </tr>
                <Fila label="Código documental" value={f.ciCodigo} onChange={(v) => set('ciCodigo', v)} />
                <Fila label="Anexo técnico" value={f.ciAnexoTecnico} onChange={(v) => set('ciAnexoTecnico', v)} />
                <Fila label="Garantías" value={f.ciGarantias} onChange={(v) => set('ciGarantias', v)} />
              </tbody>
            </table>

            <h2 className="text-center font-bold my-3">FICHA PARTICULAR DEL CONTRATO</h2>

            <table className="w-full border-collapse text-[12px] bloque">
              <tbody>
                <Fila label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                <Fila label="Representante legal" value={f.contratanteRepLegal} onChange={(v) => set('contratanteRepLegal', v)} area />
                <Fila label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
                <Fila label="NIT / CC" value={f.contratistaNit} onChange={(v) => set('contratistaNit', v)} />
                <Fila label="Representante legal" value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} />
                <Fila label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area filas={3} />
                <Fila label="Lugar de ejecución" value={f.lugarEjecucion} onChange={(v) => set('lugarEjecucion', v)} />
                <Fila label="Valor total" value={f.valorTotal} onChange={(v) => set('valorTotal', v)} area />
                <Fila label="Anticipo" value={f.anticipo} onChange={(v) => set('anticipo', v)} />
                <Fila label="Plazo" value={f.plazo} onChange={(v) => set('plazo', v)} area />
                <Fila label="Supervisor" value={f.supervisor} onChange={(v) => set('supervisor', v)} />
                <Fila label="Documentos integrantes" value={f.documentosIntegrantes} onChange={(v) => set('documentosIntegrantes', v)} area />
              </tbody>
            </table>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <div className="bloque">
                <TextoEd
                  k="tc.comparecencia"
                  plantilla={'Entre los suscritos, GLORIA LUCÍA ESCALANTE MANZANO, identificada con cédula de '
                    + 'ciudadanía No. 66.651.423 expedida en El Cerrito, actuando como representante legal de '
                    + 'CANALES Y CONTACTOS S.A.S., identificada con NIT 900.456.735-7, quien para efectos del '
                    + 'presente contrato se denominará LA CONTRATANTE, y [NOMBRE O RAZÓN SOCIAL DEL CONTRATISTA], '
                    + 'identificado(a) con [CC/NIT] No. [NÚMERO], representado(a) legalmente por [NOMBRE], '
                    + 'identificado(a) con [CC] No. [NÚMERO], quien se denominará EL CONTRATISTA, hemos convenido '
                    + 'celebrar el presente CONTRATO DE OBRA A TODO COSTO, regido por las siguientes cláusulas:'}
                />
              </div>

              {CLAUSULAS_ANTES.map((c) => (
                <div key={c.k} className="bloque space-y-1">
                  <p><b>{c.titulo}:</b></p>
                  <TextoEd k={c.k} plantilla={c.texto} />
                </div>
              ))}

              {/* Las dos listas. En el formato van bajo un título centrado y sin ordinal;
                  son las cláusulas séptima y octava, aunque el documento no las numere. */}
              <h3 className="text-center font-bold pt-2">OBLIGACIONES DEL CONTRATISTA</h3>
              <Lista
                items={f.obligacionesContratista}
                onChange={(v) => set('obligacionesContratista', v)}
                editable={editable}
                etiqueta="obligación"
              />

              <h3 className="text-center font-bold pt-2">OBLIGACIONES DE LA CONTRATANTE</h3>
              <Lista
                items={f.obligacionesContratante}
                onChange={(v) => set('obligacionesContratante', v)}
                editable={editable}
                etiqueta="obligación"
              />

              {CLAUSULAS_DESPUES.map((c) => (
                <div key={c.k} className="bloque space-y-1">
                  <p><b>{c.titulo}:</b></p>
                  <TextoEd k={c.k} plantilla={c.texto} />
                </div>
              ))}

              <div className="bloque">
                <TextoEd
                  k="tc.constancia"
                  plantilla="Para constancia, se suscribe en [CIUDAD], a los [DÍA] días del mes de [MES] de [AÑO]."
                />
              </div>
            </div>

            {/* Firmas. La contratante firma con nombre y empresa a secas: la ficha los lleva
                con su identificación y sobre una línea de firma eso no va. */}
            <div className="grid grid-cols-2 gap-8 mt-12 text-[12px] bloque">
              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">GLORIA LUCÍA ESCALANTE MANZANO</p>
                  <p>Representante Legal</p>
                  <p>CANALES Y CONTACTOS S.A.S.</p>
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  <FLine value={f.firmanteContratista} onChange={(v) => set('firmanteContratista', v)} bold />
                  <FLine value={f.firmanteCargo} onChange={(v) => set('firmanteCargo', v)} />
                  <FLine value={f.firmanteRazonSocial} onChange={(v) => set('firmanteRazonSocial', v)} />
                </div>
              </div>
            </div>

            <PieMembrete />
          </div>
          {/* «Revisó», como la plantilla: quien aprueba el contrato no es quien lo firma. */}
          <PieElaboracion etiqueta="Revisó" />
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
 * Una lista numerada de obligaciones.
 *
 * Se pueden agregar y quitar renglones: cuáles obligaciones lleva una obra depende de lo
 * que se contrató —una sin personal en alturas no necesita el punto 6, y una con anticipo
 * suele necesitar más—. El número se pinta y no se guarda, así que quitar un renglón
 * renumera el resto solo.
 */
function Lista({ items, onChange, editable, etiqueta }: {
  items: string[];
  onChange: (v: string[]) => void;
  editable: boolean;
  etiqueta: string;
}) {
  const cambiar = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="space-y-1.5">
      {items.map((texto, i) => (
        <div key={i} className="flex gap-2 items-start pl-4 bloque">
          {/* El número va en negrita y el texto no, como en la plantilla. */}
          <span className="w-6 flex-shrink-0 tabular-nums font-bold">{i + 1}.</span>
          <textarea
            value={texto}
            onChange={(e) => cambiar(i, e.target.value)}
            rows={2}
            className="flex-grow min-w-0 bg-transparent outline-none text-[12.5px] resize-y leading-relaxed text-justify disabled:opacity-100 disabled:text-black"
          />
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title={`Quitar esta ${etiqueta}`}
              className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0 mt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="no-print flex items-center gap-1 pl-4 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar {etiqueta}
        </button>
      )}
    </div>
  );
}

/** Renglón de un bloque de firma. */
function FLine({ value, onChange, bold }: {
  value: string; onChange: (v: string) => void; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={'w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}

/**
 * Una fila de las fichas: etiqueta a la izquierda, dato a la derecha.
 *
 * La columna de etiquetas va sombreada en #E7E6E6 y en negrita, que es como la trae la
 * plantilla en sus quince celdas, sin excepción.
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
      <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[30%] font-bold">{label}</td>
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
