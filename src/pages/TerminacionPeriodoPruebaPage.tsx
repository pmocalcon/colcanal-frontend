import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { FORMATO_TERMINACION_PERIODO_PRUEBA } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Terminación del contrato de trabajo durante el período de prueba.
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = TERMINACION-PERIODO-PRUEBA). Se diligencia, se guarda y se imprime para
 * entregarlo al trabajador; no tiene máquina de estados, así que se queda en borrador y
 * siempre se puede corregir.
 *
 * La firma es la del Representante Legal y la revisión jurídica al pie es constante
 * (Dirección Jurídica). El bloque de CONTROL PREVIO va marcado `no-print`: recuerda validar
 * que el período de prueba conste por escrito y esté vigente, y no aparece en la carta final.
 *
 * Ruta: `.../talento-humano/terminacion-periodo-prueba/:id`.
 */

/** La empleadora y quien firma. Constantes de la empresa. */
const REP_LEGAL = { nombre: 'GLORIA LUCÍA ESCALANTE MANZANO', cargo: 'Representante Legal' };
/** Quien revisa jurídicamente. Constante: siempre la Dirección Jurídica. */
const REVISO = 'Marta Cecilia Rodríguez Herrera - Directora Jurídica';

interface TerminacionPruebaState {
  empleadora: string;
  nit: string;

  // ── Control previo (no se imprime) ──
  contratoFechaInicio: string;
  periodoPactado: string;
  validacionPrevia: string;

  // ── Fecha ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  // ── Destinatario ──
  nombreTrabajador: string;
  ccTrabajador: string;
  cargo: string;
  saludoApellido: string;

  // ── Datos interpolados en el cuerpo ──
  tipoContrato: string;
  fechaContrato: string;
  clausulaNumero: string;
  duracionPrueba: string;
  fechaInicioPrueba: string;
  fechaFinPrueba: string;
  fechaEfectiva: string;

  // ── Pie ──
  elaboro: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: TerminacionPruebaState = {
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  contratoFechaInicio: '[TIPO / FECHA]',
  periodoPactado: '[NÚMERO DE DÍAS/MESES - FECHA INICIO - FECHA FIN]',
  validacionPrevia: '[TALENTO HUMANO / JURÍDICA - FECHA]',

  ciudad: '[CIUDAD]',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',

  nombreTrabajador: '[NOMBRE DEL TRABAJADOR]',
  ccTrabajador: '[NÚMERO]',
  cargo: '[CARGO]',
  saludoApellido: '[SEÑOR/SEÑORA + APELLIDO]',

  tipoContrato: '[TIPO DE CONTRATO]',
  fechaContrato: '[FECHA]',
  clausulaNumero: '[NÚMERO]',
  duracionPrueba: '[DURACIÓN]',
  fechaInicioPrueba: '[FECHA DE INICIO]',
  fechaFinPrueba: '[FECHA DE FINALIZACIÓN]',
  fechaEfectiva: '[FECHA EFECTIVA]',

  elaboro: '[NOMBRE - CARGO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function TerminacionPeriodoPruebaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const notiId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<TerminacionPruebaState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof TerminacionPruebaState>(k: K, v: TerminacionPruebaState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (notiId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(notiId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<TerminacionPruebaState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la comunicación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notiId]);

  /**
   * Con la cédula llegan el nombre y el cargo del trabajador de la ficha de personal. Se
   * dispara al salir de la casilla y solo llena lo que sigue como plantilla.
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
      cargo: (!p.cargo.trim() || p.cargo === EMPTY.cargo) ? (ficha.cargo ?? '') : p.cargo,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(notiId, {
        gestion: 'talento-humano',
        formato: FORMATO_TERMINACION_PERIODO_PRUEBA,
        data: f,
      });
      toast.success('Comunicación guardada');
      if (notiId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/terminacion-periodo-prueba/${guardado.solicitudId}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/terminacion-periodo-prueba')} title="Volver a las comunicaciones">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Terminación en período de prueba</h1>
            <p className="text-xs text-[#4a4a63]">Comunicación N.º {notiId ?? 'nuevo'}</p>
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
            <EncabezadoFormato
              codigo="GTH-019-F"
              fecha="01/09/2026"
              titulo={
                <>
                  <h2 className="font-bold text-[13px] leading-tight">TERMINACIÓN DEL CONTRATO DE TRABAJO</h2>
                  <p className="font-bold text-[11px]">DURANTE EL PERÍODO DE PRUEBA</p>
                </>
              }
            />
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Control previo — no se imprime en la carta final */}
            <div className="no-print border border-[#e6d200] rounded overflow-hidden text-[11px]">
              <div className="grid grid-cols-[200px_1fr] border-b border-[#e6d200]">
                <div className="bg-[#fff6c2] font-bold px-3 py-1.5 border-r border-[#e6d200]">
                  CONTROL PREVIO · NO SE IMPRIME EN LA CARTA FINAL
                </div>
                <p className="px-3 py-1.5 text-[10px] text-[#4a4a63]">
                  Verificar que el período de prueba conste por escrito, que esté vigente en la fecha efectiva
                  de terminación y que no se utilice con finalidad discriminatoria, retaliatoria o para
                  desconocer estabilidad laboral reforzada.
                </p>
              </div>
              <CtrlRow label="Contrato / fecha de inicio" value={f.contratoFechaInicio} onChange={(v) => set('contratoFechaInicio', v)} />
              <CtrlRow label="Período pactado" value={f.periodoPactado} onChange={(v) => set('periodoPactado', v)} />
              <CtrlRow label="Validación previa" value={f.validacionPrevia} onChange={(v) => set('validacionPrevia', v)} last />
            </div>

            {/* Fecha */}
            <p className="pt-1">{f.ciudad}, {f.dia} de {f.mes} de {f.anio}</p>

            {/* Destinatario */}
            <div>
              <p>Señor(a)</p>
              <p className="font-bold">{f.nombreTrabajador}</p>
              <p>C.C. No. {f.ccTrabajador}</p>
              <p>Cargo: {f.cargo}</p>
              <p>Presente</p>
            </div>

            <p><span className="font-bold">Asunto:</span> Terminación del contrato de trabajo durante el período de prueba.</p>

            <p>Respetado(a) {f.saludoApellido}:</p>

            <TextoEd
              k="parrafo1"
              plantilla={
                `${f.empleadora} le comunica su decisión de dar por terminado el contrato de trabajo `
                + `${f.tipoContrato} suscrito el ${f.fechaContrato}, durante el período de prueba expresamente `
                + `pactado por escrito en la cláusula ${f.clausulaNumero} del contrato.`
              }
            />
            <TextoEd
              k="parrafo2"
              plantilla={
                `El período de prueba fue pactado por ${f.duracionPrueba}, contado desde el ${f.fechaInicioPrueba} `
                + `hasta el ${f.fechaFinPrueba}. La presente decisión se adopta y produce efectos dentro de dicho `
                + `período, a partir del ${f.fechaEfectiva}.`
              }
            />
            <TextoEd
              k="parrafo3"
              plantilla={
                `Durante esta etapa inicial la empresa evaluó la adaptación y condiciones requeridas para el `
                + `desempeño del cargo y decidió no continuar con la relación laboral. Esta comunicación no `
                + `corresponde a una sanción disciplinaria ni implica una imputación de justa causa.`
              }
            />
            <TextoEd
              k="parrafo4"
              plantilla={
                `A la fecha efectiva de terminación, la empresa procederá con la liquidación y pago de los `
                + `salarios, prestaciones sociales y demás acreencias laborales legalmente causadas, así como con `
                + `los trámites de retiro del Sistema de Seguridad Social Integral que correspondan. La `
                + `certificación laboral será expedida en los términos legales cuando sea solicitada o cuando `
                + `proceda su entrega.`
              }
            />
            <TextoEd
              k="parrafo5"
              plantilla={`Agradecemos los servicios prestados durante el tiempo de vinculación.`}
            />

            <p className="pt-1">Cordialmente,</p>

            {/* Firma del representante legal */}
            <div className="pt-12 space-y-0.5">
              <p className="border-t border-black pt-1 font-bold inline-block">{REP_LEGAL.nombre}</p>
              <p>{REP_LEGAL.cargo}</p>
              <p className="font-bold">{f.empleadora}</p>
            </div>

            {/* Recibido por el trabajador (se firma a mano al entregar) */}
            <div className="pt-4 text-[11px]">
              <p>Recibido por el/la trabajador(a):</p>
              <p>Nombre: _______________________________________</p>
              <p>C.C.: _________________________________________</p>
              <p>Firma: ________________________________________</p>
              <p>Fecha y hora: _________________________________</p>
              <p className="pt-1">Copia: Historia laboral</p>
            </div>

            {/* Pie de elaboración */}
            <div className="pt-4 text-[10px] space-y-0.5">
              <p>Elaboró: {f.elaboro}</p>
              <p>Revisó: {REVISO}</p>
            </div>

            <PieMembrete />
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos de la comunicación</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman el encabezado y los párrafos. Escribe la cédula del trabajador y se traen su nombre y
                cargo de la ficha de personal. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />

              <Campo label="Cédula del trabajador" value={f.ccTrabajador} onChange={(v) => set('ccTrabajador', v)} onBlur={prellenar} />
              <Campo label="Nombre del trabajador" value={f.nombreTrabajador} onChange={(v) => set('nombreTrabajador', v)} />
              <Campo label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
              <Campo label="Saludo (Señor/Señora + apellido)" value={f.saludoApellido} onChange={(v) => set('saludoApellido', v)} />

              <Campo label="Tipo de contrato" value={f.tipoContrato} onChange={(v) => set('tipoContrato', v)} />
              <Campo label="Fecha del contrato" value={f.fechaContrato} onChange={(v) => set('fechaContrato', v)} />
              <Campo label="Cláusula del período de prueba (N.º)" value={f.clausulaNumero} onChange={(v) => set('clausulaNumero', v)} />
              <Campo label="Duración del período de prueba" value={f.duracionPrueba} onChange={(v) => set('duracionPrueba', v)} />
              <Campo label="Inicio del período de prueba" value={f.fechaInicioPrueba} onChange={(v) => set('fechaInicioPrueba', v)} />
              <Campo label="Fin del período de prueba" value={f.fechaFinPrueba} onChange={(v) => set('fechaFinPrueba', v)} />
              <Campo label="Fecha efectiva de la terminación" value={f.fechaEfectiva} onChange={(v) => set('fechaEfectiva', v)} />

              <Campo label="Elaboró (nombre - cargo)" value={f.elaboro} onChange={(v) => set('elaboro', v)} />

              <Campo label="Control · Contrato / fecha de inicio" value={f.contratoFechaInicio} onChange={(v) => set('contratoFechaInicio', v)} />
              <Campo label="Control · Período pactado" value={f.periodoPactado} onChange={(v) => set('periodoPactado', v)} />
              <Campo label="Control · Validación previa" value={f.validacionPrevia} onChange={(v) => set('validacionPrevia', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta comunicación. Puedes consultarla e imprimirla.
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
