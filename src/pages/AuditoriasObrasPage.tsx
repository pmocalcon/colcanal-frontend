import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Hammer,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort } from '@/utils/dateUtils';
import { mensajeDeError } from '@/utils/errorMensaje';
import {
  auditObrasService,
  colorEstado,
  fmtCOP,
  ESTADO_ACTA,
  ESTADO_ANTICIPADA,
  ESTADO_CRONOGRAMA,
  ESTADO_LEVANTAMIENTO,
  ESTADO_PRESUPUESTO,
  type FilaActa,
  type FilaObra,
  type StatsObras,
} from '@/services/auditObras.service';

/**
 * Auditoría del módulo de obras. Solo lectura.
 *
 * Dos pestañas porque son dos preguntas distintas y ninguna contesta la otra: **Actas**
 * responde «¿en qué va el expediente?» —el acta es lo que se aprueba, lo que se
 * presupuesta y contra lo que se compra—, y **Obras** responde «¿qué pasó con este
 * poste?». Una sola lista de movimientos sueltos, que es lo primero que uno tiende a
 * hacer, no contesta ninguna de las dos: obliga a reconstruir el expediente a ojo.
 *
 * La pestaña vive en la URL para que al entrar a un detalle y volver con «atrás» se
 * recupere la que se estaba viendo, igual que en la auditoría de compras.
 */

type Pestana = 'actas' | 'obras';
const PESTANAS: Pestana[] = ['actas', 'obras'];

const POR_PAGINA = 50;

export default function AuditoriasObrasPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const pestana: Pestana = PESTANAS.includes(tabParam as Pestana)
    ? (tabParam as Pestana)
    : 'actas';
  const cambiarPestana = useCallback(
    (tab: Pestana) => {
      const p = new URLSearchParams(searchParams);
      p.set('tab', tab);
      setSearchParams(p, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [stats, setStats] = useState<StatsObras | null>(null);
  const [actas, setActas] = useState<FilaActa[]>([]);
  const [obras, setObras] = useState<FilaObra[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lo que se teclea y lo que se buscó son dos cosas: sin separarlas, cada letra
  // dispararía una consulta sobre 186 obras.
  const [texto, setTexto] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [buscado, setBuscado] = useState({ texto: '', municipio: '' });

  useEffect(() => {
    auditObrasService
      .getStats()
      .then(setStats)
      // Las cifras de arriba son de contexto: si fallan, los listados se ven igual.
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);

    const pedir = async () => {
      try {
        if (pestana === 'actas') {
          const r = await auditObrasService.getActas({
            page: pagina,
            limit: POR_PAGINA,
            actaNumber: buscado.texto || undefined,
            companyName: buscado.municipio || undefined,
          });
          if (!vigente) return;
          setActas(r.actas);
          setTotal(r.total);
          setTotalPaginas(r.totalPages);
        } else {
          const r = await auditObrasService.getObras({
            page: pagina,
            limit: POR_PAGINA,
            busqueda: buscado.texto || undefined,
            companyName: buscado.municipio || undefined,
          });
          if (!vigente) return;
          setObras(r.obras);
          setTotal(r.total);
          setTotalPaginas(r.totalPages);
        }
      } catch (e) {
        if (vigente) setError(mensajeDeError(e, 'No se pudo cargar la auditoría de obras'));
      } finally {
        if (vigente) setCargando(false);
      }
    };

    void pedir();
    return () => {
      vigente = false;
    };
  }, [pestana, pagina, buscado]);

  const buscar = () => {
    setPagina(1);
    setBuscado({ texto: texto.trim(), municipio: municipio.trim() });
  };
  const limpiar = () => {
    setTexto('');
    setMunicipio('');
    setPagina(1);
    setBuscado({ texto: '', municipio: '' });
  };
  const hayFiltro = buscado.texto !== '' || buscado.municipio !== '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard/auditorias')}
            title="Volver a Auditorías"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
              Auditoría de Obras
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Actas, levantamientos y la historia de cada obra. Solo lectura.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {stats && <Cifras stats={stats} />}

        {/* Pestañas */}
        <div className="flex gap-2 border-b border-[hsl(var(--canalco-neutral-300))]">
          {(
            [
              ['actas', 'Actas', FileText],
              ['obras', 'Obras', Hammer],
            ] as const
          ).map(([slug, titulo, Icono]) => (
            <button
              key={slug}
              type="button"
              onClick={() => {
                setPagina(1);
                cambiarPestana(slug);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 transition-colors ${
                pestana === slug
                  ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                  : 'border-transparent text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-neutral-900))]'
              }`}
            >
              <Icono className="w-4 h-4" />
              {titulo}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[14rem]">
            <label className="text-xs text-[hsl(var(--canalco-neutral-600))] block mb-1">
              {pestana === 'actas' ? 'Número de acta' : 'Código o nombre de la obra'}
            </label>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder={pestana === 'actas' ? '01-2026' : 'SB0001 · parque principal'}
            />
          </div>
          <div className="flex-1 min-w-[14rem]">
            <label className="text-xs text-[hsl(var(--canalco-neutral-600))] block mb-1">
              Municipio
            </label>
            <Input
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder="Guacarí"
            />
          </div>
          <Button onClick={buscar} className="gap-2">
            <Search className="w-4 h-4" /> Buscar
          </Button>
          {hayFiltro && (
            <Button variant="ghost" onClick={limpiar} className="gap-2">
              <X className="w-4 h-4" /> Quitar filtros
            </Button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        <Card>
          <CardContent className="p-0">
            {cargando ? (
              <p className="p-8 text-center text-[hsl(var(--canalco-neutral-600))] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
              </p>
            ) : pestana === 'actas' ? (
              <TablaActas actas={actas} onAbrir={(id) => navigate(`/dashboard/auditorias/obras/acta/${id}`)} />
            ) : (
              <TablaObras obras={obras} onAbrir={(id) => navigate(`/dashboard/auditorias/obras/obra/${id}`)} />
            )}
          </CardContent>
        </Card>

        {!cargando && total > 0 && (
          <div className="flex items-center justify-between text-sm text-[hsl(var(--canalco-neutral-600))]">
            <span>
              {total} {pestana === 'actas' ? 'acta(s)' : 'obra(s)'}
              {hayFiltro ? ' con los filtros aplicados' : ''}
            </span>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Las cifras de arriba.
 *
 * «Movimientos anotados» está deliberadamente a la vista: mientras esa cifra sea baja,
 * casi todo lo que se ve en las líneas de tiempo es deducido, y quien audita tiene que
 * saberlo antes de sacar conclusiones de un expediente que parece corto.
 */
function Cifras({ stats }: { stats: StatsObras }) {
  const aprobados = stats.levantamientos.find((l) => l.estado === 'approved')?.n ?? 0;
  const enRevision = stats.levantamientos.find((l) => l.estado === 'in_review')?.n ?? 0;

  const cifras: Array<{ titulo: string; valor: string; pie?: string }> = [
    {
      titulo: 'Actas',
      valor: String(stats.actas.total),
      pie: `${stats.actas.aprobadas} aprobadas · ${stats.actas.enRevision + stats.actas.enAprobacion} en trámite`,
    },
    {
      titulo: 'Obras',
      valor: String(stats.obras.total),
      pie: `${stats.obras.sinActa} sin acta`,
    },
    {
      titulo: 'Levantamientos aprobados',
      valor: String(aprobados),
      pie: enRevision ? `${enRevision} en revisión` : undefined,
    },
    {
      titulo: 'Esperando decisión',
      valor: String(
        stats.actas.presupuestoEnRevision +
          stats.actas.cronogramaEnRevision +
          stats.actas.anticipadaPendiente,
      ),
      pie: `${stats.actas.presupuestoEnRevision} presupuesto · ${stats.actas.cronogramaEnRevision} cronograma · ${stats.actas.anticipadaPendiente} compra anticipada`,
    },
    {
      titulo: 'Movimientos anotados',
      valor: String(stats.bitacora.total),
      pie: stats.bitacora.desde
        ? `desde el ${formatDateShort(stats.bitacora.desde)}`
        : 'la bitácora empieza ahora: lo anterior va deducido',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cifras.map((c) => (
        <div
          key={c.titulo}
          className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-white px-4 py-3"
        >
          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{c.titulo}</p>
          <p className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] tabular-nums">
            {c.valor}
          </p>
          {c.pie && (
            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-0.5">{c.pie}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Pastilla({ estado, texto }: { estado: string | null; texto: string }) {
  return (
    <Badge variant="outline" className={`font-normal ${colorEstado(estado)}`}>
      {texto}
    </Badge>
  );
}

function TablaActas({ actas, onAbrir }: { actas: FilaActa[]; onAbrir: (id: number) => void }) {
  if (actas.length === 0) {
    return (
      <p className="p-8 text-center text-[hsl(var(--canalco-neutral-600))]">
        No hay actas que coincidan.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Acta</TableHead>
            <TableHead>Municipio</TableHead>
            {/* Los cuatro carriles del acta, que corren a la vez y con responsables
                distintos. Verlos juntos es lo que permite decir dónde está trabada. */}
            <TableHead>Acta</TableHead>
            <TableHead>Presupuesto</TableHead>
            <TableHead>Cronograma</TableHead>
            <TableHead>Compra anticipada</TableHead>
            <TableHead className="text-right">Obras</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Último movimiento</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {actas.map((a) => (
            <TableRow
              key={a.actaId}
              className="cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))]"
              onClick={() => onAbrir(a.actaId)}
            >
              <TableCell className="font-medium whitespace-nowrap">
                {a.actaNumber}
                {a.provisional && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                    Provisional
                  </span>
                )}
                {a.codigoContabilidad && (
                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] font-normal">
                    {a.codigoContabilidad}
                  </p>
                )}
              </TableCell>
              <TableCell className="max-w-[14rem] truncate">{a.municipio ?? '—'}</TableCell>
              <TableCell>
                <Pastilla estado={a.estado} texto={ESTADO_ACTA[a.estado] ?? a.estado} />
              </TableCell>
              <TableCell>
                <Pastilla
                  estado={a.presupuesto}
                  texto={ESTADO_PRESUPUESTO[a.presupuesto] ?? a.presupuesto}
                />
              </TableCell>
              <TableCell>
                <Pastilla
                  estado={a.cronograma}
                  texto={ESTADO_CRONOGRAMA[a.cronograma] ?? a.cronograma}
                />
              </TableCell>
              <TableCell>
                {a.compraAnticipada === 'no_aplica' ? (
                  <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">—</span>
                ) : (
                  <Pastilla
                    estado={a.compraAnticipada}
                    texto={ESTADO_ANTICIPADA[a.compraAnticipada] ?? a.compraAnticipada}
                  />
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{a.obras}</TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {fmtCOP(a.valor)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {a.ultimoMovimiento ? (
                  formatDateShort(a.ultimoMovimiento)
                ) : (
                  <span className="text-[hsl(var(--canalco-neutral-400))]">
                    sin anotar
                  </span>
                )}
              </TableCell>
              <TableCell className="w-8">
                <ChevronRight className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TablaObras({ obras, onAbrir }: { obras: FilaObra[]; onAbrir: (id: number) => void }) {
  if (obras.length === 0) {
    return (
      <p className="p-8 text-center text-[hsl(var(--canalco-neutral-600))]">
        No hay obras que coincidan.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Obra</TableHead>
            <TableHead>Municipio</TableHead>
            <TableHead>Acta</TableHead>
            <TableHead>Levantamiento</TableHead>
            <TableHead className="text-right">Bloques</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Revisado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {obras.map((o) => (
            <TableRow
              key={o.workId}
              className="cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))]"
              onClick={() => onAbrir(o.workId)}
            >
              <TableCell className="font-medium whitespace-nowrap">{o.codigo ?? '—'}</TableCell>
              <TableCell className="max-w-[20rem] truncate">{o.nombre}</TableCell>
              <TableCell className="max-w-[12rem] truncate">{o.municipio ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">
                {o.acta ?? (
                  <span className="text-xs text-amber-700">sin acta</span>
                )}
              </TableCell>
              <TableCell>
                {o.levantamiento ? (
                  <Pastilla
                    estado={o.levantamiento}
                    texto={ESTADO_LEVANTAMIENTO[o.levantamiento] ?? o.levantamiento}
                  />
                ) : (
                  <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">
                    sin levantamiento
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {o.levantamiento ? `${o.bloquesAprobados ?? 0}/5` : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {fmtCOP(o.valor)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {o.revisado ? (
                  <>
                    {formatDateShort(o.revisado)}
                    {o.revisadoPor && (
                      <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                        {o.revisadoPor}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-[hsl(var(--canalco-neutral-400))]">—</span>
                )}
              </TableCell>
              <TableCell className="w-8">
                <ChevronRight className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
