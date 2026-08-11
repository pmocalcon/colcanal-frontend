import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  accionesDisponibles, estadoLabel,
  type DocumentoJuridica, type JuridicaEstado,
} from '@/utils/juridicaWorkflow';

/**
 * La acción de la etapa, en el documento donde se decide.
 *
 * Cada transición declara su documento (ver `TRANSICIONES`). "Trámite validado" se
 * decide leyendo la lista de chequeo, así que su botón vive en la lista de chequeo y
 * no en la solicitud: quien acaba de marcar los documentos ya tiene delante lo que
 * necesita para decidir, y no tiene que volver atrás a buscar un botón.
 *
 * Se pinta sola: si en este documento no hay nada que hacer —por la etapa o por el
 * rol—, no ocupa espacio.
 */

interface Props {
  sol: GcSolicitud | null;
  /** El documento donde está montada. Solo muestra las acciones que le pertenecen. */
  documento: DocumentoJuridica;
  /** Recibe la solicitud recargada tras la transición. */
  onCambio: (sol: GcSolicitud) => void;
  /**
   * Se ejecuta antes de la transición; si devuelve `false`, la cancela sin decir nada
   * —quien la implementa ya avisó por qué—. Sirve para guardar el documento: la acción
   * afirma lo que el documento dice —"trámite validado" afirma que la lista de chequeo
   * está completa—, y avanzar con cambios sin guardar adelantaría el trámite sobre un
   * documento que nadie escribió.
   */
  onAntes?: () => Promise<boolean>;
}

export function AccionesFlujo({ sol, documento, onCambio, onAntes }: Props) {
  const { user } = useAuth();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  if (!sol) return null;
  const estado = sol.estado as JuridicaEstado;
  const acciones = accionesDisponibles(estado, user?.nombreRol, sol.createdBy === user?.userId)
    .filter((a) => a.documento === documento);
  if (acciones.length === 0) return null;

  const ejecutar = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;            // canceló
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    setEnCurso(accion);
    try {
      if (onAntes && !(await onAntes())) return;
      await gestionConocimientoService.transition(sol.solicitudId, { accion, motivo });
      toast.success('Acción registrada');
      onCambio(await gestionConocimientoService.get(sol.solicitudId));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    } finally {
      setEnCurso(null);
    }
  };

  return (
    <section className="no-print mb-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden shadow-[0_4px_20px_rgba(22,22,43,0.05)]">
      <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5 flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-[#16162b]">Acción de esta etapa</h2>
        <span className="text-xs text-[#4a4a63]">· {estadoLabel(estado)}</span>
      </header>
      <div className="px-5 py-3.5 flex flex-wrap items-center gap-3">
        {acciones.map((a) => (
          <Button
            key={a.accion}
            onClick={() => void ejecutar(a.accion, a.requiereMotivo)}
            disabled={enCurso !== null}
            variant={a.tone === 'danger' ? 'outline' : 'default'}
            className={a.tone === 'danger'
              ? 'gap-2 bg-white text-[#4a4a63] border-[#c9c9dc] hover:bg-[#f6f6fa]'
              : 'gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]'}
          >
            {enCurso === a.accion && <Loader2 className="w-4 h-4 animate-spin" />}
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
