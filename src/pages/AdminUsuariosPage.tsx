import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  Edit2,
  UserCheck,
  UserX,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  Shield,
  GitBranch,
  Trash2,
  Key,
  Layout,
  Building2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usersService,
  type User,
  type Role,
  type HierarchyEntry,
  type Permission,
  type Gestion,
  type CreateRoleDto,
} from '@/services/users.service';
import { masterDataService } from '@/services/master-data.service';
import { surveysService } from '@/services/surveys.service';
import { mapCompaniesToDepartments } from '@/utils/departmentMapper';

export default function AdminUsuariosPage() {
  const navigate = useNavigate();

  // Estados principales
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [hierarchy, setHierarchy] = useState<HierarchyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [activeTab, setActiveTab] = useState('usuarios');

  // Estados del modal de confirmación de usuario
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'activate' | 'deactivate';
    user: User | null;
  }>({ type: 'activate', user: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Estados para gestión de roles
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleFormData, setRoleFormData] = useState<CreateRoleDto>({
    nombreRol: '',
    descripcion: '',
    category: '',
    defaultModule: '',
  });
  const [roleLoading, setRoleLoading] = useState(false);

  // Estados para modal de permisos
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<Role | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // Estados para modal de gestiones
  const [showGestionesModal, setShowGestionesModal] = useState(false);
  const [selectedRoleForGestiones, setSelectedRoleForGestiones] = useState<Role | null>(null);
  const [selectedGestionIds, setSelectedGestionIds] = useState<number[]>([]);
  const [gestionesLoading, setGestionesLoading] = useState(false);

  // Estados para eliminar rol
  const [showDeleteRoleModal, setShowDeleteRoleModal] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleteRoleLoading, setDeleteRoleLoading] = useState(false);
  const [deleteRoleError, setDeleteRoleError] = useState<string | null>(null);

  // Estados para gestión de accesos
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedUserForAccess, setSelectedUserForAccess] = useState<User | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [userCompanyAccess, setUserCompanyAccess] = useState<number[]>([]);
  const [userProjectAccess, setUserProjectAccess] = useState<number[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);

  // Cargar datos al montar
  useEffect(() => {
    loadData();
  }, [showInactive]);

  // Filtrar usuarios cuando cambia el término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.nombre.toLowerCase().includes(term) ||
            u.email.toLowerCase().includes(term) ||
            u.cargo.toLowerCase().includes(term) ||
            u.role?.nombreRol.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, users]);

  // Limpiar mensaje de éxito
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
      const [usersData, rolesData, hierarchyData, permissionsData, gestionesData] = await Promise.all([
        usersService.getAll(showInactive),
        usersService.getRoles(),
        usersService.getHierarchy(),
        usersService.getPermissions(),
        usersService.getGestiones(),
      ]);
      const usersArray = Array.isArray(usersData) ? usersData : [];
      const rolesArray = Array.isArray(rolesData) ? rolesData : [];
      const hierarchyArray = Array.isArray(hierarchyData) ? hierarchyData : [];
      const permissionsArray = Array.isArray(permissionsData) ? permissionsData : [];
      const gestionesArray = Array.isArray(gestionesData) ? gestionesData : [];
      setUsers(usersArray);
      setFilteredUsers(usersArray);
      setRoles(rolesArray);
      setHierarchy(hierarchyArray);
      setPermissions(permissionsArray);
      setGestiones(gestionesArray);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos. Verifica que tienes permisos de administrador.');
    } finally {
      setLoading(false);
    }
  };

  // ========== FUNCIONES DE USUARIO ==========
  const handleToggleStatus = (user: User) => {
    setConfirmAction({
      type: user.estado ? 'deactivate' : 'activate',
      user,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmToggle = async () => {
    if (!confirmAction.user) return;

    try {
      setActionLoading(true);
      if (confirmAction.type === 'activate') {
        await usersService.activate(confirmAction.user.userId);
        setSuccessMessage(`Usuario ${confirmAction.user.nombre} activado correctamente`);
      } else {
        await usersService.deactivate(confirmAction.user.userId);
        setSuccessMessage(`Usuario ${confirmAction.user.nombre} desactivado correctamente`);
      }
      setShowConfirmModal(false);
      setConfirmAction({ type: 'activate', user: null });
      await loadData();
    } catch (err: any) {
      console.error('Error toggling user status:', err);
      setError(err.response?.data?.message || 'Error al cambiar el estado del usuario');
    } finally {
      setActionLoading(false);
    }
  };

  // ========== FUNCIONES DE ROLES ==========
  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleFormData({
      nombreRol: '',
      descripcion: '',
      category: '',
      defaultModule: '',
    });
    setShowRoleModal(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleFormData({
      nombreRol: role.nombreRol,
      descripcion: role.descripcion || '',
      category: role.category || '',
      defaultModule: role.defaultModule || '',
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!roleFormData.nombreRol.trim()) {
      setError('El nombre del rol es obligatorio');
      return;
    }

    try {
      setRoleLoading(true);
      setError(null);

      if (editingRole) {
        await usersService.updateRole(editingRole.rolId, {
          nombreRol: roleFormData.nombreRol,
          descripcion: roleFormData.descripcion || undefined,
          category: roleFormData.category || undefined,
          defaultModule: roleFormData.defaultModule || undefined,
        });
        setSuccessMessage(`Rol "${roleFormData.nombreRol}" actualizado correctamente`);
      } else {
        await usersService.createRole(roleFormData);
        setSuccessMessage(`Rol "${roleFormData.nombreRol}" creado correctamente`);
      }

      setShowRoleModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving role:', err);
      setError(err.response?.data?.message || 'Error al guardar el rol');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleDeleteRole = (role: Role) => {
    setRoleToDelete(role);
    setDeleteRoleError(null);
    setShowDeleteRoleModal(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;

    try {
      setDeleteRoleLoading(true);
      setDeleteRoleError(null);
      await usersService.deleteRole(roleToDelete.rolId);
      setSuccessMessage(`Rol "${roleToDelete.nombreRol}" eliminado correctamente`);
      setShowDeleteRoleModal(false);
      setRoleToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting role:', err);
      const errorMsg = err.response?.data?.message || 'Error al eliminar el rol. Verifica que no tenga usuarios asignados.';
      setDeleteRoleError(errorMsg);
    } finally {
      setDeleteRoleLoading(false);
    }
  };

  // ========== FUNCIONES DE PERMISOS ==========
  const handleManagePermissions = (role: Role) => {
    setSelectedRoleForPermissions(role);
    const currentPermissionIds = role.rolePermissions?.map((rp) => rp.permisoId) || [];
    setSelectedPermissionIds(currentPermissionIds);
    setShowPermissionsModal(true);
  };

  const togglePermission = (permisoId: number) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permisoId) ? prev.filter((id) => id !== permisoId) : [...prev, permisoId]
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleForPermissions) return;

    try {
      setPermissionsLoading(true);
      await usersService.assignPermissionsToRole(selectedRoleForPermissions.rolId, selectedPermissionIds);
      setSuccessMessage(`Permisos actualizados para "${selectedRoleForPermissions.nombreRol}"`);
      setShowPermissionsModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving permissions:', err);
      setError(err.response?.data?.message || 'Error al guardar los permisos');
    } finally {
      setPermissionsLoading(false);
    }
  };

  // ========== FUNCIONES DE GESTIONES ==========
  const handleManageGestiones = (role: Role) => {
    setSelectedRoleForGestiones(role);
    const currentGestionIds = role.roleGestiones?.map((rg) => rg.gestionId) || [];
    setSelectedGestionIds(currentGestionIds);
    setShowGestionesModal(true);
  };

  const toggleGestion = (gestionId: number) => {
    setSelectedGestionIds((prev) =>
      prev.includes(gestionId) ? prev.filter((id) => id !== gestionId) : [...prev, gestionId]
    );
  };

  const handleSaveGestiones = async () => {
    if (!selectedRoleForGestiones) return;

    try {
      setGestionesLoading(true);
      await usersService.assignGestionesToRole(selectedRoleForGestiones.rolId, selectedGestionIds);
      setSuccessMessage(`Módulos actualizados para "${selectedRoleForGestiones.nombreRol}"`);
      setShowGestionesModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving gestiones:', err);
      setError(err.response?.data?.message || 'Error al guardar los módulos');
    } finally {
      setGestionesLoading(false);
    }
  };

  // ========== FUNCIONES DE ACCESOS ==========
  const handleOpenAccessModal = async (user: User) => {
    setSelectedUserForAccess(user);
    setShowAccessModal(true);
    setAccessLoading(true);

    try {
      // Cargar empresas y proyectos disponibles
      const [companies, projects, userAccess] = await Promise.all([
        masterDataService.getCompanies(),
        masterDataService.getProjects(),
        surveysService.getUserAccess(user.userId),
      ]);

      setAvailableCompanies(companies);
      setAvailableProjects(projects);
      setUserCompanyAccess(userAccess.companies.map((c) => c.companyId));
      setUserProjectAccess(userAccess.projects.map((p) => p.projectId));
    } catch (error) {
      console.error('Error loading access data:', error);
      setError('Error al cargar los accesos del usuario');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleToggleCompanyAccess = (companyId: number) => {
    setUserCompanyAccess((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId]
    );
  };

  const handleToggleProjectAccess = (projectId: number) => {
    setUserProjectAccess((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSaveAccess = async () => {
    if (!selectedUserForAccess) return;

    try {
      setAccessSaving(true);
      console.log('🔍 [handleSaveAccess] Guardando accesos para usuario:', selectedUserForAccess.userId);
      console.log('🔍 [handleSaveAccess] Empresas seleccionadas:', userCompanyAccess);
      console.log('🔍 [handleSaveAccess] Proyectos seleccionados:', userProjectAccess);

      // Obtener accesos actuales
      const currentAccess = await surveysService.getUserAccess(selectedUserForAccess.userId);
      console.log('🔍 [handleSaveAccess] Accesos actuales:', currentAccess);

      // Determinar qué agregar y qué eliminar
      const currentCompanyIds = currentAccess.companies.map((c) => c.companyId);
      const currentProjectIds = currentAccess.projects.map((p) => p.projectId);

      const companiesToAdd = userCompanyAccess.filter((id) => !currentCompanyIds.includes(id));
      const companiesToRemove = currentAccess.companies.filter((c) => !userCompanyAccess.includes(c.companyId));

      const projectsToAdd = userProjectAccess.filter((id) => !currentProjectIds.includes(id));
      const projectsToRemove = currentAccess.projects.filter((p) => !userProjectAccess.includes(p.projectId));

      console.log('🔍 [handleSaveAccess] Empresas a agregar:', companiesToAdd);
      console.log('🔍 [handleSaveAccess] Empresas a eliminar:', companiesToRemove);
      console.log('🔍 [handleSaveAccess] Proyectos a agregar:', projectsToAdd);
      console.log('🔍 [handleSaveAccess] Proyectos a eliminar:', projectsToRemove);

      // Ejecutar cambios
      const operations = [];

      // Agregar nuevas empresas
      for (const companyId of companiesToAdd) {
        console.log('🔍 [handleSaveAccess] Agregando empresa:', companyId);
        operations.push(
          surveysService.addUserAccess({
            userId: selectedUserForAccess.userId,
            companyId,
          })
        );
      }

      // Agregar nuevos proyectos
      for (const projectId of projectsToAdd) {
        console.log('🔍 [handleSaveAccess] Agregando proyecto:', projectId);
        operations.push(
          surveysService.addUserAccess({
            userId: selectedUserForAccess.userId,
            projectId,
          })
        );
      }

      // Eliminar empresas
      for (const company of companiesToRemove) {
        if (company.accessId) {
          console.log('🔍 [handleSaveAccess] Eliminando empresa accessId:', company.accessId);
          operations.push(surveysService.deleteUserAccess(company.accessId));
        }
      }

      // Eliminar proyectos
      for (const project of projectsToRemove) {
        if (project.accessId) {
          console.log('🔍 [handleSaveAccess] Eliminando proyecto accessId:', project.accessId);
          operations.push(surveysService.deleteUserAccess(project.accessId));
        }
      }

      console.log('🔍 [handleSaveAccess] Total operaciones:', operations.length);
      const results = await Promise.all(operations);
      console.log('✅ [handleSaveAccess] Operaciones completadas:', results);

      setSuccessMessage('Accesos actualizados correctamente');
      setShowAccessModal(false);
    } catch (error: any) {
      console.error('❌ [handleSaveAccess] Error saving access:', error);
      console.error('❌ [handleSaveAccess] Error response:', error.response?.data);
      console.error('❌ [handleSaveAccess] Error status:', error.response?.status);
      setError(`Error al guardar los accesos: ${error.response?.data?.message || error.message}`);
    } finally {
      setAccessSaving(false);
    }
  };

  // ========== HELPERS ==========
  const getRoleBadgeColor = (roleName: string) => {
    const name = roleName.toLowerCase();
    if (name.includes('gerencia')) return 'bg-purple-100 text-purple-800';
    if (name.includes('director')) return 'bg-blue-100 text-blue-800';
    if (name.includes('analista')) return 'bg-green-100 text-green-800';
    if (name.includes('tics')) return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getTipoAuthBadge = (tipo: string) => {
    switch (tipo) {
      case 'revision':
        return <Badge className="bg-blue-100 text-blue-800">Revisión</Badge>;
      case 'autorizacion':
        return <Badge className="bg-amber-100 text-amber-800">Autorización</Badge>;
      case 'aprobacion':
        return <Badge className="bg-green-100 text-green-800">Aprobación</Badge>;
      default:
        return <Badge>{tipo}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--canalco-primary))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

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
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  Administración de Usuarios
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Gestión de usuarios, roles y jerarquía de autorizaciones
                </p>
              </div>
            </div>

            <Button
              onClick={() => navigate('/dashboard/usuarios/crear')}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="jerarquia" className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Jerarquía
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Roles
            </TabsTrigger>
          </TabsList>

          {/* Tab: Usuarios */}
          <TabsContent value="usuarios">
            {/* Filtros */}
            <Card className="mb-6 p-4">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                  <Input
                    placeholder="Buscar por nombre, email, cargo o rol..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Mostrar inactivos
                </label>
                <span className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                  {filteredUsers.length} usuarios
                </span>
              </div>
            </Card>

            {/* Tabla de Usuarios */}
            <Card>
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
                  <p className="text-[hsl(var(--canalco-neutral-600))]">
                    {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow
                        key={user.userId}
                        className={!user.estado ? 'opacity-60' : ''}
                      >
                        <TableCell className="font-medium">{user.nombre}</TableCell>
                        <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {user.email}
                        </TableCell>
                        <TableCell>{user.cargo}</TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeColor(user.role?.nombreRol || '')}>
                            {user.role?.nombreRol || 'Sin rol'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {user.estado ? (
                            <Badge className="bg-green-100 text-green-800">Activo</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">Inactivo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                navigate(`/dashboard/usuarios/${user.userId}`)
                              }
                              className="hover:bg-blue-100 hover:text-blue-600"
                              title="Ver detalle"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenAccessModal(user)}
                              className="hover:bg-purple-100 hover:text-purple-600"
                              title="Gestionar accesos a empresas"
                            >
                              <Building2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleStatus(user)}
                              className={
                                user.estado
                                  ? 'hover:bg-red-100 hover:text-red-600'
                                  : 'hover:bg-green-100 hover:text-green-600'
                              }
                              title={user.estado ? 'Desactivar' : 'Activar'}
                            >
                              {user.estado ? (
                                <UserX className="w-4 h-4" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          {/* Tab: Jerarquía */}
          <TabsContent value="jerarquia">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Estructura de Autorizaciones</h3>
              {hierarchy.length === 0 ? (
                <p className="text-[hsl(var(--canalco-neutral-600))] text-center py-8">
                  No hay jerarquía de autorizaciones configurada
                </p>
              ) : (
                <div className="space-y-6">
                  {hierarchy.map((entry, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center font-semibold">
                          {entry.autorizador.nombre.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{entry.autorizador.nombre}</p>
                          <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                            {entry.autorizador.cargo}
                          </p>
                        </div>
                      </div>

                      {entry.subordinados.length > 0 && (
                        <div className="ml-6 pl-6 border-l-2 border-[hsl(var(--canalco-neutral-300))]">
                          <p className="text-sm font-medium text-[hsl(var(--canalco-neutral-600))] mb-2">
                            Puede autorizar a:
                          </p>
                          <div className="space-y-2">
                            {entry.subordinados.map((sub) => (
                              <div
                                key={sub.authorizationId}
                                className="flex items-center justify-between bg-[hsl(var(--canalco-neutral-100))] rounded-lg p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-neutral-300))] flex items-center justify-center text-sm font-medium">
                                    {sub.usuario.nombre.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{sub.usuario.nombre}</p>
                                    <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                                      {sub.usuario.cargo}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {getTipoAuthBadge(sub.tipoAutorizacion)}
                                  <Badge variant="outline">Nivel {sub.nivel}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Tab: Roles */}
          <TabsContent value="roles">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Gestión de Roles</h3>
              <Button
                onClick={handleCreateRole}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Rol
              </Button>
            </div>
            <Card>
              {roles.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
                  <p className="text-[hsl(var(--canalco-neutral-600))]">No hay roles registrados</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-center">Permisos</TableHead>
                      <TableHead className="text-center">Módulos</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.rolId}>
                        <TableCell className="font-medium">
                          <Badge className={getRoleBadgeColor(role.nombreRol)}>
                            {role.nombreRol}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                          {role.category || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))] max-w-xs truncate">
                          {role.descripcion || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {role.rolePermissions?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {role.roleGestiones?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditRole(role)}
                              className="hover:bg-blue-100 hover:text-blue-600"
                              title="Editar rol"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleManagePermissions(role)}
                              className="hover:bg-amber-100 hover:text-amber-600"
                              title="Gestionar permisos"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleManageGestiones(role)}
                              className="hover:bg-purple-100 hover:text-purple-600"
                              title="Gestionar módulos"
                            >
                              <Layout className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRole(role)}
                              className="hover:bg-red-100 hover:text-red-600"
                              title="Eliminar rol"
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
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal de Confirmación de Usuario */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction.type === 'activate' ? 'Activar Usuario' : 'Desactivar Usuario'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction.type === 'activate'
                ? `¿Estás seguro de que deseas activar a ${confirmAction.user?.nombre}? El usuario podrá acceder al sistema.`
                : `¿Estás seguro de que deseas desactivar a ${confirmAction.user?.nombre}? El usuario no podrá acceder al sistema.`}
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
              onClick={handleConfirmToggle}
              disabled={actionLoading}
              className={
                confirmAction.type === 'activate'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmAction.type === 'activate' ? 'Activar' : 'Desactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Crear/Editar Rol */}
      <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar Rol' : 'Crear Nuevo Rol'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Modifica los datos del rol'
                : 'Ingresa los datos para el nuevo rol'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombreRol">Nombre del Rol *</Label>
              <Input
                id="nombreRol"
                value={roleFormData.nombreRol}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, nombreRol: e.target.value })
                }
                placeholder="Ej: Supervisor de Compras"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input
                id="descripcion"
                value={roleFormData.descripcion}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, descripcion: e.target.value })
                }
                placeholder="Descripción del rol"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Input
                id="category"
                value={roleFormData.category}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, category: e.target.value })
                }
                placeholder="Ej: Operaciones, Administrativo, Dirección"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultModule">Módulo por Defecto</Label>
              <select
                id="defaultModule"
                value={roleFormData.defaultModule}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, defaultModule: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Seleccionar módulo...</option>
                {gestiones.map((gestion) => (
                  <option key={gestion.gestionId} value={gestion.slug}>
                    {gestion.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleModal(false)} disabled={roleLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={roleLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {roleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRole ? 'Guardar Cambios' : 'Crear Rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Eliminar Rol */}
      <Dialog open={showDeleteRoleModal} onOpenChange={setShowDeleteRoleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Rol</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el rol "{roleToDelete?.nombreRol}"? Esta acción no
              se puede deshacer. El rol solo se puede eliminar si no tiene usuarios asignados.
            </DialogDescription>
          </DialogHeader>
          {deleteRoleError && (
            <Alert className="border-red-500 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{deleteRoleError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteRoleModal(false)} disabled={deleteRoleLoading}>
              Cancelar
            </Button>
            <Button
              onClick={confirmDeleteRole}
              disabled={deleteRoleLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRoleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Gestionar Permisos */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar Permisos</DialogTitle>
            <DialogDescription>
              Selecciona los permisos para el rol "{selectedRoleForPermissions?.nombreRol}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {permissions.length === 0 ? (
              <p className="text-center text-[hsl(var(--canalco-neutral-600))]">
                No hay permisos disponibles
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {permissions.map((permission) => (
                  <label
                    key={permission.permisoId}
                    className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPermissionIds.includes(permission.permisoId)}
                      onChange={() => togglePermission(permission.permisoId)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <div>
                      <p className="font-medium text-sm">{permission.nombrePermiso}</p>
                      {permission.descripcion && (
                        <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                          {permission.descripcion}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsModal(false)} disabled={permissionsLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={permissionsLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {permissionsLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Permisos ({selectedPermissionIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Gestionar Módulos/Gestiones */}
      <Dialog open={showGestionesModal} onOpenChange={setShowGestionesModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar Módulos</DialogTitle>
            <DialogDescription>
              Selecciona los módulos a los que tendrá acceso el rol "{selectedRoleForGestiones?.nombreRol}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {gestiones.length === 0 ? (
              <p className="text-center text-[hsl(var(--canalco-neutral-600))]">
                No hay módulos disponibles
              </p>
            ) : (
              <div className="space-y-2">
                {gestiones.map((gestion) => (
                  <label
                    key={gestion.gestionId}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGestionIds.includes(gestion.gestionId)}
                      onChange={() => toggleGestion(gestion.gestionId)}
                      className="rounded border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{gestion.nombre}</span>
                      <Badge variant="outline" className="text-xs">
                        {gestion.slug}
                      </Badge>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGestionesModal(false)} disabled={gestionesLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveGestiones}
              disabled={gestionesLoading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {gestionesLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Módulos ({selectedGestionIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Gestionar Accesos */}
      <Dialog open={showAccessModal} onOpenChange={setShowAccessModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              Gestionar Accesos - {selectedUserForAccess?.nombre}
            </DialogTitle>
            <DialogDescription>
              Selecciona las empresas y proyectos a los que este usuario tendrá acceso para gestionar obras y levantamientos
            </DialogDescription>
          </DialogHeader>

          {accessLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-4">
              <Tabs defaultValue="companies" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="companies">
                    Empresas ({userCompanyAccess.length})
                  </TabsTrigger>
                  <TabsTrigger value="projects">
                    Proyectos ({userProjectAccess.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="companies" className="mt-4 space-y-4">
                  {availableCompanies.length === 0 ? (
                    <p className="text-center text-[hsl(var(--canalco-neutral-600))] py-8">
                      No hay empresas disponibles
                    </p>
                  ) : (
                    <>
                      {/* Agrupar empresas por departamento */}
                      {mapCompaniesToDepartments(availableCompanies).map((dept) => (
                        <Card key={dept.name} className="p-4">
                          <h3 className="font-semibold text-sm mb-3 flex items-center justify-between">
                            <span>{dept.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {dept.companies.filter((c) => userCompanyAccess.includes(c.companyId)).length}/{dept.companies.length}
                            </Badge>
                          </h3>
                          <div className="space-y-2">
                            {dept.companies.map((company) => (
                              <label
                                key={company.companyId}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  userCompanyAccess.includes(company.companyId)
                                    ? 'bg-purple-50 border-purple-300'
                                    : 'hover:bg-[hsl(var(--canalco-neutral-100))]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={userCompanyAccess.includes(company.companyId)}
                                  onChange={() => handleToggleCompanyAccess(company.companyId)}
                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{company.name}</p>
                                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                                    ID: {company.companyId}
                                  </p>
                                </div>
                                {userCompanyAccess.includes(company.companyId) && (
                                  <CheckCircle className="w-4 h-4 text-purple-600" />
                                )}
                              </label>
                            ))}
                          </div>
                        </Card>
                      ))}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="projects" className="mt-4 space-y-2">
                  {availableProjects.length === 0 ? (
                    <p className="text-center text-[hsl(var(--canalco-neutral-600))] py-8">
                      No hay proyectos disponibles
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {availableProjects.map((project) => (
                        <label
                          key={project.projectId}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            userProjectAccess.includes(project.projectId)
                              ? 'bg-purple-50 border-purple-300'
                              : 'hover:bg-[hsl(var(--canalco-neutral-100))]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={userProjectAccess.includes(project.projectId)}
                            onChange={() => handleToggleProjectAccess(project.projectId)}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{project.name}</p>
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                              ID: {project.projectId} • Empresa ID: {project.companyId}
                            </p>
                          </div>
                          {userProjectAccess.includes(project.projectId) && (
                            <CheckCircle className="w-4 h-4 text-purple-600" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setShowAccessModal(false)}
              disabled={accessSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAccess}
              disabled={accessSaving || accessLoading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {accessSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Accesos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
