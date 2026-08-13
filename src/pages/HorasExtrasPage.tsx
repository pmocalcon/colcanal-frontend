import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';

/**
 * Horas Extras Personal · formato GTH-016-F (G. de talento humano).
 *
 * A diferencia de los demás formatos de la gestión, este no solo se diligencia: **se
 * liquida**. Las horas se registran por día y por tipo, cada tipo tiene su recargo impreso
 * en el encabezado, y de ahí salen las horas laboradas y la liquidación proyectada.
 *
 * Esas dos columnas se calculan y no se teclean: son el producto de lo que ya está en la
 * fila, y a mano son cinco multiplicaciones por renglón. El resto —proyecto, horarios,
 * labor, firma— sí se escribe.
 *
 * Va apaisado: la tabla tiene dieciséis columnas y en vertical no cabe.
 *
 * Ruta: `.../talento-humano/horas-extras/:id`.
 */

/** Los tipos de hora extra con su recargo, tal como están impresos en el encabezado. */
const TIPOS_HORA = [
  { key: 'diurna', label: 'DIURNA', factor: 1.25 },
  { key: 'recargoNocturno', label: 'RECARGO NOCTURNA', factor: 0.35 },
  { key: 'nocturna', label: 'NOCTURNA', factor: 1.75 },
  { key: 'diurnaFestiva', label: 'DIURNA FESTIVA', factor: 2 },
  { key: 'nocturnaFestiva', label: 'NOCTURNA FESTIVA', factor: 2.5 },
] as const;

type TipoHora = typeof TIPOS_HORA[number]['key'];

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
  salario: string;
  periodo: string;
  cargo: string;
  valorHora: string;
  filas: Fila[];
}

const filaVacia = (): Fila => ({
  proyecto: '', region: '', fecha: '', horaEntrada: '', horaSalida: '', almuerzo: '',
  horas: {}, codigoLabor: '', labor: '',
});

const EMPTY: HorasExtrasState = {
  nombre: '', cedula: '', salario: '', periodo: '', cargo: '', valorHora: '',
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

const cop = (n: number) =>
  n > 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '';

/** Horas extras laboradas: la suma de los cinco tipos, sin recargo. */
const horasDe = (f: Fila) => TIPOS_HORA.reduce((s, t) => s + num(f.horas[t.key]), 0);

/** Liquidación proyectada: cada tipo por su recargo, todo por el valor de la hora. */
const liquidacionDe = (f: Fila, valorHora: number) =>
  valorHora * TIPOS_HORA.reduce((s, t) => s + num(f.horas[t.key]) * t.factor, 0);

export default function HorasExtrasPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<HorasExtrasState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof HorasExtrasState>(k: K, v: HorasExtrasState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

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
        const saved = (row.data ?? {}) as Partial<HorasExtrasState>;
        setF({
          ...EMPTY,
          ...saved,
          filas: saved.filas?.length ? saved.filas.map((x) => ({ ...filaVacia(), ...x })) : EMPTY.filas,
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la planilla');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const handleSave = async () => {
    if (docId === null) return;
    setSaving(true);
    try {
      // No se guardan los renglones en blanco: la planilla nace con doce solo para poder
      // escribir sin pulsar «Agregar», y guardarlos llenaría la base de filas vacías.
      const filas = f.filas.filter((x) =>
        Object.values(x).some((v) => (typeof v === 'string' ? v.trim() !== '' : Object.values(v).some((h) => String(h).trim() !== ''))));
      await gestionConocimientoService.update(docId, { data: { ...f, filas } });
      toast.success('Planilla guardada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const valorHora = num(f.valorHora);
  const totalHoras = f.filas.reduce((s, x) => s + horasDe(x), 0);
  const totalLiquidacion = f.filas.reduce((s, x) => s + liquidacionDe(x, valorHora), 0);

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
              Formato GTH-016-F · Planilla N.º {docId} · se imprime apaisado
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

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="doc bg-white border border-black text-[9px] text-black shadow-md overflow-x-auto">

          {/* Encabezado del formato */}
          <div className="grid grid-cols-[130px_1fr_160px_130px] border-b border-black min-w-[1000px]">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] tracking-wide border-r border-black text-[#7b1c2b]">
              HORAS EXTRAS PERSONAL
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[9px] content-start">
              <Meta label="CÓDIGO:" value="GTH-016-F" />
              <Meta label="FECHA:" value="16/02/2026" />
              <Meta label="VERSIÓN:" value="4" last />
            </div>
          </div>

          <p className="px-2 py-1 text-center font-bold border-b border-black min-w-[1000px]">
            Horario de jornada laboral establecido:{' '}
            <span className="font-normal">
              De lunes a Viernes de 7 a.m. a 12 p.m. y de 1:30 p.m. a 4:30 p.m. Sábados de 8 a.m. a 12:00 p.m.
            </span>
          </p>

          {/* Datos del trabajador */}
          <div className="grid grid-cols-4 border-b border-black min-w-[1000px]">
            <Dato label="NOMBRE:" value={f.nombre} onChange={(v) => set('nombre', v)} />
            <Dato label="CEDULA:" value={f.cedula} onChange={(v) => set('cedula', v)} />
            <Dato label="SALARIO: $" value={f.salario} onChange={(v) => set('salario', v)} />
            <Dato label="PERIODO" value={f.periodo} onChange={(v) => set('periodo', v)} last />
          </div>
          <div className="grid grid-cols-4 border-b border-black min-w-[1000px]">
            <Dato label="CARGO:" value={f.cargo} onChange={(v) => set('cargo', v)} />
            <div className="border-r border-black" />
            <div className="border-r border-black" />
            <Dato label="VALOR HORA: $" value={f.valorHora} onChange={(v) => set('valorHora', v)} last />
          </div>

          {/* Registro diario */}
          <table className="border-collapse w-full min-w-[1000px] text-[9px]">
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
                <Th rowSpan={2}>LIQUIDACIÓN PROYECTADA</Th>
                <Th rowSpan={2}>CODIGO LABOR EJECUTADA</Th>
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
                const liq = liquidacionDe(fila, valorHora);
                return (
                  <tr key={i}>
                    <Td><Cel value={fila.proyecto} onChange={(v) => setFila(i, 'proyecto', v)} /></Td>
                    <Td><Cel value={fila.region} onChange={(v) => setFila(i, 'region', v)} /></Td>
                    <Td><Cel value={fila.fecha} onChange={(v) => setFila(i, 'fecha', v)} /></Td>
                    <Td><Cel value={fila.horaEntrada} onChange={(v) => setFila(i, 'horaEntrada', v)} centro /></Td>
                    <Td><Cel value={fila.horaSalida} onChange={(v) => setFila(i, 'horaSalida', v)} centro /></Td>
                    <Td><Cel value={fila.almuerzo} onChange={(v) => setFila(i, 'almuerzo', v)} centro /></Td>
                    {TIPOS_HORA.map((t) => (
                      <Td key={t.key}>
                        <Cel value={fila.horas[t.key] ?? ''} onChange={(v) => setHora(i, t.key, v)} centro />
                      </Td>
                    ))}
                    {/* Calculadas: no se teclean. */}
                    <Td className="text-center font-semibold">{horas > 0 ? horas.toLocaleString('es-CO') : ''}</Td>
                    <Td className="text-right font-semibold whitespace-nowrap">{cop(liq)}</Td>
                    <Td><Cel value={fila.codigoLabor} onChange={(v) => setFila(i, 'codigoLabor', v)} centro /></Td>
                    <Td><Cel value={fila.labor} onChange={(v) => setFila(i, 'labor', v)} /></Td>
                    {/* La firma va a mano sobre el impreso. */}
                    <Td />
                    <td className="border-0 px-0.5 no-print align-middle">
                      {f.filas.length > 1 && (
                        <button type="button" onClick={() => quitarFila(i)} title="Quitar renglón"
                          className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Totales. No está en el impreso: es la suma de la columna que la planilla
                  existe para producir, y a mano se hace igual pero con más errores. */}
              <tr className="bg-[hsl(var(--canalco-neutral-100))] font-bold">
                <Td colSpan={6} className="text-right pr-2">TOTAL</Td>
                {TIPOS_HORA.map((t) => (
                  <Td key={t.key} className="text-center">
                    {(() => {
                      const s = f.filas.reduce((a, x) => a + num(x.horas[t.key]), 0);
                      return s > 0 ? s.toLocaleString('es-CO') : '';
                    })()}
                  </Td>
                ))}
                <Td className="text-center">{totalHoras > 0 ? totalHoras.toLocaleString('es-CO') : ''}</Td>
                <Td className="text-right whitespace-nowrap">{cop(totalLiquidacion)}</Td>
                <Td colSpan={3} />
                <td className="border-0 no-print" />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="no-print mt-3 flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={agregarFila} className="h-8 text-[12px] gap-1.5">
            <Plus className="w-4 h-4" /> Agregar renglón
          </Button>
          {!valorHora && (
            <p className="text-xs text-[#8a8aa0]">
              La liquidación aparece cuando se escribe el <b>valor hora</b>.
            </p>
          )}
        </div>
      </main>
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

function Dato({ label, value, onChange, last }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={'px-1.5 py-0.5 flex items-baseline gap-1 ' + (last ? '' : 'border-r border-black')}>
      <span className="font-bold whitespace-nowrap">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-grow min-w-0 bg-transparent outline-none text-[9px]"
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

function Cel({ value, onChange, centro }: {
  value: string; onChange: (v: string) => void; centro?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={'w-full bg-transparent outline-none text-[9px] ' + (centro ? 'text-center' : '')}
    />
  );
}
