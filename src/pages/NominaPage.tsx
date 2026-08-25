import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Banknote, CalendarClock, CheckCircle2, Loader2, Lock, Printer, RefreshCw, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  nominaService,
  type ThPersonaConNovedad,
  type FilaNomina,
  type CamposNovedad,
} from '@/services/nomina.service';

/**
 * Nómina: novedades del mes y liquidación, en una sola pantalla con dos pestañas que
 * comparten el mismo periodo. Espeja el Excel "Prueba Nómina.xlsx" (hojas NOVEDADES
 * NÓMINA y NÓMINA).
 *
 * Los campos editables de Novedades son los que en el Excel estaban en azul —lo que se
 * digita a mano cada mes—; el resto (proyecto, salario, auxilio, préstamo) se trae en
 * vivo de Personal y Préstamos. La Liquidación no tiene nada manual: es puro cálculo, y
 * una vez generada queda fija aunque el dato maestro cambie después.
 *
 * Ruta: `.../talento-humano/nomina`.
 */

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const cop = (n: number) => (n ? '$' + Math.round(n).toLocaleString('es-CO') : '—');
const pct = (n: number | null) => (n ? (n * 100).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%' : '—');

type Tab = 'novedades-nomina' | 'novedades-horas' | 'liquidacion';

const TABS: { key: Tab; label: string }[] = [
  { key: 'novedades-nomina', label: 'Novedades Nómina' },
  { key: 'novedades-horas', label: 'Horas e incapacidad' },
  { key: 'liquidacion', label: 'Liquidación' },
];

export default function NominaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodo = searchParams.get('periodo') || mesActual();
  const tab = (searchParams.get('tab') as Tab) || 'novedades-nomina';

  const setPeriodo = (p: string) => {
    const n = new URLSearchParams(searchParams);
    n.set('periodo', p);
    setSearchParams(n, { replace: true });
  };
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(searchParams);
    n.set('tab', t);
    setSearchParams(n, { replace: true });
  };

  const [generado, setGenerado] = useState(false);

  // Se consulta acá arriba (no en cada pestaña) porque las dos necesitan saberlo: si el
  // periodo ya se generó, Novedades se bloquea y Liquidación muestra lo guardado.
  useEffect(() => {
    let cancelled = false;
    nominaService.getNomina(periodo).then((r) => { if (!cancelled) setGenerado(r.generado); }).catch(() => {});
    return () => { cancelled = true; };
  }, [periodo]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Nómina
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Novedades del mes y liquidación
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <input
              type="month"
              value={periodo}
              onChange={(e) => e.target.value && setPeriodo(e.target.value)}
              className="border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </label>
          {generado && (
            <span className="inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 bg-green-100 text-green-800">
              <Lock className="w-3.5 h-3.5" /> Periodo generado
            </span>
          )}
        </div>

        <div className="max-w-[1400px] mx-auto px-6 flex gap-1 border-t border-[hsl(var(--canalco-neutral-200))]">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                  : 'border-transparent text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {tab === 'novedades-nomina' && (
          <NovedadesTab periodo={periodo} generado={generado} campos={CAMPOS_NOMINA} conObservaciones />
        )}
        {tab === 'novedades-horas' && (
          <NovedadesTab periodo={periodo} generado={generado} campos={CAMPOS_HORAS_INCAPACIDAD} />
        )}
        {tab === 'liquidacion' && (
          <LiquidacionTab periodo={periodo} generado={generado} onGeneradoChange={setGenerado} />
        )}
      </main>
    </div>
  );
}

/* ── Novedades ──────────────────────────────────────────── */

/**
 * Dos pestañas, un mismo `th_novedades_nomina`: "Novedades Nómina" trae los campos que
 * están en esa hoja del Excel (días trabajados, bonificación, embargo, retención fuente,
 * servicios GrupoRecordar); "Horas e incapacidad" trae lo que en el Excel vive en otras
 * hojas (horas extras y RN están en NOVEDADES HORA; incapacidad y vacaciones se escriben
 * directo en la hoja NÓMINA) pero que acá se digita en un solo sitio.
 */
interface CampoDef {
  key: keyof CamposNovedad;
  label: string;
  w?: string;
  entero?: boolean;
}

const CAMPOS_NOMINA: CampoDef[] = [
  { key: 'diasTrabajados', label: 'Días trabajados', w: 'w-16', entero: true },
  { key: 'bonificaciones', label: 'Bonificaciones' },
  { key: 'embargo', label: 'Embargo' },
  { key: 'retencionFuente', label: 'Retención fuente' },
  { key: 'serviciosGruporecordar', label: 'Servicios GrupoRecordar' },
];

const CAMPOS_HORAS_INCAPACIDAD: CampoDef[] = [
  { key: 'horasExtrasValor', label: 'H. Extras $' },
  { key: 'recargoNocturnoValor', label: 'RN $' },
  { key: 'incapacidadEmpresa', label: 'Incapacidad empresa $' },
  { key: 'incapacidadEmpleado', label: 'Incapacidad empleado $' },
  { key: 'incapacidadOtros', label: 'Incapacidad otros $' },
  { key: 'vacacionesHabiles', label: 'Vacaciones hábiles $' },
  { key: 'vacacionesNoHabiles', label: 'Vacaciones no hábiles $' },
];

const CAMPO_VACIO: CamposNovedad = {
  diasTrabajados: 30, horasExtrasValor: '', recargoNocturnoValor: '', bonificaciones: '',
  embargo: '', incapacidadEmpresa: '', incapacidadEmpleado: '', incapacidadOtros: '', vacacionesHabiles: '',
  vacacionesNoHabiles: '', retencionFuente: '', serviciosGruporecordar: '', observaciones: '',
};

const draftDe = (n: ThPersonaConNovedad['novedad']): CamposNovedad => ({
  diasTrabajados: n?.diasTrabajados ?? 30,
  horasExtrasValor: n?.horasExtrasValor ?? '',
  recargoNocturnoValor: n?.recargoNocturnoValor ?? '',
  bonificaciones: n?.bonificaciones ?? '',
  embargo: n?.embargo ?? '',
  incapacidadEmpresa: n?.incapacidadEmpresa ?? '',
  incapacidadEmpleado: n?.incapacidadEmpleado ?? '',
  incapacidadOtros: n?.incapacidadOtros ?? '',
  vacacionesHabiles: n?.vacacionesHabiles ?? '',
  vacacionesNoHabiles: n?.vacacionesNoHabiles ?? '',
  retencionFuente: n?.retencionFuente ?? '',
  serviciosGruporecordar: n?.serviciosGruporecordar ?? '',
  observaciones: n?.observaciones ?? '',
});

function NovedadesTab({ periodo, generado, campos, conObservaciones }: {
  periodo: string; generado: boolean; campos: CampoDef[]; conObservaciones?: boolean;
}) {
  const [rows, setRows] = useState<ThPersonaConNovedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, CamposNovedad>>({});
  const [guardando, setGuardando] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    nominaService.listNovedades(periodo)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        const d: Record<number, CamposNovedad> = {};
        for (const p of r) d[p.personaId] = draftDe(p.novedad);
        setDrafts(d);
      })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar las novedades'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodo]);

  const setCampo = <K extends keyof CamposNovedad>(id: number, k: K, v: CamposNovedad[K]) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? CAMPO_VACIO), [k]: v } }));

  const guardar = async (p: ThPersonaConNovedad) => {
    setGuardando((s) => new Set(s).add(p.personaId));
    try {
      await nominaService.guardarNovedad(periodo, p.personaId, p.identificacion, p.nombre, drafts[p.personaId]);
      toast.success(`Novedad guardada: ${p.nombre}`);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
    } finally {
      setGuardando((s) => { const n = new Set(s); n.delete(p.personaId); return n; });
    }
  };

  const columnasBase = 4 + campos.length + 1;
  const columnasObservaciones = conObservaciones ? 5 : 0;
  const colSpanVacio = columnasBase + columnasObservaciones;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" /></div>;
  }

  return (
    <div>
      {generado && (
        <p className="mb-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-3 py-2">
          Este periodo ya se generó. Reábrelo en la pestaña Liquidación para poder editar las novedades.
        </p>
      )}
      <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
        <table className="text-xs min-w-[1700px] w-full">
          <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
            <tr>
              <Th>Identificación</Th>
              <Th>Nombre</Th>
              <Th>Cargo</Th>
              <Th>Proyecto</Th>
              {conObservaciones && <Th align="right">Salario básico</Th>}
              {conObservaciones && <Th align="right">Auxilio rodamiento</Th>}
              {conObservaciones && <Th align="right">Préstamo</Th>}
              {conObservaciones && <Th align="right">Riesgo</Th>}
              {campos.map((c) => <Th key={c.key} align="right">{c.label}</Th>)}
              {conObservaciones && <Th>Observaciones</Th>}
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const d = drafts[p.personaId] ?? CAMPO_VACIO;
              const set = <K extends keyof CamposNovedad>(k: K, v: CamposNovedad[K]) => setCampo(p.personaId, k, v);
              return (
                <tr key={p.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))]">
                  <Td className="tabular-nums whitespace-nowrap">{p.identificacion}</Td>
                  <Td className="font-medium whitespace-nowrap">{p.nombre}</Td>
                  <Td className="whitespace-nowrap text-[hsl(var(--canalco-neutral-600))]">{p.cargo || '—'}</Td>
                  <Td className="whitespace-nowrap text-[hsl(var(--canalco-neutral-600))]">{p.empresaProyecto || '—'}</Td>
                  {conObservaciones && <Td align="right" className="tabular-nums text-[hsl(var(--canalco-neutral-600))]">{cop(Number(p.salario))}</Td>}
                  {conObservaciones && <Td align="right" className="tabular-nums text-[hsl(var(--canalco-neutral-600))]">{cop(Number(p.auxilioRodamiento))}</Td>}
                  {conObservaciones && <Td align="right" className="tabular-nums text-[hsl(var(--canalco-neutral-600))]">{cop(p.prestamoCuota)}</Td>}
                  {conObservaciones && <Td align="right" className="tabular-nums text-[hsl(var(--canalco-neutral-600))]">{pct(p.nivelRiesgo ? Number(p.nivelRiesgo) : null)}</Td>}
                  {campos.map((c) => (
                    <TdInput
                      key={c.key}
                      value={d[c.key] ?? ''}
                      onChange={(v) => set(c.key, (c.entero ? Number(v) || 0 : v) as CamposNovedad[typeof c.key])}
                      disabled={generado}
                      w={c.w}
                    />
                  ))}
                  {conObservaciones && (
                    <TdInput value={d.observaciones ?? ''} onChange={(v) => set('observaciones', v)} disabled={generado} w="w-40" />
                  )}
                  <Td>
                    {!generado && (
                      <Button
                        size="sm"
                        onClick={() => void guardar(p)}
                        disabled={guardando.has(p.identificacion)}
                        className="gap-1 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00] h-7 px-2"
                      >
                        {guardando.has(p.identificacion) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={colSpanVacio} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">No hay personal activo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Liquidación ────────────────────────────────────────── */

function LiquidacionTab({ periodo, generado, onGeneradoChange }: {
  periodo: string; generado: boolean; onGeneradoChange: (v: boolean) => void;
}) {
  const [filas, setFilas] = useState<FilaNomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [smmlv, setSmmlv] = useState('1750905');
  const [auxTransporte, setAuxTransporte] = useState('249095');
  const [generando, setGenerando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  const cargar = async (preview: boolean) => {
    setLoading(true);
    try {
      const r = await nominaService.getNomina(
        periodo,
        preview ? Number(smmlv) || undefined : undefined,
        preview ? Number(auxTransporte) || undefined : undefined,
      );
      setFilas(r.filas);
      onGeneradoChange(r.generado);
    } catch {
      toast.error('No se pudo cargar la nómina');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(false); }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const generar = async () => {
    if (!Number(smmlv) || !Number(auxTransporte)) {
      toast.error('Indica el salario mínimo y el auxilio de transporte del año.');
      return;
    }
    if (!window.confirm(`¿Generar la nómina de ${periodo}? Queda fija: para corregirla después hay que reabrir el periodo.`)) return;
    setGenerando(true);
    try {
      const r = await nominaService.generarNomina(periodo, Number(smmlv), Number(auxTransporte));
      setFilas(r.filas);
      onGeneradoChange(true);
      toast.success('Nómina generada');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo generar la nómina');
    } finally {
      setGenerando(false);
    }
  };

  const reabrir = async () => {
    if (!window.confirm(`¿Reabrir ${periodo}? Se borra la liquidación guardada; hay que volver a generarla.`)) return;
    setReabriendo(true);
    try {
      await nominaService.reabrirNomina(periodo);
      onGeneradoChange(false);
      await cargar(false);
      toast.success('Periodo reabierto');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo reabrir el periodo');
    } finally {
      setReabriendo(false);
    }
  };

  const totales = useMemo(() => ({
    devengado: filas.reduce((s, f) => s + f.totalDevengado, 0),
    deduccion: filas.reduce((s, f) => s + f.totalDeduccion, 0),
    neto: filas.reduce((s, f) => s + f.netoPagar, 0),
  }), [filas]);

  return (
    <div>
      <style>{`
        @media print {
          @page { size: Letter landscape; margin: 8mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      {!generado ? (
        <div className="no-print mb-4 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-[hsl(var(--canalco-neutral-600))] mb-1">Salario mínimo del año</span>
            <input value={smmlv} onChange={(e) => setSmmlv(e.target.value)} className="border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 w-36 outline-none focus:border-[hsl(var(--canalco-primary))]" />
          </label>
          <label className="text-sm">
            <span className="block text-[hsl(var(--canalco-neutral-600))] mb-1">Auxilio de transporte</span>
            <input value={auxTransporte} onChange={(e) => setAuxTransporte(e.target.value)} className="border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 w-36 outline-none focus:border-[hsl(var(--canalco-primary))]" />
          </label>
          <Button variant="outline" onClick={() => void cargar(true)} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Vista previa
          </Button>
          <Button onClick={() => void generar()} disabled={generando} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Generar nómina
          </Button>
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))] w-full">
            La vista previa no se guarda. Solo "Generar nómina" deja la liquidación fija.
          </p>
        </div>
      ) : (
        <div className="no-print mb-4 flex items-center gap-3">
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          <Button variant="outline" onClick={() => void reabrir()} disabled={reabriendo} className="gap-2 border-red-300 text-red-700 hover:bg-red-50">
            {reabriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Reabrir periodo
          </Button>
        </div>
      )}

      {!loading && (
        <div className="mb-4 flex flex-wrap gap-6 text-sm">
          <div><span className="text-[hsl(var(--canalco-neutral-500))]">Empleados </span><span className="font-semibold tabular-nums">{filas.length}</span></div>
          <div><span className="text-[hsl(var(--canalco-neutral-500))]">Total devengado </span><span className="font-semibold tabular-nums">{cop(totales.devengado)}</span></div>
          <div><span className="text-[hsl(var(--canalco-neutral-500))]">Total deducción </span><span className="font-semibold tabular-nums text-red-700">{cop(totales.deduccion)}</span></div>
          <div><span className="text-[hsl(var(--canalco-neutral-500))]">Neto a pagar </span><span className="font-bold tabular-nums text-[hsl(var(--canalco-primary))]">{cop(totales.neto)}</span></div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
      ) : filas.length === 0 ? (
        <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-10">
          Sin datos todavía. Diligencia las novedades y pulsa "Vista previa".
        </p>
      ) : (
        <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
          <table className="text-xs min-w-[2200px] w-full border-collapse">
            <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
              <tr>
                <Th rowSpan={2}>Nombre</Th>
                <Th rowSpan={2}>Cargo</Th>
                <Th rowSpan={2}>Proyecto</Th>
                <Th rowSpan={2} align="right">Salario</Th>
                <Th rowSpan={2} align="right">Días</Th>
                <Th colSpan={10} align="center" className="bg-blue-50">DEVENGADO</Th>
                <Th rowSpan={2} align="right" className="bg-rose-50">TOTAL DEVENGADO</Th>
                <Th rowSpan={2} align="right">IBC</Th>
                <Th colSpan={8} align="center" className="bg-blue-50">DEDUCCIONES</Th>
                <Th rowSpan={2} align="right" className="bg-rose-50">TOTAL DEDUCCIÓN</Th>
                <Th rowSpan={2} align="right" className="bg-rose-50">NETO A PAGAR</Th>
              </tr>
              <tr>
                <Th align="right">Básico</Th>
                <Th align="right">H.Extras</Th>
                <Th align="right">RN</Th>
                <Th align="right">Aux.Rodam.</Th>
                <Th align="right">Bonific.</Th>
                <Th align="right">Incap.Emp</Th>
                <Th align="right">Incap.Empdo</Th>
                <Th align="right">Incap.Otros</Th>
                <Th align="right">Vac.Háb.</Th>
                <Th align="right">Vac.NoHáb.</Th>
                <Th align="right">Salud</Th>
                <Th align="right">Pensión</Th>
                <Th align="right">FSP</Th>
                <Th align="right">Retefuente</Th>
                <Th align="right">Bonific.</Th>
                <Th align="right">Préstamo</Th>
                <Th align="right">Embargos</Th>
                <Th align="right">Servicios</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))]">
                  <Td className="font-medium whitespace-nowrap">{f.nombre}</Td>
                  <Td className="whitespace-nowrap text-[hsl(var(--canalco-neutral-600))]">{f.cargo || '—'}</Td>
                  <Td className="whitespace-nowrap text-[hsl(var(--canalco-neutral-600))]">{f.proyecto || '—'}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.salarioBasico)}</Td>
                  <Td align="right" className="tabular-nums">{f.diasTrabajados}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.devengadoBasico)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.horasExtras)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.recargoNocturno)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.auxilioRodamiento)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.bonificacion)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.incapacidadEmpresa)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.incapacidadEmpleado)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.incapacidadOtros)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.vacacionesHabiles)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.vacacionesNoHabiles)}</Td>
                  <Td align="right" className="tabular-nums font-semibold bg-rose-50/50">{cop(f.totalDevengado)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.ibc)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.salud)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.pension)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.fsp)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.retencionFuente)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.bonificacionDeduccion)}</Td>
                  <Td align="right" className="tabular-nums">
                    {cop(f.prestamo)}
                    {f.multiEmpresa && f.prestamo > 0 && (
                      <span
                        title="Esta persona tiene contrato en más de una empresa del grupo. La cuota del préstamo se calcula por cédula y se repite completa en cada una de sus filas — revisar con Contabilidad en cuál descontarla."
                        className="ml-1 text-amber-600 cursor-help"
                      >
                        ⚠
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="tabular-nums">{cop(f.embargos)}</Td>
                  <Td align="right" className="tabular-nums">{cop(f.serviciosGruporecordar)}</Td>
                  <Td align="right" className="tabular-nums font-semibold bg-rose-50/50">{cop(f.totalDeduccion)}</Td>
                  <Td align="right" className="tabular-nums font-bold text-[hsl(var(--canalco-primary))] bg-rose-50/50">{cop(f.netoPagar)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function Th({ children, align, rowSpan, colSpan, className }: {
  children?: React.ReactNode; align?: 'left' | 'right' | 'center'; rowSpan?: number; colSpan?: number; className?: string;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`px-2 py-1.5 font-semibold border-b border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align, className }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={`px-2 py-1 ${align === 'right' ? 'text-right' : ''} ${className ?? ''}`}>{children}</td>;
}

/** Casilla editable dentro de una fila de la tabla de Novedades. */
function TdInput({ value, onChange, disabled, w }: {
  value: string | number; onChange: (v: string) => void; disabled?: boolean; w?: string;
}) {
  return (
    <td className="px-1 py-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${w ?? 'w-24'} border border-[hsl(var(--canalco-neutral-300))] rounded px-1.5 py-1 text-xs text-right outline-none focus:border-[hsl(var(--canalco-primary))] disabled:bg-[hsl(var(--canalco-neutral-100))] disabled:text-[hsl(var(--canalco-neutral-400))]`}
      />
    </td>
  );
}
