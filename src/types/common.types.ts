/**
 * Tipos comunes reutilizables
 */

// Respuesta paginada genérica
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  pending?: number;
  processed?: number;
}

// Filtros de requisiciones (usado en componentes)
export interface FilterValues {
  company: string;
  project: string;
  requisitionNumber: string;
  startDate: string;
  endDate: string;
  status: string;
}

// Estado de revisión por item
export interface ItemReviewStatus {
  itemId: number;
  status: 'pending' | 'approved' | 'rejected';
  comments: string;
}

// Conteo de estados para dashboard
export interface StatusCount {
  status: string;
  statusLabel: string;
  count: number;
}
