import React, { useMemo } from 'react';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';

interface PermissionGuardProps {
  /**
   * Permiso(s) requerido(s) para mostrar el contenido
   * Puede ser un string único o un array de permisos
   */
  permission: string | string[];

  /**
   * Si es true y `permission` es un array, requiere TODOS los permisos
   * Si es false (default), requiere AL MENOS UNO de los permisos
   */
  requireAll?: boolean;

  /**
   * Componente o mensaje a mostrar si el usuario NO tiene el permiso
   * Por defecto no muestra nada (null)
   */
  fallback?: React.ReactNode;

  /**
   * Contenido a mostrar si el usuario SÍ tiene el permiso
   */
  children: React.ReactNode;
}

/**
 * Componente que controla la visibilidad de su contenido basado en permisos
 *
 * @example
 * // Mostrar botón solo si tiene permiso de crear
 * <PermissionGuard permission="levantamientos:crear">
 *   <Button>Crear Nuevo</Button>
 * </PermissionGuard>
 *
 * @example
 * // Mostrar si tiene al menos uno de los permisos
 * <PermissionGuard permission={["levantamientos:editar", "levantamientos:eliminar"]}>
 *   <Button>Acciones</Button>
 * </PermissionGuard>
 *
 * @example
 * // Requiere TODOS los permisos
 * <PermissionGuard permission={["levantamientos:ver", "levantamientos:crear"]} requireAll>
 *   <AdminPanel />
 * </PermissionGuard>
 *
 * @example
 * // Con fallback personalizado
 * <PermissionGuard
 *   permission="levantamientos:aprobar"
 *   fallback={<p>No tienes permisos para aprobar</p>}
 * >
 *   <Button>Aprobar</Button>
 * </PermissionGuard>
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  requireAll = false,
  fallback = null,
  children,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useGranularPermissions();

  const hasAccess = useMemo(() => {
    if (Array.isArray(permission)) {
      return requireAll
        ? hasAllPermissions(permission)
        : hasAnyPermission(permission);
    }
    return hasPermission(permission);
  }, [permission, requireAll, hasPermission, hasAnyPermission, hasAllPermissions]);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
