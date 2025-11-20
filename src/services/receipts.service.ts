import api from './api';
import type { Requisition, Material } from './requisitions.service';
import type { Supplier } from './suppliers.service';

// ============================================
// INTERFACES
// ============================================

export interface MaterialReceipt {
  receiptId: number;
  poItemId: number;
  quantityReceived: number;
  receivedDate: string;
  observations?: string;
  overdeliveryJustification?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
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
  quantity: number;
  unitPrice: number;
  hasIVA: boolean;
  discount: number;
  subtotal: number;
  iva: number;
  total: number;
  // Receipt-specific fields
  quantityOrdered?: number;
  quantityReceived?: number;
  quantityPending?: number;
  receipts?: MaterialReceipt[];
  requisitionItem?: {
    itemId: number;
    itemNumber: number;
    material: Material;
    quantity: number;
  };
}

export interface PurchaseOrder {
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  requisitionId: number;
  supplierId: number;
  issueDate: string;
  totalAmount: number;
  createdBy: number;
  createdAt: string;
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

export interface RequisitionWithReceipts extends Requisition {
  purchaseOrders?: PurchaseOrder[];
}

export interface PaginatedReceiptsResponse {
  data: RequisitionWithReceipts[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// DTOs
// ============================================

export interface CreateReceiptItemDto {
  poItemId: number;
  quantityReceived: number;
  receivedDate: string; // YYYY-MM-DD
  observations?: string;
  overdeliveryJustification?: string;
}

export interface CreateMaterialReceiptsDto {
  items: CreateReceiptItemDto[];
}

export interface UpdateMaterialReceiptDto {
  quantityReceived?: number;
  receivedDate?: string;
  observations?: string;
  overdeliveryJustification?: string;
}

export interface FilterReceiptsParams {
  page?: number;
  limit?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// API METHODS
// ============================================

/**
 * Get my requisitions pending receipt (estado: pendiente_recepcion, en_recepcion)
 * Only returns requisitions created by the authenticated user
 */
export const getMyPendingReceipts = async (
  filters?: FilterReceiptsParams
): Promise<PaginatedReceiptsResponse> => {
  const response = await api.get<PaginatedReceiptsResponse>(
    '/purchases/requisitions/my-pending-receipts',
    { params: filters }
  );
  return response.data;
};

/**
 * Get receipt details for a specific requisition
 * Includes all purchase orders, items, and registered receipts
 */
export const getRequisitionReceipts = async (
  requisitionId: number
): Promise<RequisitionWithReceipts> => {
  const response = await api.get<RequisitionWithReceipts>(
    `/purchases/requisitions/${requisitionId}/receipts`
  );
  return response.data;
};

/**
 * Register receipt of materials for one or more purchase order items
 * - Can register partial quantities
 * - Supports overdelivery with justification
 * - Updates requisition state automatically
 */
export const createMaterialReceipts = async (
  requisitionId: number,
  data: CreateMaterialReceiptsDto
): Promise<MaterialReceipt[]> => {
  const response = await api.post<MaterialReceipt[]>(
    `/purchases/requisitions/${requisitionId}/receipts`,
    data
  );
  return response.data;
};

/**
 * Update an existing material receipt
 * - Can modify quantity, date, observations
 * - Recalculates requisition state if needed
 */
export const updateMaterialReceipt = async (
  requisitionId: number,
  receiptId: number,
  data: UpdateMaterialReceiptDto
): Promise<MaterialReceipt> => {
  const response = await api.patch<MaterialReceipt>(
    `/purchases/requisitions/${requisitionId}/receipts/${receiptId}`,
    data
  );
  return response.data;
};
