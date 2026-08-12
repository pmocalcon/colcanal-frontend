import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';

/**
 * Otrosí al contrato. Se firma **después** del acta de inicio, sobre un contrato que ya
 * está corriendo: prorroga el plazo, adiciona el valor o precisa las obligaciones.
 *
 * A diferencia de los otros documentos del trámite, aquí no hay uno sino **varios**: el
 * mismo contrato puede modificarse más de una vez, cada otrosí se numera y los siguientes
 * citan a los anteriores («…modificar el contrato y el Otrosí No. 01»). Por eso se guarda
 * una lista en `data.otrosies.lista` y la pantalla tiene un selector arriba.
 *
 * Los antecedentes y las cláusulas son listas editables y no un número fijo de párrafos:
 * un Otrosí No. 03 arrastra más antecedentes que el No. 01, y clavar cinco obligaría a
 * escribir dos modificaciones dentro del mismo literal.
 *
 * Ruta: `.../juridica/:id/otrosi`.
 */

interface Otrosi {
  /** Número de este otrosí dentro del contrato: «02». Sale en el título y en el cuerpo. */
  numero: string;
  tipologia: string;
  contratante: string;
  /** Quien firma por la contratante, y la contratista con su identificación. */
  firmanteNombre: string;
  firmanteCargo: string;
  contratista: string;
  contratistaCc: string;
  /** Las filas de la tabla de la cláusula primera, tal como vienen en el formato. */
  valorInicial: string;
  valorOtrosi01: string;
  valorOtrosi02: string;
  /** Total acumulado. Se escribe a mano: son cifras en letras y en números, no una suma. */
  valorAcumulado: string;
  antecedentes: string[];
  /** Las obligaciones numeradas de la cláusula tercera. */
  obligaciones: string[];
  clausulas: { titulo: string; texto: string }[];
  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const ANTECEDENTE_NUEVO = '';

const nuevoOtrosi = (numero: string, base: Partial<Otrosi>): Otrosi => ({
  numero,
  tipologia: '',
  contratante: '',
  firmanteNombre: '',
  firmanteCargo: 'Representante Legal',
  contratista: '',
  contratistaCc: 'C.C. xxxx, xx',
  // Las celdas del cuadro llevan los huecos del formato como valor y no como
  // `placeholder`: el placeholder se ve en pantalla pero no se imprime, y el otrosí en
  // blanco tiene que poder imprimirse para diligenciarlo a mano.
  valorInicial: 'x',
  valorOtrosi01: 'x',
  valorOtrosi02: 'x',
  valorAcumulado: '$ x',
  // Los cinco literales del formato: suscripción, vigencia, valor, el otrosí anterior y la
  // voluntad de modificar. Se dejan vacíos para que cada uno caiga sobre su plantilla y
  // solo se guarde lo que se reescriba.
  antecedentes: ['', '', '', '', ''],
  obligaciones: ['', '', '', '', '', ''],
  clausulas: [],
  textos: {},
  ...base,
});

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/** El otrosí modifica un contrato en ejecución: antes del acta no hay qué modificar. */
const HABILITADO = ['en_acta_inicio', 'finalizado'];

const tx = (v: string) => (v?.trim() ? v : '…');

export default function OtrosiPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [lista, setLista] = useState<Otrosi[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const f = lista[idx];

  /** Datos del contrato que el otrosí cita. Salen de la solicitud, no se vuelven a pedir. */
  const delContrato = useMemo(() => {
    const d = sol?.data ?? {};
    return {
      tipologia: getTipo(d.tipoContrato)?.nombre || 'Prestación de servicios',
      contratante: d.empresa || '',
      contratista: d.contratista || '',
      objeto: d.alcanceServicio || d.objetoProyecto || '',
    };
  }, [sol]);

  const set = <K extends keyof Otrosi>(k: K, v: Otrosi[K]) =>
    setLista((l) => l.map((o, i) => (i === idx ? { ...o, [k]: v } : o)));

  // El contexto de textos se arma a mano y no con `useTextosDocumento` porque el estado no
  // es un documento sino una lista: lo que se reescribe pertenece al otrosí abierto.
  const textosCtx = useMemo(
    () => ({
      get: (clave: string, plantilla: string) => f?.textos?.[clave] ?? plantilla,
      set: (clave: string, valor: string) =>
        setLista((l) =>
          l.map((o, i) => (i === idx ? { ...o, textos: { ...(o.textos ?? {}), [clave]: valor } } : o)),
        ),
    }),
    [f?.textos, idx],
  );

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const guardado = (data.data?.otrosies ?? {}) as { lista?: Otrosi[] };
        setLista(guardado.lista ?? []);
      } catch {
        if (!cancelled) toast.error('No se pudieron cargar los otrosíes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const agregar = () => {
    // El número viene del formato, como todo lo demás: la plantilla es la del Otrosí No. 02.
    // Es una casilla del título y se cambia escribiendo encima.
    setLista((l) => [...l, nuevoOtrosi('02', {
      tipologia: delContrato.tipologia,
      contratante: delContrato.contratante,
      contratista: l[0]?.contratista || delContrato.contratista,
      // Sin nada que copiar del anterior, se deja el hueco del formato.
      contratistaCc: l[0]?.contratistaCc || 'C.C. xxxx, xx',
      // Quien firma por la contratante es siempre la representante legal, la misma que ya
      // va nombrada en la comparecencia. Se prellena para no teclearla dos veces.
      firmanteNombre: l[0]?.firmanteNombre || 'GLORIA LUCÍA ESCALANTE MANZANO',
      // El valor inicial es del contrato, no del otrosí: se copia del primero para no
      // volver a teclearlo —y para que los dos documentos no digan cifras distintas—.
      valorInicial: l[0]?.valorInicial || '',
    })]);
    setIdx(lista.length);
  };

  const eliminar = () => {
    // No se renumeran los que quedan: el No. 02 se llama así en el papel firmado y en los
    // otrosíes que lo citan. Renumerar aquí desmentiría documentos que ya existen.
    setLista((l) => l.filter((_, i) => i !== idx));
    setIdx((i) => Math.max(0, i - 1));
  };

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'otrosies', { lista });
      toast.success(lista.length === 1 ? 'Otrosí guardado' : 'Otrosíes guardados');
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

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Otrosí</h1>
            <p className="text-xs text-[#4a4a63]">Modificación al contrato · Solicitud N.º {solicitudId}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && lista.length > 0 && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="otrosi" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El otrosí aún no está <b>habilitado</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Un otrosí modifica un contrato que ya está en ejecución: se habilita desde el acta de inicio.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : lista.length === 0 ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">Este contrato no tiene otrosíes.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se redacta uno cuando hay que prorrogar el plazo, adicionar el valor o precisar las obligaciones.</p>
            {editable && (
              <Button onClick={agregar} className="gap-2 mt-4 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
                <Plus className="w-4 h-4" /> Redactar el primer otrosí
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Selector: cuál otrosí se está viendo. Los anteriores no se archivan porque
                cada uno sigue vigente y el siguiente los cita por número. */}
            <div className="no-print mb-4 flex flex-wrap items-center gap-2">
              {lista.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={'rounded-lg px-3 py-1.5 text-sm transition-colors '
                    + (i === idx
                      ? 'bg-[#ffe81a] text-[#16162b] font-semibold'
                      : 'text-[#4a4a63] font-medium hover:bg-[#f6f6fa] hover:text-[#16162b]')}
                >
                  Otrosí No. {o.numero || i + 1}
                </button>
              ))}
              {editable && (
                <>
                  <Button variant="outline" size="sm" onClick={agregar} className="gap-1 ml-2 text-[#4a4a63] border-[#c9c9dc] hover:bg-[#f6f6fa]">
                    <Plus className="w-3.5 h-3.5" /> Nuevo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={eliminar} className="gap-1 text-[#4a4a63] hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar este
                  </Button>
                </>
              )}
            </div>

            <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
            <TextosDocumento value={textosCtx}>
            <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-10 py-8">
              {/* Membrete */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col items-center">
                  <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
                  <span className="text-[11px] font-bold mt-1">900.456.735-7</span>
                </div>
                <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-14 object-contain" />
              </div>

              {/* Título */}
              <div className="text-center font-bold leading-snug text-[12.5px] mb-5">
                <div className="flex items-center justify-center gap-1">
                  <span>OTROSÍ No.</span>
                  <input
                    value={f.numero}
                    onChange={(e) => set('numero', e.target.value)}
                    placeholder="02"
                    className="w-12 bg-transparent outline-none text-center font-bold border-b border-dotted border-transparent hover:border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
                  />
                </div>
                <TextoEd
                  k="titulo"
                  plantilla={`CONTRATO DE ${(f.tipologia || delContrato.tipologia).toUpperCase()} SUSCRITO ENTRE ${tx(f.contratante || delContrato.contratante).toUpperCase()} Y ${tx(f.contratista || delContrato.contratista).toUpperCase()}`}
                  className="text-center"
                />
              </div>

              {/* Comparecencia */}
              <div className="leading-relaxed text-[12.5px]">
                <TextoEd
                  k="comparecencia"
                  plantilla={`Entre los suscritos a saber, GLORIA LUCÍA ESCALANTE MANZANO, mayor de edad, identificada con cédula de ciudadanía No. 66.651.423 expedida en El Cerrito, actuando en calidad de representante legal de ${tx(f.contratante || delContrato.contratante)}, identificada con NIT No. 900.456.735-7, quien en lo sucesivo y para efectos de este documento se denominará LA CONTRATANTE, y, por otra parte, ${tx(f.contratista || delContrato.contratista)}, identificada con cédula de ciudadanía No. xxx expedida en xxx, quien para efectos de este documento se denominará LA CONTRATISTA, hemos convenido celebrar el presente Otrosí No. ${f.numero || 'xx'} al contrato suscrito el día xx (0x) de xxx de 20xx, de conformidad con los siguientes:`}
                />
              </div>

              {/* I. Antecedentes */}
              <h2 className="text-center font-bold my-4">I.&nbsp;&nbsp;&nbsp;ANTECEDENTES</h2>
              <ListaLiteral
                items={f.antecedentes}
                onChange={(v) => set('antecedentes', v)}
                clave="ant"
                editable={editable}
                plantillas={PLANTILLAS_ANTECEDENTE}
                etiqueta="antecedente"
              />

              {/* Puente hacia las cláusulas */}
              <div className="leading-relaxed text-[12.5px] mt-4">
                <TextoEd
                  k="puente"
                  plantilla={`Con fundamento en las anteriores consideraciones, las partes acuerdan modificar el contrato de ${(f.tipologia || delContrato.tipologia).toLowerCase()} y el Otrosí No. 01, en los términos que se establecen a continuación:`}
                />
              </div>

              <h2 className="text-center font-bold my-4">II.&nbsp;&nbsp;&nbsp;CLÁUSULAS</h2>

              {/* Primera: valor y forma de pago. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify">
                <p>
                  <b>CLÁUSULA PRIMERA. MODIFICACIÓN DEL VALOR DEL CONTRATO Y FORMA DE PAGO:</b>
                </p>
                <TextoEd k="c1.intro" plantilla="Modifíquese la cláusula segunda del contrato, correspondiente al valor y forma de pago, la cual quedará así:" />

                <p><b>VALOR TOTAL DEL CONTRATO:</b></p>
                {/* La cifra va en letras y en números; la tabla solo lleva el número. Se
                    escribe aquí a mano en vez de interpolar el total, que llenaría los dos
                    huecos con lo mismo. */}
                <TextoEd k="c1.valor" plantilla="El valor total acumulado del contrato será la suma de xxx PESOS MONEDA LEGAL ($xxx M/CTE), discriminado así:" />

                <TablaValores f={f} set={set} />

                <p><b>FORMA DE PAGO DEL VALOR ADICIONADO MEDIANTE EL PRESENTE OTROSÍ No. x:</b></p>
                <TextoEd
                  k="c1.formaPago"
                  plantilla="El valor adicionado mediante el presente Otrosí No. x, equivalente a xxx PESOS MONEDA LEGAL ($xxx M/CTE), será cancelado en xxx (x) pagos: (i) un primer pago proporcional por valor de xxx PESOS MONEDA LEGAL ($xxx M/CTE), correspondiente al período comprendido entre el xx (0x) y el xx (xx) de x de 202x, liquidado sobre una base de treinta (30) días; y (ii) cuatro (4) pagos mensuales iguales, cada uno por valor de xxxx PESOS MONEDA LEGAL ($xxxx M/CTE), correspondientes a los meses de xxxx de 202x."
                />
                <TextoEd k="c1.condiciones" plantilla="Cada pago se efectuará mes vencido, previa presentación de la respectiva cuenta de cobro o factura, el informe de actividades, la certificación de cumplimiento expedida por el supervisor del contrato y la acreditación del pago de los aportes al Sistema de Seguridad Social Integral correspondientes al período objeto de cobro, de conformidad con la normativa aplicable." />
                <TextoEd k="c1.radicacion" plantilla="La cuenta de cobro o factura deberá ser presentada por LA CONTRATISTA dentro de los cinco (5) primeros días calendario de cada mes, y el pago se realizará dentro de los cinco (5) días hábiles siguientes a su radicación, siempre que se encuentren cumplidos los requisitos señalados en el presente documento." />
                <TextoEd k="c1.descuentos" plantilla="Del valor a pagar se efectuarán los descuentos, retenciones, impuestos y demás deducciones a que haya lugar, de conformidad con la normativa tributaria vigente en Colombia. Todos los pagos se realizarán en pesos colombianos." />
              </div>

              {/* Segunda: plazo de ejecución. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA SEGUNDA. MODIFICACIÓN DEL PLAZO DE EJECUCIÓN:</b></p>
                <TextoEd k="c2.intro" plantilla="Modifíquese la cláusula tercera del contrato, correspondiente a la duración, la cual quedará así:" />

                <p><b>DURACIÓN:</b></p>
                <TextoEd k="c2.duracion" plantilla="El plazo total de ejecución del contrato estará comprendido entre el xx (xx) de agosto de 202x y el xxx (xx) de xxx de 202x." />
                <TextoEd k="c2.prorroga" plantilla="La prórroga pactada mediante el presente Otrosí No. xxx inicia el xxx (0x) de x de 202x y finaliza el xxx (x) de xxx de 202x." />
                <TextoEd k="c2.futuras" plantilla="El contrato podrá ser prorrogado nuevamente de común acuerdo entre las partes, siempre que medie documento escrito suscrito por ambas partes." />
              </div>

              {/* Tercera: obligaciones de la contratista. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA TERCERA:</b></p>
                <TextoEd k="c3.intro" plantilla={`Modifíquese la cláusula CUARTA del contrato de ${(f.tipologia || delContrato.tipologia).toLowerCase()}, la cual quedará así:`} />

                <p><b>CUARTA. OBLIGACIONES DE LA CONTRATISTA:</b></p>
                <TextoEd k="c3.encabezado" plantilla={ENCABEZADO_OBLIGACIONES} />

                <ListaLiteral
                  items={f.obligaciones}
                  onChange={(v) => set('obligaciones', v)}
                  clave="obl"
                  marca="numero"
                  editable={editable}
                  plantillas={PLANTILLAS_OBLIGACION}
                  etiqueta="obligación"
                />

                {/* El parágrafo cierra la tercera: aclara que el reparto no es exclusivo
                    ni le da a la contratista facultades frente a terceros. */}
                <p className="pt-1"><b>PARÁGRAFO.</b></p>
                <TextoEd k="c3.paragrafo" plantilla={PARAGRAFO_OBLIGACIONES} />
              </div>

              {/* Cuarta: a qué período se aplica lo modificado. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA CUARTA: APLICACIÓN DE LAS MODIFICACIONES:</b></p>
                <TextoEd
                  k="c4.aplicacion"
                  plantilla="Las condiciones económicas, operativas y temporales establecidas en el presente Otrosí No. 0xx serán aplicables al período comprendido entre el xx (0xx) de xx de 202x y el xxx (x) de xx de 202x."
                />
              </div>

              {/* Quinta: lo que no se tocó sigue vigente. */}
              <div className="space-y-3 leading-relaxed text-[12.5px] text-justify mt-5">
                <p><b>CLÁUSULA QUINTA: VIGENCIA DE LAS DEMÁS ESTIPULACIONES:</b></p>
                <TextoEd
                  k="c5.vigencia"
                  plantilla="Las demás cláusulas, obligaciones, condiciones y estipulaciones contenidas en el contrato principal y en el Otrosí No. xx continuarán vigentes en su integridad y conservarán plena fuerza obligatoria entre las partes, en todo aquello que no haya sido expresamente modificado mediante el presente Otrosí No. xxx. Las modificaciones aquí contenidas regirán a partir del xxx (0x) de xx de 202x."
                />
              </div>

              {/* Las demás cláusulas cambian en cada otrosí, así que no tienen plantilla. */}
              <Clausulas
                items={f.clausulas}
                onChange={(v) => set('clausulas', v)}
                editable={editable}
              />

              {/* Suscripción y firmas */}
              <div className="leading-relaxed text-[12.5px] text-justify mt-5">
                <TextoEd k="suscripcion" plantilla="Para constancia, se suscribe en Santiago de Cali, Valle del Cauca, el día xxx (0x) de xxx de dos mil xx (202x)." />
              </div>

              <div className="grid grid-cols-2 gap-8 mt-8 text-[12px]">
                <div>
                  <p className="font-bold mb-16">LA CONTRATANTE</p>
                  <FLine value={f.firmanteNombre} onChange={(v) => set('firmanteNombre', v)} placeholder="NOMBRE DE QUIEN FIRMA" bold />
                  <FLine value={f.firmanteCargo} onChange={(v) => set('firmanteCargo', v)} placeholder="Representante Legal" />
                  <FLine value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="EMPRESA CONTRATANTE" bold />
                </div>
                <div>
                  <p className="font-bold mb-16">LA CONTRATISTA</p>
                  <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="NOMBRE DE LA CONTRATISTA" bold />
                  <FLine value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="C.C. xxxx, xx" />
                </div>
              </div>

              {/* Membrete del pie */}
              <div className="mt-10 pt-3 text-center text-[9.5px] leading-snug text-[#0a2a52]">
                <p>Calle 13A N.º 101 - 60 B/ Ciudad Jardín Cali, Valle del Cauca</p>
                <p className="underline">gestiondocumental@alumbrados.co</p>
                <p>PBX: (602) 5246612 Ext. 111 &nbsp; Línea nacional 3009108536</p>
              </div>
            </div>
            {/* El otrosí no distingue autoría: lo firma quien lo revisa. */}
            <PieElaboracion soloRevision />
            </TextosDocumento>
            </fieldset>
          </>
        )}

        {habilitada && !editable && lista.length > 0 && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede redactar otrosíes. Puedes consultarlos e imprimirlos.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Plantillas ─────────────────────────────────────────── */

/**
 * Los cinco antecedentes, con el texto del formato tal cual. Los huecos van con la misma
 * convención del documento —«xxx», «(0x)», «20xx»— y no con puntos suspensivos: es lo que
 * Jurídica reconoce como «falta llenar esto» al leerlo.
 *
 * Ojo con el literal B: trae fechas de un contrato concreto porque así viene el formato.
 * Se reescriben en cada otrosí; si no se tocan, se imprimen tal como están.
 */
const PLANTILLAS_ANTECEDENTE = [
  'El día xxx (0x) de x de 20xx, las partes suscribieron un contrato de prestación de servicios, cuyo objeto consiste en la "PRESTACIÓN DE SERVICIOS PROFESIONALES DE xxxx".',
  'La vigencia inicial del contrato de prestación de servicios se pactó por un término de seis (06) meses, comprendido entre el cinco (05) de agosto de 2025 y el cinco (05) de febrero de 2026.',
  'El valor inicial del contrato se pactó en la suma de xxx DE PESOS MONEDA LEGAL ($xxx M/CTE), pagaderos a LA CONTRATISTA mes vencido, en pagos mensuales de xxx PESOS MONEDA LEGAL ($xx M/CTE).',
  'El día veintiséis (26) de enero de 2026, las partes suscribieron el Otrosí No. 01, mediante el cual se prorrogó el término de duración del contrato hasta el cinco (05) de agosto de dos mil veintiséis (2026) y se adicionó su valor en la suma de xxxx PESOS MONEDA LEGAL ($xxx M/CTE).',
  'Conforme a lo anterior, y teniendo en cuenta que la cláusula tercera del contrato prevé que este podrá ser prorrogado de común acuerdo entre las partes mediante documento escrito, las partes manifiestan su voluntad de celebrar el presente Otrosí No. 02 con el fin de: (i) prorrogar el plazo de ejecución desde el seis (06) de agosto de 2026 hasta el treinta y uno (31) de diciembre de 2026; (ii) adicionar su valor en la suma de xxx PESOS MONEDA LEGAL ($xxx M/CTE); y (iii) precisar y actualizar las obligaciones específicas de LA CONTRATISTA, las cuales se ejecutarán únicamente respecto de los asuntos y actividades que le sean asignados mediante reparto por la Directora Jurídica y cuyos productos deberán contar con su revisión y visto bueno previo.',
];

/**
 * El encabezado de la cláusula de obligaciones. Es un solo párrafo largo y va aparte de la
 * lista numerada porque no es una obligación más: fija de quién reciben el reparto, qué
 * pasa por la Dirección Jurídica y qué municipios comprende «las UTAP».
 */
const ENCABEZADO_OBLIGACIONES =
  'Las obligaciones que se relacionan a continuación serán ejecutadas por LA CONTRATISTA '
  + 'únicamente respecto de los asuntos y actividades que le sean asignados previamente mediante '
  + 'reparto de la Directora xxxxx de CANALES Y CONTACTOS S.A.S. o por quien formalmente haga sus veces, '
  + 'de acuerdo con la distribución interna de cargas de trabajo. Todo concepto, proyecto, revisión, '
  + 'informe, presentación, comunicación, respuesta, memorial, recurso, actuación o documento elaborado '
  + 'por LA CONTRATISTA deberá someterse a revisión y contar con el visto bueno previo y expreso de la '
  + 'Directora Jurídica antes de su firma, radicación, remisión, presentación o comunicación a terceros. '
  + 'LA CONTRATISTA no podrá asumir, reasignar, suscribir, radicar, remitir o presentar asuntos o '
  + 'documentos por iniciativa propia, salvo autorización previa y expresa de la Directora Jurídica. '
  + 'Para efectos de esta cláusula, la expresión "las UTAP" comprende las UTAP Guacarí, El Cerrito, '
  + 'Quimbaya, Circasia, Puerto Asís, Jericó, Ciudad Bolívar, Pueblorico, Tarso y Santa Bárbara.';

/**
 * El parágrafo de la cláusula de obligaciones. Es la salvaguarda del contrato: deja escrito
 * que el reparto no vuelve exclusiva la asignación ni convierte la relación en laboral.
 */
const PARAGRAFO_OBLIGACIONES =
  'La relación de actividades y municipios prevista en esta cláusula no implica asignación '
  + 'exclusiva a LA CONTRATISTA. La Directora Jurídica podrá distribuir o redistribuir los asuntos '
  + 'y actividades entre LA CONTRATISTA y los demás integrantes del área jurídica, de acuerdo con '
  + 'las necesidades del servicio, las cargas de trabajo y las prioridades institucionales. El reparto '
  + 'no confiere a LA CONTRATISTA facultades de decisión, aprobación, representación, suscripción, '
  + 'radicación o actuación frente a terceros, las cuales requerirán autorización y visto bueno previo '
  + 'de la Directora Jurídica. Estas reglas corresponden a mecanismos de coordinación, distribución y '
  + 'control de calidad de los productos contractuales y no modifican la naturaleza civil del contrato '
  + 'ni la autonomía técnica propia de LA CONTRATISTA.';

/** Las seis obligaciones del formato. La primera queda abierta: cambia en cada contrato. */
const PLANTILLAS_OBLIGACION = [
  'Apoyar xxxxxx',
  'Prestar los servicios objeto del presente contrato.',
  'Mantener la reserva de la información y de los documentos que conozca con ocasión de la ejecución del presente contrato.',
  'Disponer de los recursos que sean necesarios para la correcta ejecución del presente contrato.',
  'Antes de su inicio, informar a LA CONTRATANTE cualquier actividad que pretenda realizar y que guarde similitud con las actividades desarrolladas por LA CONTRATANTE.',
  'Cumplir las demás obligaciones que sean de la esencia del objeto contratado y aquellas que resulten necesarias para el logro de la obligación de medio que lo caracteriza, siempre que le sean asignadas mediante reparto por la Dirección Jurídica.',
];

/* ── Subcomponentes ─────────────────────────────────────── */

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
 * Lista numerada o con literales A., B., C.… Cada punto es un bloque editable con su propia
 * clave, y se pueden agregar o quitar: cuántos antecedentes arrastra un otrosí depende de
 * cuántas veces se haya modificado el contrato, y las obligaciones cambian con el objeto.
 */
function ListaLiteral({ items, onChange, clave, editable, plantillas, etiqueta, marca = 'letra' }: {
  items: string[];
  onChange: (v: string[]) => void;
  clave: string;
  editable: boolean;
  plantillas: string[];
  etiqueta: string;
  marca?: 'letra' | 'numero';
}) {
  // La marca es también la clave del texto guardado. Con el índice, quitar un punto
  // correría todos los de abajo y cada uno heredaría el texto del siguiente.
  const marcar = (i: number) => (marca === 'numero' ? String(i + 1) : String.fromCharCode(65 + i));
  return (
    <div className="space-y-3">
      {items.map((_, i) => (
        <div key={i} className="flex gap-3 items-start text-justify leading-relaxed text-[12.5px]">
          <span className="font-bold w-6 flex-shrink-0">{marcar(i)}.</span>
          <div className="flex-grow min-w-0">
            <TextoEd k={`${clave}${marcar(i)}`} plantilla={plantillas[i] ?? ''} />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title={`Quitar este ${etiqueta}`}
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
          onClick={() => onChange([...items, ANTECEDENTE_NUEVO])}
          className="no-print flex items-center gap-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar {etiqueta}
        </button>
      )}
    </div>
  );
}

/**
 * La tabla de valores de la cláusula primera, con las filas del formato. Los conceptos son
 * fijos —no se arman desde la lista de otrosíes— y solo se escriben los valores.
 *
 * El total tampoco se suma solo: las celdas llevan cifras escritas a mano, a veces con el
 * valor en letras, y una suma sobre texto libre acertaría casi siempre y se equivocaría en
 * silencio el resto de las veces, en el renglón que fija cuánto se paga.
 */
function TablaValores({ f, set }: {
  f: Otrosi;
  set: <K extends keyof Otrosi>(k: K, v: Otrosi[K]) => void;
}) {
  const celda = 'border border-[#0a2a52] px-2 py-1';
  const campo = 'w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black';
  return (
    <table className="w-full border-collapse text-[12px] my-3">
      <thead>
        <tr className="bg-[#dce6f1] font-bold">
          <th className={celda}>Concepto</th>
          <th className={`${celda} w-[28%]`}>Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`${celda} text-center`}>Valor inicial del contrato</td>
          <td className={celda}>
            <input value={f.valorInicial} onChange={(e) => set('valorInicial', e.target.value)} placeholder="x" className={campo} />
          </td>
        </tr>
        <tr>
          <td className={`${celda} text-center`}>Valor adicionado mediante Otrosí No. 01</td>
          <td className={celda}>
            <input value={f.valorOtrosi01} onChange={(e) => set('valorOtrosi01', e.target.value)} placeholder="x" className={campo} />
          </td>
        </tr>
        <tr>
          <td className={`${celda} text-center`}>Valor adicionado mediante Otrosí No. 02</td>
          <td className={celda}>
            <input value={f.valorOtrosi02} onChange={(e) => set('valorOtrosi02', e.target.value)} placeholder="x" className={campo} />
          </td>
        </tr>
        <tr className="font-bold">
          <td className={`${celda} text-center`}>VALOR TOTAL ACUMULADO DEL CONTRATO</td>
          <td className={celda}>
            <input value={f.valorAcumulado} onChange={(e) => set('valorAcumulado', e.target.value)} placeholder="$ x" className={`${campo} font-bold`} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Las cláusulas que siguen a la cuarta. No tienen plantilla porque lo que se modifica
 * cambia en cada otrosí; la numeración sí se pone sola, para que no queden dos «QUINTA».
 */
const ORDINALES = ['QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA'];

function Clausulas({ items, onChange, editable }: {
  items: { titulo: string; texto: string }[];
  onChange: (v: { titulo: string; texto: string }[]) => void;
  editable: boolean;
}) {
  const cambiar = (i: number, campo: 'titulo' | 'texto', valor: string) =>
    onChange(items.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  return (
    <div className="space-y-4 mt-5">
      {items.map((c, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="flex-grow min-w-0 text-justify leading-relaxed text-[12.5px]">
            <input
              value={c.titulo}
              onChange={(e) => cambiar(i, 'titulo', e.target.value)}
              placeholder={`CLÁUSULA ${ORDINALES[i] ?? `N.º ${i + 5}`}. TÍTULO DE LA MODIFICACIÓN:`}
              className="w-full bg-transparent outline-none font-bold [font-size:inherit] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black"
            />
            <textarea
              value={c.texto}
              onChange={(e) => cambiar(i, 'texto', e.target.value)}
              rows={3}
              placeholder="Texto de la cláusula"
              className="w-full bg-transparent outline-none resize-y text-justify [font-size:inherit] leading-relaxed placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100 disabled:text-black"
            />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title="Quitar esta cláusula"
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
          onClick={() => onChange([...items, { titulo: '', texto: '' }])}
          className="no-print flex items-center gap-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar cláusula
        </button>
      )}
    </div>
  );
}
