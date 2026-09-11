import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LineaTiempoObra } from '@/components/auditorias/LineaTiempoObra';
import { formatDate, formatDateShort } from '@/utils/dateUtils';
import { mensajeDeError } from '@/utils/errorMensaje';
import {
  auditObrasService,
  colorEstado,
  fmtCOP,
  ESTADO_ACTA,
  ESTADO_BLOQUE,
  ESTADO_LEVANTAMIENTO,
  nombreEstado,
  type ActaDetalle,
  type EjeActa,
  type LevantamientoDetalle,
  type ObraDetalle,
} from '@/services/auditObras.service';

/**
 * El expediente de un acta o de una obra: qué estado tiene hoy, y cómo llegó ahí.
 *
 * Una sola pantalla para las dos porque se lee igual —la ficha arriba, la línea de tiempo
 * abajo— y porque se navega entre ellas todo el rato: del acta se baja a una de sus obras
 * y de la obra se sube a su acta. Dos pantallas gemelas se habrían separado a la primera
 * corrección hecha en una sola.
 */
export default function AuditoriasObrasDetallePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { actaId, workId } = useParams<{ actaId?: string; workId?: string }>();

  const [acta, setActa] = useState<ActaDetalle | null>(null);
  const [obra, setObra] = useState<ObraDetalle | null>(null);
  const [bitacoraDesde, setBitacoraDesde] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Vuelve conservando la pestaña que se estaba viendo; en frío, a la lista. */
  const volver = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/dashboard/auditorias/obras');
  };

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    setActa(null);
    setObra(null);

    const pedir = async () => {
      try {
        // La fecha de arranque de la bitácora es contexto de la línea de tiempo, no su
        // contenido: si falla, el recorrido se ve igual, solo sin decir desde cuándo
        // consta lo que consta.
        const stats = auditObrasService.getStats().catch(() => null);

        if (actaId) {
          const d = await auditObrasService.getActaDetalle(Number(actaId));
          if (!vigente) return;
          if (!d) throw new Error('No se encontró el acta');
          setActa(d);
        } else if (workId) {
          const d = await auditObrasService.getObraDetalle(Number(workId));
          if (!vigente) return;
          if (!d) throw new Error('No se encontró la obra');
          setObra(d);
        }

        const s = await stats;
        if (vigente) setBitacoraDesde(s?.bitacora.desde ?? null);
      } catch (e) {
        if (vigente) setError(mensajeDeError(e, 'No se pudo cargar el expediente'));
      } finally {
        if (vigente) setCargando(false);
      }
    };

    void pedir();
    return () => {
      vigente = false;
    };
  }, [actaId, workId]);

  const titulo = acta
    ? `Acta ${acta.acta.actaNumber}`
    : obra
      ? (obra.obra.codigo ?? obra.obra.nombre)
      : 'Expediente';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={volver} title="Volver">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] truncate">
              {titulo}
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))] truncate">
              {acta?.acta.municipio ?? obra?.obra.municipio ?? 'Auditoría de obras'}
              {obra ? ` · ${obra.obra.nombre}` : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {cargando && (
          <p className="p-8 text-center text-[hsl(var(--canalco-neutral-600))] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        )}

        {error && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {acta && <VistaActa d={acta} onObra={(id) => navigate(`/dashboard/auditorias/obras/obra/${id}`)} />}
        {obra && <VistaObra d={obra} onActa={(id) => navigate(`/dashboard/auditorias/obras/acta/${id}`)} />}

        {(acta || obra) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Línea de tiempo</CardTitle>
            </CardHeader>
            <CardContent>
              <LineaTiempoObra
                movimientos={(acta ?? obra)!.movimientos}
                holidays={(acta ?? obra)!.holidays}
                bitacoraDesde={bitacoraDesde}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[hsl(var(--canalco-neutral-500))]">{termino}</dt>
      <dd className="text-sm font-medium text-[hsl(var(--canalco-neutral-800))] break-words">
        {valor ?? '—'}
      </dd>
    </div>
  );
}

function Resumen({ r }: { r: ActaDetalle['resumen'] }) {
  if (!r) return null;
  return (
    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
      {r.movimientos} movimiento(s) entre el {formatDateShort(r.inicio)} y el{' '}
      {formatDateShort(r.ultimo)} · {r.personas} persona(s) ·{' '}
      {/* Es la cifra que dice cuánto de esta historia consta y cuánto se dedujo. */}
      {r.registrados} anotado(s), {r.reconstruidos} deducido(s)
    </p>
  );
}

/**
 * Los cuatro carriles del acta, cada uno con su estado, su fecha y su responsable.
 *
 * El presupuesto sale siempre sin fecha, y no es un descuido de la pantalla: la columna
 * `presupuesto_status` nunca guardó ni cuándo ni quién. Decirlo es información —le avisa
 * a quien audita que ese visto bueno no tiene respaldo—; rellenarlo con `updated_at`
 * sería una fecha falsa con aspecto de verdadera.
 */
function Carriles({ ejes }: { ejes: EjeActa[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {ejes.map((e) => (
        <div
          key={e.eje}
          className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-white px-4 py-3 space-y-1.5"
        >
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{e.titulo}</p>
          <Badge variant="outline" className={`font-normal ${colorEstado(e.estado)}`}>
            {nombreEstado(e.estado)}
          </Badge>
          <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
            {e.desde ? formatDate(e.desde) : 'Sin fecha registrada'}
            {e.quien ? ` · ${e.quien}` : ''}
          </p>
          {e.motivo && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 whitespace-pre-wrap break-words">
              {e.motivo}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function VistaActa({ d, onObra }: { d: ActaDetalle; onObra: (workId: number) => void }) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">
              Acta {d.acta.actaNumber}
              {d.acta.provisional && (
                <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 align-middle">
                  Provisional
                </span>
              )}
            </CardTitle>
            <Badge variant="outline" className={`font-normal ${colorEstado(d.acta.estado)}`}>
              {ESTADO_ACTA[d.acta.estado] ?? d.acta.estado}
            </Badge>
          </div>
          <Resumen r={d.resumen} />
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
            <Dato termino="Municipio" valor={d.acta.municipio} />
            <Dato termino="Proyecto" valor={d.acta.proyecto ?? '—'} />
            <Dato termino="Código de contabilidad" valor={d.acta.codigoContabilidad ?? 'Sin asignar'} />
            <Dato termino="Creada" valor={`${formatDateShort(d.acta.creada)}${d.acta.creadaPor ? ` · ${d.acta.creadaPor}` : ''}`} />
            <Dato termino="Obras que agrupa" valor={String(d.obras.length)} />
            <Dato termino="Valor" valor={fmtCOP(d.valor)} />
          </dl>

          <Carriles ejes={d.ejes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Obras del acta</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.obras.length === 0 ? (
            <p className="p-6 text-center text-sm text-[hsl(var(--canalco-neutral-600))]">
              El acta todavía no agrupa ninguna obra.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Levantamiento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.obras.map((o) => (
                    <TableRow
                      key={o.workId}
                      className="cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))]"
                      onClick={() => onObra(o.workId)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {o.codigo ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[22rem] truncate">{o.nombre}</TableCell>
                      <TableCell className="text-sm">{o.tipoSolicitud ?? '—'}</TableCell>
                      <TableCell>
                        {o.levantamiento ? (
                          <Badge
                            variant="outline"
                            className={`font-normal ${colorEstado(o.levantamiento)}`}
                          >
                            {ESTADO_LEVANTAMIENTO[o.levantamiento] ?? o.levantamiento}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">
                            sin levantamiento
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {fmtCOP(o.valor)}
                      </TableCell>
                      <TableCell className="w-8">
                        <ChevronRight className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function VistaObra({ d, onActa }: { d: ObraDetalle; onActa: (actaId: number) => void }) {
  const o = d.obra;
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{o.nombre}</CardTitle>
          <Resumen r={d.resumen} />
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
            <Dato termino="Código" valor={o.codigo ?? '—'} />
            <Dato termino="Municipio" valor={o.municipio} />
            <Dato termino="Dirección" valor={o.direccion ?? '—'} />
            <Dato termino="Barrio / sector" valor={[o.barrio, o.sector].filter(Boolean).join(' · ') || '—'} />
            <Dato termino="Tipo de solicitud" valor={o.tipoSolicitud ?? '—'} />
            <Dato termino="Entidad solicitante" valor={o.entidadSolicitante ?? '—'} />
            <Dato
              termino="Acta"
              valor={
                o.acta ? (
                  o.actaId ? (
                    <button
                      type="button"
                      onClick={() => onActa(o.actaId as number)}
                      className="text-[hsl(var(--canalco-primary))] hover:underline"
                    >
                      {o.acta}
                    </button>
                  ) : (
                    // La obra dice tener un acta que no existe como expediente: se muestra
                    // el número, sin enlace, en vez de callarlo. Es justo lo que un
                    // auditor tiene que ver.
                    <span title="El número está en la obra pero no hay acta abierta con ese número">
                      {o.acta}
                    </span>
                  )
                ) : (
                  <span className="text-amber-700">Sin acta</span>
                )
              }
            />
            <Dato termino="Valor" valor={fmtCOP(o.valor)} />
            <Dato
              termino="Creada"
              valor={`${formatDateShort(o.creada)}${o.creadaPor ? ` · ${o.creadaPor}` : ''}`}
            />
          </dl>
        </CardContent>
      </Card>

      {d.levantamientos.map((lev) => (
        <Levantamiento key={lev.surveyId} lev={lev} />
      ))}
    </>
  );
}

/**
 * El levantamiento y sus cinco bloques, con el reparo de cada uno.
 *
 * Los bloques van en la ficha y no en la línea de tiempo porque de ellos solo se conoce
 * el estado de hoy: la fila guarda `budget_status` y su comentario, pero no cuándo se
 * aprobó ni quién lo hizo. Desde ahora cada revisión de bloque sí queda anotada y
 * aparecerá abajo, en el recorrido.
 */
function Levantamiento({ lev }: { lev: LevantamientoDetalle }) {
  const bloques: Array<[string, string | null, string | null]> = [
    ['Información de la obra', lev.bloqueInformacion, lev.reparoInformacion],
    ['Presupuesto', lev.bloquePresupuesto, lev.reparoPresupuesto],
    ['Inversión', lev.bloqueInversion, lev.reparoInversion],
    ['Materiales', lev.bloqueMateriales, lev.reparoMateriales],
    ['Viáticos', lev.bloqueViaticos, lev.reparoViaticos],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">
            Levantamiento {lev.codigo ?? `#${lev.surveyId}`}
          </CardTitle>
          <Badge variant="outline" className={`font-normal ${colorEstado(lev.estado)}`}>
            {ESTADO_LEVANTAMIENTO[lev.estado] ?? lev.estado}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
          <Dato
            termino="Creado"
            valor={`${formatDateShort(lev.creado)}${lev.creadoPor ? ` · ${lev.creadoPor}` : ''}`}
          />
          <Dato
            termino="Última revisión"
            valor={
              lev.revisado
                ? `${formatDateShort(lev.revisado)}${lev.revisadoPor ? ` · ${lev.revisadoPor}` : ''}`
                : 'Sin revisar'
            }
          />
          <Dato termino="Revisor asignado" valor={lev.revisorAsignado ?? '—'} />
          {/* De este factor sale el valor de la obra: sin él, el presupuesto del
              levantamiento no está ajustado y el acta vale otra cosa. */}
          <Dato termino="IPP del mes anterior" valor={lev.ipp != null ? String(lev.ipp) : 'Sin registrar'} />
        </dl>

        {lev.motivo && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 whitespace-pre-wrap break-words">
            {lev.motivo}
          </p>
        )}

        <div className="space-y-2">
          {bloques.map(([titulo, estado, reparo]) => (
            <div
              key={titulo}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[hsl(var(--canalco-neutral-200))] pb-2 last:border-0"
            >
              <span className="text-sm font-medium min-w-[12rem]">{titulo}</span>
              <Badge variant="outline" className={`font-normal ${colorEstado(estado)}`}>
                {ESTADO_BLOQUE[estado ?? ''] ?? estado ?? '—'}
              </Badge>
              {reparo && (
                <span className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex-1 min-w-[12rem] whitespace-pre-wrap break-words">
                  {reparo}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
