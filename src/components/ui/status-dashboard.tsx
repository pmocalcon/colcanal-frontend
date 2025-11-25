import { AlertCircle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface StatusCount {
  status: string;
  statusLabel: string;
  count: number;
  color?: string;
}

export interface StatusDashboardProps {
  pendingByStatus?: StatusCount[];
  overdueCount?: number;
  title?: string;
  // Nueva prop para total de pendientes (si se proporciona, se usa en lugar de calcular)
  totalPending?: number;
}

export function StatusDashboard({
  pendingByStatus = [],
  overdueCount = 0,
  title = 'Pendientes de Atención',
  totalPending,
}: StatusDashboardProps) {
  // Calcular total de pendientes (sumando todos los estados o usando el prop si se proporciona)
  const calculatedTotal = totalPending ?? pendingByStatus.reduce((sum, item) => sum + item.count, 0);
  const hasOverdue = overdueCount > 0;

  // Solo mostrar si hay algo pendiente o vencido
  if (calculatedTotal === 0 && !hasOverdue) {
    return null;
  }

  return (
    <Card className="p-4 mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <h3 className="font-semibold text-orange-900">{title}</h3>
        </div>

        <div className="flex-grow flex items-center gap-6 flex-wrap">
          {/* Total de Pendientes */}
          {calculatedTotal > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-orange-200">
              <span className="text-sm font-medium text-gray-700">Pendiente:</span>
              <span className="text-lg font-bold text-orange-600">{calculatedTotal}</span>
            </div>
          )}

          {/* Pendientes Vencidos */}
          {hasOverdue && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 rounded-lg border border-red-300">
              <Clock className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">Pendientes Vencidos:</span>
              <span className="text-lg font-bold text-red-600">{overdueCount}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
