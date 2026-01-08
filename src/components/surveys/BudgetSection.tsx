import { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
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
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { surveysService, type Ucap, type IppConfig } from '@/services/surveys.service';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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
    <div className="flex gap-1 w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between h-8 text-xs font-normal"
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
    {/* Clear button - only show when there's a selection */}
    {selectedUcap && !disabled && (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(null);
        }}
        title="Limpiar selección"
      >
        <X className="h-4 w-4" />
      </Button>
    )}
    </div>
  );
}

export function BudgetSection({
  workName,
  companyId,
  projectId,
  items,
  onItemsChange,
  ippValue,
  onIppValueChange,
}: BudgetSectionProps) {
  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [ippConfig, setIppConfig] = useState<IppConfig>({ baseYear: 2015, baseMonth: 1, initialValue: 100 });
  const [loading, setLoading] = useState(false);
  const [ucapError, setUcapError] = useState<string | null>(null);

  // Load UCAPs when company or project changes
  useEffect(() => {
    const loadUcaps = async () => {
      if (!companyId) {
        setUcaps([]);
        setIppConfig({ baseYear: 2015, baseMonth: 1, initialValue: 100 });
        setUcapError(null);
        return;
      }
      try {
        setLoading(true);
        setUcapError(null);
        const response = await surveysService.getUcaps(companyId, projectId || undefined);
        console.log('UCAPs loaded:', response.ucaps.length, 'items for company:', companyId, 'project:', projectId);
        console.log('IPP Config:', response.ippConfig);
        setUcaps(response.ucaps);
        setIppConfig(response.ippConfig);
        if (response.ucaps.length === 0) {
          setUcapError('No se encontraron UCAPs para esta empresa/proyecto');
        }
      } catch (error: any) {
        console.error('Error loading UCAPs:', error);
        setUcaps([]);
        setUcapError(error.response?.data?.message || 'Error al cargar UCAPs');
      } finally {
        setLoading(false);
      }
    };
    loadUcaps();
  }, [companyId, projectId]);

  // Update items with unitValue when UCAPs are loaded (for edit mode)
  useEffect(() => {
    if (ucaps.length === 0) return;

    // Check if any item has ucapId but no unitValue (loaded from backend)
    const needsUpdate = items.some(item => item.ucapId !== null && item.unitValue === 0);
    if (!needsUpdate) return;

    const updatedItems = items.map(item => {
      if (item.ucapId !== null && item.unitValue === 0) {
        const ucap = ucaps.find(u => u.ucapId === item.ucapId);
        if (ucap) {
          return {
            ...item,
            ucapCode: ucap.code,
            ucapDescription: ucap.description,
            unitValue: ucap.value,
            initialIpp: ucap.initialIpp,
            budgetedValue: item.quantity * ucap.value,
          };
        }
      }
      return item;
    });

    // Only update if there were changes
    if (updatedItems !== items) {
      onItemsChange(updatedItems);
    }
  }, [ucaps, items, onItemsChange]);

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
    (index: number, value: string) => {
      const quantity = parseFloat(value) || 0;
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

  // Format quantity for display (use dot as decimal separator)
  const formatQuantity = (value: number): string => {
    if (value === 0) return '';
    return value.toString();
  };

  // Calculate totals
  const totalBudgeted = useMemo(() => {
    return items.reduce((sum, item) => sum + item.budgetedValue, 0);
  }, [items]);

  // Get initial IPP from ippConfig (comes from backend based on company/project)
  const initialIpp = ippConfig.initialValue;

  // Generate dynamic label for IPP initial (e.g., "IPP Julio 2015")
  const ippLabel = useMemo(() => {
    const monthName = MONTH_NAMES[ippConfig.baseMonth - 1] || 'Enero';
    return `IPP ${monthName} ${ippConfig.baseYear}`;
  }, [ippConfig.baseMonth, ippConfig.baseYear]);

  // Calculate adjusted total: (IPP mes / IPP inicial) * total presupuestado
  const totalAdjusted = useMemo(() => {
    if (!ippValue || initialIpp === 0) return totalBudgeted;
    return (ippValue / initialIpp) * totalBudgeted;
  }, [ippValue, initialIpp, totalBudgeted]);

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
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-wide">
          I. PRESUPUESTO {workName ? workName.toUpperCase() : 'LEVANTAMIENTO'}
        </h2>
        <div className="flex items-center gap-2 text-sm text-white/80">
          {loading && (
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              Cargando UCAPs...
            </span>
          )}
          {!loading && ucaps.length > 0 && (
            <span>{ucaps.length} UCAPs disponibles</span>
          )}
        </div>
      </div>

      {/* Info/Error Message */}
      {ucapError && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-700">
          ⚠️ {ucapError}
        </div>
      )}
      {!companyId && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-sm text-blue-700">
          ℹ️ Seleccione una empresa para cargar las UCAPs disponibles
        </div>
      )}

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
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[,.]?[0-9]*"
                    value={formatQuantity(item.quantity)}
                    onChange={(e) => handleQuantityChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      // Allow arrows to increment/decrement by 1
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        handleQuantityChange(index, String(Math.floor(item.quantity) + 1));
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        handleQuantityChange(index, String(Math.max(0, Math.floor(item.quantity) - 1)));
                      }
                    }}
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

      {/* Totals and IPP Section */}
      <div className="border-t border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-50))]">
        {/* Total Obra Row */}
        <div className="flex justify-between items-center px-6 py-3 border-b border-[hsl(var(--canalco-neutral-200))] bg-cyan-100">
          <span className="text-sm font-bold text-cyan-800">
            TOTAL OBRA {workName ? workName.toUpperCase() : ''}
          </span>
          <span className="font-mono font-bold text-cyan-800 text-lg">
            {formatCurrency(totalBudgeted)}
          </span>
        </div>

        {/* IPP Inicial Row */}
        <div className="flex justify-between items-center px-6 py-2 border-b border-[hsl(var(--canalco-neutral-200))]">
          <span className="text-sm text-[hsl(var(--canalco-neutral-700))]">
            ÍNDICE DE PRECIOS AL PRODUCTOR INICIAL ({ippLabel})
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[hsl(var(--canalco-neutral-600))]">
              {initialIpp > 0 ? Number(initialIpp).toFixed(2) : '100.00'}
            </span>
          </div>
        </div>

        {/* IPP Actual Row */}
        <div className="flex justify-between items-center px-6 py-2 border-b border-[hsl(var(--canalco-neutral-200))]">
          <span className="text-sm text-[hsl(var(--canalco-neutral-700))]">
            ÍNDICE DE PRECIOS AL PRODUCTOR DEL MES
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Ej: 185.51"
              value={ippValue || ''}
              onChange={(e) => onIppValueChange(parseFloat(e.target.value) || null)}
              className="h-8 w-28 text-sm text-right font-mono"
            />
          </div>
        </div>

        {/* Valor Total Row */}
        <div className="flex justify-between items-center px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500">
          <span className="text-sm font-bold text-white">
            VALOR TOTAL
          </span>
          <span className="font-mono font-bold text-white text-lg">
            {formatCurrency(totalAdjusted)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BudgetSection;
