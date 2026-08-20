import api from './api';

/** Una cosa esperando la firma de Gerencia. */
export interface ItemAprobacion {
  id: number;
  titulo: string;
  detalle: string;
  solicitante: string | null;
  fecha: string;
  /** Días que lleva esperando. */
  dias: number;
  valor: number | null;
  /** Pantalla donde se ve el detalle completo. */
  ruta: string;
  /** Lo que la acción necesita y no cabe en el id (la llave del acta, por ejemplo). */
  extra?: {
    companyId?: number;
    projectId?: number | null;
    actaNumber?: string;
    justificacion?: string | null;
  };
}

export interface Bandeja {
  clave:
    | 'requisiciones'
    | 'ordenes-compra'
    | 'presupuestos'
    | 'compra-anticipada'
    | 'contratos'
    | 'anticipos'
    | 'prestamos';
  titulo: string;
  /** De qué módulo viene, para que se sepa de dónde salió cada cosa. */
  modulo: string;
  /** 'directa' se decide aquí; 'en-pantalla' abre el módulo. */
  decision: 'directa' | 'en-pantalla';
  total: number;
  items: ItemAprobacion[];
}

export const aprobacionesService = {
  /**
   * Todo lo que espera firma, agrupado por origen.
   *
   * Solo lectura. Las decisiones se ejecutan contra los endpoints de cada módulo,
   * que son los que validan quién puede y desde qué estado.
   */
  async getPendientes(): Promise<Bandeja[]> {
    const response = await api.get<Bandeja[]>('/aprobaciones/pendientes');
    return response.data;
  },
};
