/**
 * Membrete del pie de los documentos de G. jurídica: la sede principal y los canales de
 * gestión documental.
 *
 * Los datos de Cali son constantes de la casa y no campos del formulario. Estaban copiados
 * literal en el contrato de prestación y en el otrosí; teniéndolos acá, un cambio de PBX o
 * de correo se hace una vez. Ya no queda ninguna copia suelta: era exactamente el riesgo
 * que anunciaba esta nota —al actualizar el contrato a la plantilla 2026, su copia habría
 * quedado diciendo una dirección distinta de la de los otros ocho documentos—.
 *
 * El texto es el del pie de página de las plantillas 2026: las veinte que lo llevan lo
 * traen idéntico, sin el «B/» del barrio y con los canales en un solo renglón separados
 * por barras.
 *
 * `sede` y `correo` son de la representada y sí varían: cada UTAP tiene la suya, y los
 * escritos que se radican a nombre de una de ellas deben mostrarla bajo la dirección
 * principal. Los documentos que no la llevan simplemente no los pasan.
 */
export function PieMembrete({ sede, correo }: { sede?: string; correo?: string }) {
  return (
    <div className="mt-10 pt-3 text-center text-[9.5px] leading-snug text-[#0a2a52]">
      <p>Calle 13A N.º 101-60, Ciudad Jardín, Cali, Valle del Cauca</p>
      {(sede || correo) && (
        <p>
          {sede && <>Sede: {sede}</>}
          {sede && correo && <> &nbsp;|&nbsp; </>}
          {correo && <span className="underline">{correo}</span>}
        </p>
      )}
      <p>
        <span className="underline">gestiondocumental@alumbrados.co</span>
        {' | '}PBX (602) 5246612 Ext. 111{' | '}Línea nacional 3009108536
      </p>
    </div>
  );
}
