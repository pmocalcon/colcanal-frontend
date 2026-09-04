import { useEffect, useState } from 'react';
import { gestionConocimientoService, type JefePosible } from '@/services/gestionConocimiento.service';

/**
 * Los jefes entre los que puede repartirse un formato propio.
 *
 * En la empresa tener varios autorizadores es lo normal, y el paso «pendiente del jefe»
 * antes le caía a uno cualquiera de ellos. Con esta lista el formato dice a cuál va, y
 * el papel deja de prometer una cosa mientras el sistema hace otra.
 *
 * No lanza: si la consulta falla la lista queda vacía y el formato sigue el camino de
 * siempre —avisar a todos los autorizadores—, que es peor pero no bloquea a nadie.
 */
export function useMisJefes(): { jefes: JefePosible[]; cargando: boolean } {
  const [jefes, setJefes] = useState<JefePosible[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await gestionConocimientoService.misJefes();
        if (!cancelado) setJefes(lista);
      } catch {
        if (!cancelado) setJefes([]);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return { jefes, cargando };
}
