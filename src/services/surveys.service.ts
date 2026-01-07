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
  receivedBy: number;
  assignedReviewer?: number;
  statusId: number;
  projectCode?: string;
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
}

export interface CreateSurveyDto {
  workId: number;
  ucapId?: number;
  surveyDate: string;
  projectCode?: string;
  items: {
    materialId: number;
    quantity: number;
    observation?: string;
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

  async getUcaps(companyId: number): Promise<Ucap[]> {
    const response = await api.get(`/surveys/ucaps/${companyId}`);
    return response.data;
  },
};

export default surveysService;
