import { memo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InvestmentItemData {
  itemNumber: number;
  orderNumber: string;
  point: string;
  description: string;
  lumQuantity: string;
  lumRelocatedQuantity: string;
  poleQuantity: string;
  twistedNetwork: string;
  latitude: string;
  longitude: string;
}

export interface InvestmentQuestionsData {
  requiresPhotometricStudies: boolean;
  requiresRetieCertification: boolean;
  requiresRetilapCertification: boolean;
  requiresCivilWork: boolean;
}

export interface InvestmentSectionData {
  description: string;
  questions: InvestmentQuestionsData;
  items: InvestmentItemData[];
}

interface InvestmentSectionProps {
  data: InvestmentSectionData;
  onDataChange: (data: InvestmentSectionData) => void;
}

export const createInitialInvestmentItems = (): InvestmentItemData[] => {
  return [{ itemNumber: 1, orderNumber: '', point: 'P1', description: '', lumQuantity: '', lumRelocatedQuantity: '', poleQuantity: '', twistedNetwork: '', latitude: '', longitude: '' }];
};

export const createInitialInvestmentData = (): InvestmentSectionData => ({
  description: '',
  questions: {
    requiresPhotometricStudies: false,
    requiresRetieCertification: false,
    requiresRetilapCertification: false,
    requiresCivilWork: false,
  },
  items: createInitialInvestmentItems(),
});

// Yes/No Toggle Component - Shows only the selected value
function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-4 border-b border-[hsl(var(--canalco-neutral-200))] last:border-b-0">
      <Label className="text-sm text-[hsl(var(--canalco-neutral-700))] flex-1">
        {label}
      </Label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "px-4 py-1 rounded-full text-sm font-semibold transition-colors min-w-[50px]",
          value
            ? "bg-[hsl(var(--canalco-primary))] text-white hover:bg-[hsl(var(--canalco-primary-hover))]"
            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
        )}
      >
        {value ? 'Si' : 'No'}
      </button>
    </div>
  );
}

// Memoized table row component to prevent unnecessary re-renders
interface InvestmentRowProps {
  item: InvestmentItemData;
  index: number;
  onFieldChange: (index: number, field: keyof InvestmentItemData, value: string) => void;
}

const InvestmentRow = memo(function InvestmentRow({
  item,
  index,
  onFieldChange,
}: InvestmentRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-[hsl(var(--canalco-neutral-200))]',
        index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
      )}
    >
      {/* ITEM - Read Only */}
      <td className="px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-700))]">
        {item.itemNumber}
      </td>
      {/* No Orden */}
      <td className="px-1 py-1">
        <Input
          type="text"
          defaultValue={item.orderNumber}
          onBlur={(e) => onFieldChange(index, 'orderNumber', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* Puntos - Read Only */}
      <td className="px-2 py-1 text-center font-medium text-[hsl(var(--canalco-neutral-900))]">
        {item.point}
      </td>
      {/* Descripción */}
      <td className="px-1 py-1">
        <Input
          type="text"
          defaultValue={item.description}
          onBlur={(e) => onFieldChange(index, 'description', e.target.value)}
          className="h-7 text-xs"
          placeholder="Descripción..."
        />
      </td>
      {/* Cant. Lum */}
      <td className="px-1 py-1">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.lumQuantity}
          onBlur={(e) => onFieldChange(index, 'lumQuantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* Cant. Lum. Reubicada */}
      <td className="px-1 py-1">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.lumRelocatedQuantity}
          onBlur={(e) => onFieldChange(index, 'lumRelocatedQuantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* Cant Poste */}
      <td className="px-1 py-1">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.poleQuantity}
          onBlur={(e) => onFieldChange(index, 'poleQuantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* Red Eléctrica */}
      <td className="px-1 py-1">
        <Input
          type="text"
          defaultValue={item.twistedNetwork}
          onBlur={(e) => onFieldChange(index, 'twistedNetwork', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* Latitud */}
      <td className="px-1 py-1">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.latitude}
          onBlur={(e) => onFieldChange(index, 'latitude', e.target.value)}
          className="h-7 text-xs text-center"
          placeholder="Ej: 10.9878"
        />
      </td>
      {/* Longitud */}
      <td className="px-1 py-1">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.longitude}
          onBlur={(e) => onFieldChange(index, 'longitude', e.target.value)}
          className="h-7 text-xs text-center"
          placeholder="Ej: -74.7889"
        />
      </td>
    </tr>
  );
});

export function InvestmentSection({
  data,
  onDataChange,
}: InvestmentSectionProps) {
  // Handle description change
  const handleDescriptionChange = useCallback(
    (value: string) => {
      onDataChange({
        ...data,
        description: value,
      });
    },
    [data, onDataChange]
  );

  // Handle question toggle
  const handleQuestionChange = useCallback(
    (question: keyof InvestmentQuestionsData, value: boolean) => {
      onDataChange({
        ...data,
        questions: {
          ...data.questions,
          [question]: value,
        },
      });
    },
    [data, onDataChange]
  );

  // Add a new empty investment row
  const addRow = useCallback(() => {
    const n = data.items.length + 1;
    const newItem: InvestmentItemData = {
      itemNumber: n,
      orderNumber: '',
      point: `P${n}`,
      description: '',
      lumQuantity: '',
      lumRelocatedQuantity: '',
      poleQuantity: '',
      twistedNetwork: '',
      latitude: '',
      longitude: '',
    };
    onDataChange({ ...data, items: [...data.items, newItem] });
  }, [data, onDataChange]);

  // Handle item field change - updates on blur to prevent focus loss
  const handleItemChange = useCallback(
    (index: number, field: keyof InvestmentItemData, value: string) => {
      const newItems = [...data.items];
      newItems[index] = {
        ...newItems[index],
        [field]: value,
      };
      onDataChange({
        ...data,
        items: newItems,
      });
    },
    [data, onDataChange]
  );

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-[hsl(var(--canalco-primary))] px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          II. DESCRIPCIÓN DE INVERSIÓN
        </h2>
      </div>

      {/* Description and Questions Section */}
      <div className="p-6 border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Description Textarea */}
          <div>
            <Label className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2 block">
              DESCRIPCIÓN Y OBSERVACIONES
            </Label>
            <Textarea
              value={data.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Ingrese la descripción y observaciones de la obra..."
              className="min-h-[160px] resize-none"
            />
          </div>

          {/* Right: Yes/No Questions */}
          <div className="border border-[hsl(var(--canalco-neutral-200))] rounded-lg overflow-hidden">
            <div className="bg-[hsl(var(--canalco-primary))]/10 px-4 py-2 border-b border-[hsl(var(--canalco-neutral-200))]">
              <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                REQUERIMIENTOS DE LA OBRA
              </span>
            </div>
            <YesNoToggle
              label="La obra requiere estudios fotométricos"
              value={data.questions.requiresPhotometricStudies}
              onChange={(v) => handleQuestionChange('requiresPhotometricStudies', v)}
            />
            <YesNoToggle
              label="La obra requiere certificación RETIE"
              value={data.questions.requiresRetieCertification}
              onChange={(v) => handleQuestionChange('requiresRetieCertification', v)}
            />
            <YesNoToggle
              label="La obra requiere certificación RETILAP"
              value={data.questions.requiresRetilapCertification}
              onChange={(v) => handleQuestionChange('requiresRetilapCertification', v)}
            />
            <YesNoToggle
              label="Requiere Obra Civil"
              value={data.questions.requiresCivilWork}
              onChange={(v) => handleQuestionChange('requiresCivilWork', v)}
            />
          </div>
        </div>
      </div>

      {/* Investment Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-12">
                ITEM
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-20">
                No Orden
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-16">
                Puntos
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] min-w-[200px]">
                Descripción
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-20">
                Cant. Lum
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-24">
                Cant. Lum. Reubicada
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-20">
                Cant Poste
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-24">
                Red Eléctrica
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-28">
                Latitud
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))] w-28">
                Longitud
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <InvestmentRow
                key={item.itemNumber}
                item={item}
                index={index}
                onFieldChange={handleItemChange}
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

export default InvestmentSection;
