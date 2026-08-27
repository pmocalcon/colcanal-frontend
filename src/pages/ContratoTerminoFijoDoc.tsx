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
 * Contrato individual de trabajo a término fijo, plantilla 2026 (el formato «15 Plantilla
 * Contrato Termino Fijo Ajustada 2026»).
 *
 * Es un contrato **laboral**, no de prestación: hay empleadora y trabajador(a), salario,
 * jornada, período de prueba y seguridad social. Lo reparte `ContratoPage` según el tipo y
 * se guarda en `data.contrato`, como las otras plantillas de contrato.
 *
 * Igual que la de prestación, la plantilla 2026 puso **todo lo variable en la parte
 * inicial** y las cláusulas la referencian: la sexta dice «el salario básico mensual
 * indicado en la parte inicial» en vez de repetir la cifra. Antes el salario aparecía dos
 * veces y bastaba corregir una para que el contrato se contradijera.
 *
 * Lo que trae de nuevo, y hay que mirar al diligenciarlo:
 *  - la jornada máxima es de **cuarenta y dos (42) horas** semanales;
 *  - las prórrogas quedan sujetas al artículo 46 del CST **modificado por la Ley 2466 de
 *    2025**, con su límite máximo y el preaviso de treinta días;
 *  - el período de prueba se acota: si el término inicial es menor a un año, no puede
 *    pasar de la quinta parte ni de dos meses.
 *
 * El texto de las cláusulas se edita, como en las demás: la plantilla es el punto de
 * partida y solo se guarda lo que Jurídica cambie (`textos`, por clave).
 */

interface TFState {
  /* ── La parte inicial: la ficha del contrato ── */
  empleadora: string;
  nit: string;
  domicilioEmpleadora: string;
  trabajador: string;
  documento: string;
  contacto: string;
  cargo: string;
  dependencia: string;
  salario: string;
  periodoPago: string;
  fechaInicio: string;
  fechaTerminacion: string;
  terminoInicial: string;

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
const EMPTY: TFState = {
  // La empleadora es siempre la misma: va escrita, no en blanco.
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',
  domicilioEmpleadora: 'Calle 13A No. 101-60, Ciudad Jardín, Cali (Valle del Cauca)',
  trabajador: '[NOMBRE COMPLETO]',
  documento: '[TIPO Y NÚMERO - LUGAR DE EXPEDICIÓN]',
  contacto: '[DIRECCIÓN] / [CORREO] / [CELULAR]',
  cargo: '[CARGO]',
  dependencia: '[ÁREA O DIRECCIÓN]',
  salario: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR])',
  periodoPago: '[MENSUAL / QUINCENAL]',
  fechaInicio: '[DD/MM/AAAA]',
  fechaTerminacion: '[DD/MM/AAAA]',
  terminoInicial: '[NÚMERO] [MESES/AÑOS]',

  trabajadorCc: '[NÚMERO]',
  trabajadorLugarCc: '[LUGAR]',

  textos: {},
};

/**
 * Lo guardado con la plantilla vieja, traído a la nueva.
 *
 * Los campos se llamaban en femenino —`trabajadora`, `direccionTrabajadora`— porque la
 * plantilla anterior estaba redactada para una trabajadora concreta; la de 2026 usa
 * «EL/LA TRABAJADOR(A)». Sin este puente, un contrato a medio diligenciar se abriría en
 * blanco. Lo que la plantilla vieja tenía y esta no —el lugar y la fecha de nacimiento,
 * la duración suelta— **no se borra**: sigue en `data.contrato`, solo deja de leerse.
 */
function traerDeLaPlantillaVieja(saved: Record<string, unknown>): Partial<TFState> {
  const texto = (k: string) => (typeof saved[k] === 'string' ? (saved[k] as string).trim() : '');
  const puente: Partial<TFState> = {};
  if (!saved.trabajador && texto('trabajadora')) puente.trabajador = texto('trabajadora');
  if (!saved.documento && texto('trabajadoraCc')) puente.documento = texto('trabajadoraCc');
  if (!saved.contacto && texto('direccionTrabajadora')) puente.contacto = texto('direccionTrabajadora');
  if (!saved.periodoPago && texto('periodosPago')) puente.periodoPago = texto('periodosPago');
  if (!saved.fechaInicio && texto('fechaIniciacion')) puente.fechaInicio = texto('fechaIniciacion');
  return puente;
}

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

/**
 * Las diecisiete cláusulas, en el orden y con el texto de la plantilla 2026.
 *
 * Van en una constante y no sueltas en el JSX porque así se leen de corrido y se comparan
 * contra el formato sin tener que saltarse el marcado.
 *
 * Las claves llevan el prefijo `t` —de término fijo— y son nuevas: la plantilla anterior
 * no guardaba texto editable, así que no hay nada que reutilizar ni con qué chocar.
 */
const CLAUSULAS: { k: string; titulo: string; texto: string }[] = [
  {
    k: 't1',
    titulo: 'PRIMERA. OBJETO',
    texto: 'LA EMPLEADORA contrata los servicios personales de EL/LA TRABAJADOR(A) para desempeñar el cargo de [CARGO], adscrito(a) a [DEPENDENCIA]. EL/LA TRABAJADOR(A) se obliga a poner al servicio de LA EMPLEADORA su capacidad normal de trabajo, conocimientos y experiencia; cumplir las funciones del cargo, el Manual de Funciones y las labores conexas y complementarias compatibles con su formación y nivel de responsabilidad; y atender las órdenes e instrucciones legítimas impartidas por LA EMPLEADORA o por quien ejerza la jefatura correspondiente.',
  },
  {
    k: 't2',
    titulo: 'SEGUNDA. LUGAR DE TRABAJO',
    texto: 'EL/LA TRABAJADOR(A) prestará sus servicios principalmente en [SEDE / MUNICIPIO] y en los demás lugares dentro del territorio nacional en los que LA EMPLEADORA desarrolle su objeto y requiera razonablemente su presencia. Los cambios de lugar o traslados deberán respetar la dignidad, los derechos mínimos y las condiciones laborales, y los gastos que legalmente correspondan serán asumidos por LA EMPLEADORA.',
  },
  {
    k: 't3',
    titulo: 'TERCERA. CARGO, FUNCIONES Y DEPENDENCIA',
    texto: 'EL/LA TRABAJADOR(A) dependerá jerárquica y funcionalmente de [CARGO DEL JEFE / DIRECCIÓN] o de quien formalmente haga sus veces. La asignación de funciones adicionales procederá cuando sean conexas, complementarias y compatibles con el cargo, sin desconocer derechos mínimos ni generar desmejoras sustanciales.',
  },
  {
    k: 't4',
    titulo: 'CUARTA. OBLIGACIONES',
    texto: 'Además de las previstas en la ley, el Reglamento Interno de Trabajo, el Manual de Funciones y las políticas de LA EMPLEADORA, EL/LA TRABAJADOR(A) deberá ejecutar sus actividades con diligencia y buena fe; reportar oportunamente avances, riesgos y novedades; custodiar los documentos, equipos y accesos entregados; guardar reserva sobre la información conocida por razón de su cargo; cumplir las reglas de seguridad de la información, protección de datos y seguridad y salud en el trabajo; y devolver los elementos y documentos cuando sean requeridos o termine el vínculo.',
  },
  {
    k: 't5',
    titulo: 'QUINTA. ELEMENTOS DE TRABAJO',
    texto: 'LA EMPLEADORA suministrará los elementos, herramientas y accesos necesarios para el normal desempeño del cargo. EL/LA TRABAJADOR(A) deberá utilizarlos exclusivamente para fines laborales, conservarlos adecuadamente y restituirlos cuando corresponda.',
  },
  {
    k: 't6',
    titulo: 'SEXTA. REMUNERACIÓN',
    texto: 'LA EMPLEADORA pagará a EL/LA TRABAJADOR(A) el salario básico mensual indicado en la parte inicial del contrato, en la periodicidad allí señalada. Se efectuarán las deducciones y retenciones legalmente autorizadas. Los auxilios, beneficios o reconocimientos extralegales que no tengan como finalidad remunerar directamente el servicio y que sean expresamente pactados como no salariales no constituirán factor salarial, conforme a la legislación aplicable; la naturaleza de cada pago atenderá a su finalidad real.',
  },
  {
    k: 't7',
    titulo: 'SÉPTIMA. TRABAJO SUPLEMENTARIO, NOCTURNO, DOMINICAL Y FESTIVO',
    texto: 'El trabajo suplementario, nocturno, dominical o festivo se reconocerá y remunerará conforme a la normativa vigente. Su ejecución requerirá autorización previa de LA EMPLEADORA, salvo situaciones imprevistas e inaplazables que deberán ser informadas por escrito a la mayor brevedad. LA EMPLEADORA llevará los registros exigidos por la ley.',
  },
  {
    k: 't8',
    titulo: 'OCTAVA. JORNADA DE TRABAJO',
    texto: 'La jornada ordinaria máxima será de cuarenta y dos (42) horas semanales, distribuida conforme a la legislación vigente, en los horarios y turnos comunicados por LA EMPLEADORA, garantizando los descansos obligatorios. Los horarios podrán ajustarse razonablemente según las necesidades del servicio y dentro de los límites legales.',
  },
  {
    k: 't9',
    titulo: 'NOVENA. PERÍODO DE PRUEBA',
    texto: 'Si las partes acuerdan período de prueba, este deberá constar por escrito y no podrá exceder los límites legales. Cuando el término inicial del contrato sea inferior a un (1) año, el período de prueba no podrá ser superior a la quinta parte del término inicialmente pactado ni exceder de dos (2) meses. Para este contrato se pacta un período de prueba de [NÚMERO DE DÍAS / MESES], contado desde [FECHA]. Durante dicho período cualquiera de las partes podrá terminar el contrato en los términos de la ley.',
  },
  {
    k: 't10',
    titulo: 'DÉCIMA. DURACIÓN Y PRÓRROGAS',
    texto: 'El presente contrato se celebra a término fijo por el período comprendido entre [FECHA INICIO] y [FECHA TERMINACIÓN]. El término inicial y todas sus prórrogas, pactadas o automáticas, estarán sujetos al límite máximo y a las reglas vigentes del artículo 46 del Código Sustantivo del Trabajo, modificado por la Ley 2466 de 2025. Si alguna de las partes no desea que opere la prórroga automática deberá comunicarlo por escrito con una antelación no inferior a treinta (30) días respecto de la fecha de vencimiento. En ningún caso la utilización de esta modalidad podrá desconocer los límites legales aplicables.',
  },
  {
    k: 't11',
    titulo: 'DÉCIMA PRIMERA. SEGURIDAD SOCIAL',
    texto: 'LA EMPLEADORA afiliará a EL/LA TRABAJADOR(A) al Sistema de Seguridad Social Integral y efectuará los aportes correspondientes, practicando los descuentos legalmente a cargo del trabajador(a).',
  },
  {
    k: 't12',
    titulo: 'DÉCIMA SEGUNDA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS',
    texto: 'EL/LA TRABAJADOR(A) deberá actuar con integridad, transparencia y lealtad. Queda prohibido solicitar, recibir, aceptar, ofrecer o entregar pagos, comisiones, beneficios o dádivas indebidas relacionados con proveedores, contratistas, clientes, servidores públicos o terceros. Cualquier consecuencia laboral requerirá la configuración de una causal válida y la observancia del procedimiento aplicable.',
  },
  {
    k: 't13',
    titulo: 'DÉCIMA TERCERA. CONFIDENCIALIDAD Y SEGURIDAD DE LA INFORMACIÓN',
    texto: 'EL/LA TRABAJADOR(A) guardará reserva sobre la información confidencial o reservada a la que tenga acceso por razón de sus funciones, incluso después de terminado el vínculo cuando la naturaleza de la información así lo exija. Deberá cumplir las políticas corporativas de seguridad de la información y devolver o eliminar, según instrucción, la información y accesos puestos a su disposición.',
  },
  {
    k: 't14',
    titulo: 'DÉCIMA CUARTA. PROTECCIÓN DE DATOS PERSONALES',
    texto: 'EL/LA TRABAJADOR(A) autoriza y se obliga al tratamiento de datos personales en los términos de la ley y de las políticas internas aplicables, exclusivamente para las finalidades legítimas derivadas de la relación laboral y de sus funciones.',
  },
  {
    k: 't15',
    titulo: 'DÉCIMA QUINTA. TERMINACIÓN',
    texto: 'El contrato terminará por las causales previstas en la ley. La expiración del plazo fijo pactado producirá la terminación cuando se haya cumplido el preaviso exigido para evitar la prórroga automática. La terminación con justa causa requerirá la existencia de una causal legal o contractual válida y, cuando corresponda, el respeto del debido proceso y del derecho de defensa. Lo anterior se entiende sin perjuicio de las normas de estabilidad laboral reforzada y demás protecciones especiales aplicables.',
  },
  {
    k: 't16',
    titulo: 'DÉCIMA SEXTA. MODIFICACIONES',
    texto: 'Cualquier modificación de las condiciones esenciales del presente contrato deberá constar por escrito cuando la ley lo exija o cuando resulte necesario para su adecuada trazabilidad. Las facultades de dirección y subordinación se ejercerán dentro de los límites legales, sin afectar la dignidad ni los derechos mínimos de EL/LA TRABAJADOR(A).',
  },
  {
    k: 't17',
    titulo: 'DÉCIMA SÉPTIMA. INTEGRIDAD DEL CONTRATO',
    texto: 'El presente documento, junto con el Reglamento Interno de Trabajo, el Manual de Funciones y las políticas válidamente incorporadas a la relación laboral, contiene las condiciones aplicables al vínculo. La nulidad o ineficacia de una estipulación no afectará las demás, que se interpretarán de conformidad con las normas laborales imperativas.',
  },
];

export default function ContratoTerminoFijoDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;
  /*
   * La solicitud se guarda en estado propio porque la acción de la etapa la cambia:
   * al remitir el contrato a firma, `AccionesFlujo` devuelve la solicitud recargada y
   * con ella se repintan las pestañas y el propio panel. Leyendo siempre la prop, la
   * pantalla se quedaría mostrando la etapa anterior hasta que alguien recargara.
   */
  const [sol, setSol] = useState(solicitud);
  const editable = puedeEditar(user?.nombreRol);
  const habilitada = HABILITADO.includes(sol.estado);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<TFState>(() => {
    const d = solicitud.data ?? {};
    const saved = (d.contrato ?? {}) as Record<string, unknown> & Partial<TFState>;
    const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
    const acta = (d.actaInicio ?? {}) as Record<string, string>;
    /*
     * Lo que ya se escribió en la solicitud y en el acta se trae, que es lo que hacía la
     * plantilla anterior y ahorra volver a digitarlo. Solo entra donde el hueco sigue
     * intacto: una vez que alguien escribió en la celda, manda lo escrito.
     */
    const delTramite: Partial<TFState> = {
      trabajador: (d.contratista as string) || '',
      documento: des.contratistaCc || acta.contratistaCc || '',
      contacto: acta.direccion || '',
      salario: (d.honorarios as string) || '',
      periodoPago: (d.formaPago as string) || '',
      fechaInicio: acta.fechaInicio || '',
      fechaTerminacion: acta.fechaFinal || '',
    };
    const base = { ...EMPTY, ...traerDeLaPlantillaVieja(saved), ...saved };
    for (const [k, v] of Object.entries(delTramite)) {
      const clave = k as keyof TFState;
      if (v && base[clave] === EMPTY[clave]) (base as Record<string, unknown>)[clave] = v;
    }
    return { ...base, textos: saved.textos ?? {} };
  });

  const set = <K extends keyof TFState>(k: K, v: TFState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  /**
   * Devuelve si se guardó, porque `AccionesFlujo` lo usa para decidir si sigue: la acción
   * afirma lo que el documento dice, y remitir a firma un contrato que no se alcanzó a
   * guardar adelantaría el trámite sobre un texto que nadie escribió.
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
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Contrato · Término Fijo</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Contrato individual de trabajo a término fijo · Solicitud N.º {solicitudId} · Plantilla 2026
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
                hoja; en el navegador se imprime una vez, arriba. El título va **centrado**
                en su celda, y las dos columnas guardan la proporción del formato: la del
                logo mide 2101 twips contra 8207 de la del título, o sea uno a cuatro. */}
            <table className="w-full border-collapse mb-6">
              <tbody>
                <tr>
                  <td className="border border-[hsl(var(--canalco-neutral-400))] px-4 py-3 w-[20%]">
                    <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
                  </td>
                  <td className="border border-[hsl(var(--canalco-neutral-400))] px-4 text-center">
                    <p className="font-bold text-[11pt] text-[hsl(var(--canalco-neutral-600))]">
                      CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO FIJO
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>

            <h1 className="text-center font-bold text-[13px] mb-4">
              CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO FIJO
            </h1>

            {/* La parte inicial. Sin recuadro ni sombreado: la plantilla la trae como una
                lista de dos columnas, con la etiqueta en negrita y sin bordes. */}
            <table className="w-full text-[12px] mb-4 bloque">
              <tbody>
                <Fila label="Nombre del empleador" value={f.empleadora} onChange={(v) => set('empleadora', v)} />
                <Fila label="NIT" value={f.nit} onChange={(v) => set('nit', v)} />
                <Fila label="Domicilio del empleador" value={f.domicilioEmpleadora} onChange={(v) => set('domicilioEmpleadora', v)} />
                <Fila label="Nombre del trabajador(a)" value={f.trabajador} onChange={(v) => set('trabajador', v)} />
                <Fila label="Documento de identidad" value={f.documento} onChange={(v) => set('documento', v)} />
                <Fila label="Dirección / correo / celular" value={f.contacto} onChange={(v) => set('contacto', v)} />
                <Fila label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
                <Fila label="Dirección / dependencia" value={f.dependencia} onChange={(v) => set('dependencia', v)} />
                <Fila label="Salario básico mensual" value={f.salario} onChange={(v) => set('salario', v)} />
                <Fila label="Período de pago" value={f.periodoPago} onChange={(v) => set('periodoPago', v)} />
                <Fila label="Fecha de inicio" value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
                <Fila label="Fecha de terminación pactada" value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} />
                <Fila label="Término inicial" value={f.terminoInicial} onChange={(v) => set('terminoInicial', v)} />
              </tbody>
            </table>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify">
              <div className="bloque">
                <TextoEd
                  k="t.comparecencia"
                  plantilla={'COMPARECENCIA. Entre los suscritos, GLORIA LUCÍA ESCALANTE MANZANO, mayor de edad, '
                    + 'identificada con cédula de ciudadanía No. 66.651.423 expedida en El Cerrito, quien actúa en '
                    + 'calidad de representante legal de CANALES Y CONTACTOS S.A.S., identificada con NIT '
                    + '900.456.735-7, quien en adelante se denominará LA EMPLEADORA; y [NOMBRE DEL TRABAJADOR(A)], '
                    + 'identificado(a) como aparece en la parte inicial, quien en adelante se denominará EL/LA '
                    + 'TRABAJADOR(A), se celebra el presente contrato individual de trabajo a término fijo, sujeto '
                    + 'al Código Sustantivo del Trabajo, la legislación vigente y las siguientes cláusulas:'}
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
                  k="t.constancia"
                  plantilla={'CONSTANCIA: Para constancia se firma en [CIUDAD], a los [DÍA] días del mes de [MES] '
                    + 'de [AÑO], en dos ejemplares del mismo tenor.'}
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
function Fila({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <tr>
      <td className="align-top py-0.5 pr-4 w-[34%] font-bold">{label}</td>
      <td className="align-top py-0.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
        />
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
