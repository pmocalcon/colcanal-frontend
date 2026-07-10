import type { Work } from '@/services/surveys.service';
import type { ScheduleDetail, SurveyMaterialItem, PurchaseComparisonItem } from '@/services/schedules.service';

export type WorkStatus = 'on-track' | 'at-risk' | 'delayed';
export type DailyPlanCell = { planned: string; executed: string };
export type DailyPlanMap = Record<string, Record<number, DailyPlanCell>>;
export type ActaScheduleRow = { work: Work; schedule: ScheduleDetail };
export type ActaDailyPlanMap = Record<number, DailyPlanMap>;
export type NumberDailyMap = Record<string, Record<string, number>>;
export type ActaMaterialRow = ActaScheduleRow & { materials: SurveyMaterialItem[] };
export type ActaActivityRowsMap = Record<number, Array<{ id: string; name: string }>>;
export type ActaNumberDailyMap = Record<number, NumberDailyMap>;
export type ActaPurchaseComparisonMap = Record<number, PurchaseComparisonItem[]>;
