import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, User, ArrowLeft } from 'lucide-react';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function AppHeader({
  title = 'Canalcongroup',
  subtitle = 'Sistema de Gestión Empresarial',
  showBackButton = false,
  onBack,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
      <div className="max-w-[1920px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo 1 - Canales Contactos - Left */}
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img
              src="/assets/images/logo-canalco.png"
              alt="Canales Contactos"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Back Button (if needed) */}
          {showBackButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="hidden md:flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          )}

          {/* Title */}
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
              {title}
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              {subtitle}
            </p>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">
                {user?.nombre || 'Usuario'}
              </p>
              <div className="flex items-center gap-2 justify-end">
                <Badge
                  variant="secondary"
                  className="text-xs bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]"
                >
                  {user?.nombreRol || 'Sin Rol'}
                </Badge>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(var(--canalco-primary))] to-[hsl(var(--canalco-primary-hover))] flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              className="border-[hsl(var(--canalco-error))] text-[hsl(var(--canalco-error))] hover:bg-[hsl(var(--canalco-error))]/10"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
