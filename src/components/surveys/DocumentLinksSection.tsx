import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileImage, Map } from 'lucide-react';

export interface DocumentLinksData {
  sketchUrl: string;
  mapUrl: string;
}

interface DocumentLinksSectionProps {
  data: DocumentLinksData;
  onDataChange: (data: DocumentLinksData) => void;
}

export const createInitialDocumentLinks = (): DocumentLinksData => ({
  sketchUrl: '',
  mapUrl: '',
});

export function DocumentLinksSection({
  data,
  onDataChange,
}: DocumentLinksSectionProps) {
  const handleChange = (field: keyof DocumentLinksData, value: string) => {
    onDataChange({
      ...data,
      [field]: value,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          III. DOCUMENTOS ADJUNTOS
        </h2>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Croquis URL */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center gap-2">
              <FileImage className="w-4 h-4 text-cyan-600" />
              URL del Croquis
            </Label>
            <Input
              type="url"
              value={data.sketchUrl}
              onChange={(e) => handleChange('sketchUrl', e.target.value)}
              placeholder="https://company.sharepoint.com/sites/docs/croquis/..."
              className="h-10"
            />
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
              Pegue el enlace de SharePoint del croquis de la obra
            </p>
          </div>

          {/* Mapa URL */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] flex items-center gap-2">
              <Map className="w-4 h-4 text-cyan-600" />
              URL del Mapa
            </Label>
            <Input
              type="url"
              value={data.mapUrl}
              onChange={(e) => handleChange('mapUrl', e.target.value)}
              placeholder="https://company.sharepoint.com/sites/docs/mapas/..."
              className="h-10"
            />
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
              Pegue el enlace de SharePoint del mapa de la obra
            </p>
          </div>
        </div>

        {/* Preview links if available */}
        {(data.sketchUrl || data.mapUrl) && (
          <div className="mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
            <p className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-2">
              Enlaces configurados:
            </p>
            <div className="flex flex-wrap gap-4">
              {data.sketchUrl && (
                <a
                  href={data.sketchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-600 hover:text-cyan-800 hover:underline flex items-center gap-1"
                >
                  <FileImage className="w-4 h-4" />
                  Ver Croquis
                </a>
              )}
              {data.mapUrl && (
                <a
                  href={data.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-600 hover:text-cyan-800 hover:underline flex items-center gap-1"
                >
                  <Map className="w-4 h-4" />
                  Ver Mapa
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentLinksSection;
