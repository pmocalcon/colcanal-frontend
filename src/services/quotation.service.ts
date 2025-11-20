import api from './api';
import type { Requisition, RequisitionItem } from './requisitions.service';
import type { Supplier } from './suppliers.service';

// ============================================
// INTERFACES
// ============================================

export interface RequisitionItemQuotation {
  quotationId: number;
  requisitionItemId: number;
  action: 'cotizar' | 'no_requiere';
  supplierId: number | null;
  supplierOrder: number;
  observations?: string;
  justification?: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  supplier?: Supplier;
  // Price assignment fields (added for purchase orders)
  unitPrice?: number | null;
  hasIva?: boolean;
  discount?: number | null;
  isSelected?: boolean;
}

export interface RequisitionItemWithQuotations extends RequisitionItem {
  quotations: RequisitionItemQuotation[];
}

// Simplified interface for Purchase Orders in quotation context
export interface PurchaseOrderSummary {
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  approvalStatus: {
    statusId: number;
    code: string;
    description: string;
  };
  supplierId: number;
  totalAmount: number;
  createdAt: string;
}

export interface RequisitionWithQuotations extends Omit<Requisition, 'items'> {
  items: RequisitionItemWithQuotations[];
  purchaseOrders?: PurchaseOrderSummary[]; // OCs asociadas a la requisición
  user?: { name: string }; // Alias for creator, some endpoints return 'user' instead
  operationCenter?: { name: string; code: string };
}

export interface SupplierQuotationDto {
  supplierId: number;
  supplierOrder: number; // 1 o 2
  observations?: string;
}

export interface ItemQuotationDto {
  itemId: number;
  action: 'cotizar' | 'no_requiere';
  suppliers?: SupplierQuotationDto[];
  justification?: string;
}

export interface ManageQuotationDto {
  items: ItemQuotationDto[];
}

export interface FilterRequisitionsDto {
  page?: number;
  limit?: number;
  status?: string;
  projectId?: number;
  fromDate?: string;
  toDate?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// API METHODS
// ============================================

/**
 * Get requisitions ready for quotation (estado: aprobada_gerencia, en_cotizacion, cotizada)
 */
export const getRequisitionsForQuotation = async (
  filters?: FilterRequisitionsDto
): Promise<PaginatedResponse<Requisition>> => {
  const response = await api.get<PaginatedResponse<Requisition>>(
    '/purchases/requisitions/for-quotation',
    { params: filters }
  );
  return response.data;
};

/**
 * Get quotation details for a specific requisition
 */
export const getRequisitionQuotation = async (
  requisitionId: number
): Promise<RequisitionWithQuotations> => {
  const response = await api.get<RequisitionWithQuotations>(
    `/purchases/requisitions/${requisitionId}/quotation`
  );
  return response.data;
};

/**
 * Manage quotations for a requisition
 * - Assign action (cotizar/no_requiere) to each item
 * - Supports up to 2 suppliers per item
 * - Implements versioning when changing suppliers
 * - Automatically changes status to 'en_cotizacion'
 * - Changes to 'cotizada' when all items have assigned action
 */
export const manageQuotation = async (
  requisitionId: number,
  data: ManageQuotationDto
): Promise<RequisitionWithQuotations> => {
  const response = await api.post<RequisitionWithQuotations>(
    `/purchases/requisitions/${requisitionId}/quotation`,
    data
  );
  return response.data;
};
