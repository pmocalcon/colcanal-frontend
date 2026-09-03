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

import { useState } from 'react';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  accionesAnulacion,
  esAnulado,
  esperaAnulacion,
  type AccionAnulacion,
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
 * Lo que dice el cuadro de diálogo en cada una de las tres acciones.
 *
 * El texto cambia porque las tres cosas son distintas: pedir la anulación es abrir una
 * puerta, confirmarla es cerrarla para siempre y rechazarla es devolver el trámite a
 * donde estaba. Un mismo «Indica el motivo» para las tres no le decía a nadie qué estaba
 * a punto de pasar.
 */
const TEXTOS: Record<
  AccionAnulacion['accion'],
  { titulo: string; descripcion: string; etiqueta: string; ejemplo: string; confirmar: string }
> = {
  solicitar_anulacion: {
    titulo: 'Solicitar la anulación',
    descripcion:
      'El trámite queda detenido hasta que Talento Humano confirme o rechace la anulación. El motivo que escribas es lo que van a leer para decidir.',
    etiqueta: 'Motivo de la anulación',
    ejemplo: 'Ej.: el permiso ya no se va a tomar porque se aplazó la cita médica.',
    confirmar: 'Solicitar la anulación',
  },
  anular: {
    titulo: 'Anular el documento',
    descripcion:
      'El documento queda anulado y no admite más pasos. Si ya estaba aprobado, se retira también lo que dejó en nómina.',
    etiqueta: 'Motivo de la anulación',
    ejemplo: 'Ej.: se registró por error, la planilla correcta es la N.º 42.',
    confirmar: 'Anular',
  },
  rechazar_anulacion: {
    titulo: 'Rechazar la anulación',
    descripcion:
      'El trámite vuelve al estado en que estaba y sigue su curso normal. Quien pidió la anulación recibe tu explicación por correo.',
    etiqueta: 'Motivo del rechazo',
    ejemplo: 'Ej.: el permiso ya se disfrutó, no hay nada que anular.',
    confirmar: 'Rechazar la anulación',
  },
};

/**
 * Los botones de anulación.
 *
 * Van separados de los del flujo por una línea, a propósito: anular no es un paso más
 * del trámite sino salirse de él, y mezclarlo entre «Aprobar» y «Devolver» invita a
 * pulsarlo por inercia.
 *
 * El motivo se pide acá, en un cuadro de diálogo propio y no en el `window.prompt` del
 * resto del flujo. Son tres razones: el diálogo puede explicar qué va a pasar antes de
 * que la persona escriba, el campo es una caja de varias líneas en la que cabe una
 * explicación de verdad, y el botón de confirmar está apagado mientras esté vacío —el
 * servidor rechaza el motivo en blanco, así que más vale que aquí no se pueda ni
 * intentar—.
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
  onAccion: (accion: string, requiereMotivo?: boolean, motivo?: string) => void | Promise<void>;
}) {
  const acciones = accionesAnulacion(estado, nombreRol, puedeSolicitar);
  const [pendiente, setPendiente] = useState<AccionAnulacion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (acciones.length === 0) return null;

  const abrir = (a: AccionAnulacion) => {
    setMotivo('');
    setPendiente(a);
  };

  const cerrar = () => {
    if (enviando) return;
    setPendiente(null);
    setMotivo('');
  };

  const confirmar = async () => {
    if (!pendiente || !motivo.trim()) return;
    setEnviando(true);
    try {
      await onAccion(pendiente.accion, true, motivo.trim());
      setPendiente(null);
      setMotivo('');
    } finally {
      setEnviando(false);
    }
  };

  const texto = pendiente ? TEXTOS[pendiente.accion] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#e6e6f0]">
      {acciones.map((a) => (
        <Button
          key={a.accion}
          onClick={() => abrir(a)}
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

      <Dialog open={!!pendiente} onOpenChange={(v) => !v && cerrar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{texto?.titulo}</DialogTitle>
            <DialogDescription>{texto?.descripcion}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>
              {texto?.etiqueta} <span className="text-red-600">*</span>
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              autoFocus
              placeholder={texto?.ejemplo}
            />
            {/* El motivo queda en la bitácora y en el aviso que ve todo el que abra el
                documento; se dice acá para que se escriba pensando en quien lo lea. */}
            <p className="text-xs text-[#8a8aa3]">
              Queda guardado en el historial del documento y se envía por correo.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={enviando || !motivo.trim()}
              className={
                pendiente?.tone === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]'
              }
            >
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {texto?.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
