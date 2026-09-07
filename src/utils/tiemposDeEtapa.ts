/**
 * Cuánto duró cada etapa del trámite frente al plazo que tenía.
 *
 * Va aparte de la pantalla porque es una cuenta con reglas, no un detalle de pintado:
 * qué entradas de la bitácora abren una etapa, cuándo se detiene el reloj y contra qué
 * se compara. Metido en el JSX se volvería intocable.
 *
 * El tiempo se mide con `tiempoHabil`, el mismo de las vistas de auditoría, para que la
 * misma solicitud no diga dos cosas distintas según la pantalla.
 */

import { msHabiles } from './tiempoHabil';
import { getColombianHolidays } from './colombianCalendar';
import type { GcHistorialEntry } from '@/services/gestionConocimiento.service';

export interface EstadoConPlazo {
  label: string;
  /** Días hábiles objetivo. Nulo cuando la etapa no tiene plazo. */
  sla: number | null;
}

/** Lo que se sabe del tiempo de una entrada de la bitácora. */
export interface TiempoDeEtapa {
  /** Milisegundos hábiles que duró la etapa que abre esta entrada. */
  ms: number;
  /** El plazo de la etapa, o nulo si no tiene. */
  sla: number | null;
  vence: Date | null;
  /** Nulo cuando la etapa no tiene plazo: se muestra el tiempo, pero no se juzga. */
  vencido: boolean | null;
  /** La solicitud sigue en esta etapa: el tiempo se cuenta contra ahora. */
  abierto: boolean;
}

const festivosDe = (fechas: Date[]): Set<string> => {
  const salida = new Set<string>();
  for (const f of fechas) {
    for (const d of getColombianHolidays(f.getFullYear())) salida.add(d);
    for (const d of getColombianHolidays(f.getFullYear() + 1)) salida.add(d);
  }
  return salida;
};

export interface EtapasMedidas {
  /** La bitácora ordenada del principio al final, que es como se lee el recorrido. */
  entradas: GcHistorialEntry[];
  /**
   * El tiempo de cada entrada, alineado con `entradas`. Va nulo en las que **no abren
   * etapa**: la bitácora guarda también avisos y gestiones que no mueven el flujo —una
   * alerta de vencimiento, una requisición de póliza pedida por fuera—, y medirlas como
   * etapas partiría en dos la misma espera y haría parecer que el trámite avanzó.
   */
  tiempos: (TiempoDeEtapa | null)[];
  /** Lo que lleva el trámite completo, en milisegundos hábiles. */
  totalMs: number;
  /** El trámite sigue abierto: su última etapa no es final. */
  enCurso: boolean;
  etapasConPlazo: number;
  etapasVencidas: number;
  /** La etapa más larga, para señalarla. Nulo si ninguna llega a un día hábil. */
  indiceMasLarga: number | null;
}

export function medirEtapas(
  historial: GcHistorialEntry[],
  estados: Record<string, EstadoConPlazo>,
  finales: string[],
  sumarDiasHabiles: (desde: Date, n: number) => Date,
): EtapasMedidas {
  const entradas = [...historial]
    .filter((h) => h.fecha)
    .sort((a, b) => +new Date(a.fecha) - +new Date(b.fecha));

  const vacio: EtapasMedidas = {
    entradas, tiempos: [], totalMs: 0, enCurso: false,
    etapasConPlazo: 0, etapasVencidas: 0, indiceMasLarga: null,
  };
  if (entradas.length === 0) return vacio;

  /* Una entrada abre etapa cuando deja la solicitud en un estado distinto al que ya
     estaba. Las demás ocurrieron *dentro* de la etapa en curso. */
  const abreEtapa = entradas.map((h, i) => i === 0 || h.estado !== entradas[i - 1].estado);

  const festivos = festivosDe(entradas.map((h) => new Date(h.fecha)));
  const ahora = new Date();

  const tiempos: (TiempoDeEtapa | null)[] = entradas.map((h, i) => {
    if (!abreEtapa[i]) return null;
    const desde = new Date(h.fecha);
    // La etapa termina cuando otra la abre; si no hay siguiente, sigue corriendo —salvo
    // que el estado sea final, y entonces el trámite se acabó ahí.
    const jSig = abreEtapa.findIndex((abre, j) => abre && j > i);
    const cerrado = finales.includes(h.estado);
    const abierto = jSig === -1 && !cerrado;
    const hasta = jSig !== -1 ? new Date(entradas[jSig].fecha) : abierto ? ahora : desde;

    const sla = estados[h.estado]?.sla ?? null;
    let vence: Date | null = null;
    let vencido: boolean | null = null;
    if (sla) {
      vence = sumarDiasHabiles(desde, sla);
      // El vencimiento es al cierre del día hábil, igual que en el resto del flujo.
      vence.setHours(23, 59, 59, 999);
      vencido = hasta > vence;
    }
    return { ms: msHabiles(desde, hasta, festivos), sla, vence, vencido, abierto };
  });

  const conTiempo = tiempos.filter((t): t is TiempoDeEtapa => t !== null);
  const maxMs = Math.max(...conTiempo.map((t) => t.ms), 0);
  const ultimo = conTiempo[conTiempo.length - 1];
  const finTramite = ultimo?.abierto
    ? ahora
    : new Date(entradas[entradas.length - 1].fecha);

  return {
    entradas,
    tiempos,
    totalMs: msHabiles(new Date(entradas[0].fecha), finTramite, festivos),
    enCurso: !!ultimo?.abierto,
    etapasConPlazo: conTiempo.filter((t) => t.sla != null).length,
    etapasVencidas: conTiempo.filter((t) => t.vencido === true).length,
    // Solo se señala si de verdad pesa: en un trámite de minutos, la «más larga» no
    // dice nada.
    indiceMasLarga:
      maxMs >= 86400000 ? tiempos.findIndex((t) => t?.ms === maxMs) : null,
  };
}
