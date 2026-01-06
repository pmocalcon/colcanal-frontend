import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Validation schema with domain validation
const loginSchema = z.object({
  email: z
    .string()
    .email('Email inválido')
    .refine(
      (email) => {
        const domain = email.split('@')[1];
        return domain === 'canalco.com' || domain === 'alumbrado.com' || domain === 'canalcongroup.com';
      },
      {
        message: 'El email debe ser de dominio @canalco.com, @alumbrado.com o @canalcongroup.com',
      }
    ),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      clearError();

      await login({
        email: data.email,
        password: data.password,
      });

      // Navigate to dashboard on success
      navigate('/dashboard');
    } catch (err) {
      // Error is handled by AuthContext and displayed below
      console.error('Login error:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Email Field */}
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-sm font-medium text-[hsl(var(--canalco-neutral-800))]"
        >
          Correo
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[hsl(var(--canalco-neutral-600))]" />
          <Input
            id="email"
            type="email"
            placeholder="correo@canalco.com"
            className="pl-11 h-12 rounded-full border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] focus:ring-[hsl(var(--canalco-primary))]"
            {...register('email')}
          />
        </div>
        {errors.email && (
          <p className="text-sm text-[hsl(var(--canalco-error))] pl-4">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <Label
          htmlFor="password"
          className="text-sm font-medium text-[hsl(var(--canalco-neutral-800))]"
        >
          Contraseña
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[hsl(var(--canalco-neutral-600))]" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className="pl-11 pr-11 h-12 rounded-full border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] focus:ring-[hsl(var(--canalco-primary))]"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-neutral-900))] transition-colors"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-[hsl(var(--canalco-error))] pl-4">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Global Error Message from API */}
      {error && (
        <div className="bg-[hsl(var(--canalco-error))]/10 border border-[hsl(var(--canalco-error))] text-[hsl(var(--canalco-error))] px-4 py-3 rounded-lg text-sm">
          <p>{error}</p>
          <p className="text-xs mt-1 opacity-80">Contactar a Alexsandra Ortiz para la solución.</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 rounded-full bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white font-semibold text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Iniciando sesión...
          </span>
        ) : (
          'Login'
        )}
      </Button>
    </form>
  );
}
