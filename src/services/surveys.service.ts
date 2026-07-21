import api from './api';

// ============================================
// TYPES - Works (Obras)
// ============================================
export interface Work {
  workId: number;
  workCode: string;
  companyId: number;
  projectId?: number;
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
  annualPlan?: number;
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
  projectId?: number;
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
  annualPlan?: number;
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

export type BlockStatus = 'pending' | 'approved' | 'rejected';
export type BlockName = 'budget' | 'investment' | 'materials' | 'travelExpenses';

export interface Survey {
  surveyId: number;
  surveyNumber: string;
  workId: number;
  ucapId?: number;
  surveyDate: string;
  requestDate?: string;
  receivedBy: number;
  assignedReviewer?: {
    userId: number;
    nombre: string;
    cargo?: string;
  };
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
  ippConfig?: {
    baseYear: number | null;
    baseMonth: number | null;
    initialValue: number | string | null;
  };
  description?: string;
  rejectionComments?: string;
  // Block review statuses
  budgetStatus?: BlockStatus;
  budgetComments?: string;
  investmentStatus?: BlockStatus;
  investmentComments?: string;
  materialsStatus?: BlockStatus;
  materialsComments?: string;
  travelExpensesStatus?: BlockStatus;
  travelExpensesComments?: string;
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
    unitPrice?: number;
    observations?: string;
  }>;
}

export interface CreateSurveyDto {
  workId: number;
  surveyDate: string;
  requestDate?: string;
  receivedBy?: string; // Nombre de quien recibe (string, no ID)
  assignedReviewerId?: number | null; // Revisor designado (ID de usuario)
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
  // Descripción general
  description?: string;
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
  action: 'approve' | 'reject';
  previousMonthIpp?: number;
  rejectionComments?: string;
}

export interface ReviewBlockDto {
  block: BlockName;
  status: 'approved' | 'rejected';
  comments?: string;
}

export interface SurveyDatabaseFilters {
  companyId?: number | number[];
  projectId?: number;
  projectIds?: number[];
  page?: number;
  limit?: number;
  search?: string;
  budgetStatus?: BlockStatus;
  investmentStatus?: BlockStatus;
  materialsStatus?: BlockStatus;
  travelExpensesStatus?: BlockStatus;
  createdBy?: number;
}

export interface SurveyDatabaseItem {
  surveyId: number;
  surveyNumber: string;
  projectCode?: string;
  status?: string;
  // Work data
  workId: number;
  workName: string;
  workAddress?: string;
  recordNumber?: string;
  companyId: number;
  companyName: string;
  projectId?: number;
  projectName?: string;
  workCode?: string;
  neighborhood?: string;
  sectorVillage?: string;
  address?: string;
  zone?: string;
  areaType?: string;
  requestType?: string;
  userName?: string;
  userAddress?: string;
  requestingEntity?: string;
  // Block statuses
  budgetStatus: BlockStatus;
  budgetComments?: string;
  investmentStatus: BlockStatus;
  investmentComments?: string;
  materialsStatus: BlockStatus;
  materialsComments?: string;
  travelExpensesStatus: BlockStatus;
  travelExpensesComments?: string;
  // Totals
  budgetTotal?: number;
  // Dates
  surveyDate: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface SurveyDatabaseResponse {
  data: SurveyDatabaseItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SurveyFilters {
  page?: number;
  limit?: number;
  companyId?: number | number[];
  projectIds?: number[];
  workId?: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  createdBy?: number;
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

/** Apellido/variante de una UCAP (mismo elemento, distinto origen: acta, otrosí...). */
export interface UcapApellido {
  apellidoId: number;
  ucapId?: number;
  apellido: string;
  sortOrder?: number;
}

export interface Ucap {
  ucapId: number;
  code: string;
  description: string;
  grupo: string | null;
  apellidos: UcapApellido[];
  value: number;
  initialIpp: number;
  /** Eficiencia luminosa [Lm/W]: distingue sodio (130) de LED (160) dentro de un grupo. */
  efficiencyLmW?: number | null;
}

export interface CreateUcapPayload {
  companyId: number;
  projectId?: number;
  code: string;
  description: string;
  roundedValue: number;
  initialIpp: number;
}

export interface UpdateUcapPayload {
  code?: string;
  description?: string;
  roundedValue?: number;
  initialIpp?: number;
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

  async getWorks(params?: { companyId?: number | number[]; projectId?: number; search?: string; page?: number; limit?: number; createdBy?: number }): Promise<WorksListResponse> {
    const response = await api.get('/surveys/works', { params });
    return response.data;
  },

  async getWorkById(id: number): Promise<Work> {
    const response = await api.get(`/surveys/works/${id}`);
    return response.data;
  },

  async getWorksValue(
    workIds: number[],
  ): Promise<{ workId: number; value: number; baseIpp: number | null; mesIpp: number | null }[]> {
    const response = await api.post('/surveys/works/value', { workIds });
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

  async getLatestSurveyForWork(workId: number): Promise<Survey | null> {
    const response = await api.get('/surveys', {
      params: { workId, page: 1, limit: 1 },
    });
    return response.data?.data?.[0] ?? null;
  },

  async updateSurvey(id: number, data: UpdateSurveyDto): Promise<Survey> {
    const response = await api.put(`/surveys/${id}`, data);
    return response.data;
  },

  async updateSurveyIpp(id: number, previousMonthIpp: number): Promise<Survey> {
    const response = await api.patch(`/surveys/${id}/ipp`, { previousMonthIpp });
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

  // ---- BLOCK REVIEW ----

  async reviewBlock(surveyId: number, data: ReviewBlockDto): Promise<Survey> {
    const response = await api.patch(`/surveys/${surveyId}/review-block`, data);
    return response.data;
  },

  async approveAll(surveyId: number): Promise<Survey> {
    const response = await api.patch(`/surveys/${surveyId}/approve-all`);
    return response.data;
  },

  async reopenForEditing(surveyId: number, reason?: string): Promise<Survey> {
    const response = await api.patch(`/surveys/${surveyId}/reopen`, { reason });
    return response.data;
  },

  // ---- DATABASE VIEW ----

  async getSurveysDatabase(filters?: SurveyDatabaseFilters): Promise<SurveyDatabaseResponse> {
    const response = await api.get('/surveys/database', { params: filters });
    return response.data;
  },

  // ---- UCAPS ----

  async createUcap(data: CreateUcapPayload): Promise<Ucap> {
    const response = await api.post('/surveys/ucaps', data);
    return response.data;
  },

  async updateUcap(ucapId: number, data: UpdateUcapPayload): Promise<Ucap> {
    const response = await api.patch(`/surveys/ucaps/${ucapId}`, data);
    return response.data;
  },

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
      grupo: ucap.grupo ?? null,
      apellidos: (ucap.apellidos || []).map((a: any) => ({
        apellidoId: a.apellidoId,
        ucapId: a.ucapId,
        apellido: a.apellido,
        sortOrder: a.sortOrder ?? 0,
      })),
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
      grupo: ucap.grupo ?? null,
      apellidos: (ucap.apellidos || []).map((a: any) => ({
        apellidoId: a.apellidoId,
        ucapId: a.ucapId,
        apellido: a.apellido,
        sortOrder: a.sortOrder ?? 0,
      })),
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

  // ---- ANNUAL PLAN REVIEW ----

  async getAnnualPlanReview(params: {
    year: number;
    municipio: string;
    zone?: string;
  }): Promise<AnnualPlanReview | null> {
    const response = await api.get('/surveys/annual-plan/review', { params });
    return response.data;
  },

  async reviewAnnualPlan(data: {
    year: number;
    municipio: string;
    zone?: string;
    decision: AnnualPlanReviewStatus;
    comment?: string;
  }): Promise<AnnualPlanReview> {
    const response = await api.patch('/surveys/annual-plan/review', data);
    return response.data;
  },

  // ---- WORK ACTA WORKFLOW ----

  // El acta se identifica por (companyId, projectId, actaNumber): el número se reutiliza
  // entre municipios y, en Canales & Contactos, el municipio es el proyecto.
  async getWorkActa(companyId: number, projectId: number | null, actaNumber: string): Promise<WorkActa | null> {
    const response = await api.get(`/surveys/actas/${encodeURIComponent(actaNumber)}`, {
      params: projectId != null ? { companyId, projectId } : { companyId },
    });
    return response.data;
  },

  async getActaSummaryDraft(companyId: number, projectId: number | null, actaNumber: string): Promise<ActaSummaryDraftResponse> {
    const response = await api.get(`/surveys/actas/${encodeURIComponent(actaNumber)}/summary-draft`, {
      params: projectId != null ? { companyId, projectId } : { companyId },
    });
    return response.data;
  },

  async saveActaSummaryDraft(
    companyId: number,
    projectId: number | null,
    actaNumber: string,
    payload: Record<string, any>,
  ): Promise<ActaSummaryDraftResponse> {
    const response = await api.put(`/surveys/actas/${encodeURIComponent(actaNumber)}/summary-draft`, {
      companyId,
      projectId,
      payload,
    });
    return response.data;
  },

  async getWorkActasBulk(items: Array<{ companyId: number; projectId: number | null; actaNumber: string }>): Promise<WorkActa[]> {
    const response = await api.post('/surveys/actas/bulk-status', { items });
    return response.data;
  },

  async submitActaForReview(companyId: number, projectId: number | null, actaNumber: string): Promise<WorkActa> {
    const response = await api.patch(`/surveys/actas/${encodeURIComponent(actaNumber)}/submit`, { companyId, projectId });
    return response.data;
  },

  async reviewActa(companyId: number, projectId: number | null, actaNumber: string, approved: boolean, comment?: string): Promise<WorkActa> {
    const response = await api.patch(`/surveys/actas/${encodeURIComponent(actaNumber)}/review`, { companyId, projectId, approved, comment });
    return response.data;
  },

  async approveActa(companyId: number, projectId: number | null, actaNumber: string, projectCode: string): Promise<WorkActa> {
    const response = await api.patch(`/surveys/actas/${encodeURIComponent(actaNumber)}/approve`, { companyId, projectId, projectCode });
    return response.data;
  },

  async sendActaToBudget(companyId: number, projectId: number | null, actaNumber: string): Promise<WorkActa> {
    const response = await api.patch(`/surveys/actas/${encodeURIComponent(actaNumber)}/send-to-budget`, { companyId, projectId });
    return response.data;
  },

  async getActasPendingBudget(): Promise<PendingBudgetActa[]> {
    const response = await api.get('/surveys/actas/pending-budget');
    return response.data;
  },

  async submitActaCronograma(companyId: number, projectId: number | null, actaNumber: string): Promise<WorkActa> {
    const response = await api.patch(
      `/surveys/actas/${encodeURIComponent(actaNumber)}/submit-cronograma`,
      { companyId, projectId },
    );
    return response.data;
  },

  async reviewActaCronograma(
    companyId: number,
    projectId: number | null,
    actaNumber: string,
    decision: 'aprobado' | 'rechazado',
    motivo?: string,
  ): Promise<WorkActa> {
    const response = await api.patch(
      `/surveys/actas/${encodeURIComponent(actaNumber)}/review-cronograma`,
      { companyId, projectId, decision, motivo },
    );
    return response.data;
  },

  async getActasPendingCronograma(): Promise<PendingBudgetActa[]> {
    const response = await api.get('/surveys/actas/pending-cronograma');
    return response.data;
  },

  async reviewActaBudget(
    companyId: number,
    projectId: number | null,
    actaNumber: string,
    decision: 'aprobado' | 'rechazado',
    motivo?: string,
  ): Promise<WorkActa> {
    const response = await api.patch(
      `/surveys/actas/${encodeURIComponent(actaNumber)}/review-budget`,
      { companyId, projectId, decision, motivo },
    );
    return response.data;
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

// ============================================
// TYPES - Annual Plan Review
// ============================================
export type AnnualPlanReviewStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface AnnualPlanReview {
  reviewId: number;
  year: number;
  municipio: string;
  zone: string;
  status: AnnualPlanReviewStatus;
  comment: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// TYPES - Work Acta Workflow
// ============================================
export type ActaStatus = 'borrador' | 'en_revision' | 'en_aprobacion' | 'aprobada';
export type ActaBudgetStatus = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado';
export type ActaCronogramaStatus = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado';

export interface WorkActa {
  actaId: number;
  companyId: number;
  projectId: number | null;
  actaNumber: string;
  status: ActaStatus;
  presupuestoStatus?: ActaBudgetStatus;
  presupuestoRechazoMotivo?: string | null;
  cronogramaStatus?: ActaCronogramaStatus;
  cronogramaRechazoMotivo?: string | null;
  projectCode: string | null;
  createdBy: number;
  reviewedBy: number | null;
  reviewedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectionComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActaSummaryDraftResponse {
  payload: Record<string, any> | null;
  updatedAt: string | null;
  updatedBy: number | null;
}

export interface PendingBudgetActa {
  companyId: number;
  projectId: number | null;
  actaNumber: string;
  companyName: string | null;
  worksCount: number;
  updatedAt: string;
}

export default surveysService;
