import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Save, Loader2, ClipboardCheck, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { SECCIONES, getTipo, filtrarPorPersona, habilitantesNoCubiertos, type SeccionKey } from '@/config/juridicaContratos';
import { esRolPmo } from '@/utils/rolesPmo';

const PERSONA_LABEL: Record<string, string> = { natural: 'Natural', juridica: 'Jurídica' };

/**
 * Lista de Chequeo de Verificación de Documentos (GA-25-F), como segundo documento de
 * la solicitud. Las filas dependen del tipo de contrato elegido en el GTH-002-F.
 * Se diligencia por etapas (Administrativo / Jurídico) y se guarda en data.checklist.
 */

interface ItemState {
  presentaSi: boolean; presentaNo: boolean; obsAdm: string;
  revSi: boolean; revNo: boolean; obsJur: string;
}
const EMPTY_ITEM: ItemState = { presentaSi: false, presentaNo: false, obsAdm: '', revSi: false, revNo: false, obsJur: '' };

interface ChecklistState {
  contratante: string; contratista: string; supervisor: string;
  docsUrl: string;
  items: Record<string, ItemState>;
  revAdminNombre: string; revAdminCargo: string; revAdminFecha: string;
  revJurNombre: string; revJurCargo: string; revJurFecha: string;
}
const EMPTY_CL: ChecklistState = {
  contratante: '', contratista: '', supervisor: '',
  docsUrl: '',
  items: {},
  revAdminNombre: '', revAdminCargo: '', revAdminFecha: '',
  revJurNombre: '', revJurCargo: '', revJurFecha: '',
};

/**
 * La lista es secuencial: Administrativa verifica que los documentos estén (etapa
 * previa) y solo después Jurídica los revisa (etapa contractual). Cada lado se abre
 * en su etapa del flujo y se cierra al pasar a la siguiente, así que nadie reescribe
 * lo que el otro ya firmó. Espeja `ladoChecklist` del backend, que es quien manda.
 */
type LadoChecklist = 'admin' | 'juridica' | null;

const ladoDeLaEtapa = (estado?: string): LadoChecklist => {
  if (estado === 'en_tramite_administrativa') return 'admin';
  if (estado === 'contrato_en_elaboracion') return 'juridica';
  return null;
};

/** A qué lado pertenece el usuario. El PMO es comodín y puede diligenciar ambos. */
const ladoDelRol = (rol?: string): LadoChecklist | 'pmo' => {
  const r = (rol ?? '').toLowerCase();
  if (esRolPmo(rol)) return 'pmo';
  if (r.includes('juríd') || r.includes('jurid')) return 'juridica';
  if (r.includes('administrativ')) return 'admin';
  return null;
};

export default function ChecklistContratoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [cl, setCl] = useState<ChecklistState>(EMPTY_CL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const tipo = useMemo(() => getTipo(sol?.data?.tipoContrato), [sol]);
  const persona = (sol?.data?.tipoPersona ?? '') as string;
  // La lista se habilita cuando la solicitud llega a Administrativa (o más adelante).
  const habilitada = !!sol && sol.estado !== 'borrador' && sol.estado !== 'pendiente_autorizacion_gp' && sol.estado !== 'pendiente_firma_gerencia';

  // Qué columnas puede tocar este usuario ahora mismo: cruce entre la etapa abierta y
  // el área a la que pertenece. Fuera de las dos etapas la lista queda de solo lectura.
  const lado = ladoDeLaEtapa(sol?.estado);
  const miLado = ladoDelRol(user?.nombreRol);
  const adminEditable = lado === 'admin' && (miLado === 'admin' || miLado === 'pmo');
  const jurEditable = lado === 'juridica' && (miLado === 'juridica' || miLado === 'pmo');
  const editable = adminEditable || jurEditable;
  const firmadaAdmin = !!cl.revAdminNombre;
  const firmadaJur = !!cl.revJurNombre;

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const saved = (data.data?.checklist ?? {}) as Partial<ChecklistState>;
        setCl({
          ...EMPTY_CL,
          ...saved,
          items: saved.items ?? {},
          // El contratante se toma del contratante de la solicitud (empresa).
          contratante: data.data?.empresa || saved.contratante || '',
          // El contratista se toma del campo de la solicitud (o de la persona sugerida).
          contratista: saved.contratista || data.data?.contratista || data.data?.sugNombre || '',
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la lista de chequeo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const set = <K extends keyof ChecklistState>(k: K, v: ChecklistState[K]) => setCl((p) => ({ ...p, [k]: v }));
  const item = (key: string): ItemState => cl.items[key] ?? EMPTY_ITEM;
  const setItem = (key: string, patch: Partial<ItemState>) =>
    setCl((p) => ({ ...p, items: { ...p.items, [key]: { ...(p.items[key] ?? EMPTY_ITEM), ...patch } } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const actualizada = await gestionConocimientoService.saveChecklist(solicitudId!, cl);
      // Refresca con lo guardado para ver la firma automática de la revisión.
      const saved = (actualizada.data?.checklist ?? {}) as Partial<ChecklistState>;
      setCl((prev) => ({ ...prev, ...saved, items: saved.items ?? prev.items }));
      toast.success('Lista de chequeo guardada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // Secciones con al menos un ítem para este tipo de contrato y tipo de persona.
  const seccionesDelTipo = SECCIONES
    .map((s) => ({
      ...s,
      items: filtrarPorPersona(tipo?.secciones[s.key as SeccionKey] ?? [], persona)
        // Se conserva la clave histórica `sección::texto`: es la que ya está guardada.
        .map((it) => ({ key: `${s.key}::${it}`, label: it })),
    }))
    .filter((s) => s.items.length > 0);

  // Manda el tipo de contrato: los habilitantes que el GA-25-F ya pide no se repiten.
  // Lo que queda es el complemento —el mínimo de la política que el formato no cubre—,
  // así que va al final y desaparece cuando el tipo de contrato los pide todos.
  const seccionHabilitantes = {
    key: 'habilitantes',
    label: 'Documentos habilitantes adicionales (mínimo de la política · según naturaleza del contratista)',
    administrativo: true,
    items: habilitantesNoCubiertos(persona, tipo).map((d) => ({
      // Clave estable: cambiar el tipo de persona reetiqueta la fila, no la pierde.
      key: `habilitantes::${d.key}`,
      label: d.tipo,
      nota: `${d.requisito} · ${d.observaciones}`,
    })),
  };

  const seccionesConItems = [...seccionesDelTipo, seccionHabilitantes]
    .filter((s) => s.items.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-100))]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">Lista de Chequeo de Documentos</h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Formato GA-25-F · Solicitud N.º {solicitudId}{tipo ? ` · ${tipo.nombre}` : ''}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <ClipboardCheck className="w-10 h-10 text-[hsl(var(--canalco-neutral-400))] mx-auto mb-3" />
            <p className="text-[hsl(var(--canalco-neutral-700))]">La lista de chequeo aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita cuando la solicitud se remite a Administrativa.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : !tipo ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <ClipboardCheck className="w-10 h-10 text-[hsl(var(--canalco-neutral-400))] mx-auto mb-3" />
            <p className="text-[hsl(var(--canalco-neutral-700))]">Esta solicitud aún no tiene <b>tipo de contrato</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Selecciónalo primero en el formato de solicitud para armar la lista de chequeo.</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <>
          {/* De quién es el turno. Sin esto, ver media tabla bloqueada parece un error. */}
          <div className={'no-print mb-4 rounded-lg border px-4 py-3 text-sm ' + (editable
            ? 'bg-[hsl(var(--canalco-primary))]/5 border-[hsl(var(--canalco-primary))]/30 text-black'
            : 'bg-[hsl(var(--canalco-neutral-100))] border-[hsl(var(--canalco-neutral-300))] text-[hsl(var(--canalco-neutral-700))]')}>
            {lado === 'admin' && (
              <p>
                <b>Turno de la Dirección Administrativa.</b> Se diligencia la <b>Etapa previa</b>:
                marcar qué documentos presentó el contratista. La <b>Etapa contractual</b> se abre
                cuando la solicitud pase a Jurídica.
              </p>
            )}
            {lado === 'juridica' && (
              <p>
                <b>Turno de la Dirección Jurídica.</b> La Etapa previa ya está cerrada
                {firmadaAdmin ? <> y firmada por <b>{cl.revAdminNombre}</b></> : null}; aquí solo se
                diligencia la <b>Etapa contractual</b>. Al guardar se firma esta revisión y con eso
                se habilita el <b>Contrato</b>.
              </p>
            )}
            {lado === null && (
              <p>
                {firmadaAdmin && firmadaJur
                  ? <>Lista <b>cerrada</b>: revisada por las dos direcciones. Queda como registro del trámite.</>
                  : <>La lista no se diligencia en esta etapa. Se abre en trámite (Administrativa) y luego en revisión del contrato (Jurídica).</>}
              </p>
            )}
          </div>

          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <div className="doc bg-white border border-[#0a2a52] text-[12px] text-black shadow-md">
            {/* Encabezado */}
            <div className="grid grid-cols-[130px_1fr_130px] border-b border-[#0a2a52]">
              <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
              </div>
              <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[14px] border-r border-[#0a2a52]">
                LISTA DE CHEQUEO VERIFICACIÓN DE DOCUMENTOS
              </div>
              <div className="grid grid-rows-[auto_1fr]">
                <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                  <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
                </div>
                <div className="grid grid-cols-[auto_1fr] text-[10px]">
                  <CodeCell label="Código" value="GA-25-F" />
                  <CodeCell label="Fecha" value="09/04/2026" />
                  <CodeCell label="Versión" value="1" last />
                </div>
              </div>
            </div>

            {/* Contratante / Contratista / Supervisor / URL de documentos / Tipo */}
            <div className="border-b border-[#0a2a52]">
              <HeaderRow label="CONTRATANTE">
                {/* Se toma del contratante de la solicitud (solo lectura). */}
                <span className="text-[12px] py-0.5 block">
                  {cl.contratante || <span className="italic text-[hsl(var(--canalco-neutral-400))]">—</span>}
                </span>
              </HeaderRow>
              <HeaderRow label="CONTRATISTA">
                <input value={cl.contratista} onChange={(e) => set('contratista', e.target.value)}
                  disabled={!adminEditable}
                  className="w-full bg-transparent outline-none text-[12px] py-0.5 disabled:opacity-100" />
              </HeaderRow>
              <HeaderRow label="SUPERVISOR">
                <input value={cl.supervisor} onChange={(e) => set('supervisor', e.target.value)}
                  disabled={!adminEditable}
                  className="w-full bg-transparent outline-none text-[12px] py-0.5 disabled:opacity-100" />
              </HeaderRow>
              <HeaderRow label="URL DE DOCUMENTOS" last>
                <div className="flex items-center gap-2">
                  <input value={cl.docsUrl} onChange={(e) => set('docsUrl', e.target.value)}
                    disabled={!adminEditable}
                    placeholder="Enlace a la carpeta (Drive, OneDrive, SharePoint…)"
                    className="w-full bg-transparent outline-none text-[12px] py-0.5 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] disabled:opacity-100" />
                  {cl.docsUrl.trim() && (
                    <a href={cl.docsUrl} target="_blank" rel="noreferrer"
                      className="no-print text-[hsl(var(--canalco-primary))] flex-none" title="Abrir carpeta de documentos">
                      <LinkIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </HeaderRow>
            </div>
            <div className="grid grid-cols-[200px_1fr_150px_1fr] border-b border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))]">
              <div className="px-3 py-2 font-bold border-r border-[#0a2a52]">TIPO DE CONTRATO</div>
              <div className="px-3 py-2 font-semibold text-center border-r border-[#0a2a52]">{tipo.nombre}</div>
              <div className="px-3 py-2 font-bold border-r border-[#0a2a52]">TIPO DE PERSONA</div>
              <div className="px-3 py-2 font-semibold text-center">{PERSONA_LABEL[persona] ?? '—'}</div>
            </div>

            {/* Secciones */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px] min-w-[720px]">
                <thead>
                  <tr className="bg-[hsl(var(--canalco-neutral-200))]">
                    <th className="border border-[#0a2a52] px-2 py-1 text-left w-[34%]">Documentos requeridos</th>
                    <th className="border border-[#0a2a52] px-2 py-1 text-center" colSpan={3}>Etapa previa (Administrativo)</th>
                    <th className="border border-[#0a2a52] px-2 py-1 text-center" colSpan={3}>Etapa Contractual (Jurídico)</th>
                  </tr>
                  <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                    <th className="border border-[#0a2a52] px-2 py-1"></th>
                    <th className="border border-[#0a2a52] px-1 py-1 w-10">SI</th>
                    <th className="border border-[#0a2a52] px-1 py-1 w-10">NO</th>
                    <th className="border border-[#0a2a52] px-2 py-1">Observación</th>
                    <th className="border border-[#0a2a52] px-1 py-1 w-10">SI</th>
                    <th className="border border-[#0a2a52] px-1 py-1 w-10">NO</th>
                    <th className="border border-[#0a2a52] px-2 py-1">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {seccionesConItems.map((sec) => (
                    <SectionRows key={sec.key} label={sec.label} administrativo={sec.administrativo}
                      items={sec.items} item={item} setItem={setItem}
                      adminEditable={adminEditable} jurEditable={jurEditable} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Firmas */}
            <div className="grid grid-cols-2">
              <RevisionBlock title="REVISIÓN DIRECCIÓN ADMINISTRATIVA"
                nombre={cl.revAdminNombre} cargo={cl.revAdminCargo} fecha={cl.revAdminFecha}
                hint="al guardar en trámite (Administrativa)" />
              <RevisionBlock title="REVISIÓN DIRECCIÓN JURÍDICA" last
                nombre={cl.revJurNombre} cargo={cl.revJurCargo} fecha={cl.revJurFecha}
                hint="al guardar en revisión del contrato (Jurídica)" />
            </div>
          </div>
          </fieldset>
          </>
        )}

        {tipo && habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────────── */

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function HeaderRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[200px_1fr] ' + (last ? '' : 'border-b border-[#0a2a52]')}>
      <div className="px-3 py-1.5 font-bold border-r border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))]">{label}</div>
      <div className="px-3 py-1">{children}</div>
    </div>
  );
}

/**
 * Una fila de la lista. `key` es lo que se guarda; `nota` es la letra chica que va bajo
 * el nombre (el requisito según la persona y la observación de la política).
 */
interface FilaChecklist { key: string; label: string; nota?: string }

function SectionRows({ label, administrativo, items, item, setItem, adminEditable, jurEditable }: {
  label: string; administrativo: boolean; items: FilaChecklist[];
  item: (k: string) => ItemState; setItem: (k: string, p: Partial<ItemState>) => void;
  /** Columnas de la etapa previa: solo Administrativa, y solo en su etapa. */
  adminEditable: boolean;
  /** Columnas de la etapa contractual: solo Jurídica, y solo en la suya. */
  jurEditable: boolean;
}) {
  return (
    <>
      <tr className="bg-[hsl(var(--canalco-neutral-200))]">
        <td colSpan={7} className="border border-[#0a2a52] px-2 py-1 font-bold uppercase text-[10px] tracking-wide">{label}</td>
      </tr>
      {items.map(({ key, label: texto, nota }) => {
        const st = item(key);
        return (
          <tr key={key}>
            <td className="border border-[#0a2a52] px-2 py-1">
              {texto}
              {nota && (
                <span className="block text-[10px] text-[hsl(var(--canalco-neutral-600))] leading-tight">{nota}</span>
              )}
            </td>
            {administrativo ? (
              <>
                <Cbx checked={st.presentaSi} disabled={!adminEditable} onChange={(v) => setItem(key, { presentaSi: v })} />
                <Cbx checked={st.presentaNo} disabled={!adminEditable} onChange={(v) => setItem(key, { presentaNo: v })} />
                <td className="border border-[#0a2a52] px-1 py-0.5">
                  <input value={st.obsAdm} disabled={!adminEditable} onChange={(e) => setItem(key, { obsAdm: e.target.value })} className="w-full bg-transparent outline-none text-[11px] disabled:opacity-100" />
                </td>
              </>
            ) : (
              <td colSpan={3} className="border border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))]"></td>
            )}
            <Cbx checked={st.revSi} disabled={!jurEditable} onChange={(v) => setItem(key, { revSi: v })} />
            <Cbx checked={st.revNo} disabled={!jurEditable} onChange={(v) => setItem(key, { revNo: v })} />
            <td className="border border-[#0a2a52] px-1 py-0.5">
              <input value={st.obsJur} disabled={!jurEditable} onChange={(e) => setItem(key, { obsJur: e.target.value })} className="w-full bg-transparent outline-none text-[11px] disabled:opacity-100" />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Cbx({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <td className="border border-[#0a2a52] text-center px-1 py-0.5">
      {/* Bloqueada se ve igual de nítida: es un registro que hay que poder leer. */}
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className={'w-3.5 h-3.5 accent-[hsl(var(--canalco-primary))] ' + (disabled ? 'cursor-default' : 'cursor-pointer')} />
    </td>
  );
}

function RevisionBlock({ title, nombre, cargo, fecha, hint, last }: {
  title: string; nombre: string; cargo: string; fecha: string; hint: string; last?: boolean;
}) {
  const fmtFecha = (v: string) => {
    if (!v) return '';
    const [y, m, d] = v.split('-');
    return d && m && y ? `${d}/${m}/${y}` : v;
  };
  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[70px_1fr] border-t border-[#0a2a52]">
      <div className="px-2 py-1 font-bold border-r border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))]">{label}</div>
      <div className="px-2 py-1 text-[12px] min-h-[1.7em]">
        {value || <span className="italic text-[hsl(var(--canalco-neutral-400))]">—</span>}
      </div>
    </div>
  );
  return (
    <div className={last ? '' : 'border-r border-[#0a2a52]'}>
      <div className="px-3 py-2 font-bold text-center bg-[hsl(var(--canalco-neutral-200))] border-b border-[#0a2a52]">{title}</div>
      {row('NOMBRE', nombre)}
      {row('CARGO', cargo)}
      {row('FECHA', fmtFecha(fecha))}
      <div className="no-print px-2 py-1 text-[10px] italic text-[hsl(var(--canalco-neutral-500))] border-t border-[#0a2a52]">
        Automático · {hint}
      </div>
    </div>
  );
}
