import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, useTextosDocumento, TextoEd, ClausulaEd, ListaEd } from '@/components/juridica/textoEditable';
import ContratoTerminoFijoDoc from './ContratoTerminoFijoDoc';
import ContratoTerminoIndefinidoDoc from './ContratoTerminoIndefinidoDoc';
import ContratoObraLaborDoc from './ContratoObraLaborDoc';
import ContratoPrestacionDoc from './ContratoPrestacionDoc';
import ContratoObraTodoCostoDoc from './ContratoObraTodoCostoDoc';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';

/**
 * Formato GJ-001-F · "Contrato por prestación de servicios" (paso de Generación/Revisión
 * del contrato, Jurídica). Las variables (partes, valor, plazo, fechas, objeto) se
 * prellenan desde la solicitud, el acta y la designación. La firma la hace la Dra. Gloria
 * en el flujo. Se guarda en data.contrato.
 *
 * El texto de las cláusulas también se edita: la plantilla es el punto de partida, no una
 * camisa de fuerza. Solo se guarda lo que Jurídica cambie (`textos`, por clave), así que
 * un ajuste a la plantilla llega a todos los contratos que no hayan tocado ese bloque, y
 * los contratos viejos —que no traen `textos`— siguen viéndose igual.
 *
 * NOTA: esta plantilla es la de "Prestación de servicios". Otros tipos de contrato tendrán
 * su propia plantilla cuando se suministren.
 */

interface ContratoState {
  // Contratante
  contratante: string; contratanteNit: string; representanteLegal: string; representanteCc: string;
  contratanteDireccion: string; contratanteTelefono: string; contratanteCorreo: string;
  // Contratista
  contratista: string; contratistaCc: string; ciudadContratista: string;
  contratistaDireccion: string; contratistaTelefono: string; contratistaCorreo: string;
  // Objeto / valor / plazo
  objeto: string; objetoClausula: string;
  valorTotal: string; pagoMensual: string; formaPago: string;
  duracionClausula: string; plazo: string; inicio: string; terminacion: string;
  // Cierre
  fechaSuscripcion: string;
  /** Texto de las cláusulas que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: ContratoState = {
  contratante: '', contratanteNit: '', representanteLegal: '', representanteCc: '',
  contratanteDireccion: '', contratanteTelefono: '', contratanteCorreo: '',
  contratista: '', contratistaCc: '', ciudadContratista: '',
  contratistaDireccion: '', contratistaTelefono: '', contratistaCorreo: '',
  objeto: '', objetoClausula: '',
  valorTotal: '', pagoMensual: '', formaPago: '',
  duracionClausula: '', plazo: '', inicio: '', terminacion: '',
  fechaSuscripcion: '',
  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};


// Se genera en la revisión del contrato (Jurídica) y queda consultable de ahí en adelante.
const HABILITADO = ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function ContratoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<ContratoState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const tipoNombre = getTipo(sol?.data?.tipoContrato)?.nombre || 'Prestación de servicios';
  const set = <K extends keyof ContratoState>(k: K, v: ContratoState[K]) => setF((p) => ({ ...p, [k]: v }));

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
        const saved = (d.contrato ?? {}) as Partial<ContratoState>;
        const des = (d.designacionSupervisor ?? {}) as Record<string, string>;
        const acta = (d.actaInicio ?? {}) as Record<string, string>;
        const objeto = d.alcanceServicio || d.objetoProyecto || '';
        setF({
          ...EMPTY,
          ...saved,
          contratante: saved.contratante || d.empresa || '',
          contratanteNit: saved.contratanteNit || des.contratanteNit || acta.identTributaria || '',
          representanteLegal: saved.representanteLegal || des.funcionarioNombre || acta.representanteLegal || '',
          representanteCc: saved.representanteCc || acta.representanteCc || '',
          contratista: saved.contratista || d.contratista || '',
          contratistaCc: saved.contratistaCc || des.contratistaCc || acta.contratistaCc || '',
          contratistaDireccion: saved.contratistaDireccion || acta.direccion || '',
          contratistaTelefono: saved.contratistaTelefono || acta.celular || '',
          contratistaCorreo: saved.contratistaCorreo || acta.correo || '',
          objeto: saved.objeto || objeto,
          objetoClausula: saved.objetoClausula || objeto,
          valorTotal: saved.valorTotal || d.honorarios || '',
          formaPago: saved.formaPago || d.formaPago || '',
          plazo: saved.plazo || d.duracion || '',
          inicio: saved.inicio || acta.fechaInicio || '',
          terminacion: saved.terminacion || acta.fechaFinal || '',
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el contrato');
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
      // El backend asigna el consecutivo la primera vez que se guarda; se toma de
      // la respuesta para que el número aparezca en el documento sin recargar.
      const actualizada = await gestionConocimientoService.saveDocumento(solicitudId!, 'contrato', f);
      setSol(actualizada);
      const nro = String(actualizada?.data?.consecutivoContrato ?? '').trim();
      toast.success(nro ? `Contrato guardado · ${nro}` : 'Contrato guardado');
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Número del contrato: lo emite el backend al guardarlo, por tipología. */
  const consecutivo = String(sol?.data?.consecutivoContrato ?? '').trim();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#16162b]" />
      </div>
    );
  }

  // La plantilla del contrato depende del tipo. Por ahora: Término Fijo tiene la suya;
  // los demás usan la de Prestación de Servicios (GJ-001-F) hasta que se suministren.
  if (sol?.data?.tipoContrato === 'termino-fijo') {
    return <ContratoTerminoFijoDoc solicitud={sol} />;
  }
  if (sol?.data?.tipoContrato === 'termino-indefinido') {
    return <ContratoTerminoIndefinidoDoc solicitud={sol} />;
  }
  if (sol?.data?.tipoContrato === 'obra-labor') {
    return <ContratoObraLaborDoc solicitud={sol} />;
  }
  // «Obra a todo costo» es un contrato de obra con un tercero: el precio comprende todos
  // los costos y el alcance vive en un anexo técnico. No es laboral ni de servicios.
  if (sol?.data?.tipoContrato === 'obra-todo-costo') {
    return <ContratoObraTodoCostoDoc solicitud={sol} />;
  }
  // «Prestación de servicios» contrata a una sociedad —NIT, representante legal,
  // certificado de existencia— y tiene su propio formato. No lo comparte con
  // «Prestación de servicios Profesionales», que contrata a una persona natural y
  // sigue con la plantilla de abajo.
  if (sol?.data?.tipoContrato === 'prestacion-de-servicios') {
    return <ContratoPrestacionDoc solicitud={sol} />;
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
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Contrato · {tipoNombre}</h1>
            <p className="text-xs text-[#4a4a63]">
              Formato GJ-001-F · Solicitud N.º {solicitudId}
              {consecutivo && <> · Contrato <strong className="font-mono">{consecutivo}</strong></>}
            </p>
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
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="contrato" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: el contrato se envía a firma —o se
            firma, o se devuelve— con el texto delante. */}
        <AccionesFlujo
          sol={sol} documento="contrato" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El contrato aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se genera en la etapa «Contrato en revisión (Jurídica)».</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_170px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-12 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] border-r border-[#0a2a52]">
                CONTRATO POR PRESTACIÓN DE SERVICIOS
              </div>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-9 object-contain" />
                </div>
                <div className="grid grid-cols-[auto_1fr] text-[10px]">
                  <CodeCell label="CÓDIGO:" value="GJ-001-F" />
                  <CodeCell label="FECHA:" value="14/04/2026" />
                  <CodeCell label="VERSIÓN:" value="2" last />
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <TextoEd
                k="titulo.documento"
                plantilla={`CONTRATO DE PRESTACIÓN DE SERVICIOS ENTRE ${(f.contratante || '…').toUpperCase()} Y ${(f.contratista || '…').toUpperCase()}`}
                className="text-center font-bold mb-4"
              />

              {/* El consecutivo es del documento, no de la pantalla: va impreso.
                  Lo emite el sistema al guardar y cada tipología lleva su propia
                  numeración, así que no se edita a mano. */}
              <p className="text-center font-bold text-[13px] -mt-3 mb-4 tracking-wide">
                {consecutivo || (
                  <span className="font-normal italic text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                    El número del contrato se asigna al guardar
                  </span>
                )}
              </p>

              {/* Tabla de datos */}
              <table className="w-full border-collapse text-[12px] mb-5">
                <tbody>
                  <Row label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                  <Row label="Identificación Tributaria" value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} placeholder="NIT" />
                  <Row label="Representante Legal" value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} />
                  <Row label="Identificación" value={f.representanteCc} onChange={(v) => set('representanteCc', v)} placeholder="C.C. ... de ..." />
                  <Row label="Dirección Del Domicilio" value={f.contratanteDireccion} onChange={(v) => set('contratanteDireccion', v)} />
                  <Row label="Teléfono" value={f.contratanteTelefono} onChange={(v) => set('contratanteTelefono', v)} />
                  <Row label="Correo Electrónico" value={f.contratanteCorreo} onChange={(v) => set('contratanteCorreo', v)} />
                  <Row label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
                  <Row label="Identificación" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="C.C. ... expedida en ..." />
                  <Row label="Dirección Del Domicilio" value={f.contratistaDireccion} onChange={(v) => set('contratistaDireccion', v)} />
                  <Row label="Teléfono" value={f.contratistaTelefono} onChange={(v) => set('contratistaTelefono', v)} />
                  <Row label="Correo Electrónico" value={f.contratistaCorreo} onChange={(v) => set('contratistaCorreo', v)} />
                  <Row label="Objeto Del Contrato" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                  <Row label="Valor Total Del Contrato" value={f.valorTotal} onChange={(v) => set('valorTotal', v)} />
                  <Row label="Forma De Pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} area />
                  <Row label="Plazo De Ejecución" value={f.plazo} onChange={(v) => set('plazo', v)} />
                  <Row label="Inicio" value={f.inicio} onChange={(v) => set('inicio', v)} />
                  <Row label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} />
                </tbody>
              </table>

              {/* Cuerpo */}
              <div className="space-y-3 text-justify leading-relaxed text-[12px]">
                {/* Los tres primeros bloques se arman con los datos de la tabla de arriba
                    mientras nadie los toque; en cuanto Jurídica los edita, quedan como
                    los dejó y dejan de recalcularse. */}
                <TextoEd
                  k="intro.suscritos"
                  plantilla={`Entre los suscritos, a saber: ${f.contratante || '…'} identificada con el NIT. ${tx(f.contratanteNit)}, representada legalmente por ${f.representanteLegal || '…'}, identificada con la cédula de ciudadanía No. ${tx(f.representanteCc)}, quien para los efectos del presente se denominará LA CONTRATANTE; y ${f.contratista || '…'}, mayor de edad, domiciliada en la ciudad de ${tx(f.ciudadContratista)}, identificada con cédula de Ciudadanía No. ${tx(f.contratistaCc)}, y que para los efectos de este contrato se denominará LA CONTRATISTA.`}
                />
                <TextoEd k="intro.partes" plantilla={'Las partes se denominarán individualmente cada una como una "Parte" y conjuntamente como las "Partes".'} />
                <TextoEd k="intro.convenido" plantilla={'Las Partes han convenido celebrar el presente Contrato de Prestación de Servicios (en adelante "Contrato"), el cual se regirá por las siguientes cláusulas:'} />

                <TextoEd k="titulo.clausulas" plantilla="CLÁUSULAS" className="text-center font-bold pt-2" />

                <ClausulaEd
                  k="primera"
                  titulo="PRIMERA. OBJETO:"
                  texto={f.objetoClausula || f.objeto || 'Prestación de servicios profesionales de apoyo a…'}
                />

                <ClausulaEd
                  k="segunda"
                  titulo="SEGUNDA. VALOR DEL CONTRATO Y FORMA DE PAGO:"
                  texto={`El valor del presente contrato será de ${tx(f.valorTotal)}, los cuales serán pagados a la CONTRATISTA vencido, en pagos mensuales de ${tx(f.pagoMensual)}, los cuales serán pagados al CONTRATISTA vencido.`}
                />
                <TextoEd k="segunda.pago" plantilla="La fecha para el pago de la contraprestación mensual antes mencionada será en la semana siguiente a la radicación de la factura, la cual será presentada por el Contratista dentro de los 5 primeros días calendario de cada mes. Serán descontados los impuestos correspondientes según la norma vigente en Colombia. El pago será realizado en pesos Colombianos." />

                <ClausulaEd
                  k="tercera"
                  titulo="TERCERA. DURACIÓN:"
                  texto={`El término de duración del presente contrato será de ${tx(f.duracionClausula || f.plazo)} contados a partir del ${tx(f.inicio)} y hasta el ${tx(f.terminacion)}.`}
                />
                <TextoEd k="tercera.prorroga" plantilla="El presente Contrato podrá ser prorrogado de común acuerdo entre las Partes, bastando para el efecto acuerdo escrito." />

                <ClausulaEd k="cuarta" titulo="CUARTA. OBLIGACIONES DE LA CONTRATISTA:" texto="Serán a cargo del Contratista las siguientes obligaciones:" />
                <ListaEd k="cuarta.items" items={[
                  'Prestar los servicios objeto del presente contrato.',
                  'Mantener la reserva de la información y/o documentos que conozca con ocasión de la ejecución del presente contrato.',
                  'Disponer los recursos que sean necesarios para la correcta ejecución del presente Contrato.',
                  'Previo a su inicio, informar a la CONTRATANTE cualquier actividad que vaya a realizar y guarde similitud con las actividades que realiza la CONTRATANTE.',
                  'Las demás obligaciones que sean de la esencia del objeto contratado, así como de aquellas que sean necesarias para el logro de la obligación de medio que caracteriza la relación.',
                ]} />

                <ClausulaEd k="quinta" titulo="QUINTA. OBLIGACIONES DE LA CONTRATANTE:" texto="Serán obligaciones de la Contratante las siguientes:" />
                <ListaEd k="quinta.items" items={[
                  'Realizar los pagos de acuerdo con lo establecido en el presente contrato.',
                  'Suministrar oportunamente a LA CONTRATISTA toda la información que sea requerida para la correcta prestación del servicio.',
                  'Suscribir los documentos a que haya lugar.',
                ]} />

                <ClausulaEd k="sexta" titulo="SEXTA. TERMINACIÓN:" texto="El presente Acuerdo podrá darse por terminado de manera anticipada por las siguientes causales:" />
                <ListaEd k="sexta.items" items={[
                  'Por incumplimiento de LA CONTRATISTA de cualquiera de sus obligaciones. La terminación se producirá con la evidencia del hecho generador de incumplimiento.',
                  'Por vencimiento del término inicialmente pactado.',
                  'Por mutuo acuerdo.',
                  'Por incumplimiento del objeto pactado.',
                  'Por decisión del contratante en cualquier tiempo, siempre y cuando notifique al contratista con dos (02) días de antelación.',
                ]} />

                <ClausulaEd k="septima" titulo="SÉPTIMA. PARTES INDEPENDIENTES:" texto="Se deja expresa constancia que entre las Partes existe una simple relación comercial derivada del presente contrato, siendo cada una de ellas exclusiva responsable por el cumplimiento de sus obligaciones en materia laboral, civil, mercantil, tributaria, administrativa y, en general, por cualquier otra derivada de la ley." />
                <TextoEd k="septima.p1" plantilla="Cada una de las Partes actuará por su propia cuenta, con absoluta autonomía e independencia técnica, directiva y financiera, y no estará sometido a subordinación laboral de la otra Parte." />
                <TextoEd k="septima.p2" plantilla="Ninguna de las Partes será responsable por daños y/o perjuicios indirectos o consecuenciales, incluyendo pérdida o interrupción de negocios, lucro cesante, o cualquier otro provenientes de reclamaciones, demandas o litigios que interpongan un tercero, salvo que los mismos provengan hasta de culpa leve de alguna de las partes." />

                <ClausulaEd k="octava" titulo="OCTAVA. CONFIDENCIALIDAD:" texto="Con la suscripción del presente Acuerdo, las Partes reconocen que toda la información entregada por cada una de las Partes es confidencial, por lo que es propiedad exclusiva de quien la entrega, y que tal información confidencial la es revelada a la otra Parte única y exclusivamente para el desarrollo del presente Acuerdo y sólo podrá ser utilizada para los propósitos establecidos en el presente Acuerdo." />
                <TextoEd k="octava.p1" plantilla="Las Partes se abstendrán de divulgar a terceros, en cualquier forma o modo, la información confidencial que le suministre la otra Parte y se obligan a tratar dicha información con la más absoluta confidencialidad, salvo que exista autorización previa, expresa y escrita de la parte reveladora caso en el cual sólo se revelará la información respectiva de acuerdo con las instrucciones que para el efecto indique la parte reveladora." />
                <TextoEd k="octava.p2" plantilla="Adicionalmente, las Partes se obligan a mantener la información confidencial debidamente protegida del acceso de terceros, con el fin de no permitir su conocimiento y/o manejo por parte de personas no autorizadas expresamente por la parte que hace la revelación." />
                <TextoEd k="octava.p3" plantilla="Las Partes se obligan a que las personas que se encuentren bajo su dirección cumplan con las obligaciones establecidas en la presente Cláusula. En consecuencia, de llegarse a acreditar incumplimiento, la parte incumplida se hace responsable por todos los daños y perjuicios que sufra la parte cumplida en el evento en que las personas que estén a cargo o bajo la dirección violen las obligaciones establecidas en la presente Cláusula." />
                <TextoEd k="octava.p4" plantilla="Al momento de la terminación del presente Acuerdo, o antes a solicitud de una de las Partes, las Partes deberán devolver toda la información confidencial que se encuentre en su poder, ya sea en medio escrito, magnético, digital y, en general, en cualquier otro sistema tecnológico con capacidad para almacenar información en cualquiera de sus formas." />
                <TextoEd k="octava.p5" plantilla="La información confidencial deberá ser tratada como tal y debidamente resguardada por las Partes durante el término de vigencia del presente Acuerdo y a partir de la fecha en que ésta le es entregada. Las obligaciones de no revelar, divulgar, exhibir, mostrar, comunicar, utilizar y/o emplear la Información Confidencial en beneficio propio y/o en el de terceros adquiridas por cada Parte no se entenderán extinguidas por el vencimiento del término de duración del presente Acuerdo o por lo mismo continuarán vigentes por un término de dos (2) años contados a partir de la fecha de terminación del presente Acuerdo." />
                <TextoEd k="octava.p6" plantilla="En el evento en que una de las Partes, en desarrollo o por mandato de una ley, decreto, sentencia y/u orden de autoridad competente en ejercicio de sus funciones legales, se vea obligada a revelar o divulgar la información confidencial que le ha sido entregada por la otra Parte, se obliga a dar aviso por escrito de ello a la otra Parte dentro de los tres (3) días hábiles siguientes a que tenga conocimiento de esta obligación de revelación, para que ésta pueda tomar las medidas necesarias para (i) proteger su información confidencial y (ii) atenuar los efectos de tal divulgación." />

                <ClausulaEd k="novena" titulo="NOVENA. LIMITACIÓN DE RESPONSABILIDAD:" texto="Las Partes aceptan indemnizar, defender y eximir de responsabilidad a la otra Parte, sus afiliados y sus respectivos funcionarios, directores, empleados y agentes, de y contra cualquier reclamo, demanda, pérdida, daño, responsabilidad, causa de acción, juicios o costos y gastos de toda naturaleza (incluidos los honorarios y gastos de abogados) que surjan del incumplimiento de los términos del presente contrato." />
                <TextoEd k="novena.p1" plantilla="En ningún caso la responsabilidad de la Contratista por cualquier causa y cualquier daño que se dé o en relación con este Contrato excederá, en conjunto, los honorarios totales pagaderos por la CONTRATANTE a la CONTRATISTA por los servicios prestados durante un período de doce (12) meses inmediatamente anteriores a la fecha en que surgió dicha responsabilidad." />

                <ClausulaEd k="decima" titulo="DÉCIMA. PROPIEDAD INTELECTUAL:" texto="Toda la información, documentos, invenciones, los derechos de propiedad intelectual, marcas, derechos de autor, derechos privados o know-how confidencial o procesos y demás elementos que protege la propiedad intelectual y provienen de cada una de las Partes son de propiedad de quien las entrega y le deben ser regresados de manera oportuna cuando así lo solicite, al igual que todas las copias que se hayan hecho. En ningún momento debe entenderse que el acceso que va a tener, tiene o tuvo la otra Parte o sus dependientes a la información del algún tipo de derecho sobre la misma. Así, las Partes se obligan a la terminación de esta relación, y en todo caso en cualquier momento cuando así lo exija la otra Parte devolverá todos y cada uno de los documentos físicos o electrónicos, y soportes que comprenden la información Confidencial. Esta obligación de entregar incluye los originales y las copias de todos y cada uno de ellos, así como los disquetes o cintas y demás soportes materiales en que pueda estar impresa o grabada la información, se encuentre ésta en su poder o en el de sus subalternos." />

                <ClausulaEd k="decimaPrimera" titulo="DÉCIMA PRIMERA. INTEGRIDAD:" texto="Este Contrato es integral entre las Partes, por tanto, sustituye cualquier otro tipo de acuerdo o convenio, escrito o verbal que pudieren haber celebrado con anterioridad." />

                <ClausulaEd k="decimaSegunda" titulo="DÉCIMA SEGUNDA. DIVISIBILIDAD:" texto="Si alguna cláusula del presente Contrato es declarada nula, ilegal o sin efectos, las demás cláusulas continuarán de todas formas vigentes y dicha cláusula o disposición inválida, ilegal o sin efectos deberá ser modificada por las respectivas Partes según sea necesario para ajustarla a la ley aplicable." />

                <ClausulaEd k="decimaTercera" titulo="DÉCIMA TERCERA. AUTORIZACIÓN SOBRE TRATAMIENTO DE DATOS PERSONALES:" texto="Las Partes autorizan de manera libre, previa, clara, expresa, voluntaria e informada a la otra Parte para que se efectúe operaciones sobre sus datos personales tales como recolección, almacenamiento, uso, circulación o supresión, para los fines relacionados con el objeto de este acuerdo, incluidas auditorías, interventorías, procesos estadísticos o revisión por los asesores legales externos, bajo los criterios establecidos en la Ley 1581 de 2012, el Decreto Reglamentario 1377 de 2013 y demás normas que regulen el tema y la política sobre uso de datos personales." />

                <ClausulaEd k="decimaCuarta" titulo="DÉCIMA CUARTA. SUPRESIÓN DE DATOS:" texto="La titular tiene el derecho, en todo momento, a solicitar a la otra Parte, la eliminación de sus datos personales cuando:" />
                <ListaEd k="decimaCuarta.items" items={[
                  'Considere que los mismos no están siendo tratados conforme a los principios, deberes y obligaciones previstas en la normatividad vigente.',
                  'Hayan dejado de ser necesarios o pertinentes para la finalidad para la cual fueron recabados.',
                  'Se haya superado el periodo necesario para el cumplimiento de los fines para los que fueron recabados.',
                  'Esta supresión implica la eliminación total o parcial de la información personal de acuerdo con lo solicitado por el titular en los registros, archivos, bases de datos o tratamientos realizados por la Parte.',
                ]} />
                <TextoEd k="decimaCuarta.paragrafo" plantilla="PARÁGRAFO: Es importante tener en cuenta que el derecho de supresión no es absoluto y el responsable puede negar el ejercicio del mismo cuando:" />
                <ListaEd k="decimaCuarta.excepciones" items={[
                  'El titular tenga un deber legal o contractual de permanecer en la base de datos.',
                  'La eliminación de datos obstaculice actuaciones judiciales o administrativas vinculadas a obligaciones fiscales, la investigación y persecución de delitos o la actualización de sanciones administrativas.',
                  'Los datos sean necesarios para proteger los intereses jurídicamente tutelados del titular; para realizar una acción en función del interés público, o para cumplir con una obligación legalmente adquirida por el titular.',
                ]} />

                <ClausulaEd k="decimaQuinta" titulo="DÉCIMA QUINTA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS:" texto="LA CONTRATISTA se obliga a desempeñar sus actividades con integridad, ética y lealtad hacia CANALES Y CONTACTOS S.A.S. En este sentido, queda estrictamente prohibido solicitar, recibir, aceptar directa o indirectamente cualquier pago, comisión, gratificación, beneficio, dádiva o cualquier otra retribución de proveedores, contratistas, clientes o cualquier tercero con quien la empresa mantenga o pueda mantener relaciones comerciales o contractuales. El incumplimiento de esta disposición constituirá una falta grave y será causal de terminación inmediata del contrato de prestación de servicios con justa causa, sin perjuicio de las acciones legales que CANALES Y CONTACTOS S.A.S. pueda ejercer en contra de LA CONTRATISTA por los daños y perjuicios ocasionados." />

                <ClausulaEd k="decimaSexta" titulo="DÉCIMA SEXTA. PROPIEDAD INTELECTUAL:" texto="LA CONTRATISTA reconoce y acepta que todas las invenciones, desarrollos, mejoras, diseños, procedimientos, software, documentación, obras, descubrimientos o cualquier otro resultado derivado de su trabajo dentro de la empresa, ya sea en forma individual o en colaboración con otros, y que se realicen durante la vigencia de su prestación de servicios con CANALES Y CONTACTOS S.A.S., serán de exclusiva propiedad de la contratante. Asimismo, LA CONTRATISTA cede de manera irrevocable y sin restricción adicional todos los derechos de propiedad intelectual, incluyendo, pero sin limitarse a, derechos de autor, patentes, marcas, diseños industriales y secretos comerciales, que puedan derivarse de dichas invenciones o desarrollos. La CONTRATISTA se compromete a cooperar con la empresa para formalizar cualquier documento necesario para la protección de estos derechos, incluyendo registros de propiedad intelectual, patentes u otros mecanismos legales aplicables. Esta obligación se mantiene incluso después de la terminación del contrato de prestación de servicios, en la medida en que sea razonablemente necesario para garantizar la titularidad de la empresa sobre dichas invenciones o desarrollos." />

                <ClausulaEd k="decimaSeptima" titulo="DÉCIMA SÉPTIMA. NOTIFICACIONES:" texto="Todas las notificaciones, solicitudes, requerimientos o cualquier comunicación bajo este Contrato deberán realizarse por escrito y deberán ser efectuadas: (i) por servicio de correo a través de una empresa de servicio de correo reconocida; o (ii) por email, dirigidas a la siguiente dirección o cualquier otra dirección, indicada en lo sucesivo mediante notificación escrita a la otra Parte. La Dirección electrónica indicada en el presente documento igualmente será válida para notificación legal y judicial, hasta tanto no se informe su cambio por medio escrito." />

                <div className="grid grid-cols-1 gap-3 pl-4 my-2">
                  <div>
                    <p className="font-semibold">Contratista</p>
                    <NotifRow label="Dirección Del Domicilio" value={f.contratistaDireccion} onChange={(v) => set('contratistaDireccion', v)} />
                    <NotifRow label="Celular" value={f.contratistaTelefono} onChange={(v) => set('contratistaTelefono', v)} />
                    <NotifRow label="Correo Electrónico" value={f.contratistaCorreo} onChange={(v) => set('contratistaCorreo', v)} />
                  </div>
                  <div>
                    <p className="font-semibold">Contratante</p>
                    <NotifRow label="Dirección Del Domicilio" value={f.contratanteDireccion} onChange={(v) => set('contratanteDireccion', v)} />
                    <NotifRow label="Teléfono" value={f.contratanteTelefono} onChange={(v) => set('contratanteTelefono', v)} />
                    <NotifRow label="Correo Electrónico" value={f.contratanteCorreo} onChange={(v) => set('contratanteCorreo', v)} />
                  </div>
                </div>
                <TextoEd k="notificaciones.recepcion" plantilla="Todas las notificaciones, requerimientos o cualquier otro tipo de comunicación se entenderán recibidas en la fecha de su recepción si se recibe antes de las 5:00 pm en el lugar de recepción y si dicho día es un día hábil. En caso contrario, las notificaciones, requerimientos o comunicaciones se entenderán recibidas el siguiente día hábil en el lugar de notificación del destinatario." />

                <ClausulaEd k="decimaNovena" titulo="DÉCIMA NOVENA. ORIGEN DE INGRESOS:" texto={'Las Partes, declaran que tanto los recursos utilizados en la ejecución del presente Acuerdo, así como sus ingresos, provienen de actividades lícitas. Igualmente declaran que no se encuentran en registros negativos en listas de prevención de lavado de activos y/o financiación al terrorismo, nacionales o internacionales, ni incurren en una de las categorías de lavado de activos (conversión o movimiento) y que en consecuencia se obliga a responder frente a la otra parte por todos los perjuicios que le llegaran a causar como consecuencia de la falta de veracidad de esta afirmación. En igual sentido, la parte que incumpliere responderá ante la parte cumplidora o algún tercero afectado por los perjuicios causados. Las Partes declaran igualmente, que su conducta se ajusta a la ley y a la ética. Para todos los efectos el "lavado de dinero" es el conjunto de procedimientos usados para cambiar la identidad del dinero obtenido ilegalmente, a fin de que aparente haber sido obtenido de fuentes legítimas. Estos procedimientos incluyen disimular la procedencia y propiedad verdadera de los fondos.'} />

                <ClausulaEd k="vigesima" titulo="VIGÉSIMA. MODIFICACIONES:" texto="Este contrato no podrá ser modificado, alterado o enmendado salvo autorización por escrito debidamente suscrito por los representantes debidamente autorizados de cada una de las Partes." />

                <ClausulaEd k="vigesimaPrimera" titulo="VIGÉSIMA PRIMERA. CESIÓN:" texto="Las Partes no podrán ceder, parcial ni totalmente, la ejecución del presente contrato a un tercero sin la autorización previa expresa y por escrito de la otra Parte." />

                <ClausulaEd k="vigesimaSegunda" titulo="VIGÉSIMA SEGUNDA. LEGISLACIÓN APLICABLE Y SOLUCIÓN DE CONTROVERSIAS:" texto="El presente Contrato se celebra y ejecuta de acuerdo con las disposiciones legales vigentes y aplicables a la República de Colombia." />
                <TextoEd k="vigesimaSegunda.p1" plantilla="Todos los conflictos o diferencias que surjan entre las Partes en la ejecución o liquidación del presente Contrato, salvo las excepciones legales, serán dirimidos mediante procedimientos de autocomposición tales como la negociación directa o la mediación. Para tal efecto, las Partes dispondrán de treinta (30) días calendario contados a partir de la fecha en que cualquiera de ellas requiera a la otra por escrito en tal sentido, término que podrá ser prorrogado de común acuerdo. Pasada la etapa de acuerdo directo sin que las Partes hayan llegado a un acuerdo o solución, las diferencias serán resueltas por medio del mecanismo de amigable composición de conformidad con el reglamento que para tal efecto tenga previsto el Centro de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá. La decisión del amigable componedor será vinculante para las Partes. La decisión será tomada por un único amigable componedor que será elegido por el Centro de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá." />
                <TextoEd k="vigesimaSegunda.p2" plantilla="Si después de haber agotado los anteriores mecanismos, siguen existiendo controversias entre las Partes, se convocará un tribunal de arbitramento de conformidad con las siguientes reglas:" />
                <ListaEd k="vigesimaSegunda.reglas" items={[
                  'El Tribunal de Arbitramento estará integrado por uno (1) árbitro el cual será designado por las Partes de común acuerdo. En el evento en que las Partes no se pongan de acuerdo en la designación del árbitro en un término máximo de quince (15) días contados a partir de la solicitud de integración del Tribunal de Arbitramento, el árbitro será designado por la Cámara de Comercio de Cali Valle., mediante sorteo entre los árbitros inscritos en la Lista A que lleva el Centro de Arbitraje y Conciliación de dicha Cámara.',
                  'El árbitro será ciudadano colombiano y abogado en ejercicio de la profesión;',
                  'La organización interna del Tribunal de Arbitramento se sujetará a las reglas previstas para el efecto por el Centro de Arbitraje y Conciliación de la Cámara de Comercio de la Ciudad de Cali Valle.;',
                  'El Tribunal de Arbitramento decidirá en derecho conforme a las leyes de la República de Colombia;',
                  'El Tribunal de Arbitramento funcionará en la Ciudad de Cali Valle., en el Centro de Arbitraje y Conciliación de la Cámara de Comercio de esta ciudad; y,',
                  'La secretaría del Tribunal de Arbitramento estará integrada por un miembro de la lista oficial de secretarios del Centro de Arbitraje y Conciliación de la Cámara de Comercio de la Ciudad de Cali Valle.',
                ]} />

                {/* Firmas */}
                <TextoEd
                  k="cierre.suscripcion"
                  plantilla={`Las partes suscriben el presente documento, el ${tx(f.fechaSuscripcion)}.`}
                  className="pt-6"
                />
                <div className="grid grid-cols-2 gap-8 pt-12">
                  <div>
                    <p className="font-semibold mb-8">Por LA CONTRATANTE</p>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.representanteLegal} onChange={(v) => set('representanteLegal', v)} placeholder="Representante legal" bold />
                      <div>Representante legal</div>
                      <FLine value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="Empresa contratante" />
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold mb-8">Por LA CONTRATISTA</p>
                    <div className="border-t border-[#0a2a52] pt-1">
                      <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="Nombre del contratista" bold />
                      <FLine value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="C.C." />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
          <PieElaboracion />
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar el contrato. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Utilidades y subcomponentes ────────────────────────── */

const tx = (v: string) => (v?.trim() ? v : '…');

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function Row({ label, value, onChange, area, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">{label}</td>
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


function NotifRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="whitespace-nowrap">{label}:</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-grow bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px]" />
    </div>
  );
}

function FLine({ value, onChange, placeholder, bold }: { value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')} />
  );
}
