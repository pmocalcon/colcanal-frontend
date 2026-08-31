import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import {
  ITEMS_VERIFICACION_GARANTIAS,
  NIVELES_RIESGO_MATRIZ,
  PROBABILIDAD_IMPACTO,
} from '@/config/juridicaGarantias';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';

/**
 * Lista de Verificación de Garantías + Matriz resumen de riesgo contractual.
 *
 * Va **entre el pago de la póliza y la designación de supervisor**: es la revisión formal
 * de la garantía ya recibida y pagada (tomador, asegurado, objeto, amparos, vigencias,
 * prima), antes de que el contrato arranque. La diligencia Jurídica.
 *
 * Ruta: `.../juridica/:id/verificacion-garantias`. Se guarda en data.verificacionGarantias.
 */

interface ItemVerificacion {
  si: boolean;
  no: boolean;
  observaciones: string;
}
const EMPTY_ITEM: ItemVerificacion = { si: false, no: false, observaciones: '' };

interface FilaRiesgo {
  riesgo: string;
  probabilidad: string;
  impacto: string;
  nivel: string;
  tratamiento: string;
  responsable: string;
}
const EMPTY_FILA: FilaRiesgo = {
  riesgo: '', probabilidad: '', impacto: '', nivel: '', tratamiento: '', responsable: '',
};

interface VerificacionState {
  items: Record<string, ItemVerificacion>;
  riesgos: FilaRiesgo[];
  /** Quién verifica y cuándo (se diligencia a mano; queda en el impreso). */
  verificoNombre: string;
  verificoCargo: string;
  verificoFecha: string;
  conceptoGeneral: string;
}
const EMPTY: VerificacionState = {
  items: {},
  riesgos: [],
  verificoNombre: '', verificoCargo: '', verificoFecha: '', conceptoGeneral: '',
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

// Desde que se verifica en adelante: después sigue consultable, nunca antes de que la
// póliza esté pagada (los ítems «Prima pagada» o «Autenticidad» no tendrían sentido).
const HABILITADO = ['en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'];

export default function VerificacionGarantiasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<VerificacionState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const tipo = getTipo(sol?.data?.tipoContrato);

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const saved = (data.data?.verificacionGarantias ?? {}) as Partial<VerificacionState>;
        setF({
          ...EMPTY,
          ...saved,
          items: saved.items ?? {},
          riesgos: saved.riesgos?.length ? saved.riesgos : [{ ...EMPTY_FILA }],
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la verificación');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const set = <K extends keyof VerificacionState>(k: K, v: VerificacionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const item = (key: string): ItemVerificacion => f.items[key] ?? EMPTY_ITEM;
  // Sí y No son excluyentes: marcar uno apaga el otro.
  const marcar = (key: string, campo: 'si' | 'no', valor: boolean) =>
    setF((p) => ({
      ...p,
      items: {
        ...p.items,
        [key]: {
          ...(p.items[key] ?? EMPTY_ITEM),
          si: campo === 'si' ? valor : valor ? false : (p.items[key] ?? EMPTY_ITEM).si,
          no: campo === 'no' ? valor : valor ? false : (p.items[key] ?? EMPTY_ITEM).no,
        },
      },
    }));
  const observar = (key: string, texto: string) =>
    setF((p) => ({
      ...p,
      items: { ...p.items, [key]: { ...(p.items[key] ?? EMPTY_ITEM), observaciones: texto } },
    }));

  const setRiesgo = (i: number, campo: keyof FilaRiesgo, valor: string) =>
    setF((p) => ({
      ...p,
      riesgos: p.riesgos.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)),
    }));
  const agregarRiesgo = () => setF((p) => ({ ...p, riesgos: [...p.riesgos, { ...EMPTY_FILA }] }));
  const quitarRiesgo = (i: number) =>
    setF((p) => ({ ...p, riesgos: p.riesgos.filter((_, idx) => idx !== i) }));

  /** Devuelve si logró guardar: la acción de la etapa guarda antes de avanzar. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      // No se guardan las filas de riesgo en blanco: la tabla nace con una fila vacía
      // solo para que se pueda escribir sin pulsar «Agregar».
      const riesgos = f.riesgos.filter((r) => Object.values(r).some((v) => v.trim() !== ''));
      const actualizada = await gestionConocimientoService.saveDocumento(
        solicitudId!, 'verificacionGarantias', { ...f, riesgos },
      );
      // Se relee lo guardado para ver la firma que estampó el servidor. Solo esos tres
      // campos: el resto es lo que hay en pantalla y volver a escribirlo perdería lo
      // que se haya tecleado mientras la petición iba en camino.
      const guardado = (actualizada.data?.verificacionGarantias ?? {}) as Partial<VerificacionState>;
      setF((p) => ({
        ...p,
        verificoNombre: guardado.verificoNombre ?? p.verificoNombre,
        verificoCargo: guardado.verificoCargo ?? p.verificoCargo,
        verificoFecha: guardado.verificoFecha ?? p.verificoFecha,
      }));
      toast.success('Verificación guardada');
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const pendientes = ITEMS_VERIFICACION_GARANTIAS.filter((it) => {
    const st = item(it.key);
    return !st.si && !st.no;
  }).length;

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
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Verificación de Garantías</h1>
            <p className="text-xs text-[#4a4a63]">
              Solicitud N.º {solicitudId}{tipo ? ` · ${tipo.nombre}` : ''}
              {habilitada && pendientes > 0 && ` · ${pendientes} ítem${pendientes === 1 ? '' : 's'} sin marcar`}
            </p>
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
        {/* Los documentos del trámite: se navega entre ellos sin volver a la solicitud. */}
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="verificacion-garantias" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: la garantía se acepta o se devuelve
            con la verificación delante. */}
        <AccionesFlujo
          sol={sol} documento="verificacion-garantias" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">La verificación de garantías aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">
              Se habilita cuando la póliza está pagada; antes no se puede verificar ni la prima ni la autenticidad.
            </p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
            <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md p-5 space-y-6">

              <EncabezadoFormato
                codigo="GJ-007-F"
                titulo={<h1 className="font-bold text-[13px]">VERIFICACIÓN DE GARANTÍAS</h1>}
              />

              {/* ── Lista de verificación ─────────────────────────── */}
              <section>
                <h2 className="text-center font-bold text-[15px] tracking-wide mb-3">
                  LISTA DE VERIFICACIÓN DE GARANTÍAS
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px] min-w-[560px]">
                    <thead>
                      <tr className="bg-[#1f4e79] text-white">
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[38%]">Ítem</th>
                        <th className="border border-[#0a2a52] px-2 py-1 w-14">Sí</th>
                        <th className="border border-[#0a2a52] px-2 py-1 w-14">No</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ITEMS_VERIFICACION_GARANTIAS.map((it) => {
                        const st = item(it.key);
                        return (
                          <tr key={it.key}>
                            <td className="border border-[#0a2a52] px-2 py-1">{it.label}</td>
                            <td className="border border-[#0a2a52] text-center px-1 py-1">
                              <input type="checkbox" checked={st.si} onChange={(e) => marcar(it.key, 'si', e.target.checked)} className="w-3.5 h-3.5" />
                            </td>
                            <td className="border border-[#0a2a52] text-center px-1 py-1">
                              <input type="checkbox" checked={st.no} onChange={(e) => marcar(it.key, 'no', e.target.checked)} className="w-3.5 h-3.5" />
                            </td>
                            <td className="border border-[#0a2a52] px-1 py-0.5">
                              <input
                                value={st.observaciones}
                                onChange={(e) => observar(it.key, e.target.value)}
                                className="w-full bg-transparent outline-none text-[11px]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Matriz resumen de riesgo contractual ──────────── */}
              <section>
                <h2 className="text-center font-bold text-[15px] tracking-wide mb-3">
                  MATRIZ RESUMEN DE RIESGO CONTRACTUAL
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px] min-w-[640px]">
                    <thead>
                      <tr className="bg-[#1f4e79] text-white">
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[26%]">Riesgo</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[13%]">Probabilidad</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[13%]">Impacto</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[12%]">Nivel</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left">Tratamiento</th>
                        <th className="border border-[#0a2a52] px-2 py-1 text-left w-[18%]">Responsable</th>
                        <th className="border-0 w-8 no-print"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.riesgos.map((r, i) => (
                        <tr key={i}>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <input value={r.riesgo} onChange={(e) => setRiesgo(i, 'riesgo', e.target.value)} className="w-full bg-transparent outline-none text-[11px]" />
                          </td>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <SelectCelda value={r.probabilidad} opciones={PROBABILIDAD_IMPACTO} onChange={(v) => setRiesgo(i, 'probabilidad', v)} />
                          </td>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <SelectCelda value={r.impacto} opciones={PROBABILIDAD_IMPACTO} onChange={(v) => setRiesgo(i, 'impacto', v)} />
                          </td>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <SelectCelda value={r.nivel} opciones={NIVELES_RIESGO_MATRIZ} onChange={(v) => setRiesgo(i, 'nivel', v)} />
                          </td>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <input value={r.tratamiento} onChange={(e) => setRiesgo(i, 'tratamiento', e.target.value)} className="w-full bg-transparent outline-none text-[11px]" />
                          </td>
                          <td className="border border-[#0a2a52] px-1 py-0.5">
                            <input value={r.responsable} onChange={(e) => setRiesgo(i, 'responsable', e.target.value)} className="w-full bg-transparent outline-none text-[11px]" />
                          </td>
                          <td className="border-0 px-1 no-print align-middle">
                            {f.riesgos.length > 1 && (
                              <button type="button" onClick={() => quitarRiesgo(i)} title="Quitar fila"
                                className="text-red-600 hover:text-red-800">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={agregarRiesgo}
                  className="no-print mt-2 h-7 text-[11px] gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Agregar riesgo
                </Button>
              </section>

              {/* ── Concepto y firma ─────────────────────────────── */}
              <section className="grid grid-cols-2 gap-4 border-t border-[#0a2a52] pt-4">
                <div>
                  <label className="block font-bold text-[11px] uppercase tracking-wide mb-1">Concepto general</label>
                  <textarea
                    value={f.conceptoGeneral}
                    onChange={(e) => set('conceptoGeneral', e.target.value)}
                    rows={4}
                    className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-[11px] outline-none focus:border-[hsl(var(--canalco-primary))]"
                  />
                </div>
                {/* La firma no se teclea: la estampa el servidor al guardar, con quien
                    guarda y la fecha del día. Se pone una sola vez y no la pisa un
                    guardado posterior. */}
                <div className="space-y-2">
                  <FirmaAuto label="Verificó" value={f.verificoNombre} />
                  <FirmaAuto label="Cargo" value={f.verificoCargo} />
                  <FirmaAuto label="Fecha" value={fechaLarga(f.verificoFecha)} />
                  {!f.verificoNombre && (
                    <p className="no-print text-[10px] italic text-[hsl(var(--canalco-neutral-400))]">
                      Automático · se llena al guardar, con tu nombre, tu cargo y la fecha de hoy
                    </p>
                  )}
                </div>
              </section>
            </div>
            <PieElaboracion />
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta verificación. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function SelectCelda({ value, opciones, onChange }: {
  value: string; opciones: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent outline-none text-[11px]"
    >
      <option value="">—</option>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Fila de firma de solo lectura: el valor lo estampa el servidor al guardar. */
function FirmaAuto({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[70px_1fr] items-baseline gap-2">
      <span className="font-bold text-[11px] uppercase tracking-wide">{label}</span>
      <span className="w-full border-b border-dotted border-[hsl(var(--canalco-neutral-300))] text-[11px] py-0.5 min-h-[1.1rem]">
        {value || ' '}
      </span>
    </div>
  );
}

/** 'AAAA-MM-DD' → '15 de agosto de 2026'. Devuelve el crudo si no se entiende. */
function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim());
  if (!m) return iso ?? '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}
