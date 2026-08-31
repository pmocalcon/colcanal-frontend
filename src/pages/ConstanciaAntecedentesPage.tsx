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
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { PieMembrete } from '@/components/juridica/PieMembrete';

/**
 * Constancia de verificación de antecedentes y validaciones documentales, plantilla 2026
 * (el formato «12 Plantilla Constancia Verificacion Antecedentes»).
 *
 * Va **antes del contrato** porque es lo que se mira antes de contratar: quién es la
 * persona, no cómo quedó el contrato. Se habilita junto con la lista de chequeo —las dos
 * son la debida diligencia previa— y no se cierra después, porque una verificación puede
 * repetirse al renovar o al prorrogar.
 *
 * Aplica también a las requisiciones de personal: la finalidad del propio formato incluye
 * «vinculación laboral», así que no es un documento solo del trámite de servicios.
 *
 * El formato tiene dos niveles a propósito y los dos se diligencian: el **resumen** —una
 * línea por fuente, con su fecha, su resultado y dónde quedó la evidencia— y el **detalle**
 * de cada consulta. El resumen es lo que alguien lee después para saber qué se consultó y
 * cuándo; el detalle es lo que sostiene esa afirmación.
 *
 * No es una etapa del flujo: no mueve la máquina de estados.
 *
 * Ruta: `.../juridica/:id/antecedentes`. Se guarda en data.antecedentes.
 */

/** Una línea del resumen: una fuente consultada. */
interface FilaConsulta {
  consulta: string;
  fechaHora: string;
  resultado: string;
  evidencia: string;
}

/** Un apartado del detalle: la descripción de la consulta y su resultado. */
interface Detalle {
  titulo: string;
  texto: string;
}

interface ConstanciaState {
  personaVerificada: string;
  finalidad: string;
  consultasAplicables: string;
  lugarFecha: string;
  /** Los datos que la constancia repite en su párrafo de apertura. */
  nombre: string;
  cedula: string;
  lugarExpedicion: string;
  consultas: FilaConsulta[];
  detalles: Detalle[];
  firmanteNombre: string;
  firmanteCargo: string;
  /**
   * Si esta constancia la revisó la Dirección Jurídica.
   *
   * El formato marca esa línea del pie como «[SI APLICA]»: no todas las verificaciones
   * pasan por Jurídica. Se decide al diligenciar y la línea sale o no sale, en vez de
   * imprimir el corchete —que en un documento firmado se lee como un hueco sin llenar—.
   */
  revisoJuridica: boolean;
  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/** Las siete fuentes del formato, con el resultado que admite cada una. */
const CONSULTAS_DEL_FORMATO: FilaConsulta[] = [
  { consulta: 'Procuraduría General de la Nación', fechaHora: '[FECHA/HORA]', resultado: '[NO REGISTRA / REGISTRA / NO APLICA]', evidencia: '[CERTIFICADO / CAPTURA / CÓDIGO]' },
  { consulta: 'Contraloría General de la República', fechaHora: '[FECHA/HORA]', resultado: '[NO REGISTRA / REGISTRA / NO APLICA]', evidencia: '[CERTIFICADO / CAPTURA / CÓDIGO]' },
  { consulta: 'Policía Nacional - antecedentes judiciales', fechaHora: '[FECHA/HORA]', resultado: '[RESULTADO DEL PORTAL / NO APLICA]', evidencia: '[CAPTURA / CONSTANCIA]' },
  { consulta: 'Registro Nacional de Medidas Correctivas - RNMC', fechaHora: '[FECHA/HORA]', resultado: '[RESULTADO / NO APLICA]', evidencia: '[CAPTURA / CONSTANCIA]' },
  { consulta: 'Registraduría - estado del documento', fechaHora: '[FECHA/HORA]', resultado: '[VIGENTE / NOVEDAD / NO APLICA]', evidencia: '[CERTIFICADO / CAPTURA]' },
  { consulta: 'Registro Nacional de Abogados / vigencia profesional', fechaHora: '[FECHA/HORA]', resultado: '[VIGENTE / NOVEDAD / NO APLICA]', evidencia: '[CERTIFICADO / CAPTURA]' },
  { consulta: 'Sanciones disciplinarias de abogados', fechaHora: '[FECHA/HORA]', resultado: '[NO REGISTRA / REGISTRA / NO APLICA]', evidencia: '[CERTIFICADO / CAPTURA]' },
];

/**
 * El detalle, uno por fuente y en el mismo orden del resumen.
 *
 * Los dos últimos llevan «SI APLICA» en el título porque el formato así los marca: solo se
 * consultan cuando el cargo o la actuación exigen la calidad de abogado.
 */
const DETALLES_DEL_FORMATO: Detalle[] = [
  {
    titulo: '1. PROCURADURÍA GENERAL DE LA NACIÓN',
    texto: 'Se verificó el registro correspondiente en el portal oficial de la Procuraduría General de la Nación. Resultado: [TRANSCRIBIR EL RESULTADO EXACTO QUE ARROJA EL CERTIFICADO / NO APLICA]. Evidencia: [INSERTAR CAPTURA O ANEXAR CERTIFICADO].',
  },
  {
    titulo: '2. CONTRALORÍA GENERAL DE LA REPÚBLICA',
    texto: 'Se consultó la existencia de responsabilidad fiscal en el portal oficial de la Contraloría General de la República. Resultado: [TRANSCRIBIR RESULTADO / NO APLICA]. Evidencia: [INSERTAR / ANEXAR].',
  },
  {
    titulo: '3. POLICÍA NACIONAL - ANTECEDENTES JUDICIALES',
    texto: 'Se efectuó la consulta en el portal oficial de la Policía Nacional. Resultado: [TRANSCRIBIR DE MANERA FIEL EL MENSAJE DEL PORTAL / NO APLICA]. Evidencia: [INSERTAR / ANEXAR].',
  },
  {
    titulo: '4. REGISTRO NACIONAL DE MEDIDAS CORRECTIVAS',
    texto: 'Se efectuó la consulta en el RNMC de la Policía Nacional. Resultado: [TRANSCRIBIR RESULTADO / NO APLICA]. Evidencia: [INSERTAR / ANEXAR].',
  },
  {
    titulo: '5. REGISTRADURÍA NACIONAL DEL ESTADO CIVIL',
    texto: 'Se verificó el estado del documento de identidad en el servicio oficial disponible. Resultado: [TRANSCRIBIR RESULTADO / NO APLICA]. Evidencia: [INSERTAR / ANEXAR].',
  },
  {
    titulo: '6. REGISTRO PROFESIONAL DE ABOGADO - SI APLICA',
    texto: 'Para cargos, contratos o actuaciones que exijan la calidad de abogado(a), se verificó la inscripción y vigencia de la tarjeta profesional en el servicio oficial de la Rama Judicial. Resultado: [TRANSCRIBIR / NO APLICA].',
  },
  {
    titulo: '7. SANCIONES DISCIPLINARIAS DE ABOGADOS - SI APLICA',
    texto: 'Cuando resulte pertinente por la naturaleza del cargo o actuación, se verificó el registro de sanciones disciplinarias de abogados en el portal oficial correspondiente. Resultado: [TRANSCRIBIR / NO APLICA].',
  },
];

/**
 * La constancia en blanco, con el texto del formato como **valor** y no como placeholder:
 * el placeholder se ve en pantalla pero no se imprime, y el formato vacío tiene que poder
 * imprimirse para diligenciarlo a mano.
 */
const EMPTY: ConstanciaState = {
  personaVerificada: '[NOMBRE COMPLETO / CC]',
  finalidad: '[VINCULACIÓN LABORAL / CONTRATACIÓN / APODERADO / OTRA]',
  consultasAplicables: '[PROCURADURÍA] [CONTRALORÍA] [POLICÍA] [RNMC] [REGISTRADURÍA] [REGISTRO ABOGADOS] [SANCIONES ABOGADOS] [OTRA]',
  lugarFecha: 'Santiago de Cali, [DÍA] de [MES] de [AÑO]',
  nombre: '[NOMBRE COMPLETO]',
  cedula: '[NÚMERO]',
  lugarExpedicion: '[LUGAR]',
  consultas: CONSULTAS_DEL_FORMATO.map((c) => ({ ...c })),
  detalles: DETALLES_DEL_FORMATO.map((d) => ({ ...d })),
  firmanteNombre: '[NOMBRE DE QUIEN REALIZA LA CONSULTA]',
  firmanteCargo: '[CARGO]',
  revisoJuridica: true,
  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/**
 * Desde que la solicitud sale de la mesa de quien la creó.
 *
 * Son los mismos estados que habilitan la lista de chequeo: verificar antecedentes es
 * debida diligencia previa, y una vez abierta no se vuelve a cerrar —la verificación se
 * repite al renovar o al prorrogar—.
 */
const NO_HABILITADO = ['borrador', 'pendiente_autorizacion_gp', 'pendiente_firma_gerencia'];

export default function ConstanciaAntecedentesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<ConstanciaState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && !NO_HABILITADO.includes(sol.estado);
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const saved = (data.data?.antecedentes ?? {}) as Partial<ConstanciaState>;
        setF({
          ...EMPTY,
          ...saved,
          // Una constancia guardada sin filas dejaría la pantalla sin forma de volver al
          // formato: se cae a la plantilla.
          consultas: saved.consultas?.length ? saved.consultas : EMPTY.consultas,
          detalles: saved.detalles?.length ? saved.detalles : EMPTY.detalles,
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la constancia');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const set = <K extends keyof ConstanciaState>(k: K, v: ConstanciaState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const setConsulta = <K extends keyof FilaConsulta>(i: number, k: K, v: FilaConsulta[K]) =>
    setF((p) => ({ ...p, consultas: p.consultas.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  const setDetalle = <K extends keyof Detalle>(i: number, k: K, v: Detalle[K]) =>
    setF((p) => ({ ...p, detalles: p.detalles.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'antecedentes', f);
      toast.success('Constancia guardada');
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
          /* Un apartado del detalle no se parte entre dos hojas si cabe entero. */
          .bloque { break-inside: avoid; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Constancia de verificación de antecedentes</h1>
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
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="antecedentes" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Sin `AccionesFlujo`: la constancia no es una etapa del trámite. */}
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">La constancia aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">
              Se habilita cuando la solicitud se remite a Administrativa, junto con la lista de chequeo.
            </p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
            <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md px-8 py-7 space-y-4">

              {/* Membrete */}
              <EncabezadoFormato
                codigo="GJ-005-F"
                titulo={<>
                  <h1 className="font-bold text-[13px]">CONSTANCIA DE VERIFICACIÓN</h1>
                  <p className="font-bold text-[11.5px]">ANTECEDENTES Y VALIDACIONES DOCUMENTALES</p>
                </>}
              />

              <p className="text-[11px] font-bold">NIT 900.456.735-7</p>

              {/* Ficha de la verificación */}
              <table className="w-full border-collapse text-[12px] bloque">
                <tbody>
                  <Fila label="Persona verificada" value={f.personaVerificada} onChange={(v) => set('personaVerificada', v)} />
                  <Fila label="Finalidad" value={f.finalidad} onChange={(v) => set('finalidad', v)} />
                  <Fila label="Consultas aplicables" value={f.consultasAplicables} onChange={(v) => set('consultasAplicables', v)} area />
                </tbody>
              </table>

              <input
                value={f.lugarFecha}
                onChange={(e) => set('lugarFecha', e.target.value)}
                className="w-full bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
              />

              {/* Párrafo de constancia. Los tres datos de la persona salen de campos y no
                  del texto: se repiten de la ficha de arriba y así se escriben una vez. */}
              <p className="text-justify leading-relaxed">
                Se deja constancia de que, para la finalidad indicada y respecto de{' '}
                <Hueco value={f.nombre} onChange={(v) => set('nombre', v)} ancho="w-[38%]" />, identificado(a)
                con cédula de ciudadanía No.{' '}
                <Hueco value={f.cedula} onChange={(v) => set('cedula', v)} ancho="w-[16%]" /> expedida en{' '}
                <Hueco value={f.lugarExpedicion} onChange={(v) => set('lugarExpedicion', v)} ancho="w-[16%]" />, se
                efectuaron las verificaciones que se relacionan a continuación en los portales oficiales
                disponibles a la fecha de consulta.
              </p>

              {/* ── Resumen ── */}
              <h2 className="text-center font-bold pt-1">RESUMEN DE VERIFICACIONES</h2>
              <div className="bloque">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    {/* Verde #D9EAD3 con letra negra: el sombreado que trae la plantilla. */}
                    <tr className="bg-[#d9ead3] text-center font-bold">
                      <th className={TH}>CONSULTA</th>
                      <th className={`${TH} w-[16%]`}>FECHA / HORA</th>
                      <th className={`${TH} w-[24%]`}>RESULTADO</th>
                      <th className={`${TH} w-[24%]`}>EVIDENCIA / OBSERVACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.consultas.map((c, i) => (
                      <tr key={i}>
                        <Celda value={c.consulta} onChange={(v) => setConsulta(i, 'consulta', v)} />
                        <Celda value={c.fechaHora} onChange={(v) => setConsulta(i, 'fechaHora', v)} />
                        <Celda value={c.resultado} onChange={(v) => setConsulta(i, 'resultado', v)} />
                        <td className={TD}>
                          <div className="flex gap-1 items-start">
                            <textarea
                              value={c.evidencia}
                              onChange={(e) => setConsulta(i, 'evidencia', e.target.value)}
                              rows={2}
                              className={CAMPO + ' resize-y leading-snug'}
                            />
                            {editable && (
                              <button
                                type="button"
                                onClick={() => set('consultas', f.consultas.filter((_, j) => j !== i))}
                                title="Quitar esta consulta"
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
                    onClick={() => set('consultas', [...f.consultas, { consulta: '', fechaHora: '', resultado: '', evidencia: '' }])}
                    className="no-print flex items-center gap-1 mt-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar consulta
                  </button>
                )}
              </div>

              {/* ── Detalle ── */}
              <h2 className="text-center font-bold pt-1">DETALLE Y SOPORTE</h2>
              <div className="space-y-2">
                {f.detalles.map((d, i) => (
                  <div key={i} className="bloque">
                    <div className="flex gap-1 items-start">
                      <input
                        value={d.titulo}
                        onChange={(e) => setDetalle(i, 'titulo', e.target.value)}
                        className="w-full bg-transparent outline-none text-[12px] font-bold disabled:opacity-100 disabled:text-black"
                      />
                      {editable && (
                        <button
                          type="button"
                          onClick={() => set('detalles', f.detalles.filter((_, j) => j !== i))}
                          title="Quitar este apartado"
                          className="no-print text-[hsl(var(--canalco-neutral-400))] hover:text-red-700 flex-shrink-0 mt-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <textarea
                      value={d.texto}
                      onChange={(e) => setDetalle(i, 'texto', e.target.value)}
                      rows={3}
                      className="w-full bg-transparent outline-none text-[12px] resize-y leading-relaxed text-justify disabled:opacity-100 disabled:text-black"
                    />
                  </div>
                ))}
                {editable && (
                  <button
                    type="button"
                    onClick={() => set('detalles', [...f.detalles, { titulo: '', texto: '' }])}
                    className="no-print flex items-center gap-1 text-[11px] text-[#4a4a63] hover:text-[#16162b]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar apartado
                  </button>
                )}
              </div>

              {/* ── Constancia final ── */}
              <h2 className="text-center font-bold pt-1">CONSTANCIA FINAL</h2>
              <TextoEd
                k="c.final"
                plantilla={'La presente constancia documenta las consultas efectuadas en las fechas indicadas y '
                  + 'el resultado mostrado por cada fuente al momento de la verificación. No constituye por sí '
                  + 'sola una decisión de selección, contratación, vinculación, sanción o exclusión. Cualquier '
                  + 'novedad que requiera interpretación deberá ser revisada por el área competente y, cuando '
                  + 'corresponda, por la Dirección Jurídica, con respeto por la finalidad del tratamiento y la '
                  + 'normativa de protección de datos personales.'}
                className="text-justify leading-relaxed"
              />

              {/* Firma: quien hizo la consulta, no quien la revisa. */}
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
                  <p>Responsable de la verificación</p>
                </div>
              </div>

              <PieMembrete />
            </div>
            {/* «Revisó», como la plantilla: quien hace la consulta ya firmó arriba. La
                línea va marcada «[SI APLICA]» en el formato, así que se decide acá. */}
            <PieElaboracion etiqueta="Revisó" sinRevision={!f.revisoJuridica} />
            <label className="no-print flex items-center gap-2 px-8 pt-2 text-[11px] text-[#4a4a63]">
              <input
                type="checkbox"
                checked={f.revisoJuridica}
                disabled={!editable}
                onChange={(e) => set('revisoJuridica', e.target.checked)}
              />
              Esta verificación la revisó la Dirección Jurídica
            </label>
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta constancia. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

const TH = 'border border-[#0a2a52] px-1.5 py-1 align-middle';
const TD = 'border border-[#0a2a52] px-1.5 py-1 align-top';
const CAMPO = 'w-full bg-transparent outline-none text-[11px] disabled:opacity-100 disabled:text-black';

/** Una celda del resumen. */
function Celda({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className={TD}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        className={CAMPO + ' resize-y leading-snug'} />
    </td>
  );
}

/** Un dato que va embebido en un párrafo corrido, no en una celda. */
function Hueco({ value, onChange, ancho }: { value: string; onChange: (v: string) => void; ancho: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={ancho + ' bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black'}
    />
  );
}

/**
 * Una fila de la ficha: etiqueta a la izquierda, dato a la derecha.
 *
 * La columna de etiquetas va sombreada en #E7E6E6 y en negrita, que es como la trae la
 * plantilla en sus tres celdas.
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
      <td className="border border-[#0a2a52] bg-[#e7e6e6] px-2 py-1 align-top w-[36%] font-bold">{label}</td>
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
