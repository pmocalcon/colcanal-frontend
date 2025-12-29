import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  Edit2,
  CheckCircle as CheckCircleIcon,
  XCircle,
  Loader2,
  AlertCircle,
  CheckCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  Trash2,
  RotateCcw,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  suppliersService,
  type Supplier,
  type CreateSupplierDto,
  type SupplierStats,
} from '@/services/suppliers.service';

export default function ProveedoresPage() {
  const navigate = useNavigate();

  // Estados principales
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Estados de búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]); // Cache de todos los proveedores

  // Estados del modal de crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<CreateSupplierDto>({
    name: '',
    nitCc: '',
    phone: '',
    address: '',
    city: '',
    email: '',
    contactPerson: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados del modal de confirmación
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'activate' | 'deactivate' | 'delete';
    supplier: Supplier | null;
  }>({ type: 'deactivate', supplier: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Cargar todos los proveedores una vez
  const loadAllSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Usar getPaginated con un límite alto para obtener todos
      const [suppliersResponse, statsData, citiesData] = await Promise.all([
        suppliersService.getPaginated({
          limit: 10000,
          isActive: showInactive ? undefined : true,
        }),
        suppliersService.getStats(),
        suppliersService.getCities(),
      ]);

      setAllSuppliers(suppliersResponse.data);
      setStats(statsData);
      setCities(citiesData);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Error al cargar los proveedores');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  // Cargar datos al inicio y cuando cambia showInactive
  useEffect(() => {
    loadAllSuppliers();
  }, [loadAllSuppliers]);

  // Filtrar y paginar localmente cuando cambian los filtros
  useEffect(() => {
    if (allSuppliers.length === 0) return;

    let filtered = [...allSuppliers];

    // Filtro por búsqueda
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.nitCc.toLowerCase().includes(query) ||
          (s.contactPerson && s.contactPerson.toLowerCase().includes(query)) ||
          (s.city && s.city.toLowerCase().includes(query))
      );
    }

    // Filtro por ciudad
    if (cityFilter) {
      filtered = filtered.filter((s) => s.city === cityFilter);
    }

    // Calcular paginación
    const totalItems = filtered.length;
    const totalPagesCount = Math.ceil(totalItems / limit) || 1;

    // Ajustar página si es mayor al total
    const currentPage = page > totalPagesCount ? 1 : page;

    // Aplicar paginación
    const startIndex = (currentPage - 1) * limit;
    const paginatedData = filtered.slice(startIndex, startIndex + limit);

    setSuppliers(paginatedData);
    setFilteredSuppliers(paginatedData);
    setTotal(totalItems);
    setTotalPages(totalPagesCount);

    if (page > totalPagesCount && totalPagesCount > 0) {
      setPage(1);
    }
  }, [allSuppliers, searchTerm, cityFilter, page, limit]);

  // Limpiar mensaje de éxito
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Handlers
  const handleSearch = () => {
    setPage(1); // Solo resetear página, el filtro se aplica automáticamente
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      nitCc: '',
      phone: '',
      address: '',
      city: '',
      email: '',
      contactPerson: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      nitCc: supplier.nitCc,
      phone: supplier.phone,
      address: supplier.address,
      city: supplier.city,
      email: supplier.email || '',
      contactPerson: supplier.contactPerson || '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    // Validaciones
    if (!formData.name.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    if (!formData.nitCc.trim()) {
      setFormError('El NIT/CC es obligatorio');
      return;
    }
    if (!formData.phone.trim()) {
      setFormError('El teléfono es obligatorio');
      return;
    }
    if (!formData.address.trim()) {
      setFormError('La dirección es obligatoria');
      return;
    }
    if (!formData.city.trim()) {
      setFormError('La ciudad es obligatoria');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      const dataToSend = {
        ...formData,
        email: formData.email?.trim() || undefined,
        contactPerson: formData.contactPerson?.trim() || undefined,
      };

      if (editingSupplier) {
        await suppliersService.update(editingSupplier.supplierId, dataToSend);
        setSuccessMessage(`Proveedor "${formData.name}" actualizado correctamente`);
      } else {
        await suppliersService.create(dataToSend);
        setSuccessMessage(`Proveedor "${formData.name}" creado correctamente`);
      }

      setShowModal(false);
      await loadAllSuppliers();
    } catch (err: any) {
      console.error('Error saving supplier:', err);
      setFormError(err.response?.data?.message || 'Error al guardar el proveedor');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = (supplier: Supplier) => {
    setConfirmAction({
      type: supplier.isActive ? 'deactivate' : 'activate',
      supplier,
    });
    setShowConfirmModal(true);
  };

  const handleDelete = (supplier: Supplier) => {
    setConfirmAction({
      type: 'delete',
      supplier,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction.supplier) return;

    try {
      setActionLoading(true);

      if (confirmAction.type === 'activate') {
        await suppliersService.reactivate(confirmAction.supplier.supplierId);
        setSuccessMessage(`Proveedor "${confirmAction.supplier.name}" reactivado correctamente`);
      } else if (confirmAction.type === 'deactivate') {
        await suppliersService.deactivate(confirmAction.supplier.supplierId);
        setSuccessMessage(`Proveedor "${confirmAction.supplier.name}" desactivado correctamente`);
      } else if (confirmAction.type === 'delete') {
        await suppliersService.deletePermanent(confirmAction.supplier.supplierId);
        setSuccessMessage(`Proveedor "${confirmAction.supplier.name}" eliminado permanentemente`);
      }

      setShowConfirmModal(false);
      setConfirmAction({ type: 'deactivate', supplier: null });
      await loadAllSuppliers();
    } catch (err: any) {
      console.error('Error performing action:', err);
      setError(err.response?.data?.message || 'Error al realizar la acción');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && suppliers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--canalco-primary))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando proveedores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
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
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  Gestión de Proveedores
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Administra los proveedores del sistema
                </p>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Proveedor
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

        {/* Estadísticas */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">{stats.total}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Total</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Activos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Inactivos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">{stats.citiesCount}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Ciudades</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Filtros */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
              <Input
                placeholder="Buscar por nombre, NIT, ciudad, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <select
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setPage(1);
              }}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-[150px]"
            >
              <option value="">Todas las ciudades</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => {
                  setShowInactive(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-gray-300"
              />
              Mostrar inactivos
            </label>
            <Button onClick={handleSearch} variant="outline">
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        </Card>

        {/* Tabla */}
        <Card>
          {suppliers.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
              <p className="text-[hsl(var(--canalco-neutral-600))]">
                {searchTerm || cityFilter ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
              </p>
              <Button onClick={handleCreate} variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Crear Proveedor
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>NIT/CC</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow
                      key={supplier.supplierId}
                      className={!supplier.isActive ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                            {supplier.address}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{supplier.nitCc}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[hsl(var(--canalco-neutral-500))]" />
                          {supplier.city}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {supplier.contactPerson && (
                            <div className="flex items-center gap-1 text-sm">
                              <User className="w-3 h-3 text-[hsl(var(--canalco-neutral-500))]" />
                              {supplier.contactPerson}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="w-3 h-3 text-[hsl(var(--canalco-neutral-500))]" />
                            {supplier.phone}
                          </div>
                          {supplier.email && (
                            <div className="flex items-center gap-1 text-xs text-[hsl(var(--canalco-neutral-500))]">
                              <Mail className="w-3 h-3" />
                              {supplier.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {supplier.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Activo</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">Inactivo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(supplier)}
                            className="hover:bg-blue-100 hover:text-blue-600"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(supplier)}
                            className={
                              supplier.isActive
                                ? 'hover:bg-orange-100 hover:text-orange-600'
                                : 'hover:bg-green-100 hover:text-green-600'
                            }
                            title={supplier.isActive ? 'Desactivar' : 'Reactivar'}
                          >
                            {supplier.isActive ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </Button>
                          {!supplier.isActive && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(supplier)}
                              className="hover:bg-red-100 hover:text-red-600"
                              title="Eliminar permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                    Mostrando {(page - 1) * limit + 1} - {Math.min(page * limit, total)} de {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Anterior
                    </Button>
                    <span className="text-sm">
                      Página {page} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </main>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Modifica los datos del proveedor'
                : 'Ingresa los datos del nuevo proveedor'}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <Alert className="border-red-500 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre del proveedor"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nitCc">NIT/CC *</Label>
                <Input
                  id="nitCc"
                  value={formData.nitCc}
                  onChange={(e) => setFormData({ ...formData, nitCc: e.target.value })}
                  placeholder="900123456-7"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="3001234567"
                  maxLength={50}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Carrera 45 #32-10"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">Ciudad *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Medellín"
                list="cities-list"
                maxLength={100}
              />
              <datalist id="cities-list">
                {cities.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactPerson">Persona de Contacto</Label>
                <Input
                  id="contactPerson"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Carlos Rodríguez"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ventas@empresa.com"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={formLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={formLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSupplier ? 'Guardar Cambios' : 'Crear Proveedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmación */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction.type === 'activate'
                ? 'Reactivar Proveedor'
                : confirmAction.type === 'deactivate'
                ? 'Desactivar Proveedor'
                : 'Eliminar Proveedor'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction.type === 'activate'
                ? `¿Estás seguro de que deseas reactivar a "${confirmAction.supplier?.name}"?`
                : confirmAction.type === 'deactivate'
                ? `¿Estás seguro de que deseas desactivar a "${confirmAction.supplier?.name}"? El proveedor no aparecerá en búsquedas pero sus datos se conservarán.`
                : `¿Estás seguro de que deseas eliminar permanentemente a "${confirmAction.supplier?.name}"? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={actionLoading}
              className={
                confirmAction.type === 'activate'
                  ? 'bg-green-600 hover:bg-green-700'
                  : confirmAction.type === 'deactivate'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-red-600 hover:bg-red-700'
              }
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmAction.type === 'activate'
                ? 'Reactivar'
                : confirmAction.type === 'deactivate'
                ? 'Desactivar'
                : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
