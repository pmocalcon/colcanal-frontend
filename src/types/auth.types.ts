/**
 * Tipos relacionados con autenticación y usuarios
 */

export interface User {
  userId: number;
  email: string;
  nombre: string;
  cargo: string;
  rolId: number;
  nombreRol: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ModulePermissions {
  ver: boolean;
  crear: boolean;
  revisar: boolean;
  aprobar: boolean;
  autorizar: boolean;
  validar: boolean;
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
