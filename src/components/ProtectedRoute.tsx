import React from 'react';
import { Navigate } from 'react-router-dom';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';

interface ProtectedRouteProps {
  /**
   * Permiso(s) requerido(s) para acceder a esta ruta
   * Puede ser un string único o un array de permisos
   */
  permission: string | string[];

  /**
   * Si es true y `permission` es un array, requiere TODOS los permisos
   * Si es false (default), requiere AL MENOS UNO de los permisos
   */
  requireAll?: boolean;

  /**
   * Ruta a la que redirigir si no tiene permiso
   * Por defecto: '/dashboard'
   */
  redirectTo?: string;

  /**
   * Componente/página a mostrar si SÍ tiene el permiso
   */
  children: React.ReactNode;
}

/**
 * Componente para proteger rutas completas basado en permisos
 * Redirige o muestra mensaje de error si el usuario no tiene el permiso requerido
 *
 * @example
 * // En App.tsx o Routes.tsx
 * <Route
 *   path="/levantamientos/revisar"
 *   element={
 *     <ProtectedRoute permission="levantamientos:revisar">
 *       <RevisarLevantamientosPage />
 *     </ProtectedRoute>
 *   }
 * />
 *
 * @example
 * // Requiere múltiples permisos (al menos uno)
 * <ProtectedRoute permission={["levantamientos:revisar", "levantamientos:aprobar"]}>
 *   <AdminPanel />
 * </ProtectedRoute>
 *
 * @example
 * // Requiere TODOS los permisos
 * <ProtectedRoute
 *   permission={["levantamientos:ver", "levantamientos:crear"]}
 *   requireAll
 * >
 *   <CreatePage />
 * </ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  permission,
  requireAll = false,
  redirectTo,
  children,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useGranularPermissions();

  const hasAccess = React.useMemo(() => {
    if (Array.isArray(permission)) {
      return requireAll
        ? hasAllPermissions(permission)
        : hasAnyPermission(permission);
    }
    return hasPermission(permission);
  }, [permission, requireAll, hasPermission, hasAnyPermission, hasAllPermissions]);

  if (!hasAccess) {
    // Opción 1: Redirigir al dashboard
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    // Opción 2: Mostrar mensaje de error
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Alert className="max-w-md border-red-500 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 mb-2">Acceso Denegado</h3>
              <AlertDescription className="text-red-700">
                No tienes permisos para acceder a este módulo.
                {Array.isArray(permission) ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Permisos requeridos:</p>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {permission.map((p) => (
                        <li key={p} className="font-mono text-xs">{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-2 text-sm">
                    Permiso requerido: <span className="font-mono text-xs">{permission}</span>
                  </p>
                )}
                <p className="mt-3 text-sm">
                  Contacta al administrador para solicitar los permisos necesarios.
                </p>
              </AlertDescription>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-600" />
            <p className="text-xs text-red-600 font-medium">
              Esta página está protegida por el sistema de permisos
            </p>
          </div>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
};
