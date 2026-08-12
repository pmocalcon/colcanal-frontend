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
 * `soloRevision` deja únicamente la línea de quien proyectó y revisó. No todos los formatos
 * llevan las dos: el otrosí, por ejemplo, lo firma quien lo revisa y no distingue autoría.
 */
export function PieElaboracion({ className, soloRevision }: { className?: string; soloRevision?: boolean }) {
  return (
    <div className={'px-8 pt-3 text-[10px] text-black space-y-0.5 ' + (className ?? '')}>
      {!soloRevision && <p>Elaboró: {ELABORO.nombre} - {ELABORO.cargo}</p>}
      <p>Proyectó y revisó: {REVISO.nombre} – {REVISO.cargo}</p>
    </div>
  );
}
