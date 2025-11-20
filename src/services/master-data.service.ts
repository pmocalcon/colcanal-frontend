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

export interface MaterialGroup {
  groupId: number;
  name: string;
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
   * Get all materials
   */
  async getMaterials(): Promise<Material[]> {
    const response = await api.get<{ data: Material[]; total: number }>('/purchases/master-data/materials');
    return response.data.data;
  },

  /**
   * Get all material groups
   */
  async getMaterialGroups(): Promise<MaterialGroup[]> {
    const response = await api.get<{ data: MaterialGroup[]; total: number }>('/purchases/master-data/material-groups');
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
