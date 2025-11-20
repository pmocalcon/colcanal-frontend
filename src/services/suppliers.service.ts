import api from './api';

// Types
export interface Supplier {
  supplierId: number;
  name: string;
  nitCc: string;
  phone: string;
  address: string;
  city: string;
  email?: string;
  contactPerson?: string;
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

export interface UpdateSupplierDto extends Partial<CreateSupplierDto> {}

// Suppliers Service
export const suppliersService = {
  /**
   * Get all suppliers
   */
  async getAll(activeOnly: boolean = true): Promise<Supplier[]> {
    const response = await api.get<Supplier[]>('/suppliers', {
      params: { activeOnly: activeOnly.toString() },
    });
    return response.data;
  },

  /**
   * Search suppliers by name or NIT
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
   * Delete (deactivate) supplier
   */
  async delete(supplierId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/suppliers/${supplierId}`);
    return response.data;
  },
};
