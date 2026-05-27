import { memo, useCallback, useState } from 'react';

function FormattedNumberInput({
  defaultValue,
  onCommit,
  className,
}: {
  defaultValue: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(defaultValue);
  const formatted = raw !== '' && !isNaN(Number(raw))
    ? Number(raw).toLocaleString('es-CO')
    : raw;
  return (
    <Input
      type={editing ? 'number' : 'text'}
      min="0"
      step="any"
      value={editing ? raw : formatted}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => { setEditing(false); onCommit(raw); }}
      className={className}
    />
  );
}
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tipos de gastos de viaje fijos
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

// Orden de los tipos de gastos fijos
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

export const FIXED_EXPENSE_TYPES = new Set<string>(EXPENSE_TYPES_ORDER);

export interface TravelExpenseItemData {
  itemNumber: number;
  expenseType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  observations: string;
  isCustom?: boolean;
}

interface TravelExpensesSectionProps {
  items: TravelExpenseItemData[];
  onItemsChange: (items: TravelExpenseItemData[]) => void;
}

// Initialize fixed items only
export const createInitialTravelExpenses = (): TravelExpenseItemData[] => {
  return EXPENSE_TYPES_ORDER.map((expenseType, i) => ({
    itemNumber: i + 1,
    expenseType,
    description: EXPENSE_TYPE_LABELS[expenseType],
    quantity: '',
    unitPrice: '',
    observations: '',
  }));
};

// Memoized table row component
interface TravelExpenseRowProps {
  item: TravelExpenseItemData;
  index: number;
  onFieldChange: (index: number, field: 'quantity' | 'unitPrice' | 'observations' | 'description', value: string) => void;
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
      {/* DESCRIPCIÓN - editable for custom rows */}
      <td className="px-2 py-1 text-sm text-[hsl(var(--canalco-neutral-700))] min-w-[200px]">
        {item.isCustom ? (
          <Input
            type="text"
            defaultValue={item.description}
            onBlur={(e) => onFieldChange(index, 'description', e.target.value)}
            className="h-7 text-xs"
            placeholder="Descripción..."
          />
        ) : (
          item.description
        )}
      </td>
      {/* CANTIDAD */}
      <td className="px-1 py-1 w-32">
        <Input
          type="number"
          step="any"
          min="0"
          defaultValue={item.quantity}
          onBlur={(e) => onFieldChange(index, 'quantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* V. UNITARIO */}
      <td className="px-1 py-1 w-32">
        <FormattedNumberInput
          defaultValue={item.unitPrice}
          onCommit={(v) => onFieldChange(index, 'unitPrice', v)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* V. TOTAL */}
      <td className="px-1 py-1 w-36">
        <div className="h-7 flex items-center justify-center text-xs font-medium text-[hsl(var(--canalco-neutral-800))] bg-[hsl(var(--canalco-neutral-100))] border border-[hsl(var(--canalco-neutral-200))] rounded-md px-2">
          {(() => {
            const q = parseFloat(item.quantity);
            const u = parseFloat(item.unitPrice);
            if (!isNaN(q) && !isNaN(u) && (q !== 0 || u !== 0)) {
              return new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(q * u);
            }
            return '-';
          })()}
        </div>
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
    (index: number, field: 'quantity' | 'unitPrice' | 'observations' | 'description', value: string) => {
      const newItems = [...items];
      if (field === 'description') {
        // For custom rows, description is also stored as expenseType for backend
        newItems[index] = { ...newItems[index], description: value, expenseType: value };
      } else {
        newItems[index] = { ...newItems[index], [field]: value };
      }
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  // Add a new custom row
  const addRow = useCallback(() => {
    const newItem: TravelExpenseItemData = {
      itemNumber: items.length + 1,
      expenseType: '',
      description: '',
      quantity: '',
      unitPrice: '',
      observations: '',
      isCustom: true,
    };
    onItemsChange([...items, newItem]);
  }, [items, onItemsChange]);

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-[hsl(var(--canalco-primary))] px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          IV. COSTOS DE VIAJE
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-12">
                ITEM
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] min-w-[200px]">
                DESCRIPCIÓN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-32">
                CANTIDAD
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-32">
                V. UNITARIO
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-36">
                V. TOTAL
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] min-w-[200px]">
                OBSERVACIONES
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <TravelExpenseRow
                key={item.itemNumber}
                item={item}
                index={index}
                onFieldChange={handleFieldChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Row Button */}
      <div className="px-3 py-2 border-t border-[hsl(var(--canalco-neutral-200))]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          className="text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10"
        >
          <Plus className="w-4 h-4 mr-1" />
          Agregar línea
        </Button>
      </div>
    </div>
  );
}

export default TravelExpensesSection;
