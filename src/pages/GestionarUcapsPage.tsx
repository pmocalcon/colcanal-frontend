import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { surveysService } from '@/services/surveys.service';
import type { Ucap, CreateUcapPayload, UpdateUcapPayload } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Search, X, AlertCircle, Loader2, Pencil } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EXCLUDED_COMPANY_NAMES = [
  'Canales & Contactos',
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí'
];

const EMPTY_FORM: CreateUcapPayload = {
  companyId: 0,
  code: '',
  description: '',
  roundedValue: 0,
  initialIpp: 0,
};

export default function GestionarUcapsPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingUcaps, setLoadingUcaps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUcap, setEditingUcap] = useState<Ucap | null>(null);
  const [form, setForm] = useState<CreateUcapPayload>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies().then((data) => {
      const filtered = data.filter((c) =>
        !EXCLUDED_COMPANY_NAMES.some((excluded) => c.name.includes(excluded))
      );
      setCompanies(filtered);
      setLoadingCompanies(false);
    }).catch(() => {
      setError('Error al cargar empresas');
      setLoadingCompanies(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setUcaps([]);
      return;
    }
    setLoadingUcaps(true);
    setError(null);
    surveysService.getUcaps(selectedCompanyId).then(({ ucaps }) => {
      setUcaps(ucaps);
      setLoadingUcaps(false);
    }).catch(() => {
      setError('Error al cargar UCAPs');
      setLoadingUcaps(false);
    });
  }, [selectedCompanyId]);

  const filteredUcaps = ucaps.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.code.toLowerCase().includes(q) || u.description.toLowerCase().includes(q);
  });

  const reloadUcaps = async () => {
    if (!selectedCompanyId) return;
    const { ucaps } = await surveysService.getUcaps(selectedCompanyId);
    setUcaps(ucaps);
  };

  const openCreateModal = () => {
    setEditingUcap(null);
    setForm({ ...EMPTY_FORM, companyId: selectedCompanyId ?? 0 });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (ucap: Ucap) => {
    setEditingUcap(ucap);
    setForm({
      companyId: selectedCompanyId ?? 0,
      code: ucap.code,
      description: ucap.description,
      roundedValue: ucap.value,
      initialIpp: ucap.initialIpp,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) return setFormError('El código es obligatorio');
    if (!form.description.trim()) return setFormError('La descripción es obligatoria');
    if (form.roundedValue <= 0) return setFormError('El valor unitario debe ser mayor a 0');
    if (form.initialIpp <= 0) return setFormError('El IPP inicial debe ser mayor a 0');

    setSaving(true);
    setFormError(null);
    try {
      if (editingUcap) {
        const payload: UpdateUcapPayload = {
          code: form.code,
          description: form.description,
          roundedValue: form.roundedValue,
          initialIpp: form.initialIpp,
        };
        await surveysService.updateUcap(editingUcap.ucapId, payload);
        toast.success('UCAP actualizada correctamente');
      } else {
        if (!form.companyId) return setFormError('Selecciona una empresa');
        await surveysService.createUcap(form);
        toast.success('UCAP creada correctamente');
      }
      setShowModal(false);
      await reloadUcaps();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg[0] : msg || (editingUcap ? 'Error al actualizar la UCAP' : 'Error al crear la UCAP'));
    } finally {
      setSaving(false);
    }
  };

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard/levantamiento-obras')}
            className="hover:bg-[hsl(var(--canalco-neutral-200))]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
              Gestión de UCAPs
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Unidades de Costo por Área de Presupuesto
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Selector de empresa */}
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
            Selecciona un municipio / empresa
          </label>
          {loadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
            </div>
          ) : (
            <Select
              value={selectedCompanyId ? String(selectedCompanyId) : ''}
              onValueChange={(val) => setSelectedCompanyId(Number(val))}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="— Selecciona una empresa —" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.companyId} value={String(c.companyId)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Error global */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Lista de UCAPs */}
        {selectedCompanyId && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            {/* Barra de herramientas */}
            <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))] flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  UCAPs — {selectedCompany?.name}
                </h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  {ucaps.length} {ucaps.length === 1 ? 'registro' : 'registros'} en total
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                  <Input
                    placeholder="Buscar por código o descripción..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5">
                      <X className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                    </button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={openCreateModal}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nueva UCAP
                </Button>
              </div>
            </div>

            {/* Tabla */}
            {loadingUcaps ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                      <TableHead className="font-semibold">Código</TableHead>
                      <TableHead className="font-semibold">Descripción</TableHead>
                      <TableHead className="font-semibold text-right">Valor Unitario</TableHead>
                      <TableHead className="font-semibold text-right">IPP Inicial</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUcaps.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-[hsl(var(--canalco-neutral-600))]">
                          {search ? 'No se encontraron UCAPs con ese criterio.' : 'No hay UCAPs registradas para esta empresa.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUcaps.map((ucap) => (
                        <TableRow key={ucap.ucapId} className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors">
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs bg-orange-50 text-orange-700 border-orange-200">
                              {ucap.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{ucap.description}</TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            ${ucap.value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {ucap.initialIpp.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-primary))]"
                              onClick={() => openEditModal(ucap)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Placeholder cuando no hay empresa seleccionada */}
        {!selectedCompanyId && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-lg font-medium">Selecciona una empresa para ver sus UCAPs</p>
            <p className="text-sm mt-1">Usa el selector de arriba para elegir el municipio</p>
          </div>
        )}
      </main>

      {/* Modal Crear / Editar UCAP */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUcap ? `Editar UCAP — ${editingUcap.code}` : 'Nueva UCAP'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Empresa (solo visible en modo crear) */}
            {!editingUcap && (
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                  Empresa <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.companyId ? String(form.companyId) : ''}
                  onValueChange={(val) => setForm((f) => ({ ...f, companyId: Number(val) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Selecciona empresa —" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.companyId} value={String(c.companyId)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Código */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                Código <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Ej: AP-001"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                Descripción <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Descripción de la UCAP"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Valor unitario e IPP en dos columnas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                  Valor unitario <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.roundedValue || ''}
                  onChange={(e) => setForm((f) => ({ ...f, roundedValue: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">
                  IPP inicial <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.initialIpp || ''}
                  onChange={(e) => setForm((f) => ({ ...f, initialIpp: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Guardando...</>
                : editingUcap ? 'Guardar cambios' : 'Crear UCAP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
