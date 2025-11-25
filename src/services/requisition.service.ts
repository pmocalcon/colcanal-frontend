import api from './api';

// ============================================
// INTERFACES
// ============================================

export interface RequisitionItem {
  itemId: number;
  itemNumber: number;
  materialId: number;
  quantity: number;
  observation?: string;
  material: {
    materialId: number;
    code: string;
    description: string;
    materialGroup: {
      groupId: number;
      name: string;
    };
  };
}

export interface Requisition {
  requisitionId: number;
  requisitionNumber: string;
  companyId: number;
  projectId?: number;
  operationCenterId: number;
  projectCodeId?: number;
  obra?: string;
  codigoObra?: string;
  createdBy: number;
  statusId: number;
  reviewedBy?: number;
  approvedBy?: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  approvedAt?: string;
  company: {
    companyId: number;
    name: string;
  };
  project?: {
    projectId: number;
    name: string;
  };
  operationCenter: {
    centerId: number;
    code: string;
  };
  projectCode?: {
    codeId: number;
    code: string;
  };
  creator: {
    userId: number;
    nombre: string;
    email: string;
    role: {
      rolId: number;
      nombreRol: string;
      category: string;
    };
  };
  status?: {
    statusId: number;
    code: string;
    name: string;
    description: string;
    color: string;
    order: number;
  };
  reviewer?: {
    userId: number;
    nombre: string;
    email: string;
  };
  approver?: {
    userId: number;
    nombre: string;
    email: string;
  };
  items: RequisitionItem[];
  logs?: RequisitionLog[];
  // New fields from backend
  isPending?: boolean;
  lastActionDate?: string;
  lastActionLabel?: string;
  // SLA fields
  isOverdue?: boolean;
  slaDeadline?: string;
  daysOverdue?: number;
}

export interface RequisitionLog {
  logId: number;
  requisitionId: number;
  userId: number;
  action: string;
  previousStatus?: string;
  newStatus: string;
  comments?: string;
  createdAt: string;
  user: {
    userId: number;
    nombre: string;
    email: string;
    role: {
      rolId: number;
      nombreRol: string;
      category: string;
    };
  };
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
  items: CreateRequisitionItemDto[];
}

export interface ReviewRequisitionDto {
  decision: 'approve' | 'reject';
  comments?: string;
}

export interface ApproveRequisitionDto {
  comments?: string;
}

export interface RejectRequisitionDto {
  comments: string;
}

export interface AuthorizeRequisitionDto {
  decision: 'authorize' | 'reject';
  comments?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  pending?: number;
  processed?: number;
}

export interface FilterRequisitionsDto {
  page?: number;
  limit?: number;
  status?: string;
  projectId?: number;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// API METHODS
// ============================================

/**
 * Crear una nueva requisición
 */
export const createRequisition = async (
  data: CreateRequisitionDto
): Promise<Requisition> => {
  const response = await api.post('/purchases/requisitions', data);
  return response.data;
};

/**
 * Obtener mis requisiciones creadas (con filtros opcionales)
 */
export const getMyRequisitions = async (
  filters?: FilterRequisitionsDto
): Promise<PaginatedResponse<Requisition>> => {
  const response = await api.get('/purchases/requisitions/my-requisitions', {
    params: filters,
  });
  return response.data;
};

/**
 * Obtener requisiciones pendientes de acción (revisar/aprobar)
 */
export const getPendingActions = async (
  filters?: FilterRequisitionsDto
): Promise<PaginatedResponse<Requisition>> => {
  const response = await api.get('/purchases/requisitions/pending-actions', {
    params: filters,
  });
  return response.data;
};

/**
 * Obtener detalle de una requisición por ID
 */
export const getRequisitionById = async (
  requisitionId: number
): Promise<Requisition> => {
  const response = await api.get(`/purchases/requisitions/${requisitionId}`);
  return response.data;
};

/**
 * Revisar una requisición (para Directores - Nivel 1)
 */
export const reviewRequisition = async (
  requisitionId: number,
  data: ReviewRequisitionDto
): Promise<Requisition> => {
  const response = await api.post(
    `/purchases/requisitions/${requisitionId}/review`,
    data
  );
  return response.data;
};

/**
 * Aprobar una requisición (para Gerencia - Nivel 2)
 */
export const approveRequisition = async (
  requisitionId: number,
  data?: ApproveRequisitionDto
): Promise<Requisition> => {
  const response = await api.post(
    `/purchases/requisitions/${requisitionId}/approve`,
    data || {}
  );
  return response.data;
};

/**
 * Rechazar una requisición (para Gerencia - Nivel 2)
 */
export const rejectRequisition = async (
  requisitionId: number,
  data: RejectRequisitionDto
): Promise<Requisition> => {
  const response = await api.post(
    `/purchases/requisitions/${requisitionId}/reject`,
    data
  );
  return response.data;
};

/**
 * Autorizar una requisición (para Gerencia de Proyectos)
 */
export const authorizeRequisition = async (
  requisitionId: number,
  data: AuthorizeRequisitionDto
): Promise<Requisition> => {
  const response = await api.post(
    `/purchases/requisitions/${requisitionId}/authorize`,
    data
  );
  return response.data;
};

/**
 * Actualizar una requisición existente
 */
export const updateRequisition = async (
  requisitionId: number,
  data: Partial<CreateRequisitionDto>
): Promise<Requisition> => {
  const response = await api.patch(
    `/purchases/requisitions/${requisitionId}`,
    data
  );
  return response.data;
};

/**
 * Eliminar una requisición (solo si está en estado pendiente)
 */
export const deleteRequisition = async (
  requisitionId: number
): Promise<{ message: string }> => {
  const response = await api.delete(`/purchases/requisitions/${requisitionId}`);
  return response.data;
};
