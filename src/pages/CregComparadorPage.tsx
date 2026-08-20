import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cregService } from '@/services/creg.service';
import type { CregComparador, ComparadorFila } from '@/services/creg.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, AlertCircle, AlertTriangle, Download, GitCompare, Search,
} from 'lucide-react';

/**
 * El mismo elemento, municipio por municipio.
 *
 * Cruza por descripción y no por código: entre contratos el código no identifica
 * nada —el mismo PROP-020 es una luminaria en Ciudad Bolívar, un proyector en
 * Jericó y un poste en Pueblo Rico—, así que una matriz por código enfrentaría
 * cosas que no tienen relación. Lo que sí se repite es el texto.
 *
 * Lo que se busca aquí es por qué la misma luminaria cuesta distinto en cada
 * municipio, y de paso qué elementos tiene uno cargados y otro no.
 */

/**
 * A partir de aquí la diferencia merece una explicación.
 *
 * Con los elementos bien cruzados el rango real va de 1,05× a 2,4×, así que el
 * umbral no marca un error de captura —como haría uno de 10×— sino los casos
 * donde vale la pena preguntar por qué. Por debajo de 1,5× la diferencia se
 * explica sola con el año de contratación y el proveedor.
 */
const UMBRAL_ALERTA = 1.5;

const fmt = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const corto = (nombre: string) => nombre.replace('Unión Temporal Alumbrado Público ', '');

export default function CregComparadorPage() {
  const navigate = useNavigate();

  const [datos, setDatos] = useState<CregComparador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [soloComparables, setSoloComparables] = useState(true);

  useEffect(() => {
    cregService.getComparador()
      .then((d) => { setDatos(d); setCargando(false); })
      .catch(() => { setError('No se pudo cargar el comparador'); setCargando(false); });
  }, []);

  const municipios = datos?.municipios ?? [];

  const filas = useMemo(() => {
    if (!datos) return [];
    const texto = busqueda.trim().toLowerCase();
    return datos.filas.filter((f) => {
      if (soloComparables && f.presentes < 2) return false;
      if (!texto) return true;
      if (f.elemento.toLowerCase().includes(texto)) return true;
      // También por el código local: quien llega con un PROP-020 en la mano
      // necesita encontrarlo, aunque el código no sea la llave del cruce.
      return Object.values(f.celdas).some((c) => c.code.toLowerCase().includes(texto));
    });
  }, [datos, busqueda, soloComparables]);

  const resumen = useMemo(() => {
    const todas = datos?.filas ?? [];
    const comparables = todas.filter((f) => f.presentes > 1);
    return {
      total: todas.length,
      comparables: comparables.length,
      conAlerta: comparables.filter((f) => f.veces != null && f.veces >= UMBRAL_ALERTA).length,
    };
  }, [datos]);

  /** Descarga lo que está en pantalla, con las mismas columnas y el mismo orden. */
  const exportar = useCallback(() => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const cabecera = [
      'Elemento', 'Municipios',
      ...municipios.flatMap((m) => [`${corto(m.nombre)} — código`, `${corto(m.nombre)} — valor`]),
      'Mínimo', 'Máximo', 'Veces',
    ];
    const lineas = filas.map((f) => [
      esc(f.elemento),
      String(f.presentes),
      ...municipios.flatMap((m) => {
        const c = f.celdas[m.clave];
        return [esc(c?.code ?? ''), c?.valor == null ? '' : String(Math.round(c.valor))];
      }),
      f.minimo == null ? '' : String(Math.round(f.minimo)),
      f.maximo == null ? '' : String(Math.round(f.maximo)),
      f.veces == null ? '' : String(f.veces),
    ].join(';'));

    // BOM para que Excel en español lea las tildes.
    const csv = '﻿' + [cabecera.map(esc).join(';'), ...lineas].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparador-ucaps-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filas, municipios]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-20">
        <div className="max-w-[95rem] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Comparador de UCAP
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              El mismo elemento en todos los municipios
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportar} disabled={filas.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
        </div>
      </header>

      <main className="max-w-[95rem] mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando UCAPs de todos los municipios…
          </div>
        )}

        {!cargando && datos && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold">Los elementos se cruzan por descripción, no por código</p>
                <p className="text-blue-800">
                  Cada municipio numeró su catálogo por su cuenta: el mismo código designa
                  cosas distintas en cada contrato. Por eso cada celda muestra el código
                  local debajo del valor.
                  {resumen.conAlerta > 0 && (
                    <> Hoy hay <strong>{resumen.conAlerta}</strong> elementos donde un municipio
                    paga al menos {UMBRAL_ALERTA}× lo que paga otro.</>
                  )}
                </p>
              </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
              <div className="flex flex-wrap items-end gap-6">
                <div className="flex-1 min-w-[16rem]">
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                    <Input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Elemento o código local…"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="flex rounded-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSoloComparables(true)}
                    className={
                      'px-4 py-2 text-sm font-medium transition-colors ' +
                      (soloComparables
                        ? 'bg-[hsl(var(--canalco-primary))] text-white'
                        : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]')
                    }
                    title="Los que están en dos o más municipios"
                  >
                    Comparables ({resumen.comparables})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoloComparables(false)}
                    className={
                      'px-4 py-2 text-sm font-medium transition-colors ' +
                      (!soloComparables
                        ? 'bg-[hsl(var(--canalco-primary))] text-white'
                        : 'bg-white text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]')
                    }
                    title="Incluye los que solo existen en un municipio"
                  >
                    Todos ({resumen.total})
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))]">
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  {filas.length} {filas.length === 1 ? 'elemento' : 'elementos'} · {municipios.length} municipios
                </h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  Total con indirectos, sin IPP. El factor IPP cambia entre municipios por
                  razones legítimas y aquí taparía las diferencias de costo.
                </p>
              </div>

              {filas.length === 0 ? (
                <div className="p-12 text-center text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Ningún elemento coincide con los filtros.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                        <th className="sticky left-0 z-10 bg-[hsl(var(--canalco-neutral-100))] text-left font-semibold px-4 py-3 border-b border-[hsl(var(--canalco-neutral-300))] min-w-[20rem]">
                          Elemento
                        </th>
                        {municipios.map((m) => (
                          <th
                            key={m.clave}
                            className="text-right font-semibold px-4 py-3 border-b border-l border-[hsl(var(--canalco-neutral-300))] whitespace-nowrap"
                          >
                            {corto(m.nombre)}
                          </th>
                        ))}
                        <th className="text-right font-semibold px-4 py-3 border-b border-l border-[hsl(var(--canalco-neutral-300))] whitespace-nowrap">
                          Veces
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila) => (
                        <Fila
                          key={fila.clave}
                          fila={fila}
                          claves={municipios.map((m) => m.clave)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** Una fila de la matriz: el elemento y lo que tiene cargado cada municipio. */
function Fila({ fila, claves }: { fila: ComparadorFila; claves: string[] }) {
  const alerta = fila.veces != null && fila.veces >= UMBRAL_ALERTA;
  const fondo = alerta ? 'bg-amber-50/60' : '';

  return (
    <tr className={'border-b border-[hsl(var(--canalco-neutral-200))] ' + fondo}>
      <th
        scope="row"
        className={'sticky left-0 z-10 text-left font-normal px-4 py-3 align-top ' + (fondo || 'bg-white')}
      >
        <div className="font-semibold text-[hsl(var(--canalco-neutral-900))] max-w-[24rem]">
          {fila.elemento}
        </div>
        <div className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-0.5">
          {fila.presentes === 1
            ? 'Solo en un municipio'
            : `En ${fila.presentes} municipios`}
          {fila.grupo && ` · ${fila.grupo}`}
        </div>
      </th>

      {claves.map((clave) => {
        const celda = fila.celdas[clave];
        const valor = celda?.valor ?? null;
        // Marcar los extremos: es lo que hace legible de un vistazo quién paga
        // más y quién menos por lo mismo.
        const esMaximo = alerta && valor != null && valor === fila.maximo;
        const esMinimo = alerta && valor != null && valor === fila.minimo;
        return (
          <td
            key={clave}
            className={
              'px-4 py-3 text-right border-l border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap align-top ' +
              (valor == null ? 'text-[hsl(var(--canalco-neutral-400))]' : '')
            }
            title={
              celda
                ? `${celda.code} · ${celda.descripcion}`
                : 'Este municipio no tiene este elemento'
            }
          >
            {valor == null ? (
              '—'
            ) : (
              <>
                <div
                  className={
                    'tabular-nums ' +
                    (esMaximo
                      ? 'font-bold text-red-700'
                      : esMinimo
                        ? 'font-semibold text-green-700'
                        : 'text-[hsl(var(--canalco-neutral-800))]')
                  }
                >
                  {fmt(valor)}
                </div>
                {celda?.code && (
                  <div className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                    {celda.code}
                  </div>
                )}
              </>
            )}
          </td>
        );
      })}

      <td className="px-4 py-3 text-right tabular-nums border-l border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap align-top">
        {fila.veces == null ? (
          <span
            className="text-[hsl(var(--canalco-neutral-400))]"
            title="Solo existe en un municipio: no hay con qué compararlo"
          >
            —
          </span>
        ) : (
          <span className={alerta ? 'font-bold text-amber-700' : 'text-[hsl(var(--canalco-neutral-600))]'}>
            {fila.veces}×
          </span>
        )}
      </td>
    </tr>
  );
}
