import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { surveysService } from '@/services/surveys.service';
import type {
  Work,
  ActaProvisional,
  RequisicionSinCodigo,
  CompraAnticipadaPendiente,
} from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Loader2,
  FileClock,
  ShoppingCart,
  Check,
  X,
  Info,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CANALES = 'Canales & Contactos';

/**
 * Empresas que no operan obra. Mismo criterio que las demás pantallas del módulo.
 */
const EXCLUIDAS = ['Inversiones Garcés Escalante', 'Uniones y Alianzas'];

const ESTADO_RQ: Record<
  ActaProvisional['rqAnticipadaStatus'],
  { texto: string; clase: string } | null
> = {
  no_aplica: null,
  pendiente: { texto: 'Compra pendiente de Gerencia', clase: 'bg-amber-100 text-amber-800' },
  aprobada: { texto: 'Compra autorizada', clase: 'bg-green-100 text-green-800' },
  rechazada: { texto: 'Compra negada', clase: 'bg-red-100 text-red-800' },
};

/** El mensaje que manda el backend, que es el que le sirve a quien está en pantalla. */
const mensajeError = (e: unknown, porDefecto: string): string => {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === 'string' && msg.trim() ? msg : porDefecto;
};

/**
 * Días a partir de los cuales una compra sin imputar deja de ser normal y pasa a
 * ser un problema. No lo bloquea nada: solo cambia cómo se ve, para que alguien
 * pregunte por qué el acta no avanza.
 */
const DIAS_ALERTA = 30;

const ESTADO_ACTA: Record<string, string> = {
  borrador: 'En borrador',
  en_revision: 'En revisión técnica',
  en_aprobacion: 'En aprobación',
  aprobada: 'Aprobada',
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/**
 * Acta provisional: agrupar obras sueltas bajo un número de acta antes de que el
 * acta exista, para poder comprarles materiales.
 *
 * Es de Gerencia de Proyectos. La compra la autoriza Gerencia sobre el acta, no
 * sobre la requisición: por eso el botón de crear la requisición solo aparece
 * cuando la autorización ya está dada.
 */
export default function ActasProvisionalesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const rol = user?.nombreRol ?? '';
  const esGerenciaProyectos = rol === 'Gerencia de Proyectos';
  const esGerencia = rol === 'Gerencia';
  /** La Dirección Financiera entra solo al control, no a armar actas. */
  const soloVigilante = !esGerenciaProyectos && !esGerencia;

  // El correo trae el municipio puesto: quien viene a decidir no tiene que buscarlo.
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(() => {
    const v = Number(searchParams.get('company'));
    return v > 0 ? v : null;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(() => {
    const v = Number(searchParams.get('project'));
    return v > 0 ? v : null;
  });

  const [obras, setObras] = useState<Work[]>([]);
  const [actas, setActas] = useState<ActaProvisional[]>([]);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [numeroActa, setNumeroActa] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [pendientes, setPendientes] = useState<RequisicionSinCodigo[]>([]);
  const [bandeja, setBandeja] = useState<CompraAnticipadaPendiente[]>([]);
  const [solicitud, setSolicitud] = useState<ActaProvisional | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const [decision, setDecision] = useState<{ acta: ActaProvisional; aprobar: boolean } | null>(null);
  const [motivo, setMotivo] = useState('');

  const esCanales = useMemo(
    () => companies.find((c) => c.companyId === companyId)?.name === CANALES,
    [companies, companyId],
  );
  const municipioElegido = companyId !== null && (!esCanales || projectId !== null);

  const cargarPendientes = useCallback(() => {
    surveysService
      .getRequisicionesSinCodigo()
      .then(setPendientes)
      .catch(() => setPendientes([]));
    surveysService
      .getComprasAnticipadasPendientes()
      .then(setBandeja)
      .catch(() => setBandeja([]));
  }, []);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  useEffect(() => {
    masterDataService
      .getCompanies()
      .then((data) => setCompanies(data.filter((c) => !EXCLUIDAS.includes(c.name))))
      .catch(() => toast.error('No se pudieron cargar las empresas'));
  }, []);

  useEffect(() => {
    if (!companyId || !esCanales) {
      setProjects([]);
      setProjectId(null);
      return;
    }
    masterDataService
      .getProjects(companyId)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [companyId, esCanales]);

  const cargar = useCallback(async () => {
    if (!municipioElegido || companyId === null) return;
    setCargando(true);
    try {
      const [sinActa, provisionales] = await Promise.all([
        surveysService.getObrasSinActa(companyId, projectId),
        surveysService.getActasProvisionales(companyId, projectId),
      ]);
      setObras(sinActa);
      setActas(provisionales);
      setSeleccion(new Set());
      cargarPendientes();
    } catch {
      toast.error('No se pudieron cargar las obras del municipio');
    } finally {
      setCargando(false);
    }
  }, [companyId, projectId, municipioElegido, cargarPendientes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternar = (workId: number) => {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(workId)) siguiente.delete(workId);
      else siguiente.add(workId);
      return siguiente;
    });
  };

  const asignar = async () => {
    if (companyId === null) return;
    const numero = numeroActa.trim();
    if (!numero) return toast.error('Escriba el número de acta provisional');
    if (!seleccion.size) return toast.error('Seleccione al menos una obra');

    setGuardando(true);
    try {
      await surveysService.asignarActaProvisional(companyId, projectId, numero, [...seleccion]);
      toast.success(`${seleccion.size} obra(s) agrupadas en el acta ${numero}`);
      setNumeroActa('');
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo agrupar las obras'));
    } finally {
      setGuardando(false);
    }
  };

  const enviarSolicitud = async () => {
    if (!solicitud || companyId === null) return;
    setGuardando(true);
    try {
      await surveysService.solicitarRequisicionAnticipada(
        companyId,
        projectId,
        solicitud.actaNumber,
        justificacion,
      );
      toast.success('Solicitud enviada a Gerencia');
      setSolicitud(null);
      setJustificacion('');
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo enviar la solicitud'));
    } finally {
      setGuardando(false);
    }
  };

  const resolver = async () => {
    if (!decision) return;
    setGuardando(true);
    try {
      await surveysService.resolverRequisicionAnticipada(
        decision.acta.companyId,
        decision.acta.projectId,
        decision.acta.actaNumber,
        decision.aprobar,
        motivo,
      );
      toast.success(decision.aprobar ? 'Compra autorizada' : 'Compra negada');
      setDecision(null);
      setMotivo('');
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo registrar la decisión'));
    } finally {
      setGuardando(false);
    }
  };

  /** La bandeja trae menos campos que el acta; para decidir basta con estos. */
  const comoActa = (b: CompraAnticipadaPendiente): ActaProvisional =>
    ({
      actaId: b.actaId,
      companyId: b.companyId,
      projectId: b.projectId,
      actaNumber: b.actaNumber,
      rqAnticipadaJustificacion: b.justificacion,
    }) as ActaProvisional;

  /** La requisición se crea en Compras, ya con el acta puesta. */
  const irACrearRequisicion = (acta: ActaProvisional) => {
    const params = new URLSearchParams({
      company: String(acta.companyId),
      acta: acta.actaNumber,
      anticipada: '1',
    });
    if (acta.projectId) params.set('project', String(acta.projectId));
    navigate(`/dashboard/compras/requisiciones/crear?${params.toString()}`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileClock className="h-6 w-6 text-amber-600" />
            Actas provisionales
          </h1>
          <p className="text-sm text-muted-foreground">
            Agrupe obras sueltas bajo un número de acta para poder comprarles materiales antes de
            tramitarla
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          El número que asigne aquí es provisional: cuando el acta se tramite y la Gerencia de
          Proyectos le asigne el <strong>código de contabilidad</strong>, ese código baja solo a las
          requisiciones que se hayan creado contra ella.
        </p>
      </div>

      {/* Bandeja de Gerencia: lo que espera su decision, sin buscar municipio */}
      {esGerencia && bandeja.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Inbox className="h-5 w-5 text-blue-600" />
            Compras pendientes de su autorización
            <span className="text-sm font-normal text-muted-foreground">({bandeja.length})</span>
          </h2>
          <div className="space-y-3">
            {bandeja.map((b) => (
              <div
                key={b.actaId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4"
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    {b.municipio || b.empresa} · acta {b.actaNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.obras} obra(s) · solicitada por {b.solicitadaPor || '—'} · lleva {b.dias}{' '}
                    día{b.dias === 1 ? '' : 's'} esperando
                  </p>
                  {b.justificacion && <p className="text-sm">«{b.justificacion}»</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setDecision({ acta: comoActa(b), aprobar: true });
                      setMotivo('');
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Autorizar
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => {
                      setDecision({ acta: comoActa(b), aprobar: false });
                      setMotivo('');
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Negar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vigilante: compras hechas por anticipado que siguen sin imputacion */}
      {pendientes.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Requisiciones esperando código de contabilidad
            <span className="text-sm font-normal text-muted-foreground">
              ({pendientes.length})
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Se compraron contra un acta provisional. Reciben el código solo cuando esa acta se
            apruebe: mientras tanto la compra está sin centro de costo.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requisición</TableHead>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Acta</TableHead>
                  <TableHead>Estado del acta</TableHead>
                  <TableHead>Creada por</TableHead>
                  <TableHead className="text-right">Esperando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.map((r) => {
                  const vencida = r.dias >= DIAS_ALERTA;
                  return (
                    <TableRow key={r.requisitionId} className={vencida ? 'bg-red-50' : undefined}>
                      <TableCell className="font-medium">{r.requisitionNumber}</TableCell>
                      <TableCell>{r.municipio || r.empresa}</TableCell>
                      <TableCell>{r.actaNumber}</TableCell>
                      <TableCell>
                        {r.actaStatus ? (
                          ESTADO_ACTA[r.actaStatus] ?? r.actaStatus
                        ) : (
                          <span className="text-red-600">El acta ya no existe</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.creadaPor || '—'}</TableCell>
                      <TableCell
                        className={
                          'text-right ' + (vencida ? 'font-semibold text-red-700' : '')
                        }
                      >
                        {r.dias} día{r.dias === 1 ? '' : 's'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {soloVigilante ? (
        pendientes.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay compras anticipadas esperando código de contabilidad.
          </p>
        )
      ) : (
        <>
      {/* Municipio */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select
            value={companyId?.toString() ?? ''}
            onValueChange={(v) => {
              setCompanyId(Number(v));
              setProjectId(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione una empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.companyId} value={c.companyId.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {esCanales && (
          <div className="space-y-2">
            <Label>Municipio</Label>
            <Select
              value={projectId?.toString() ?? ''}
              onValueChange={(v) => setProjectId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un municipio" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {cargando && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando obras…
        </div>
      )}

      {municipioElegido && !cargando && (
        <>
          {/* Obras sin acta */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Obras sin acta{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({obras.length})
                </span>
              </h2>
              {esGerenciaProyectos && obras.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">N° de acta provisional</Label>
                    <Input
                      value={numeroActa}
                      onChange={(e) => setNumeroActa(e.target.value)}
                      placeholder="02-2026"
                      className="w-36"
                    />
                  </div>
                  <Button onClick={asignar} disabled={guardando || !seleccion.size}>
                    {guardando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Agrupar {seleccion.size > 0 ? `(${seleccion.size})` : ''}
                  </Button>
                </div>
              )}
            </div>

            {obras.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Todas las obras de este municipio ya están agrupadas en un acta.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Obra</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Plan anual</TableHead>
                      <TableHead>Registrada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {obras.map((o) => (
                      <TableRow
                        key={o.workId}
                        className={seleccion.has(o.workId) ? 'bg-amber-50' : undefined}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={seleccion.has(o.workId)}
                            onChange={() => alternar(o.workId)}
                            disabled={!esGerenciaProyectos}
                            aria-label={`Seleccionar ${o.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>{o.requestType || '—'}</TableCell>
                        <TableCell>{o.zone || '—'}</TableCell>
                        <TableCell>{o.annualPlan ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {fecha(o.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Actas provisionales ya armadas */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Actas provisionales{' '}
              <span className="text-sm font-normal text-muted-foreground">({actas.length})</span>
            </h2>

            {actas.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Todavía no hay actas provisionales en este municipio.
              </p>
            ) : (
              <div className="space-y-3">
                {actas.map((a) => {
                  const estado = ESTADO_RQ[a.rqAnticipadaStatus];
                  return (
                    <div
                      key={a.actaId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Acta {a.actaNumber}</span>
                          {a.esProvisional && (
                            <Badge variant="outline" className="border-amber-400 text-amber-700">
                              Provisional
                            </Badge>
                          )}
                          {estado && (
                            <Badge className={estado.clase} variant="secondary">
                              {estado.texto}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {a.obras} obra(s) agrupadas ·{' '}
                          {a.projectCode
                            ? `código ${a.projectCode}`
                            : 'sin código de contabilidad'}
                        </p>
                        {a.rqAnticipadaStatus === 'rechazada' && a.rqAnticipadaMotivo && (
                          <p className="text-sm italic text-red-600">
                            Gerencia negó la compra: {a.rqAnticipadaMotivo}
                          </p>
                        )}
                        {a.rqAnticipadaStatus === 'pendiente' && a.rqAnticipadaJustificacion && (
                          <p className="text-sm text-muted-foreground">
                            Justificación: {a.rqAnticipadaJustificacion}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {esGerenciaProyectos &&
                          (a.rqAnticipadaStatus === 'no_aplica' ||
                            a.rqAnticipadaStatus === 'rechazada') && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSolicitud(a);
                                setJustificacion('');
                              }}
                            >
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              Solicitar compra de materiales
                            </Button>
                          )}

                        {esGerenciaProyectos && a.rqAnticipadaStatus === 'aprobada' && (
                          <Button onClick={() => irACrearRequisicion(a)}>
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Crear requisición
                          </Button>
                        )}

                        {esGerencia && a.rqAnticipadaStatus === 'pendiente' && (
                          <>
                            <Button
                              onClick={() => {
                                setDecision({ acta: a, aprobar: true });
                                setMotivo('');
                              }}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Autorizar
                            </Button>
                            <Button
                              variant="outline"
                              className="text-red-600"
                              onClick={() => {
                                setDecision({ acta: a, aprobar: false });
                                setMotivo('');
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Negar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

        </>
      )}

      {/* Solicitar la compra anticipada */}
      <Dialog open={!!solicitud} onOpenChange={(v) => !v && setSolicitud(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar compra sobre el acta {solicitud?.actaNumber}</DialogTitle>
            <DialogDescription>
              La autoriza Gerencia. Con esa autorización podrá crear la requisición sin código de
              contabilidad; el código se le asignará solo cuando el acta se apruebe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>¿Por qué hay que comprar antes de tramitar el acta?</Label>
            <Textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              rows={4}
              placeholder="Explique la urgencia o la razón operativa"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolicitud(null)}>
              Cancelar
            </Button>
            <Button onClick={enviarSolicitud} disabled={guardando || !justificacion.trim()}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar a Gerencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decisión de Gerencia */}
      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.aprobar ? 'Autorizar' : 'Negar'} la compra sobre el acta{' '}
              {decision?.acta.actaNumber}
            </DialogTitle>
            <DialogDescription>
              {decision?.acta.rqAnticipadaJustificacion}
            </DialogDescription>
          </DialogHeader>
          {!decision?.aprobar && (
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Por qué no se autoriza"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancelar
            </Button>
            <Button
              onClick={resolver}
              disabled={guardando || (!decision?.aprobar && !motivo.trim())}
              className={decision?.aprobar ? undefined : 'bg-red-600 hover:bg-red-700'}
            >
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {decision?.aprobar ? 'Autorizar' : 'Negar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
