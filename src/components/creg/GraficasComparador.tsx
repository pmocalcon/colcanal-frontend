import { useMemo } from 'react';
import {
  Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ComparadorFila, ComparadorMunicipio } from '@/services/creg.service';

/**
 * Las tres preguntas que la matriz responde mal por ser una matriz.
 *
 * La tabla es exacta pero se lee celda por celda: con noventa y cuatro elementos y diez
 * municipios, «¿quién paga de más?» y «¿dónde está la mayor diferencia?» se contestan
 * recorriendo la pantalla a ojo. Estas tres gráficas contestan eso mismo de un vistazo y
 * mandan de vuelta a la tabla, que sigue siendo el dato.
 *
 * Todas se calculan sobre lo que está filtrado en pantalla, no sobre el catálogo entero:
 * si se busca «bombilla», las gráficas hablan de bombillas.
 */

const COLOR_CARO = '#dc2626';
const COLOR_BARATO = '#16a34a';
const COLOR_BRECHA = '#d97706';
const COLOR_NEUTRO = '#94a3b8';
const EJE = { fontSize: 11, fill: '#6b7280' };

const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 0 });

const CAJA_TOOLTIP = {
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 12,
} as const;

/** Recorta el nombre del elemento para que quepa como etiqueta del eje. */
const recorte = (t: string, max = 34) => (t.length > max ? t.slice(0, max - 1) + '…' : t);

export interface GraficasComparadorProps {
  /** Las filas que se están viendo, ya filtradas por la búsqueda. */
  filas: ComparadorFila[];
  municipios: ComparadorMunicipio[];
  /** Nombre corto del municipio, el mismo que usa la cabecera de la tabla. */
  corto: (nombre: string) => string;
  /** La fila abierta en la gráfica de detalle. */
  seleccion: string | null;
  onSeleccion: (clave: string) => void;
}

export default function GraficasComparador({
  filas, municipios, corto, seleccion, onSeleccion,
}: GraficasComparadorProps) {
  /**
   * Cuántas veces cada municipio quedó de más caro y de más barato.
   *
   * Se cuenta la posición y no el valor a propósito. Un promedio de precios enfrentaría
   * canastas distintas —Guacarí tiene cuarenta y cuatro elementos cargados y Tarso
   * quince, y no son los mismos—, así que un municipio saldría caro por tener cargados
   * los elementos caros. La posición se decide elemento por elemento, entre los que sí
   * tienen ese elemento, y no depende de qué más haya en el catálogo.
   *
   * Se dejan fuera las filas donde todos pagan lo mismo: ahí no hay un más caro.
   */
  const posiciones = useMemo(() => {
    const cuenta = new Map(municipios.map((m) => [m.clave, { caro: 0, barato: 0, n: 0 }]));
    for (const f of filas) {
      if (f.presentes < 2 || f.minimo == null || f.maximo == null) continue;
      if (f.minimo === f.maximo) continue;
      for (const m of municipios) {
        const v = f.celdas[m.clave]?.valor;
        if (v == null) continue;
        const c = cuenta.get(m.clave)!;
        c.n += 1;
        if (v === f.maximo) c.caro += 1;
        if (v === f.minimo) c.barato += 1;
      }
    }
    return municipios
      .map((m) => {
        const c = cuenta.get(m.clave)!;
        return {
          nombre: corto(m.nombre),
          n: c.n,
          caro: c.n ? Math.round((c.caro / c.n) * 100) : 0,
          barato: c.n ? Math.round((c.barato / c.n) * 100) : 0,
          vecesCaro: c.caro,
          vecesBarato: c.barato,
        };
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.caro - a.caro);
  }, [filas, municipios, corto]);

  /** Los elementos donde la diferencia entre municipios es mayor. */
  const brechas = useMemo(
    () => filas
      .filter((f) => f.veces != null && f.veces > 1)
      .sort((a, b) => (b.veces ?? 0) - (a.veces ?? 0))
      .slice(0, 12)
      .map((f) => ({
        clave: f.clave,
        elemento: f.elemento,
        etiqueta: recorte(f.elemento),
        veces: f.veces ?? 0,
        presentes: f.presentes,
        minimo: f.minimo ?? 0,
        maximo: f.maximo ?? 0,
      })),
    [filas],
  );

  /** La fila del detalle: la elegida, o la de mayor diferencia si no hay ninguna. */
  const detalle = useMemo(() => {
    const elegida = seleccion ? filas.find((f) => f.clave === seleccion) : undefined;
    return elegida ?? filas.find((f) => f.clave === brechas[0]?.clave) ?? filas[0] ?? null;
  }, [filas, seleccion, brechas]);

  const barras = useMemo(() => {
    if (!detalle) return [];
    return municipios
      .map((m) => ({
        nombre: corto(m.nombre),
        valor: detalle.celdas[m.clave]?.valor ?? null,
        code: detalle.celdas[m.clave]?.code ?? '',
      }))
      .filter((x): x is { nombre: string; valor: number; code: string } => x.valor != null)
      .sort((a, b) => b.valor - a.valor);
  }, [detalle, municipios, corto]);

  const ausentes = detalle ? municipios.length - barras.length : 0;

  if (filas.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Quién queda de más caro ───────────────────────────────── */}
        <Tarjeta
          titulo="Quién termina pagando más"
          nota={
            'De cada elemento que tiene cargado, en qué porcentaje de los casos quedó de ' +
            'más caro y en cuál de más barato frente a los municipios que tienen ese mismo ' +
            'elemento. Se cuenta la posición y no el precio, porque cada municipio tiene ' +
            'cargada una canasta distinta. Ojo con los elementos que solo están en dos: ' +
            'ahí uno de los dos es siempre el caro.'
          }
        >
          {posiciones.length === 0 ? (
            <Vacio>Ningún elemento de los filtrados está en dos o más municipios.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, posiciones.length * 34 + 40)}>
              <BarChart
                data={posiciones}
                layout="vertical"
                margin={{ top: 4, right: 44, left: 4, bottom: 4 }}
                barGap={2}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tick={EJE}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={104}
                  tick={EJE}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={CAJA_TOOLTIP}
                  cursor={{ fill: '#f9fafb' }}
                  formatter={(v, nombre, item) => {
                    const d = item?.payload as (typeof posiciones)[number] | undefined;
                    const veces = nombre === 'El más caro' ? d?.vecesCaro : d?.vecesBarato;
                    return [`${v}% · ${veces} de ${d?.n} elementos`, nombre as string];
                  }}
                />
                <Bar dataKey="caro" name="El más caro" fill={COLOR_CARO} radius={[0, 3, 3, 0]}>
                  <LabelList
                    dataKey="caro"
                    position="right"
                    formatter={(v: number) => `${v}%`}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
                <Bar dataKey="barato" name="El más barato" fill={COLOR_BARATO} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <Leyenda />
        </Tarjeta>

        {/* ── Dónde está la mayor diferencia ────────────────────────── */}
        <Tarjeta
          titulo="Los elementos con mayor diferencia"
          nota="Cuántas veces cabe el valor más bajo en el más alto. Pulse una barra para verlo abajo, municipio por municipio."
        >
          {brechas.length === 0 ? (
            <Vacio>Ningún elemento filtrado tiene diferencia entre municipios.</Vacio>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, brechas.length * 28 + 40)}>
              <BarChart
                data={brechas}
                layout="vertical"
                margin={{ top: 4, right: 44, left: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  domain={[1, 'dataMax']}
                  tick={EJE}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}×`}
                />
                <YAxis
                  type="category"
                  dataKey="etiqueta"
                  width={190}
                  tick={EJE}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={CAJA_TOOLTIP}
                  cursor={{ fill: '#f9fafb' }}
                  formatter={(_v, _n, item) => {
                    const d = item?.payload as (typeof brechas)[number] | undefined;
                    if (!d) return ['', ''];
                    return [
                      `${d.veces}× · de ${fmt(d.minimo)} a ${fmt(d.maximo)} en ${d.presentes} municipios`,
                      d.elemento,
                    ];
                  }}
                />
                {/* El 1× es «todos pagan lo mismo»: da la referencia de cuánto se aleja cada barra. */}
                <ReferenceLine x={1} stroke="#cbd5e1" />
                <Bar
                  dataKey="veces"
                  fill={COLOR_BRECHA}
                  radius={[0, 3, 3, 0]}
                  cursor="pointer"
                  onClick={(d: unknown) => {
                    // Recharts entrega la fila unas veces plana y otras dentro de
                    // `payload`, según por dónde caiga el clic. Se miran las dos.
                    const e = d as { clave?: string; payload?: { clave?: string } } | undefined;
                    const clave = e?.clave ?? e?.payload?.clave;
                    if (clave) onSeleccion(clave);
                  }}
                >
                  <LabelList
                    dataKey="veces"
                    position="right"
                    formatter={(v: number) => `${v}×`}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Tarjeta>
      </div>

      {/* ── Un elemento, municipio por municipio ───────────────────── */}
      {detalle && (
        <Tarjeta
          titulo="Un elemento en detalle"
          nota="Pulse cualquier fila de la tabla para traerla aquí."
          encabezado={
            <select
              value={detalle.clave}
              onChange={(e) => onSeleccion(e.target.value)}
              className="max-w-[28rem] text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
            >
              {filas.map((f) => (
                <option key={f.clave} value={f.clave}>
                  {f.elemento}
                </option>
              ))}
            </select>
          }
        >
          {barras.length === 0 ? (
            <Vacio>Este elemento no tiene valores cargados.</Vacio>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, barras.length * 30 + 40)}>
                <BarChart
                  data={barras}
                  layout="vertical"
                  margin={{ top: 4, right: 86, left: 4, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={104}
                    tick={EJE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={CAJA_TOOLTIP}
                    cursor={{ fill: '#f9fafb' }}
                    formatter={(v, _n, item) => {
                      const d = item?.payload as (typeof barras)[number] | undefined;
                      return [`${fmt(Number(v))}${d?.code ? ` · ${d.code}` : ''}`, 'Total con indirectos'];
                    }}
                  />
                  <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
                    {/* Los mismos colores de la tabla: rojo el que más paga, verde el que menos. */}
                    {barras.map((b) => (
                      <Cell
                        key={b.nombre}
                        fill={
                          b.valor === detalle.maximo ? COLOR_CARO
                            : b.valor === detalle.minimo ? COLOR_BARATO
                              : COLOR_NEUTRO
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="valor"
                      position="right"
                      formatter={(v: number) => fmt(v)}
                      style={{ fontSize: 11, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mt-2">
                {detalle.veces != null && detalle.veces > 1
                  ? <>El más caro paga <strong>{detalle.veces}×</strong> lo del más barato.</>
                  : <>Todos los que lo tienen pagan lo mismo.</>}
                {ausentes > 0 && ` No está cargado en ${ausentes} de los ${municipios.length} municipios.`}
              </p>
            </>
          )}
        </Tarjeta>
      )}
    </div>
  );
}

function Tarjeta({ titulo, nota, encabezado, children }: {
  titulo: string;
  nota: string;
  encabezado?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">{titulo}</h3>
        {encabezado}
      </div>
      <p className="text-xs text-[hsl(var(--canalco-neutral-600))] mb-4 max-w-[54rem]">{nota}</p>
      {children}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex items-center gap-5 mt-2 text-xs text-[hsl(var(--canalco-neutral-600))]">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_CARO }} /> El más caro
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_BARATO }} /> El más barato
      </span>
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-[hsl(var(--canalco-neutral-500))]">
      {children}
    </div>
  );
}
