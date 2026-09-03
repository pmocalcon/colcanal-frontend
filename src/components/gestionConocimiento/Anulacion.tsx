/**
 * La anulación en el panel de estado de los cuatro formatos de Talento Humano.
 *
 * Vive en un componente compartido porque el préstamo, el permiso, las vacaciones y las
 * horas extras la muestran igual: los mismos botones, el mismo aviso y el mismo motivo.
 * Repetirlo en cuatro páginas garantizaba que en la quinta corrección quedaran diciendo
 * cosas distintas.
 *
 * @see anulacionWorkflow — quién anula, quién solicita y desde qué estados.
 */

import { AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  accionesAnulacion,
  esAnulado,
  esperaAnulacion,
} from '@/utils/anulacionWorkflow';
import type { GcSolicitud } from '@/services/gestionConocimiento.service';

/** «2026-09-03» → «03/09/2026». Devuelve el texto tal cual si no lo reconoce. */
const dia = (v: unknown): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? '');
};

/**
 * El aviso de que el documento está anulado o de que hay una anulación esperando.
 *
 * Va antes que los botones y no después: quien abre el documento tiene que enterarse de
 * que está anulado antes de ponerse a leer sus cifras.
 */
export function AvisoAnulacion({ sol }: { sol: GcSolicitud }) {
  const d = sol.data ?? {};
  const estado = sol.estado ?? '';

  if (esAnulado(estado)) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <Ban className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
        <div className="text-xs text-red-800">
          <p className="font-semibold">
            Documento anulado
            {d.anuladaPor ? ` por ${d.anuladaPor}` : ''}
            {d.anuladaFecha ? ` el ${dia(d.anuladaFecha)}` : ''}
          </p>
          {d.anulacionMotivo && <p className="mt-0.5">Motivo: {d.anulacionMotivo}</p>}
          <p className="mt-1 text-red-700">
            No admite más pasos, y lo que hubiera dejado en nómina ya se retiró.
          </p>
        </div>
      </div>
    );
  }

  if (esperaAnulacion(estado)) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
        <div className="text-xs text-orange-800">
          <p className="font-semibold">
            Anulación solicitada
            {d.anulacionSolicitadaPor ? ` por ${d.anulacionSolicitadaPor}` : ''}
            {d.anulacionSolicitadaFecha ? ` el ${dia(d.anulacionSolicitadaFecha)}` : ''}
          </p>
          {d.anulacionMotivo && <p className="mt-0.5">Motivo: {d.anulacionMotivo}</p>}
          <p className="mt-1 text-orange-700">
            El trámite está detenido hasta que Talento Humano la confirme o la rechace.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Los botones de anulación.
 *
 * Van separados de los del flujo por una línea, a propósito: anular no es un paso más
 * del trámite sino salirse de él, y mezclarlo entre «Aprobar» y «Devolver» invita a
 * pulsarlo por inercia.
 */
export function BotonesAnulacion({
  estado,
  nombreRol,
  puedeSolicitar,
  onAccion,
}: {
  estado: string;
  nombreRol?: string;
  /** Es quien hizo la solicitud, o quien la tiene ahora en su bandeja. */
  puedeSolicitar: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
}) {
  const acciones = accionesAnulacion(estado, nombreRol, puedeSolicitar);
  if (acciones.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#e6e6f0]">
      {acciones.map((a) => (
        <Button
          key={a.accion}
          onClick={() => onAccion(a.accion, a.requiereMotivo)}
          variant={a.tone === 'danger' ? 'outline' : 'default'}
          size="sm"
          className={
            a.tone === 'danger'
              ? 'border-red-300 text-red-700 hover:bg-red-50 gap-1.5'
              : 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00] gap-1.5'
          }
        >
          {a.tone === 'danger' && <Ban className="w-3.5 h-3.5" />}
          {a.label}
        </Button>
      ))}
    </div>
  );
}
