/**
 * Tipos relacionados con requisiciones
 */

// Tipos base
export interface MaterialGroup {
  groupId: number;
  name: string;
  categoryId?: number;
}

export interface Material {
  materialId: number;
  code: string;
  description: string;
  name?: string;
  materialGroup?: MaterialGroup;
}

export interface Company {
  companyId: number;
  name: string;
}

export interface Project {
  projectId: number;
  name: string;
}

export interface OperationCenter {
  centerId: number;
  code: string;
}

export interface ProjectCode {
  codeId: number;
  code: string;
}

export interface UserBasic {
  userId: number;
  nombre: string;
  email: string;
  cargo?: string;
  role?: {
    rolId: number;
    nombreRol: string;
    category?: string;
  };
}

export interface RequisitionStatus {
  statusId: number;
  code: string;
  name: string;
  description?: string;
  color?: string;
  order?: number;
}

// Items
export interface RequisitionItem {
  itemId: number;
  itemNumber: number;
  materialId: number;
  quantity: number;
  unit?: string;
  observation?: string;
  material: Material & {
    materialGroup: MaterialGroup;
  };
}

// Logs
export interface RequisitionLog {
  logId: number;
  requisitionId: number;
  userId: number;
  action: string;
  previousStatus?: string;
  newStatus: string;
  comments?: string;
  createdAt: string;
  user: UserBasic;
}

// Requisición principal
export interface Requisition {
  requisitionId: number;
  requisitionNumber: string;
  companyId: number;
  projectId?: number;
  operationCenterId: number;
  projectCodeId?: number;
  obra?: string;
  codigoObra?: string;
  priority?: 'alta' | 'normal';
  createdBy: number;
  statusId: number;
  reviewedBy?: number;
  approvedBy?: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  approvedAt?: string;
  company: Company;
  project?: Project;
  operationCenter: OperationCenter;
  projectCode?: ProjectCode;
  creator: UserBasic;
  status?: RequisitionStatus;
  reviewer?: UserBasic;
  approver?: UserBasic;
  items: RequisitionItem[];
  logs?: RequisitionLog[];
  // Flags de estado
  isPending?: boolean;
  lastActionDate?: string;
  lastActionLabel?: string;
  // SLA
  isOverdue?: boolean;
  slaDeadline?: string;
  daysOverdue?: number;
  daysRemaining?: number;
}

// DTOs
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
  decision: 'approve' | 'reject';
  comments?: string;
}

export interface ValidateRequisitionDto {
  decision: 'validate' | 'reject';
  comments?: string;
}

export interface FilterRequisitionsDto {
  page?: number;
  limit?: number;
  status?: string;
  projectId?: number;
  fromDate?: string;
  toDate?: string;
}

// Aprobaciones por item
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
  user?: UserBasic;
  requisitionItem?: RequisitionItem;
}
