import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Package,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  materialsService,
  type Material,
  type MaterialGroup,
  type CreateMaterialDto,
  isFuzzyMatchError,
  type SimilarSuggestion,
} from '@/services/materials.service';

export default function MaterialesListPage() {
  const navigate = useNavigate();

  // Estados principales
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroupId, setFilterGroupId] = useState<string>('');

  // Estados del modal de crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [formData, setFormData] = useState<CreateMaterialDto>({
    code: '',
    description: '',
    groupId: 0,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados del modal de sugerencias (fuzzy matching)
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestions, setSuggestions] = useState<SimilarSuggestion[]>([]);
  const [suggestionHint, setSuggestionHint] = useState('');
  const [pendingFormData, setPendingFormData] = useState<CreateMaterialDto | null>(null);

  // Estados del modal de confirmación de eliminación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Cargar datos al montar
  useEffect(() => {
    loadData();
  }, []);

  // Filtrar materiales cuando cambian los filtros
  useEffect(() => {
    let filtered = materials;

    // Filtrar por término de búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.code.toLowerCase().includes(term) ||
          m.description.toLowerCase().includes(term)
      );
    }

    // Filtrar por grupo
    if (filterGroupId && filterGroupId !== 'all') {
      filtered = filtered.filter((m) => m.groupId === parseInt(filterGroupId));
    }

    setFilteredMaterials(filtered);
  }, [searchTerm, filterGroupId, materials]);

  // Limpiar mensaje de éxito después de 3 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [materialsData, groupsData] = await Promise.all([
        materialsService.getMaterials(),
        materialsService.getGroups(),
      ]);
      setMaterials(materialsData);
      setFilteredMaterials(materialsData);
      setGroups(groupsData);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingMaterial(null);
    setFormData({ code: '', description: '', groupId: groups[0]?.groupId || 0 });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      code: material.code,
      description: material.description,
      groupId: material.groupId,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingMaterial(null);
    setFormData({ code: '', description: '', groupId: 0 });
    setFormError(null);
  };

  const handleSubmit = async (force: boolean = false) => {
    if (!formData.code.trim()) {
      setFormError('El código es obligatorio');
      return;
    }
    if (!formData.description.trim()) {
      setFormError('La descripción es obligatoria');
      return;
    }
    if (!formData.groupId) {
      setFormError('Debe seleccionar un grupo');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      const dataToSend = { ...formData, force };

      if (editingMaterial) {
        await materialsService.updateMaterial(editingMaterial.materialId, {
          code: formData.code,
          description: formData.description,
          groupId: formData.groupId,
        });
        setSuccessMessage('Material actualizado correctamente');
      } else {
        await materialsService.createMaterial(dataToSend);
        setSuccessMessage('Material creado correctamente');
      }

      handleCloseModal();
      setShowSuggestionsModal(false);
      setPendingFormData(null);
      await loadData();
    } catch (err: any) {
      console.error('Error saving material:', err);

      // Verificar si es error de fuzzy matching (409)
      if (isFuzzyMatchError(err)) {
        const { message, suggestions: sug, hint } = err.response.data;
        setSuggestions(sug);
        setSuggestionHint(hint);
        setPendingFormData(formData);
        setShowSuggestionsModal(true);
        setFormError(message);
      } else {
        setFormError(err.response?.data?.message || 'Error al guardar el material');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SimilarSuggestion) => {
    // El usuario seleccionó un material existente
    setShowSuggestionsModal(false);
    handleCloseModal();
    setPendingFormData(null);
    setSuccessMessage(
      `Material "${suggestion.code} - ${suggestion.description}" ya existe. No se creó duplicado.`
    );
  };

  const handleForceCreate = async () => {
    // El usuario quiere crear de todos modos
    if (pendingFormData) {
      setShowSuggestionsModal(false);
      await handleSubmit(true);
    }
  };

  const handleOpenDeleteModal = (material: Material) => {
    setDeletingMaterial(material);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingMaterial) return;

    try {
      setDeleteLoading(true);
      await materialsService.deleteMaterial(deletingMaterial.materialId);
      setSuccessMessage('Material eliminado correctamente');
      setShowDeleteModal(false);
      setDeletingMaterial(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting material:', err);
      setError(err.response?.data?.message || 'Error al eliminar el material');
      setShowDeleteModal(false);
      setDeletingMaterial(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const getGroupName = (groupId: number): string => {
    const group = groups.find((g) => g.groupId === groupId);
    return group?.name || 'Sin grupo';
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterGroupId('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                src="/assets/images/logo-canalco.png"
                alt="Canales Contactos"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center gap-4 flex-grow">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/materiales')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  Catálogo de Materiales
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Administración del catálogo de materiales del sistema
                </p>
              </div>
            </div>

            <Button
              onClick={handleOpenCreateModal}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
              disabled={groups.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Material
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Mensajes */}
        {successMessage && (
          <Alert className="mb-6 border-green-500 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Éxito</AlertTitle>
            <AlertDescription className="text-green-700">{successMessage}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-6 border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Error</AlertTitle>
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {groups.length === 0 && !loading && (
          <Alert className="mb-6 border-amber-500 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Sin grupos</AlertTitle>
            <AlertDescription className="text-amber-700">
              Debes crear al menos un grupo de materiales antes de poder agregar materiales.{' '}
              <button
                onClick={() => navigate('/dashboard/materiales/grupos')}
                className="underline font-medium hover:text-amber-900"
              >
                Ir a Grupos de Materiales
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Filtros */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
              <Input
                placeholder="Buscar por código o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                <Select value={filterGroupId} onValueChange={setFilterGroupId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todos los grupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los grupos</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.groupId} value={group.groupId.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(searchTerm || filterGroupId) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>

            <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              {filteredMaterials.length} materiales
            </span>
          </div>
        </Card>

        {/* Tabla */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
              <span className="ml-2 text-[hsl(var(--canalco-neutral-600))]">Cargando materiales...</span>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
              <p className="text-[hsl(var(--canalco-neutral-600))]">
                {searchTerm || filterGroupId
                  ? 'No se encontraron materiales con los filtros aplicados'
                  : 'No hay materiales registrados'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-48">Grupo</TableHead>
                  <TableHead className="w-32 text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map((material) => (
                  <TableRow key={material.materialId}>
                    <TableCell className="font-mono text-sm font-medium">
                      {material.code}
                    </TableCell>
                    <TableCell>{material.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {material.materialGroup?.name || getGroupName(material.groupId)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditModal(material)}
                          className="hover:bg-blue-100 hover:text-blue-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDeleteModal(material)}
                          className="hover:bg-red-100 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? 'Editar Material' : 'Nuevo Material'}
            </DialogTitle>
            <DialogDescription>
              {editingMaterial
                ? 'Modifica los datos del material'
                : 'Ingresa los datos del nuevo material. El código y descripción se guardarán en mayúsculas automáticamente.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <Alert className="border-amber-500 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700">{formError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="materialCode">Código *</Label>
              <Input
                id="materialCode"
                placeholder="Ej: 4001, MAT-001..."
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialDescription">Descripción *</Label>
              <Input
                id="materialDescription"
                placeholder="Ej: LUMINARIA LED 28W PANEL 60X60..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialGroup">Grupo *</Label>
              <Select
                value={formData.groupId?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, groupId: parseInt(value) })}
              >
                <SelectTrigger id="materialGroup">
                  <SelectValue placeholder="Selecciona un grupo" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.groupId} value={group.groupId.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={formLoading}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              disabled={formLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMaterial ? 'Guardar Cambios' : 'Crear Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Sugerencias (Fuzzy Matching) */}
      <Dialog open={showSuggestionsModal} onOpenChange={setShowSuggestionsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Se encontraron materiales similares
            </DialogTitle>
            <DialogDescription>{suggestionHint}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mb-3">
              ¿Quisiste decir alguno de estos materiales existentes?
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSuggestion(sug)}
                  className="w-full p-3 text-left border rounded-lg hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-[hsl(var(--canalco-primary))]">
                      {sug.code}
                    </span>
                    <span className="text-[hsl(var(--canalco-neutral-400))]">-</span>
                    <span className="font-medium">{sug.description}</span>
                  </div>
                  {sug.group && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {sug.group}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowSuggestionsModal(false);
                setPendingFormData(null);
              }}
              className="w-full sm:w-auto"
            >
              Modificar datos
            </Button>
            <Button
              onClick={handleForceCreate}
              disabled={formLoading}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crear de todos modos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación de Eliminación */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Material</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el material "{deletingMaterial?.code} -{' '}
              {deletingMaterial?.description}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
