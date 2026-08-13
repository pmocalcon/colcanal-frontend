import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';

/**
 * Solicitud de Permiso · formato GTH-009-F (G. de talento humano).
 *
 * Formulario impreso de una sola tabla: etiqueta a la izquierda, espacio para escribir a
 * la derecha. Se diligencia, se guarda y se imprime para firmarlo.
 *
 * Ruta: `.../talento-humano/permiso/:id`.
 */

/** Sí y No son excluyentes; vacío = la dirección todavía no se pronunció. */
type Decision = 'si' | 'no' | '';

interface PermisoState {
  fechaSolicitud: string;
  proyecto: string;
  nombre: string;
  cargo: string;
  motivo: string;
  fechaPermiso: string;
  horario: string;
  nombreSolicitante: string;

  // ── Aprobación interna ──
  /** Por clave de dirección. Las firmas van a mano sobre el impreso. */
  aprobaciones: Record<string, Decision>;
  fechaAprobacion: string;
  observaciones: string;
}

const EMPTY: PermisoState = {
  fechaSolicitud: '', proyecto: '', nombre: '', cargo: '',
  motivo: '', fechaPermiso: '', horario: '', nombreSolicitante: '',
  aprobaciones: {}, fechaAprobacion: '', observaciones: '',
};

/**
 * Las direcciones que se pronuncian, tal como están impresas.
 *
 * Se guardan por **clave estable** y no por su etiqueta: si mañana una dirección se
 * renombra, lo marcado sigue donde estaba en vez de perderse.
 */
const DIRECCIONES: { key: string; label: string }[] = [
  { key: 'comercial', label: 'APROBACIÓN DIRECCIÓN COMERCIAL' },
  { key: 'financiera', label: 'APROBACIÓN DIRECCIÓN FINANCIERA' },
  { key: 'operativa', label: 'APROBACIÓN DIRECCIÓN OPERATIVA' },
  { key: 'juridica', label: 'APROBACIÓN DIRECCIÓN JURIDICA' },
  { key: 'pmo', label: 'APROBACIÓN DIRECCIÓN PMO' },
  { key: 'gerencia-proyectos', label: 'APROBACIÓN GERENCIA DE PROYECTOS' },
  { key: 'tecnica', label: 'APROBACIÓN DE DIRECCIÓN TECNICA' },
  { key: 'tics', label: "APROBACIÓN DIRECCIÓN TIC's" },
  { key: 'administrativa-financiera', label: 'APROBACIÓN DIRECCIÓN ADMINISTRATIVA Y FINANCIERA' },
];

/**
 * Las filas del formato, en su orden. El renglón de la firma va aparte: se firma a mano.
 *
 * El tipo se restringe a los campos de texto —no a todo `PermisoState`— porque estas
 * filas pintan un `input`, y `aprobaciones` no es un texto.
 */
type CampoTexto =
  | 'fechaSolicitud' | 'proyecto' | 'nombre' | 'cargo'
  | 'motivo' | 'fechaPermiso' | 'horario' | 'nombreSolicitante';

const FILAS: { key: CampoTexto; label: string; area?: boolean }[] = [
  { key: 'fechaSolicitud', label: 'FECHA DE SOLICITUD:' },
  { key: 'proyecto', label: 'PROYECTO:' },
  { key: 'nombre', label: 'NOMBRE:' },
  { key: 'cargo', label: 'CARGO:' },
  { key: 'motivo', label: 'MOTIVO:', area: true },
  { key: 'fechaPermiso', label: 'FECHA DE PERMISO:' },
  { key: 'horario', label: 'HORARIO:' },
  { key: 'nombreSolicitante', label: 'NOMBRE DEL SOLICITANTE' },
];

export default function SolicitudPermisoPage() {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PermisoState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PermisoState>(k: K, v: PermisoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /** Marcar Sí apaga No, y volver a marcar lo mismo deja la fila sin pronunciar. */
  const decidir = (key: string, valor: Exclude<Decision, ''>) =>
    setF((p) => ({
      ...p,
      aprobaciones: { ...p.aprobaciones, [key]: p.aprobaciones[key] === valor ? '' : valor },
    }));

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        const saved = (row.data ?? {}) as Partial<PermisoState>;
        setF({ ...EMPTY, ...saved, aprobaciones: saved.aprobaciones ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
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
      await gestionConocimientoService.update(docId, { data: f });
      toast.success('Solicitud guardada');
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
          @page { size: Letter portrait; margin: 15mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/permiso')} title="Volver a las solicitudes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Solicitud de permiso</h1>
            <p className="text-xs text-[#4a4a63]">Formato GTH-009-F · Solicitud N.º {docId}</p>
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
        <div className="doc bg-white border border-black text-[11px] text-black shadow-md">

          {/* Encabezado del formato */}
          <div className="grid grid-cols-[110px_1fr_110px_170px] border-b border-black">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[12px] tracking-wide border-r border-black text-[#4a4a63]">
              SOLICITUD DE PERMISO
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[10px] content-start">
              <Meta label="CÓDIGO:" value="GTH-009-F" />
              <Meta label="FECHA:" value="06/10/2025" />
              <Meta label="VERSIÓN:" value="2" last />
            </div>
          </div>

          {/* Cuerpo */}
          <table className="w-full border-collapse">
            <tbody>
              {FILAS.map(({ key, label, area }) => (
                <tr key={key}>
                  <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top w-[38%]">
                    {label}
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    {area ? (
                      <textarea
                        value={f[key]}
                        onChange={(e) => set(key, e.target.value)}
                        rows={2}
                        className="w-full bg-transparent outline-none resize-y text-[11px]"
                      />
                    ) : (
                      <input
                        value={f[key]}
                        onChange={(e) => set(key, e.target.value)}
                        className="w-full bg-transparent outline-none text-[11px]"
                      />
                    )}
                  </td>
                </tr>
              ))}
              {/* La firma no se teclea: se firma a mano sobre el impreso. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  FIRMA DEL SOLICITANTE
                </td>
                <td className="border border-black px-2 py-6"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Aprobación interna. Cuadro aparte, como en el papel: lo diligencia cada
            dirección, no quien pide el permiso. */}
        <div className="doc bg-white border border-black text-[11px] text-black shadow-md mt-6">
          <p className="px-2 py-1.5 font-bold border-b border-black">
            APROBACIÓN INTERNA DE LA SOLICITUD DE PERMISO
          </p>

          <table className="w-full border-collapse">
            <tbody>
              {/* La fecha no se vuelve a teclear: es la de arriba. Con dos campos, el
                  mismo papel podría acabar mostrando dos fechas de solicitud distintas. */}
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] w-[38%]">
                  FECHA DE SOLICITUD
                </td>
                <td className="border border-black px-2 py-1" colSpan={3}>{f.fechaSolicitud}</td>
              </tr>

              {DIRECCIONES.map(({ key, label }) => {
                const d = f.aprobaciones[key] ?? '';
                return (
                  <tr key={key}>
                    <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-middle">
                      {label}
                    </td>
                    <td className="border border-black px-2 py-1 w-[14%]">
                      <Casilla label="SI" checked={d === 'si'} onToggle={() => decidir(key, 'si')} />
                    </td>
                    <td className="border border-black px-2 py-1 w-[14%]">
                      <Casilla label="NO" checked={d === 'no'} onToggle={() => decidir(key, 'no')} />
                    </td>
                    {/* La firma va a mano sobre el impreso. */}
                    <td className="border border-black px-2 py-1 w-[26%]">FIRMA:</td>
                  </tr>
                );
              })}

              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))]">
                  FECHA DE APROBACIÓN
                </td>
                <td className="border border-black px-2 py-1" colSpan={3}>
                  <input
                    value={f.fechaAprobacion}
                    onChange={(e) => set('fechaAprobacion', e.target.value)}
                    className="w-full bg-transparent outline-none text-[11px]"
                  />
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 font-bold bg-[hsl(var(--canalco-neutral-100))] align-top">
                  OBSERVACIONES
                </td>
                <td className="border border-black px-2 py-1 align-top" colSpan={3}>
                  <textarea
                    value={f.observaciones}
                    onChange={(e) => set('observaciones', e.target.value)}
                    rows={3}
                    className="w-full bg-transparent outline-none resize-y text-[11px]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

/** Casilla del formato: etiqueta y cuadrito, como se imprime. */
function Casilla({ label, checked, onToggle }: {
  label: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span className="font-semibold">{label}</span>
      <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-black" />
    </label>
  );
}

function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold ' + (last ? '' : 'border-b border-black')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-black ' + (last ? '' : 'border-b border-black')}>{value}</div>
    </>
  );
}
