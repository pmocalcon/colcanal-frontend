import api from './api';
import type { RequisitionWithQuotations } from './quotation.service';

// ============================================
// INTERFACES
// ============================================

export interface PurchaseOrder {
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  requisitionId: number;
  supplierId: number;
  issueDate: string;
  subtotal: number;
  totalIva: number;
  totalDiscount: number;
  totalAmount: number;
  approvalStatus?: {
    statusId: number;
    code: string;
    name: string;
    description: string;
    color: string;
    order: number;
  };
  approvalStatusId?: number;
  rejectionCount?: number;
  lastRejectionReason?: string | null;
  currentApproverId?: number | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  supplier?: {
    supplierId: number;
    name: string;
    nitCc?: string;
    nit?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  };
  items?: PurchaseOrderItem[];
  requisition?: {
    requisitionId: number;
    requisitionNumber: string;
    priority?: 'alta' | 'normal';
    operationCenter?: {
      centerId: number;
      code: string;
      name: string;
      company?: {
        companyId: number;
        name: string;
      };
    };
  };
  approvals?: PurchaseOrderApproval[];
  deadline?: string;
  isOverdue?: boolean;
  daysOverdue?: number;
  estimatedDeliveryDate?: string;
  creator?: {
    userId: number;
    nombre: string;
    email: string;
  };
}

export interface PurchaseOrderItem {
  poItemId: number;
  purchaseOrderId: number;
  requisitionItemId: number;
  quotationId: number;
  quantity: number;
  unitPrice: number;
  hasIva: boolean;
  ivaPercentage: number;
  subtotal: number;
  ivaAmount: number;
  discount: number;
  totalAmount: number;
  requisitionItem?: {
    itemId: number;
    itemNumber: number;
    material: {
      materialId: number;
      code: string;
      name: string;
      description?: string;
      unit: string;
      materialGroup?: {
        groupId: number;
        name: string;
      };
    };
    quantity: number;
    observation: string;
  };
}

export interface ItemPriceDto {
  itemId: number;
  quotationId?: number;
  unitPrice: number;
  hasIva: boolean;
  discount?: number;
}

export interface AssignPricesDto {
  items: ItemPriceDto[];
}

export interface CreatePurchaseOrdersDto {
  issueDate: string;
  items: {
    itemId: number;
    supplierId: number;
    unitPrice: number;
    discount?: number;
    estimatedDeliveryDate?: string;
    otherValue?: number;
    observations?: string;
  }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MaterialPriceHistory {
  materialId: number;
  supplierId: number;
  unitPrice: number;
  hasIva: boolean;
  ivaPercentage: number;
  discount: number;
  lastUsedDate: string;
  purchaseOrderNumber?: string;
  supplierName?: string;
}

export interface PurchaseOrderApproval {
  approvalId: number;
  purchaseOrderId: number;
  approverId: number;
  approvalStatus: 'pendiente' | 'aprobado' | 'rechazado';
  comments: string | null;
  rejectionReason: string | null;
  approvalDate: string;
  deadline: string;
  isOverdue: boolean;
  createdAt: string;
  approver?: {
    userId: number;
    nombre: string;
    email: string;
  };
  itemApprovals?: PurchaseOrderItemApproval[];
}

export interface PurchaseOrderItemApproval {
  itemApprovalId: number;
  poApprovalId: number;
  poItemId: number;
  approvalStatus: 'pendiente' | 'aprobado' | 'rechazado';
  comments: string | null;
  createdAt: string;
}

export interface ApprovePurchaseOrderDto {
  items: {
    poItemId: number;
    decision: 'approved' | 'rejected';
    comments?: string;
  }[];
  generalComments?: string;
  rejectionReason?: string;
}

// ============================================
// API METHODS
// ============================================

/**
 * Get requisitions ready for purchase orders (estado: cotizada)
 * These requisitions have completed quotations and can have prices assigned
 */
export const getRequisitionsForPurchaseOrders = async (filters?: {
  page?: number;
  limit?: number;
  projectId?: number;
  fromDate?: string;
  toDate?: string;
}): Promise<PaginatedResponse<any>> => {
  const response = await api.get('/purchases/requisitions/for-quotation', {
    params: { ...filters },
  });
  return response.data;
};

/**
 * Get requisition details with quotations and prices
 */
export const getRequisitionWithPrices = async (
  requisitionId: number
): Promise<RequisitionWithQuotations> => {
  const response = await api.get<RequisitionWithQuotations>(
    `/purchases/requisitions/${requisitionId}/quotation`
  );
  return response.data;
};

/**
 * Assign prices to quotations
 * This saves unit prices, IVA flags, and discounts for each item
 * Must be done before creating purchase orders
 */
export const assignPrices = async (
  requisitionId: number,
  data: AssignPricesDto
): Promise<RequisitionWithQuotations> => {
  const response = await api.post<RequisitionWithQuotations>(
    `/purchases/requisitions/${requisitionId}/assign-prices`,
    data
  );
  return response.data;
};

/**
 * Create purchase orders from a requisition with assigned prices
 * Automatically groups items by supplier and generates one PO per supplier
 * Changes requisition status to 'pendiente_recepcion'
 */
export const createPurchaseOrders = async (
  requisitionId: number,
  data: CreatePurchaseOrdersDto
): Promise<PurchaseOrder[]> => {
  const response = await api.post<PurchaseOrder[]>(
    `/purchases/requisitions/${requisitionId}/purchase-orders`,
    data
  );
  return response.data;
};

/**
 * Get all purchase orders (global list)
 */
export const getAllPurchaseOrders = async (filters?: {
  page?: number;
  limit?: number;
  status?: string;
  supplierId?: number;
  fromDate?: string;
  toDate?: string;
}): Promise<PaginatedResponse<PurchaseOrder>> => {
  const response = await api.get<PaginatedResponse<PurchaseOrder>>(
    '/purchases/requisitions/purchase-orders',
    { params: { ...filters } }
  );
  return response.data;
};

/**
 * Get a single purchase order by ID
 */
export const getPurchaseOrderById = async (
  purchaseOrderId: number
): Promise<PurchaseOrder> => {
  const response = await api.get<PurchaseOrder>(
    `/purchases/requisitions/purchase-orders/${purchaseOrderId}`
  );
  return response.data;
};

/**
 * Get purchase orders for a requisition
 */
export const getPurchaseOrdersByRequisition = async (
  requisitionId: number
): Promise<PurchaseOrder[]> => {
  const response = await api.get<PurchaseOrder[] | { data: PurchaseOrder[] } | { data: PurchaseOrder[]; total: number }>(
    `/purchases/requisitions/${requisitionId}/purchase-orders`
  );
  const payload = response.data;

  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return Array.isArray(payload.data) ? payload.data : [];
  }

  return [];
};

/**
 * Get latest price history for a material with a specific supplier
 */
export const getLatestMaterialPrice = async (
  materialId: number,
  supplierId: number
): Promise<MaterialPriceHistory | null> => {
  try {
    const response = await api.get<MaterialPriceHistory>(
      `/purchases/requisitions/materials/${materialId}/latest-price/${supplierId}`
    );
    return response.data;
  } catch (error: any) {
    // Return null if no price history found (404) or other errors
    if (error.response?.status === 404) {
      return null;
    }
    console.error('Error fetching material price history:', error);
    return null;
  }
};

// ============================================
// PURCHASE ORDER APPROVAL METHODS
// ============================================

/**
 * Get purchase orders pending approval for Gerencia
 */
export const getPendingPurchaseOrdersForApproval = async (
  page: number = 1,
  limit: number = 10
): Promise<PaginatedResponse<PurchaseOrder>> => {
  const response = await api.get<PaginatedResponse<PurchaseOrder>>(
    '/purchases/requisitions/purchase-orders/pending-approval',
    {
      params: { page, limit },
    }
  );
  return response.data;
};

/**
 * Get purchase order detail for approval
 */
export const getPurchaseOrderForApproval = async (
  purchaseOrderId: number
): Promise<PurchaseOrder> => {
  const response = await api.get<PurchaseOrder>(
    `/purchases/requisitions/purchase-orders/${purchaseOrderId}/for-approval`
  );
  return response.data;
};

/**
 * Approve or reject items of a purchase order
 */
export const approvePurchaseOrder = async (
  purchaseOrderId: number,
  data: ApprovePurchaseOrderDto
): Promise<PurchaseOrder> => {
  const response = await api.post<PurchaseOrder>(
    `/purchases/requisitions/purchase-orders/${purchaseOrderId}/approve`,
    data
  );
  return response.data;
};

/**
 * Reject an entire purchase order
 */
export const rejectPurchaseOrder = async (
  purchaseOrderId: number,
  rejectionReason: string
): Promise<PurchaseOrder> => {
  const response = await api.post<PurchaseOrder>(
    `/purchases/requisitions/purchase-orders/${purchaseOrderId}/reject`,
    { rejectionReason }
  );
  return response.data;
};

/**
 * Resubmit a rejected purchase order (Compras role)
 */
export const resubmitPurchaseOrder = async (
  purchaseOrderId: number,
  comments?: string
): Promise<PurchaseOrder> => {
  const response = await api.patch<PurchaseOrder>(
    `/purchases/requisitions/purchase-orders/${purchaseOrderId}/resubmit`,
    { comments }
  );
  return response.data;
};
