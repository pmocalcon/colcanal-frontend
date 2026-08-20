import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { FORMATO_VACACIONES } from '@/config/formatosGestion';

/**
 * Solicitud de Vacaciones · formato GTH-018-F (G. de talento humano).
 *
 * Formulario impreso. Las fechas van partidas en casillas de día, mes y año —así está el
 * papel— y por eso se guardan igual, no como una cadena: el formato tiene una casilla por
 * pedazo y quien lo diligencia escribe en cada una.
 *
 * Ruta: `.../talento-humano/vacaciones/:id`.
 */

/** Fecha del formato: una casilla por pedazo. */
interface Fecha { dia: string; mes: string; anio: string }
/** El periodo causado se pide sin día: solo mes y año. */
interface MesAnio { mes: string; anio: string }

const FECHA_VACIA: Fecha = { dia: '', mes: '', anio: '' };
const MES_ANIO_VACIO: MesAnio = { mes: '', anio: '' };

type TipoDocumento = 'TI' | 'CC' | '';

interface VacacionesState {
  fechaSolicitud: Fecha;

  // Datos personales
  nombres: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  cargo: string;
  areaCargo: string;
  fechaIngreso: Fecha;

  // Periodo causado que se solicita
  periodoDe: MesAnio;
  periodoA: MesAnio;
  /** «06/2024 a 05/2025», armado al guardar: es lo que muestra el listado. */
  periodoResumen: string;

  // Disfrute
  fechaInicio: Fecha;
  fechaFinal: Fecha;
  diasDisfrutar: string;
  diasCompensar: string;

  /*
   * ── Uso exclusivo de Recursos Humanos ──
   *
   * Las fechas y los días se repiten con los de arriba y **son campos aparte**, no una
   * copia: arriba está lo que el empleado pidió y acá lo que Recursos Humanos concede,
   * que puede no ser lo mismo. Derivarlos borraría del papel la diferencia entre lo
   * solicitado y lo aprobado, que es justo lo que este bloque deja constando.
   */
  rhNumeroSolicitud: string;
  rhFechaRecibido: Fecha;
  rhFechaInicio: Fecha;
  rhFechaFinal: Fecha;
  rhDiasDisfrutar: string;
  rhDiasCompensar: string;
  /** Los del periodo que no se disfrutan ni se compensan y quedan pendientes. */
  rhDiasPendientes: string;
  valorPrima: string;
  valorAnticipo: string;
  fechaPago: Fecha;
  fechaAprobacion: Fecha;
}

const EMPTY: VacacionesState = {
  fechaSolicitud: { ...FECHA_VACIA },
  nombres: '', tipoDocumento: '', documento: '',
  cargo: '', areaCargo: '',
  fechaIngreso: { ...FECHA_VACIA },
  periodoDe: { ...MES_ANIO_VACIO },
  periodoA: { ...MES_ANIO_VACIO },
  periodoResumen: '',
  fechaInicio: { ...FECHA_VACIA },
  fechaFinal: { ...FECHA_VACIA },
  diasDisfrutar: '', diasCompensar: '',
  rhNumeroSolicitud: '',
  rhFechaRecibido: { ...FECHA_VACIA },
  rhFechaInicio: { ...FECHA_VACIA },
  rhFechaFinal: { ...FECHA_VACIA },
  rhDiasDisfrutar: '', rhDiasCompensar: '', rhDiasPendientes: '',
  valorPrima: '', valorAnticipo: '',
  fechaPago: { ...FECHA_VACIA },
  fechaAprobacion: { ...FECHA_VACIA },
};

/** Los campos que son una fecha de tres casillas. */
type CampoFecha =
  | 'fechaSolicitud' | 'fechaIngreso' | 'fechaInicio' | 'fechaFinal'
  | 'rhFechaRecibido' | 'rhFechaInicio' | 'rhFechaFinal' | 'fechaPago' | 'fechaAprobacion';

export default function SolicitudVacacionesPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<VacacionesState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof VacacionesState>(k: K, v: VacacionesState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /** Cambia una casilla de una fecha sin tocar las otras dos. */
  const setFecha = (k: CampoFecha, parte: keyof Fecha, v: string) =>
    setF((p) => ({ ...p, [k]: { ...p[k], [parte]: v } }));

  const setPeriodo = (k: 'periodoDe' | 'periodoA', parte: keyof MesAnio, v: string) =>
    setF((p) => ({ ...p, [k]: { ...p[k], [parte]: v } }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<VacacionesState>;
        // Las fechas se rellenan una por una: una solicitud guardada antes de que
        // existiera un campo dejaría su objeto en `undefined` y el input reventaría.
        setF({
          ...EMPTY,
          ...saved,
          fechaSolicitud: { ...FECHA_VACIA, ...saved.fechaSolicitud },
          fechaIngreso: { ...FECHA_VACIA, ...saved.fechaIngreso },
          fechaInicio: { ...FECHA_VACIA, ...saved.fechaInicio },
          fechaFinal: { ...FECHA_VACIA, ...saved.fechaFinal },
          rhFechaRecibido: { ...FECHA_VACIA, ...saved.rhFechaRecibido },
          rhFechaInicio: { ...FECHA_VACIA, ...saved.rhFechaInicio },
          rhFechaFinal: { ...FECHA_VACIA, ...saved.rhFechaFinal },
          fechaPago: { ...FECHA_VACIA, ...saved.fechaPago },
          fechaAprobacion: { ...FECHA_VACIA, ...saved.fechaAprobacion },
          periodoDe: { ...MES_ANIO_VACIO, ...saved.periodoDe },
          periodoA: { ...MES_ANIO_VACIO, ...saved.periodoA },
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // El resumen se arma acá y no en el listado: el listado lee `data` en crudo y no
      // tiene por qué saber que el periodo son cuatro casillas.
      const lado = (p: MesAnio) => [p.mes, p.anio].filter(Boolean).join('/');
      const periodoResumen = [lado(f.periodoDe), lado(f.periodoA)].filter(Boolean).join(' a ');
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'talento-humano',
        formato: FORMATO_VACACIONES,
        data: { ...f, periodoResumen },
      });
      setF((p) => ({ ...p, periodoResumen }));
      toast.success('Solicitud guardada');
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda solicitud.
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/vacaciones/${guardada.solicitudId}`,
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
          .doc { box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/vacaciones')} title="Volver a las solicitudes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Solicitud de vacaciones</h1>
            <p className="text-xs text-[#4a4a63]">
              Formato GTH-018-F ·{' '}
              {docId === null ? 'Sin guardar' : `Solicitud N.º ${docId}`}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="doc bg-white text-[11px] text-black shadow-md p-4 space-y-3">

          {/* Encabezado del formato */}
          <div className="grid grid-cols-[110px_1fr_110px_150px] border border-black">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[12px] tracking-wide border-r border-black text-[#4a4a63]">
              SOLICITUD DE VACACIONES
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[10px] content-start">
              <Meta label="Código:" value="GTH-018-F" />
              <Meta label="Fecha:" value="20/08/2026" />
              <Meta label="Versión:" value="2" last />
            </div>
          </div>

          {/* Fecha de solicitud, alineada a la derecha como en el papel */}
          <div className="flex justify-end">
            <table className="border-collapse text-center">
              <tbody>
                <tr>
                  <td colSpan={3} className="border border-black px-3 py-0.5 font-bold">FECHA DE SOLICITUD</td>
                </tr>
                <tr className="font-bold">
                  <td className="border border-black px-3 py-0.5">DÍA</td>
                  <td className="border border-black px-3 py-0.5">MES</td>
                  <td className="border border-black px-3 py-0.5">AÑO</td>
                </tr>
                <tr>
                  {(['dia', 'mes', 'anio'] as const).map((parte) => (
                    <td key={parte} className="border border-black p-0">
                      <input
                        value={f.fechaSolicitud[parte]}
                        onChange={(e) => setFecha('fechaSolicitud', parte, e.target.value)}
                        className="w-14 bg-transparent outline-none text-center text-[11px] py-0.5"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="font-bold text-[13px] pl-6 pt-1">DATOS PERSONALES</h2>

          {/* Cada recuadro del formato es una tarjeta con su rótulo arriba. */}
          <div className="grid grid-cols-2 gap-3">
            <Recuadro rotulo="NOMBRES Y APELLIDOS">
              <input
                value={f.nombres}
                onChange={(e) => set('nombres', e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="DOCUMENTO DE IDENTIDAD" extra={
              <div className="flex items-center gap-3">
                {(['TI', 'CC'] as const).map((t) => (
                  <label key={t} className="inline-flex items-center gap-1.5 cursor-pointer font-normal">
                    <span>{t === 'CC' ? 'cc' : t}</span>
                    <input
                      type="checkbox"
                      checked={f.tipoDocumento === t}
                      onChange={() => set('tipoDocumento', f.tipoDocumento === t ? '' : t)}
                      className="w-3.5 h-3.5 accent-black"
                    />
                  </label>
                ))}
              </div>
            }>
              <input
                value={f.documento}
                onChange={(e) => set('documento', e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="DENOMINACIÓN DEL CARGO">
              <input
                value={f.cargo}
                onChange={(e) => set('cargo', e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="ÁREA DEL CARGO">
              <input
                value={f.areaCargo}
                onChange={(e) => set('areaCargo', e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="FECHA DE INGRESO A LA EMPRESA">
              <CasillasFecha valor={f.fechaIngreso} onChange={(p, v) => setFecha('fechaIngreso', p, v)} />
            </Recuadro>

            <Recuadro rotulo="PERIODO DE VACACIONES SOLICITADO">
              <div className="flex flex-wrap items-center gap-3">
                <CasillasMesAnio prefijo="DE:" valor={f.periodoDe} onChange={(p, v) => setPeriodo('periodoDe', p, v)} />
                <CasillasMesAnio prefijo="A:" valor={f.periodoA} onChange={(p, v) => setPeriodo('periodoA', p, v)} />
              </div>
            </Recuadro>

            <Recuadro rotulo="FECHA INICIO PERIODO DE VACACIONES">
              <CasillasFecha valor={f.fechaInicio} onChange={(p, v) => setFecha('fechaInicio', p, v)} />
            </Recuadro>

            <Recuadro rotulo="FECHA FINAL PERIODO DE VACACIONES">
              <CasillasFecha valor={f.fechaFinal} onChange={(p, v) => setFecha('fechaFinal', p, v)} />
            </Recuadro>

            <Recuadro rotulo="DÍAS A DISFRUTAR">
              <input
                value={f.diasDisfrutar}
                onChange={(e) => set('diasDisfrutar', e.target.value)}
                className="w-14 border border-black bg-transparent outline-none text-center text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="DÍAS A COMPENSAR">
              <input
                value={f.diasCompensar}
                onChange={(e) => set('diasCompensar', e.target.value)}
                className="w-14 border border-black bg-transparent outline-none text-center text-[11px]"
              />
            </Recuadro>
          </div>

          {/* ── Uso exclusivo de Recursos Humanos ── */}
          <h2 className="font-bold text-[13px] text-center pt-3">USO EXCLUSIVO ÁREA RECURSOS HUMANOS</h2>

          <div className="grid grid-cols-2 gap-3">
            <Recuadro rotulo="NÚMERO DE SOLICITUD">
              <input
                value={f.rhNumeroSolicitud}
                onChange={(e) => set('rhNumeroSolicitud', e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </Recuadro>

            <Recuadro rotulo="FECHA RECIBIDO SOLICITUD">
              <CasillasFecha valor={f.rhFechaRecibido} onChange={(p, v) => setFecha('rhFechaRecibido', p, v)} />
            </Recuadro>

            <Recuadro rotulo="FECHA INICIO PERIODO DE VACACIONES">
              <CasillasFecha valor={f.rhFechaInicio} onChange={(p, v) => setFecha('rhFechaInicio', p, v)} />
            </Recuadro>

            <Recuadro rotulo="FECHA FINAL PERIODO DE VACACIONES">
              <CasillasFecha valor={f.rhFechaFinal} onChange={(p, v) => setFecha('rhFechaFinal', p, v)} />
            </Recuadro>
          </div>

          {/* Días concedidos y el remanente del periodo, en una sola franja */}
          <div className="grid grid-cols-[auto_1fr] gap-3 items-center border border-black rounded px-2 py-1">
            <div className="flex items-center gap-3 font-bold">
              <span className="inline-flex items-center gap-1.5">
                DIAS A DISFRUTAR
                <input
                  value={f.rhDiasDisfrutar}
                  onChange={(e) => set('rhDiasDisfrutar', e.target.value)}
                  className="w-12 border border-black bg-transparent outline-none text-center text-[11px] font-normal"
                />
              </span>
              <span className="inline-flex items-center gap-1.5">
                DIAS A COMPENSAR
                <input
                  value={f.rhDiasCompensar}
                  onChange={(e) => set('rhDiasCompensar', e.target.value)}
                  className="w-12 border border-black bg-transparent outline-none text-center text-[11px] font-normal"
                />
              </span>
            </div>
            <p className="text-[10px] text-justify leading-snug">
              En caso de no solicitar compensación y tampoco todo el periodo para disfrute, quedan
              pendientes del periodo{' '}
              <input
                value={f.rhDiasPendientes}
                onChange={(e) => set('rhDiasPendientes', e.target.value)}
                className="w-10 border-b border-black bg-transparent outline-none text-center text-[10px]"
              />{' '}
              días.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Recuadro rotulo="VALOR PRIMA VACACIONES">
              <span className="inline-flex items-baseline gap-1 w-full">
                $
                <input
                  value={f.valorPrima}
                  onChange={(e) => set('valorPrima', e.target.value)}
                  className="flex-grow min-w-0 bg-transparent outline-none text-[11px]"
                />
              </span>
            </Recuadro>

            <Recuadro rotulo="VALOR ANTICIPO NÓMINA POR VACACIONES">
              <span className="inline-flex items-baseline gap-1 w-full">
                $
                <input
                  value={f.valorAnticipo}
                  onChange={(e) => set('valorAnticipo', e.target.value)}
                  className="flex-grow min-w-0 bg-transparent outline-none text-[11px]"
                />
              </span>
            </Recuadro>

            <Recuadro rotulo="FECHA DE PAGO">
              <CasillasFecha valor={f.fechaPago} onChange={(p, v) => setFecha('fechaPago', p, v)} />
            </Recuadro>

            <div className="border border-black rounded px-2 py-1">
              <p className="font-bold text-center text-[9px]">IMPORTANTE</p>
              <p className="text-[8.5px] text-justify leading-snug">
                Los empleados no podrán ausentarse de sus labores a disfrutar de sus vacaciones sin
                que el Gerente haya firmado la aprobación de éstas. Copia de este formato debe
                quedar en la historia laboral del funcionario.
              </p>
            </div>
          </div>

          {/* ── Aprobación ── */}
          <h2 className="font-bold text-[13px] text-center pt-3">APROBACIÓN</h2>

          {/* Las cuatro firmas van a mano sobre el impreso. */}
          <div className="grid grid-cols-3 gap-3">
            <Firma rotulo="FIRMA" />
            <Firma rotulo="Vo.Bo. JEFE INMEDIATO" subrayado />
            <Firma rotulo="Vo.Bo. TALENTO HUMANO" subrayado />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Recuadro rotulo="FECHA APROBACIÓN VACACIONES">
              <CasillasFecha valor={f.fechaAprobacion} onChange={(p, v) => setFecha('fechaAprobacion', p, v)} />
            </Recuadro>
            <div className="px-2 pt-6 text-center">
              <div className="mx-auto w-52 border-b border-black h-4" />
              <p className="font-bold mt-1">APRUEBA GERENCIA</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] ' + (last ? '' : 'border-b border-black')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-black ' + (last ? '' : 'border-b border-black')}>{value}</div>
    </>
  );
}

/** Recuadro del formato: rótulo arriba y el espacio para escribir debajo. */
function Recuadro({ rotulo, children, extra }: {
  rotulo: string; children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div className="border border-black rounded px-2 py-1">
      <div className="flex items-center justify-between gap-2 font-bold">
        <span>{rotulo}</span>
        {extra}
      </div>
      <div className="mt-1 min-h-[1.25rem]">{children}</div>
    </div>
  );
}

/** Recuadro de firma: el espacio se firma a mano sobre el impreso. */
function Firma({ rotulo, subrayado }: { rotulo: string; subrayado?: boolean }) {
  return (
    <div className="border border-black rounded px-2 pt-8 pb-2 text-center">
      <div className="mx-auto w-full max-w-[10rem] border-b border-black h-4" />
      <p className={'font-bold mt-1 text-[10px] ' + (subrayado ? 'underline' : '')}>{rotulo}</p>
    </div>
  );
}

/** DIA · MES · AÑO, cada uno en su casilla, como está impreso. */
function CasillasFecha({ valor, onChange }: {
  valor: Fecha; onChange: (parte: keyof Fecha, v: string) => void;
}) {
  const partes: { key: keyof Fecha; label: string }[] = [
    { key: 'dia', label: 'DIA' },
    { key: 'mes', label: 'MES' },
    { key: 'anio', label: 'AÑO' },
  ];
  return (
    <div className="flex items-center gap-2">
      {partes.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className="font-semibold text-[10px]">{label}</span>
          <input
            value={valor[key]}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-10 border border-black bg-transparent outline-none text-center text-[11px]"
          />
        </span>
      ))}
    </div>
  );
}

/** MES · AÑO con su prefijo («DE:» / «A:»). El periodo causado no lleva día. */
function CasillasMesAnio({ prefijo, valor, onChange }: {
  prefijo: string; valor: MesAnio; onChange: (parte: keyof MesAnio, v: string) => void;
}) {
  const partes: { key: keyof MesAnio; label: string }[] = [
    { key: 'mes', label: 'MES' },
    { key: 'anio', label: 'AÑO' },
  ];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold text-[10px]">{prefijo}</span>
      {partes.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className="font-semibold text-[10px]">{label}</span>
          <input
            value={valor[key]}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-10 border border-black bg-transparent outline-none text-center text-[11px]"
          />
        </span>
      ))}
    </span>
  );
}
