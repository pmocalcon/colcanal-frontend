import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, LockOpen, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { cregService } from '@/services/creg.service';
import type { CregHojaMensual, CregMesCerrable } from '@/services/creg.service';

/**
 * Cierre mensual compartido por la Liquidación, ID OFF e ID ON.
 *
 * Las tres hojas se llevan mes a mes y se cierran igual, así que los botones,
 * los diálogos y el manejo de errores viven aquí una sola vez. Quien decide es
 * el backend: esto solo evita ofrecer lo que va a rechazar.
 */

interface Props {
  hoja: CregHojaMensual;
  companyId: number | null;
  projectId: number | null;
  /** Mes seleccionado, YYYY-MM. */
  ym: string | null;
  /** Cómo se lee el mes ("julio de 2026"). */
  mesLabel: string;
  /** Municipio, para el diálogo. */
  municipio: string;
  /** El mes tal como está guardado (de ahí sale si está aprobado). */
  mes: CregMesCerrable | undefined;
  /** Línea extra en la confirmación (p. ej. el valor a pagar). */
  resumen?: string;
  /** Qué queda bloqueado, en palabras de la hoja. */
  queSeBloquea: string;
  /** Persiste lo que está en pantalla antes de cerrar el mes. */
  onGuardar: () => Promise<void>;
  /** Recibe los meses que devolvió el backend tras aprobar/reabrir. */
  onActualizado: (meses: Record<string, any>) => void;
  disabled?: boolean;
}

export function CierreMes({
  hoja, companyId, projectId, ym, mesLabel, municipio, mes,
  resumen, queSeBloquea, onGuardar, onActualizado, disabled,
}: Props) {
  const { user } = useAuth();
  const esDirectorTecnico = user?.nombreRol === 'Director Técnico';
  const aprobado = !!mes?.aprobado;

  const [ocupado, setOcupado] = useState(false);
  const [confirmarAprobar, setConfirmarAprobar] = useState(false);
  const [confirmarReabrir, setConfirmarReabrir] = useState(false);
  const [motivo, setMotivo] = useState('');

  const aprobar = async () => {
    if (!companyId || !ym) return;
    setOcupado(true);
    try {
      // Se aprueba lo que está en pantalla, no la última versión persistida.
      await onGuardar();
      const res = await cregService.aprobarMes(hoja, companyId, ym, projectId);
      onActualizado(res.data?.meses ?? {});
      setConfirmarAprobar(false);
      const n = res.notificados?.length ?? 0;
      toast.success(
        n > 0
          ? `${mesLabel} aprobado. Se notificó a ${res.notificados.join(', ')}.`
          : `${mesLabel} aprobado, pero no hay Director de Proyecto con acceso a este municipio: nadie fue notificado.`,
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo aprobar el mes');
    } finally {
      setOcupado(false);
    }
  };

  const reabrir = async () => {
    if (!companyId || !ym) return;
    setOcupado(true);
    try {
      const res = await cregService.reabrirMes(hoja, companyId, ym, projectId, motivo);
      onActualizado(res.data?.meses ?? {});
      setConfirmarReabrir(false);
      setMotivo('');
      toast.success(`${mesLabel} quedó abierto de nuevo.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo reabrir el mes');
    } finally {
      setOcupado(false);
    }
  };

  const tituloChip = mes?.aprobadoPorNombre
    ? `Aprobado por ${mes.aprobadoPorNombre}${mes.aprobadoEn ? ` el ${new Date(mes.aprobadoEn).toLocaleDateString('es-CO')}` : ''}`
    : 'Mes aprobado y cerrado';

  return (
    <>
      {aprobado ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
            title={tituloChip}>
            <CheckCircle2 className="w-4 h-4" /> Mes aprobado
          </span>
          {esDirectorTecnico && (
            <Button variant="outline" onClick={() => setConfirmarReabrir(true)} disabled={ocupado}
              className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />}
              Reabrir
            </Button>
          )}
        </div>
      ) : esDirectorTecnico && (
        <Button variant="outline" onClick={() => setConfirmarAprobar(true)} disabled={ocupado || disabled}
          className="gap-2 border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10">
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Aprobar
        </Button>
      )}

      <Dialog open={confirmarAprobar} onOpenChange={(o) => !ocupado && setConfirmarAprobar(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              Aprobar {mesLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-[hsl(var(--canalco-neutral-700))]">
            <p>
              Se cierra <strong>{mesLabel}</strong> de <strong>{municipio}</strong>
              {resumen ? <> — <strong>{resumen}</strong></> : null}.
            </p>
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900">
              Quedan bloqueados {queSeBloquea}, y se le envía un correo al Director
              de Proyecto del municipio. Puedes reabrirlo después si hace falta.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmarAprobar(false)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={aprobar} disabled={ocupado}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprobar y cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarReabrir} onOpenChange={(o) => !ocupado && setConfirmarReabrir(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="w-5 h-5 text-amber-600" /> Reabrir {mesLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-[hsl(var(--canalco-neutral-700))]">
            <p>
              <strong>{mesLabel}</strong> de <strong>{municipio}</strong> vuelve a quedar
              editable.
            </p>
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900">
              La reapertura queda registrada con tu nombre y la fecha. Si el mes ya se
              reportó a la interventoría, cualquier cambio hay que informarlo.
            </p>
            <div>
              <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                Motivo (opcional)
              </label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por qué se reabre" className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmarReabrir(false)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={reabrir} disabled={ocupado}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
