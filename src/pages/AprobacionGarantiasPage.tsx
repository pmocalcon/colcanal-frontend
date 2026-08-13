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

/**
 * Acta de Aprobación de Garantías. La levanta Jurídica al revisar las pólizas.
 *
 * Va **después de la Verificación de garantías** y no dentro de ella: la verificación es
 * el papel de trabajo —los ítems Sí/No y la matriz de riesgo, cómo se llegó a la
 * conclusión—; el acta es la conclusión ya firmada, con los datos de cada póliza y su
 * CUMPLE / NO CUMPLE. La lista de chequeo también los pide por separado: «Pólizas» y
 * «Aprobación de pólizas» son dos filas.
 *
 * No es una etapa del flujo: se levanta en el mismo momento en que se verifica, así que
 * se habilita en los mismos estados y no mueve la máquina de estados.
 *
 * El acta enumera una garantía por bloque —(i) cumplimiento, (II) responsabilidad civil
 * extracontractual—, cada uno con su aseguradora, sus partes y su cuadro. Por eso los
 * bloques son una lista: cuántas garantías ampare un contrato lo decide la matriz de
 * garantías, no el formato.
 *
 * Ruta: `.../juridica/:id/aprobacion-garantias`. Se guarda en data.aprobacionGarantias.
 */

/** Un extremo de la vigencia: el cuadro la parte en día, mes y año. */
interface Extremo { dia: string; mes: string; anio: string }

interface FilaGarantia {
  clase: string;
  valor: string;
  vigencia: string;
  desde: Extremo;
  hasta: Extremo;
  cumple: string;
}

interface BloqueGarantia {
  /** El ordinal del bloque, tal como está escrito en el formato: «(i)», «(II)». */
  ordinal: string;
  titulo: string;
  aseguradora: string;
  tomador: string;
  tomadorNit: string;
  asegurado: string;
  aseguradoNit: string;
  filas: FilaGarantia[];
  /** Consulta de la póliza en FASECOLDA: con eso se verifica que exista. */
  enlace: string;
}

interface AprobacionState {
  bloques: BloqueGarantia[];
  /** Quién firma el acta. La aprueba la Dirección Jurídica. */
  firmanteNombre: string;
  firmanteCargo: string;
  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const ENLACE_FASECOLDA = 'https://www.fasecolda.com/ramos/cumplimiento/consulta-de-polizas/';

const EMPTY_EXTREMO: Extremo = { dia: 'X', mes: 'X', anio: 'X' };

/** Fila en blanco para «Agregar garantía»: el cuadro nace con sus casillas de vigencia. */
const nuevaFila = (): FilaGarantia => ({
  clase: '',
  valor: '',
  vigencia: '',
  desde: { ...EMPTY_EXTREMO },
  hasta: { ...EMPTY_EXTREMO },
  cumple: 'CUMPLE',
});

const nuevoBloque = (ordinal: string): BloqueGarantia => ({
  ordinal,
  titulo: '',
  aseguradora: '',
  tomador: '',
  tomadorNit: '',
  asegurado: '',
  aseguradoNit: '',
  filas: [nuevaFila()],
  enlace: ENLACE_FASECOLDA,
});

/** Ordinal por defecto de un bloque nuevo. Es un valor inicial: se puede reescribir. */
const ORDINALES = ['(i)', '(II)', '(III)', '(IV)', '(V)', '(VI)'];

/**
 * El acta en blanco, con el texto del formato como **valor** y no como placeholder: el
 * placeholder se ve en pantalla pero no se imprime, y el formato vacío tiene que poder
 * imprimirse para diligenciarlo a mano.
 */
const EMPTY: AprobacionState = {
  bloques: [
    {
      ordinal: '(i)',
      titulo: 'DATOS – DE LA GARANTÍA DE CUMPLIMIENTO. No. 45-44-101174811.',
      aseguradora: 'SEGUROS DEL ESTADO S.A.',
      tomador: 'XXX.,',
      tomadorNit: 'XXX., 7',
      asegurado: 'XXX',
      aseguradoNit: 'XXXX',
      filas: [
        {
          clase: 'CUMPLIMIENTO DEL CONTRATO',
          valor: 'Por el 10% del valor total del contrato. Esto es ($XXX).\n\nValor asegurado:\n$ XX',
          vigencia: 'Por el plazo de ejecución del contrato y tres (3) meses más contados a partir de la fecha de perfeccionamiento del acuerdo contractual.',
          desde: { ...EMPTY_EXTREMO },
          hasta: { ...EMPTY_EXTREMO },
          cumple: 'CUMPLE',
        },
        {
          clase: 'DEVOLUCIÓN DEL PAGO ANTICIPADO',
          valor: 'En una cien por ciento (100%) del valor entregado en calidad de anticipo. Esto es ($X00).\n\nValor asegurado:\n($X).',
          vigencia: 'Por el plazo de ejecución del contrato, contada a partir de la fecha de la firma del acta de expansión.',
          desde: { ...EMPTY_EXTREMO },
          hasta: { ...EMPTY_EXTREMO },
          cumple: 'CUMPLE',
        },
      ],
      enlace: ENLACE_FASECOLDA,
    },
    {
      ordinal: '(II)',
      titulo: 'DATOS – PÓLIZA DE SEGURO DE RESPONSABILIDAD CIVIL EXTRACONTRACTUAL No. 45-40-101107521.',
      aseguradora: 'SEGUROS DEL ESTADO S.A.',
      tomador: 'CANALES Y CONTACTOS S.A.S',
      tomadorNit: '900.456.735-7',
      asegurado: 'LA EMPRESAS PUBLICAS DE JERICÓ S.A. E.S.P.',
      aseguradoNit: '900.191.468-6',
      filas: [
        {
          clase: 'PÓLIZA DE SEGURO DE RESPONSABILIDAD CIVIL EXTRACONTRACTUAL',
          valor: '$350.181.000,00\n\nValor asegurado:\n$350.181.000,00',
          vigencia: 'Por el plazo de duración del contrato y un (01) mes mas.',
          desde: { ...EMPTY_EXTREMO },
          hasta: { dia: '3X', mes: 'X', anio: 'X' },
          cumple: 'CUMPLE',
        },
      ],
      enlace: ENLACE_FASECOLDA,
    },
  ],
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
          // Un acta guardada sin bloques dejaría la pantalla en blanco y sin forma de
          // volver al formato: se cae a la plantilla.
          bloques: saved.bloques?.length ? saved.bloques : EMPTY.bloques,
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

  /** Cambia un campo de un bloque. */
  const setBloque = <K extends keyof BloqueGarantia>(i: number, k: K, v: BloqueGarantia[K]) =>
    setF((p) => ({
      ...p,
      bloques: p.bloques.map((b, idx) => (idx === i ? { ...b, [k]: v } : b)),
    }));

  /** Cambia un campo de una fila del cuadro de un bloque. */
  const setFila = <K extends keyof FilaGarantia>(i: number, j: number, k: K, v: FilaGarantia[K]) =>
    setF((p) => ({
      ...p,
      bloques: p.bloques.map((b, idx) => (idx !== i ? b : {
        ...b,
        filas: b.filas.map((fl, jdx) => (jdx === j ? { ...fl, [k]: v } : fl)),
      })),
    }));

  const setVigencia = (i: number, j: number, extremo: 'desde' | 'hasta', campo: keyof Extremo, v: string) =>
    setF((p) => ({
      ...p,
      bloques: p.bloques.map((b, idx) => (idx !== i ? b : {
        ...b,
        filas: b.filas.map((fl, jdx) => (jdx !== j ? fl : {
          ...fl,
          [extremo]: { ...fl[extremo], [campo]: v },
        })),
      })),
    }));

  const agregarBloque = () =>
    setF((p) => ({
      ...p,
      bloques: [...p.bloques, nuevoBloque(ORDINALES[p.bloques.length] ?? '')],
    }));
  const quitarBloque = (i: number) =>
    setF((p) => ({ ...p, bloques: p.bloques.filter((_, idx) => idx !== i) }));

  const agregarFila = (i: number) =>
    setF((p) => ({
      ...p,
      bloques: p.bloques.map((b, idx) => (idx === i ? { ...b, filas: [...b.filas, nuevaFila()] } : b)),
    }));
  const quitarFila = (i: number, j: number) =>
    setF((p) => ({
      ...p,
      bloques: p.bloques.map((b, idx) => (idx === i ? { ...b, filas: b.filas.filter((_, jdx) => jdx !== j) } : b)),
    }));

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
          /* Un bloque de garantía no se parte entre dos hojas si cabe entero. */
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
            <h1 className="text-lg font-bold text-[#16162b]">Acta de Aprobación de Garantías</h1>
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

              {/* Título */}
              <div className="text-center font-bold text-[13px]">
                <TextoEd k="titulo" plantilla="ACTA DE APROBACIÓN GARANTÍAS" className="text-center" />
              </div>

              <div className="text-center font-bold text-[12px]">
                <TextoEd
                  k="subtitulo"
                  plantilla="ACTA DE OBRAS DE EXPANSIÓN NO. XXXXX SUSCRITA EL XXXX ENTRE XXXX Y XXXXX"
                  className="text-center"
                />
              </div>

              {/* Párrafo de apertura */}
              <TextoEd
                k="apertura"
                plantilla={
                  'El día xXXX (X) del mes de X de XX, se procedió a revisar la Garantía de Cumplimiento del contrato '
                  + 'y devolución del pago anticipado, No. XXXX expedida el X (X) del mes deX de X y Póliza de Seguro de '
                  + 'Responsabilidad Civil Extracontractual No. XXXX expedida el X (X) del mes deX de, garantías '
                  + 'que amparan el contrato de XXXXX  No. xx, suscrito el XXX de Xde XXX, cuyo objeto es: "XXXXXX" '
                  + 'A favor de la: XXXX., por parte de XXX., identificado con NIT No. XXXX, así;'
                }
              />

              {/* Un bloque por garantía */}
              {f.bloques.map((b, i) => (
                <section key={i} className="bloque space-y-2 pt-2">
                  <div className="flex items-start gap-3">
                    <input
                      value={b.ordinal}
                      onChange={(e) => setBloque(i, 'ordinal', e.target.value)}
                      className="w-12 bg-transparent outline-none font-bold text-[12px] shrink-0"
                    />
                    <textarea
                      value={b.titulo}
                      onChange={(e) => setBloque(i, 'titulo', e.target.value)}
                      rows={1}
                      className="flex-grow bg-transparent outline-none resize-y font-bold text-[12px] leading-relaxed disabled:opacity-100 disabled:text-black"
                    />
                    {f.bloques.length > 1 && (
                      <button type="button" onClick={() => quitarBloque(i)} title="Quitar esta garantía"
                        className="no-print text-red-600 hover:text-red-800 shrink-0 mt-0.5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Partes de la póliza */}
                  <div className="pl-12 grid grid-cols-[220px_1fr] gap-x-3 gap-y-0.5">
                    <Dato label="ASEGURADORA:" value={b.aseguradora} onChange={(v) => setBloque(i, 'aseguradora', v)} />
                    <Dato label="TOMADOR:" value={b.tomador} onChange={(v) => setBloque(i, 'tomador', v)} />
                    <Dato label="NO. DE IDENTIFICACIÓN: NIT." value={b.tomadorNit} onChange={(v) => setBloque(i, 'tomadorNit', v)} />
                    <Dato label="ASEGURADO Y BENEFICIARIO:" value={b.asegurado} onChange={(v) => setBloque(i, 'asegurado', v)} area />
                    <Dato label="No. DE IDENTIFICACIÓN: NIT." value={b.aseguradoNit} onChange={(v) => setBloque(i, 'aseguradoNit', v)} />
                  </div>

                  {/* Cuadro de la garantía */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[10px] min-w-[600px]">
                      <thead>
                        <tr className="font-bold text-center align-middle">
                          <th className="border border-black px-1 py-1 w-[15%]">CLASE DE GARANTÍA</th>
                          <th className="border border-black px-1 py-1 w-[20%]">VALOR ASEGURADO</th>
                          <th className="border border-black px-1 py-1">VIGENCIA</th>
                          <th className="border border-black px-1 py-1 w-[13%]">CUMPLE / NO CUMPLE</th>
                          <th className="border-0 w-6 no-print"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.filas.map((fl, j) => (
                          <tr key={j} className="align-top">
                            <td className="border border-black px-1 py-1">
                              <Celda value={fl.clase} onChange={(v) => setFila(i, j, 'clase', v)} />
                            </td>
                            <td className="border border-black px-1 py-1">
                              <Celda value={fl.valor} onChange={(v) => setFila(i, j, 'valor', v)} />
                            </td>
                            <td className="border border-black px-1 py-1">
                              <Celda value={fl.vigencia} onChange={(v) => setFila(i, j, 'vigencia', v)} />
                              {/* Desde / Hasta: el cuadro parte cada extremo en día, mes y año. */}
                              <table className="w-full border-collapse mt-1 text-[10px]">
                                <thead>
                                  <tr className="font-bold text-center">
                                    <th className="border border-black px-1 py-0.5" colSpan={3}>Desde</th>
                                    <th className="border border-black px-1 py-0.5" colSpan={3}>Hasta</th>
                                  </tr>
                                  <tr className="font-bold text-center">
                                    <th className="border border-black px-1 py-0.5">Día</th>
                                    <th className="border border-black px-1 py-0.5">Mes</th>
                                    <th className="border border-black px-1 py-0.5">Año</th>
                                    <th className="border border-black px-1 py-0.5">Día</th>
                                    <th className="border border-black px-1 py-0.5">Mes</th>
                                    <th className="border border-black px-1 py-0.5">Año</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-center">
                                    {(['desde', 'hasta'] as const).flatMap((extremo) => (
                                      (['dia', 'mes', 'anio'] as const).map((campo) => (
                                        <td key={`${extremo}.${campo}`} className="border border-black px-0.5 py-0.5">
                                          <input
                                            value={fl[extremo][campo]}
                                            onChange={(e) => setVigencia(i, j, extremo, campo, e.target.value)}
                                            className="w-full bg-transparent outline-none text-center text-[10px] disabled:opacity-100 disabled:text-black"
                                          />
                                        </td>
                                      ))
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                            <td className="border border-black px-1 py-1 text-center align-middle">
                              <input
                                value={fl.cumple}
                                onChange={(e) => setFila(i, j, 'cumple', e.target.value)}
                                className="w-full bg-transparent outline-none text-center text-[10px] font-semibold disabled:opacity-100 disabled:text-black"
                              />
                            </td>
                            <td className="border-0 px-1 no-print align-middle">
                              {b.filas.length > 1 && (
                                <button type="button" onClick={() => quitarFila(i, j)} title="Quitar fila"
                                  className="text-red-600 hover:text-red-800">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Button type="button" variant="outline" size="sm" onClick={() => agregarFila(i)}
                    className="no-print h-7 text-[11px] gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Agregar amparo
                  </Button>

                  {/* Consulta de la póliza: es la verificación de que existe. */}
                  <input
                    value={b.enlace}
                    onChange={(e) => setBloque(i, 'enlace', e.target.value)}
                    className="w-full bg-transparent outline-none text-[11px] text-[#0563c1] underline disabled:opacity-100"
                  />
                </section>
              ))}

              <div className="no-print">
                <Button type="button" variant="outline" size="sm" onClick={agregarBloque} className="h-8 text-[12px] gap-1.5">
                  <Plus className="w-4 h-4" /> Agregar garantía
                </Button>
              </div>

              {/* Aprobación y constancia */}
              <TextoEd
                k="aprobacion"
                plantilla={
                  'Una vez verificado los requisitos de vigencias y cuantía exigidos por XXX., en atención al Artículo '
                  + '23 de la Ley 1150 de 2007, que modificó el Artículo 41 dela Ley 80 de 1993, SE APRUEBAN, la '
                  + 'Garantía de Cumplimiento del contrato y devolución del pago anticipado, No. XXXX expedida el X '
                  + '(X) del mes deX de X y Póliza de Seguro de Responsabilidad Civil Extracontractual No. XXXX '
                  + 'expedida el X (X) del mes deX de, garantías que amparan el contrato de XXXXX  No. 02-2026, '
                  + 'suscrito el XXX de Xde XXX.,'
                }
              />

              <TextoEd
                k="constancia"
                plantilla="La presente constancia se expide a los XXXXdías (X) del mes de X ee xxx (202x)."
              />

              {/* Firma. El acta la aprueba la Dirección Jurídica. */}
              <div className="pt-12">
                <input
                  value={f.firmanteNombre}
                  onChange={(e) => set('firmanteNombre', e.target.value)}
                  className="w-full max-w-[320px] bg-transparent outline-none font-bold text-[12px] disabled:opacity-100 disabled:text-black"
                />
                <input
                  value={f.firmanteCargo}
                  onChange={(e) => set('firmanteCargo', e.target.value)}
                  className="w-full max-w-[320px] bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
                />
              </div>
            </div>

            <PieElaboracion />
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

/** Fila «ETIQUETA: valor» de los datos de la póliza. */
function Dato({ label, value, onChange, area }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean;
}) {
  return (
    <>
      <span className="font-bold text-[12px]">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={1}
          className="w-full bg-transparent outline-none resize-y text-[12px] leading-snug disabled:opacity-100 disabled:text-black"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
        />
      )}
    </>
  );
}

/**
 * Celda de texto del cuadro. Va con `textarea` y no con `input` porque el formato parte
 * el contenido en varias líneas —el valor asegurado lleva su propio renglón— y un
 * `input` las perdería al pegar el texto.
 */
function Celda({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={value.split('\n').length || 1}
      className="w-full bg-transparent outline-none resize-y text-[10px] leading-snug disabled:opacity-100 disabled:text-black"
    />
  );
}
