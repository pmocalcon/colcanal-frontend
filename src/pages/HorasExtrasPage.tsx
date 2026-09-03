import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Clock, History, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvisoAnulacion, BotonesAnulacion } from '@/components/gestionConocimiento/Anulacion';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { FORMATO_HORAS_EXTRAS } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';
import {
  type HorasExtrasEstado,
  type HorasExtrasTransicion,
  accionesDisponibles,
  calcularSla,
  estadoLabel,
  estadoBadgeClass,
  HORAS_EXTRAS_ESTADOS,
  esTerminal,
  esEditable,
} from '@/utils/horasExtrasWorkflow';
import { textoSla } from '@/utils/juridicaWorkflow';

/**
 * Horas Extras Personal · formato GTH-011-F (G. de talento humano).
 *
 * La planilla **registra horas**, igual que el papel oficial: por día y por tipo (diurna,
 * recargo nocturno, nocturna, diurna festiva, nocturna festiva), con el recargo de cada
 * tipo impreso en el encabezado. La columna de horas laboradas se calcula (la suma de los
 * cinco tipos); el resto —proyecto, horarios, labor, firma— se escribe.
 *
 * **No se liquida en el formato**: no lleva valor hora ni columna de dinero. El pago lo
 * calcula la nómina al liquidar, con el salario que la ficha de Personal tiene para la
 * cédula ÷ 210 por los factores de cada tipo (ver `gestion-conocimiento.service`,
 * `DIVISOR_HORA_EXTRA`).
 *
 * Va apaisado: la tabla tiene dieciséis columnas y en vertical no cabe.
 *
 * Pasa por cuatro manos antes de llegar a nómina: la llena el PQRS, la revisa el
 * Director de Proyecto que lo tiene a cargo, la valida Dirección Técnica y la aprueba
 * Gerencia de Proyectos. Fuera del borrador queda de solo lectura, para que lo que se
 * avaló sea lo que se paga.
 *
 * @see horasExtrasWorkflow — la máquina de estados, espejo de la del backend.
 *
 * Ruta: `.../talento-humano/horas-extras/:id`.
 */

/** Los tipos de hora extra con su recargo, tal como están impresos en el encabezado. */
const TIPOS_HORA = [
  { key: 'diurna', label: 'HED', factor: 1.25 },
  { key: 'recargoNocturno', label: 'RN', factor: 0.35 },
  { key: 'nocturna', label: 'HEN', factor: 1.75 },
  { key: 'diurnaFestiva', label: 'HDDYF', factor: 2.15 },
  { key: 'nocturnaFestiva', label: 'HNDYF', factor: 2.65 },
] as const;

type TipoHora = typeof TIPOS_HORA[number]['key'];

/** Los meses, capitalizados como los espera el periodo («Julio 2026»). */
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

interface Fila {
  proyecto: string;
  region: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  almuerzo: string;
  /** Horas por tipo. Se guardan como texto: es lo que se teclea. */
  horas: Record<string, string>;
  codigoLabor: string;
  labor: string;
}

interface HorasExtrasState {
  nombre: string;
  cedula: string;
  mes: string;
  anio: string;
  cargo: string;
  ciudad: string;
  /**
   * «Mes Año», derivado de `mes` + `anio` al guardar. La nómina lo usa para ubicar el
   * periodo de la planilla; por eso se conserva aunque el formato ya no lo pida suelto.
   */
  periodo: string;
  /**
   * Texto libre del recuadro OBSERVACIONES. Nace en blanco: la autorización marco del
   * 14/02/2023 valía para el mantenimiento de Antioquia, no para toda planilla, así que
   * quien reporta escribe la que corresponde a estas horas.
   */
  observaciones: string;
  filas: Fila[];
}

const filaVacia = (): Fila => ({
  proyecto: '', region: '', fecha: '', horaEntrada: '', horaSalida: '', almuerzo: '',
  horas: {}, codigoLabor: '', labor: '',
});

const EMPTY: HorasExtrasState = {
  nombre: '', cedula: '', mes: '', anio: '', cargo: '', ciudad: '', periodo: '', observaciones: '',
  // La planilla nace con renglones en blanco, como el impreso: se llena de arriba abajo
  // sin tener que pulsar «Agregar» en cada línea.
  filas: Array.from({ length: 12 }, filaVacia),
};

/**
 * Texto → número. Acepta la coma decimal, que es como se escribe acá, y descarta lo que
 * no sea número para que un «2 h» no valga cero sin avisar.
 */
const num = (v: string | undefined): number => {
  const limpio = String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
};

/**
 * El estado de la pantalla a partir de la fila guardada. Los renglones en blanco no se
 * guardan, así que al abrir una planilla vacía se repone la hoja de doce para poder
 * escribir sin pulsar «Agregar» en cada línea.
 */
const desde = (row: GcSolicitud): HorasExtrasState => {
  const saved = (row.data ?? {}) as Partial<HorasExtrasState>;
  // Planillas viejas guardaban solo `periodo` («Julio 2026»); se parte en mes y año para
  // que el formato nuevo los muestre en sus dos casillas.
  let mes = saved.mes ?? '';
  let anio = saved.anio ?? '';
  if ((!mes || !anio) && saved.periodo) {
    const partes = saved.periodo.trim().split(/\s+/);
    anio = anio || (partes.length > 1 ? partes[partes.length - 1] : '');
    mes = mes || (partes.length > 1 ? partes.slice(0, -1).join(' ') : partes[0] ?? '');
  }
  return {
    ...EMPTY,
    ...saved,
    mes,
    anio,
    filas: saved.filas?.length ? saved.filas.map((x) => ({ ...filaVacia(), ...x })) : EMPTY.filas,
  };
};

/** Horas extras laboradas: la suma de los cinco tipos, sin recargo. */
const horasDe = (f: Fila) => TIPOS_HORA.reduce((s, t) => s + num(f.horas[t.key]), 0);

export default function HorasExtrasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<HorasExtrasState>(EMPTY);
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const estado = (sol?.estado as HorasExtrasEstado | undefined) ?? undefined;
  const locked = !esEditable(estado ?? null);
  const esCreador = sol?.createdBy != null && sol.createdBy === user?.userId;

  const set = <K extends keyof HorasExtrasState>(k: K, v: HorasExtrasState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /**
   * Ajusta el formato al ancho disponible. No se calcula contra un número fijo: se mide
   * lo que el documento pide de verdad (`scrollWidth` con el zoom en 1) y se divide por
   * lo que hay, así el día que se agregue o se quite una columna sigue cuadrando solo.
   * Nunca agranda: por encima de su tamaño el formato se ve borroso y desalineado.
   */
  const docRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const doc = docRef.current;
    const caja = doc?.parentElement;
    if (!caja || !doc) return;
    const ajustar = () => {
      doc.style.zoom = '1';
      const necesario = doc.scrollWidth;
      const disponible = caja.clientWidth;
      if (necesario > disponible && disponible > 0) doc.style.zoom = String(disponible / necesario);
    };
    ajustar();
    // Se observa la caja, no el documento: el documento cambia de tamaño al aplicarle el
    // zoom y observarlo daría un lazo infinito.
    const ro = new ResizeObserver(ajustar);
    ro.observe(caja);
    return () => ro.disconnect();
  }, [loading]);

  /**
   * Con la cédula llegan el nombre y el cargo de la ficha de personal. Se dispara al salir
   * de la casilla —no en cada tecla— y solo llena lo que está en blanco, para no pisar lo
   * que alguien acabe de escribir. La cédula se normaliza a solo dígitos: la ficha, la
   * aprobación (valor hora) y la nómina cruzan por el número, no por «CC 123».
   */
  const prellenar = async () => {
    if (locked) return;
    const cedula = f.cedula.replace(/\D/g, '');
    if (cedula !== f.cedula) set('cedula', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    // Solo se llena lo que está en blanco: prellenar es ayudar, no corregir lo que alguien
    // ya escribió (la ficha puede estar desactualizada frente a lo que se sabe hoy).
    setF((p) => ({
      ...p,
      nombre: p.nombre.trim() ? p.nombre : nombreDeFicha(ficha),
      cargo: p.cargo.trim() ? p.cargo : (ficha.cargo ?? ''),
    }));
  };

  const setFila = <K extends keyof Fila>(i: number, k: K, v: Fila[K]) =>
    setF((p) => ({ ...p, filas: p.filas.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)) }));

  const setHora = (i: number, tipo: TipoHora, v: string) =>
    setF((p) => ({
      ...p,
      filas: p.filas.map((x, idx) => (idx === i ? { ...x, horas: { ...x.horas, [tipo]: v } } : x)),
    }));

  const agregarFila = () => setF((p) => ({ ...p, filas: [...p.filas, filaVacia()] }));
  const quitarFila = (i: number) =>
    setF((p) => ({ ...p, filas: p.filas.filter((_, idx) => idx !== i) }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        setSol(row);
        setF(desde(row));
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la planilla');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const recargar = async () => {
    if (docId === null) return;
    try {
      const row = await gestionConocimientoService.get(docId);
      setSol(row);
      setF(desde(row));
    } catch { /* si falla la recarga, la pantalla se queda con lo que ya tenía */ }
  };

  const handleTransicion = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    try {
      await gestionConocimientoService.transition(docId!, { accion, motivo });
      toast.success('Acción registrada');
      await recargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // No se guardan los renglones en blanco: la planilla nace con doce solo para poder
      // escribir sin pulsar «Agregar», y guardarlos llenaría la base de filas vacías.
      const filas = f.filas.filter((x) =>
        Object.values(x).some((v) => (typeof v === 'string' ? v.trim() !== '' : Object.values(v).some((h) => String(h).trim() !== ''))));
      // `periodo` («Mes Año») se arma de mes + año: es lo que la nómina lee para ubicar
      // la planilla en su mes.
      const periodo = `${(f.mes ?? '').trim()} ${(f.anio ?? '').trim()}`.trim();
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'talento-humano',
        formato: FORMATO_HORAS_EXTRAS,
        data: { ...f, periodo, filas },
      });
      setSol(guardada);
      toast.success('Planilla guardada');
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda planilla.
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/horas-extras/${guardada.solicitudId}`,
          { replace: true },
        );
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const totalHoras = f.filas.reduce((s, x) => s + horasDe(x), 0);

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
          @page { size: Letter landscape; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; }
          /* La letra subió a 12 px y con ella el ancho del formato (1330 px), pero la
             carta apaisada sigue midiendo lo mismo: ~995 px con márgenes de 8 mm. Sin
             esta reducción la tabla se parte en dos hojas, y no se deja al criterio del
             navegador: con la escala de impresión en 100 % nadie la ajusta por uno. */
          .doc { zoom: 0.73 !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/horas-extras')} title="Volver a las planillas">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Horas extras</h1>
            <p className="text-xs text-[#4a4a63]">
              Formato GTH-011-F · Planilla N.º {docId} · se imprime apaisado
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {/* Una vez enviada, la planilla es la que revisaron: no se reescribe. */}
          {!locked && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {sol && (
          <HorasExtrasWorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={esCreador}
            onAccion={handleTransicion}
          />
        )}

        {/* El formato mide lo que mide —1330 px de tabla— y la pantalla casi nunca los
            tiene. En vez de dejar una barra horizontal, que obliga a arrastrar para ver
            las últimas columnas y las firmas, se encoge hasta caber. `overflow-x-auto`
            se deja de red: si el navegador no entiende `zoom`, vuelve la barra en lugar
            de recortar el formato. */}
        <div ref={docRef} className="doc bg-white border border-black text-[12px] text-black shadow-md overflow-x-auto">

          {/* Encabezado del formato */}
          {/* Los anchos van con su logo, no con su posición: Canales necesita más
              caja que Alumbrado, así que al cambiarlos de lado se cambian los dos. */}
          <div className="grid grid-cols-[160px_1fr_130px_130px] border-b border-black min-w-[1330px]">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[16px] tracking-wide border-r border-black text-black">
              HORAS EXTRAS PERSONAL
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[12px] content-start">
              <Meta label="CÓDIGO:" value="GTH-011-F" />
              <Meta label="FECHA:" value="16/02/2026" />
              <Meta label="VERSIÓN:" value="4" last />
            </div>
          </div>

          <p className="px-2 py-1 text-center font-bold border-b border-black min-w-[1330px]">
            Horario de jornada laboral establecido:{' '}
            <span className="font-normal">
              De lunes a Viernes de 7:30 a.m. a 12 p.m. y de 1:30 p.m. a 4:30 p.m. Sábados de 8 a.m. a 12:30 p.m.
            </span>
          </p>

          {/* Datos del trabajador (campos del formato oficial). El valor hora ya no se
              teclea: la nómina lo calcula con el salario de la ficha ÷ 210. */}
          <div className="grid grid-cols-4 border-b border-black min-w-[1330px]">
            <Dato label="NOMBRE:" value={f.nombre} onChange={(v) => set('nombre', v)} readOnly={locked} />
            <Dato label="CEDULA:" value={f.cedula} onChange={(v) => set('cedula', v)} onBlur={prellenar} readOnly={locked} />
            <DatoSelect label="MES:" value={f.mes} onChange={(v) => set('mes', v)} opciones={MESES} readOnly={locked} />
            <Dato label="AÑO:" value={f.anio} onChange={(v) => set('anio', v)} readOnly={locked} last />
          </div>
          <div className="grid grid-cols-4 border-b border-black min-w-[1330px]">
            <Dato label="CARGO:" value={f.cargo} onChange={(v) => set('cargo', v)} readOnly={locked} />
            <div className="border-r border-black" />
            <div className="border-r border-black" />
            <Dato label="CIUDAD:" value={f.ciudad} onChange={(v) => set('ciudad', v)} readOnly={locked} last />
          </div>

          {/* Registro diario */}
          <table className="border-collapse w-full min-w-[1330px] text-[12px]">
            <thead>
              <tr className="bg-[hsl(var(--canalco-neutral-200))] font-bold text-center">
                <Th rowSpan={2}>PROYECTO</Th>
                <Th rowSpan={2}>REGIÓN</Th>
                <Th rowSpan={2}>FECHA</Th>
                <Th rowSpan={2}>HORA ENTRADA</Th>
                <Th rowSpan={2}>HORA DE SALIDA</Th>
                <Th rowSpan={2}>ALMUERZO / DESCANSO</Th>
                <Th colSpan={5}>HORAS EXTRAS</Th>
                <Th rowSpan={2}>HORAS EXTRAS LABORADAS</Th>
                <Th rowSpan={2}>CÓDIGO LABOR EJECUTADA</Th>
                <Th rowSpan={2}>LABOR EJECUTADA</Th>
                <Th rowSpan={2}>FIRMA DEL TRABAJADOR</Th>
                <th className="border-0 w-6 no-print" rowSpan={2}></th>
              </tr>
              <tr className="bg-[hsl(var(--canalco-neutral-200))] font-bold text-center">
                {TIPOS_HORA.map((t) => (
                  <th key={t.key} className="border border-black px-1 py-0.5 leading-tight">
                    {t.label}
                    <div className="font-normal">{t.factor.toString().replace('.', ',')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.filas.map((fila, i) => {
                const horas = horasDe(fila);
                return (
                  <tr key={i}>
                    <Td><Cel value={fila.proyecto} onChange={(v) => setFila(i, 'proyecto', v)} readOnly={locked} /></Td>
                    <Td><Cel value={fila.region} onChange={(v) => setFila(i, 'region', v)} readOnly={locked} /></Td>
                    <Td><Cel value={fila.fecha} onChange={(v) => setFila(i, 'fecha', v)} readOnly={locked} /></Td>
                    <Td><Cel value={fila.horaEntrada} onChange={(v) => setFila(i, 'horaEntrada', v)} readOnly={locked} centro /></Td>
                    <Td><Cel value={fila.horaSalida} onChange={(v) => setFila(i, 'horaSalida', v)} readOnly={locked} centro /></Td>
                    <Td><Cel value={fila.almuerzo} onChange={(v) => setFila(i, 'almuerzo', v)} readOnly={locked} centro /></Td>
                    {TIPOS_HORA.map((t) => (
                      <Td key={t.key}>
                        <Cel value={fila.horas[t.key] ?? ''} onChange={(v) => setHora(i, t.key, v)} readOnly={locked} centro />
                      </Td>
                    ))}
                    {/* Calculada: no se teclea. */}
                    <Td className="text-center font-semibold">{horas > 0 ? horas.toLocaleString('es-CO') : ''}</Td>
                    <Td><Cel value={fila.codigoLabor} onChange={(v) => setFila(i, 'codigoLabor', v)} readOnly={locked} centro /></Td>
                    <Td><Cel value={fila.labor} onChange={(v) => setFila(i, 'labor', v)} readOnly={locked} /></Td>
                    {/* La firma va a mano sobre el impreso. */}
                    <Td />
                    <td className="border-0 px-0.5 no-print align-middle">
                      {!locked && f.filas.length > 1 && (
                        <button type="button" onClick={() => quitarFila(i)} title="Quitar renglón"
                          className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Totales de horas por tipo, como el pie del impreso. */}
              <tr className="bg-[hsl(var(--canalco-neutral-100))] font-bold">
                <Td colSpan={6} className="text-right pr-2">TOTALES</Td>
                {TIPOS_HORA.map((t) => (
                  <Td key={t.key} className="text-center">
                    {(() => {
                      const s = f.filas.reduce((a, x) => a + num(x.horas[t.key]), 0);
                      return s > 0 ? s.toLocaleString('es-CO') : '';
                    })()}
                  </Td>
                ))}
                <Td className="text-center">{totalHoras > 0 ? totalHoras.toLocaleString('es-CO') : ''}</Td>
                <Td colSpan={3} />
                <td className="border-0 no-print" />
              </tr>
            </tbody>
          </table>

          {/* Observaciones: casilla en blanco, la escribe quien reporta. */}
          <div className="border-t border-black px-2 py-1.5 min-w-[1330px] leading-snug">
            <b>OBSERVACIONES:</b>{' '}
            <Observaciones value={f.observaciones} onChange={(v) => set('observaciones', v)} readOnly={locked} />
          </div>

          {/* Pie de firmas. Las tres últimas van fijas, como en la plantilla; la primera
              no puede ir fija porque la planilla la monta quien la monta —un PQRS, un
              Director de Proyecto— y el impreso debe decir quién la reportó y con qué
              cargo. El dato se estampa al crear la solicitud, así que la casilla queda
              en blanco solo mientras la planilla no se ha guardado. */}
          <div className="grid grid-cols-4 border-t border-black min-w-[1330px]">
            <Firma
              titulo="Reportado por:"
              nombre={String(sol?.data?.solicitadoNombre ?? '')}
              cargo={String(sol?.data?.solicitadoCargo ?? '') || 'Jefe inmediato'}
              fecha={sol?.createdAt}
            />
            {/* El nombre del que de verdad avaló le gana al de la plantilla: si el paso lo
                ejecutó otra persona —un encargo, un cambio de titular—, imprimir el nombre
                preimpreso al lado de una fecha real diría que firmó alguien que no firmó. */}
            <Firma
              titulo="Revisado por:"
              nombre={String(sol?.data?.revisadoTecnicaPor ?? '') || 'Andres Felipe Gomez Lopez'}
              cargo="Director Tecnico"
              fecha={sol?.data?.fechaRevisionTecnica}
            />
            <Firma
              titulo="Aprobado por:"
              nombre={String(sol?.data?.aprobadoGpPor ?? '') || 'Lorena Martinez Jurado'}
              cargo="Gerencia de Proyectos"
              fecha={sol?.data?.fechaAprobacionGp}
            />
            {/* Sin fecha: Dirección Administrativa recibe la planilla aprobada pero no
                ejecuta ningún paso de aprobación, así que no hay nada que constar. */}
            <Firma titulo="Control Administrativo:" nombre="Daniela Swann Torres" cargo="Dir. Administrativa y Financiera" last />
          </div>
        </div>

        <div className="no-print mt-3 flex items-center gap-3">
          {!locked && (
            <Button type="button" variant="outline" size="sm" onClick={agregarFila} className="h-8 text-[12px] gap-1.5">
              <Plus className="w-4 h-4" /> Agregar renglón
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Flujo de aprobación ────────────────────────────────── */

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Estado de la planilla, botones del paso que toca y bitácora. No se imprime: el papel
 * lleva las horas y las firmas, no el recorrido.
 */
function HorasExtrasWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const estado = sol.estado as HorasExtrasEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador, sol.accionesPendientes);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = esTerminal(estado);
  const d = sol.data ?? {};

  // Quién avaló qué, para que se vea sin abrir el historial.
  const avales: { label: string; quien?: string; fecha?: string }[] = [
    { label: 'Director de Proyecto', quien: d.revisadoPor, fecha: d.fechaRevision },
    { label: 'Dirección Técnica', quien: d.revisadoTecnicaPor, fecha: d.fechaRevisionTecnica },
    { label: 'Gerencia de Proyectos', quien: d.aprobadoGpPor, fecha: d.fechaAprobacionGp },
  ].filter((a) => a.quien);

  return (
    <div className="no-print mb-6 bg-white border border-[#e6e6f0] rounded-xl shadow-sm p-4 space-y-4">
      <AvisoAnulacion sol={sol} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[#4a4a63]">Estado de la planilla:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>
          {estadoLabel(estado)}
        </span>
        {sla && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {textoSla(sla)}
          </span>
        )}
        {HORAS_EXTRAS_ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[#8a8aa3]">sin plazo</span>
        )}
      </div>

      {avales.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#4a4a63]">
          {avales.map((a) => (
            <span key={a.label}>
              <b>{a.label}:</b> {a.quien}
              {a.fecha ? ` · ${a.fecha}` : ''}
            </span>
          ))}
        </div>
      )}

      {estado === 'aprobado' && (
        <p className="text-xs font-medium text-green-700">
          ✓ Planilla aprobada. Lista para liquidar en nómina.
          {acciones.length > 0 && (
            <span className="font-normal text-[#8a8aa3]">
              {' '}Si las horas no cuadran con lo que vas a liquidar, devuélvela al
              borrador indicando el motivo: se corrige y vuelve a recorrer la cadena.
            </span>
          )}
        </p>
      )}

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: HorasExtrasTransicion) => (
            <Button
              key={a.accion}
              onClick={() => onAccion(a.accion, a.requiereMotivo)}
              variant={a.tone === 'danger' ? 'outline' : 'default'}
              className={a.tone === 'danger'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {acciones.length === 0 && !terminal && (
        <p className="text-xs text-[#8a8aa3]">No tienes acciones disponibles en este estado.</p>
      )}

      {/* Anular no es un paso del trámite sino salirse de él, así que va separado
          de «Aprobar» y «Devolver». Quien la puede pedir es el solicitante o quien
          la tenga ahora en su bandeja; el backend lo vuelve a comprobar. */}
      <BotonesAnulacion
        estado={estado}
        nombreRol={nombreRol}
        puedeSolicitar={esCreador || acciones.length > 0}
        onAccion={onAccion}
      />

      {sol.historial && sol.historial.length > 0 && (
        <div className="pt-3 border-t border-[#e6e6f0]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8a8aa3] uppercase tracking-wide mb-2">
            <History className="w-3.5 h-3.5" /> Historial
          </p>
          <ul className="space-y-1.5">
            {[...sol.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[#4a4a63] flex flex-wrap gap-x-2">
                <span className="text-[#a8a8bd] font-mono">{fmtFechaHora(h.fecha)}</span>
                <span className="font-medium">{estadoLabel(h.estado)}</span>
                {h.userName && <span className="text-[#8a8aa3]">· {h.userName}</span>}
                {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-1.5 py-0.5 font-semibold ' + (last ? '' : 'border-b border-black')}>{label}</div>
      <div className={'px-1.5 py-0.5 text-center border-l border-black ' + (last ? '' : 'border-b border-black')}>{value}</div>
    </>
  );
}

/**
 * El recuadro de OBSERVACIONES. Crece con lo que se escribe en vez de dejar una barra de
 * desplazamiento: en pantalla se ve todo y, sobre todo, se imprime todo —un textarea con
 * scroll manda al papel solo la parte visible.
 */
function Observaciones({ value, onChange, readOnly }: {
  value: string; onChange: (v: string) => void; readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      rows={2}
      className="w-full bg-transparent outline-none resize-none overflow-hidden leading-snug align-top"
    />
  );
}

/** «2026-09-02» → «02/09/2026». Lo que no reconoce lo devuelve tal cual. */
const diaMesAnio = (v?: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? '');
};

/**
 * Una casilla del pie de firmas: título, espacio para firmar a mano, nombre y cargo.
 *
 * El renglón sigue en blanco a propósito —la planilla se firma de puño y letra—, y
 * debajo del cargo va la constancia de cuándo esa persona avaló el paso en el sistema.
 * Son dos cosas distintas y por eso conviven: la firma dice que la revisó, la fecha dice
 * cuándo quedó registrada. Sin fecha, la casilla se ve igual que antes: el paso todavía
 * no ha ocurrido y no hay nada que constar.
 */
function Firma({ titulo, nombre, cargo, fecha, last }: {
  titulo: string; nombre: string; cargo: string; fecha?: string | null; last?: boolean;
}) {
  return (
    <div className={'px-3 pt-2 pb-2.5 ' + (last ? '' : 'border-r border-black')}>
      <div className="font-semibold">{titulo}</div>
      {/* Hueco para firmar a mano. Va sin renglón impreso: la firma se lee sola encima
          del nombre. La altura es fija —no `mt-auto`— para que los cuatro nombres queden
          a la misma altura aunque unas casillas lleven fecha y otras no, y quedó en 24 px
          para que el bloque no se hunda contra el borde de abajo: el aire de arriba y el
          de abajo se parecen y la firma se lee en el medio de la casilla. */}
      <div className="h-6" aria-hidden />
      {/* Las tres líneas son un solo bloque, centrado bajo el espacio de la firma y leído
          de mayor a menor: quién firma, con qué cargo, y cuándo lo registró el sistema.
          El tamaño hace la jerarquía —12, 11 y 10— para no meter un tercer color en un
          formato que se imprime. El título se queda a la izquierda: es el rótulo de la
          casilla, no parte de la firma. */}
      <div className="text-center">
        <div className="font-semibold leading-tight min-h-[1em]">{nombre}</div>
        <div className="text-[11px] leading-tight text-[hsl(var(--canalco-neutral-600))]">{cargo}</div>
        {fecha ? (
          <div className="mt-0.5 text-[10px] leading-tight text-[hsl(var(--canalco-neutral-600))]">
            Registrado en el sistema el {diaMesAnio(fecha)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Como `Dato`, pero con un desplegable de opciones (p. ej. el mes). */
function DatoSelect({ label, value, onChange, opciones, last, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; opciones: readonly string[]; last?: boolean; readOnly?: boolean;
}) {
  return (
    <div className={'px-1.5 py-0.5 flex items-baseline gap-1 ' + (last ? '' : 'border-r border-black')}>
      <span className="font-bold whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className="flex-grow min-w-0 bg-transparent outline-none text-[12px]"
      >
        <option value="" />
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Dato({ label, value, onChange, onBlur, last, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; last?: boolean; readOnly?: boolean;
}) {
  return (
    <div className={'px-1.5 py-0.5 flex items-baseline gap-1 ' + (last ? '' : 'border-r border-black')}>
      <span className="font-bold whitespace-nowrap">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        readOnly={readOnly}
        className="flex-grow min-w-0 bg-transparent outline-none text-[12px]"
      />
    </div>
  );
}

function Th({ children, rowSpan, colSpan }: {
  children?: React.ReactNode; rowSpan?: number; colSpan?: number;
}) {
  return (
    <th rowSpan={rowSpan} colSpan={colSpan} className="border border-black px-1 py-0.5 leading-tight align-middle">
      {children}
    </th>
  );
}

function Td({ children, className, colSpan }: {
  children?: React.ReactNode; className?: string; colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={'border border-black px-0.5 py-0.5 h-6 ' + (className ?? '')}>
      {children}
    </td>
  );
}

function Cel({ value, onChange, centro, readOnly }: {
  value: string; onChange: (v: string) => void; centro?: boolean; readOnly?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      className={'w-full bg-transparent outline-none text-[12px] ' + (centro ? 'text-center' : '')}
    />
  );
}
