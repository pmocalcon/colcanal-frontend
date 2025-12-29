import api from './api';

// Types
export interface Supplier {
  supplierId: number;
  name: string;
  nitCc: string;
  phone: string;
  address: string;
  city: string;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  name: string;
  nitCc: string;
  phone: string;
  address: string;
  city: string;
  email?: string;
  contactPerson?: string;
}

export interface UpdateSupplierDto extends Partial<CreateSupplierDto> {
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface SupplierStats {
  total: number;
  active: number;
  inactive: number;
  citiesCount: number;
  topCities: { city: string; count: number }[];
}

export interface SupplierFilters {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'city' | 'nitCc' | 'createdAt' | 'updatedAt';
  sortOrder?: 'ASC' | 'DESC';
}

// Suppliers Service
export const suppliersService = {
  /**
   * Get suppliers with pagination and filters
   */
  async getPaginated(filters: SupplierFilters = {}): Promise<PaginatedResponse<Supplier>> {
    const params: Record<string, string | number | boolean> = {};

    if (filters.page) params.page = filters.page;
    if (filters.limit) params.limit = filters.limit;
    if (filters.search) params.search = filters.search;
    if (filters.city) params.city = filters.city;
    if (filters.isActive !== undefined) params.isActive = filters.isActive;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortOrder) params.sortOrder = filters.sortOrder;

    const response = await api.get<PaginatedResponse<Supplier>>('/suppliers', { params });
    return response.data;
  },

  /**
   * Get all suppliers without pagination (for dropdowns)
   */
  async getAll(activeOnly: boolean = true): Promise<Supplier[]> {
    const response = await api.get<Supplier[]>('/suppliers/all', {
      params: { activeOnly },
    });
    return response.data;
  },

  /**
   * Search suppliers by name, NIT, etc.
   */
  async search(query: string): Promise<Supplier[]> {
    const response = await api.get<Supplier[]>('/suppliers/search', {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Get supplier by ID
   */
  async getById(supplierId: number): Promise<Supplier> {
    const response = await api.get<Supplier>(`/suppliers/${supplierId}`);
    return response.data;
  },

  /**
   * Get supplier by NIT/CC
   */
  async getByNit(nit: string): Promise<Supplier | null> {
    try {
      const response = await api.get<Supplier>(`/suppliers/by-nit/${nit}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get supplier statistics
   */
  async getStats(): Promise<SupplierStats> {
    const response = await api.get<SupplierStats>('/suppliers/stats');
    return response.data;
  },

  /**
   * Get list of cities
   */
  async getCities(): Promise<string[]> {
    const response = await api.get<string[]>('/suppliers/cities');
    return response.data;
  },

  /**
   * Create new supplier
   */
  async create(data: CreateSupplierDto): Promise<Supplier> {
    const response = await api.post<Supplier>('/suppliers', data);
    return response.data;
  },

  /**
   * Update supplier
   */
  async update(supplierId: number, data: UpdateSupplierDto): Promise<Supplier> {
    const response = await api.put<Supplier>(`/suppliers/${supplierId}`, data);
    return response.data;
  },

  /**
   * Deactivate supplier (soft delete)
   */
  async deactivate(supplierId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/suppliers/${supplierId}`);
    return response.data;
  },

  /**
   * Reactivate supplier
   */
  async reactivate(supplierId: number): Promise<Supplier> {
    const response = await api.patch<Supplier>(`/suppliers/${supplierId}/reactivate`);
    return response.data;
  },

  /**
   * Delete supplier permanently
   */
  async deletePermanent(supplierId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/suppliers/${supplierId}/permanent`);
    return response.data;
  },

  // Alias for backward compatibility
  async delete(supplierId: number): Promise<{ message: string }> {
    return this.deactivate(supplierId);
  },
};
