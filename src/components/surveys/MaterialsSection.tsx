import { useState, useEffect, useMemo, useCallback, memo } from 'react';
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
import { materialsService, type Material } from '@/services/materials.service';

export interface MaterialItemData {
  itemNumber: number;
  materialId: number | null;
  materialCode: string;
  description: string;
  unitOfMeasure: string;
  quantity: string;
  observations: string;
}

interface MaterialsSectionProps {
  items: MaterialItemData[];
  onItemsChange: (items: MaterialItemData[]) => void;
}

// Initialize 30 empty items
export const createInitialMaterialItems = (): MaterialItemData[] => {
  return Array.from({ length: 30 }, (_, i) => ({
    itemNumber: i + 1,
    materialId: null,
    materialCode: '',
    description: '',
    unitOfMeasure: '',
    quantity: '',
    observations: '',
  }));
};

// Material Search Combobox Component
function MaterialCombobox({
  value,
  materials,
  onSelect,
  disabled = false,
}: {
  value: number | null;
  materials: Material[];
  onSelect: (material: Material | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedMaterial = materials.find((m) => m.materialId === value);

  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materials.slice(0, 50);
    const query = searchQuery.toLowerCase();
    return materials
      .filter(
        (m) =>
          m.code.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [materials, searchQuery]);

  return (
    <div className="flex gap-1 w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between h-7 text-xs font-normal"
          >
            {selectedMaterial ? (
              <span className="truncate">{selectedMaterial.code}</span>
            ) : (
              <span className="text-muted-foreground">Buscar...</span>
            )}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
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
              <CommandEmpty>No se encontraron materiales.</CommandEmpty>
              <CommandGroup>
                {filteredMaterials.map((material) => (
                  <CommandItem
                    key={material.materialId}
                    value={material.materialId.toString()}
                    onSelect={() => {
                      onSelect(material.materialId === value ? null : material);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === material.materialId ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{material.code}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[350px]">
                        {material.description}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* Clear button */}
      {selectedMaterial && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
          }}
          title="Limpiar selección"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Memoized table row component
interface MaterialRowProps {
  item: MaterialItemData;
  index: number;
  materials: Material[];
  onMaterialSelect: (index: number, material: Material | null) => void;
  onFieldChange: (index: number, field: keyof MaterialItemData, value: string) => void;
  loading: boolean;
}

const MaterialRow = memo(function MaterialRow({
  item,
  index,
  materials,
  onMaterialSelect,
  onFieldChange,
  loading,
}: MaterialRowProps) {
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
      {/* CODIGO MATERIAL */}
      <td className="px-1 py-1 w-32">
        <MaterialCombobox
          value={item.materialId}
          materials={materials}
          onSelect={(m) => onMaterialSelect(index, m)}
          disabled={loading}
        />
      </td>
      {/* DESCRIPCIÓN - Read Only from material */}
      <td className="px-2 py-1 text-xs text-[hsl(var(--canalco-neutral-700))] min-w-[250px]">
        <span className="line-clamp-2">{item.description || '-'}</span>
      </td>
      {/* UNIDAD DE MEDIDA */}
      <td className="px-1 py-1 w-28">
        <Input
          type="text"
          defaultValue={item.unitOfMeasure}
          onBlur={(e) => onFieldChange(index, 'unitOfMeasure', e.target.value)}
          className="h-7 text-xs text-center"
          placeholder="Unidad"
        />
      </td>
      {/* CANTIDAD */}
      <td className="px-1 py-1 w-20">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={item.quantity}
          onBlur={(e) => onFieldChange(index, 'quantity', e.target.value)}
          className="h-7 text-xs text-center"
        />
      </td>
      {/* OBSERVACIONES */}
      <td className="px-1 py-1 min-w-[150px]">
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

export function MaterialsSection({
  items,
  onItemsChange,
}: MaterialsSectionProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load materials catalog on mount
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await materialsService.getMaterials();
        setMaterials(data);
      } catch (err: any) {
        console.error('Error loading materials:', err);
        setError(err.response?.data?.message || 'Error al cargar materiales');
      } finally {
        setLoading(false);
      }
    };
    loadMaterials();
  }, []);

  // Handle material selection for a row
  const handleMaterialSelect = useCallback(
    (index: number, material: Material | null) => {
      const newItems = [...items];
      if (material) {
        newItems[index] = {
          ...newItems[index],
          materialId: material.materialId,
          materialCode: material.code,
          description: material.description,
        };
      } else {
        newItems[index] = {
          ...newItems[index],
          materialId: null,
          materialCode: '',
          description: '',
        };
      }
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  // Handle field change - updates on blur
  const handleFieldChange = useCallback(
    (index: number, field: keyof MaterialItemData, value: string) => {
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
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-wide">
          III. MATERIALES
        </h2>
        <div className="flex items-center gap-2 text-sm text-white/80">
          {loading && (
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              Cargando materiales...
            </span>
          )}
          {!loading && materials.length > 0 && (
            <span>{materials.length} materiales disponibles</span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cyan-100 border-b border-cyan-200">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-12">
                ITEM
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-32">
                CODIGO MATERIAL
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[250px]">
                DESCRIPCIÓN
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-28">
                UNIDAD DE MEDIDA
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-cyan-800 w-20">
                CANTIDAD
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-cyan-800 min-w-[150px]">
                OBSERVACIONES
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <MaterialRow
                key={item.itemNumber}
                item={item}
                index={index}
                materials={materials}
                onMaterialSelect={handleMaterialSelect}
                onFieldChange={handleFieldChange}
                loading={loading}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MaterialsSection;
