import api from './api';

export interface AuditLog {
  logId: number;
  requisitionId: number;
  userId: number;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  comments: string | null;
  createdAt: string;
  user: {
    userId: number;
    nombre: string;
    cargo: string;
    email: string;
  };
  requisition: {
    requisitionId: number;
    requisitionNumber: string;
    operationCenter?: {
      company?: {
        name: string;
      };
    };
  };
}

export interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

export interface FilterAuditParams {
  page?: number;
  limit?: number;
  userId?: number;
  action?: string;
  requisitionId?: number;
  requisitionNumber?: string;
  companyName?: string;
  userName?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Una orden de compra de la requisición, en el desglose de Registros.
 *
 * Salen todas las de la requisición, no solo las que deben factura: el cuadro de
 * «pendientes de factura» filtra porque es un cuadro de pendientes, pero aquí un
 * desglose vacío se leería como que la pantalla falló.
 */
export interface RequisitionPurchaseOrder {
  purchaseOrderNumber: string;
  issueDate: string | null;
  /** Días corridos desde que se emitió. */
  days: number;
  totalAmount: number;
  /** Estado de recepción de la OC: pendiente_recepcion, recepcionada, … */
  receptionStatus: string | null;
  /** Estado de facturación de la OC: sin_factura, factura_parcial, factura_completa, enviada_contabilidad, … */
  invoiceStatus: string | null;
  invoicedAmount: number;
  /** Lo que falta por facturar: valor de la orden menos lo facturado. */
  pendingAmount: number;
  /** Fecha del sistema en que la factura se envió a Contabilidad (la última). */
  sentToAccountingAt: string | null;
  /** Fecha del sistema en que se registró la última factura de la OC. */
  invoiceRegisteredAt: string | null;
}

/** Un paso del recorrido de estados de la requisición (lo que muestra la Matriz). */
export interface RequisitionEstado {
  action: string;
  date: string | null;
}

export interface RequisitionPurchaseOrdersResponse {
  orders: RequisitionPurchaseOrder[];
  estados: RequisitionEstado[];
}

export interface TimelineEvent {
  logId: number;
  action: string;
  createdAt: string;
  user: {
    userId: number;
    nombre: string;
    email: string;
    cargo: string;
  };
  previousStatus: string | null;
  newStatus: string | null;
  comments: string | null;
}

export interface RequisitionDetailResponse {
  requisition: {
    requisitionId: number;
    requisitionNumber: string;
    company: any;
    project: any;
    operationCenter: any;
    projectCode: any;
    creator: any;
    status: any;
    reviewer: any;
    approver: any;
    createdAt: string;
    updatedAt: string;
    reviewedAt: string | null;
    approvedAt: string | null;
    obra: string | null;
    codigoObra: string | null;
    items: any[];
    purchaseOrders: any[];
    approvals: any[];
  };
  amounts: {
    subtotal: number;
    iva: number;
    total: number;
  };
  timeline: TimelineEvent[];
  /**
   * Festivos colombianos como `YYYY-MM-DD`. La línea de tiempo los descuenta
   * —junto con los fines de semana— al medir cuánto tardó cada paso. Vienen del
   * backend para que la lista viva en un solo sitio.
   */
  holidays?: string[];
}

export interface AuditStats {
  totalRequisitions: number;
  totalPurchaseOrders: number;
  totalLogs: number;
  recentLogs: number;
}

export interface MatrixRow {
  requisitionId: number;
  requisitionNumber: string;
  companyName: string;
  currentStatus: { name: string; color: string } | null;
  events: Record<string, string>;
}

export interface MatrixResponse {
  actions: string[];
  rows: MatrixRow[];
  totalPurchaseOrders: number;
  purchaseOrdersByMonth?: { year: number; month: number; count: number }[];
  totalVoidedRequisitions?: number;
  voidedRequisitionsByMonth?: { year: number; month: number; count: number }[];
  purchaseOrderValueByMonth?: { year: number; month: number; value: number }[];
  invoiceValueByMonth?: { year: number; month: number; value: number }[];
  totalPurchaseOrderValue?: number;
  totalInvoiceValue?: number;
  topMaterials?: { code: string; description: string; reqCount: number; totalQuantity: number; totalAmount: number }[];
  topMaterialsByMonth?: { year: number; month: number; code: string; description: string; reqCount: number; totalQuantity: number; totalAmount: number }[];
  /**
   * A qué proveedores se les compró, de mayor a menor.
   *
   * `totalAmount` es el total de las órdenes —subtotal + IVA + otros conceptos—,
   * la misma cifra de la gráfica de órdenes por mes, y no la suma de los ítems,
   * que deja fuera fletes y similares.
   */
  topSuppliers?: {
    supplierId: number;
    name: string;
    nit: string | null;
    orderCount: number;
    totalAmount: number;
    invoicedAmount: number;
  }[];
  /**
   * Órdenes a las que les falta facturación —sin factura o facturadas a
   * medias—, de la más vieja a la más nueva. `days` son los días desde la
   * emisión y `pendingAmount` lo que el proveedor no ha cobrado todavía.
   */
  /**
   * Qué área compra más, de mayor a menor por valor.
   *
   * El área sale del rol de quien creó la requisición: la base no la guarda como
   * tal. La agrupación vive en `areas.constants.ts` del backend.
   */
  purchasesByArea?: { area: string; requisitions: number; amount: number }[];
  /**
   * Festivos colombianos como `YYYY-MM-DD`. La matriz los descuenta —junto con
   * los fines de semana— al medir cuánto tardó cada paso. Vienen del backend
   * para que la lista viva en un solo sitio.
   */
  holidays?: string[];
  ordersPendingInvoice?: {
    purchaseOrderNumber: string;
    supplierName: string;
    issueDate: string | null;
    days: number;
    totalAmount: number;
    invoicedAmount: number;
    pendingAmount: number;
    requisitionNumber: string | null;
    companyName: string | null;
  }[];
}

export interface MaterialPurchaseRow {
  poItemId: number;
  projectName: string | null;
  companyName: string | null;
  purchaseOrderNumber: string;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  materialCode: string;
  materialDescription: string;
  groupName: string;
  quantity: number;
  tipoObra: string | null;
  requisitionNumber: string;
  orderDate: string | null;
}

export interface MaterialPurchaseControlResponse {
  data: MaterialPurchaseRow[];
  total: number;
  groups: { groupId: number; name: string }[];
  years: number[];
}

export interface SupplierPurchaseRow {
  poItemId: number;
  supplierId: number;
  supplierName: string;
  supplierNit: string;
  materialCode: string;
  materialDescription: string;
  groupName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  purchaseOrderNumber: string;
  orderDate: string | null;
  companyName: string | null;
  projectName: string | null;
}

export interface SupplierPurchasesResponse {
  data: SupplierPurchaseRow[];
  total: number;
  suppliers: { supplierId: number; name: string; nit: string }[];
  years: number[];
}

export const auditService = {
  async getAuditLogs(filters?: FilterAuditParams): Promise<AuditLogsResponse> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.userId) params.append('userId', filters.userId.toString());
    if (filters?.action) params.append('action', filters.action);
    if (filters?.requisitionId) params.append('requisitionId', filters.requisitionId.toString());
    if (filters?.requisitionNumber) params.append('requisitionNumber', filters.requisitionNumber);
    if (filters?.companyName) params.append('companyName', filters.companyName);
    if (filters?.userName) params.append('userName', filters.userName);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);

    const response = await api.get<AuditLogsResponse>(`/audit/logs?${params.toString()}`);
    return response.data;
  },

  async getRequisitionDetail(requisitionId: number): Promise<RequisitionDetailResponse> {
    const response = await api.get<RequisitionDetailResponse>(`/audit/requisition/${requisitionId}`);
    return response.data;
  },

  /** Las órdenes de compra de una requisición y su recorrido de estados, para el desglose de Registros. */
  async getRequisitionPurchaseOrders(requisitionId: number): Promise<RequisitionPurchaseOrdersResponse> {
    const response = await api.get<RequisitionPurchaseOrdersResponse>(
      `/audit/requisition/${requisitionId}/purchase-orders`,
    );
    return response.data;
  },

  async getMatrix(filters?: {
    fromDate?: string;
    toDate?: string;
    requisitionNumber?: string;
    companyName?: string;
    materialCode?: string;
    requesterName?: string;
    /** Cargo de quien creó la requisición. Es por lo que filtra el selector de personas. */
    requesterCargo?: string;
  }): Promise<MatrixResponse> {
    const params = new URLSearchParams();
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    if (filters?.requisitionNumber) params.append('requisitionNumber', filters.requisitionNumber);
    if (filters?.companyName) params.append('companyName', filters.companyName);
    if (filters?.materialCode) params.append('materialCode', filters.materialCode);
    if (filters?.requesterName) params.append('requesterName', filters.requesterName);
    if (filters?.requesterCargo) params.append('requesterCargo', filters.requesterCargo);
    const response = await api.get<MatrixResponse>(`/audit/matrix?${params.toString()}`);
    return response.data;
  },

  async getStats(): Promise<AuditStats> {
    const response = await api.get<AuditStats>('/audit/stats');
    return response.data;
  },

  async getMaterialsPurchaseControl(filters?: {
    groupId?: number;
    year?: number;
    onlyInvoiced?: boolean;
  }): Promise<MaterialPurchaseControlResponse> {
    const params = new URLSearchParams();
    if (filters?.groupId) params.append('groupId', filters.groupId.toString());
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.onlyInvoiced) params.append('onlyInvoiced', 'true');
    const response = await api.get<MaterialPurchaseControlResponse>(
      `/audit/materials-purchase-control?${params.toString()}`
    );
    return response.data;
  },

  async getSupplierPurchases(filters?: {
    supplierId?: number;
    year?: number;
  }): Promise<SupplierPurchasesResponse> {
    const params = new URLSearchParams();
    if (filters?.supplierId) params.append('supplierId', filters.supplierId.toString());
    if (filters?.year) params.append('year', filters.year.toString());
    const response = await api.get<SupplierPurchasesResponse>(
      `/audit/supplier-purchases?${params.toString()}`
    );
    return response.data;
  },
};
