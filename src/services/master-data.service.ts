import api from './api';

// Types
export interface Company {
  companyId: number;
  name: string;
}

export interface Project {
  projectId: number;
  companyId: number;
  name: string;
}

export interface MaterialCategory {
  categoryId: number;
  name: string;
  description?: string;
}

export interface MaterialGroup {
  groupId: number;
  name: string;
  categoryId: number;
  category: MaterialCategory;
}

export interface Material {
  materialId: number;
  code: string;
  description: string;
  groupId: number;
  materialGroup: MaterialGroup;
}

export interface OperationCenter {
  centerId: number;
  companyId: number;
  projectId?: number;
  code: string;
  name: string;
}

export interface ProjectCode {
  codeId: number;
  companyId: number;
  projectId?: number;
  code: string;
}

export interface RequisitionStatus {
  statusId: number;
  code: string;
  name: string;
  description?: string;
  color?: string;
  order?: number;
}

// Master Data Service
export const masterDataService = {
  /**
   * Get all companies
   */
  async getCompanies(): Promise<Company[]> {
    const response = await api.get<{ data: Company[]; total: number }>('/purchases/master-data/companies');
    return response.data.data;
  },

  /**
   * Get projects (optionally filtered by company)
   */
  async getProjects(companyId?: number): Promise<Project[]> {
    const params = companyId ? { companyId } : {};
    const response = await api.get<{ data: Project[]; total: number }>('/purchases/master-data/projects', { params });
    return response.data.data;
  },

  /**
   * Get material categories
   */
  async getMaterialCategories(): Promise<MaterialCategory[]> {
    const response = await api.get<{ data: MaterialCategory[]; total: number }>('/purchases/master-data/material-categories');
    return response.data.data;
  },

  /**
   * Get material groups (optionally filtered by category)
   */
  async getMaterialGroups(categoryId?: number): Promise<MaterialGroup[]> {
    const params = categoryId ? { categoryId } : {};
    const response = await api.get<{ data: MaterialGroup[]; total: number }>('/purchases/master-data/material-groups', { params });
    return response.data.data;
  },

  /**
   * Get materials (optionally filtered by group)
   */
  async getMaterials(groupId?: number): Promise<Material[]> {
    const params = groupId ? { groupId } : {};
    const response = await api.get<{ data: Material[]; total: number }>('/purchases/master-data/materials', { params });
    return response.data.data;
  },

  /**
   * Get operation centers (optionally filtered by company or project)
   */
  async getOperationCenters(filters?: { companyId?: number; projectId?: number }): Promise<OperationCenter[]> {
    const response = await api.get<{ data: OperationCenter[]; total: number }>('/purchases/master-data/operation-centers', { params: filters });
    return response.data.data;
  },

  /**
   * Get project codes (optionally filtered by company or project)
   */
  async getProjectCodes(filters?: { companyId?: number; projectId?: number }): Promise<ProjectCode[]> {
    const response = await api.get<{ data: ProjectCode[]; total: number }>('/purchases/master-data/project-codes', { params: filters });
    return response.data.data;
  },

  /**
   * Get requisition statuses
   */
  async getRequisitionStatuses(): Promise<RequisitionStatus[]> {
    const response = await api.get<{ data: RequisitionStatus[]; total: number }>('/purchases/master-data/statuses');
    return response.data.data;
  },
};
