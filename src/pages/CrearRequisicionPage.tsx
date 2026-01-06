import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { masterDataService } from '@/services/master-data.service';
import { requisitionsService } from '@/services/requisitions.service';
import type {
  Company,
  Project,
  Material,
  MaterialGroup,
  OperationCenter,
  ProjectCode,
} from '@/services/master-data.service';
import type { CreateRequisitionItemDto } from '@/services/requisitions.service';
import { Button } from '@/components/ui/button';
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
import { Home, Menu, Save, Plus, Trash2, CheckCircle, ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';

interface RequisitionItem extends CreateRequisitionItemDto {
  tempId: string; // Temporary ID for React key
  material?: Material; // Material details for display
}

export default function CrearRequisicionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Master data state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [operationCenters, setOperationCenters] = useState<OperationCenter[]>([]);
  const [projectCodes, setProjectCodes] = useState<ProjectCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Form state
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [obra, setObra] = useState('');
  const [codigoObra, setCodigoObra] = useState('');
  const [priority, setPriority] = useState<'alta' | 'normal'>('normal');
  const [items, setItems] = useState<RequisitionItem[]>([]);

  // Success/Error state
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRequisitionNumber, setCreatedRequisitionNumber] = useState<string | null>(null);

  // Material filter state
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');

  // Load master data on mount
  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors

      // Load companies (required)
      const companiesData = await masterDataService.getCompanies();
      console.log('✅ Companies loaded:', companiesData?.length || 0);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);

      // Load all material groups
      const groupsData = await masterDataService.getMaterialGroups();
      console.log('✅ Material groups loaded:', groupsData?.length || 0);
      setMaterialGroups(Array.isArray(groupsData) ? groupsData : []);
    } catch (err: any) {
      console.error('❌ Error loading master data:', err);
      console.error('Error details:', err.response?.data || err.message);
      const errorMessage = err.response?.status === 401
        ? 'No estás autenticado. Por favor inicia sesión nuevamente.'
        : 'Error al cargar los datos maestros. Por favor intenta de nuevo.';
      setError(errorMessage);
      // Ensure arrays even on error
      setCompanies([]);
      setMaterialGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // Load projects when company changes
  useEffect(() => {
    if (companyId) {
      loadProjects();
      loadOperationCenters();
      loadProjectCodes();
    } else {
      setProjects([]);
      setProjectId(null);
      setOperationCenters([]);
      setProjectCodes([]);
    }
  }, [companyId]);

  // Load operation centers and project codes when project changes
  useEffect(() => {
    if (projectId) {
      loadOperationCenters();
      loadProjectCodes();
    }
  }, [projectId]);

  // Load materials when group changes
  useEffect(() => {
    if (selectedGroupId) {
      loadMaterials(selectedGroupId);
    } else {
      // If no group selected, load all materials
      loadMaterials();
    }
  }, [selectedGroupId]);

  const loadProjects = async () => {
    if (!companyId) return;
    try {
      const projectsData = await masterDataService.getProjects(companyId);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setProjects([]);
    }
  };

  const loadOperationCenters = async () => {
    if (!companyId) return;
    try {
      const centers = await masterDataService.getOperationCenters({
        companyId,
        projectId: projectId || undefined,
      });
      setOperationCenters(Array.isArray(centers) ? centers : []);
    } catch (err) {
      console.error('Error loading operation centers:', err);
      setOperationCenters([]);
    }
  };

  const loadProjectCodes = async () => {
    if (!companyId) return;
    try {
      const codes = await masterDataService.getProjectCodes({
        companyId,
        projectId: projectId || undefined,
      });
      setProjectCodes(Array.isArray(codes) ? codes : []);
    } catch (err) {
      console.error('Error loading project codes:', err);
      setProjectCodes([]);
    }
  };

  const loadMaterials = async (groupId?: number) => {
    try {
      const materialsData = await masterDataService.getMaterials(groupId);
      setMaterials(Array.isArray(materialsData) ? materialsData : []);
    } catch (err) {
      console.error('Error loading materials:', err);
      setMaterials([]);
    }
  };

  // Check if company is "Canales & Contactos"
  const isCanalesContactos = useMemo(() => {
    if (!Array.isArray(companies) || !companyId) return false;
    const company = companies.find((c) => c.companyId === companyId);
    return company?.name === 'Canales & Contactos';
  }, [companyId, companies]);

  // Get operation center (automatically determined)
  const selectedOperationCenter = useMemo(() => {
    if (!companyId || !Array.isArray(operationCenters)) return null;
    if (projectId) {
      return operationCenters.find((oc) => oc.projectId === projectId) || null;
    }
    return operationCenters.find((oc) => oc.companyId === companyId && !oc.projectId) || null;
  }, [companyId, projectId, operationCenters]);

  // Get project code (automatically determined)
  const selectedProjectCode = useMemo(() => {
    if (!companyId || !Array.isArray(projectCodes)) return null;
    if (projectId) {
      return projectCodes.find((pc) => pc.projectId === projectId) || null;
    }
    return projectCodes.find((pc) => pc.companyId === companyId && !pc.projectId) || null;
  }, [companyId, projectId, projectCodes]);

  // Filter materials by search term
  const filteredMaterials = useMemo(() => {
    if (!Array.isArray(materials)) return [];
    if (!materialSearch) return materials;
    const search = materialSearch.toLowerCase();
    return materials.filter(
      (m) =>
        m.code?.toLowerCase().includes(search) ||
        m.description?.toLowerCase().includes(search) ||
        m.materialGroup?.name?.toLowerCase().includes(search)
    );
  }, [materials, materialSearch]);

  // Add item to table
  const handleAddItem = (materialId: number) => {
    if (!Array.isArray(materials)) return;

    const material = materials.find((m) => m.materialId === materialId);
    if (!material) return;

    // Check if item already exists
    if (items.some((item) => item.materialId === materialId)) {
      alert('Este material ya fue agregado a la requisición');
      return;
    }

    const newItem: RequisitionItem = {
      tempId: `temp-${Date.now()}`,
      materialId,
      quantity: 0, // Inicia en 0 para mostrar placeholder
      observation: '',
      material,
    };

    setItems([...items, newItem]);
    setMaterialSearch('');
  };

  // Remove item from table
  const handleRemoveItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  // Update item quantity
  const handleUpdateQuantity = (tempId: string, quantity: number) => {
    setItems(
      items.map((item) =>
        item.tempId === tempId ? { ...item, quantity } : item
      )
    );
  };

  // Update item observation
  const handleUpdateObservation = (tempId: string, observation: string) => {
    setItems(
      items.map((item) =>
        item.tempId === tempId ? { ...item, observation } : item
      )
    );
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!companyId) {
      alert('Debe seleccionar una empresa');
      return false;
    }

    if (isCanalesContactos && !projectId) {
      alert('Debe seleccionar un proyecto para Canales & Contactos');
      return false;
    }

    if (items.length === 0) {
      alert('Debe agregar al menos un material a la requisición');
      return false;
    }

    for (const item of items) {
      if (item.quantity < 1) {
        alert('La cantidad de todos los ítems debe ser al menos 1');
        return false;
      }
    }

    return true;
  };

  // Submit form
  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);
      setError(null);

      const requisitionData = {
        companyId: companyId!,
        projectId: projectId || undefined,
        obra: obra || undefined,
        codigoObra: codigoObra || undefined,
        priority,
        items: items.map(({ materialId, quantity, observation }) => ({
          materialId,
          quantity,
          observation: observation || undefined,
        })),
      };

      const createdRequisition = await requisitionsService.createRequisition(requisitionData);

      setSuccess(true);
      setCreatedRequisitionNumber(createdRequisition.requisitionNumber);

      // Reset form
      setCompanyId(null);
      setProjectId(null);
      setObra('');
      setCodigoObra('');
      setPriority('normal');
      setItems([]);
      setMaterialSearch('');

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess(false);
        setCreatedRequisitionNumber(null);
      }, 5000);
    } catch (err: any) {
      console.error('Error creating requisition:', err);
      setError(err.response?.data?.message || 'Error al crear la requisición');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo 1 */}
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Home Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>

              {/* Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>

              {/* Back Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/compras/requisiciones')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Requisiciones"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Gestión de Compras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Nueva Requisición
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
              Módulo de Compras
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/compras/requisiciones');
                  setSidebarOpen(false);
                }}
              >
                Requisiciones
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Success Message */}
        {success && createdRequisitionNumber && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-green-800 font-semibold">¡Requisición creada exitosamente!</p>
              <p className="text-green-700 text-sm">
                Número de requisición: <span className="font-mono font-bold">{createdRequisitionNumber}</span>
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}

        {/* Form */}
        <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-6">
          <h2 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-6">
            Formulario de Requisición
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grid for form fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fecha */}
                <div>
                  <Label htmlFor="fecha">Fecha</Label>
                  <Input
                    id="fecha"
                    type="date"
                    value={new Date().toISOString().split('T')[0]}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>

                {/* Empresa */}
                <div>
                  <Label htmlFor="empresa">
                    Empresa <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={companyId?.toString() || ''}
                    onValueChange={(value) => setCompanyId(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(companies) && companies.map((company) => (
                        <SelectItem key={company.companyId} value={company.companyId.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Proyecto (only for Canales & Contactos) */}
                <div>
                  <Label htmlFor="proyecto">
                    Proyecto {isCanalesContactos && <span className="text-red-500">*</span>}
                  </Label>
                  <Select
                    value={projectId?.toString() || ''}
                    onValueChange={(value) => setProjectId(parseInt(value))}
                    disabled={!isCanalesContactos}
                  >
                    <SelectTrigger className={!isCanalesContactos ? 'bg-gray-50' : ''}>
                      <SelectValue placeholder={isCanalesContactos ? 'Seleccione un proyecto' : 'No aplica'} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(projects) && projects.map((project) => (
                        <SelectItem key={project.projectId} value={project.projectId.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Centro de operación (auto-calculated) */}
                <div>
                  <Label htmlFor="centro">Centro de operación</Label>
                  <Input
                    id="centro"
                    value={selectedOperationCenter?.code || 'No disponible'}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>

                {/* Código de proyecto (auto-calculated) */}
                <div>
                  <Label htmlFor="codigo-proyecto">Código de proyecto</Label>
                  <Input
                    id="codigo-proyecto"
                    value={selectedProjectCode?.code || 'No disponible'}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>

                {/* Obra (optional) */}
                <div>
                  <Label htmlFor="obra">Obra</Label>
                  <Select
                    value={obra || 'none'}
                    onValueChange={(value) => setObra(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger id="obra">
                      <SelectValue placeholder="Seleccione tipo de obra (opcional)" />
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

                {/* Código de obra (optional) */}
                <div>
                  <Label htmlFor="codigo-obra">Código de obra</Label>
                  <Input
                    id="codigo-obra"
                    value={codigoObra}
                    onChange={(e) => setCodigoObra(e.target.value)}
                    placeholder="Ingrese el código de obra (opcional)"
                  />
                </div>

                {/* Prioridad */}
                <div>
                  <Label htmlFor="prioridad">Prioridad</Label>
                  <Select
                    value={priority}
                    onValueChange={(value: 'alta' | 'normal') => setPriority(value)}
                  >
                    <SelectTrigger id="prioridad">
                      <SelectValue placeholder="Seleccione prioridad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta (Urgente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Solicitante (auto-filled) */}
              <div className="border-t border-[hsl(var(--canalco-neutral-300))] pt-6">
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
                  Información del Solicitante
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Nombre</Label>
                    <Input value={user?.nombre || ''} readOnly className="bg-gray-50" />
                  </div>
                  <div>
                    <Label>Cargo</Label>
                    <Input value={user?.nombreRol || ''} readOnly className="bg-gray-50" />
                  </div>
                </div>
              </div>

              {/* Items section */}
              <div className="border-t border-[hsl(var(--canalco-neutral-300))] pt-6">
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
                  Elementos Solicitados <span className="text-red-500">*</span>
                </h3>

                {/* Material selector with search */}
                <div className="mb-4">
                  <Label htmlFor="material-select">Seleccionar Elemento</Label>

                  {/* Filtro de Grupo */}
                  <div className="mb-3 mt-2">
                    <div className="max-w-md">
                      <Label htmlFor="group-select" className="text-xs">
                        Grupo (opcional)
                      </Label>
                      <Select
                        value={selectedGroupId?.toString() || 'all'}
                        onValueChange={(value) => setSelectedGroupId(value === 'all' ? null : parseInt(value))}
                      >
                        <SelectTrigger id="group-select" className="h-9">
                          <SelectValue placeholder="Todos los grupos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los grupos</SelectItem>
                          {materialGroups.map((group) => (
                            <SelectItem key={group.groupId} value={group.groupId.toString()}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="material-search-input" className="text-xs">
                      Buscar por código o descripción
                    </Label>
                    <Input
                      id="material-search-input"
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder="Escriba para buscar..."
                      className="w-full"
                    />
                    {materialSearch && (
                      <div className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg max-h-80 overflow-y-auto bg-white shadow-lg">
                        {filteredMaterials.length > 0 ? (
                          filteredMaterials.map((material) => (
                            <button
                              key={material.materialId}
                              type="button"
                              onClick={() => {
                                handleAddItem(material.materialId);
                                setMaterialSearch(''); // Clear search after adding
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))] last:border-b-0 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-20">
                                  <p className="font-mono font-semibold text-sm text-[hsl(var(--canalco-primary))]">
                                    {material.code}
                                  </p>
                                </div>
                                <div className="flex-grow">
                                  <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-900))]">
                                    {material.description}
                                  </p>
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                    Grupo: {material.materialGroup?.name || 'Sin grupo'}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                            <p>No se encontraron elementos</p>
                            <p className="text-xs mt-1">Intente con otros términos de búsqueda</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!materialSearch && materials.length > 0 && (
                      <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                        Escriba en el campo de búsqueda para ver los elementos disponibles ({materials.length} elemento{materials.length !== 1 ? 's' : ''})
                      </p>
                    )}
                  </div>
                </div>

                {/* Items table */}
                {items.length === 0 ? (
                  <div className="text-center py-12 text-[hsl(var(--canalco-neutral-600))] border border-dashed border-[hsl(var(--canalco-neutral-300))] rounded-lg">
                    <p>No hay elementos agregados. Use el buscador para agregar elementos.</p>
                  </div>
                ) : (
                  <div className="border border-[hsl(var(--canalco-neutral-300))] rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                          <TableHead className="font-semibold">Código</TableHead>
                          <TableHead className="font-semibold">Descripción</TableHead>
                          <TableHead className="font-semibold">Grupo</TableHead>
                          <TableHead className="font-semibold w-32">Cantidad</TableHead>
                          <TableHead className="font-semibold">Observación</TableHead>
                          <TableHead className="font-semibold w-20">Acción</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.tempId}>
                            <TableCell className="font-mono text-sm">{item.material?.code || 'N/A'}</TableCell>
                            <TableCell>{item.material?.description || 'N/A'}</TableCell>
                            <TableCell className="text-sm">{item.material?.materialGroup?.name || 'Sin grupo'}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity || ''}
                                onChange={(e) =>
                                  handleUpdateQuantity(item.tempId, parseInt(e.target.value) || 0)
                                }
                                placeholder="0"
                                className="w-full"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.observation || ''}
                                onChange={(e) => handleUpdateObservation(item.tempId, e.target.value)}
                                placeholder="Opcional"
                                className="w-full"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveItem(item.tempId)}
                                className="hover:bg-red-50"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Submit button */}
              <div className="flex justify-center pt-6 border-t border-[hsl(var(--canalco-neutral-300))]">
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white px-8 py-3 text-lg shadow-lg"
                  size="lg"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5 mr-2" />
                      Guardar Requisición
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
