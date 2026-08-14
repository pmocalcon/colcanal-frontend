import { useEffect, useRef, useState } from 'react';
import { cregService } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import { liquidarMes, type HojasCreg, type LiquidacionResultado } from '@/utils/cregCalc';

/**
 * Las hojas CREG de un municipio, para poder liquidar cualquiera de sus meses.
 *
 * Son las siete que abre la pantalla de Liquidación —UCAPs, parámetros, censo,
 * liquidación, ID OFF, ID ON y la serie del IPP—: el valor a pagar no está
 * guardado en ninguna parte, se calcula cada vez a partir de todas ellas.
 *
 * Se traen una vez por municipio y quedan en memoria: en la Factura se salta de
 * un municipio a otro y volver a pedirlas cada vez haría esperar por algo que ya
 * se tiene. Como contrapartida, una liquidación corregida en otra pestaña no se
 * ve hasta recargar; el aviso de «mes sin cerrar» es lo que cubre ese hueco.
 *
 * `projectId` va siempre en null: los diez municipios del cuadro son empresas
 * propias. El único que se abre por proyecto es Canales & Contactos, que no es
 * una concesión de alumbrado y no está en el módulo.
 *
 * Un fallo no rompe la pantalla —la factura se diligencia a mano, que es como se
 * venía haciendo—: solo desaparece la ayuda, y se dice por qué.
 */
export function useLiquidacionCreg(companyId: number | null) {
  const cache = useRef(new Map<number, HojasCreg>());
  const [hojas, setHojas] = useState<HojasCreg | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId == null) { setHojas(null); setError(null); return; }

    const guardadas = cache.current.get(companyId);
    if (guardadas) { setHojas(guardadas); setError(null); setCargando(false); return; }

    // Al cambiar de municipio antes de que responda, lo que llegue tarde no manda.
    let vigente = true;
    setHojas(null);
    setError(null);
    setCargando(true);

    Promise.all([
      surveysService.getUcaps(companyId),
      cregService.getParametrizacion(companyId, null),
      cregService.getCenso(companyId, null),
      cregService.getLiquidacion(companyId, null),
      cregService.getIddOff(companyId, null),
      cregService.getIddOn(companyId, null),
      // El IPP no va por municipio: lo publica el DANE y es uno solo.
      cregService.getIppMensual().catch(() => ({} as Record<string, number>)),
    ])
      .then(([ucapsRes, param, censo, liq, idd, iddOn, ippMeses]) => {
        const h: HojasCreg = {
          ucaps: ucapsRes.ucaps,
          quantities: censo.data?.quantities ?? {},
          // La serie global entra como `ippMeses` para que `ippDelMes` la encuentre.
          params: { ...(param.data ?? {}), ippMeses },
          meses: liq.data?.meses ?? {},
          iddOff: idd.data?.meses ?? {},
          iddOn: iddOn.data?.meses ?? {},
          sumaMediaNoche: !!idd.data?.sumaMediaNoche,
        };
        cache.current.set(companyId, h);
        if (!vigente) return;
        setHojas(h);
        setCargando(false);
      })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudo leer la liquidación CREG de este municipio.');
        setCargando(false);
      });

    return () => { vigente = false; };
  }, [companyId]);

  return {
    cargando,
    error,
    /** Lo que se le cobra al municipio en `ym`. null mientras no haya hojas. */
    liquidacion: (ym: string): LiquidacionResultado | null =>
      hojas ? liquidarMes(hojas, ym) : null,
  };
}
