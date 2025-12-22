import api from './api';

// Types
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
