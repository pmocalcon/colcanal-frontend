import api from './api';

export interface PendingVoidRequest {
  requisitionId: number;
  requisitionNumber: string;
  companyName: string | null;
  projectName: string | null;
  requestedByName: string | null;
  motivo: string | null;
  requestedAt: string | null;
}

// Types
// NOTA: Los tipos están siendo migrados a @/types/requisition.types.ts
// Para nuevas funcionalidades, preferir importar desde @/types
export interface Material {
  materialId: number;
  code: string;
  name?: string;
  description: string;
}

export interface RequisitionItem {
  itemId: number;
  itemNumber: number;
  materialId: number;
  quantity: number;
  unit?: string;
  observation?: string;
  material: Material;
}

export interface Company {
  companyId: number;
  name: string;
}

export interface Project {
  projectId: number;
  name: string;
}

export interface User {
  userId: number;
  nombre: string;
  email: string;
  role?: {
    roleId: number;
    nombreRol: string;
  };
}

export interface RequisitionStatus {
  statusId: number;
  name: string;
  code: string;
}

export interface Requisition {
  requisitionId: number;
  requisitionNumber: string;
  companyId: number;
  projectId?: number;
  createdBy: number;
  statusId?: number; // El backend retorna statusId directamente
  obra?: string;
  codigoObra?: string;
  priority?: 'alta' | 'normal';
  createdAt: string;
  updatedAt?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  approvedBy?: number;
  approvedAt?: string;
  items: RequisitionItem[];
  company: Company;
  project?: Project;
  creator: User;
  reviewer?: User;
  approver?: User;
  status: RequisitionStatus;
  operationCenter?: {
    code: string;
  };
  projectCode?: {
    code: string;
  };
  logs?: Array<{
    logId: number;
    action: string;
    comments?: string;
    previousStatus?: string;
    newStatus?: string;
    createdAt: string;
    user: User;
  }>;
  // SLA fields
  slaDeadline?: string;
  isOverdue?: boolean;
  daysOverdue?: number;
  daysRemaining?: number;
}

export interface RequisitionsListResponse {
  data: Requisition[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FilterRequisitionsParams {
  page?: number;
  limit?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
  projectId?: number;
  companyId?: number;
  search?: string;
}

export interface CreateRequisitionItemDto {
  materialId: number;
  quantity: number;
  observation?: string;
}

export interface CreateRequisitionDto {
  companyId: number;
  projectId?: number;
  obra?: string;
  codigoObra?: string;
  /**
   * Solo en la compra anticipada. El acta todavía no tiene código de
   * contabilidad, así que este número es lo que permite estampárselo a la
   * requisición cuando el acta se apruebe. Exige que Gerencia haya autorizado
   * la compra sobre esa acta.
   */
  actaNumber?: string;
  priority?: 'alta' | 'normal';
  items: CreateRequisitionItemDto[];
}

export interface ItemDecisionDto {
  itemId: number;
  decision: 'approve' | 'reject';
  comments?: string;
}

export interface ItemApprovalResponse {
  itemApprovalId: number;
  requisitionId: number;
  itemNumber: number;
  materialId: number;
  quantity: number;
  observation?: string;
  requisitionItemId?: number;
  userId: number;
  approvalLevel: 'reviewer' | 'authorizer' | 'management';
  status: 'approved' | 'rejected';
  comments?: string;
  isValid: boolean;
  createdAt: string;
  user?: User;
  requisitionItem?: RequisitionItem;
}

// Requisitions Service
export interface PurchasesDashboardSummary {
  year: number | null;
  years: number[];
  savings: { value: number; items: number };
  poPending: { value: number; count: number };
  byCompany: { name: string; count: number; value: number }[];
  byCategory: { name: string; value: number }[];
  monthlyByYear: { year: number; month: number; value: number }[];
  requisitions: {
    total: number;
    byStatus: { name: string; count: number }[];
    monthly: { month: string; count: number }[];
  };
  purchaseOrders: {
    total: number;
    value: number;
    byStatus: { name: string; count: number; value: number }[];
    bySupplier: { name: string; count: number; value: number }[];
    monthly: { month: string; count: number; value: number }[];
    byYear: { year: number; count: number; value: number }[];
  };
}

export const requisitionsService = {
  /**
   * Get my requisitions with filters
   */
  async getMyRequisitions(
    filters?: FilterRequisitionsParams,
  ): Promise<RequisitionsListResponse> {
    const response = await api.get<RequisitionsListResponse>(
      '/purchases/requisitions/my-requisitions',
      { params: filters },
    );
    return response.data;
  },

  /**
   * Get requisition by ID
   */
  async getRequisitionById(id: number): Promise<Requisition> {
    const response = await api.get<Requisition>(
      `/purchases/requisitions/${id}`,
    );
    return response.data;
  },

  /**
   * Create new requisition
   */
  async createRequisition(data: CreateRequisitionDto): Promise<Requisition> {
    const response = await api.post<Requisition>(
      '/purchases/requisitions',
      data,
    );
    return response.data;
  },

  /**
   * Update requisition
   */
  async updateRequisition(
    id: number,
    data: Partial<CreateRequisitionDto>,
  ): Promise<Requisition> {
    const response = await api.patch<Requisition>(
      `/purchases/requisitions/${id}`,
      data,
    );
    return response.data;
  },

  /**
   * Get all requisitions (analista PMO / director PMO)
   */
  async getAllRequisitions(
    filters?: FilterRequisitionsParams,
  ): Promise<RequisitionsListResponse> {
    const response = await api.get<RequisitionsListResponse>(
      '/purchases/requisitions/all-requisitions',
      { params: filters },
    );
    return response.data;
  },

  /**
   * Anular requisiciones. PMO anula directo; el rol Compras genera una
   * solicitud (requested) que la Directora Financiera aprueba/rechaza.
   */
  async voidRequisitions(
    ids: number[],
    comments?: string,
  ): Promise<{ voided: number[]; requested?: number[]; errors: { id: number; reason: string }[] }> {
    const response = await api.post<{ voided: number[]; requested?: number[]; errors: { id: number; reason: string }[] }>(
      '/purchases/requisitions/void-requisitions',
      { ids, comments },
    );
    return response.data;
  },

  /**
   * Solicitudes de anulación pendientes (bandeja de la Directora Financiera).
   */
  async getPendingVoidRequests(): Promise<PendingVoidRequest[]> {
    const response = await api.get<PendingVoidRequest[]>('/purchases/requisitions/pending-void');
    return response.data;
  },

  /**
   * Aprobar/rechazar una solicitud de anulación (Directora Financiera).
   */
  async reviewVoidRequest(
    requisitionId: number,
    decision: 'aprobado' | 'rechazado',
    motivo?: string,
  ): Promise<{ requisitionId: number; newStatus: string }> {
    const response = await api.patch<{ requisitionId: number; newStatus: string }>(
      `/purchases/requisitions/${requisitionId}/review-void`,
      { decision, motivo },
    );
    return response.data;
  },

  /**
   * Get pending actions (requisitions waiting for review/approval)
   */
  async getPendingActions(
    filters?: FilterRequisitionsParams,
  ): Promise<RequisitionsListResponse> {
    const response = await api.get<RequisitionsListResponse>(
      '/purchases/requisitions/pending-actions',
      { params: filters },
    );
    return response.data;
  },

  /** Resumen agregado de compras (totales exactos + desglose + tendencia mensual). */
  async getDashboardSummary(year?: number): Promise<PurchasesDashboardSummary> {
    const response = await api.get<PurchasesDashboardSummary>(
      '/purchases/requisitions/dashboard-summary',
      { params: year ? { year } : undefined },
    );
    return response.data;
  },

  /**
   * Get item-level approvals for a requisition
   */
  async getItemApprovals(
    requisitionId: number,
    approvalLevel?: 'reviewer' | 'authorizer' | 'management',
  ): Promise<ItemApprovalResponse[]> {
    const response = await api.get<ItemApprovalResponse[]>(
      `/purchases/requisitions/${requisitionId}/item-approvals`,
      { params: approvalLevel ? { approvalLevel } : {} },
    );
    return response.data;
  },
};
