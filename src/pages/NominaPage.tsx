import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Banknote, CalendarClock, CheckCircle2, Loader2, Lock, Printer, RefreshCw, Save, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { talentoHumanoService } from '@/services/talentoHumano.service';
import ValidacionTab from '@/components/talentoHumano/ValidacionTab';
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

/**
 * Deja pasar la fila si la búsqueda coincide con la cédula o el nombre.
 *
 * La cédula se compara sin puntos ni espacios para que dé igual escribirla como se lee
 * («1.053.791») o como está guardada; el nombre, sin tildes y sin importar mayúsculas.
 */
const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const coincide = (filtro: string, identificacion: string, nombre: string) => {
  const q = filtro.trim();
  if (!q) return true;
  const soloDigitos = q.replace(/\D/g, '');
  if (soloDigitos && (identificacion ?? '').replace(/\D/g, '').includes(soloDigitos)) return true;
  return sinTildes(nombre ?? '').includes(sinTildes(q));
};

type Tab = 'novedades-nomina' | 'novedades-horas' | 'liquidacion' | 'validacion';

const TABS: { key: Tab; label: string }[] = [
  { key: 'novedades-nomina', label: 'Novedades Nómina' },
  { key: 'novedades-horas', label: 'Horas e incapacidad' },
  { key: 'liquidacion', label: 'Liquidación' },
  // Va de última porque es el último paso: se revisa lo que ya está liquidado.
  { key: 'validacion', label: 'Validación' },
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

  // Las dos constantes del año viven acá y no dentro de Liquidación porque las dos
  // pestañas las necesitan: Liquidación para el auxilio de transporte y la FSP, y
  // Novedades para el piso legal de la incapacidad del empleado.
  //
  // Salen de Parámetros, por el año del periodo. Acá no se editan: si el mínimo del año
  // está mal, se corrige en Parámetros y queda bien para todos los meses de ese año.
  const [smmlv, setSmmlv] = useState('');
  const [auxTransporte, setAuxTransporte] = useState('');
  const [sinParametros, setSinParametros] = useState(false);

  const anio = Number(periodo.slice(0, 4));
  useEffect(() => {
    let cancelled = false;
    talentoHumanoService.getParametros(anio)
      .then((p) => {
        if (cancelled) return;
        setSinParametros(!p);
        setSmmlv(p ? String(Number(p.smmlv)) : '');
        setAuxTransporte(p ? String(Number(p.auxilioTransporte)) : '');
      })
      .catch(() => { if (!cancelled) setSinParametros(true); });
    return () => { cancelled = true; };
  }, [anio]);

  // También acá arriba: filtrar y cambiar de pestaña sin perder la búsqueda es lo que uno
  // espera cuando está revisando a una persona en concreto.
  const [filtro, setFiltro] = useState('');

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
        {/*
          El periodo y la búsqueda viven acá, sobre el contenido, y no en el encabezado:
          son lo que se toca todo el tiempo mientras se revisa, y arriba del todo quedaban
          lejos de la tabla sobre la que actúan.
        */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <input
              type="month"
              value={periodo}
              onChange={(e) => e.target.value && setPeriodo(e.target.value)}
              className="border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </label>
          {/*
            Validación no lo lleva: esa pestaña se trabaja de a una persona y trae su
            propio campo de cédula, así que dos buscadores en pantalla serían dos sitios
            donde escribir lo mismo.
          */}
          {tab !== 'validacion' && (
            <label className="flex items-center gap-1.5 text-xs text-[hsl(var(--canalco-neutral-600))] relative">
              <Search className="w-3.5 h-3.5 absolute left-2 text-[hsl(var(--canalco-neutral-400))] pointer-events-none" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Número de cédula o nombre"
                className="border border-[hsl(var(--canalco-neutral-300))] rounded-md pl-7 pr-2 py-1.5 w-64 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
              />
            </label>
          )}
        </div>

        {sinParametros && (
          <p className="mb-4 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-3 py-2">
            El año <strong>{anio}</strong> no tiene parámetros cargados. Sin el salario mínimo y el
            auxilio de transporte del año, la liquidación no sale bien.{' '}
            <button
              onClick={() => navigate('/dashboard/talento-humano/parametros')}
              className="underline font-medium"
            >
              Cargarlos en Parámetros
            </button>.
          </p>
        )}
        {tab === 'novedades-nomina' && (
          <NovedadesTab
            periodo={periodo}
            generado={generado}
            smmlv={Number(smmlv) || undefined}
            campos={CAMPOS_NOMINA}
            filtro={filtro}
            conObservaciones
          />
        )}
        {tab === 'novedades-horas' && (
          <NovedadesTab
            periodo={periodo}
            generado={generado}
            smmlv={Number(smmlv) || undefined}
            campos={CAMPOS_HORAS_INCAPACIDAD}
            filtro={filtro}
            leyendaFormatos
          />
        )}
        {tab === 'liquidacion' && (
          <LiquidacionTab
            periodo={periodo}
            generado={generado}
            onGeneradoChange={setGenerado}
            smmlv={smmlv}
            auxTransporte={auxTransporte}
            filtro={filtro}
          />
        )}
        {tab === 'validacion' && <ValidacionTab periodo={periodo} />}
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

/**
 * Los campos que un formato aprobado puede llenar solo. El nombre coincide a propósito
 * con el de `CamposNovedad`, para poder cruzarlos sin una tabla de equivalencias.
 */
const SUGERIBLES = new Set<keyof CamposNovedad>([
  'horasExtrasValor', 'recargoNocturnoValor', 'incapacidadEmpresa', 'incapacidadEmpleado', 'vacacionesHabiles',
  'serviciosGruporecordar',
]);

const sugerenciaDe = (p: ThPersonaConNovedad, key: keyof CamposNovedad): number | null =>
  SUGERIBLES.has(key) ? (p.sugerencias?.[key as keyof SugerenciasNovedad] as number | null) ?? null : null;

const CAMPOS_NOMINA: CampoDef[] = [
  { key: 'diasTrabajados', label: 'Días trabajados', w: 'w-16', entero: true },
  { key: 'bonificaciones', label: 'Bonificaciones' },
  { key: 'embargo', label: 'Embargo' },
  { key: 'retencionFuente', label: 'Retención fuente' },
  { key: 'serviciosGruporecordar', label: 'Póliza funeraria' },
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

function NovedadesTab({ periodo, generado, smmlv, campos, filtro, conObservaciones, leyendaFormatos }: {
  periodo: string; generado: boolean; smmlv?: number; campos: CampoDef[]; filtro?: string;
  conObservaciones?: boolean; leyendaFormatos?: boolean;
}) {
  const [rows, setRows] = useState<ThPersonaConNovedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, CamposNovedad>>({});
  const [guardando, setGuardando] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    nominaService.listNovedades(periodo, smmlv)
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
  }, [periodo, smmlv]);

  const visibles = useMemo(
    () => rows.filter((p) => coincide(filtro ?? '', p.identificacion, p.nombre)),
    [rows, filtro],
  );

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
      {leyendaFormatos && (
        <p className="mb-3 text-sm bg-sky-50 text-sky-900 border border-sky-200 rounded-md px-3 py-2">
          Estas casillas <strong>no hay que diligenciarlas</strong>: el valor en gris es el que ya traen los
          formatos aprobados —planillas de horas extras, incapacidades y vacaciones— y es el que entra a la
          liquidación. Escribe encima solo para corregir un caso puntual; para volver al valor del formato,
          borra la casilla y guarda.
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
            {visibles.map((p) => {
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
                  {campos.map((c) => {
                    const sugerido = sugerenciaDe(p, c.key);
                    return (
                      <TdInput
                        key={c.key}
                        value={d[c.key] ?? ''}
                        onChange={(v) => set(c.key, (c.entero ? Number(v) || 0 : v) as CamposNovedad[typeof c.key])}
                        disabled={generado}
                        w={c.w}
                        placeholder={sugerido != null ? cop(sugerido) : undefined}
                        title={
                          sugerido != null
                            ? `${cop(sugerido)} — lo trae ${p.sugerencias.origen.join(' y ')}. Escribe un valor solo si hay que corregirlo.`
                            : undefined
                        }
                      />
                    );
                  })}
                  {conObservaciones && (
                    <TdInput value={d.observaciones ?? ''} onChange={(v) => set('observaciones', v)} disabled={generado} w="w-40" />
                  )}
                  <Td>
                    {!generado && (
                      <Button
                        size="sm"
                        onClick={() => void guardar(p)}
                        disabled={guardando.has(p.personaId)}
                        className="gap-1 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00] h-7 px-2"
                      >
                        {guardando.has(p.personaId) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={colSpanVacio} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                {rows.length === 0 ? 'No hay personal activo.' : 'Nadie coincide con la búsqueda.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Liquidación ────────────────────────────────────────── */

function LiquidacionTab({ periodo, generado, onGeneradoChange, smmlv, auxTransporte, filtro }: {
  periodo: string; generado: boolean; onGeneradoChange: (v: boolean) => void;
  smmlv: string; auxTransporte: string; filtro?: string;
}) {
  const [filas, setFilas] = useState<FilaNomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  const visibles = useMemo(
    () => filas.filter((f) => coincide(filtro ?? '', f.identificacion, f.nombre)),
    [filas, filtro],
  );

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
      toast.error('Falta cargar el año en Parámetros: sin el salario mínimo y el auxilio de transporte no se puede liquidar.');
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
        <div className="no-print mb-4 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={() => void cargar(true)} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Vista previa
          </Button>
          <Button onClick={() => void generar()} disabled={generando} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Generar nómina
          </Button>
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))] w-full">
            Se liquida con el salario mínimo y el auxilio de transporte del año, que salen de
            Parámetros. La vista previa no se guarda: solo "Generar nómina" deja la liquidación fija.
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
          <div>
            <span className="text-[hsl(var(--canalco-neutral-500))]">Empleados </span>
            <span className="font-semibold tabular-nums">{filas.length}</span>
            {visibles.length !== filas.length && (
              <span className="ml-1 text-[hsl(var(--canalco-neutral-500))]">· {visibles.length} en pantalla</span>
            )}
          </div>
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
      ) : visibles.length === 0 ? (
        <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-10">
          Nadie coincide con la búsqueda.
        </p>
      ) : (
        <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-x-auto shadow-sm">
          <table className="text-xs min-w-[2400px] w-full border-collapse">
            <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
              <tr>
                <Th rowSpan={2}>Número de cédula</Th>
                <Th rowSpan={2}>Nombre</Th>
                <Th rowSpan={2}>Cargo</Th>
                <Th rowSpan={2}>Proyecto</Th>
                <Th rowSpan={2} align="right">Salario</Th>
                <Th rowSpan={2} align="right">Días</Th>
                <Th colSpan={11} align="center" className="bg-blue-50">DEVENGADO</Th>
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
                <Th align="right">Aux.Transp.</Th>
                <Th align="right">Salud</Th>
                <Th align="right">Pensión</Th>
                <Th align="right">FSP</Th>
                <Th align="right">Retefuente</Th>
                <Th align="right">Bonific.</Th>
                <Th align="right">Préstamo</Th>
                <Th align="right">Embargos</Th>
                <Th align="right">Póliza funeraria</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))]">
                  <Td className="tabular-nums whitespace-nowrap">{f.identificacion}</Td>
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
                  <Td align="right" className="tabular-nums">{cop(f.auxilioTransporte)}</Td>
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

/**
 * Casilla editable dentro de una fila de la tabla de Novedades.
 *
 * `placeholder` es el valor que ya trae un formato aprobado: se ve en gris y es el que
 * cuenta mientras la casilla esté vacía. Escribir encima lo reemplaza.
 */
function TdInput({ value, onChange, disabled, w, placeholder, title }: {
  value: string | number; onChange: (v: string) => void; disabled?: boolean; w?: string;
  placeholder?: string; title?: string;
}) {
  return (
    <td className="px-1 py-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        title={title}
        className={`${w ?? 'w-24'} border rounded px-1.5 py-1 text-xs text-right tabular-nums outline-none focus:border-[hsl(var(--canalco-primary))] disabled:bg-[hsl(var(--canalco-neutral-100))] disabled:text-[hsl(var(--canalco-neutral-400))] placeholder:text-[hsl(var(--canalco-neutral-500))] ${
          placeholder && !String(value) ? 'border-sky-300 bg-sky-50/40' : 'border-[hsl(var(--canalco-neutral-300))]'
        }`}
      />
    </td>
  );
}
