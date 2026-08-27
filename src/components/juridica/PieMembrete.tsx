/**
 * Membrete del pie de los documentos de G. jurídica: la sede principal y los canales de
 * gestión documental.
 *
 * Los datos de Cali son constantes de la casa y no campos del formulario. Estaban copiados
 * literal en el contrato de prestación y en el otrosí; teniéndolos acá, un cambio de PBX o
 * de correo se hace una vez. Esos dos siguen con su copia y conviene migrarlos, porque una
 * copia que nadie recuerda actualizar acaba diciendo algo distinto.
 *
 * `sede` y `correo` son de la representada y sí varían: cada UTAP tiene la suya, y los
 * escritos que se radican a nombre de una de ellas deben mostrarla bajo la dirección
 * principal. Los documentos que no la llevan simplemente no los pasan.
 */
export function PieMembrete({ sede, correo }: { sede?: string; correo?: string }) {
  return (
    <div className="mt-10 pt-3 text-center text-[9.5px] leading-snug text-[#0a2a52]">
      <p>Calle 13A N.º 101 - 60 B/ Ciudad Jardín Cali, Valle del Cauca</p>
      {(sede || correo) && (
        <p>
          {sede && <>Sede: {sede}</>}
          {sede && correo && <> &nbsp;|&nbsp; </>}
          {correo && <span className="underline">{correo}</span>}
        </p>
      )}
      <p className="underline">gestiondocumental@alumbrados.co</p>
      <p>PBX: (602) 5246612 Ext. 111 &nbsp; Línea nacional 3009108536</p>
    </div>
  );
}
