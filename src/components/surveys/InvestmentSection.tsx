import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

// Initialize 25 empty items
export const createInitialInvestmentItems = (): InvestmentItemData[] => {
  return Array.from({ length: 25 }, (_, i) => ({
    itemNumber: i + 1,
    orderNumber: '',
    point: `P${i + 1}`,
    description: '',
    lumQuantity: '',
    lumRelocatedQuantity: '',
    poleQuantity: '',
    twistedNetwork: '',
    latitude: '',
    longitude: '',
  }));
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

// Yes/No Toggle Component
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
      <Label className="text-sm text-[hsl(var(--canalco-neutral-700))] cursor-pointer flex-1">
        {label}
      </Label>
      <div className="flex items-center gap-3">
        <span className={cn(
          "text-sm font-medium transition-colors",
          !value ? "text-[hsl(var(--canalco-neutral-800))]" : "text-[hsl(var(--canalco-neutral-400))]"
        )}>
          No
        </span>
        <Switch
          checked={value}
          onCheckedChange={onChange}
          className="data-[state=checked]:bg-cyan-600"
        />
        <span className={cn(
          "text-sm font-medium transition-colors",
          value ? "text-cyan-700" : "text-[hsl(var(--canalco-neutral-400))]"
        )}>
          Si
        </span>
      </div>
    </div>
  );
}

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

  // Handle item field change
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
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3">
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
            <div className="bg-cyan-100 px-4 py-2 border-b border-cyan-200">
              <span className="text-sm font-semibold text-cyan-800">
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
          <thead className="bg-cyan-100 border-b border-cyan-200">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-12">
                ITEM
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-20">
                No Orden
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-16">
                Puntos
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[200px]">
                Descripción
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-20">
                Cant. Lum
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-24">
                Cant. Lum. Reubicada
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-20">
                Cant Poste
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-24">
                Red Trenzada
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-28">
                Latitud
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-28">
                Longitud
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr
                key={item.itemNumber}
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
                    value={item.orderNumber}
                    onChange={(e) => handleItemChange(index, 'orderNumber', e.target.value)}
                    className="h-7 text-xs text-center"
                  />
                </td>
                {/* Puntos - Read Only */}
                <td className="px-2 py-1 text-center font-medium text-cyan-700">
                  {item.point}
                </td>
                {/* Descripción */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Descripción..."
                  />
                </td>
                {/* Cant. Lum */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.lumQuantity}
                    onChange={(e) => handleItemChange(index, 'lumQuantity', e.target.value)}
                    className="h-7 text-xs text-center"
                  />
                </td>
                {/* Cant. Lum. Reubicada */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.lumRelocatedQuantity}
                    onChange={(e) => handleItemChange(index, 'lumRelocatedQuantity', e.target.value)}
                    className="h-7 text-xs text-center"
                  />
                </td>
                {/* Cant Poste */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.poleQuantity}
                    onChange={(e) => handleItemChange(index, 'poleQuantity', e.target.value)}
                    className="h-7 text-xs text-center"
                  />
                </td>
                {/* Red Trenzada */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    value={item.twistedNetwork}
                    onChange={(e) => handleItemChange(index, 'twistedNetwork', e.target.value)}
                    className="h-7 text-xs text-center"
                  />
                </td>
                {/* Latitud */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.latitude}
                    onChange={(e) => handleItemChange(index, 'latitude', e.target.value)}
                    className="h-7 text-xs text-center"
                    placeholder="Ej: 10.9878"
                  />
                </td>
                {/* Longitud */}
                <td className="px-1 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.longitude}
                    onChange={(e) => handleItemChange(index, 'longitude', e.target.value)}
                    className="h-7 text-xs text-center"
                    placeholder="Ej: -74.7889"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default InvestmentSection;
