import api from './api';

// Types
export interface ModulePermissions {
  ver: boolean;
  crear: boolean;
  revisar: boolean;
  aprobar: boolean;
  autorizar: boolean;
  cotizar: boolean;
  exportar: boolean;
}

export interface Module {
  gestionId: number;
  nombre: string;
  slug: string;
  icono: string;
  hasAccess: boolean;
  permisos: ModulePermissions;
}

// Modules Service
export const modulesService = {
  /**
   * Get all modules for the authenticated user
   */
  async getUserModules(): Promise<Module[]> {
    const response = await api.get<Module[]>('/auth/modules');
    return response.data;
  },
};
