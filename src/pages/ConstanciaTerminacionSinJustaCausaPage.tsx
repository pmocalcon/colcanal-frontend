import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { FORMATO_CONSTANCIA_TERMINACION_SJC } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Constancia de comunicación de terminación sin justa causa y negativa a firmar recibido.
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = CONSTANCIA-TERMINACION-SJC). Se diligencia, se guarda y se imprime para
 * firmarlo en papel; no tiene máquina de estados, así que se queda en borrador y siempre se
 * puede corregir.
 *
 * La deja quienes presenciaron los hechos (quien comunicó y el testigo). La Dirección
 * Jurídica firma al pie **solo** una revisión jurídica del documento, no como testigo: por
 * eso ese nombre es constante y no un campo, y el bloque de CONTROL INTERNO recuerda que no
 * debe figurar como testigo si no estuvo presente.
 *
 * El bloque de CONTROL INTERNO va marcado `no-print`: guía a quien diligencia pero no
 * aparece en la versión final.
 *
 * Ruta: `.../talento-humano/constancia-terminacion-sjc/:id`.
 */

/** Quien revisa jurídicamente el documento. Constante: es siempre la Dirección Jurídica. */
const REVISION_JURIDICA = { nombre: 'MARTA CECILIA RODRÍGUEZ HERRERA', cargo: 'Directora Jurídica' };

interface ConstanciaState {
  // ── La empleadora ──
  empleadora: string;
  nit: string;

  // ── Control interno (no se imprime) ──
  documentoComunicado: string;
  testigoPresencialCtrl: string;

  // ── Fecha ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  // ── PRIMERO — comunicación de la decisión ──
  fechaComunicacion: string;
  hora: string;
  lugar: string;
  nombreComunica: string;
  numeroComunica: string;
  cargoComunica: string;
  nombreTrabajador: string;
  ccTrabajador: string;
  fechaEfectiva: string;

  // ── SEGUNDO — entrega material ──
  numEjemplares: string;
  otrosDocumentos: string;
  circunstanciaEntrega: string;

  // ── TERCERO — negativa a firmar ──
  negativaDescripcion: string;

  // ── CUARTO — testigo presencial ──
  nombreTestigo: string;
  numeroTestigo: string;
  cargoTestigo: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y la constancia vacía tiene que poder imprimirse para
 * diligenciarla a mano. Los corchetes en mayúscula marcan lo que falta.
 */
const EMPTY: ConstanciaState = {
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  documentoComunicado: '[CARTA DE TERMINACIÓN SIN JUSTA CAUSA / FECHA]',
  testigoPresencialCtrl: '[NOMBRE / CARGO]',

  ciudad: '[CIUDAD]',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',

  fechaComunicacion: '[FECHA]',
  hora: '[HORA]',
  lugar: '[LUGAR]',
  nombreComunica: '[NOMBRE DE QUIEN COMUNICA]',
  numeroComunica: '[NÚMERO]',
  cargoComunica: '[CARGO / JEFE INMEDIATO / RESPONSABLE]',
  nombreTrabajador: '[NOMBRE DEL TRABAJADOR]',
  ccTrabajador: '[NÚMERO]',
  fechaEfectiva: '[FECHA EFECTIVA]',

  numEjemplares: '[NÚMERO]',
  otrosDocumentos: '[OTROS DOCUMENTOS, SI APLICA]',
  circunstanciaEntrega: '[INDICAR SI EL TRABAJADOR CONSERVÓ LOS DOCUMENTOS / SI SE NEGÓ A RECIBIRLOS / OTRA CIRCUNSTANCIA EXACTA]',

  negativaDescripcion: '[SE NEGÓ EXPRESAMENTE A FIRMAR / MANIFESTÓ QUE NO FIRMARÍA / OTRA DESCRIPCIÓN OBJETIVA]',

  nombreTestigo: '[NOMBRE DEL TESTIGO]',
  numeroTestigo: '[NÚMERO]',
  cargoTestigo: '[CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function ConstanciaTerminacionSinJustaCausaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const constanciaId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<ConstanciaState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof ConstanciaState>(k: K, v: ConstanciaState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (constanciaId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(constanciaId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<ConstanciaState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la constancia');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [constanciaId]);

  /**
   * Con la cédula llega el nombre del trabajador de la ficha de personal. Se dispara al
   * salir de la casilla y solo llena lo que sigue como plantilla, para no pisar lo escrito.
   */
  const prellenar = async () => {
    if (!editable) return;
    const cedula = f.ccTrabajador.replace(/\D/g, '');
    if (cedula !== f.ccTrabajador) set('ccTrabajador', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => ({
      ...p,
      nombreTrabajador: (!p.nombreTrabajador.trim() || p.nombreTrabajador === EMPTY.nombreTrabajador) ? nombreDeFicha(ficha) : p.nombreTrabajador,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(constanciaId, {
        gestion: 'talento-humano',
        formato: FORMATO_CONSTANCIA_TERMINACION_SJC,
        data: f,
      });
      toast.success('Constancia guardada');
      if (constanciaId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/constancia-terminacion-sjc/${guardado.solicitudId}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/constancia-terminacion-sjc')} title="Volver a las constancias">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Constancia de terminación sin justa causa</h1>
            <p className="text-xs text-[#4a4a63]">Constancia N.º {constanciaId ?? 'nuevo'}</p>
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
                <h2 className="font-bold text-[13px] leading-tight">CONSTANCIA DE COMUNICACIÓN DE TERMINACIÓN SIN JUSTA CAUSA</h2>
                <p className="font-bold text-[11px]">Y NEGATIVA A FIRMAR RECIBIDO</p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Control interno — no se imprime en la versión final */}
            <div className="no-print border border-[#e6d200] rounded overflow-hidden text-[11px]">
              <div className="grid grid-cols-[220px_1fr] border-b border-[#e6d200]">
                <div className="bg-[#fff6c2] font-bold px-3 py-1.5 border-r border-[#e6d200]">
                  CONTROL INTERNO · NO SE IMPRIME EN LA VERSIÓN FINAL
                </div>
                <p className="px-3 py-1.5 text-[10px] text-[#4a4a63]">
                  Diligenciar únicamente con hechos presenciados directamente por quienes suscriben.
                  La Dirección Jurídica no debe figurar como testigo si no estuvo presente.
                </p>
              </div>
              <CtrlRow label="Documento comunicado" value={f.documentoComunicado} onChange={(v) => set('documentoComunicado', v)} />
              <CtrlRow label="Testigo presencial" value={f.testigoPresencialCtrl} onChange={(v) => set('testigoPresencialCtrl', v)} last />
            </div>

            {/* Fecha */}
            <p className="pt-1">{f.ciudad}, {f.dia} de {f.mes} de {f.anio}</p>

            {/* HECHOS QUE SE HACEN CONSTAR */}
            <Titulo>HECHOS QUE SE HACEN CONSTAR</Titulo>

            <TextoEd
              k="primero"
              plantilla={
                `PRIMERO. Comunicación de la decisión: El día ${f.fechaComunicacion}, aproximadamente a las `
                + `${f.hora}, en ${f.lugar}, ${f.nombreComunica}, identificado(a) con C.C. No. ${f.numeroComunica}, `
                + `en calidad de ${f.cargoComunica}, comunicó personalmente a ${f.nombreTrabajador}, `
                + `identificado(a) con cédula de ciudadanía No. ${f.ccTrabajador}, la decisión de LA EMPLEADORA `
                + `de dar por terminado unilateralmente y sin justa causa su contrato de trabajo, con efectos a `
                + `partir del ${f.fechaEfectiva}, según la comunicación escrita preparada para tal fin.`
              }
            />
            <TextoEd
              k="segundo"
              plantilla={
                `SEGUNDO. Entrega material: En el mismo acto se hizo entrega material al trabajador de `
                + `${f.numEjemplares} ejemplar(es) de la comunicación escrita y de ${f.otrosDocumentos}. `
                + `${f.circunstanciaEntrega}.`
              }
            />
            <TextoEd
              k="tercero"
              plantilla={
                `TERCERO. Negativa a firmar recibido: Se solicitó al trabajador suscribir la copia o constancia `
                + `de recibido. El trabajador ${f.negativaDescripcion}. En consecuencia, se deja constancia de que `
                + `la decisión fue comunicada personalmente y de las circunstancias concretas de la entrega o `
                + `intento de entrega.`
              }
            />
            <TextoEd
              k="cuarto"
              plantilla={
                `CUARTO. Testigo presencial: Los hechos descritos fueron presenciados por ${f.nombreTestigo}, `
                + `identificado(a) con C.C. No. ${f.numeroTestigo}, quien se desempeña como ${f.cargoTestigo} y `
                + `suscribe la presente constancia únicamente respecto de los hechos que presenció.`
              }
            />
            <TextoEd
              k="quinto"
              plantilla={
                `QUINTO. Alcance de la revisión jurídica: La Dirección Jurídica no certifica hechos que no haya `
                + `presenciado. Su intervención, cuando corresponda, se limita a recomendar la documentación de lo `
                + `ocurrido y a revisar jurídicamente la estructura de la presente constancia como soporte laboral `
                + `y probatorio.`
              }
            />

            <p className="pt-1">Para constancia, se suscribe por quienes intervinieron o presenciaron los hechos en la fecha indicada.</p>

            {/* Firmas de quienes presenciaron */}
            <div className="grid grid-cols-2 gap-8 pt-16">
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.nombreComunica}</p>
                <p>{f.cargoComunica}</p>
                <p>Quien efectuó la comunicación y/o entrega</p>
              </div>
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.nombreTestigo}</p>
                <p>{f.cargoTestigo}</p>
                <p>Testigo presencial</p>
              </div>
            </div>

            {/* Revisión jurídica del documento (constante) */}
            <p className="text-center font-bold pt-8">REVISIÓN JURÍDICA DEL DOCUMENTO</p>
            <div className="pt-10">
              <div className="w-1/2 space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{REVISION_JURIDICA.nombre}</p>
                <p>{REVISION_JURIDICA.cargo}</p>
                <p>Revisión jurídica - no testigo presencial</p>
              </div>
            </div>

            <PieMembrete />
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos de la constancia</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman los párrafos de arriba. Escribe la cédula del trabajador y se trae su nombre de la
                ficha de personal. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Documento comunicado (control interno)" value={f.documentoComunicado} onChange={(v) => set('documentoComunicado', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />

              <Campo label="Fecha de la comunicación" value={f.fechaComunicacion} onChange={(v) => set('fechaComunicacion', v)} />
              <Campo label="Hora aproximada" value={f.hora} onChange={(v) => set('hora', v)} />
              <Campo label="Lugar" value={f.lugar} onChange={(v) => set('lugar', v)} />
              <Campo label="Nombre de quien comunicó" value={f.nombreComunica} onChange={(v) => set('nombreComunica', v)} />
              <Campo label="C.C. de quien comunicó" value={f.numeroComunica} onChange={(v) => set('numeroComunica', v)} />
              <Campo label="Cargo de quien comunicó" value={f.cargoComunica} onChange={(v) => set('cargoComunica', v)} />
              <Campo label="Cédula del trabajador" value={f.ccTrabajador} onChange={(v) => set('ccTrabajador', v)} onBlur={prellenar} />
              <Campo label="Nombre del trabajador" value={f.nombreTrabajador} onChange={(v) => set('nombreTrabajador', v)} />
              <Campo label="Fecha efectiva de la terminación" value={f.fechaEfectiva} onChange={(v) => set('fechaEfectiva', v)} />

              <Campo label="N.º de ejemplares entregados" value={f.numEjemplares} onChange={(v) => set('numEjemplares', v)} />
              <Campo label="Otros documentos (si aplica)" value={f.otrosDocumentos} onChange={(v) => set('otrosDocumentos', v)} />
              <Campo label="Circunstancia de la entrega" value={f.circunstanciaEntrega} onChange={(v) => set('circunstanciaEntrega', v)} area />
              <Campo label="Descripción de la negativa a firmar" value={f.negativaDescripcion} onChange={(v) => set('negativaDescripcion', v)} area />

              <Campo label="Nombre del testigo" value={f.nombreTestigo} onChange={(v) => set('nombreTestigo', v)} />
              <Campo label="C.C. del testigo" value={f.numeroTestigo} onChange={(v) => set('numeroTestigo', v)} />
              <Campo label="Cargo del testigo" value={f.cargoTestigo} onChange={(v) => set('cargoTestigo', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta constancia. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="font-bold text-center pt-2">{children}</p>;
}

function CtrlRow({ label, value, onChange, last }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={'grid grid-cols-[220px_1fr] ' + (last ? '' : 'border-b border-[#e6d200]')}>
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
