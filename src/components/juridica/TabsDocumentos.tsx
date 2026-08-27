import { useNavigate } from 'react-router-dom';
import type { GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  DOCUMENTO_LABEL, estadoAlcanzo, type DocumentoJuridica, type JuridicaEstado,
} from '@/utils/juridicaWorkflow';
import { tipoRequisicionDe } from '@/config/juridicaContratos';

/**
 * Pestañas de los documentos de una solicitud de G. jurídica.
 *
 * Van en la cabecera de todas las pantallas del trámite —la solicitud y sus documentos—,
 * así que quien entra a un documento puede volver a cualquier otro sin pasar por la
 * solicitud. Por eso la barra vive acá y no dentro de una pantalla: unas pestañas que
 * solo existen en el origen serían botones disfrazados.
 *
 * Qué documento está habilitado depende de la etapa, y esa regla también vive acá: es
 * la misma en las seis pantallas y con una copia por pantalla acabarían discrepando.
 */

/** Los documentos salen del flujo: cada acción declara en cuál se ejecuta. */
export type TabDoc = DocumentoJuridica;

/**
 * Dónde vive cada documento. La clave del documento *es* el segmento de la ruta —salvo
 * la solicitud, que es la raíz—, así que no hay una tabla de equivalencias que se
 * pueda desincronizar.
 */
export const rutaDocumento = (solicitudId: number, doc: DocumentoJuridica) =>
  `/dashboard/gestion-conocimiento/juridica/${solicitudId}`
  + (doc === 'solicitud' ? '' : `/${doc}`);

interface Tab {
  key: TabDoc;
  label: string;
  habilitado: boolean;
  /** Qué falta para llegar acá. Se muestra al pasar el mouse por una pestaña apagada. */
  motivo: string;
}

const en = (estado: string, estados: JuridicaEstado[]) => estados.includes(estado as JuridicaEstado);

/**
 * Los documentos que solo existen en el trámite de servicios.
 *
 * Una requisición de personal termina en el contrato: lo que viene después —garantías,
 * designación de supervisor, acta de inicio y otrosíes— pertenece al contrato con un
 * tercero. A un empleado no se le exige póliza, no se le designa supervisor de contrato ni
 * se le firma un acta de inicio de obra.
 *
 * Se **ocultan** en vez de apagarse. Una pestaña apagada dice «todavía no» e invita a
 * esperar; acá lo que hay que decir es «no aplica a este trámite», y para eso la pestaña
 * sobra.
 */
const DOCS_SOLO_SERVICIOS = new Set<TabDoc>([
  'verificacion-garantias',
  'aprobacion-garantias',
  'designacion-supervisor',
  'acta-inicio',
  'otrosi',
]);

/** Los documentos con su etapa mínima, en el orden en que se diligencian. */
export function tabsDeLaSolicitud(sol: GcSolicitud | null): Tab[] {
  const estado = sol?.estado ?? 'borrador';

  // La lista de chequeo (GA-25-F) la diligencia Administrativa: se habilita al remitir
  // la solicitud y de ahí en adelante (todos los estados salvo los previos).
  const chequeo = estado !== 'borrador'
    && estado !== 'pendiente_autorizacion_gp'
    && estado !== 'pendiente_firma_gerencia';

  // La lista de chequeo se firma dos veces: Administrativa al verificar los documentos
  // y Jurídica al revisarlos. Es el requisito para redactar el contrato.
  const cl = sol?.data?.checklist as { revAdminNombre?: string; revJurNombre?: string } | undefined;
  const chequeoCompleto = !!cl?.revAdminNombre && !!cl?.revJurNombre;

  // El contrato se genera desde la etapa de elaboración en adelante, pero en esa etapa
  // exige además la lista de chequeo revisada por las dos direcciones. Más adelante ya
  // no se pide: el contrato existe y bloquearlo no protegería nada.
  const contrato = en(estado, ['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'])
    && (estado !== 'contrato_en_elaboracion' || chequeoCompleto);

  // Los nombres salen de `DOCUMENTO_LABEL`: el flujo también los usa para decir en qué
  // documento espera una acción, y dos listas de nombres acabarían discrepando.
  const tab = (key: TabDoc, habilitado: boolean, motivo: string): Tab =>
    ({ key, label: DOCUMENTO_LABEL[key], habilitado, motivo });

  /*
   * Manda lo elegido en el selector de la solicitud y, mientras nadie elija, lo que se
   * deduce del tipo de contrato. Es la misma regla con que la solicitud decide qué formato
   * imprime, y por eso sale de `tipoRequisicionDe` y no de una copia: si las pestañas
   * dijeran «servicios» y el papel «GTH-001-F», una de las dos estaría mintiendo.
   */
  const tipoReq = tipoRequisicionDe(sol?.data?.tipoRequisicion, sol?.data?.tipoContrato);

  const todas: Tab[] = [
    tab('solicitud', true, ''),
    tab('chequeo', chequeo,
      'Se habilita cuando la solicitud se remite a Administrativa'),
    tab('contrato', contrato,
      estado === 'contrato_en_elaboracion'
        ? 'Falta que la lista de chequeo la revisen la Dirección Administrativa y la Jurídica'
        : 'Se habilita en la etapa de revisión del contrato (Jurídica)'),
    // La verificación va entre el pago de la póliza y la designación: antes no tiene
    // sentido revisar la prima ni la autenticidad de una póliza que todavía no existe.
    tab('verificacion-garantias',
      en(estado, ['en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado']),
      'Se habilita cuando la póliza está pagada, antes de designar supervisor'),
    // El acta de aprobación es la conclusión de la verificación —los datos de cada póliza
    // y su CUMPLE / NO CUMPLE—, así que se levanta en la misma sesión y comparte etapa:
    // no es un paso más del flujo, es el papel que se firma y se archiva.
    tab('aprobacion-garantias',
      en(estado, ['en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado']),
      'Se habilita junto con la verificación de garantías, cuando la póliza está pagada'),
    tab('designacion-supervisor',
      en(estado, ['en_designacion_supervisor', 'en_acta_inicio', 'finalizado']),
      'Se habilita en la etapa de designación de supervisor (tras la firma del contrato)'),
    tab('acta-inicio',
      en(estado, ['en_acta_inicio', 'finalizado']),
      'Se habilita en la etapa de acta de inicio (tras la designación de supervisor)'),
    // El otrosí no es una etapa: modifica un contrato que ya está corriendo. Se abre en
    // la misma ventana que el acta de inicio y no se cierra nunca, porque una prórroga o
    // una adición pueden firmarse en cualquier momento de la vida del contrato.
    tab('otrosi',
      en(estado, ['en_acta_inicio', 'finalizado']),
      'Se habilita cuando el contrato ya está en ejecución (desde el acta de inicio)'),
  ];

  /*
   * Se ocultan solo mientras el trámite no haya pasado del contrato.
   *
   * Una requisición de personal firmada de hoy en adelante termina ahí y nunca llega a esas
   * etapas. Pero las que ya venían corriendo por pólizas cuando se cerró el flujo sí están
   * en ellas, y esconderles la pestaña las dejaría trancadas sin manera de terminar: la
   * acción de la etapa vive dentro del documento que se estaría ocultando.
   */
  const yaPasoDelContrato = estadoAlcanzo(estado, 'en_solicitud_polizas');

  return tipoReq === 'personal' && !yaPasoDelContrato
    ? todas.filter((t) => !DOCS_SOLO_SERVICIOS.has(t.key))
    : todas;
}

interface Props {
  solicitudId: number;
  sol: GcSolicitud | null;
  activo: TabDoc;
}

export function TabsDocumentos({ solicitudId, sol, activo }: Props) {
  const navigate = useNavigate();

  return (
    // El riel va en el contenedor de afuera y el desplazamiento en el de adentro. Si
    // fueran el mismo elemento, `overflow-x` obligaría al eje vertical a `auto` —basta
    // que un eje deje de ser `visible`— y el píxel que las pestañas sacan hacia abajo
    // para tapar el riel sería suficiente para que Windows pintara una barra vertical.
    // Con dos elementos el eje vertical queda oculto y no hay nada que desplazar.
    <div className="no-print border-b border-[#e6e6f0]">
      <div className="flex items-center gap-1 py-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabsDeLaSolicitud(sol).map((t) => {
        const esActivo = t.key === activo;
        return (
          <button
            key={t.key}
            type="button"
            disabled={!t.habilitado}
            onClick={() => !esActivo && navigate(rutaDocumento(solicitudId, t.key))}
            title={t.habilitado ? t.label : t.motivo}
            aria-current={esActivo ? 'page' : undefined}
            className={
              // El documento abierto se pinta de amarillo lleno, igual que el módulo
              // activo en la barra lateral: es la misma pregunta —dónde estoy— y se
              // responde igual en todo el sistema.
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors '
              + (!t.habilitado
                ? 'text-[#b0b0c4] cursor-not-allowed'
                : esActivo
                  ? 'bg-[#ffe81a] text-[#16162b] font-semibold'
                  : 'text-[#4a4a63] font-medium hover:bg-[#f6f6fa] hover:text-[#16162b]')
            }
          >
            {t.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}
