import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Search } from 'lucide-react';

export interface FilterValues {
  requisitionNumber: string;
  startDate: string;
  endDate: string;
  operationCenter: string;
  status: string;
  creatorName: string;
}

interface RequisitionFiltersProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
  availableStatuses?: Array<{ code: string; name: string }>;
  availableOperationCenters?: Array<{ code: string; name: string }>;
}

export function RequisitionFilters({
  filters,
  onFiltersChange,
  availableStatuses = [],
  availableOperationCenters = [],
}: RequisitionFiltersProps) {
  const handleFilterChange = (field: keyof FilterValues, value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      requisitionNumber: '',
      startDate: '',
      endDate: '',
      operationCenter: '',
      status: '',
      creatorName: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some((value) => value !== '');

  return (
    <div className="bg-[hsl(var(--canalco-neutral-50))] border-b border-[hsl(var(--canalco-neutral-200))] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-[hsl(var(--canalco-neutral-500))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">
            Filtrar Requisiciones
          </h3>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs text-[hsl(var(--canalco-neutral-600))] hover:text-red-600 hover:bg-red-50"
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Número de Requisición */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            N° Requisición
          </label>
          <Input
            type="text"
            placeholder="Ej: REQ-2024-001"
            value={filters.requisitionNumber}
            onChange={(e) => handleFilterChange('requisitionNumber', e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Fecha Desde */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            Fecha Desde
          </label>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Fecha Hasta */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            Fecha Hasta
          </label>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Centro de Operación */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            Centro de Costo
          </label>
          <Select
            value={filters.operationCenter}
            onValueChange={(value) => handleFilterChange('operationCenter', value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {availableOperationCenters.map((center) => (
                <SelectItem key={center.code} value={center.code}>
                  {center.name || center.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            Estado
          </label>
          <Select
            value={filters.status}
            onValueChange={(value) => handleFilterChange('status', value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {availableStatuses.map((status) => (
                <SelectItem key={status.code} value={status.code}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Solicitante */}
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
            Solicitante
          </label>
          <Input
            type="text"
            placeholder="Nombre del solicitante"
            value={filters.creatorName}
            onChange={(e) => handleFilterChange('creatorName', e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
