import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';

/**
 * Contrato de trabajo por duración de obra o labor determinada, plantilla 2026 (el formato
 * «16 Plantilla Contrato Obra Labor Ajustada 2026»).
 *
 * Es un contrato **laboral**, hermano del de término fijo, pero con una diferencia que la
 * plantilla 2026 pone en el centro: acá el vínculo no dura hasta una fecha sino **hasta
 * que la obra o labor termine**, y eso hay que poder demostrarlo. De ahí los tres campos
 * nuevos de la parte inicial:
 *
 *  - **obra o labor determinada**, descrita con precisión y detalle;
 *  - **hito verificable de finalización** —el resultado, etapa o actividad cuya terminación
 *    objetiva extingue el contrato—;
 *  - **fecha estimada**, que la propia plantilla marca como «solo estimativa».
 *
 * El parágrafo de la primera y la décima lo dicen sin rodeos: la fecha es informativa y no
 * reemplaza la terminación real; si la obra no está identificada de forma precisa, o si al
 * terminarla la persona sigue trabajando, la naturaleza del vínculo se determina por las
 * reglas legales. Es decir: un contrato de obra o labor mal descrito se vuelve otra cosa.
 *
 * Lo reparte `ContratoPage` según el tipo y se guarda en `data.contrato`, como las demás.
 */

interface OLState {
  /* ── La parte inicial: la ficha del contrato ── */
  empleadora: string;
  nit: string;
  representanteLegal: string;
  trabajador: string;
  documento: string;
  cargo: string;
  salario: string;
  lugarTrabajo: string;
  fechaInicio: string;
  obraLabor: string;
  hitoFinalizacion: string;
  fechaEstimada: string;

  /* ── Firma del trabajador ── */
  trabajadorCc: string;
  trabajadorLugarCc: string;

  /** Texto de las cláusulas que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * Los huecos van como valores y no como `placeholder`: un placeholder se ve en pantalla
 * pero no se imprime, y el formato en blanco tiene que poder imprimirse para diligenciarlo
 * a mano. Se escriben en la convención de la plantilla —corchetes en mayúscula—.
 */
const EMPTY: OLState = {
  // La empleadora es siempre la misma: va escrita, no en blanco.
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',
  representanteLegal: 'GLORIA LUCÍA ESCALANTE MANZANO',
  trabajador: '[NOMBRE COMPLETO]',
  documento: '[TIPO Y NÚMERO - LUGAR DE EXPEDICIÓN]',
  cargo: '[CARGO]',
  salario: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR])',
  lugarTrabajo: '[SEDE / MUNICIPIO]',
  fechaInicio: '[DD/MM/AAAA]',
  obraLabor: '[DESCRIPCIÓN PRECISA Y DETALLADA DE LA OBRA O LABOR]',
  hitoFinalizacion: '[RESULTADO / ACTIVIDAD / ETAPA CUYA TERMINACIÓN OBJETIVA EXTINGUE EL CONTRATO]',
  fechaEstimada: '[DD/MM/AAAA - SOLO ESTIMATIVA, SI APLICA]',

  trabajadorCc: '[NÚMERO]',
  trabajadorLugarCc: '[LUGAR]',

  textos: {},
};

/**
 * Lo guardado con la plantilla vieja, traído a la nueva.
 *
 * La ficha anterior llamaba `empleado` a quien la de 2026 llama `trabajador`, y guardaba el
 * objeto del contrato donde ahora va la obra o labor. Sin este puente, un contrato a medio
 * diligenciar se abriría en blanco. Lo que la plantilla vieja tenía y esta no —la fecha de
 * nacimiento, el teléfono de la empleadora, la fecha de terminación fija— **no se borra**:
 * sigue en `data.contrato`, solo deja de leerse. Y con razón: una fecha de terminación
 * pactada es justamente lo que este contrato no tiene.
 */
function traerDeLaPlantillaVieja(saved: Record<string, unknown>): Partial<OLState> {
  const texto = (k: string) => (typeof saved[k] === 'string' ? (saved[k] as string).trim() : '');
  const puente: Partial<OLState> = {};
  if (!saved.trabajador && texto('empleado')) puente.trabajador = texto('empleado');
  if (!saved.documento && texto('empleadoCc')) puente.documento = texto('empleadoCc');
  if (!saved.obraLabor && texto('objeto')) puente.obraLabor = texto('objeto');
  if (!saved.lugarTrabajo && texto('lugarEjecucion')) puente.lugarTrabajo = texto('lugarEjecucion');
  return puente;
}

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

/**
 * Las dieciséis cláusulas y el parágrafo, en el orden y con el texto de la plantilla 2026.
 *
 * El parágrafo del hito va en la lista y no dentro del texto de la primera porque en el
 * formato es un bloque aparte, con su propio título en negrita, y porque es el que hay que
 * poder reescribir contrato a contrato: cada obra tiene su hito.
 *
 * Las claves llevan el prefijo `o` —de obra o labor— y son nuevas: la plantilla anterior no
 * guardaba texto editable, así que no hay nada que reutilizar ni con qué chocar.
 */
const CLAUSULAS: { k: string; titulo: string; texto: string }[] = [
  {
    k: 'o1',
    titulo: 'PRIMERA. OBRA O LABOR CONTRATADA Y OBJETO',
    texto: 'La contratación tiene como causa temporal y objetiva la ejecución de la siguiente obra o labor determinada: [DESCRIPCIÓN PRECISA Y DETALLADA]. EL/LA TRABAJADOR(A) desempeñará el cargo de [CARGO] y desarrollará exclusivamente las funciones necesarias, conexas y complementarias para atender dicha obra o labor, según el Manual de Funciones, las instrucciones legítimas de LA EMPLEADORA y el alcance aquí descrito. La sola denominación del cargo no sustituye la obligación de identificar la obra o labor que determina la duración del vínculo.',
  },
  {
    k: 'o1.par',
    titulo: 'PARÁGRAFO - HITO DE FINALIZACIÓN',
    texto: 'Para efectos de determinar objetivamente la terminación del contrato, las partes identifican como hito verificable de finalización: [DESCRIBIR RESULTADO, ETAPA, ACTIVIDAD O CONDICIÓN OBJETIVA]. La fecha estimada indicada en la parte inicial tiene carácter informativo y no reemplaza la terminación real y verificable de la obra o labor contratada.',
  },
  {
    k: 'o2',
    titulo: 'SEGUNDA. LUGAR DE TRABAJO',
    texto: 'EL/LA TRABAJADOR(A) prestará sus servicios principalmente en [SEDE / MUNICIPIO] y en los demás lugares vinculados directamente con la ejecución de la obra o labor. Los traslados deberán respetar los límites legales y no podrán implicar desmejora injustificada de las condiciones laborales.',
  },
  {
    k: 'o3',
    titulo: 'TERCERA. CARGO, FUNCIONES Y DEPENDENCIA',
    texto: 'EL/LA TRABAJADOR(A) ejercerá el cargo de [CARGO] y dependerá de [JEFE / DIRECCIÓN] o de quien formalmente haga sus veces. Las funciones deberán guardar relación material con la obra o labor determinada y con el nivel de responsabilidad del cargo.',
  },
  {
    k: 'o4',
    titulo: 'CUARTA. OBLIGACIONES',
    texto: 'Además de las previstas en la ley, el Reglamento Interno de Trabajo, el Manual de Funciones y las políticas de LA EMPLEADORA, EL/LA TRABAJADOR(A) deberá ejecutar con diligencia las actividades vinculadas a la obra o labor; cumplir instrucciones legítimas; reportar avances, novedades y riesgos; guardar confidencialidad; custodiar documentos, equipos y accesos; cumplir las reglas de seguridad de la información, protección de datos y seguridad y salud en el trabajo; y devolver los elementos suministrados al finalizar el vínculo.',
  },
  {
    k: 'o5',
    titulo: 'QUINTA. ELEMENTOS DE TRABAJO',
    texto: 'LA EMPLEADORA suministrará los elementos y herramientas necesarios para el normal desempeño de las funciones, sin perjuicio del deber de EL/LA TRABAJADOR(A) de cuidarlos, utilizarlos para fines laborales y restituirlos cuando corresponda.',
  },
  {
    k: 'o6',
    titulo: 'SEXTA. REMUNERACIÓN',
    texto: 'LA EMPLEADORA pagará el salario básico mensual indicado en la parte inicial del contrato, en la periodicidad acordada. Se efectuarán las deducciones legalmente autorizadas. Los pagos extralegales solo tendrán naturaleza no salarial cuando legalmente proceda, hayan sido expresamente pactados en tal sentido y no remuneren directamente el servicio; la naturaleza de cada pago dependerá de su finalidad real.',
  },
  {
    k: 'o7',
    titulo: 'SÉPTIMA. TRABAJO SUPLEMENTARIO, NOCTURNO, DOMINICAL Y FESTIVO',
    texto: 'Se reconocerá y remunerará conforme a la legislación vigente. Su ejecución requerirá autorización previa de LA EMPLEADORA, salvo eventos imprevistos e inaplazables que deberán ser informados oportunamente por escrito.',
  },
  {
    k: 'o8',
    titulo: 'OCTAVA. JORNADA DE TRABAJO',
    texto: 'La jornada ordinaria máxima será de cuarenta y dos (42) horas semanales, distribuida conforme a la ley, en los horarios y turnos comunicados por LA EMPLEADORA, garantizando los descansos obligatorios.',
  },
  {
    k: 'o9',
    titulo: 'NOVENA. PERÍODO DE PRUEBA',
    texto: 'Cuando se pacte, el período de prueba deberá constar por escrito y respetar los límites legales aplicables. Para este contrato se acuerda un período de prueba de [DURACIÓN], contado desde [FECHA], sin exceder el máximo permitido por la ley.',
  },
  {
    k: 'o10',
    titulo: 'DÉCIMA. DURACIÓN',
    texto: 'La duración del presente contrato está determinada exclusivamente por el tiempo que tome la realización efectiva de la obra o labor descrita en la cláusula primera. Inicia el [FECHA] y terminará cuando se acredite objetivamente el hito de finalización definido en este documento. Si la obra o labor no se encuentra identificada de forma precisa y detallada, o si una vez finalizada EL/LA TRABAJADOR(A) continúa prestando servicios, la naturaleza del vínculo se determinará conforme a las reglas legales vigentes.',
  },
  {
    k: 'o11',
    titulo: 'DÉCIMA PRIMERA. TERMINACIÓN POR CULMINACIÓN DE LA OBRA O LABOR',
    texto: 'La terminación efectiva y verificable de la obra o labor contratada constituye una causa legal de terminación del contrato, en los términos del artículo 61 del Código Sustantivo del Trabajo. Esta causal no se calificará como “justa causa disciplinaria” y deberá estar respaldada por evidencia objetiva de que la obra o labor específicamente contratada concluyó. Lo anterior se entiende sin perjuicio de las normas sobre estabilidad laboral reforzada y demás protecciones especiales.',
  },
  {
    k: 'o12',
    titulo: 'DÉCIMA SEGUNDA. SEGURIDAD SOCIAL',
    texto: 'LA EMPLEADORA afiliará a EL/LA TRABAJADOR(A) al Sistema de Seguridad Social Integral y efectuará los aportes correspondientes, con los descuentos legalmente a cargo del trabajador(a).',
  },
  {
    k: 'o13',
    titulo: 'DÉCIMA TERCERA. CONFIDENCIALIDAD, DATOS Y SEGURIDAD DE LA INFORMACIÓN',
    texto: 'EL/LA TRABAJADOR(A) guardará reserva sobre la información a la que tenga acceso con ocasión del vínculo, cumplirá las políticas aplicables y tratará los datos personales únicamente para finalidades autorizadas. Al finalizar la relación deberá devolver los documentos, accesos, soportes y demás información en su poder.',
  },
  {
    k: 'o14',
    titulo: 'DÉCIMA CUARTA. PROBIDAD',
    texto: 'EL/LA TRABAJADOR(A) deberá actuar con integridad, buena fe y lealtad y abstenerse de solicitar, recibir, ofrecer o entregar pagos o beneficios indebidos. Las consecuencias laborales solo procederán cuando exista causal válida y se observe el procedimiento aplicable.',
  },
  {
    k: 'o15',
    titulo: 'DÉCIMA QUINTA. OTRAS CAUSALES DE TERMINACIÓN',
    texto: 'Sin perjuicio de la terminación por culminación de la obra o labor, el contrato podrá terminar por las demás causales legales, incluido el mutuo acuerdo, la renuncia, la terminación con justa causa cuando se configure y, cuando proceda, la terminación unilateral sin justa causa con las consecuencias legales correspondientes.',
  },
  {
    k: 'o16',
    titulo: 'DÉCIMA SEXTA. MODIFICACIONES',
    texto: 'Cualquier modificación que afecte la identificación de la obra o labor, el cargo, salario, lugar u otras condiciones esenciales deberá documentarse por escrito cuando corresponda. No podrá utilizarse un otrosí para desdibujar la causa temporal original ni mantener indefinidamente el vínculo bajo una obra o labor ya terminada.',
  },
];

export default function ContratoObraLaborDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;
  /*
   * La solicitud se guarda en estado propio porque la acción de la etapa la cambia: al
   * remitir el contrato a firma, `AccionesFlujo` devuelve la solicitud recargada y con ella
   * se repintan las pestañas y el propio panel.
   */
  const [sol, setSol] = useState(solicitud);
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<OLState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Record<string, unknown> & Partial<OLState>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    /*
     * Lo que ya se escribió en la solicitud y en el acta se trae, que ahorra volver a
     * digitarlo. Solo entra donde el hueco sigue intacto: una vez que alguien escribió en
     * la celda, manda lo escrito.
     */
    const delTramite: Partial<OLState> = {
      trabajador: (d.contratista as string) || '',
      documento: des.contratistaCc || acta.contratistaCc || '',
      salario: (d.honorarios as string) || '',
      obraLabor: (d.objeto as string) || '',
      fechaInicio: acta.fechaInicio || '',
    };
    const base = { ...EMPTY, ...traerDeLaPlantillaVieja(saved), ...saved };
    for (const [k, v] of Object.entries(delTramite)) {
      const clave = k as keyof OLState;
      if (v && base[clave] === EMPTY[clave]) (base as Record<string, unknown>)[clave] = v;
    }
    return { ...base, textos: saved.textos ?? {} };
  });

  const set = <K extends keyof OLState>(k: K, v: OLState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /**
   * Devuelve si se guardó, porque `AccionesFlujo` lo usa para decidir si sigue: remitir a
   * firma un contrato que no se alcanzó a guardar adelantaría el trámite sobre un texto
   * que nadie escribió.
   */
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
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
          /* Una cláusula no se parte entre dos hojas si cabe entera. */
          .bloque { break-inside: avoid; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={irSolicitud} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Obra o labor</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Contrato de trabajo por duración de obra o labor determinada · Solicitud N.º {solicitudId} · Plantilla 2026
            </p>
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

        <div className="max-w-4xl mx-auto px-6 pb-2">
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
          <div className="doc bg-white border border-[hsl(var(--canalco-neutral-300))] text-[12px] text-black shadow-md px-8 py-7">

            {/* Membrete. En el formato es el encabezado de página, que se repite en cada
                hoja; en el navegador se imprime una vez, arriba. El título va centrado y
                las columnas guardan la proporción del formato: 2101 twips contra 8207. */}
            <table className="w-full border-collapse mb-6">
              <tbody>
                <tr>
                  <td className="border border-[hsl(var(--canalco-neutral-400))] px-4 py-3 w-[20%]">
                    <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
                  </td>
                  <td className="border border-[hsl(var(--canalco-neutral-400))] px-4 text-center">
                    <p className="font-bold text-[11pt] text-[hsl(var(--canalco-neutral-600))]">
                      CONTRATO DE TRABAJO POR DURACIÓN DE OBRA O LABOR DETERMINADA
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>

            <h1 className="text-center font-bold text-[13px] mb-4">
              CONTRATO DE TRABAJO POR DURACIÓN DE OBRA O LABOR DETERMINADA
            </h1>

            {/* La parte inicial. Sin recuadro ni sombreado: la plantilla la trae como una
                lista de dos columnas, con la etiqueta en negrita y sin bordes. */}
            <table className="w-full text-[12px] mb-4 bloque">
              <tbody>
                <Fila label="Empleadora" value={f.empleadora} onChange={(v) => set('empleadora', v)} />
                <Fila label="NIT" value={f.nit} onChange={(v) => set('nit', v)} />
                <Fila label="Representante legal" value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} />
                <Fila label="Trabajador(a)" value={f.trabajador} onChange={(v) => set('trabajador', v)} />
                <Fila label="Documento de identidad" value={f.documento} onChange={(v) => set('documento', v)} />
                <Fila label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
                <Fila label="Salario básico mensual" value={f.salario} onChange={(v) => set('salario', v)} />
                <Fila label="Lugar principal de trabajo" value={f.lugarTrabajo} onChange={(v) => set('lugarTrabajo', v)} />
                <Fila label="Fecha de inicio" value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
                {/* Los tres que definen este contrato: qué obra, cómo se sabe que terminó,
                    y una fecha que la plantilla marca como meramente estimativa. */}
                <Fila label="Obra o labor determinada" value={f.obraLabor} onChange={(v) => set('obraLabor', v)} area />
                <Fila label="Hito verificable de finalización" value={f.hitoFinalizacion} onChange={(v) => set('hitoFinalizacion', v)} area />
                <Fila label="Fecha estimada de finalización" value={f.fechaEstimada} onChange={(v) => set('fechaEstimada', v)} />
              </tbody>
            </table>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify">
              <div className="bloque">
                <TextoEd
                  k="o.comparecencia"
                  plantilla={'COMPARECENCIA. Entre los suscritos, GLORIA LUCÍA ESCALANTE MANZANO, mayor de edad, '
                    + 'identificada con cédula de ciudadanía No. 66.651.423 expedida en El Cerrito, actuando como '
                    + 'representante legal de CANALES Y CONTACTOS S.A.S., NIT 900.456.735-7, quien en adelante se '
                    + 'denominará LA EMPLEADORA; y [NOMBRE DEL TRABAJADOR(A)], identificado(a) como aparece en la '
                    + 'parte inicial, quien en adelante se denominará EL/LA TRABAJADOR(A), se celebra el presente '
                    + 'contrato de trabajo por la duración de una obra o labor determinada, el cual deberá '
                    + 'interpretarse de acuerdo con la legislación laboral vigente y las siguientes cláusulas:'}
                />
              </div>

              {CLAUSULAS.map((c) => (
                <div key={c.k} className="bloque space-y-1">
                  <p><b>{c.titulo}:</b></p>
                  <TextoEd k={c.k} plantilla={c.texto} />
                </div>
              ))}

              <div className="bloque">
                <TextoEd
                  k="o.constancia"
                  plantilla="CONSTANCIA: Para constancia se firma en [CIUDAD], a los [DÍA] días del mes de [MES] de [AÑO]."
                />
              </div>
            </div>

            {/* Firmas. La empleadora firma con nombre y empresa a secas —es la misma en
                todos los contratos—; el trabajador sale de la parte inicial. */}
            <div className="grid grid-cols-2 gap-8 mt-12 text-[12px] bloque">
              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">GLORIA LUCÍA ESCALANTE MANZANO</p>
                  <p>Representante Legal</p>
                  <p>CANALES Y CONTACTOS S.A.S.</p>
                  <p>LA EMPLEADORA</p>
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  <FLine value={f.trabajador} onChange={(v) => set('trabajador', v)} bold />
                  <p className="flex items-baseline gap-1">
                    C.C. <FLine value={f.trabajadorCc} onChange={(v) => set('trabajadorCc', v)} ancho="w-[38%]" /> de{' '}
                    <FLine value={f.trabajadorLugarCc} onChange={(v) => set('trabajadorLugarCc', v)} ancho="w-[38%]" />
                  </p>
                  <p>EL/LA TRABAJADOR(A)</p>
                </div>
              </div>
            </div>

            {/* La nota de la plantilla: es una instrucción para quien diligencia —«antes de
                la firma»—, así que se ve en pantalla y no se imprime. Un contrato firmado
                no puede decir que es una plantilla parametrizable. */}
            <p className="no-print mt-8 border border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-100))] px-3 py-2 text-[11px] text-[hsl(var(--canalco-neutral-700))]">
              Plantilla jurídica parametrizable. Los campos entre corchetes [ ] deben diligenciarse y
              validarse antes de la firma.
            </p>
          </div>
          <PieElaboracion />
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

/** Un renglón de la parte inicial: etiqueta en negrita y el dato al lado, sin bordes. */
function Fila({ label, value, onChange, area }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean;
}) {
  const comun = 'w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black';
  return (
    <tr>
      <td className="align-top py-0.5 pr-4 w-[34%] font-bold">{label}</td>
      <td className="align-top py-0.5">
        {area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
            className={comun + ' resize-y leading-snug'} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} className={comun} />
        )}
      </td>
    </tr>
  );
}

/** Renglón de un bloque de firma. */
function FLine({ value, onChange, bold, ancho }: {
  value: string; onChange: (v: string) => void; bold?: boolean; ancho?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={(ancho ?? 'w-full') + ' bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold' : '')}
    />
  );
}
