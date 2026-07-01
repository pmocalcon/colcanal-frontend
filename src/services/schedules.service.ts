import api from './api';

export interface ScheduleUcapItem {
  itemId: number | null;
  ucapId: number;
  ucapCode: string;
  ucapDescription: string;
  unitValue: number;
  plannedQuantity: number;
  executedQuantity: number;
  ucapStartDate: string | null;
  ucapEndDate: string | null;
}

export interface ScheduleDetail {
  scheduleId: number;
  workId: number;
  startDate: string | null;
  endDate: string | null;
  contractualStart: string | null;
  contractualEnd: string | null;
  ippFactor: number;
  items: ScheduleUcapItem[];
}

export interface UpdateSchedulePayload {
  startDate?: string | null;
  endDate?: string | null;
  contractualStart?: string | null;
  contractualEnd?: string | null;
  items?: Array<{ ucapId: number; executedQuantity: number; ucapStartDate?: string | null; ucapEndDate?: string | null }>;
}

export interface DailyPlanEntry {
  planId?: number;
  ucapId: number;
  planDate: string;   // YYYY-MM-DD
  plannedQuantity: number;
  executedQuantity?: number;
}

export interface DailyPlansResponse {
  scheduleId: number;
  from: string;
  to: string;
  plans: DailyPlanEntry[];
}

export interface SurveyMaterialItem {
  materialCode: string;
  materialDescription: string | null;
  unitOfMeasure: string | null;
  totalQuantity: number;
  unitValue: number;
}

export interface MaterialLogEntry {
  logId?: number;
  materialCode: string;
  materialDescription?: string | null;
  unitOfMeasure?: string | null;
  quantity: number;
  usageDate: string;   // YYYY-MM-DD
}

export interface MaterialLogsResponse {
  scheduleId: number;
  logs: MaterialLogEntry[];
}

export interface DailyExecutionEntry {
  ucapId: number;
  planDate: string;        // YYYY-MM-DD
  executedQuantity: number;
}

export type ExecutionType = 'material' | 'activity';

export interface ExecutionItem {
  itemKey: string;
  label?: string | null;
  unitOfMeasure?: string | null;
  executionDate?: string | null;   // YYYY-MM-DD or null (label-only row)
  quantity: number;
  unitPrice?: number | null;
}

export interface ExecutionsResponse {
  scheduleId: number;
  execType: ExecutionType;
  items: ExecutionItem[];
}

export interface PurchaseComparisonItem {
  materialCode: string;
  materialDescription: string | null;
  requisitionedQty: number;
  orderedQty: number;
  orderedValue: number;
}

export const schedulesService = {
  async getByWork(workId: number): Promise<ScheduleDetail> {
    const response = await api.get(`/schedules/work/${workId}`);
    return response.data;
  },

  async update(scheduleId: number, payload: UpdateSchedulePayload): Promise<ScheduleDetail> {
    const response = await api.put(`/schedules/${scheduleId}`, payload);
    return response.data;
  },

  async getDailyPlans(scheduleId: number, from: string, to: string): Promise<DailyPlansResponse> {
    const response = await api.get(`/schedules/${scheduleId}/daily-plans`, { params: { from, to } });
    return response.data;
  },

  async upsertDailyPlans(scheduleId: number, items: DailyPlanEntry[]): Promise<DailyPlansResponse> {
    const response = await api.put(`/schedules/${scheduleId}/daily-plans`, { items });
    return response.data;
  },

  async getWorkSurveyMaterials(workId: number): Promise<SurveyMaterialItem[]> {
    const response = await api.get(`/schedules/work/${workId}/survey-materials`);
    return response.data;
  },

  async getMaterialLogs(scheduleId: number): Promise<MaterialLogsResponse> {
    const response = await api.get(`/schedules/${scheduleId}/material-logs`);
    return response.data;
  },

  async saveMaterialLogs(scheduleId: number, items: MaterialLogEntry[]): Promise<MaterialLogsResponse> {
    const response = await api.put(`/schedules/${scheduleId}/material-logs`, { items });
    return response.data;
  },

  // ── Ejecución (lo real)
  async saveDailyExecution(scheduleId: number, items: DailyExecutionEntry[]): Promise<{ scheduleId: number; ok: boolean }> {
    const response = await api.put(`/schedules/${scheduleId}/daily-execution`, { items });
    return response.data;
  },

  async getExecutions(scheduleId: number, type: ExecutionType): Promise<ExecutionsResponse> {
    const response = await api.get(`/schedules/${scheduleId}/executions`, { params: { type } });
    return response.data;
  },

  async saveExecutions(scheduleId: number, execType: ExecutionType, items: ExecutionItem[]): Promise<ExecutionsResponse> {
    const response = await api.put(`/schedules/${scheduleId}/executions`, { execType, items });
    return response.data;
  },

  async getWorkPurchaseComparison(workId: number): Promise<PurchaseComparisonItem[]> {
    const response = await api.get(`/schedules/work/${workId}/purchase-comparison`);
    return response.data;
  },

  async getWorksExecutionStatus(workIds: number[]): Promise<{ workId: number; hasExecution: boolean }[]> {
    const response = await api.post('/schedules/execution-status', { workIds });
    return response.data;
  },
};
