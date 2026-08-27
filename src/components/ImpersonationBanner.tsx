import { useNavigate } from 'react-router-dom';
import { UserCog, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Barra fija visible mientras un administrador está impersonando a otro usuario
 * para pruebas. Recuerda en todo momento que no es la sesión real y ofrece el
 * botón para volver a la cuenta del administrador.
 */
export function ImpersonationBanner() {
  const { impersonadorEmail, user, salirImpersonacion } = useAuth();
  const navigate = useNavigate();

  if (!impersonadorEmail) return null;

  const volver = () => {
    salirImpersonacion();
    navigate('/dashboard/usuarios/credenciales');
  };

  return (
    <div className="no-print fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <UserCog className="w-4 h-4 flex-none" />
          <span className="truncate">
            Estás probando como <b>{user?.nombre}</b>
            {user?.nombreRol ? ` · ${user.nombreRol}` : ''} — sesión de prueba de{' '}
            <b>{impersonadorEmail}</b>
          </span>
        </div>
        <button
          onClick={volver}
          className="flex-none inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 hover:bg-amber-950/20 px-2.5 py-1 font-semibold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Volver a mi cuenta
        </button>
      </div>
    </div>
  );
}
