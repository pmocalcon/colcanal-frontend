import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  materialsService,
  type MaterialGroup,
  type CreateMaterialGroupDto,
  isFuzzyMatchError,
  type SimilarSuggestion,
} from '@/services/materials.service';

export default function GruposMaterialesPage() {
  const navigate = useNavigate();

  // Estados principales
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de búsqueda
  const [searchTerm, setSearchTerm] = useState('');

  // Estados del modal de crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MaterialGroup | null>(null);
  const [formData, setFormData] = useState<CreateMaterialGroupDto>({ name: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados del modal de sugerencias (fuzzy matching)
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestions, setSuggestions] = useState<SimilarSuggestion[]>([]);
  const [suggestionHint, setSuggestionHint] = useState('');

  // Estados del modal de confirmación de eliminación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<MaterialGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Cargar grupos al montar
  useEffect(() => {
    loadGroups();
  }, []);

  // Filtrar grupos cuando cambia el término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredGroups(groups);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredGroups(
        groups.filter((g) => g.name.toLowerCase().includes(term))
      );
    }
  }, [searchTerm, groups]);

  // Limpiar mensaje de éxito después de 3 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await materialsService.getGroups();
      // Validar que sea un array
      const groupsArray = Array.isArray(data) ? data : [];
      setGroups(groupsArray);
      setFilteredGroups(groupsArray);
    } catch (err: any) {
      console.error('Error loading groups:', err);
      setError('Error al cargar los grupos de materiales');
      setGroups([]);
      setFilteredGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingGroup(null);
    setFormData({ name: '' });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (group: MaterialGroup) => {
    setEditingGroup(group);
    setFormData({ name: group.name, categoryId: group.categoryId });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGroup(null);
    setFormData({ name: '' });
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      if (editingGroup) {
        await materialsService.updateGroup(editingGroup.groupId, formData);
        setSuccessMessage('Grupo actualizado correctamente');
      } else {
        await materialsService.createGroup(formData);
        setSuccessMessage('Grupo creado correctamente');
      }

      handleCloseModal();
      await loadGroups();
    } catch (err: any) {
      console.error('Error saving group:', err);

      // Verificar si es error de fuzzy matching (409)
      if (isFuzzyMatchError(err)) {
        const { message, suggestions: sug, hint } = err.response.data;
        setSuggestions(sug);
        setSuggestionHint(hint);
        setShowSuggestionsModal(true);
        setFormError(message);
      } else {
        setFormError(err.response?.data?.message || 'Error al guardar el grupo');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SimilarSuggestion) => {
    // Cerrar modales y mostrar mensaje
    setShowSuggestionsModal(false);
    handleCloseModal();
    setSuccessMessage(`Grupo "${suggestion.name}" ya existe. No se creó duplicado.`);
  };

  const handleConfirmCreate = async () => {
    // El usuario quiere crear de todos modos
    // Nota: Si el backend requiere un flag "force: true", agregarlo aquí
    setShowSuggestionsModal(false);
    // Por ahora solo cerramos el modal de sugerencias
    // El usuario puede modificar el nombre y reintentar
  };

  const handleOpenDeleteModal = (group: MaterialGroup) => {
    setDeletingGroup(group);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;

    try {
      setDeleteLoading(true);
      await materialsService.deleteGroup(deletingGroup.groupId);
      setSuccessMessage('Grupo eliminado correctamente');
      setShowDeleteModal(false);
      setDeletingGroup(null);
      await loadGroups();
    } catch (err: any) {
      console.error('Error deleting group:', err);
      setError(err.response?.data?.message || 'Error al eliminar el grupo. Puede que tenga materiales asociados.');
      setShowDeleteModal(false);
      setDeletingGroup(null);
    } finally {
      setDeleteLoading(false);
    }
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
                  Grupos de Materiales
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Administración de grupos para organizar materiales
                </p>
              </div>
            </div>

            <Button
              onClick={handleOpenCreateModal}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Grupo
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

        {/* Búsqueda */}
        <Card className="mb-6 p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
              <Input
                placeholder="Buscar grupos por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              {filteredGroups.length} grupos
            </span>
          </div>
        </Card>

        {/* Tabla */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
              <span className="ml-2 text-[hsl(var(--canalco-neutral-600))]">Cargando grupos...</span>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[hsl(var(--canalco-neutral-600))]">
                {searchTerm ? 'No se encontraron grupos con ese nombre' : 'No hay grupos de materiales registrados'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-32 text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <TableRow key={group.groupId}>
                    <TableCell className="font-mono text-sm">{group.groupId}</TableCell>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditModal(group)}
                          className="hover:bg-blue-100 hover:text-blue-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDeleteModal(group)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? 'Editar Grupo' : 'Nuevo Grupo de Materiales'}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? 'Modifica el nombre del grupo de materiales'
                : 'Ingresa el nombre para el nuevo grupo. Se guardará en mayúsculas automáticamente.'}
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
              <Label htmlFor="groupName">Nombre del Grupo *</Label>
              <Input
                id="groupName"
                placeholder="Ej: LUMINARIAS, CABLES, TUBERIA..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="uppercase"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={formLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={formLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingGroup ? 'Guardar Cambios' : 'Crear Grupo'}
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
              Se encontraron grupos similares
            </DialogTitle>
            <DialogDescription>
              {suggestionHint}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mb-3">
              ¿Quisiste decir alguno de estos grupos existentes?
            </p>
            <div className="space-y-2">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSuggestion(sug)}
                  className="w-full p-3 text-left border rounded-lg hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors"
                >
                  <span className="font-medium">{sug.name}</span>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestionsModal(false)}>
              Modificar nombre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación de Eliminación */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Grupo</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el grupo "{deletingGroup?.name}"?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-amber-500 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              Solo se puede eliminar un grupo si no tiene materiales asociados.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
