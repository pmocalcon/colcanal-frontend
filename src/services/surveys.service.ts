import api from './api';

// ============================================
// TYPES - Works (Obras)
// ============================================
export interface Work {
  workId: number;
  workCode: string;
  companyId: number;
  name: string;
  address: string;
  neighborhood: string;
  userName: string;
  requestingEntity: string;
  recordNumber: string;
  sectorVillage: string;
  zone: string;
  userAddress: string;
  areaType: string;
  requestType: string;
  filingNumber?: string;
  requestDate?: string;
  createdAt: string;
  updatedAt: string;
  company?: {
    companyId: number;
    name: string;
    abbreviation: string;
  };
}

export interface CreateWorkDto {
  companyId: number;
  name: string;
  address: string;
  neighborhood: string;
  userName: string;
  requestingEntity: string;
  recordNumber: string;
  sectorVillage: string;
  zone: string;
  userAddress?: string;
  areaType: string;
  requestType: string;
  filingNumber?: string;
  requestDate?: string;
}

export interface UpdateWorkDto extends Partial<CreateWorkDto> {}

// ============================================
// TYPES - Surveys (Levantamientos)
// ============================================
export interface SurveyItem {
  itemId: number;
  materialId: number;
  quantity: number;
  observation?: string;
  material?: {
    materialId: number;
    code: string;
    description: string;
  };
}

export interface Survey {
  surveyId: number;
  surveyNumber: string;
  workId: number;
  ucapId?: number;
  surveyDate: string;
  requestDate?: string;
  receivedBy: number;
  assignedReviewer?: number;
  statusId: number;
  projectCode?: string;
  // Document links
  sketchUrl?: string;
  mapUrl?: string;
  // Requirements flags
  requiresPhotometricStudies?: boolean;
  requiresRetieCertification?: boolean;
  requiresRetilapCertification?: boolean;
  requiresCivilWork?: boolean;
  // IPP del mes anterior (ingresado por Director Técnico)
  previousMonthIpp?: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
  work?: Work;
  receiver?: {
    userId: number;
    nombre: string;
    cargo?: string;
  };
  reviewer?: {
    userId: number;
    nombre: string;
    cargo?: string;
  };
  status?: {
    statusId: number;
    name: string;
    code: string;
  };
  items?: SurveyItem[];
  ucap?: {
    ucapId: number;
    code: string;
    description: string;
  };
  // Nested items from backend
  budgetItems?: Array<{
    budgetItemId?: number;
    ucapId: number;
    quantity: number;
    unitValue?: number;
    ucap?: {
      ucapId: number;
      code: string;
      description: string;
    };
  }>;
  investmentItems?: Array<{
    investmentItemId?: number;
    orderNumber?: string;
    point: string;
    description?: string;
    luminaireQuantity?: number;
    relocatedLuminaireQuantity?: number;
    poleQuantity?: number;
    braidedNetwork?: string;
    latitude?: string;
    longitude?: string;
  }>;
  materialItems?: Array<{
    materialItemId?: number;
    materialId: number;
    unitOfMeasure: string;
    quantity: number;
    observations?: string;
    material?: {
      materialId: number;
      code: string;
      description: string;
    };
  }>;
  travelExpenses?: Array<{
    travelExpenseId?: number;
    expenseType: string;
    quantity: number;
    observations?: string;
  }>;
}

export interface CreateSurveyDto {
  workId: number;
  surveyDate: string;
  requestDate?: string;
  receivedBy?: string; // Nombre de quien recibe (string, no ID)
  projectCode?: string;
  // Document links
  sketchUrl?: string;
  mapUrl?: string;
  // Requirements flags
  requiresPhotometricStudies?: boolean;
  requiresRetieCertification?: boolean;
  requiresRetilapCertification?: boolean;
  requiresCivilWork?: boolean;
  // IPP del mes anterior (ingresado por Director Técnico)
  previousMonthIpp?: number;
  // Budget items
  budgetItems?: {
    ucapId: number;
    quantity: number;
  }[];
  // Investment items (points)
  investmentItems?: {
    orderNumber?: string;
    point: string;
    description?: string;
    luminaireQuantity?: number;
    relocatedLuminaireQuantity?: number;
    poleQuantity?: number;
    braidedNetwork?: string;
    latitude?: string;
    longitude?: string;
  }[];
  // Material items
  materialItems?: {
    materialId: number;
    unitOfMeasure: string;
    quantity: number;
    observations?: string;
  }[];
  // Travel expenses
  travelExpenses?: {
    expenseType: string;
    quantity: number;
    observations?: string;
  }[];
}

export interface UpdateSurveyDto extends Partial<CreateSurveyDto> {}

export interface ReviewSurveyDto {
  approved: boolean;
  comments?: string;
}

export interface SurveyFilters {
  page?: number;
  limit?: number;
  companyId?: number;
  workId?: number;
  statusCode?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface SurveysListResponse {
  data: Survey[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WorksListResponse {
  data: Work[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Ucap {
  ucapId: number;
  code: string;
  description: string;
  value: number;
  initialIpp: number;
}

export interface IppConfig {
  baseYear: number;
  baseMonth: number;
  initialValue: number;
}

export interface UcapsResponse {
  ippConfig: IppConfig;
  ucaps: Ucap[];
}

export interface IppData {
  ippId: number;
  month: number;
  year: number;
  value: number;
  monthName?: string;
}

export interface BudgetItem {
  itemNumber: number;
  ucapId: number | null;
  ucapCode?: string;
  ucapDescription?: string;
  unitValue: number;
  quantity: number;
  budgetedValue: number;
}

export interface WorkBudget {
  workId: number;
  items: BudgetItem[];
  selectedIppMonth?: number;
  selectedIppYear?: number;
  ippValue?: number;
  totalBudgeted: number;
  totalAdjusted: number;
}

// ============================================
// SERVICE
// ============================================
export const surveysService = {
  // ---- WORKS (Obras) ----

  async createWork(data: CreateWorkDto): Promise<Work> {
    const response = await api.post('/surveys/works', data);
    return response.data;
  },

  async getWorks(params?: { companyId?: number; search?: string; page?: number; limit?: number }): Promise<WorksListResponse> {
    const response = await api.get('/surveys/works', { params });
    return response.data;
  },

  async getWorkById(id: number): Promise<Work> {
    const response = await api.get(`/surveys/works/${id}`);
    return response.data;
  },

  async updateWork(id: number, data: UpdateWorkDto): Promise<Work> {
    const response = await api.put(`/surveys/works/${id}`, data);
    return response.data;
  },

  async deleteWork(id: number): Promise<void> {
    await api.delete(`/surveys/works/${id}`);
  },

  // ---- SURVEYS (Levantamientos) ----

  async createSurvey(data: CreateSurveyDto): Promise<Survey> {
    const response = await api.post('/surveys', data);
    return response.data;
  },

  async getSurveys(filters?: SurveyFilters): Promise<SurveysListResponse> {
    const response = await api.get('/surveys', { params: filters });
    return response.data;
  },

  async getSurveyById(id: number): Promise<Survey> {
    const response = await api.get(`/surveys/${id}`);
    return response.data;
  },

  async updateSurvey(id: number, data: UpdateSurveyDto): Promise<Survey> {
    const response = await api.put(`/surveys/${id}`, data);
    return response.data;
  },

  async deleteSurvey(id: number): Promise<void> {
    await api.delete(`/surveys/${id}`);
  },

  async submitForReview(id: number): Promise<Survey> {
    const response = await api.patch(`/surveys/${id}/submit`);
    return response.data;
  },

  async reviewSurvey(id: number, data: ReviewSurveyDto): Promise<Survey> {
    const response = await api.patch(`/surveys/${id}/review`, data);
    return response.data;
  },

  async getSurveysForReview(): Promise<SurveysListResponse> {
    const response = await api.get('/surveys/for-review');
    return response.data;
  },

  // ---- UCAPS ----

  async getUcaps(companyId?: number, projectId?: number): Promise<UcapsResponse> {
    if (!companyId) {
      return {
        ippConfig: { baseYear: 2015, baseMonth: 1, initialValue: 100 },
        ucaps: [],
      };
    }
    const params: Record<string, any> = {};
    if (projectId) params.projectId = projectId;
    const response = await api.get(`/surveys/ucaps/${companyId}`, { params });

    // Handle new response structure with ippConfig
    const data = response.data;
    const ippConfig: IppConfig = {
      baseYear: data.ippConfig?.baseYear ?? 2015,
      baseMonth: data.ippConfig?.baseMonth ?? 1,
      initialValue: parseFloat(data.ippConfig?.initialValue ?? 100) || 100,
    };

    // Map ucaps to frontend interface, ensuring numeric values
    const ucaps = (data.ucaps || []).map((ucap: any) => ({
      ucapId: ucap.ucapId,
      code: ucap.code,
      description: ucap.description,
      value: parseFloat(ucap.roundedValue ?? ucap.value ?? 0) || 0,
      initialIpp: parseFloat(ucap.initialIpp ?? 0) || 0,
    }));

    return { ippConfig, ucaps };
  },

  async searchUcaps(search: string, companyId?: number, projectId?: number): Promise<Ucap[]> {
    if (!companyId) return [];
    const params: Record<string, any> = { search };
    if (projectId) params.projectId = projectId;
    const response = await api.get(`/surveys/ucaps/${companyId}/search`, { params });
    // Map response to frontend interface, ensuring numeric values
    return (response.data || []).map((ucap: any) => ({
      ucapId: ucap.ucapId,
      code: ucap.code,
      description: ucap.description,
      value: parseFloat(ucap.roundedValue ?? ucap.value ?? 0) || 0,
      initialIpp: parseFloat(ucap.initialIpp ?? 0) || 0,
    }));
  },

  // ---- IPP ----

  async getIppData(year?: number): Promise<IppData[]> {
    const params = year ? { year } : {};
    const response = await api.get('/surveys/ipp', { params });
    return response.data;
  },

  async getIppByMonth(month: number, year: number): Promise<IppData> {
    const response = await api.get(`/surveys/ipp/${year}/${month}`);
    return response.data;
  },

  // ---- REVIEWER ACCESS ----

  async getMyAccess(): Promise<ReviewerAccess> {
    const response = await api.get('/surveys/my-access');
    return response.data;
  },

  // Admin endpoints for managing user access
  async getUserAccess(userId: number): Promise<ReviewerAccess> {
    const response = await api.get(`/surveys/user-access/${userId}`);
    return response.data;
  },

  async addUserAccess(data: AddUserAccessDto): Promise<UserAccessRecord> {
    const { userId, ...body } = data;
    const response = await api.post(`/surveys/user-access/${userId}`, body);
    return response.data;
  },

  async deleteUserAccess(accessId: number): Promise<void> {
    await api.delete(`/surveys/user-access/${accessId}`);
  },
};

// Reviewer Access Types
export interface AccessCompany {
  companyId: number;
  name: string;
  accessId?: number;
}

export interface AccessProject {
  projectId: number;
  name: string;
  companyId: number;
  accessId?: number;
}

export interface ReviewerAccess {
  companies: AccessCompany[];
  projects: AccessProject[];
}

export interface AddUserAccessDto {
  userId: number;
  companyId?: number;
  projectId?: number;
}

export interface UserAccessRecord {
  accessId: number;
  userId: number;
  companyId?: number;
  projectId?: number;
  createdAt: string;
}

export default surveysService;
