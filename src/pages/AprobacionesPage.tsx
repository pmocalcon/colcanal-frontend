import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { aprobacionesService } from '@/services/aprobaciones.service';
import type { Bandeja, ItemAprobacion } from '@/services/aprobaciones.service';
import { approveRequisition, rejectRequisition } from '@/services/requisition.service';
import { directorBudgetsService } from '@/services/director-budgets.service';
import { surveysService } from '@/services/surveys.service';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Loader2,
  Check,
  X,
  ExternalLink,
  Stamp,
  CircleCheck,
  RefreshCw,
} from 'lucide-react';

/** A partir de aquí una firma pendiente deja de ser normal. */
const DIAS_ALERTA = 8;

/**
 * Un color por bandeja, para que la lista se lea de un vistazo.
 *
 * La bandeja mezcla cosas de módulos distintos en una sola columna, y todos los
 * títulos en negro obligaban a leerlos para saber dónde termina una y empieza
 * otra. El color va en el título, en el contador y en una marca a la izquierda:
 * repetido en tres sitios se distingue también en pantallas donde el texto de
 * color queda lavado.
 *
 * Se eligen por familia y no al azar: lo de Compras en azules —requisiciones y
 * órdenes—, el dinero de Obras en verde, lo que es una excepción en ámbar, y lo
 * de personas en cálidos.
 */
const COLORES_BANDEJA: Record<string, { punto: string; titulo: string; contador: string }> = {
  requisiciones:      { punto: 'bg-blue-500',    titulo: 'text-blue-800',    contador: 'bg-blue-100 text-blue-800' },
  'ordenes-compra':   { punto: 'bg-indigo-500',  titulo: 'text-indigo-800',  contador: 'bg-indigo-100 text-indigo-800' },
  presupuestos:       { punto: 'bg-emerald-500', titulo: 'text-emerald-800', contador: 'bg-emerald-100 text-emerald-800' },
  'compra-anticipada':{ punto: 'bg-amber-500',   titulo: 'text-amber-800',   contador: 'bg-amber-100 text-amber-800' },
  contratos:          { punto: 'bg-violet-500',  titulo: 'text-violet-800',  contador: 'bg-violet-100 text-violet-800' },
  anticipos:          { punto: 'bg-teal-500',    titulo: 'text-teal-800',    contador: 'bg-teal-100 text-teal-800' },
  prestamos:          { punto: 'bg-rose-500',    titulo: 'text-rose-800',    contador: 'bg-rose-100 text-rose-800' },
};

/** Gris para una bandeja nueva: mejor sin color que con el de otra. */
const COLOR_NEUTRO = {
  punto: 'bg-slate-400',
  titulo: 'text-slate-800',
  contador: 'bg-slate-100 text-slate-800',
};

const colorDe = (clave: string) => COLORES_BANDEJA[clave] ?? COLOR_NEUTRO;

const pesos = (v: number | null) =>
  v == null
    ? null
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(v);

interface Decision {
  bandeja: Bandeja;
  item: ItemAprobacion;
  aprobar: boolean;
}

/**
 * Bandeja única de Gerencia: todo lo que espera su firma, sin recorrer módulos.
 *
 * La página no aprueba por su cuenta: llama a los endpoints de cada módulo, que
 * son los que conocen las reglas. Si alguno le niega la acción a quien la ejecuta
 * —el PMO no puede aprobar una orden de compra, por ejemplo—, el error del
 * backend se muestra tal cual en vez de disimularse.
 */
export default function AprobacionesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esGerencia = user?.nombreRol === 'Gerencia';

  const [bandejas, setBandejas] = useState<Bandeja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [motivo, setMotivo] = useState('');

  const total = useMemo(
    () => bandejas.reduce((suma, b) => suma + b.total, 0),
    [bandejas],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setBandejas(await aprobacionesService.getPendientes());
    } catch {
      toast.error('No se pudieron cargar las aprobaciones pendientes');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Cada origen se decide con el endpoint de su módulo. */
  const ejecutar = async ({ bandeja, item, aprobar }: Decision, texto: string) => {
    switch (bandeja.clave) {
      case 'requisiciones':
        return aprobar
          ? approveRequisition(item.id, { comments: texto || undefined })
          : rejectRequisition(item.id, { comments: texto });
      case 'presupuestos':
        return aprobar
          ? directorBudgetsService.approve(item.id)
          : directorBudgetsService.reject(item.id);
      case 'compra-anticipada':
        return surveysService.resolverRequisicionAnticipada(
          item.extra?.companyId as number,
          (item.extra?.projectId ?? null) as number | null,
          item.extra?.actaNumber as string,
          aprobar,
          texto,
        );
      // Los tres usan la misma pareja de acciones en su máquina de estados. El
      // préstamo se aprueba aquí por el valor solicitado; para aprobar por menos hay
      // que abrirlo con «Ver» y fijar el valor en el bloque 3 del formato.
      case 'contratos':
      case 'anticipos':
      case 'prestamos':
        return gestionConocimientoService.transition(item.id, {
          accion: aprobar ? 'aprobar_gerencia' : 'rechazar_gerencia',
          motivo: texto || undefined,
        });
      default:
        throw new Error('Esta aprobación se resuelve en su propia pantalla');
    }
  };

  const confirmar = async () => {
    if (!decision) return;
    setGuardando(true);
    try {
      await ejecutar(decision, motivo.trim());
      toast.success(decision.aprobar ? 'Aprobado' : 'Rechazado');
      setDecision(null);
      setMotivo('');
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data
        ?.message;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo registrar la decisión');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Stamp className="h-6 w-6 text-amber-600" />
            Aprobaciones
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!cargando && (
            <span className="text-sm text-muted-foreground">
              {total === 0 ? 'Nada pendiente' : `${total} pendiente${total === 1 ? '' : 's'}`}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw className={'mr-2 h-4 w-4 ' + (cargando ? 'animate-spin' : '')} />
            Actualizar
          </Button>
        </div>
      </div>

      {!esGerencia && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Está viendo la bandeja de Gerencia. Puede consultarla completa, pero cada decisión
          la sigue validando su módulo: algunas —como aprobar una orden de compra— exigen el
          rol Gerencia y le serán negadas.
        </p>
      )}

      {cargando && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      {!cargando && total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
          <CircleCheck className="h-10 w-10 text-green-600" />
          <p className="font-medium">No hay nada esperando firma</p>
          <p className="text-sm text-muted-foreground">
            Las seis fuentes están al día: requisiciones, órdenes de compra, presupuestos,
            compras anticipadas, contratos y anticipos.
          </p>
        </div>
      )}

      {!cargando &&
        bandejas
          .filter((b) => b.total > 0)
          .map((bandeja) => (
            <section key={bandeja.clave} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 self-center rounded-sm ${colorDe(bandeja.clave).punto}`}
                />
                <h2 className={`text-lg font-semibold ${colorDe(bandeja.clave).titulo}`}>
                  {bandeja.titulo}
                </h2>
                <Badge variant="secondary" className={colorDe(bandeja.clave).contador}>
                  {bandeja.total}
                </Badge>
                <span className="text-sm text-muted-foreground">· {bandeja.modulo}</span>
              </div>

              <div className="space-y-2">
                {bandeja.items.map((item) => {
                  const tarde = item.dias >= DIAS_ALERTA;
                  const valor = pesos(item.valor);
                  return (
                    <div
                      key={`${bandeja.clave}-${item.id}`}
                      className={
                        'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ' +
                        (tarde ? 'border-red-200 bg-red-50/60' : '')
                      }
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{item.titulo}</span>
                          {valor && <span className="text-sm font-medium">{valor}</span>}
                          <span
                            className={
                              'text-sm ' +
                              (tarde ? 'font-semibold text-red-700' : 'text-muted-foreground')
                            }
                          >
                            · {item.dias} día{item.dias === 1 ? '' : 's'} esperando
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.detalle}</p>
                        {item.solicitante && (
                          <p className="text-sm text-muted-foreground">
                            Solicita: {item.solicitante}
                          </p>
                        )}
                        {item.extra?.justificacion && (
                          <p className="text-sm">«{item.extra.justificacion}»</p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(item.ruta)}
                          title="Ver el detalle en su módulo"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Ver
                        </Button>

                        {bandeja.decision === 'directa' ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setDecision({ bandeja, item, aprobar: true });
                                setMotivo('');
                              }}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => {
                                setDecision({ bandeja, item, aprobar: false });
                                setMotivo('');
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Rechazar
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => navigate(item.ruta)}>
                            Revisar y aprobar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.aprobar ? 'Aprobar' : 'Rechazar'} {decision?.item.titulo}
            </DialogTitle>
            <DialogDescription>
              {decision?.bandeja.titulo} · {decision?.item.detalle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{decision?.aprobar ? 'Comentario (opcional)' : 'Motivo del rechazo'}</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder={
                decision?.aprobar
                  ? 'Puede dejarlo en blanco'
                  : 'Explique qué debe corregirse'
              }
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={guardando || (!decision?.aprobar && !motivo.trim())}
              className={decision?.aprobar ? undefined : 'bg-red-600 hover:bg-red-700'}
            >
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decision?.aprobar ? 'Aprobar' : 'Rechazar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
