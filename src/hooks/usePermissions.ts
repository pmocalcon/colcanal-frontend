import { useState, useEffect } from 'react';
import { modulesService } from '@/services/modules.service';
import type { ModulePermissions } from '@/types';

interface UsePermissionsResult {
  permissions: ModulePermissions | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook para obtener los permisos del usuario para un módulo específico
 * @param moduleSlug - El slug del módulo (ej: 'compras', 'auditorias')
 */
export function usePermissions(moduleSlug: string): UsePermissionsResult {
  const [permissions, setPermissions] = useState<ModulePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setLoading(true);
        setError(null);
        const modules = await modulesService.getUserModules();
        const targetModule = modules.find(
          (m) => m.slug === moduleSlug || m.nombre.toLowerCase().includes(moduleSlug)
        );
        if (targetModule) {
          setPermissions(targetModule.permisos);
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError('Error al cargar permisos');
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [moduleSlug]);

  return { permissions, loading, error };
}
