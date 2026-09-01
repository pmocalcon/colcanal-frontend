import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { FORMATO_TERMINACION_ANTICIPADA_UNILATERAL } from '@/config/formatosGestion';

/**
 * Notificación de terminación anticipada unilateral de un contrato de prestación de servicios.
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = TERMINACION-ANTICIPADA-UNILATERAL). Se diligencia, se guarda y se imprime para
 * notificarlo al contratista; no tiene máquina de estados, así que se queda en borrador y
 * siempre se puede corregir.
 *
 * A diferencia de las cartas de trabajadores, aquí el destinatario es un CONTRATISTA (persona
 * o razón social), no un empleado: por eso no trae autocompletado desde la ficha de personal.
 * La firma es la del Representante Legal y la revisión al pie es constante (Dirección Jurídica).
 * El bloque de CONTROL PREVIO va marcado `no-print`: recuerda que solo debe usarse cuando exista
 * una facultad contractual expresa de terminación, y no aparece en la carta final.
 *
 * Ruta: `.../talento-humano/terminacion-anticipada-unilateral/:id`.
 */

/** La empleadora / contratante y quien firma. Constantes de la empresa. */
const REP_LEGAL = { nombre: 'GLORIA LUCÍA ESCALANTE MANZANO', cargo: 'Representante Legal' };
/** Quien proyecta y revisa jurídicamente. Constante: siempre la Dirección Jurídica. */
const REVISO = 'Marta Cecilia Rodríguez Herrera - Directora Jurídica';

interface TerminacionUnilateralState {
  contratante: string;
  nit: string;

  // ── Control previo (no se imprime) ──
  contratoFecha: string;
  clausulaFuente: string;
  preavisoExigido: string;
  validacionJuridica: string;

  // ── Fecha ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  // ── Destinatario (contratista) ──
  contratista: string;
  ccNit: string;
  ciudadCorreo: string;

  // ── Datos interpolados en el cuerpo ──
  contratoNumero: string;
  fechaContrato: string;
  clausulaNumero: string;
  contratoOtrosi: string;
  preavisoNumero: string;
  preavisoTipo: string;
  fechaEfectiva: string;
  fechaEntrega: string;
  entregables: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: TerminacionUnilateralState = {
  contratante: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  contratoFecha: '[NÚMERO O IDENTIFICACIÓN / FECHA]',
  clausulaFuente: '[NÚMERO Y TEXTO APLICABLE]',
  preavisoExigido: '[NÚMERO DE DÍAS / FORMA DE CÓMPUTO]',
  validacionJuridica: '[NOMBRE / FECHA / APROBADO]',

  ciudad: '[CIUDAD]',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',

  contratista: '[NOMBRE / RAZÓN SOCIAL DEL CONTRATISTA]',
  ccNit: '[CC/NIT]',
  ciudadCorreo: '[CIUDAD / CORREO]',

  contratoNumero: '[NÚMERO / IDENTIFICACIÓN]',
  fechaContrato: '[FECHA]',
  clausulaNumero: '[NÚMERO]',
  contratoOtrosi: '[CONTRATO / OTROSÍ No. ___]',
  preavisoNumero: '[NÚMERO]',
  preavisoTipo: '[CALENDARIO / HÁBILES]',
  fechaEfectiva: '[FECHA EFECTIVA]',
  fechaEntrega: '[FECHA]',
  entregables: '[INFORMACIÓN / DOCUMENTOS / BIENES / ACCESOS / INFORMES / ENTREGABLES PENDIENTES]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function TerminacionAnticipadaUnilateralPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const notiId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<TerminacionUnilateralState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof TerminacionUnilateralState>(k: K, v: TerminacionUnilateralState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (notiId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(notiId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<TerminacionUnilateralState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la notificación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notiId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(notiId, {
        gestion: 'talento-humano',
        formato: FORMATO_TERMINACION_ANTICIPADA_UNILATERAL,
        data: f,
      });
      toast.success('Notificación guardada');
      if (notiId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/terminacion-anticipada-unilateral/${guardado.solicitudId}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/terminacion-anticipada-unilateral')} title="Volver a las notificaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Terminación anticipada unilateral</h1>
            <p className="text-xs text-[#4a4a63]">Notificación N.º {notiId ?? 'nuevo'}</p>
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-3">

            {/* Membrete */}
            <div className="flex items-start justify-between gap-4">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="h-12 object-contain" />
              <div className="text-center px-3 self-center">
                <h2 className="font-bold text-[13px] leading-tight">NOTIFICACIÓN DE TERMINACIÓN ANTICIPADA UNILATERAL</h2>
                <p className="font-bold text-[11px]">CONTRATO DE PRESTACIÓN DE SERVICIOS</p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Control previo — no se imprime en la carta final */}
            <div className="no-print border border-[#e6d200] rounded overflow-hidden text-[11px]">
              <div className="grid grid-cols-[200px_1fr] border-b border-[#e6d200]">
                <div className="bg-[#fff6c2] font-bold px-3 py-1.5 border-r border-[#e6d200]">
                  CONTROL PREVIO · NO OMITIR
                </div>
                <p className="px-3 py-1.5 text-[10px] text-[#4a4a63]">
                  Utilizar únicamente cuando exista una facultad contractual expresa de terminación unilateral
                  o anticipada aplicable al caso.
                </p>
              </div>
              <CtrlRow label="Contrato / fecha" value={f.contratoFecha} onChange={(v) => set('contratoFecha', v)} />
              <CtrlRow label="Cláusula fuente" value={f.clausulaFuente} onChange={(v) => set('clausulaFuente', v)} />
              <CtrlRow label="Preaviso exigido" value={f.preavisoExigido} onChange={(v) => set('preavisoExigido', v)} />
              <CtrlRow label="Validación jurídica previa" value={f.validacionJuridica} onChange={(v) => set('validacionJuridica', v)} last />
            </div>

            {/* Fecha */}
            <p className="pt-1">{f.ciudad}, {f.dia} de {f.mes} de {f.anio}</p>

            {/* Destinatario */}
            <div>
              <p>Señor(a)</p>
              <p className="font-bold">{f.contratista}</p>
              <p>{f.ccNit}</p>
              <p>{f.ciudadCorreo}</p>
            </div>

            <TextoEd
              k="asunto"
              plantilla={
                `Asunto: Notificación de terminación anticipada unilateral del contrato de prestación de `
                + `servicios ${f.contratoNumero} suscrito el ${f.fechaContrato}.`
              }
            />

            <p>Cordial saludo:</p>

            <TextoEd
              k="parrafo1"
              plantilla={
                `Por medio de la presente, ${f.contratante}, en calidad de LA CONTRATANTE, comunica formalmente `
                + `su decisión de dar por terminado de manera anticipada y unilateral el contrato de prestación de `
                + `servicios identificado en el asunto, junto con los otrosíes o modificaciones que resulten `
                + `aplicables.`
              }
            />
            <TextoEd
              k="parrafo2"
              plantilla={
                `La decisión se adopta en ejercicio de la facultad prevista expresamente en la cláusula `
                + `${f.clausulaNumero} del ${f.contratoOtrosi}, suscrito el ${f.fechaContrato}, cuyo contenido `
                + `pertinente establece:`
              }
            />
            <TextoEd
              className="italic"
              k="aparte"
              plantilla={`"[TRANSCRIBIR EXCLUSIVAMENTE EL APARTE CONTRACTUAL QUE AUTORIZA LA TERMINACIÓN Y EL PREAVISO APLICABLE]".`}
            />
            <TextoEd
              k="parrafo3"
              plantilla={
                `Conforme a dicha estipulación, y respetando el preaviso de ${f.preavisoNumero} días `
                + `${f.preavisoTipo} pactado entre las partes, la terminación será efectiva a partir del `
                + `${f.fechaEfectiva}.`
              }
            />
            <TextoEd
              k="parrafo4"
              plantilla={
                `Hasta la fecha efectiva de terminación se reconocerán únicamente los valores debidamente causados `
                + `y acreditados conforme al contrato, previa verificación del cumplimiento de las obligaciones, `
                + `entregables, informes, soportes de seguridad social, facturación o cuenta de cobro y demás `
                + `requisitos aplicables.`
              }
            />
            <TextoEd
              k="parrafo5"
              plantilla={
                `EL/LA CONTRATISTA deberá efectuar, a más tardar el ${f.fechaEntrega}, la entrega de ${f.entregables}, `
                + `así como atender las obligaciones que por su naturaleza sobrevivan a la terminación, incluyendo `
                + `las relacionadas con confidencialidad, protección de datos, propiedad intelectual, devolución de `
                + `información y demás deberes poscontractuales pactados.`
              }
            />
            <TextoEd
              k="parrafo6"
              plantilla={
                `La presente terminación corresponde al ejercicio de una facultad contractual previamente acordada `
                + `por las partes. Su comunicación no constituye, por sí misma, declaración de incumplimiento ni `
                + `implica renuncia de ${f.contratante} a los derechos, reclamaciones, compensaciones o descuentos `
                + `que legal o contractualmente procedan respecto de obligaciones, saldos o responsabilidades `
                + `debidamente acreditadas.`
              }
            />

            <p className="pt-1">Atentamente,</p>

            {/* Firma del representante legal */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black pt-1 font-bold inline-block">{REP_LEGAL.nombre}</p>
              <p>{REP_LEGAL.cargo}</p>
              <p className="font-bold">{f.contratante}</p>
              <p>NIT {f.nit}</p>
            </div>

            {/* Copia y revisión jurídica (constante) */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Copia: Historia contractual / expediente contractual</p>
              <p>Proyectó y revisó: {REVISO}</p>
            </div>

            <PieMembrete />
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos de la notificación</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman el encabezado y los párrafos. El aparte contractual entre comillas se transcribe
                directamente sobre el documento. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />

              <Campo label="Contratista (nombre / razón social)" value={f.contratista} onChange={(v) => set('contratista', v)} />
              <Campo label="CC / NIT del contratista" value={f.ccNit} onChange={(v) => set('ccNit', v)} />
              <Campo label="Ciudad / correo del contratista" value={f.ciudadCorreo} onChange={(v) => set('ciudadCorreo', v)} />

              <Campo label="N.º / identificación del contrato" value={f.contratoNumero} onChange={(v) => set('contratoNumero', v)} />
              <Campo label="Fecha del contrato" value={f.fechaContrato} onChange={(v) => set('fechaContrato', v)} />
              <Campo label="Cláusula fuente (N.º)" value={f.clausulaNumero} onChange={(v) => set('clausulaNumero', v)} />
              <Campo label="Contrato / otrosí de la facultad" value={f.contratoOtrosi} onChange={(v) => set('contratoOtrosi', v)} />
              <Campo label="Preaviso (N.º de días)" value={f.preavisoNumero} onChange={(v) => set('preavisoNumero', v)} />
              <Campo label="Preaviso (calendario / hábiles)" value={f.preavisoTipo} onChange={(v) => set('preavisoTipo', v)} />
              <Campo label="Fecha efectiva de la terminación" value={f.fechaEfectiva} onChange={(v) => set('fechaEfectiva', v)} />
              <Campo label="Fecha límite de entrega" value={f.fechaEntrega} onChange={(v) => set('fechaEntrega', v)} />
              <Campo label="Entregables pendientes" value={f.entregables} onChange={(v) => set('entregables', v)} area />

              <Campo label="Control · Contrato / fecha" value={f.contratoFecha} onChange={(v) => set('contratoFecha', v)} />
              <Campo label="Control · Cláusula fuente" value={f.clausulaFuente} onChange={(v) => set('clausulaFuente', v)} />
              <Campo label="Control · Preaviso exigido" value={f.preavisoExigido} onChange={(v) => set('preavisoExigido', v)} />
              <Campo label="Control · Validación jurídica previa" value={f.validacionJuridica} onChange={(v) => set('validacionJuridica', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta notificación. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function CtrlRow({ label, value, onChange, last }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={'grid grid-cols-[200px_1fr] ' + (last ? '' : 'border-b border-[#e6d200]')}>
      <div className="bg-[#fffbe0] font-semibold px-3 py-1.5 border-r border-[#e6d200]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 outline-none bg-transparent text-[11px]"
      />
    </div>
  );
}

function Campo({ label, value, onChange, onBlur, area }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; area?: boolean;
}) {
  return (
    <label className={'block ' + (area ? 'md:col-span-2' : '')}>
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={3}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      )}
    </label>
  );
}
