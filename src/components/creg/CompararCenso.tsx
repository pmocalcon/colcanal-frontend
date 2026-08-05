import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitCompare, Upload, Loader2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { readXlsxToText } from '@/utils/xlsxReader';
import { contarInventario, compararConSge } from '@/utils/censoCompare';
import type { TipoSge, FilaComparacion } from '@/utils/censoCompare';

/**
 * Compara un inventario de campo contra el censo del SGE del mes.
 *
 * Se pega desde Excel o se carga el archivo, igual que la importación de ID OFF
 * e ID ON. Es solo lectura: enseña las diferencias, no toca el censo — corregir
 * cantidades es del Censo, y hacerlo desde aquí escondería el cambio.
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

export function CompararCenso({ sge, mesLabel, municipio, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const conteo = useMemo(() => (texto.trim() ? contarInventario(texto) : null), [texto]);
  const comparacion = useMemo(
    () => (conteo && !conteo.error ? compararConSge(conteo.tipos, sge) : null),
    [conteo, sge],
  );

  const filasVisibles: FilaComparacion[] = useMemo(() => {
    if (!comparacion) return [];
    return soloDiferencias
      ? comparacion.filas.filter((f) => f.diferencia !== 0)
      : comparacion.filas;
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
            {municipio} · censo de <strong>{mesLabel}</strong>, solo el grupo LUMINARIAS.
            Cada fila del archivo es una luminaria; se agrupan por <strong>clase,
            tecnología y potencia</strong> (la marca se ignora) y se cruzan con las
            cantidades del censo. No modifica nada.
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
                  Archivo: <strong className="tabular-nums">{fmt(comparacion?.totalCampo ?? 0)}</strong> luminarias
                  {conteo.columnas.length > 0 && (
                    <span className="text-[hsl(var(--canalco-neutral-500))]"> · por {conteo.columnas.join(', ')}</span>
                  )}
                </span>
                <span className="rounded-md bg-[hsl(var(--canalco-neutral-100))] px-2.5 py-1">
                  SGE: <strong className="tabular-nums">{fmt(comparacion?.totalSge ?? 0)}</strong>
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
                    {filasVisibles.map((f) => {
                      const soloUno = f.diferencia == null;
                      const cuadra = f.diferencia === 0;
                      const fondo = soloUno ? 'bg-amber-50' : cuadra ? '' : 'bg-red-50';
                      return (
                        <Fragment key={f.clave}>
                          <tr className={fondo}>
                            <td className="px-3 py-1.5 font-medium border-b border-[hsl(var(--canalco-neutral-100))]">
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
                                  reúne: {f.descripcionesCampo.map((d) => `${d.descripcion} (${d.cantidad})`).join(' · ')}
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
                              <td className="pl-8 pr-3 py-1 text-[11px] text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                {u.descripcion}
                                {u.desdeArchivo.length > 0 && (
                                  <span className="block text-[10px] text-[hsl(var(--canalco-neutral-400))]">
                                    del archivo: {u.desdeArchivo.map((d) => `${d.descripcion} (${d.cantidad})`).join(' · ')}
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
                    {filasVisibles.length === 0 && (
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
                    {comparacion.conDiferencia} tipo(s) con cantidad distinta ·{' '}
                    {comparacion.soloEnCampo} solo en el archivo ·{' '}
                    {comparacion.soloEnSge} solo en el SGE.
                    {(comparacion.soloEnCampo > 0 || comparacion.soloEnSge > 0) &&
                      ' Un tipo que aparece en un solo lado suele ser el mismo escrito distinto: verifica la descripción antes de dar por buena la diferencia.'}
                  </p>
                  {comparacion.filas.some((f) => f.repartido) && (
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
