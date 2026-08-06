import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitCompare, Upload, Loader2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { readXlsxToText } from '@/utils/xlsxReader';
import { contarInventario, compararConSge } from '@/utils/censoCompare';
import type { TipoSge, GrupoComparado, DescripcionContada } from '@/utils/censoCompare';

/**
 * Compara un inventario de campo contra el censo del SGE del mes.
 *
 * Se pega desde Excel o se carga el archivo, igual que la importación de ID OFF
 * e ID ON. Es solo lectura: enseña las diferencias, no toca el censo — corregir
 * cantidades es del Censo, y hacerlo desde aquí escondería el cambio.
 *
 * Se listan todos los grupos de UCAP, pero no todos se pueden contar desde el
 * censo: el archivo es un censo de luminarias y de la red solo sabe el calibre,
 * no los metros. Los grupos sin regla de conteo salen con lo del SGE y sin
 * diferencia, que es la respuesta honesta.
 */

interface Props {
  /** Lo que el SGE tiene en el mes, ya agregado por tipo. */
  sge: TipoSge[];
  /** Mes que se está comparando, para el encabezado. */
  mesLabel: string;
  municipio: string;
  disabled?: boolean;
}

const fmt = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('es-CO');

/** "TIPO 2 (1,5 A 2 M) (3.443) · TIPO 1 (0 A 1 M) (237)" */
const listar = (ds: DescripcionContada[], max = 8): string =>
  ds.slice(0, max).map((d) => `${d.descripcion} (${fmt(d.cantidad)})`).join(' · ')
  + (ds.length > max ? ` · … +${ds.length - max}` : '');

/**
 * El desglose del archivo, valor por valor y sin recortar.
 *
 * Un resumen de tres valores y un "+2" obliga a suponer qué hay en el resto, y
 * suponer es justo lo que no se puede hacer cuando el número va a una
 * liquidación. Se listan las dos cosas que explican el conteo: lo que suma y lo
 * que el censo no midió.
 *
 * Lo que el censo dice que NO lleva la unidad no se enumera. Que 3.130 apoyos
 * sean de la electrificadora o que 34 luminarias vayan sin brazo es cierto,
 * pero es inventario ajeno al grupo: llenaba la tabla de filas que nunca van a
 * cuadrar con nada. Su total sigue en la línea de suma, que es donde hace falta
 * para llegar a las unidades del archivo.
 */
type Cubeta = 'cuenta' | 'sinDato';
interface FilaDesglose extends DescripcionContada { cubeta: Cubeta }

const ETIQUETA_CUBETA: Record<Cubeta, string> = {
  cuenta: 'cuenta',
  sinDato: 'sin medir',
};
const COLOR_CUBETA: Record<Cubeta, string> = {
  cuenta: 'text-[hsl(var(--canalco-neutral-700))]',
  sinDato: 'text-amber-700',
};

const desgloseDe = (g: GrupoComparado): FilaDesglose[] => [
  ...g.detalleCampo.map((d) => ({ ...d, cubeta: 'cuenta' as const })),
  ...g.sinDatoCampo.map((d) => ({ ...d, cubeta: 'sinDato' as const })),
];

const sumar = (ds: DescripcionContada[]): number =>
  ds.reduce((a, d) => a + d.cantidad, 0);

const leidasDe = (g: GrupoComparado): number =>
  sumar(g.detalleCampo) + sumar(g.noAplicaCampo) + sumar(g.sinDatoCampo);

export function CompararCenso({ sge, mesLabel, municipio, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const conteo = useMemo(() => (texto.trim() ? contarInventario(texto) : null), [texto]);
  const comparacion = useMemo(
    () => (conteo && !conteo.error ? compararConSge(conteo, sge) : null),
    [conteo, sge],
  );

  /**
   * Con el filtro puesto quedan los grupos que no cuadran y, dentro de ellos,
   * solo los tipos que no cuadran. Los grupos que el censo no mide se van: no
   * "no cuadran", es que no hay con qué compararlos.
   */
  const gruposVisibles: GrupoComparado[] = useMemo(() => {
    if (!comparacion) return [];
    if (!soloDiferencias) return comparacion.grupos;
    return comparacion.grupos
      .filter((g) => g.diferencia != null && g.diferencia !== 0)
      .map((g) => (g.cruzadoPorTipo
        ? { ...g, filas: g.filas.filter((f) => f.diferencia !== 0) }
        : g));
  }, [comparacion, soloDiferencias]);

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        setTexto(await readXlsxToText(file));
      } else if (/\.xls$/i.test(file.name)) {
        toast.error('El formato .xls antiguo no se lee: guárdalo como .xlsx o CSV.');
      } else {
        setTexto(await file.text());
      }
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'formato no válido'}`);
    } finally {
      setLeyendo(false);
    }
  };

  const cerrar = () => {
    setAbierto(false);
    setTexto('');
    setSoloDiferencias(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)} disabled={disabled}
        className="gap-2 border-sky-600 text-sky-700 hover:bg-sky-50">
        <GitCompare className="w-4 h-4" /> Comparar
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : cerrar())}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-sky-600" />
              Comparar inventario contra el SGE
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-[hsl(var(--canalco-neutral-600))] -mt-2">
            {municipio} · censo de <strong>{mesLabel}</strong>, todos los grupos de UCAP.
            En luminarias cada fila del archivo es una unidad y se cruzan tipo a tipo
            por <strong>clase, tecnología y potencia</strong> (la marca se ignora). En
            los demás grupos el archivo da un total pero no dice de qué UCAP es cada
            unidad, así que se compara el <strong>total del grupo</strong>. No modifica nada.
          </p>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] cursor-pointer rounded-md border border-[hsl(var(--canalco-neutral-300))] px-3 py-2 hover:bg-[hsl(var(--canalco-neutral-50))]">
              {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Cargar archivo (.xlsx o .csv)
              <input type="file" accept=".xlsx,.csv,.txt" className="hidden"
                onChange={(e) => { void cargarArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {texto && (
              <Button variant="ghost" size="sm" onClick={() => setTexto('')} className="text-xs">
                Limpiar
              </Button>
            )}
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'…o pega aquí las filas desde Excel, con la fila de títulos.\n\nTIPO_MATERIAL\tSERIE_EQU\tTECNOLOGIA\tPOTENCIA\nLUMINARIA LED 35W\t96\tLED\t35.00'}
            className="w-full h-24 rounded-md border border-[hsl(var(--canalco-neutral-300))] p-2 text-xs font-mono resize-y"
          />

          {conteo?.error && (
            <p className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {conteo.error}
            </p>
          )}

          {conteo && !conteo.error && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-md bg-[hsl(var(--canalco-neutral-100))] px-2.5 py-1">
                  Archivo: <strong className="tabular-nums">{fmt(comparacion?.totalCampo ?? 0)}</strong> unidades
                  {conteo.columnas.length > 0 && (
                    <span className="text-[hsl(var(--canalco-neutral-500))]"> · por {conteo.columnas.join(', ')}</span>
                  )}
                </span>
                <span className="rounded-md bg-[hsl(var(--canalco-neutral-100))] px-2.5 py-1">
                  SGE: <strong className="tabular-nums">{fmt(comparacion?.totalSge ?? 0)}</strong>
                  {!!comparacion?.sgeNoMedido && (
                    <span className="text-[hsl(var(--canalco-neutral-500))]">
                      {' '}+ {fmt(comparacion.sgeNoMedido)} en grupos que el censo no mide
                    </span>
                  )}
                </span>
                {comparacion && (
                  <span className={`rounded-md px-2.5 py-1 font-semibold ${
                    comparacion.totalCampo === comparacion.totalSge
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-900'
                  }`}>
                    Diferencia: <span className="tabular-nums">
                      {comparacion.totalCampo - comparacion.totalSge > 0 ? '+' : ''}
                      {fmt(comparacion.totalCampo - comparacion.totalSge)}
                    </span>
                  </span>
                )}
                <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={soloDiferencias}
                    onChange={(e) => setSoloDiferencias(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[hsl(var(--canalco-primary))]" />
                  Solo lo que no cuadra
                </label>
              </div>

              {conteo.avisos.map((a, i) => (
                <p key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {a}
                </p>
              ))}

              <div className="overflow-auto max-h-[45vh] border border-[hsl(var(--canalco-neutral-200))] rounded-md">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-[hsl(var(--canalco-neutral-100))] z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">Tipo</th>
                      <th className="px-3 py-2 text-left font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">UCAP</th>
                      <th className="px-3 py-2 text-right font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">Archivo</th>
                      <th className="px-3 py-2 text-right font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">SGE</th>
                      <th className="px-3 py-2 text-right font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruposVisibles.map((g) => (
                      <Fragment key={g.grupo}>
                        {/* Encabezado del grupo: aquí es donde cuadra o no cuadra
                            todo lo que no son luminarias. */}
                        <tr className={`font-semibold ${
                          g.diferencia == null ? 'bg-[hsl(var(--canalco-neutral-200))]'
                            : g.diferencia === 0 ? 'bg-emerald-50' : 'bg-red-100'
                        }`}>
                          <td className="px-3 py-2 border-b border-[hsl(var(--canalco-neutral-200))]">
                            <span className="uppercase text-[11px] tracking-wide">{g.grupo}</span>
                            <span className="block font-normal text-[10px] text-[hsl(var(--canalco-neutral-600))]">
                              {g.regla ?? 'el censo de campo no mide este grupo'}
                              {g.nota ? ` — ${g.nota}` : ''}
                            </span>
                            {/* Lo que no aplica no se enumera abajo, pero su total
                                va aquí: es el resto del archivo, y sin él no se
                                entiende por qué el desglose no llega a las filas
                                que trae la hoja. */}
                            {g.noAplicaCampo.length > 0 && (
                              <span className="block font-normal text-[10px] text-[hsl(var(--canalco-neutral-400))]">
                                de {fmt(leidasDe(g))} {g.unidadCampo}, fuera del grupo:{' '}
                                {listar(g.noAplicaCampo, 3)}
                              </span>
                            )}
                            {/* Lo que falta por medir no se mete en el número: el
                                dato es lo que el archivo confirma. Pero hasta dónde
                                podría moverse la diferencia sí hay que decirlo. */}
                            {g.campo != null && g.campoMax != null && g.campoMax > g.campo && (
                              <span className="block font-normal text-[10px] text-amber-700">
                                {fmt(g.campoMax - g.campo)} sin medir en el censo: al completarlas
                                la diferencia puede llegar a {g.campoMax - g.sge > 0 ? '+' : ''}
                                {fmt(g.campoMax - g.sge)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-[hsl(var(--canalco-neutral-200))] font-normal text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                            {g.filas.length} {g.cruzadoPorTipo ? 'tipo(s)' : 'UCAP(s)'}
                          </td>
                          {/* Un solo número: lo que el archivo confirma. */}
                          <td className="px-3 py-2 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-200))]">
                            {fmt(g.campo)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-200))]">{fmt(g.sge)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-200))] ${
                            g.diferencia === 0 ? 'text-emerald-700'
                              : g.diferencia == null ? 'text-[hsl(var(--canalco-neutral-400))]' : 'text-red-700'
                          }`}>
                            {g.diferencia == null
                              ? '—'
                              : g.diferencia === 0
                                ? <Check className="w-3.5 h-3.5 inline" />
                                : `${g.diferencia > 0 ? '+' : ''}${fmt(g.diferencia)}`}
                          </td>
                        </tr>

                        {/* Los grupos que no cruzan tipo a tipo se leen de arriba
                            abajo: primero todo lo que dice el archivo, después lo
                            que tiene el SGE, y al final las dos cifras juntas.
                            A las UCAPs no se les reparte el total: inventarlo. */}
                        {!g.cruzadoPorTipo && (
                          <>
                            {desgloseDe(g).length > 0 && (
                              <>
                                <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                                  <td colSpan={5} className="pl-6 pr-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--canalco-neutral-500))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                    lo que dice el archivo · {g.unidadCampo ?? 'unidades'}
                                  </td>
                                </tr>
                                {desgloseDe(g).map((d) => (
                                  <tr key={`${g.grupo}-arch-${d.cubeta}-${d.descripcion}`}>
                                    <td className={`pl-8 pr-3 py-1 text-[11px] border-b border-[hsl(var(--canalco-neutral-100))] ${COLOR_CUBETA[d.cubeta]}`}>
                                      {d.descripcion}
                                    </td>
                                    <td className={`px-3 py-1 text-[10px] border-b border-[hsl(var(--canalco-neutral-100))] ${COLOR_CUBETA[d.cubeta]}`}>
                                      {ETIQUETA_CUBETA[d.cubeta]}
                                    </td>
                                    <td className={`px-3 py-1 text-right text-[11px] tabular-nums border-b border-[hsl(var(--canalco-neutral-100))] ${COLOR_CUBETA[d.cubeta]}`}>
                                      {fmt(d.cantidad)}
                                    </td>
                                    <td className="px-3 py-1 text-right text-[11px] text-[hsl(var(--canalco-neutral-300))] border-b border-[hsl(var(--canalco-neutral-100))]">—</td>
                                    <td className="px-3 py-1 text-right text-[11px] text-[hsl(var(--canalco-neutral-300))] border-b border-[hsl(var(--canalco-neutral-100))]">—</td>
                                  </tr>
                                ))}
                                {/* El dato del grupo es lo que cuenta, y eso es lo que
                                    va en la columna. Lo sin medir se nombra al lado
                                    pero no se suma: sumarlo sería darlo por bueno. */}
                                <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                                  <td colSpan={2} className="pl-8 pr-3 py-1 text-[10px] font-semibold text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-200))]">
                                    Suma: {fmt(sumar(g.detalleCampo))} {g.unidadCampo ?? ''} que cuentan
                                    {g.sinDatoCampo.length > 0
                                      && `; ${fmt(sumar(g.sinDatoCampo))} sin medir quedan fuera del dato`}
                                  </td>
                                  <td className="px-3 py-1 text-right text-[11px] tabular-nums font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">
                                    {fmt(g.campo)}
                                  </td>
                                  <td className="px-3 py-1 border-b border-[hsl(var(--canalco-neutral-200))]" />
                                  <td className="px-3 py-1 border-b border-[hsl(var(--canalco-neutral-200))]" />
                                </tr>
                              </>
                            )}

                            {/* El total del SGE va en su columna: así el bloque
                                cierra con las dos cifras alineadas y no hace falta
                                repetir el comparativo debajo. */}
                            <tr className="bg-[hsl(var(--canalco-neutral-50))]">
                              <td colSpan={3} className="pl-6 pr-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--canalco-neutral-500))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                lo que tiene el SGE · {g.filas.length} UCAP(s)
                              </td>
                              <td className="px-3 py-1 text-right text-[11px] tabular-nums font-semibold border-b border-[hsl(var(--canalco-neutral-100))]">
                                {fmt(g.sge)}
                              </td>
                              <td className="border-b border-[hsl(var(--canalco-neutral-100))]" />
                            </tr>
                            {g.filas.map((f) => (
                              <tr key={f.clave}>
                                <td className="pl-8 pr-3 py-1 text-[11px] text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                  {f.etiqueta}
                                </td>
                                <td className="px-3 py-1 text-[11px] text-[hsl(var(--canalco-neutral-500))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                  {f.ucaps.map((u) => u.codigo).join(', ')}
                                </td>
                                <td className="px-3 py-1 text-right text-[11px] text-[hsl(var(--canalco-neutral-300))] border-b border-[hsl(var(--canalco-neutral-100))]">—</td>
                                <td className="px-3 py-1 text-right text-[11px] tabular-nums text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">{fmt(f.sge)}</td>
                                <td className="px-3 py-1 text-right text-[11px] text-[hsl(var(--canalco-neutral-300))] border-b border-[hsl(var(--canalco-neutral-100))]">—</td>
                              </tr>
                            ))}

                          </>
                        )}

                        {/* Luminarias: cada tipo con su cruce, y debajo las UCAPs
                            que lo componen cuando hay más de una. */}
                        {g.cruzadoPorTipo && g.filas.map((f) => {
                          const soloUno = f.diferencia == null;
                          const cuadra = f.diferencia === 0;
                          const fondo = soloUno ? 'bg-amber-50' : cuadra ? '' : 'bg-red-50';
                          return (
                            <Fragment key={f.clave}>
                              <tr className={fondo}>
                                <td className="pl-6 pr-3 py-1.5 font-medium border-b border-[hsl(var(--canalco-neutral-100))]">
                                  {f.etiqueta}
                                  {f.sge == null && (
                                    <span className="ml-2 text-[10px] font-semibold text-amber-700">solo en el archivo</span>
                                  )}
                                  {f.campo == null && (
                                    <span className="ml-2 text-[10px] font-semibold text-amber-700">solo en el SGE</span>
                                  )}
                                  {/* Las marcas y modelos que se agruparon aquí: sin esto
                                      un "3.762" no se puede rastrear hasta el archivo. */}
                                  {f.descripcionesCampo.length > 1 && f.ucaps.length <= 1 && (
                                    <p className="text-[10px] text-[hsl(var(--canalco-neutral-500))] mt-0.5">
                                      reúne: {listar(f.descripcionesCampo)}
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 border-b border-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))]">
                                  {f.ucaps.length === 1 ? f.ucaps[0].codigo : f.ucaps.length > 1 ? `${f.ucaps.length} UCAPs` : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-100))]">{fmt(f.campo)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-100))]">{fmt(f.sge)}</td>
                                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold border-b border-[hsl(var(--canalco-neutral-100))] ${
                                  cuadra ? 'text-emerald-700' : 'text-red-700'
                                }`}>
                                  {f.diferencia == null
                                    ? '—'
                                    : f.diferencia === 0
                                      ? <Check className="w-3.5 h-3.5 inline" />
                                      : `${f.diferencia > 0 ? '+' : ''}${fmt(f.diferencia)}`}
                                </td>
                              </tr>
                              {/* Una línea por UCAP, cada una con su total y su
                                  diferencia. El archivo no distingue UCAPs, así que el
                                  reparto es por parecido de la descripción: debajo de
                                  cada una queda qué se le asignó, para poder revisarlo. */}
                              {f.ucaps.length > 1 && f.ucaps.map((u) => (
                                <tr key={`${f.clave}-${u.codigo}-${u.descripcion}`} className={fondo}>
                                  <td className="pl-10 pr-3 py-1 text-[11px] text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                    {u.descripcion}
                                    {u.desdeArchivo.length > 0 && (
                                      <span className="block text-[10px] text-[hsl(var(--canalco-neutral-400))]">
                                        del archivo: {listar(u.desdeArchivo)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1 text-[11px] text-[hsl(var(--canalco-neutral-500))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                    {u.codigo}
                                  </td>
                                  <td className="px-3 py-1 text-right text-[11px] tabular-nums text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                    {fmt(u.campo)}
                                  </td>
                                  <td className="px-3 py-1 text-right text-[11px] tabular-nums text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                    {fmt(u.cantidad)}
                                  </td>
                                  <td className={`px-3 py-1 text-right text-[11px] tabular-nums font-semibold border-b border-[hsl(var(--canalco-neutral-100))] ${
                                    u.diferencia === 0 ? 'text-emerald-700' : 'text-red-700'
                                  }`}>
                                    {u.diferencia === 0
                                      ? <Check className="w-3 h-3 inline" />
                                      : `${u.diferencia > 0 ? '+' : ''}${fmt(u.diferencia)}`}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    ))}
                    {gruposVisibles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                          {soloDiferencias ? 'Todo cuadra: no hay diferencias.' : 'Sin filas para comparar.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {comparacion && (
                <div className="space-y-1">
                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                    {comparacion.conDiferencia} tipo(s) o grupo(s) con cantidad distinta ·{' '}
                    {comparacion.soloEnCampo} solo en el archivo ·{' '}
                    {comparacion.soloEnSge} solo en el SGE.
                    {(comparacion.soloEnCampo > 0 || comparacion.soloEnSge > 0) &&
                      ' Un tipo que aparece en un solo lado suele ser el mismo escrito distinto: verifica la descripción antes de dar por buena la diferencia.'}
                  </p>
                  {/* La diferencia es contra lo confirmado. Decir cuánto censo
                      falta evita leerla como definitiva. */}
                  {comparacion.grupos.some((g) => g.campoMax != null && g.campo != null && g.campoMax > g.campo) && (
                    <p className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {comparacion.grupos
                        .filter((g) => g.campoMax != null && g.campo != null && g.campoMax > g.campo)
                        .map((g) => `${g.grupo} (${fmt(g.campoMax! - g.campo!)})`)
                        .join(', ')}
                      {': '}el censo dejó filas sin medir. La diferencia se calcula contra lo
                      que el archivo confirma, así que no es definitiva: completar esas filas
                      la mueve. Lo que hay que terminar es el censo.
                    </p>
                  )}
                  {/* Los grupos sin regla de conteo: se nombran para que quede
                      claro que no cuadran ni descuadran, sino que no se miden. */}
                  {comparacion.grupos.some((g) => g.campo == null) && (
                    <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                      El censo de campo no mide{' '}
                      {comparacion.grupos.filter((g) => g.campo == null).map((g) => g.grupo).join(', ')}
                      : ahí solo se muestra lo que tiene el SGE.
                    </p>
                  )}
                  {comparacion.grupos.some((g) => g.filas.some((f) => f.repartido)) && (
                    <p className="flex items-start gap-2 rounded-md bg-sky-50 border border-sky-200 px-3 py-1.5 text-[11px] text-sky-900">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      Hay tipos con más de una UCAP. El archivo no dice a cuál pertenece
                      cada luminaria, así que se repartió por parecido de la descripción:
                      la diferencia del tipo es firme, la de cada UCAP es una estimación.
                      Debajo de cada UCAP queda qué se le asignó.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={cerrar}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
