import api from './api';

// ============ TIPOS ============

export interface Role {
  rolId: number;
  nombreRol: string;
  descripcion?: string;
  category?: string;
  defaultModule?: string;
  rolePermissions?: RolePermission[];
  roleGestiones?: RoleGestion[];
  users?: User[];
}

export interface RoleGestion {
  gestionId: number;
  gestion: Gestion;
}

export interface CreateRoleDto {
  nombreRol: string;
  descripcion?: string;
  category?: string;
  defaultModule?: string;
  permisoIds?: number[];
  gestionIds?: number[];
}

export interface UpdateRoleDto {
  nombreRol?: string;
  descripcion?: string;
  category?: string;
  defaultModule?: string;
}

export interface Permission {
  permisoId: number;
  nombrePermiso: string;
  descripcion?: string;
}

export interface RolePermission {
  permisoId: number;
  permission: Permission;
}

export interface User {
  userId: number;
  email: string;
  nombre: string;
  cargo: string;
  rolId: number;
  estado: boolean;
  role?: Role;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  nombre: string;
  cargo: string;
  rolId: number;
  estado?: boolean;
}

export interface UpdateUserDto {
  nombre?: string;
  cargo?: string;
  rolId?: number;
  password?: string;
}

export interface Gestion {
  gestionId: number;
  nombre: string;
  slug: string;
  icono?: string;
}

// Autorizaciones
export interface AuthorizationUser {
  userId: number;
  nombre: string;
  cargo: string;
  email?: string;
  rol?: string;
}

export interface Authorization {
  authorizationId: number;
  usuario: AuthorizationUser;
  tipoAutorizacion: 'revision' | 'autorizacion' | 'aprobacion';
  nivel: number;
  gestion?: string;
}

export interface UserAuthorizations {
  userId: number;
  nombre: string;
  subordinados: Authorization[];
  supervisores: Authorization[];
}

export interface HierarchyEntry {
  autorizador: AuthorizationUser;
  subordinados: Authorization[];
}

export interface CreateAuthorizationDto {
  usuarioAutorizadoId: number;
  tipoAutorizacion: 'revision' | 'autorizacion' | 'aprobacion';
  gestionId?: number;
}

export interface BulkAuthorizationDto {
  usuarioAutorizadorId: number;
  usuariosAutorizadosIds: number[];
  tipoAutorizacion: 'revision' | 'autorizacion' | 'aprobacion';
  gestionId?: number;
}

export interface BulkAuthorizationResponse {
  created: number;
  skipped: number;
  errors: string[];
}

// ============ SERVICIO ============

export const usersService = {
  // ============ CRUD USUARIOS ============

  /**
   * Listar todos los usuarios
   */
  async getAll(includeInactive: boolean = false): Promise<User[]> {
    const response = await api.get<User[]>('/users', {
      params: { includeInactive },
    });
    return response.data;
  },

  /**
   * Obtener un usuario por ID
   */
  async getById(userId: number): Promise<User> {
    const response = await api.get<User>(`/users/${userId}`);
    return response.data;
  },

  /**
   * Crear un nuevo usuario
   */
  async create(data: CreateUserDto): Promise<User> {
    const response = await api.post<User>('/users', data);
    return response.data;
  },

  /**
   * Actualizar un usuario
   */
  async update(userId: number, data: UpdateUserDto): Promise<User> {
    const response = await api.patch<User>(`/users/${userId}`, data);
    return response.data;
  },

  /**
   * Activar un usuario
   */
  async activate(userId: number): Promise<{ message: string }> {
    const response = await api.patch<{ message: string }>(`/users/${userId}/activate`);
    return response.data;
  },

  /**
   * Desactivar un usuario
   */
  async deactivate(userId: number): Promise<{ message: string }> {
    const response = await api.patch<{ message: string }>(`/users/${userId}/deactivate`);
    return response.data;
  },

  // ============ ROLES Y PERMISOS ============

  /**
   * Listar todos los roles
   */
  async getRoles(): Promise<Role[]> {
    const response = await api.get<Role[]>('/users/roles');
    return response.data;
  },

  /**
   * Obtener un rol por ID con permisos y gestiones
   */
  async getRoleById(rolId: number): Promise<Role> {
    const response = await api.get<Role>(`/users/roles/${rolId}`);
    return response.data;
  },

  /**
   * Crear un nuevo rol
   */
  async createRole(data: CreateRoleDto): Promise<Role> {
    const response = await api.post<Role>('/users/roles', data);
    return response.data;
  },

  /**
   * Actualizar un rol
   */
  async updateRole(rolId: number, data: UpdateRoleDto): Promise<Role> {
    const response = await api.patch<Role>(`/users/roles/${rolId}`, data);
    return response.data;
  },

  /**
   * Eliminar un rol (solo si no tiene usuarios)
   */
  async deleteRole(rolId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/users/roles/${rolId}`);
    return response.data;
  },

  /**
   * Asignar permisos a un rol (reemplaza los existentes)
   */
  async assignPermissionsToRole(rolId: number, permisoIds: number[]): Promise<Role> {
    const response = await api.put<Role>(`/users/roles/${rolId}/permissions`, { permisoIds });
    return response.data;
  },

  /**
   * Asignar gestiones/módulos a un rol (reemplaza los existentes)
   */
  async assignGestionesToRole(rolId: number, gestionIds: number[]): Promise<Role> {
    const response = await api.put<Role>(`/users/roles/${rolId}/gestiones`, { gestionIds });
    return response.data;
  },

  /**
   * Obtener gestiones de un rol
   */
  async getRoleGestiones(rolId: number): Promise<Gestion[]> {
    const response = await api.get<Gestion[]>(`/users/roles/${rolId}/gestiones`);
    return response.data;
  },

  /**
   * Listar todos los permisos
   */
  async getPermissions(): Promise<Permission[]> {
    const response = await api.get<Permission[]>('/users/permissions');
    return response.data;
  },

  /**
   * Obtener permisos de un rol específico
   */
  async getRolePermissions(rolId: number): Promise<{ role: Role; permissions: Permission[] }> {
    const response = await api.get<{ role: Role; permissions: Permission[] }>(
      `/users/roles/${rolId}/permissions`
    );
    return response.data;
  },

  // ============ GESTIONES/MÓDULOS ============

  /**
   * Listar gestiones/módulos
   */
  async getGestiones(): Promise<Gestion[]> {
    const response = await api.get<Gestion[]>('/users/gestiones');
    return response.data;
  },

  // ============ AUTORIZACIONES (JERARQUÍA) ============

  /**
   * Obtener jerarquía completa
   */
  async getHierarchy(): Promise<HierarchyEntry[]> {
    const response = await api.get<HierarchyEntry[]>('/users/hierarchy');
    return response.data;
  },

  /**
   * Obtener autorizaciones de un usuario
   */
  async getUserAuthorizations(userId: number): Promise<UserAuthorizations> {
    const response = await api.get<UserAuthorizations>(`/users/${userId}/authorizations`);
    return response.data;
  },

  /**
   * Obtener usuarios disponibles para asignar como subordinados
   */
  async getAvailableSubordinates(
    userId: number,
    tipo?: 'revision' | 'autorizacion' | 'aprobacion'
  ): Promise<AuthorizationUser[]> {
    const params = tipo ? { tipo } : {};
    const response = await api.get<AuthorizationUser[]>(
      `/users/${userId}/available-subordinates`,
      { params }
    );
    return response.data;
  },

  /**
   * Crear autorización (asignar subordinado)
   */
  async createAuthorization(userId: number, data: CreateAuthorizationDto): Promise<Authorization> {
    const response = await api.post<Authorization>(`/users/${userId}/authorizations`, data);
    return response.data;
  },

  /**
   * Crear múltiples autorizaciones
   */
  async createBulkAuthorizations(data: BulkAuthorizationDto): Promise<BulkAuthorizationResponse> {
    const response = await api.post<BulkAuthorizationResponse>('/users/authorizations/bulk', data);
    return response.data;
  },

  /**
   * Eliminar autorización
   */
  async deleteAuthorization(authorizationId: number): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(
      `/users/authorizations/${authorizationId}`
    );
    return response.data;
  },
};
