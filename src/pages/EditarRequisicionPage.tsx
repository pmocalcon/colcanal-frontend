import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader2, Save, XCircle } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  requisitionsService,
  type Requisition,
  type CreateRequisitionItemDto,
  type ItemApprovalResponse,
} from '@/services/requisitions.service';
import {
  masterDataService,
  type Company,
  type Project,
  type OperationCenter,
  type ProjectCode,
  type Material,
} from '@/services/master-data.service';
import { formatDateShort } from '@/utils/dateUtils';

interface ItemForm {
  tempId: string;
  itemId?: number; // Si existe, es un ítem existente
  materialId: number;
  quantity: number;
  observation: string;
}

const EditarRequisicionPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const requisitionId = parseInt(id || '0');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Requisición original
  const [originalRequisition, setOriginalRequisition] = useState<Requisition | null>(null);

  // Aprobaciones de ítems (para mostrar rechazos)
  const [itemApprovals, setItemApprovals] = useState<ItemApprovalResponse[]>([]);

  // Master data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [operationCenters, setOperationCenters] = useState<OperationCenter[]>([]);
  const [projectCodes, setProjectCodes] = useState<ProjectCode[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Form data
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [obra, setObra] = useState('');
  const [codigoObra, setCodigoObra] = useState('');
  const [priority, setPriority] = useState<'alta' | 'normal'>('normal');
  const [items, setItems] = useState<ItemForm[]>([]);

  // Material search
  const [materialSearch, setMaterialSearch] = useState('');

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, [requisitionId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar requisición
      const requisition = await requisitionsService.getRequisitionById(requisitionId);

      console.log('Requisition loaded:', requisition);

      // Validar que se pueda editar
      // Estados editables: pendiente, rechazada_validador, rechazada_revisor, rechazada_autorizador, rechazada_gerencia
      const EDITABLE_STATUSES = ['pendiente', 'rechazada_validador', 'rechazada_revisor', 'rechazada_autorizador', 'rechazada_gerencia'];
      const currentStatusCode = requisition.status?.code || '';

      if (!EDITABLE_STATUSES.includes(currentStatusCode)) {
        setError(
          `Esta requisición no puede ser editada porque su estado es: ${
            requisition.status?.name || currentStatusCode
          }`
        );
        return;
      }

      setOriginalRequisition(requisition);

      // Determinar nivel de aprobación para cargar rechazos
      let approvalLevel: 'reviewer' | 'authorizer' | 'management' | undefined;
      if (currentStatusCode === 'rechazada_revisor') {
        approvalLevel = 'reviewer';
      } else if (currentStatusCode === 'rechazada_autorizador') {
        approvalLevel = 'authorizer';
      } else if (currentStatusCode === 'rechazada_gerencia') {
        approvalLevel = 'management';
      }

      // Cargar master data en paralelo y aprobaciones de ítems si existe nivel
      const [companiesData, materialsData, itemApprovalsData] = await Promise.all([
        masterDataService.getCompanies(),
        masterDataService.getMaterials(),
        approvalLevel
          ? requisitionsService.getItemApprovals(requisitionId, approvalLevel)
          : Promise.resolve([]),
      ]);

      setItemApprovals(itemApprovalsData);

      setCompanies(companiesData);
      setMaterials(materialsData);

      // Cargar proyectos para la empresa seleccionada
      const projectsData = await masterDataService.getProjects(requisition.companyId);
      setProjects(projectsData);

      // Cargar centros de operación y códigos de proyecto
      const [operationCentersData, projectCodesData] = await Promise.all([
        masterDataService.getOperationCenters({
          companyId: requisition.companyId,
          projectId: requisition.projectId
        }),
        requisition.projectId
          ? masterDataService.getProjectCodes({ projectId: requisition.projectId })
          : Promise.resolve([]),
      ]);

      setOperationCenters(operationCentersData);
      setProjectCodes(projectCodesData);

      // Establecer valores del formulario
      setSelectedCompanyId(requisition.companyId);
      setSelectedProjectId(requisition.projectId || null);
      setObra(requisition.obra || '');
      setCodigoObra(requisition.codigoObra || '');
      setPriority(requisition.priority || 'normal');

      // Convertir ítems existentes al formato del formulario
      const formItems: ItemForm[] = requisition.items.map((item) => ({
        tempId: `existing-${item.itemId}`,
        itemId: item.itemId,
        materialId: item.materialId,
        quantity: item.quantity,
        observation: item.observation || '',
      }));

      setItems(formItems);
    } catch (err: any) {
      console.error('Error loading requisition:', err);
      setError(err.response?.data?.message || 'Error al cargar la requisición');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar materiales
  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return [];

    const search = materialSearch.toLowerCase();
    return materials.filter(
      (m) =>
        m.code.toLowerCase().includes(search) ||
        m.description.toLowerCase().includes(search) ||
        m.materialGroup?.name?.toLowerCase().includes(search)
    );
  }, [materialSearch, materials]);

  // Obtener rechazo de un ítem específico
  const getItemRejection = (itemId: number) => {
    if (!originalRequisition) return null;

    const originalItem = originalRequisition.items.find((item) => item.itemId === itemId);
    if (!originalItem) return null;

    // Buscar rechazo por itemNumber y materialId
    const rejection = itemApprovals.find(
      (approval) =>
        approval.itemNumber === originalItem.itemNumber &&
        approval.materialId === originalItem.materialId &&
        approval.status === 'rejected' &&
        approval.isValid
    );

    return rejection;
  };

  // Agregar ítem
  const handleAddItem = (materialId: number) => {
    const newItem: ItemForm = {
      tempId: `new-${Date.now()}`,
      materialId,
      quantity: 1,
      observation: '',
    };
    setItems([...items, newItem]);
    setMaterialSearch('');
  };

  // Actualizar cantidad
  const handleUpdateQuantity = (tempId: string, quantity: number) => {
    setItems(items.map((item) =>
      item.tempId === tempId ? { ...item, quantity } : item
    ));
  };

  // Actualizar observación
  const handleUpdateObservation = (tempId: string, observation: string) => {
    setItems(items.map((item) =>
      item.tempId === tempId ? { ...item, observation } : item
    ));
  };

  // Eliminar ítem
  const handleRemoveItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  // Obtener material por ID
  const getMaterialById = (materialId: number) => {
    return materials.find((m) => m.materialId === materialId);
  };

  // Guardar cambios
  const handleSave = async () => {
    try {
      // Validaciones
      if (items.length === 0) {
        setError('Debes agregar al menos un material');
        return;
      }

      const invalidItems = items.filter((item) => item.quantity <= 0);
      if (invalidItems.length > 0) {
        setError('Todos los ítems deben tener cantidad mayor a 0');
        return;
      }

      setSaving(true);
      setError(null);

      // Preparar datos para el backend
      const itemsDto: CreateRequisitionItemDto[] = items.map((item) => ({
        materialId: item.materialId,
        quantity: item.quantity,
        observation: item.observation || undefined,
      }));

      const updateData = {
        companyId: selectedCompanyId!,
        projectId: selectedProjectId || undefined,
        obra: obra || undefined,
        codigoObra: codigoObra || undefined,
        priority,
        items: itemsDto,
      };

      await requisitionsService.updateRequisition(requisitionId, updateData);

      alert('Requisición actualizada exitosamente');
      navigate('/dashboard/compras/requisiciones');
    } catch (err: any) {
      console.error('Error updating requisition:', err);
      setError(err.response?.data?.message || 'Error al actualizar la requisición');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  if (error && !originalRequisition) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/compras/requisiciones')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Error
              </h1>
            </div>
          </div>
        </header>
        <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
          <ErrorMessage message={error} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo 1 + Back Button */}
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/compras/requisiciones')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Editar Requisición {originalRequisition?.requisitionNumber}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Modifica los ítems de tu requisición
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}

        {/* Info Card */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Información de la Requisición</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Empresa</Label>
              <p className="font-medium">{originalRequisition?.company.name}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Proyecto</Label>
              <p className="font-medium">{originalRequisition?.project?.name || 'N/A'}</p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Estado</Label>
              <p className="font-medium">
                {originalRequisition?.status?.name || 'N/A'}
              </p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Creada</Label>
              <p className="font-medium">
                {originalRequisition?.createdAt
                  ? formatDateShort(originalRequisition.createdAt)
                  : 'N/A'}
              </p>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Prioridad</Label>
              <Select
                value={priority}
                onValueChange={(value: 'alta' | 'normal') => setPriority(value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccione prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta (Urgente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Obra</Label>
              <Select
                value={obra || 'none'}
                onValueChange={(value) => setObra(value === 'none' ? '' : value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccione tipo de obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  <SelectItem value="Modernización">Modernización</SelectItem>
                  <SelectItem value="Expansión">Expansión</SelectItem>
                  <SelectItem value="Operación y mantenimiento">Operación y mantenimiento</SelectItem>
                  <SelectItem value="Inversión">Inversión</SelectItem>
                  <SelectItem value="Donación">Donación</SelectItem>
                  <SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[hsl(var(--canalco-neutral-500))]">Código de Obra</Label>
              <Input
                value={codigoObra}
                onChange={(e) => setCodigoObra(e.target.value)}
                placeholder="Ingrese el código de obra (opcional)"
                className="mt-1"
              />
            </div>
          </div>
        </Card>

        {/* Materiales Card */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Elementos Solicitados</h2>

          {/* Alerta de ítems rechazados */}
          {itemApprovals.some((a) => a.status === 'rejected' && a.isValid) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">
                    Esta requisición tiene ítems rechazados
                  </p>
                  <p className="text-sm text-red-800 mt-1">
                    Los ítems rechazados están marcados en rojo en la tabla. Revisa los comentarios de rechazo,
                    corrige los ítems o elimínalos para poder enviar la requisición nuevamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Búsqueda de materiales */}
          <div className="mb-6">
            <Label htmlFor="material-search">Agregar Elemento</Label>
            <Input
              id="material-search"
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              placeholder="Buscar por código, descripción o grupo..."
              className="w-full"
            />
            {materialSearch && (
              <div className="mt-2 border border-[hsl(var(--canalco-neutral-300))] rounded-lg max-h-60 overflow-y-auto bg-white shadow-lg">
                {filteredMaterials.length > 0 ? (
                  filteredMaterials.map((material) => (
                    <button
                      key={material.materialId}
                      type="button"
                      onClick={() => handleAddItem(material.materialId)}
                      className="w-full text-left px-4 py-3 hover:bg-[hsl(var(--canalco-neutral-100))] border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <p className="font-mono font-semibold text-sm text-[hsl(var(--canalco-primary))]">
                          {material.code}
                        </p>
                        <div className="flex-grow">
                          <p className="text-sm font-medium">{material.description}</p>
                          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                            {material.materialGroup?.name || 'Sin grupo'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                    No se encontraron elementos
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabla de ítems */}
          {items.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--canalco-neutral-500))]">
              <p>No hay elementos agregados</p>
              <p className="text-sm mt-1">Usa el buscador arriba para agregar elementos</p>
            </div>
          ) : (
            <div className="border border-[hsl(var(--canalco-neutral-200))] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="w-[120px]">Cantidad</TableHead>
                    <TableHead>Observación</TableHead>
                    <TableHead className="w-[80px] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const material = getMaterialById(item.materialId);
                    const rejection = item.itemId ? getItemRejection(item.itemId) : null;
                    return (
                      <React.Fragment key={item.tempId}>
                        <TableRow className={rejection ? 'border-b-0' : ''}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {material?.code || 'N/A'}
                          </TableCell>
                          <TableCell>{material?.description || 'N/A'}</TableCell>
                          <TableCell className="text-sm">
                            {material?.materialGroup?.name || 'Sin grupo'}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateQuantity(item.tempId, parseInt(e.target.value) || 1)
                              }
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={item.observation}
                              onChange={(e) =>
                                handleUpdateObservation(item.tempId, e.target.value)
                              }
                              placeholder="Opcional..."
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.tempId)}
                              className="hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {rejection && (
                          <TableRow className="bg-red-50 border-b">
                            <TableCell colSpan={7} className="py-3">
                              <div className="flex items-start gap-2">
                                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-grow">
                                  <p className="font-semibold text-red-900 text-sm">
                                    Ítem rechazado por {rejection.approvalLevel === 'reviewer' ? 'Director' : rejection.approvalLevel === 'authorizer' ? 'Autorizador' : 'Gerencia'}
                                  </p>
                                  {rejection.comments && (
                                    <p className="text-sm text-red-800 mt-1">
                                      <strong>Motivo:</strong> {rejection.comments}
                                    </p>
                                  )}
                                  <p className="text-xs text-red-700 mt-1">
                                    Corrige este ítem o elimínalo para poder enviar la requisición nuevamente.
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard/compras/requisiciones')}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-dark))]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EditarRequisicionPage;
