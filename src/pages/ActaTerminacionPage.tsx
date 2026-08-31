import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Link2, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { FORMATO_CONTRATACION, FORMATO_TERMINACION } from '@/config/formatosGestion';

/**
 * Acta de terminación anticipada de mutuo acuerdo a un contrato de prestación de servicios.
 *
 * **No pertenece al trámite de contratación**: no es un documento de la solicitud sino un
 * formato propio de G. talento humano, con su fila en `gc_solicitudes` (`formato` =
 * ACTA-TERMINACION). Se diligencia, se guarda y se imprime para firmarla en papel; no
 * tiene máquina de estados, así que se queda en borrador y siempre se puede corregir.
 *
 * Puede **apuntar a un contrato del sistema** y traer solos los datos que ya están ahí
 * —contratista, objeto, valor, plazo y el último otrosí—, pero no lo exige: los contratos
 * anteriores al sistema se diligencian a mano.
 *
 * Ruta: `.../talento-humano/terminacion/:id`.
 */

interface TerminacionState {
  /** El contrato que se termina, si está en el sistema. `null` = se diligenció a mano. */
  contratoSolicitudId: number | null;

  // ── Encabezado ──
  tituloContratista: string;
  tituloFecha: string;

  // ── La contratante (constantes de la empresa) ──
  repLegal: string;
  repLegalCc: string;
  repLegalCcLugar: string;
  contratante: string;
  contratanteNit: string;

  // ── El contratista ──
  contratista: string;
  contratistaCc: string;
  contratistaCcLugar: string;

  // ── El contrato ──
  fechaContrato: string;
  objeto: string;
  vigenciaPlazo: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  valorInicial: string;
  valorMensual: string;

  // ── El otrosí que lo modificó ──
  otrosiNumero: string;
  otrosiFecha: string;
  otrosiValor: string;
  otrosiHasta: string;

  // ── El otrosí del incremento (vigencia siguiente) ──
  otrosi2Numero: string;
  otrosi2Fecha: string;

  // ── La terminación ──
  fechaTerminacion: string;
  clausulaTerminacion: string;
  /** Día en que se firma el acta (el del pie, no el de la terminación). */
  fechaFirma: string;

  /** Texto que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y el acta vacía tiene que poder imprimirse para
 * diligenciarla a mano.
 */
const EMPTY: TerminacionState = {
  contratoSolicitudId: null,

  tituloContratista: 'xxxx',
  tituloFecha: 'xxx (xxx) DE xxx DE 202x',

  repLegal: 'GLORIA LUCÍA ESCALANTE MANZANO',
  repLegalCc: '66.651.423',
  repLegalCcLugar: 'El Cerrito',
  contratante: 'CANALES Y CONTACTOS S.A.S',
  contratanteNit: '900.456.735-7',

  contratista: 'xxxx',
  contratistaCc: 'xxx',
  contratistaCcLugar: 'xx(xx)',

  fechaContrato: 'xx (0x) de xxxx de 202x',
  objeto:
    'en prestar servicios como xxxxx, brindando apoyo al área administrativa y operativa en '
    + 'gestiones logísticas, control y mantenimiento de la infraestructura y sedes en los '
    + 'municipios, seguimiento al parque automotor mediante sistemas GPS, control de '
    + 'mantenimientos y documentación vigente, verificación de inventarios de materiales y '
    + 'activos en los municipios, apoyo en la coordinación de personal operativo y gestión de '
    + 'cotización y compra de elementos requeridos por las diferentes oficinas y/o vehículos '
    + 'cuando fuese necesario.',
  vigenciaPlazo: 'cuatro (04) meses',
  vigenciaDesde: 'primero (01) de septiembre de 2025',
  vigenciaHasta: 'treinta y uno (31) de diciembre de 2025',
  valorInicial: 'xxxx PESOS M/CTE ($xxx)',
  valorMensual: 'xxxxPESOS M/CTE ($xxx)',

  otrosiNumero: 'x',
  otrosiFecha: 'xxx (xx) de xx de 202x',
  otrosiValor: 'xxxxPESOS M/CTE ($xx)',
  otrosiHasta: 'xxx (x) de xxde 202x',

  otrosi2Numero: '0x',
  otrosi2Fecha: 'xxx (xx) de 202x',

  fechaTerminacion: 'xxx (xx) de 202x',
  clausulaTerminacion: 'xxxx',
  fechaFirma: 'xxx(xx) de xxxxde dos mil veintiséis (2026)',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

/**
 * Trae el dato del contrato solo si el campo sigue como lo dejó el formato.
 *
 * Enlazar no puede pisar lo que alguien ya escribió: quien vinculó el contrato después de
 * diligenciar a mano perdería su trabajo sin haber pedido nada de eso.
 */
const rellenar = (actual: string, nuevo: string | undefined, defecto: string) =>
  nuevo && (!actual.trim() || actual === defecto) ? nuevo : actual;

export default function ActaTerminacionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const actaId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<TerminacionState>(EMPTY);
  const [contratos, setContratos] = useState<GcSolicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enlazando, setEnlazando] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof TerminacionState>(k: K, v: TerminacionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (actaId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const acta = await gestionConocimientoService.get(actaId);
        if (cancelled) return;
        const saved = (acta.data ?? {}) as Partial<TerminacionState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el acta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actaId]);

  // Los contratos del sistema, para poder enlazar. No bloquea: si falla, el acta se
  // diligencia a mano, que es como se llenan los contratos anteriores al sistema.
  useEffect(() => {
    gestionConocimientoService
      .list({ gestion: 'juridica' })
      .then((todas) => setContratos(todas.filter((r) => r.formato === FORMATO_CONTRATACION)))
      .catch(() => setContratos([]));
  }, []);

  const opciones = useMemo(
    () => contratos.map((c) => ({
      id: c.solicitudId,
      etiqueta: `#${c.solicitudId} · ${c.data?.contratista || 'Sin contratista'}`,
    })),
    [contratos],
  );

  /** Trae del contrato lo que el acta todavía no tiene escrito. */
  const enlazar = async (solicitudId: number) => {
    setEnlazando(true);
    try {
      const sol = await gestionConocimientoService.get(solicitudId);
      const d = sol.data ?? {};
      const contrato = (d.contrato ?? {}) as Record<string, string>;
      // De los otrosíes manda el último: es el que dejó vigentes el valor y el plazo.
      const otrosies = (d.otrosies?.lista ?? []) as Array<Record<string, string>>;
      const ultimo = otrosies.length ? otrosies[otrosies.length - 1] : null;

      setF((p) => ({
        ...p,
        contratoSolicitudId: solicitudId,
        contratista: rellenar(p.contratista, d.contratista, EMPTY.contratista),
        tituloContratista: rellenar(p.tituloContratista, d.contratista, EMPTY.tituloContratista),
        objeto: rellenar(p.objeto, d.alcanceServicio || d.objetoProyecto, EMPTY.objeto),
        valorInicial: rellenar(p.valorInicial, contrato.valor || d.honorarios, EMPTY.valorInicial),
        vigenciaPlazo: rellenar(p.vigenciaPlazo, contrato.plazo || d.duracion, EMPTY.vigenciaPlazo),
        vigenciaDesde: rellenar(p.vigenciaDesde, contrato.inicio, EMPTY.vigenciaDesde),
        vigenciaHasta: rellenar(p.vigenciaHasta, contrato.terminacion, EMPTY.vigenciaHasta),
        otrosiNumero: rellenar(p.otrosiNumero, ultimo?.numero, EMPTY.otrosiNumero),
        otrosiValor: rellenar(p.otrosiValor, ultimo?.valorAcumulado, EMPTY.otrosiValor),
      }));
      toast.success('Datos traídos del contrato');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo leer el contrato');
    } finally {
      setEnlazando(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardada = await gestionConocimientoService.guardar(actaId, {
        gestion: 'talento-humano',
        formato: FORMATO_TERMINACION,
        data: f,
      });
      toast.success('Acta guardada');
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda acta.
      if (actaId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/terminacion/${guardada.solicitudId}`,
          { replace: true },
        );
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
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
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/terminacion')} title="Volver a las actas">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Acta de terminación anticipada</h1>
            <p className="text-xs text-[#4a4a63]">
              Acta N.º {actaId}
              {f.contratoSolicitudId ? ` · enlazada al contrato #${f.contratoSolicitudId}` : ' · sin contrato enlazado'}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>

        {/* Enlace opcional con un contrato del sistema */}
        {editable && (
          <div className="max-w-4xl mx-auto px-6 pb-3 flex items-center gap-2 text-sm">
            <Link2 className="w-4 h-4 text-[#4a4a63] shrink-0" />
            <span className="text-[#4a4a63] shrink-0">Traer datos del contrato:</span>
            <select
              value={f.contratoSolicitudId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) { set('contratoSolicitudId', null); return; }
                void enlazar(Number(v));
              }}
              disabled={enlazando}
              className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 text-sm bg-white"
            >
              <option value="">Ninguno · se diligencia a mano</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>{o.etiqueta}</option>
              ))}
            </select>
            {enlazando && <Loader2 className="w-4 h-4 animate-spin text-[#4a4a63]" />}
            <span className="text-xs text-[#8a8aa0] shrink-0">No reemplaza lo ya escrito</span>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-4">

            {/* Membrete */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="h-12 object-contain" />
                <input
                  value={f.contratanteNit}
                  onChange={(e) => set('contratanteNit', e.target.value)}
                  className="mt-1 w-32 bg-transparent outline-none font-bold text-[11px] disabled:opacity-100 disabled:text-black"
                />
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>

            {/* Título */}
            <div className="text-center font-bold text-[12px] pt-2">
              <TextoEd
                k="titulo"
                plantilla={
                  `ACTA DE TERMINACIÓN ANTICIPADA DE MUTUO ACUERDO AL CONTRATO DE PRESTACIÓN DE `
                  + `SERVICIOS SUSCRITO ENTRE ${f.contratante.toUpperCase()} Y ${f.tituloContratista} `
                  + `SUSCRITO ${f.tituloFecha}.`
                }
                className="text-center"
              />
            </div>

            {/* Comparecencia */}
            <TextoEd
              k="comparecencia"
              plantilla={
                `${f.repLegal}, identificada con cédula de ciudadanía No. ${f.repLegalCc} expedida en `
                + `${f.repLegalCcLugar}, quien actúa en su calidad de representante legal de `
                + `${f.contratante}, identificada con NIT. ${f.contratanteNit}, que para los efectos `
                + `de la presente acta se denomina LA CONTRATANTE; y ${f.contratista}, identificado `
                + `con cédula de ciudadanía No. ${f.contratistaCc} de ${f.contratistaCcLugar}, quien `
                + `para efectos del presente contrato se denominará EL CONTRATISTA, han acordado `
                + `suscribir de mutuo acuerdo acta de terminación anticipada del contrato de `
                + `prestación de servicios, suscrito el día ${f.fechaContrato}, previa las siguientes:`
              }
            />

            {/* I. Consideraciones */}
            <div className="pt-2">
              <p className="font-bold text-center">
                <span className="mr-6">I.</span>CONSIDERACIONES E IDENTIFICACIÓN DEL CONTRATO
              </p>
            </div>

            <ol className="list-[upper-alpha] pl-10 space-y-3 pt-2">
              <li>
                <TextoEd
                  k="considerandoA"
                  plantilla={
                    `Que el día ${f.fechaContrato}, las partes suscribieron contrato de prestación de `
                    + `servicios, cuyo objeto consistió: " ${f.objeto} "`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoB"
                  plantilla={
                    `La vigencia del contrato se pactó por un término de ${f.vigenciaPlazo}, desde el `
                    + `día ${f.vigenciaDesde} hasta el ${f.vigenciaHasta}.`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoC"
                  plantilla={
                    `El valor inicial del contrato se pactó en la suma de ${f.valorInicial}, pagaderos `
                    + `al CONTRATISTA mes vencido mediante pagos mensuales de ${f.valorMensual}.`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoD"
                  plantilla={
                    `El día ${f.otrosiFecha} se suscribió el Otrosí No. ${f.otrosiNumero}, mediante el `
                    + `cual se modificó el valor total del contrato a la suma de ${f.otrosiValor} y se `
                    + `amplió el término de duración del contrato hasta el ${f.otrosiHasta}.`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoE"
                  plantilla={
                    `El día ${f.otrosi2Fecha} se suscribió el Otrosí No. ${f.otrosi2Numero}, mediante `
                    + `el cual se modificó el valor total del contrato y la forma de pago para la `
                    + `vigencia 202x, aplicando un incremento del xxxxpor ciento (x%) sobre el valor `
                    + `mensual que venía percibiendo el CONTRATISTA, equivalente a xxxx PESOS ($xxx) `
                    + `mensuales, quedando el nuevo valor mensual en xxxx CATORCE PESOS M/CTE ($xxx), `
                    + `aplicado desde el xxxx (0x) de x de 202x hasta el xxx (3x) de xxxde 20xx`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoF"
                  plantilla={
                    `Que el día ${f.fechaTerminacion}, las partes de mutuo acuerdo de conformidad a la `
                    + `cláusula ${f.clausulaTerminacion} del contrato, suscrito ${f.fechaContrato}, `
                    + `deciden dar por terminado de manera anticipada el contrato en cita.`
                  }
                />
              </li>
              <li>
                <TextoEd
                  k="considerandoG"
                  plantilla={
                    'Que, en desarrollo del principio de autonomía de la voluntad, las partes '
                    + 'contratantes pueden suscribir de común acuerdo todos los actos que a bien '
                    + 'consideren, siempre y cuando se encuentren permitidos por el ordenamiento jurídico.'
                  }
                />
              </li>
            </ol>

            <TextoEd k="porLoAnterior" plantilla="Por lo anterior, las partes de manera bilateral:" />

            {/* II. Acuerdan */}
            <p className="font-bold text-center pt-2">ACUERDAN:</p>

            <TextoEd
              k="primero"
              plantilla={
                `PRIMERO: Terminar de manera anticipada y de mutuo acuerdo el contrato de prestación `
                + `de servicios, entre ${f.contratante} Y ${f.contratista}, suscrito el día `
                + `${f.fechaContrato}.`
              }
            />

            <TextoEd
              k="segundo"
              plantilla={
                'SEGUNDO: La presente TERMINACIÓN DE MUTUO ACUERDO, no da lugar a reclamación de '
                + 'perjuicios por parte del CONTRATISTA y en consecuencia renuncian a los que '
                + 'eventualmente pudiera considerar que existan a su favor.'
              }
            />

            <TextoEd
              k="tercero"
              plantilla="TERCERO: EL CONTRATISTA declara a PAZ Y SALVO por todo concepto a LA CONTRATANTE."
            />

            <div className="pt-2">
              <TextoEd
                k="cierre"
                plantilla={
                  `La presente acta, se firma una vez leída y aprobada por los que en ella `
                  + `intervinieron, el día ${f.fechaFirma}.`
                }
              />
            </div>

            {/* Firmas */}
            <div className="grid grid-cols-2 gap-8 pt-14">
              <div className="space-y-0.5">
                <p className="font-bold">LA CONTRATANTE</p>
                <p className="font-bold pt-4">{f.repLegal}</p>
                <p>C.C. {f.repLegalCc} expedida en {f.repLegalCcLugar}</p>
                <p>Representante Legal</p>
                <p className="font-bold">{f.contratante}.</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-bold">EL CONTRATISTA</p>
                <p className="font-bold pt-4">{f.contratista}</p>
                <p>C.C. {f.contratistaCc} de {f.contratistaCcLugar}</p>
              </div>
            </div>
          </div>

          {/* Los datos que arman el texto. Van fuera del acta: en el papel no existen, pero
              sin ellos habría que reescribir cada párrafo a mano para cambiar una fecha. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos del acta</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman los párrafos de arriba. Un párrafo que se reescriba a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} />
              <Campo label="Cédula del contratista" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} />
              <Campo label="Expedida en" value={f.contratistaCcLugar} onChange={(v) => set('contratistaCcLugar', v)} />
              <Campo label="Fecha del contrato" value={f.fechaContrato} onChange={(v) => set('fechaContrato', v)} />
              <Campo label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area />
              <Campo label="Plazo pactado" value={f.vigenciaPlazo} onChange={(v) => set('vigenciaPlazo', v)} />
              <Campo label="Desde" value={f.vigenciaDesde} onChange={(v) => set('vigenciaDesde', v)} />
              <Campo label="Hasta" value={f.vigenciaHasta} onChange={(v) => set('vigenciaHasta', v)} />
              <Campo label="Valor inicial" value={f.valorInicial} onChange={(v) => set('valorInicial', v)} />
              <Campo label="Pago mensual" value={f.valorMensual} onChange={(v) => set('valorMensual', v)} />
              <Campo label="Otrosí N.º" value={f.otrosiNumero} onChange={(v) => set('otrosiNumero', v)} />
              <Campo label="Fecha del otrosí" value={f.otrosiFecha} onChange={(v) => set('otrosiFecha', v)} />
              <Campo label="Valor tras el otrosí" value={f.otrosiValor} onChange={(v) => set('otrosiValor', v)} />
              <Campo label="Prórroga hasta" value={f.otrosiHasta} onChange={(v) => set('otrosiHasta', v)} />
              <Campo label="Otrosí del incremento N.º" value={f.otrosi2Numero} onChange={(v) => set('otrosi2Numero', v)} />
              <Campo label="Fecha de ese otrosí" value={f.otrosi2Fecha} onChange={(v) => set('otrosi2Fecha', v)} />
              <Campo label="Fecha de la terminación" value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} />
              <Campo label="Cláusula que la permite" value={f.clausulaTerminacion} onChange={(v) => set('clausulaTerminacion', v)} />
              <Campo label="Fecha de firma del acta" value={f.fechaFirma} onChange={(v) => set('fechaFirma', v)} />
              <Campo label="Contratista (título)" value={f.tituloContratista} onChange={(v) => set('tituloContratista', v)} />
              <Campo label="Fecha (título)" value={f.tituloFecha} onChange={(v) => set('tituloFecha', v)} />
            </div>
          </section>

          <PieElaboracion />
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta acta. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function Campo({ label, value, onChange, area }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean;
}) {
  return (
    <label className={'block ' + (area ? 'md:col-span-2' : '')}>
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      )}
    </label>
  );
}
