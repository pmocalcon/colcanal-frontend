import { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/utils/errorMensaje';
import { MarcoCep } from '@/components/cep/MarcoCep';
import {
  cepService, fmtCep, MESES_CEP, type InformeFinanciero,
} from '@/services/cep.service';

/**
 * Informe Financiero de Gestión Fiducia · GC-001-F.
 *
 * Es lo que se le entrega al municipio: los mismos hechos del Control de Excedentes,
 * contados como un estado de cuenta —de qué saldo se partió, qué entró, qué salió, con
 * qué se quedó y qué le queda comprometido—.
 *
 * **No tiene ni una cifra propia y no se guarda**: se arma del CEP cada vez que se abre.
 * Guardarlo sería tener dos versiones de la misma plata y descubrir en la peor reunión
 * posible que no coinciden.
 *
 * Se imprime en horizontal: son doce meses de ancho y en vertical no cabe ninguno.
 */

/** El mes en cabecera: 'Ene', 'Feb'… El año ya está en el título del informe. */
const abreviado = (periodo: string) => MESES_CEP[Number(periodo.split('-')[1]) - 1]?.slice(0, 3) ?? periodo;

export default function InformeFinancieroPage() {
  return (
    <MarcoCep
      titulo="Informe financiero mensual"
      subtitulo="Gestión fiducia · formato GC-001-F"
      Icono={FileBarChart}
      ancho="max-w-[100rem]"
    >
      {({ companyId, anio, empresa }) => (
        <Cuerpo
          key={`${companyId}-${anio}`}
          companyId={companyId}
          anio={anio}
          municipio={empresa?.name ?? ''}
        />
      )}
    </MarcoCep>
  );
}

function Cuerpo({ companyId, anio, municipio }: {
  companyId: number; anio: string; municipio: string;
}) {
  const [informe, setInforme] = useState<InformeFinanciero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    cepService.informe(companyId, anio)
      .then((i) => { setInforme(i); setError(null); })
      .catch((e) => setError(mensajeDeError(e, 'No se pudo armar el informe.')))
      .finally(() => setCargando(false));
  }, [companyId, anio]);

  useEffect(cargar, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
        <Loader2 className="w-4 h-4 animate-spin" /> Armando el informe…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error}
      </p>
    );
  }

  if (!informe || informe.periodos.length === 0) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <strong>{municipio} no tiene meses cargados en {anio}.</strong> El informe sale del
        Control de Excedentes: hay que diligenciar allá al menos un mes para que aquí haya
        algo que mostrar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end no-print">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> Imprimir / PDF
        </Button>
      </div>

      <div className="bg-white border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-[hsl(var(--canalco-neutral-300))] flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-bold text-[hsl(var(--canalco-neutral-900))]">
              INFORME FINANCIERO GESTIÓN FIDUCIA · AÑO {anio}
            </h2>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{municipio}</p>
          </div>
          <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
            Código: GC-001-F · Versión 2
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-300))]">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-white min-w-[16rem]">
                  Concepto
                </th>
                {informe.periodos.map((p) => (
                  <th key={p} className="text-right px-3 py-2 font-semibold whitespace-nowrap">
                    {abreviado(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
              {informe.filas.map((fila) => (
                <tr
                  key={fila.clave}
                  className={fila.nivel === 0 ? 'bg-[hsl(var(--canalco-neutral-50))]' : ''}
                >
                  <th
                    scope="row"
                    className={`text-left px-3 py-1.5 font-normal sticky left-0 ${
                      fila.nivel === 0 ? 'bg-[hsl(var(--canalco-neutral-50))]' : 'bg-white'
                    } ${fila.total ? 'font-semibold' : ''}`}
                    // La sangría es la del formato impreso: el municipio compara este
                    // informe renglón por renglón contra el del mes pasado.
                    style={{ paddingLeft: `${0.75 + fila.nivel * 1.25}rem` }}
                  >
                    {fila.etiqueta}
                  </th>
                  {fila.valores.map((v, i) => (
                    <td
                      key={i}
                      className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${
                        fila.total ? 'font-semibold' : ''
                      } ${v < 0 ? 'text-red-700' : ''}`}
                    >
                      {v === 0 ? '–' : fmtCep(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        El informe se arma del CEP, así que un mes sin conciliar sale igual de bien
        presentado que uno conciliado. Se dice, porque este es el papel que se entrega.
      */}
      <p className="text-xs text-[hsl(var(--canalco-neutral-500))] no-print">
        El informe se arma del Control de Excedentes cada vez que se abre: no hay una copia
        guardada que se pueda quedar vieja. Antes de entregarlo, vale la pena verificar en
        el CEP que los meses del año estén conciliados contra el extracto de la fiducia.
      </p>
    </div>
  );
}
