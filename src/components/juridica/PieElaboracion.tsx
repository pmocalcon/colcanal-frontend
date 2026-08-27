/**
 * Pie de elaboración de los documentos de G. jurídica: quién los elaboró y quién los
 * proyectó y revisó.
 *
 * Los nombres son constantes y no campos del formulario porque son siempre los mismos: los
 * documentos los firma la Representante Legal, pero los elabora y revisa siempre Jurídica.
 * Teniéndolos aquí, un cambio de persona se hace una vez y alcanza a los seis documentos
 * del trámite; como campos, habría que acordarse de escribirlos en cada uno y acabarían
 * diciendo cosas distintas.
 *
 * Va **fuera** del marco del documento y debajo: en el formato impreso es pie de página, no
 * parte del cuerpo del acta.
 */

const ELABORO = { nombre: 'Mayiver Sarria Galíndez', cargo: 'Coordinadora Jurídica' };
const REVISO = { nombre: 'Marta Cecilia Rodríguez Herrera', cargo: 'Directora Jurídica' };

/**
 * `soloRevision` deja únicamente la línea de quien revisó. No todos los formatos llevan las
 * dos: hay documentos donde quien elabora varía y se escribe a mano, y otros que no
 * distinguen autoría.
 *
 * `etiqueta` cambia el verbo de esa línea. No es un capricho de redacción: «proyectó y
 * revisó» dice que Jurídica escribió el documento, y «revisó y aprobó» que lo autorizó. El
 * otrosí usa la segunda porque su modelo así lo exige, y son responsabilidades distintas.
 *
 * `sinRevision` quita esa línea. Es lo que la constancia de antecedentes marca como
 * «[SI APLICA]»: hay verificaciones que Jurídica no revisa. Imprimir el corchete sería
 * dejar un hueco sin llenar en un documento firmado, y borrar la línea a mano se olvida;
 * así se decide al diligenciar y el papel sale limpio en los dos casos.
 */
export function PieElaboracion({ className, soloRevision, sinRevision, etiqueta }: {
  className?: string; soloRevision?: boolean; sinRevision?: boolean; etiqueta?: string;
}) {
  return (
    <div className={'px-8 pt-3 text-[10px] text-black space-y-0.5 ' + (className ?? '')}>
      {!soloRevision && <p>Elaboró: {ELABORO.nombre} - {ELABORO.cargo}</p>}
      {!sinRevision && <p>{etiqueta ?? 'Proyectó y revisó'}: {REVISO.nombre} – {REVISO.cargo}</p>}
    </div>
  );
}
