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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usersService,
  type User,
  type Role,
  type HierarchyEntry,
} from '@/services/users.service';

export default function AdminUsuariosPage() {
  const navigate = useNavigate();

  // Estados principales
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [hierarchy, setHierarchy] = useState<HierarchyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [activeTab, setActiveTab] = useState('usuarios');

  // Estados del modal de confirmación
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'activate' | 'deactivate';
    user: User | null;
  }>({ type: 'activate', user: null });
  const [actionLoading, setActionLoading] = useState(false);

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
      const [usersData, rolesData, hierarchyData] = await Promise.all([
        usersService.getAll(showInactive),
        usersService.getRoles(),
        usersService.getHierarchy(),
      ]);
      const usersArray = Array.isArray(usersData) ? usersData : [];
      const rolesArray = Array.isArray(rolesData) ? rolesData : [];
      const hierarchyArray = Array.isArray(hierarchyData) ? hierarchyData : [];
      setUsers(usersArray);
      setFilteredUsers(usersArray);
      setRoles(rolesArray);
      setHierarchy(hierarchyArray);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos. Verifica que tienes permisos de administrador.');
    } finally {
      setLoading(false);
    }
  };

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
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rol</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Permisos</TableHead>
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
                      <TableCell className="text-[hsl(var(--canalco-neutral-600))]">
                        {role.descripcion || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {role.rolePermissions?.map((rp) => (
                            <Badge
                              key={rp.permisoId}
                              variant="outline"
                              className="text-xs"
                            >
                              {rp.permission.nombrePermiso}
                            </Badge>
                          )) || <span className="text-[hsl(var(--canalco-neutral-500))]">-</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal de Confirmación */}
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
    </div>
  );
}
