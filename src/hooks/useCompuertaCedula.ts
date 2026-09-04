import { useCallback, useState } from 'react';
import { buscarFicha } from '@/utils/prellenarFormato';
import type { FichaFormato } from '@/services/gestionConocimiento.service';

/**
 * La compuerta que abre un formato de Talento Humano cuando aparece la ficha de la cédula.
 *
 * Los cuatro formatos —préstamo, permiso, vacaciones y horas extras— se diligencian contra
 * una persona concreta, así que hasta no saber quién es no hay nada que llenar: sin esto se
 * puede escribir el formato entero y descubrir al final que la cédula no existe, o peor,
 * dejar un encabezado a medias con datos tecleados a mano.
 *
 * Compara contra **la cédula que está escrita ahora**, no contra una copia interna: si la
 * cambian por otra la compuerta se cierra en la misma tecla, y así no queda el encabezado
 * de una persona junto al formato de otra.
 */
export interface CompuertaCedula {
  /** True cuando la cédula escrita es la que ya se validó: el formato está abierto. */
  lista: boolean;
  /** Mientras se consulta la ficha, para no dejar la pantalla muda. */
  buscando: boolean;
  /** La última búsqueda no encontró ficha. Se limpia al volver a intentar. */
  sinFicha: boolean;
  /**
   * Busca la ficha y abre la compuerta si aparece. Devuelve la ficha para que cada formato
   * reparta los datos en sus casillas —lo único que cambia entre uno y otro—, y `null` si
   * no hay ficha, en cuyo caso la compuerta queda cerrada.
   *
   * `veniaDeOtra` avisa que se reemplazó una cédula ya validada, para que la página decida
   * si pisa el encabezado o solo llena lo que está en blanco.
   */
  validar: (cedula: string) => Promise<{ ficha: FichaFormato | null; veniaDeOtra: boolean }>;
  /** Abre la compuerta sin consultar: lo ya guardado no se vuelve a pedir. */
  abrirGuardada: (cedula: string) => void;
}

const soloDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export function useCompuertaCedula(cedulaEscrita: string): CompuertaCedula {
  const [validada, setValidada] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [sinFicha, setSinFicha] = useState(false);

  const validar = useCallback(
    async (cedula: string) => {
      const limpia = soloDigitos(cedula);
      const veniaDeOtra = validada !== '' && validada !== limpia;
      // Salir de la casilla sin haberla tocado no dispara otra consulta.
      if (limpia !== '' && limpia === validada) {
        return { ficha: null, veniaDeOtra: false };
      }
      setValidada('');
      setSinFicha(false);
      if (!limpia) return { ficha: null, veniaDeOtra };
      setBuscando(true);
      const ficha = await buscarFicha(limpia);
      setBuscando(false);
      if (!ficha) {
        setSinFicha(true);
        return { ficha: null, veniaDeOtra };
      }
      setValidada(limpia);
      return { ficha, veniaDeOtra };
    },
    [validada],
  );

  const abrirGuardada = useCallback((cedula: string) => {
    setValidada(soloDigitos(cedula));
    setSinFicha(false);
  }, []);

  return {
    lista: validada !== '' && validada === soloDigitos(cedulaEscrita),
    buscando,
    sinFicha,
    validar,
    abrirGuardada,
  };
}
