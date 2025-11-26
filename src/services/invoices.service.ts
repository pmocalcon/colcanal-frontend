import api from './api';

// ============================================
// INTERFACES
// ============================================

export interface Invoice {
  invoiceId: number;
  purchaseOrderId: number;
  invoiceNumber: string;
  issueDate: string;
  amount: number;
  materialQuantity: number;
  sentToAccounting: boolean;
  sentToAccountingDate: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  creator?: {
    userId: number;
    nombre: string;
    email: string;
  };
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalInvoicedAmount: number;
  totalInvoicedQuantity: number;
  pendingAmount: number;
  invoiceStatus: string;
}

export interface PurchaseOrderForInvoicing {
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  requisitionId: number;
  supplierId: number;
  issueDate: string;
  subtotal: number;
  totalIva: number;
  totalDiscount: number;
  totalAmount: number;
  totalInvoicedAmount: number;
  totalInvoicedQuantity: number;
  invoiceStatus: string;
  approvalStatus?: {
    statusId: number;
    code: string;
    name: string;
    description: string;
    color: string;
    order: number;
  };
  supplier?: {
    supplierId: number;
    name: string;
    nitCc?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
  };
  requisition?: {
    requisitionId: number;
    requisitionNumber: string;
    status?: {
      statusId: number;
      code: string;
      name: string;
    };
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
  items?: {
    purchaseOrderItemId: number;
    materialId: number;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    iva: number;
    total: number;
    material?: {
      materialId: number;
      codigo: string;
      descripcion: string;
      unidadMedida: string;
    };
  }[];
  invoices?: Invoice[];
  // Valores por defecto sugeridos para crear factura
  defaultInvoiceValues?: {
    amount: number;
    materialQuantity: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceDto {
  purchaseOrderId: number;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  amount?: number; // Opcional - si no se envía, usa el total de la OC
  materialQuantity?: number; // Opcional - si no se envía, usa la cantidad total de la OC
}

export interface UpdateInvoiceDto {
  invoiceNumber?: string;
  issueDate?: string; // YYYY-MM-DD
  amount?: number;
  materialQuantity?: number;
}

export interface SendToAccountingDto {
  sentToAccountingDate: string; // YYYY-MM-DD
}

export interface MarkAsReceivedDto {
  receivedDate: string; // YYYY-MM-DD
}

// ============================================
// API CALLS
// ============================================

/**
 * Obtener órdenes de compra aprobadas para facturar
 */
export const getPurchaseOrdersForInvoicing = async (
  page: number = 1,
  limit: number = 10,
) => {
  const response = await api.get(
    `/invoices/purchase-orders/for-invoicing?page=${page}&limit=${limit}`,
  );
  return response.data;
};

/**
 * Obtener facturas de una orden de compra específica
 */
export const getInvoicesByPurchaseOrder = async (purchaseOrderId: number) => {
  const response = await api.get(
    `/invoices/by-purchase-order/${purchaseOrderId}`,
  );
  return response.data;
};

/**
 * Crear una nueva factura
 */
export const createInvoice = async (data: CreateInvoiceDto) => {
  const response = await api.post('/invoices', data);
  return response.data;
};

/**
 * Actualizar una factura
 */
export const updateInvoice = async (
  invoiceId: number,
  data: UpdateInvoiceDto,
) => {
  const response = await api.patch(`/invoices/${invoiceId}`, data);
  return response.data;
};

/**
 * Eliminar una factura
 */
export const deleteInvoice = async (invoiceId: number) => {
  const response = await api.delete(`/invoices/${invoiceId}`);
  return response.data;
};

/**
 * Enviar facturas a contabilidad
 */
export const sendInvoicesToAccounting = async (
  purchaseOrderId: number,
  data: SendToAccountingDto,
) => {
  const response = await api.post(
    `/invoices/send-to-accounting/${purchaseOrderId}`,
    data,
  );
  return response.data;
};

// ============================================
// CONTABILIDAD - RECEPCIÓN DE FACTURAS
// ============================================

/**
 * Obtener facturas pendientes de recibir por contabilidad
 */
export const getAccountingPendingInvoices = async (
  page: number = 1,
  limit: number = 10,
) => {
  const response = await api.get(
    `/invoices/accounting/pending?page=${page}&limit=${limit}`,
  );
  return response.data;
};

/**
 * Obtener facturas ya recibidas por contabilidad
 */
export const getAccountingReceivedInvoices = async (
  page: number = 1,
  limit: number = 10,
) => {
  const response = await api.get(
    `/invoices/accounting/received?page=${page}&limit=${limit}`,
  );
  return response.data;
};

/**
 * Marcar facturas como recibidas por contabilidad
 */
export const markInvoicesAsReceived = async (
  purchaseOrderId: number,
  data: MarkAsReceivedDto,
) => {
  const response = await api.post(
    `/invoices/accounting/mark-received/${purchaseOrderId}`,
    data,
  );
  return response.data;
};
