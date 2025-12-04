import api from './api';

// ============ TIPOS ============

// Grupos de Materiales
export interface MaterialGroup {
  groupId: number;
  name: string;
  categoryId?: number;
  category?: {
    categoryId: number;
    name: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMaterialGroupDto {
  name: string;
  categoryId?: number;
}

export interface UpdateMaterialGroupDto {
  name?: string;
  categoryId?: number;
}

// Materiales
export interface Material {
  materialId: number;
  code: string;
  description: string;
  groupId: number;
  materialGroup?: MaterialGroup;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMaterialDto {
  code?: string; // Opcional - el backend lo genera automáticamente
  description: string;
  groupId: number;
  force?: boolean; // Para forzar creación cuando hay similares
}

export interface UpdateMaterialDto {
  code?: string;
  description?: string;
  groupId?: number;
}

// Respuesta de error con sugerencias (Fuzzy Matching)
export interface SimilarSuggestion {
  materialId?: number;
  groupId?: number;
  code?: string;
  name?: string;
  description?: string;
  group?: string;
}

export interface FuzzyMatchError {
  statusCode: 409;
  message: string;
  suggestions: SimilarSuggestion[];
  hint: string;
}

// Helper para verificar si es un error de fuzzy matching
export function isFuzzyMatchError(error: any): error is { response: { data: FuzzyMatchError } } {
  return (
    error?.response?.status === 409 &&
    error?.response?.data?.suggestions &&
    Array.isArray(error.response.data.suggestions)
  );
}

// ============ SERVICIO ============

const BASE_URL = '/purchases/master-data';

export const materialsService = {
  // ============ GRUPOS DE MATERIALES ============

  /**
   * Obtener todos los grupos de materiales
   */
  async getGroups(): Promise<MaterialGroup[]> {
    const response = await api.get<{ data: MaterialGroup[]; total: number }>(`${BASE_URL}/material-groups`);
    return response.data.data;
  },

  /**
   * Buscar grupos de materiales con fuzzy matching
   */
  async searchGroups(query: string): Promise<MaterialGroup[]> {
    const response = await api.get<MaterialGroup[]>(`${BASE_URL}/material-groups/search`, {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Crear un nuevo grupo de materiales
   * Puede retornar error 409 si existe uno similar
   */
  async createGroup(data: CreateMaterialGroupDto): Promise<MaterialGroup> {
    const response = await api.post<MaterialGroup>(`${BASE_URL}/material-groups`, data);
    return response.data;
  },

  /**
   * Actualizar un grupo de materiales
   */
  async updateGroup(groupId: number, data: UpdateMaterialGroupDto): Promise<MaterialGroup> {
    const response = await api.patch<MaterialGroup>(`${BASE_URL}/material-groups/${groupId}`, data);
    return response.data;
  },

  /**
   * Eliminar un grupo de materiales (solo si no tiene materiales)
   */
  async deleteGroup(groupId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`${BASE_URL}/material-groups/${groupId}`);
    return response.data;
  },

  // ============ MATERIALES ============

  /**
   * Obtener todos los materiales
   */
  async getMaterials(): Promise<Material[]> {
    const response = await api.get<{ data: Material[]; total: number }>(`${BASE_URL}/materials`);
    return response.data.data;
  },

  /**
   * Buscar materiales con fuzzy matching
   */
  async searchMaterials(query: string, groupId?: number): Promise<Material[]> {
    const params: { q: string; groupId?: string } = { q: query };
    if (groupId) {
      params.groupId = groupId.toString();
    }
    const response = await api.get<Material[]>(`${BASE_URL}/materials/search`, { params });
    return response.data;
  },

  /**
   * Crear un nuevo material
   * Puede retornar error 409 si existe uno similar
   */
  async createMaterial(data: CreateMaterialDto): Promise<Material> {
    const response = await api.post<Material>(`${BASE_URL}/materials`, data);
    return response.data;
  },

  /**
   * Actualizar un material
   */
  async updateMaterial(materialId: number, data: UpdateMaterialDto): Promise<Material> {
    const response = await api.patch<Material>(`${BASE_URL}/materials/${materialId}`, data);
    return response.data;
  },

  /**
   * Eliminar un material
   */
  async deleteMaterial(materialId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`${BASE_URL}/materials/${materialId}`);
    return response.data;
  },
};
