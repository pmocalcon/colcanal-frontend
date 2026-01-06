import { useState, useMemo } from 'react';
import type { Requisition, FilterValues, RequisitionStatus, Company, Project } from '@/types';

interface UseRequisitionFiltersResult {
  filters: FilterValues;
  setFilters: React.Dispatch<React.SetStateAction<FilterValues>>;
  filteredRequisitions: Requisition[];
  availableStatuses: RequisitionStatus[];
  availableCompanies: Company[];
  availableProjects: Project[];
}

const DEFAULT_FILTERS: FilterValues = {
  company: '',
  project: '',
  requisitionNumber: '',
  startDate: '',
  endDate: '',
  status: '',
};

/**
 * Hook para manejar filtros de requisiciones
 * Centraliza la lógica de filtrado y extracción de opciones únicas
 */
export function useRequisitionFilters(requisitions: Requisition[]): UseRequisitionFiltersResult {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);

  // Extraer estados únicos
  const availableStatuses = useMemo(() => {
    const statuses = requisitions
      .map((r) => r.status)
      .filter((s): s is RequisitionStatus => s != null);
    return Array.from(new Map(statuses.map((s) => [s.code, s])).values());
  }, [requisitions]);

  // Extraer empresas únicas
  const availableCompanies = useMemo(() => {
    const companies = requisitions.map((r) => r.company);
    return Array.from(new Map(companies.map((c) => [c.companyId, c])).values());
  }, [requisitions]);

  // Extraer proyectos únicos
  const availableProjects = useMemo(() => {
    const projects = requisitions.map((r) => r.project).filter((p): p is Project => p != null);
    return Array.from(new Map(projects.map((p) => [p.projectId, p])).values());
  }, [requisitions]);

  // Aplicar filtros
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      // Filtro por número de requisición
      if (
        filters.requisitionNumber &&
        !req.requisitionNumber.toLowerCase().includes(filters.requisitionNumber.toLowerCase())
      ) {
        return false;
      }

      // Filtro por fecha desde
      if (filters.startDate) {
        const reqDate = new Date(req.createdAt);
        const startDate = new Date(filters.startDate);
        if (reqDate < startDate) return false;
      }

      // Filtro por fecha hasta
      if (filters.endDate) {
        const reqDate = new Date(req.createdAt);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (reqDate > endDate) return false;
      }

      // Filtro por empresa
      if (
        filters.company &&
        filters.company !== 'all' &&
        req.company.companyId.toString() !== filters.company
      ) {
        return false;
      }

      // Filtro por proyecto
      if (
        filters.project &&
        filters.project !== 'all' &&
        req.project?.projectId.toString() !== filters.project
      ) {
        return false;
      }

      // Filtro por estado
      if (
        filters.status &&
        filters.status !== 'all' &&
        req.status?.code !== filters.status
      ) {
        return false;
      }

      return true;
    });
  }, [requisitions, filters]);

  return {
    filters,
    setFilters,
    filteredRequisitions,
    availableStatuses,
    availableCompanies,
    availableProjects,
  };
}
