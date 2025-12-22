import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  User,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  usersService,
  type User as UserType,
  type Role,
  type UserAuthorizations,
  type AuthorizationUser,
  type Authorization,
} from '@/services/users.service';

export default function DetalleUsuarioPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const userId = parseInt(id || '0');

  // Estados principales
  const [user, setUser] = useState<UserType | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [authorizations, setAuthorizations] = useState<UserAuthorizations | null>(null);
  const [availableSubordinates, setAvailableSubordinates] = useState<AuthorizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Formulario de edición
  const [formData, setFormData] = useState({
    nombre: '',
    cargo: '',
    rolId: 0,
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  // Modal de agregar subordinado
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAuthData, setNewAuthData] = useState({
    usuarioAutorizadoId: 0,
    tipoAutorizacion: 'revision' as 'revision' | 'autorizacion' | 'aprobacion',
  });
  const [addingAuth, setAddingAuth] = useState(false);

  // Modal de eliminar autorización
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAuth, setDeletingAuth] = useState<Authorization | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Cargar datos al montar
  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId]);

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
      const [userData, rolesData, authData] = await Promise.all([
        usersService.getById(userId),
        usersService.getRoles(),
        usersService.getUserAuthorizations(userId),
      ]);

      setUser(userData);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setAuthorizations(authData);

      setFormData({
        nombre: userData.nombre,
        cargo: userData.cargo,
        rolId: userData.rolId,
        password: '',
      });

      // Cargar subordinados disponibles
      await loadAvailableSubordinates();
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos del usuario');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSubordinates = async () => {
    try {
      const available = await usersService.getAvailableSubordinates(userId);
      setAvailableSubordinates(Array.isArray(available) ? available : []);
    } catch (err) {
      console.error('Error loading available subordinates:', err);
    }
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!formData.cargo.trim()) {
      setError('El cargo es obligatorio');
      return;
    }
    if (!formData.rolId) {
      setError('Debe seleccionar un rol');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const updateData: { nombre: string; cargo: string; rolId: number; password?: string } = {
        nombre: formData.nombre,
        cargo: formData.cargo,
        rolId: formData.rolId,
      };

      if (formData.password.trim()) {
        updateData.password = formData.password;
      }

      await usersService.update(userId, updateData);
      setSuccessMessage('Usuario actualizado correctamente');
      setFormData({ ...formData, password: '' });
      await loadData();
    } catch (err: any) {
      console.error('Error updating user:', err);
      setError(err.response?.data?.message || 'Error al actualizar el usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAuthorization = async () => {
    if (!newAuthData.usuarioAutorizadoId) {
      setError('Debe seleccionar un usuario');
      return;
    }

    try {
      setAddingAuth(true);
      setError(null);
      await usersService.createAuthorization(userId, {
        usuarioAutorizadoId: newAuthData.usuarioAutorizadoId,
        tipoAutorizacion: newAuthData.tipoAutorizacion,
        gestionId: 2, // Compras por defecto
      });
      setSuccessMessage('Autorización agregada correctamente');
      setShowAddModal(false);
      setNewAuthData({ usuarioAutorizadoId: 0, tipoAutorizacion: 'revision' });
      await loadData();
    } catch (err: any) {
      console.error('Error adding authorization:', err);
      setError(err.response?.data?.message || 'Error al agregar la autorización');
    } finally {
      setAddingAuth(false);
    }
  };

  const handleDeleteAuthorization = async () => {
    if (!deletingAuth) return;

    try {
      setDeletingLoading(true);
      await usersService.deleteAuthorization(deletingAuth.authorizationId);
      setSuccessMessage('Autorización eliminada correctamente');
      setShowDeleteModal(false);
      setDeletingAuth(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting authorization:', err);
      setError(err.response?.data?.message || 'Error al eliminar la autorización');
    } finally {
      setDeletingLoading(false);
    }
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
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando usuario...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-900))] font-semibold">Usuario no encontrado</p>
          <Button
            onClick={() => navigate('/dashboard/usuarios')}
            className="mt-4"
          >
            Volver a la lista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
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
                onClick={() => navigate('/dashboard/usuarios')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                  {user.nombre}
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  {user.email}
                </p>
              </div>
            </div>

            <Badge className={user.estado ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
              {user.estado ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
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
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Datos del Usuario */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              Datos del Usuario
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cargo">Cargo</Label>
                <Input
                  id="cargo"
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rol">Rol</Label>
                <Select
                  value={formData.rolId?.toString() || ''}
                  onValueChange={(value) => setFormData({ ...formData, rolId: parseInt(value) })}
                >
                  <SelectTrigger id="rol">
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.rolId} value={role.rolId.toString()}>
                        {role.nombreRol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Nueva Contraseña (opcional)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Dejar vacío para mantener la actual"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-500))]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Guardar Cambios
              </Button>
            </div>
          </Card>

          {/* Autorizaciones */}
          <div className="space-y-6">
            {/* Subordinados */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Subordinados (puede autorizar a)</h3>
                <Button
                  size="sm"
                  onClick={() => setShowAddModal(true)}
                  disabled={availableSubordinates.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {authorizations?.subordinados && authorizations.subordinados.length > 0 ? (
                <div className="space-y-3">
                  {authorizations.subordinados.map((sub) => (
                    <div
                      key={sub.authorizationId}
                      className="flex items-center justify-between bg-[hsl(var(--canalco-neutral-100))] rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[hsl(var(--canalco-primary))] text-white flex items-center justify-center text-sm font-medium">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingAuth(sub);
                            setShowDeleteModal(true);
                          }}
                          className="hover:bg-red-100 hover:text-red-600 h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[hsl(var(--canalco-neutral-500))] text-sm text-center py-4">
                  No tiene subordinados asignados
                </p>
              )}
            </Card>

            {/* Supervisores */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Supervisores (lo pueden autorizar)</h3>

              {authorizations?.supervisores && authorizations.supervisores.length > 0 ? (
                <div className="space-y-3">
                  {authorizations.supervisores.map((sup) => (
                    <div
                      key={sup.authorizationId}
                      className="flex items-center justify-between bg-[hsl(var(--canalco-neutral-100))] rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-medium">
                          {sup.usuario.nombre.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{sup.usuario.nombre}</p>
                          <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                            {sup.usuario.cargo}
                          </p>
                        </div>
                      </div>
                      {getTipoAuthBadge(sup.tipoAutorizacion)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[hsl(var(--canalco-neutral-500))] text-sm text-center py-4">
                  No tiene supervisores asignados
                </p>
              )}
            </Card>
          </div>
        </div>
      </main>

      {/* Modal Agregar Subordinado */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Subordinado</DialogTitle>
            <DialogDescription>
              Selecciona un usuario y el tipo de autorización que {user.nombre} podrá realizar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Select
                value={newAuthData.usuarioAutorizadoId?.toString() || ''}
                onValueChange={(value) =>
                  setNewAuthData({ ...newAuthData, usuarioAutorizadoId: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {availableSubordinates.map((u) => (
                    <SelectItem key={u.userId} value={u.userId.toString()}>
                      {u.nombre} - {u.cargo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Autorización</Label>
              <Select
                value={newAuthData.tipoAutorizacion}
                onValueChange={(value: 'revision' | 'autorizacion' | 'aprobacion') =>
                  setNewAuthData({ ...newAuthData, tipoAutorizacion: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revision">Revisión (Nivel 1)</SelectItem>
                  <SelectItem value="autorizacion">Autorización (Nivel 2)</SelectItem>
                  <SelectItem value="aprobacion">Aprobación (Nivel 2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={addingAuth}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddAuthorization}
              disabled={addingAuth}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {addingAuth && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Eliminar Autorización */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Autorización</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la autorización de {user.nombre} sobre{' '}
              {deletingAuth?.usuario.nombre}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deletingLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAuthorization}
              disabled={deletingLoading}
            >
              {deletingLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
