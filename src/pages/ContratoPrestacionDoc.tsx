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

/**
 * Plantilla de contrato para el tipo «Prestación de servicios».
 *
 * No es una pestaña aparte: es el contrato, y se muestra cuando la solicitud es de ese
 * tipo, igual que Término Fijo o de Obra Labor tienen la suya. La reparte `ContratoPage`
 * y se guarda en `data.contrato`, como todas.
 *
 * Aquí la contratista es una **sociedad**: el documento pide su NIT, su representante
 * legal y el certificado de existencia. Por eso no sirve para «Prestación de servicios
 * Profesionales», donde se contrata a una persona natural.
 *
 * Empieza con la ficha de datos de las dos partes —el bloque de la contratante viene
 * lleno, porque siempre es el mismo— y sigue con las veintidós cláusulas.
 */

interface ContratoState {
  contratista: string;
  // Contratante: los datos de la empresa, que no cambian de un contrato a otro.
  contratante: string;
  contratanteNit: string;
  contratanteRepLegal: string;
  contratanteRepCc: string;
  contratanteDireccion: string;
  contratanteTelefono: string;
  contratanteCorreo: string;
  // Contratista
  contratistaNit: string;
  contratistaRepLegal: string;
  contratistaRepCc: string;
  contratistaDireccion: string;
  contratistaTelefono: string;
  contratistaCorreo: string;
  // Condiciones
  objeto: string;
  valor: string;
  formaPago: string;
  plazo: string;
  inicio: string;
  terminacion: string;
  /** Las dos listas de la cláusula cuarta. Se agregan y se quitan puntos. */
  obligacionesGenerales: string[];
  obligacionesEspecificas: string[];
  /** Las de la contratante, en la cláusula quinta. */
  obligacionesContratante: string[];
  /** Las causales de terminación anticipada, en la séptima. */
  causalesTerminacion: string[];
  /** Cuándo procede pedir la supresión de datos, en la décima quinta. */
  causalesSupresion: string[];
  /** Cuándo puede negarse, en su parágrafo. */
  negativasSupresion: string[];
  // Cuadro de garantías de la vigésima segunda.
  aseguradoNombre: string;
  aseguradoNit: string;
  amparos: { amparo: string; valor: string; vigencia: string }[];
  tomador: string;
  tomadorNit: string;
  infoPoliza: string;
  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * La ficha va con el contenido del formato, tal cual: los datos de la contratante escritos
 * —son los mismos en todos los contratos— y los de la contratista con los huecos en la
 * convención del documento.
 *
 * Van como valores y no como `placeholder`: un placeholder se ve en pantalla pero no se
 * imprime, y el formato en blanco tiene que poder imprimirse para diligenciarlo a mano.
 */
const EMPTY: ContratoState = {
  contratista: 'xxx',
  contratante: 'CANALES Y CONTACTOS S.A.S.',
  contratanteNit: '900.456.735-7',
  contratanteRepLegal: 'GLORIA LUCIA ESCALANTE MANZANO',
  contratanteRepCc: 'C.C. 66.651.423 de El Cerrito- Valle',
  contratanteDireccion: 'Calle 13A No. 101-60, Ciudad Jardín, Cali, Valle del Cauca',
  contratanteTelefono: '(2) 5246612 – Celular: 3228501970',
  contratanteCorreo: 'gerencia.canalesycontactos@gmail.com\ndirector.juridico@alumbrados.co\ntalentohumano@alumbrados.co',
  contratistaNit: 'xx',
  contratistaRepLegal: 'xx',
  contratistaRepCc: 'xx',
  contratistaDireccion: 'xxx',
  contratistaTelefono: 'xxx',
  contratistaCorreo: 'xxx',
  objeto: 'LA CONTRATISTA deberá prestar sus servicios profesionales a CANALES Y CONTACTOS S.A.S, teniendo como objetivo principal xxxx',
  valor: 'Valor antes de IVA: $xxx M/CTE. IVA del 19%: $xxx M/CTE. Valor total incluido IVA: $xxx M/CTE.',
  formaPago: 'xxx (x) pagos mensuales vencidos, cada uno por $xxx M/CTE, más IVA del 19% por $xxx M/CTE, para un total mensual incluido IVA de $xxx M/CTE.',
  plazo: 'xx (x) meses',
  inicio: 'xxx',
  terminacion: 'xxx',
  obligacionesGenerales: ['', '', '', '', ''],
  obligacionesEspecificas: [''],
  obligacionesContratante: ['', '', ''],
  causalesTerminacion: ['', '', ''],
  causalesSupresion: ['', '', '', ''],
  negativasSupresion: ['', '', ''],
  // La asegurada es siempre la contratante; los amparos y sus porcentajes vienen del
  // formato y solo se completa el valor en pesos.
  aseguradoNombre: 'CANALES Y CONTACTOS S.A.S.',
  aseguradoNit: 'Nit: 900.456.735-7',
  amparos: [
    {
      amparo: 'CUMPLIMIENTO DEL CONTRATO',
      valor: '10 % del valor antes de IVA: $xx M/CTE.',
      vigencia: 'Por el plazo de ejecución del Contrato y seis (6) meses más, contados a partir de la fecha de inicio de ejecución.',
    },
    {
      amparo: 'PAGO DE SALARIOS, PRESTACIONES SOCIALES LEGALES E INDEMNIZACIONES LABORALES',
      valor: '5 % del valor antes de IVA: $xxx M/CTE.',
      vigencia: 'Por el plazo de ejecución del Contrato y tres (3) años más, contados a partir de la fecha de inicio de ejecución.',
    },
  ],
  tomador: 'xxx',
  tomadorNit: 'NIT xxx',
  infoPoliza: 'Número y año del contrato\nObjeto del contrato\nFirma de LA CONTRATISTA',
  textos: {},
};

/** Los tres casos en que la supresión puede negarse. */
const NEGATIVA_SUPRESION = [
  'El titular tenga un deber legal o contractual de permanecer en la base de datos.',
  'La eliminación de datos obstaculice actuaciones judiciales o administrativas vinculadas a obligaciones fiscales, la investigación y persecución de delitos o la actualización de sanciones administrativas.',
  'Los datos sean necesarios para proteger los intereses jurídicamente tutelados del titular; para realizar una acción en función del interés público, o para cumplir con una obligación legalmente adquirida por el titular.',
];

/** Los cuatro supuestos en que procede pedir la supresión de los datos. */
const SUPRESION = [
  'Los datos no estén siendo tratados conforme a los principios, deberes y obligaciones previstos en la normativa vigente.',
  'Los datos hayan dejado de ser necesarios o pertinentes para la finalidad para la cual fueron recolectados.',
  'Se haya superado el período necesario para el cumplimiento de las finalidades para las cuales fueron recolectados.',
  'La supresión implique la eliminación total o parcial de la información personal, de acuerdo con lo solicitado por el titular, en los registros, archivos, bases de datos o tratamientos realizados por la Parte correspondiente.',
];

/** Las tres causales de terminación anticipada del formato. */
const CAUSALES = [
  'Por incumplimiento de LA CONTRATISTA del objeto o cualquiera de sus obligaciones del contrato. La terminación se producirá con la evidencia del hecho generador de incumplimiento.',
  'Por vencimiento del término inicialmente pactado.',
  'Por mutuo acuerdo.',
];

/** Las tres obligaciones de la contratante. Son las mismas en todos los contratos. */
const DE_LA_CONTRATANTE = [
  'Realizar los pagos de acuerdo con lo establecido en el presente contrato.',
  'Suministrar oportunamente a LA CONTRATISTA toda la información que sea requerida para la correcta prestación del servicio.',
  'Suscribir los documentos a que haya lugar.',
];

/** Las cinco obligaciones generales del formato. La primera queda abierta. */
const GENERALES = [
  'xxxx',
  'Prestar los servicios objeto del presente contrato',
  'Mantener la reserva de la información y/o documentos que conozca con ocasión de la ejecución del presente contrato.',
  'Disponer de los recursos que sean necesarios para la correcta ejecución del presente Contrato.',
  'Las demás obligaciones que sean de la esencia del objeto contratado, así como de aquellas que sean necesarias para el logro de la obligación de medio que caracteriza al objeto contratado.',
];

/** Las específicas dependen del objeto: el formato no trae ninguna escrita. */
const ESPECIFICAS = ['xxxx'];

/**
 * La comparecencia va con el texto del formato. Los datos de la contratante están escritos
 * —son siempre los mismos— y los de la contratista quedan como huecos, con la convención
 * del documento, porque la ficha de arriba no alcanza a cubrirlos: aquí van además el
 * domicilio de la sociedad y la constancia del certificado de existencia.
 */
const COMPARECENCIA =
  'Entre los suscritos, a saber: CANALES Y CONTACTOS S.A.S. identificada con el NIT. 900.456.735-7, '
  + 'representada legalmente por GLORIA LUCÍA ESCALANTE MANZANO, identificada con la cédula de ciudadanía '
  + 'No. 66.651.423 de El Cerrito- Valle, quien para los efectos del presente se denominará "EL CONTRATANTE"; '
  + 'y xxxx sociedad comercial, constituida de conformidad con las leyes de Colombia, identificada con el '
  + 'NIT. xxx, con domicilio principal en la ciudad de Bogotá D.C., representada en este acto por xxx, mayor '
  + 'de edad, domiciliada en la ciudad de Bogotá D.C., identificada con cédula de Ciudadanía No. xxx expedida '
  + 'en xxx, debidamente facultada para la celebración del presente contrato, todo lo cual se acredita con el '
  + 'certificado de existencia y representación legal; y que para los efectos de este contrato se denominará '
  + '"xxxx" o "LA CONTRATISTA".';

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/** Se redacta con el contrato: desde su elaboración en adelante. */
const HABILITADO = [
  'contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado',
  'en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado',
];

export default function ContratoPrestacionDoc({ solicitud }: { solicitud: GcSolicitud }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const solicitudId = solicitud.solicitudId;

  // La solicitud llega ya cargada desde `ContratoPage`, que es quien reparte la plantilla
  // según el tipo. `sol` es estado propio para que la acción de la etapa pueda refrescarla.
  const [sol, setSol] = useState<GcSolicitud>(solicitud);
  const [saving, setSaving] = useState(false);

  // Solo lo guardado sobre la plantilla: nada se prellena desde la solicitud. El formato
  // trae sus propios huecos —«xxx», «xx (x) meses»— y sustituirlos por datos sueltos
  // dejaría una ficha a medias, con unas celdas diligenciadas y otras no.
  const [f, setF] = useState<ContratoState>(() => {
    const saved = (solicitud.data?.contrato ?? {}) as Partial<ContratoState>;
    return { ...EMPTY, ...saved, textos: saved.textos ?? {} };
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
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col items-center">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
                <span className="text-[11px] font-bold mt-1">900.456.735-7</span>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-14 object-contain" />
            </div>

            <div className="text-center font-bold leading-snug text-[12.5px] mb-4">
              <TextoEd
                k="titulo"
                plantilla="CONTRATO DE PRESTACIÓN DE SERVICIOS ENTRE CANALES Y CONTACTOS S.A.S. y xxxx"
                className="text-center"
              />
            </div>

            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Fila label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} bold />
                <Fila label="Identificación Tributaria" value={f.contratanteNit} onChange={(v) => set('contratanteNit', v)} />
                <Fila label="Representante Legal" value={f.contratanteRepLegal} onChange={(v) => set('contratanteRepLegal', v)} bold />
                <Fila label="Identificación" value={f.contratanteRepCc} onChange={(v) => set('contratanteRepCc', v)} />
                <Fila label="Dirección de domicilio:" value={f.contratanteDireccion} onChange={(v) => set('contratanteDireccion', v)} area />
                <Fila label="Teléfono:" value={f.contratanteTelefono} onChange={(v) => set('contratanteTelefono', v)} />
                {/* Son tres correos, uno por renglón: van en un campo que crece. */}
                <Fila label="Correo Electrónico" value={f.contratanteCorreo} onChange={(v) => set('contratanteCorreo', v)} area filas={3} enlace />

                <Fila label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} bold placeholder="xxx" />
                <Fila label="Identificación Tributaria" value={f.contratistaNit} onChange={(v) => set('contratistaNit', v)} placeholder="xx" />
                <Fila label="Representante Legal" value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} placeholder="xx" />
                <Fila label="Identificación" value={f.contratistaRepCc} onChange={(v) => set('contratistaRepCc', v)} placeholder="xx" />
                <Fila label="Dirección de domicilio:" value={f.contratistaDireccion} onChange={(v) => set('contratistaDireccion', v)} placeholder="xxx" />
                <Fila label="Teléfono:" value={f.contratistaTelefono} onChange={(v) => set('contratistaTelefono', v)} placeholder="xxx" />
                <Fila label="Correo Electrónico" value={f.contratistaCorreo} onChange={(v) => set('contratistaCorreo', v)} placeholder="xxx" enlace />

                <Fila label="Objeto Del Contrato" value={f.objeto} onChange={(v) => set('objeto', v)} area filas={3}
                  placeholder="LA CONTRATISTA deberá prestar sus servicios profesionales a CANALES Y CONTACTOS S.A.S, teniendo como objetivo principal xxx" />
                <Fila label="VALOR TOTAL DEL CONTRATO" value={f.valor} onChange={(v) => set('valor', v)} area filas={3} etiquetaFuerte
                  placeholder="Valor antes de IVA: $xxx M/CTE. IVA del 19%: $xxx M/CTE. Valor total incluido IVA: $xxx M/CTE." />
                <Fila label="FORMA DE PAGO" value={f.formaPago} onChange={(v) => set('formaPago', v)} area filas={3} etiquetaFuerte
                  placeholder="xxx (x) pagos mensuales vencidos, cada uno por $xxx M/CTE, más IVA del 19% por $xxx M/CTE, para un total mensual incluido IVA de $xxx M/CTE." />
                <Fila label="PLAZO DE EJECUCIÓN" value={f.plazo} onChange={(v) => set('plazo', v)} etiquetaFuerte placeholder="xxx (x) meses" />
                <Fila label="Inicio" value={f.inicio} onChange={(v) => set('inicio', v)} placeholder="xxx" />
                <Fila label="Terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} placeholder="xxx" />
              </tbody>
            </table>

            {/* Comparecencia de las partes */}
            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <TextoEd k="comparecencia" plantilla={COMPARECENCIA} />
              <TextoEd k="partes" plantilla={'Las partes se denominarán individualmente cada una como una "Parte" y conjuntamente como las "Partes".'} />
              <TextoEd k="convenio" plantilla={'Las Partes han convenido celebrar el presente Contrato de Prestación de Servicios (en adelante, el "Contrato"), el cual se regirá por las siguientes cláusulas:'} />
            </div>

            <h2 className="text-center font-bold my-4">CLÁUSULAS</h2>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify">
              <p><b>PRIMERA. OBJETO:</b></p>
              <TextoEd k="c1" plantilla="LA CONTRATISTA deberá prestar sus servicios profesionales a CANALES Y CONTACTOS S.A.S, teniendo como objetivo principal xxx" />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>SEGUNDA. VALOR DEL CONTRATO Y FORMA DE PAGO:</b></p>
              <TextoEd k="c2.valor" plantilla="El valor del presente Contrato, antes de IVA, será de xxxx DE PESOS MONEDA LEGAL ($xxx.000 M/CTE). El IVA, liquidado a la tarifa del diecinueve por ciento (19%), corresponde a la suma de xxxx PESOS MONEDA LEGAL ($xxx M/CTE), para un valor total incluido IVA de xxxx PESOS MONEDA LEGAL ($xxx M/CTE). El valor será pagado a LA CONTRATISTA, mes vencido, en xx (x) pagos mensuales, cada uno por la suma de xxxx PESOS MONEDA LEGAL ($xxx M/CTE), más IVA del diecinueve por ciento (19%) por valor de xxx PESOS MONEDA LEGAL ($xxx M/CTE), para un valor mensual total incluido IVA de xxxx PESOS MONEDA LEGAL ($xxx M/CTE). El IVA se causará y facturará de conformidad con la normativa tributaria vigente y la calidad tributaria de LA CONTRATISTA." />
              <TextoEd k="c2.soportes" plantilla="Cada pago se efectuará mes vencido, previa presentación de la respectiva factura electrónica de venta y de la certificación de encontrarse al día en el pago de los aportes al Sistema de Seguridad Social Integral y parafiscales a que haya lugar, expedida por el revisor fiscal de LA CONTRATISTA, si está obligada a tenerlo, o en su defecto por su representante legal o contador." />
              <TextoEd k="c2.factura" plantilla="La factura deberá ser presentada por LA CONTRATISTA dentro de los cinco (5) primeros días calendario de cada mes, y el pago se realizará dentro de la semana siguiente a su radicación, siempre que se encuentren cumplidos los requisitos señalados en el presente documento." />
              <TextoEd k="c2.descuentos" plantilla="Del valor a pagar se efectuarán los descuentos, retenciones, impuestos y demás deducciones a que haya lugar, de conformidad con la normativa tributaria vigente en Colombia. Todos los pagos se realizarán en pesos colombianos." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>TERCERA. DURACIÓN Y PLAZO DE EJECUCIÓN:</b></p>
              <TextoEd k="c3.plazo" plantilla="El plazo de ejecución del presente Contrato será de xxx (xx) meses, comprendido entre el xxx (0x) de xx de dos mil xxx (202x) y el xx (3x) de xxx de dos mil xxxx (202x). La ejecución iniciará el xx (0x) de x de dos mil xxxx (202x), previa expedición, presentación y aprobación por parte de LA CONTRATANTE de las garantías exigidas en el presente Contrato. LA CONTRATISTA no podrá iniciar actividades mientras las garantías no se encuentren debidamente aprobadas." />
              <TextoEd k="c3.prorroga" plantilla="El presente Contrato podrá ser prorrogado de común acuerdo entre las Partes, mediante acuerdo escrito suscrito por sus representantes legalmente autorizados." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>CUARTA. OBLIGACIONES DEL CONTRATISTA:</b></p>
              <TextoEd k="c4.intro" plantilla="Serán a cargo de LA CONTRATISTA las siguientes obligaciones, conforme a la propuesta presentada por el contratista la cual hará parte integral de este documento en xxx (xx) folios:" />

              <p className="pt-1"><b>A) Obligaciones Generales:</b></p>
              <ListaNumerada
                items={f.obligacionesGenerales}
                onChange={(v) => set('obligacionesGenerales', v)}
                clave="oblGen"
                plantillas={GENERALES}
                editable={editable}
              />

              <p className="pt-1"><b>B) Obligaciones Específicas:</b></p>
              <ListaNumerada
                items={f.obligacionesEspecificas}
                onChange={(v) => set('obligacionesEspecificas', v)}
                clave="oblEsp"
                plantillas={ESPECIFICAS}
                editable={editable}
              />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>QUINTA. OBLIGACIONES DE LA CONTRATANTE:</b></p>
              <TextoEd k="c5.intro" plantilla="Serán obligaciones de LA CONTRATANTE las siguientes:" />
              <ListaNumerada
                items={f.obligacionesContratante}
                onChange={(v) => set('obligacionesContratante', v)}
                clave="oblCte"
                plantillas={DE_LA_CONTRATANTE}
                editable={editable}
              />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>SEXTA. SUPERVISIÓN:</b></p>
              <TextoEd k="c6.quien" plantilla="La supervisión del presente Contrato será ejercida directamente por la doctora GLORIA LUCÍA ESCALANTE MANZANO, en su calidad de Gerente y Representante Legal de CANALES Y CONTACTOS S.A.S." />
              <TextoEd k="c6.alcance" plantilla="La supervisora realizará el seguimiento a la ejecución contractual, revisará y aprobará las facturas y demás soportes presentados por LA CONTRATISTA." />
              <TextoEd k="c6.limites" plantilla="La supervisión no releva a LA CONTRATISTA de la responsabilidad por el cumplimiento integral, correcto y oportuno de sus obligaciones. LA CONTRATANTE podrá modificar la designación de la supervisión mediante comunicación escrita, sin necesidad de suscribir un otrosí." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>SÉPTIMA. TERMINACIÓN:</b></p>
              <TextoEd k="c7.intro" plantilla="El presente Contrato podrá darse por terminado de manera anticipada por las siguientes causales:" />
              <ListaNumerada
                items={f.causalesTerminacion}
                onChange={(v) => set('causalesTerminacion', v)}
                clave="causal"
                plantillas={CAUSALES}
                editable={editable}
                etiqueta="causal"
              />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>OCTAVA. PARTES INDEPENDIENTES:</b></p>
              <TextoEd k="c8.constancia" plantilla="Se deja expresa constancia de que entre las Partes existe una relación comercial derivada del presente Contrato, siendo cada una de ellas exclusivamente responsable por el cumplimiento de sus obligaciones en materia laboral, civil, mercantil, tributaria, administrativa y, en general, por cualquier otra derivada de la ley." />
              <TextoEd k="c8.autonomia" plantilla="Cada una de las Partes actuará por su propia cuenta, con absoluta autonomía e independencia técnica, directiva y financiera, y no estarán sometidas a subordinación laboral de la otra Parte." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>NOVENA. CONFIDENCIALIDAD:</b></p>
              <TextoEd k="c9.alcance" plantilla="Con la suscripción del presente Contrato, las Partes reconocen que toda la información entregada por cada una de ellas es confidencial y de propiedad de quien la entrega. Dicha información se revela única y exclusivamente para el desarrollo del objeto contractual y sólo podrá ser utilizada para los fines previstos en el presente Contrato." />
              <TextoEd k="c9.divulgacion" plantilla="Las Partes se abstendrán de divulgar a terceros, en cualquier forma o modo, la información confidencial que le suministre la otra Parte y se obligan a tratar dicha información con la más absoluta confidencialidad, salvo que exista autorización previa, expresa y escrita de la parte reveladora caso en el cual sólo se revelará la información respectiva de acuerdo con las instrucciones que para el efecto indique la parte reveladora." />
              <TextoEd k="c9.proteccion" plantilla="Adicionalmente, las Partes se obligan a mantener la información confidencial debidamente protegida del acceso de terceros, con el fin de no permitir su conocimiento y/o manejo por parte de personas no autorizadas expresamente por la parte que hace la revelación." />
              <TextoEd k="c9.personal" plantilla="Las Partes se obligan a que las personas que se encuentren bajo su dirección cumplan con las obligaciones establecidas en la presente Cláusula. En consecuencia, de llegarse a acreditar incumplimiento, la parte incumplidora se hace responsable por todos los daños y perjuicios que sufra la Parte afectada en el evento en que las personas que estén a cargo o bajo la dirección violen las obligaciones establecidas en la presente Cláusula." />
              <TextoEd k="c9.devolucion" plantilla="Al momento de la terminación del presente Contrato, o antes a solicitud de una de las Partes, las Partes deberán devolver toda la información confidencial que se encuentre en su poder, ya sea en medio escrito, magnético, digital y, en general, en cualquier otro sistema tecnológico con capacidad para almacenar información en cualquiera de sus formas." />
              <TextoEd k="c9.vigencia" plantilla="La información confidencial deberá ser tratada como tal y debidamente resguardada por las Partes durante el término de vigencia del presente Contrato y a partir de la fecha en que ésta le es entregada. Las obligaciones de no revelar, divulgar, exhibir, mostrar, comunicar, utilizar y/o emplear la Información Confidencial en beneficio propio y/o en el de terceros adquiridas por cada Parte no se entenderán extinguidas por el vencimiento del término de duración del presente Contrato y por lo mismo continuarán vigentes por un término de dos (2) años contados a partir de la fecha de terminación del presente Contrato." />
              <TextoEd k="c9.ordenLegal" plantilla="En el evento en que una de las Partes, en desarrollo o por mandato de una ley, decreto, sentencia y/u orden de autoridad competente en ejercicio de sus funciones legales, se vea obligada a revelar o divulgar la información confidencial que le ha sido entregada por la otra Parte, se obliga a dar aviso por escrito de ello a la otra Parte dentro de los tres (3) días hábiles siguientes a que tenga conocimiento de esta obligación de revelación, para que esta pueda tomar las medidas necesarias para (i) proteger su información confidencial y (ii) atenuar los efectos de tal divulgación." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA. RESPONSABILIDAD E INDEMNIDAD:</b></p>
              <TextoEd k="c10.indemnidad" plantilla="Cada Parte responderá por los daños directos, comprobados e imputables que cause a la otra Parte o a terceros con ocasión del incumplimiento de sus obligaciones contractuales. La Parte incumplidora mantendrá indemne a la Parte afectada, sus administradores, trabajadores y dependientes frente a reclamaciones, demandas, sanciones, condenas, costos y gastos razonables que tengan origen en dicho incumplimiento." />
              <TextoEd k="c10.limite" plantilla="Salvo las exclusiones previstas en este párrafo, la responsabilidad total acumulada de LA CONTRATISTA no excederá el valor del Contrato antes de IVA. Esta limitación no será aplicable cuando los daños provengan de dolo o culpa grave; violación de las obligaciones de confidencialidad; infracción de derechos de propiedad intelectual; tratamiento no autorizado o indebido de datos personales; reclamaciones laborales, de seguridad social o tributarias relacionadas con el personal o dependientes de LA CONTRATISTA; pagos indebidos, actos de corrupción o conductas ilícitas; ni respecto de los riesgos cubiertos por las garantías contractuales." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA PRIMERA. PROPIEDAD INTELECTUAL:</b></p>
              <TextoEd k="c11.preexistentes" plantilla="Los derechos de propiedad intelectual preexistentes de cada Parte continuarán perteneciendo a su respectivo titular y no se entenderán transferidos por la celebración del presente Contrato." />
              <TextoEd k="c11.resultados" plantilla="Los documentos, conceptos, matrices, bases de datos, diseños, desarrollos, metodologías adaptadas y demás resultados elaborados específicamente por LA CONTRATISTA en ejecución del objeto contractual, y que sean susceptibles de protección, pertenecerán a LA CONTRATANTE. En consecuencia, LA CONTRATISTA cede a título exclusivo a LA CONTRATANTE los derechos patrimoniales de autor que le correspondan sobre dichos resultados, para su reproducción, distribución, comunicación pública, puesta a disposición, adaptación, transformación y demás modalidades de explotación permitidas por la ley, en Colombia y en el exterior, por el término máximo de protección legal. Esta cesión se entiende remunerada con el valor del Contrato. Los derechos morales permanecerán en cabeza de sus autores en los términos de la ley. Cuando los resultados incorporen elementos preexistentes de LA CONTRATISTA, esta otorga a LA CONTRATANTE una licencia no exclusiva, irrevocable y suficiente para utilizar dichos elementos como parte de los resultados contractuales, en Colombia y en el exterior, por el término máximo de protección legal. LA CONTRATISTA garantiza que los resultados entregados no vulneran derechos de terceros y se obliga a suscribir los documentos razonablemente necesarios para formalizar la titularidad o licencia aquí prevista." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA SEGUNDA. INTEGRIDAD Y NO NOVACIÓN:</b></p>
              <TextoEd k="c12" plantilla="El presente Contrato contiene el acuerdo integral de las Partes respecto de su objeto y sustituye los entendimientos o acuerdos previos, escritos o verbales, relacionados con este mismo objeto y en el período aquí contratado. Su celebración no implica novación, condonación, renuncia o extinción de obligaciones, pagos, responsabilidades, garantías, deberes de confidencialidad o reclamaciones originadas en contratos anteriores y sus modificaciones, las cuales conservarán los efectos jurídicos que les correspondan." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA TERCERA. DIVISIBILIDAD:</b></p>
              <TextoEd k="c13" plantilla="Si alguna cláusula del presente Contrato es declarada nula, ilegal o ineficaz, las demás estipulaciones continuarán vigentes. La disposición afectada deberá ajustarse, de común acuerdo entre las Partes, en la medida necesaria para adecuarla a la ley aplicable y conservar, en lo posible, su finalidad económica y contractual." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA CUARTA. TRATAMIENTO DE DATOS PERSONALES:</b></p>
              <TextoEd k="c14" plantilla="Las Partes se obligan a tratar los datos personales a los que accedan con ocasión del presente Contrato de conformidad con la Ley 1581 de 2012, sus normas reglamentarias, las disposiciones que las modifiquen o sustituyan y las políticas de tratamiento de datos personales aplicables. El tratamiento se limitará a las finalidades necesarias para la celebración, ejecución, seguimiento, facturación, auditoría, defensa jurídica y cumplimiento de obligaciones legales derivadas del Contrato. Cada Parte adoptará medidas razonables de seguridad, confidencialidad y acceso restringido, y responderá por el tratamiento que realice en calidad de responsable o encargado, según corresponda." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA QUINTA. DERECHOS DE LOS TITULARES Y SUPRESIÓN DE DATOS:</b></p>
              <TextoEd k="c15.intro" plantilla="Los titulares de los datos personales podrán conocer, actualizar y rectificar su información; solicitar prueba de la autorización cuando sea procedente; ser informados sobre el uso dado a sus datos; presentar consultas o reclamos; y solicitar la revocatoria de la autorización o la supresión de sus datos, cuando legalmente corresponda. La solicitud de supresión podrá formularse cuando:" />
              <ListaNumerada
                items={f.causalesSupresion}
                onChange={(v) => set('causalesSupresion', v)}
                clave="supr"
                plantillas={SUPRESION}
                editable={editable}
                etiqueta="causal"
              />

              <p className="pt-1"><b>PARÁGRAFO.</b></p>
              <TextoEd k="c15.paragrafo" plantilla="El derecho de supresión no es absoluto y podrá negarse cuando:" />
              <ListaNumerada
                items={f.negativasSupresion}
                onChange={(v) => set('negativasSupresion', v)}
                clave="negSupr"
                plantillas={NEGATIVA_SUPRESION}
                editable={editable}
                etiqueta="causal"
              />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA SEXTA. PROBIDAD Y PROHIBICIÓN DE PAGOS INDEBIDOS:</b></p>
              <TextoEd k="c16" plantilla="LA CONTRATISTA se obliga a desempeñar sus actividades con integridad, ética y lealtad hacia CANALES Y CONTACTOS S.A.S. En este sentido, queda estrictamente prohibido solicitar, recibir o aceptar, directa o indirectamente, cualquier pago, comisión, gratificación, beneficio, dádiva o retribución de proveedores, contratistas, clientes o terceros con quienes la empresa mantenga o pueda mantener relaciones comerciales o contractuales. El incumplimiento de esta disposición constituirá incumplimiento grave y será causal de terminación inmediata del Contrato por incumplimiento contractual, sin perjuicio de las acciones legales y reclamaciones por daños y perjuicios a que haya lugar." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA SÉPTIMA. NOTIFICACIONES:</b></p>
              <TextoEd k="c17" plantilla="Todas las notificaciones, solicitudes, requerimientos o comunicaciones relacionadas con el presente Contrato deberán realizarse por escrito y enviarse: (i) mediante servicio de correo reconocido; o (ii) por correo electrónico, a las direcciones señaladas a continuación o a aquellas que sean informadas posteriormente por escrito. Las direcciones electrónicas indicadas serán válidas para notificaciones contractuales, legales y judiciales, hasta tanto se comunique su modificación." />

              {/* Los datos de notificación son los mismos de la ficha de arriba y se leen de
                  allí: con campos propios, un contrato podría acabar notificando a una
                  dirección y describiendo otra. */}
              <table className="w-full border-collapse text-[12px] mt-2">
                <tbody>
                  <Fila label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} bold placeholder="xxx" />
                  <Fila label="Dirección de domicilio:" value={f.contratistaDireccion} onChange={(v) => set('contratistaDireccion', v)} placeholder="xx" />
                  <Fila label="Celular:" value={f.contratistaTelefono} onChange={(v) => set('contratistaTelefono', v)} placeholder="xxx" />
                  <Fila label="Correo Electrónico" value={f.contratistaCorreo} onChange={(v) => set('contratistaCorreo', v)} placeholder="xxx" enlace />
                </tbody>
              </table>

              <table className="w-full border-collapse text-[12px] mt-2">
                <tbody>
                  <Fila label="Contratante" value={f.contratante} onChange={(v) => set('contratante', v)} bold />
                  <Fila label="Dirección de domicilio:" value={f.contratanteDireccion} onChange={(v) => set('contratanteDireccion', v)} area />
                  <Fila label="Teléfono:" value={f.contratanteTelefono} onChange={(v) => set('contratanteTelefono', v)} />
                  <Fila label="Correo Electrónico" value={f.contratanteCorreo} onChange={(v) => set('contratanteCorreo', v)} area filas={3} enlace />
                </tbody>
              </table>

              <TextoEd k="c17.recepcion" plantilla="Todas las notificaciones, requerimientos o cualquier otro tipo de comunicación se entenderán recibidas en la fecha de su recepción por el destinatario si se recibe antes de las 5:00 pm en el lugar de recepción y si dicho día es un día hábil. En caso contrario, las notificaciones, requerimientos o comunicaciones se entenderán recibidas el siguiente día hábil en el lugar de notificación del destinatario." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA OCTAVA. ORIGEN DE INGRESOS:</b></p>
              <TextoEd k="c18" plantilla="Las Partes declaran que los recursos utilizados en la ejecución del presente Contrato y sus ingresos provienen de actividades lícitas. Igualmente, declaran que no se encuentran incursas en las listas nacionales o internacionales vinculantes de prevención en lavado de activos, financiación del terrorismo o financiación de la proliferación de armas de destrucción masiva. La Parte que incumpla esta declaración responderá por los perjuicios que cause a la otra Parte o a terceros, sin perjuicio de la terminación del Contrato y de las acciones legales a que haya lugar." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>DÉCIMA NOVENA. MODIFICACIONES:</b></p>
              <TextoEd k="c19" plantilla="El presente Contrato sólo podrá ser modificado, adicionado, prorrogado o aclarado mediante documento escrito suscrito por los representantes legalmente autorizados de ambas Partes." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>VIGÉSIMA. CESIÓN:</b></p>
              <TextoEd k="c20" plantilla="Ninguna de las Partes podrá ceder total o parcialmente su posición contractual, sus derechos o sus obligaciones derivados del presente Contrato sin la autorización previa, expresa y escrita de la otra Parte." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>VIGÉSIMA PRIMERA. LEGISLACIÓN APLICABLE Y SOLUCIÓN DE CONTROVERSIAS:</b></p>
              <TextoEd k="c21.ley" plantilla="El presente Contrato se celebra y ejecuta de conformidad con las leyes de la República de Colombia." />
              <TextoEd k="c21.controversias" plantilla="Las controversias o diferencias que surjan con ocasión de la celebración, interpretación, ejecución, terminación o liquidación del presente Contrato serán sometidas inicialmente a negociación directa entre las Partes durante un término de treinta (30) días calendario, contado desde la recepción del requerimiento escrito formulado por cualquiera de ellas. Vencido dicho término sin que se alcance un acuerdo, la controversia será resuelta por un tribunal de arbitramento integrado por un (1) árbitro, que decidirá en derecho y será administrado por el Centro de Conciliación, Arbitraje y Amigable Composición de la Cámara de Comercio de Cali, de conformidad con su reglamento. El árbitro será designado de común acuerdo por las Partes y, a falta de acuerdo, por el referido Centro. La sede del tribunal será la ciudad de Cali, Valle del Cauca." />
            </div>

            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <p><b>VIGÉSIMA SEGUNDA. GARANTÍAS CONTRACTUALES:</b></p>
              <TextoEd k="c22.intro" plantilla="Para cubrir los riesgos derivados de la celebración y ejecución del presente Contrato, LA CONTRATISTA deberá presentar a LA CONTRATANTE las garantías establecidas en esta cláusula, expedidas por una compañía de seguros legalmente autorizada para operar en Colombia. Las garantías deberán encontrarse expedidas, presentadas y aprobadas antes del inicio de la ejecución. La aprobación escrita de las garantías será requisito para iniciar actividades y efectuar pagos. Las garantías tendrán las siguientes características:" />

              <CuadroGarantias f={f} set={set} editable={editable} />

              <TextoEd k="c22.restablecimiento" plantilla="LA CONTRATISTA estará obligada a restablecer el valor de las garantías cuando este se vea reducido por razón de las reclamaciones que efectúe LA CONTRATANTE, así como a ampliarlas en los eventos de adición y/o prórroga del Contrato. El no restablecimiento, ampliación o prórroga de las garantías, según corresponda, constituirá incumplimiento contractual y dará lugar a las acciones contractuales pertinentes." />
              <TextoEd k="c22.franquicias" plantilla="Las franquicias, coaseguros obligatorios y demás formas de estipulación que impliquen la asunción de parte de la pérdida por LA CONTRATANTE, en calidad de asegurada, no serán admisibles." />
              <TextoEd k="c22.comprobante" plantilla="LA CONTRATISTA deberá anexar el comprobante de pago de las garantías contractuales." />
            </div>

            {/* Suscripción y firmas */}
            <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
              <TextoEd k="suscripcion" plantilla="Las partes suscriben el presente Contrato en Cali, Valle del Cauca, el xxxx (xx) de xxx de dos mil veintiséis (2026)." />
              <TextoEd k="inicioEjecucion" plantilla="La ejecución iniciará el xxx (0x) de xxx de dos mil veintiséis (2026), previa expedición, presentación y aprobación de las garantías contractuales exigidas." />
            </div>

            {/* Quien firma por cada parte sale de la ficha de arriba: es la misma persona y
                con campos propios el contrato podría nombrar a dos distintas. */}
            <div className="grid grid-cols-2 gap-8 mt-10 text-[12px]">
              <div>
                <p className="font-bold mb-16">Por LA CONTRATANTE</p>
                <div className="border-t border-black pt-1">
                  <FLine value={f.contratanteRepLegal} onChange={(v) => set('contratanteRepLegal', v)} placeholder="NOMBRE DE QUIEN FIRMA" bold />
                  <p>Representante legal</p>
                  <FLine value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="EMPRESA CONTRATANTE" bold />
                </div>
              </div>
              <div>
                <p className="font-bold mb-16">Por LA CONTRATISTA</p>
                <div className="border-t border-black pt-1">
                  <FLine value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} placeholder="xxx" bold />
                  <FLine value={f.contratistaRepCc} onChange={(v) => set('contratistaRepCc', v)} placeholder="C.C. xxx" />
                  <p>Representante legal</p>
                  <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="xxx" bold />
                </div>
              </div>
            </div>

            {/* Membrete del pie */}
            <div className="mt-10 pt-3 text-center text-[9.5px] leading-snug text-[#0a2a52]">
              <p>Calle 13A N.º 101 - 60 B/ Ciudad Jardín Cali, Valle del Cauca</p>
              <p className="underline">gestiondocumental@alumbrados.co</p>
              <p>PBX: (602) 5246612 Ext. 111 &nbsp; Línea nacional 3009108536</p>
            </div>
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

/**
 * El cuadro de garantías de la vigésima segunda: característica y condición, con la tabla
 * de amparos anidada en una de las filas, como en el formato.
 *
 * Los amparos se pueden agregar y quitar porque no siempre son los dos: un contrato con
 * anticipo lleva además el de buen manejo, y uno sin personal a cargo puede no llevar el
 * de salarios.
 */
function CuadroGarantias({ f, set, editable }: {
  f: ContratoState;
  set: <K extends keyof ContratoState>(k: K, v: ContratoState[K]) => void;
  editable: boolean;
}) {
  const celda = 'border border-[#0a2a52] px-2 py-1 align-top';
  const campo = 'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black';
  const cambiar = (i: number, k: 'amparo' | 'valor' | 'vigencia', v: string) =>
    set('amparos', f.amparos.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  return (
    <table className="w-full border-collapse text-[12px] my-3">
      <thead>
        <tr className="bg-[#595959] text-white text-left">
          <th className={`${celda} w-[24%]`}>Característica</th>
          <th className={celda}>Condición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={celda}>Asegurado</td>
          <td className={celda}>
            <input value={f.aseguradoNombre} onChange={(e) => set('aseguradoNombre', e.target.value)} className={`${campo} font-bold`} />
            <input value={f.aseguradoNit} onChange={(e) => set('aseguradoNit', e.target.value)} className={`${campo} font-bold underline`} />
          </td>
        </tr>
        <tr>
          <td className={celda}>Amparos, vigencia y valores asegurados</td>
          <td className={celda}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[#548235] text-left">
                  <th className={celda}>AMPARO</th>
                  <th className={`${celda} w-[26%]`}>% / VALOR ASEGURADO</th>
                  <th className={`${celda} w-[34%]`}>VIGENCIA</th>
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
                      <div className="flex gap-1 items-start">
                        <textarea value={a.vigencia} onChange={(e) => cambiar(i, 'vigencia', e.target.value)} rows={3} className={`${campo} resize-y leading-snug`} />
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
                onClick={() => set('amparos', [...f.amparos, { amparo: '', valor: '', vigencia: '' }])}
                className="no-print flex items-center gap-1 mt-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar amparo
              </button>
            )}
          </td>
        </tr>
        <tr>
          <td className={celda}>Tomador</td>
          <td className={celda}>
            <input value={f.tomador} onChange={(e) => set('tomador', e.target.value)} placeholder="xxx" className={`${campo} font-bold`} />
            <input value={f.tomadorNit} onChange={(e) => set('tomadorNit', e.target.value)} placeholder="NIT xxx" className={campo} />
          </td>
        </tr>
        <tr>
          <td className={celda}>Información necesaria dentro de la póliza</td>
          <td className={celda}>
            <textarea value={f.infoPoliza} onChange={(e) => set('infoPoliza', e.target.value)} rows={3} className={`${campo} resize-y leading-snug`} />
          </td>
        </tr>
      </tbody>
    </table>
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
 * Lista numerada de obligaciones. Cada punto se edita por separado y se pueden agregar o
 * quitar: cuántas obligaciones tiene un contrato depende de lo que se contrató, y las
 * específicas cambian por completo de uno a otro.
 *
 * La clave del texto guardado lleva el número, no el índice: con el índice, quitar un punto
 * correría todos los de abajo y cada uno heredaría el texto del siguiente.
 */
function ListaNumerada({ items, onChange, clave, plantillas, editable, etiqueta = 'obligación' }: {
  items: string[];
  onChange: (v: string[]) => void;
  clave: string;
  plantillas: string[];
  editable: boolean;
  etiqueta?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((_, i) => (
        <div key={i} className="flex gap-3 items-start pl-6">
          <span className="w-5 flex-shrink-0">{i + 1}.</span>
          <div className="flex-grow min-w-0">
            <TextoEd k={`${clave}${i + 1}`} plantilla={plantillas[i] ?? ''} />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title={`Quitar esta ${etiqueta}`}
              className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0"
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
          className="no-print flex items-center gap-1 pl-6 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar {etiqueta}
        </button>
      )}
    </div>
  );
}

/**
 * Una fila de la ficha: etiqueta a la izquierda, dato a la derecha. `bold` es del dato
 * —las partes van en negrita en el formato— y `etiquetaFuerte`, de la etiqueta.
 */
function Fila({ label, value, onChange, area, filas = 2, placeholder, bold, etiquetaFuerte, enlace }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  filas?: number;
  placeholder?: string;
  bold?: boolean;
  etiquetaFuerte?: boolean;
  enlace?: boolean;
}) {
  const comun = 'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 '
    + (enlace ? 'text-[#0a2a52] underline ' : 'disabled:text-black ')
    + (bold ? 'font-bold ' : '');
  return (
    <tr>
      <td className={'border border-[#0a2a52] px-2 py-1 align-top w-[36%] ' + (etiquetaFuerte ? 'font-bold' : '')}>{label}</td>
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
