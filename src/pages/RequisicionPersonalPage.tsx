import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo, tipoRequisicionDe } from '@/config/juridicaContratos';
import { esRolPmo } from '@/utils/rolesPmo';
import {
  RequisicionPersonalCuerpo, Banda, DateBox,
  EMPTY_REQUISICION, prellenarRequisicion, type RequisicionState,
} from '@/components/juridica/requisicionPersonalDoc';

/**
 * Formato GTH-001-F · "Solicitud de Requisición de Personal", en su propia página.
 *
 * El cuerpo es el mismo que se pinta dentro de la solicitud cuando el trámite se abre
 * como requisición de personal; acá se le suma la cabecera oficial del formato, que es
 * lo que hace falta para imprimirlo. Esta página es la que sirve para volver sobre la
 * requisición cuando la solicitud ya salió de borrador y su formulario quedó bloqueado.
 *
 * Ruta: `.../juridica/:id/requisicion-personal`. Se guarda en data.requisicionPersonal.
 */

/**
 * Quién la diligencia. Espeja `DOCS_DEL_SOLICITANTE` del backend, que es quien manda:
 * la requisición nace en el área que pide la vacante, no en Jurídica.
 */
const puedeEditar = (rol: string | undefined, esCreador: boolean): boolean => {
  const r = (rol ?? '').toLowerCase();
  return esRolPmo(rol) || r.includes('juríd') || r.includes('jurid')
    || r.includes('administrativ') || esCreador;
};

export default function RequisicionPersonalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<RequisicionState>(EMPTY_REQUISICION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const tipoContrato = String(sol?.data?.tipoContrato ?? '');
  // Manda el selector de la solicitud; sin elegir, lo propone el tipo de contrato.
  const habilitada = !!sol
    && tipoRequisicionDe(sol.data?.tipoRequisicion, tipoContrato) === 'personal';
  const editable = puedeEditar(user?.nombreRol, sol?.createdBy === user?.userId);

  const set = <K extends keyof RequisicionState>(k: K, v: RequisicionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const d = (data.data ?? {}) as Record<string, any>;
        setF(prellenarRequisicion(d, d.requisicionPersonal));
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la requisición');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'requisicionPersonal', f);
      toast.success('Requisición guardada');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

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
          .doc { box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" title="Volver a la solicitud"
            onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">
              Solicitud de Requisición de Personal
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Formato GTH-001-F · Solicitud N.º {solicitudId}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && (
            <Button onClick={handleSave} disabled={saving}
              className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">
              Esta solicitud no lleva <b>requisición de personal</b>.
            </p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">
              Va por el otro formato: <b>Solicitud de prestación de servicios, alquiler, obra
              y/o suministro</b> (GTH-002-F). Para diligenciar la requisición de personal,
              cambia el <b>tipo de requisición</b> en la solicitud.
              {tipoContrato
                ? <> Su tipo de contrato es <b>{getTipo(tipoContrato)?.nombre ?? tipoContrato}</b>.</>
                : null}
            </p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2"
              onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
            <div className="doc bg-white border border-[#0a2a52] text-[11.5px] text-black shadow-md">

              {/* Cabecera oficial del formato */}
              <div className="grid grid-cols-[150px_1fr_190px] border-b border-[#0a2a52]">
                <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
                  <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
                </div>
                <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[15px] border-r border-[#0a2a52]">
                  SOLICITUD DE REQUISICIÓN DE PERSONAL
                </div>
                <div className="grid grid-cols-[70px_1fr]">
                  <div className="row-span-3 flex items-center justify-center p-1 border-r border-[#0a2a52]">
                    <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
                  </div>
                  <div className="grid grid-cols-[auto_1fr] text-[10px]">
                    <CodeCell label="CÓDIGO" value="GTH-001-F" />
                    <CodeCell label="FECHA" value="19/04/2023" />
                    <CodeCell label="VERSIÓN" value="1" last />
                  </div>
                </div>
              </div>

              {/* Fecha · empresa · centro de costo */}
              <div className="grid grid-cols-3 border-b border-[#0a2a52]">
                <div className="border-r border-[#0a2a52]">
                  <Banda>FECHA DE LA SOLICITUD</Banda>
                  <div className="grid grid-cols-3">
                    <DateBox label="DIA" value={f.dia} onChange={(v) => set('dia', v)} />
                    <DateBox label="MES" value={f.mes} onChange={(v) => set('mes', v)} />
                    <DateBox label="AÑO" value={f.anio} onChange={(v) => set('anio', v)} last />
                  </div>
                </div>
                <div className="border-r border-[#0a2a52]">
                  <Banda>EMPRESA</Banda>
                  <input value={f.empresa} onChange={(e) => set('empresa', e.target.value)}
                    className="w-full bg-transparent outline-none px-2 py-1 text-[11.5px]" />
                </div>
                <div>
                  <Banda>CENTRO DE COSTO</Banda>
                  <input value={f.centroCosto} onChange={(e) => set('centroCosto', e.target.value)}
                    className="w-full bg-transparent outline-none px-2 py-1 text-[11.5px]" />
                </div>
              </div>

              <RequisicionPersonalCuerpo value={f} onChange={setF} />
            </div>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            La requisición la diligencia quien pide la vacante, Administrativa o Jurídica.
            Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}:</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}
