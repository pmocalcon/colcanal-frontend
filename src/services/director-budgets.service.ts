import api from './api';

export interface DirectorBudgetItemDto {
  itemOrder: number;
  materialId?: number | null;
  codigo?: string;
  descripcion?: string;
  cantidad?: number | null;
  vrUnitario?: number | null;
  cantBodega?: number | null;
  costoTransporte?: number | null;
  ejecutado?: number | null;
  hasIva?: boolean;
}

export type BudgetStatus = 'draft' | 'en_revision' | 'final';

export interface CreateDirectorBudgetDto {
  workId?: number | null;
  departmentName?: string;
  workName?: string;
  companyName?: string;
  observaciones?: string;
  fuenteFinanciacion?: string;
  valorMinimoExcedentes?: number | null;
  valorActualExcedentes?: number | null;
  valorActualExcedentesTexto?: string;
  saldoDisponible?: number | null;
  manoDeObra?: number | null;
  manoDeObraEj?: number | null;
  materialesInventario?: number | null;
  materialesInventarioEj?: number | null;
  valorFacturado?: number | null;
  valorFacturadoEj?: number | null;
  otrosCostos?: number | null;
  otrosCostosEj?: number | null;
  leg?: number | null;
  legEj?: number | null;
  retPct?: number | null;
  retPctEj?: number | null;
  estampillaPct?: number | null;
  estampillaPctEj?: number | null;
  status?: BudgetStatus;
  items: DirectorBudgetItemDto[];
}

export interface DirectorBudgetItem {
  itemId: number;
  itemOrder: number;
  materialId: number | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  vrUnitario: number | null;
  cantBodega: number | null;
  costoTransporte: number | null;
  ejecutado: number | null;
  hasIva: boolean;
  material?: {
    materialId: number;
    code: string;
    description: string;
  };
}

export interface DirectorBudget {
  budgetId: number;
  workId: number | null;
  departmentName: string | null;
  workName: string | null;
  companyName: string | null;
  observaciones: string | null;
  fuenteFinanciacion: string | null;
  valorMinimoExcedentes: number | null;
  valorActualExcedentes: number | null;
  valorActualExcedentesTexto: string | null;
  saldoDisponible: number | null;
  manoDeObra: number | null;
  manoDeObraEj: number | null;
  materialesInventario: number | null;
  materialesInventarioEj: number | null;
  valorFacturado: number | null;
  valorFacturadoEj: number | null;
  otrosCostos: number | null;
  otrosCostosEj: number | null;
  leg: number | null;
  legEj: number | null;
  retPct: number | null;
  retPctEj: number | null;
  estampillaPct: number | null;
  estampillaPctEj: number | null;
  status: BudgetStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  work?: {
    workId: number;
    name: string;
    company?: { companyId: number; name: string };
  };
  creator?: { userId: number; nombre: string };
  items: DirectorBudgetItem[];
}

export interface DirectorBudgetListResponse {
  data: DirectorBudget[];
  total: number;
  page: number;
  limit: number;
}

export interface DirectorBudgetFilters {
  workId?: number;
  companyId?: string;
  departmentName?: string;
  status?: BudgetStatus;
  createdBy?: number;
  page?: number;
  limit?: number;
}

export const directorBudgetsService = {
  async create(dto: CreateDirectorBudgetDto): Promise<DirectorBudget> {
    const { data } = await api.post('/director-budgets', dto);
    return data;
  },

  async update(budgetId: number, dto: CreateDirectorBudgetDto): Promise<DirectorBudget> {
    const { data } = await api.put(`/director-budgets/${budgetId}`, dto);
    return data;
  },

  async getAll(filters: DirectorBudgetFilters = {}): Promise<DirectorBudgetListResponse> {
    const { data } = await api.get('/director-budgets', { params: filters });
    return data;
  },

  async getById(budgetId: number): Promise<DirectorBudget> {
    const { data } = await api.get(`/director-budgets/${budgetId}`);
    return data;
  },

  async submitForReview(budgetId: number): Promise<DirectorBudget> {
    const { data } = await api.patch(`/director-budgets/${budgetId}/status`, { status: 'en_revision' });
    return data;
  },

  async approve(budgetId: number): Promise<DirectorBudget> {
    const { data } = await api.patch(`/director-budgets/${budgetId}/status`, { status: 'final' });
    return data;
  },

  async updateOtrosCostos(
    budgetId: number,
    otrosCostos: number | null,
    otrosCostosEj: number | null,
    leg: number | null = null,
    legEj: number | null = null,
  ): Promise<DirectorBudget> {
    const { data } = await api.patch(`/director-budgets/${budgetId}/otros-costos`, {
      otrosCostos,
      otrosCostosEj,
      leg,
      legEj,
    });
    return data;
  },

  async reject(budgetId: number): Promise<DirectorBudget> {
    const { data } = await api.patch(`/director-budgets/${budgetId}/status`, { status: 'draft' });
    return data;
  },
};
