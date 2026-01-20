import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook para verificar permisos granulares del usuario
 * Los permisos siguen el formato: "modulo:accion"
 * Ejemplo: "levantamientos:crear", "levantamientos:editar", etc.
 */
export const useGranularPermissions = () => {
  const { user } = useAuth();

  /**
   * Verifica si el usuario tiene un permiso específico
   * @param permission - El permiso a verificar (ej: "levantamientos:crear")
   * @returns true si el usuario tiene el permiso, false si no
   */
  const hasPermission = useMemo(() => {
    return (permission: string): boolean => {
      if (!user?.permissions) return false;
      return user.permissions.includes(permission);
    };
  }, [user?.permissions]);

  /**
   * Verifica si el usuario tiene al menos uno de los permisos especificados
   * @param permissions - Array de permisos a verificar
   * @returns true si el usuario tiene al menos uno, false si no tiene ninguno
   */
  const hasAnyPermission = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (!user?.permissions) return false;
      return permissions.some((p) => user.permissions!.includes(p));
    };
  }, [user?.permissions]);

  /**
   * Verifica si el usuario tiene todos los permisos especificados
   * @param permissions - Array de permisos a verificar
   * @returns true si el usuario tiene todos, false si le falta alguno
   */
  const hasAllPermissions = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (!user?.permissions) return false;
      return permissions.every((p) => user.permissions!.includes(p));
    };
  }, [user?.permissions]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions: user?.permissions || [],
  };
};
