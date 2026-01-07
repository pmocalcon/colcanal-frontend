import { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { surveysService, type Ucap, type IppData } from '@/services/surveys.service';

const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export interface BudgetItemData {
  itemNumber: number;
  ucapId: number | null;
  ucapCode: string;
  ucapDescription: string;
  unitValue: number;
  initialIpp: number;
  quantity: number;
  budgetedValue: number;
}

interface BudgetSectionProps {
  workName: string;
  companyId: number | null;
  projectId: number | null;
  items: BudgetItemData[];
  onItemsChange: (items: BudgetItemData[]) => void;
  selectedIppMonth: number | null;
  selectedIppYear: number | null;
  onIppChange: (month: number, year: number) => void;
  ippValue: number | null;
  onIppValueChange: (value: number | null) => void;
}

// Initialize 30 empty items
export const createInitialBudgetItems = (): BudgetItemData[] => {
  return Array.from({ length: 30 }, (_, i) => ({
    itemNumber: i + 1,
    ucapId: null,
    ucapCode: '',
    ucapDescription: '',
    unitValue: 0,
    initialIpp: 0,
    quantity: 0,
    budgetedValue: 0,
  }));
};

// UCAP Search Combobox Component
function UcapCombobox({
  value,
  ucaps,
  onSelect,
  disabled = false,
}: {
  value: number | null;
  ucaps: Ucap[];
  onSelect: (ucap: Ucap | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedUcap = ucaps.find((u) => u.ucapId === value);

  const filteredUcaps = useMemo(() => {
    if (!searchQuery) return ucaps.slice(0, 50);
    const query = searchQuery.toLowerCase();
    return ucaps
      .filter(
        (u) =>
          u.code.toLowerCase().includes(query) ||
          u.description.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [ucaps, searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between h-8 text-xs font-normal"
        >
          {selectedUcap ? (
            <span className="truncate">
              {selectedUcap.code} - {selectedUcap.description}
            </span>
          ) : (
            <span className="text-muted-foreground">Buscar UCAP...</span>
          )}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código o descripción..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No se encontraron UCAPs.</CommandEmpty>
            <CommandGroup>
              {filteredUcaps.map((ucap) => (
                <CommandItem
                  key={ucap.ucapId}
                  value={ucap.ucapId.toString()}
                  onSelect={() => {
                    onSelect(ucap.ucapId === value ? null : ucap);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === ucap.ucapId ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{ucap.code}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[350px]">
                      {ucap.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function BudgetSection({
  workName,
  companyId,
  projectId,
  items,
  onItemsChange,
  selectedIppMonth,
  selectedIppYear,
  onIppChange,
  ippValue,
  onIppValueChange,
}: BudgetSectionProps) {
  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [loading, setLoading] = useState(false);

  // Get available years (current year and previous 2 years)
  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear, currentYear - 1, currentYear - 2];

  // Load UCAPs when company or project changes
  useEffect(() => {
    const loadUcaps = async () => {
      if (!companyId) {
        setUcaps([]);
        return;
      }
      try {
        setLoading(true);
        const data = await surveysService.getUcaps(companyId, projectId || undefined);
        setUcaps(data);
      } catch (error) {
        console.error('Error loading UCAPs:', error);
        setUcaps([]);
      } finally {
        setLoading(false);
      }
    };
    loadUcaps();
  }, [companyId, projectId]);

  // Load IPP when month/year changes
  useEffect(() => {
    const loadIpp = async () => {
      if (selectedIppMonth && selectedIppYear) {
        try {
          const data = await surveysService.getIppByMonth(selectedIppMonth, selectedIppYear);
          onIppValueChange(data.value);
        } catch (error) {
          console.error('Error loading IPP:', error);
          onIppValueChange(null);
        }
      }
    };
    loadIpp();
  }, [selectedIppMonth, selectedIppYear, onIppValueChange]);

  // Handle UCAP selection for a row
  const handleUcapSelect = useCallback(
    (index: number, ucap: Ucap | null) => {
      const newItems = [...items];
      if (ucap) {
        newItems[index] = {
          ...newItems[index],
          ucapId: ucap.ucapId,
          ucapCode: ucap.code,
          ucapDescription: ucap.description,
          unitValue: ucap.value,
          initialIpp: ucap.initialIpp,
          budgetedValue: newItems[index].quantity * ucap.value,
        };
      } else {
        newItems[index] = {
          ...newItems[index],
          ucapId: null,
          ucapCode: '',
          ucapDescription: '',
          unitValue: 0,
          initialIpp: 0,
          budgetedValue: 0,
        };
      }
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  // Handle quantity change for a row
  const handleQuantityChange = useCallback(
    (index: number, quantity: number) => {
      const newItems = [...items];
      newItems[index] = {
        ...newItems[index],
        quantity,
        budgetedValue: quantity * newItems[index].unitValue,
      };
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  // Calculate totals
  const totalBudgeted = useMemo(() => {
    return items.reduce((sum, item) => sum + item.budgetedValue, 0);
  }, [items]);

  // Calculate average initial IPP from items with values
  const averageInitialIpp = useMemo(() => {
    const itemsWithIpp = items.filter((item) => item.initialIpp > 0);
    if (itemsWithIpp.length === 0) return 0;
    return itemsWithIpp.reduce((sum, item) => sum + item.initialIpp, 0) / itemsWithIpp.length;
  }, [items]);

  // Calculate adjusted total: (IPP mes anterior / IPP inicial) * total presupuestado
  const totalAdjusted = useMemo(() => {
    if (!ippValue || averageInitialIpp === 0) return totalBudgeted;
    return (ippValue / averageInitialIpp) * totalBudgeted;
  }, [ippValue, averageInitialIpp, totalBudgeted]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          I. PRESUPUESTO {workName ? workName.toUpperCase() : 'LEVANTAMIENTO'}
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cyan-100 border-b border-cyan-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800 w-16">
                ITEM
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[300px]">
                DESCRIPCIÓN (UCAP)
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800 w-32">
                VALOR UNITARIO
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-cyan-800 w-24">
                CANTIDAD
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800 w-36">
                VALOR PPTADO
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.itemNumber}
                className={cn(
                  'border-b border-[hsl(var(--canalco-neutral-200))]',
                  index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'
                )}
              >
                <td className="px-3 py-2 text-center font-medium text-[hsl(var(--canalco-neutral-700))]">
                  {item.itemNumber}
                </td>
                <td className="px-3 py-2">
                  <UcapCombobox
                    value={item.ucapId}
                    ucaps={ucaps}
                    onSelect={(ucap) => handleUcapSelect(index, ucap)}
                    disabled={loading}
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono text-[hsl(var(--canalco-neutral-700))]">
                  {item.unitValue > 0 ? formatCurrency(item.unitValue) : '-'}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min="0"
                    value={item.quantity || ''}
                    onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                    className="h-8 text-sm text-center w-20 mx-auto"
                    disabled={!item.ucapId}
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-[hsl(var(--canalco-neutral-800))]">
                  {item.budgetedValue > 0 ? formatCurrency(item.budgetedValue) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* IPP Section */}
      <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-t border-amber-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-end gap-6">
          {/* IPP Selector */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">
                Ajuste por IPP (Índice de Precios al Productor)
              </h3>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-amber-700">Mes</Label>
                <Select
                  value={selectedIppMonth?.toString() || ''}
                  onValueChange={(val) =>
                    onIppChange(parseInt(val), selectedIppYear || currentYear)
                  }
                >
                  <SelectTrigger className="w-[140px] h-8 text-sm bg-white">
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-amber-700">Año</Label>
                <Select
                  value={selectedIppYear?.toString() || ''}
                  onValueChange={(val) =>
                    onIppChange(selectedIppMonth || 1, parseInt(val))
                  }
                >
                  <SelectTrigger className="w-[100px] h-8 text-sm bg-white">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-amber-700">IPP Seleccionado</Label>
                <div className="h-8 px-3 py-1.5 text-sm bg-white border border-amber-300 rounded-md flex items-center font-mono">
                  {ippValue ? ippValue.toFixed(2) : '-'}
                </div>
              </div>
            </div>
            {averageInitialIpp > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                IPP Inicial (promedio): <span className="font-mono font-semibold">{averageInitialIpp.toFixed(2)}</span>
              </p>
            )}
          </div>

          {/* Totals */}
          <div className="flex flex-col gap-2 lg:min-w-[280px]">
            <div className="flex justify-between items-center bg-white rounded-md px-4 py-2 border border-[hsl(var(--canalco-neutral-300))]">
              <span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">
                Total Presupuestado:
              </span>
              <span className="font-mono font-bold text-[hsl(var(--canalco-neutral-800))]">
                {formatCurrency(totalBudgeted)}
              </span>
            </div>
            <div className="flex justify-between items-center bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-md px-4 py-3 shadow-md">
              <span className="text-sm font-semibold text-white">Valor Total Ajustado:</span>
              <span className="font-mono font-bold text-white text-lg">
                {formatCurrency(totalAdjusted)}
              </span>
            </div>
            {ippValue && averageInitialIpp > 0 && (
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))] text-right">
                Fórmula: (IPP Mes / IPP Inicial) × Total = ({ippValue.toFixed(2)} / {averageInitialIpp.toFixed(2)}) × {formatCurrency(totalBudgeted)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BudgetSection;
