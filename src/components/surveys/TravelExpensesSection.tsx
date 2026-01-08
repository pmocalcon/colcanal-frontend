import { memo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Tipos de gastos de viaje
export type ExpenseType =
  | 'tolls'
  | 'parking'
  | 'lodging'
  | 'food'
  | 'fuel'
  | 'additional_crew'
  | 'day_hours'
  | 'holiday_overtime';

// Mapeo de tipos a descripciones en español
const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  tolls: 'Peajes',
  parking: 'Parqueaderos',
  lodging: 'Hospedaje',
  food: 'Alimentación',
  fuel: 'Combustible',
  additional_crew: 'Cuadrilla adicional',
  day_hours: 'Horas Diurnas',
  holiday_overtime: 'Horas Extras Festivas',
};

// Orden de los tipos de gastos
const EXPENSE_TYPES_ORDER: ExpenseType[] = [
  'tolls',
  'parking',
  'lodging',
  'food',
  'fuel',
  'additional_crew',
  'day_hours',
  'holiday_overtime',
];

export interface TravelExpenseItemData {
  itemNumber: number;
  expenseType: ExpenseType;
  description: string;
  quantity: string;
  observations: string;
}

interface TravelExpensesSectionProps {
  items: TravelExpenseItemData[];
  onItemsChange: (items: TravelExpenseItemData[]) => void;
}

// Initialize 8 fixed items
export const createInitialTravelExpenses = (): TravelExpenseItemData[] => {
  return EXPENSE_TYPES_ORDER.map((expenseType, i) => ({
    itemNumber: i + 1,
    expenseType,
    description: EXPENSE_TYPE_LABELS[expenseType],
    quantity: '',
    observations: '',
  }));
};

// Memoized table row component
interface TravelExpenseRowProps {
  item: TravelExpenseItemData;
  index: number;
  onFieldChange: (index: number, field: 'quantity' | 'observations', value: string) => void;
}

const TravelExpenseRow = memo(function TravelExpenseRow({
  item,
  index,
  onFieldChange,
}: TravelExpenseRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-[hsl(var(--canalco-neutral-200))]',
        index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
      )}
    >
      {/* ITEM - Read Only */}
      <td className="px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-700))] w-12">
        {item.itemNumber}
      </td>
      {/* DESCRIPCIÓN - Read Only */}
      <td className="px-2 py-1 text-sm text-[hsl(var(--canalco-neutral-700))] min-w-[200px]">
        {item.description}
      </td>
      {/* CANTIDAD */}
      <td className="px-1 py-1 w-32">
        <Input
          type="number"
          step="0.01"
          min="0"
          defaultValue={item.quantity}
          onBlur={(e) => onFieldChange(index, 'quantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* OBSERVACIONES */}
      <td className="px-1 py-1 min-w-[200px]">
        <Input
          type="text"
          defaultValue={item.observations}
          onBlur={(e) => onFieldChange(index, 'observations', e.target.value)}
          className="h-7 text-xs"
          placeholder="Observaciones..."
        />
      </td>
    </tr>
  );
});

export function TravelExpensesSection({
  items,
  onItemsChange,
}: TravelExpensesSectionProps) {
  // Handle field change - updates on blur
  const handleFieldChange = useCallback(
    (index: number, field: 'quantity' | 'observations', value: string) => {
      const newItems = [...items];
      newItems[index] = {
        ...newItems[index],
        [field]: value,
      };
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          IV. COSTOS DE VIAJE
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cyan-100 border-b border-cyan-200">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-12">
                ITEM
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[200px]">
                DESCRIPCIÓN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-32">
                CANTIDAD
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[200px]">
                OBSERVACIONES
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <TravelExpenseRow
                key={item.expenseType}
                item={item}
                index={index}
                onFieldChange={handleFieldChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TravelExpensesSection;
