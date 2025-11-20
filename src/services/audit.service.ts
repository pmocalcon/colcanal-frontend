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
  fromDate?: string;
  toDate?: string;
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
  timeSincePrevious: string | null;
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
}

export const auditService = {
  async getAuditLogs(filters?: FilterAuditParams): Promise<AuditLogsResponse> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.userId) params.append('userId', filters.userId.toString());
    if (filters?.action) params.append('action', filters.action);
    if (filters?.requisitionId) params.append('requisitionId', filters.requisitionId.toString());
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);

    const response = await api.get<AuditLogsResponse>(`/audit/logs?${params.toString()}`);
    return response.data;
  },

  async getRequisitionDetail(requisitionId: number): Promise<RequisitionDetailResponse> {
    const response = await api.get<RequisitionDetailResponse>(`/audit/requisition/${requisitionId}`);
    return response.data;
  },
};
