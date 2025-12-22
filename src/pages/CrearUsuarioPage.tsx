import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usersService, type Role, type CreateUserDto } from '@/services/users.service';

export default function CrearUsuarioPage() {
  const navigate = useNavigate();

  // Estados
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Formulario
  const [formData, setFormData] = useState<CreateUserDto>({
    email: '',
    password: '',
    nombre: '',
    cargo: '',
    rolId: 0,
    estado: true,
  });

  // Cargar roles al montar
  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const rolesData = await usersService.getRoles();
      const rolesArray = Array.isArray(rolesData) ? rolesData : [];
      setRoles(rolesArray);
    } catch (err: any) {
      console.error('Error loading roles:', err);
      setError('Error al cargar los roles');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.email.trim()) {
      return 'El email es obligatorio';
    }
    if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return 'El email no es válido';
    }
    if (!formData.password || formData.password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres';
    }
    if (!formData.nombre.trim()) {
      return 'El nombre es obligatorio';
    }
    if (!formData.cargo.trim()) {
      return 'El cargo es obligatorio';
    }
    if (!formData.rolId) {
      return 'Debe seleccionar un rol';
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await usersService.create(formData);
      navigate('/dashboard/usuarios', {
        state: { message: 'Usuario creado correctamente' },
      });
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.response?.data?.message || 'Error al crear el usuario');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--canalco-primary))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
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
                  Crear Usuario
                </h1>
                <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Registra un nuevo usuario en el sistema
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <Alert className="mb-6 border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre Completo *</Label>
              <Input
                id="nombre"
                placeholder="Ej: Juan Pérez"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@canalcongroup.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-700))]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo *</Label>
              <Input
                id="cargo"
                placeholder="Ej: Analista de Compras"
                value={formData.cargo}
                onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
              />
            </div>

            {/* Rol */}
            <div className="space-y-2">
              <Label htmlFor="rol">Rol *</Label>
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

            {/* Estado */}
            <div className="space-y-2">
              <Label>Estado</Label>
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="estado"
                    checked={formData.estado === true}
                    onChange={() => setFormData({ ...formData, estado: true })}
                    className="text-[hsl(var(--canalco-primary))]"
                  />
                  <span>Activo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="estado"
                    checked={formData.estado === false}
                    onChange={() => setFormData({ ...formData, estado: false })}
                    className="text-[hsl(var(--canalco-primary))]"
                  />
                  <span>Inactivo</span>
                </label>
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard/usuarios')}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))]"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Crear Usuario
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
