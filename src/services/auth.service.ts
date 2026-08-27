import api from './api';

// Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  userId: number;
  email: string;
  nombre: string;
  cargo: string;
  rolId: number;
  nombreRol: string;
  permissions?: string[]; // Permisos granulares del JWT
  debeCambiarPassword?: boolean; // Fuerza cambio en el primer ingreso
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Decodifica el JWT y extrae los permisos
 */
function decodeToken(token: string): { permissions?: string[] } {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    console.log('🔓 [JWT] Payload completo del token:', payload);
    console.log('🔓 [JWT] Permisos en el token:', payload.permissions);
    return {
      permissions: payload.permissions || [],
    };
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return {};
  }
}

// Auth Service
export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', credentials);

    // Extraer permisos del JWT
    const tokenData = decodeToken(response.data.accessToken);
    const userWithPermissions: User = {
      ...response.data.user,
      permissions: tokenData.permissions || [],
    };

    // Store tokens and user in localStorage
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(userWithPermissions));

    return {
      ...response.data,
      user: userWithPermissions,
    };
  },

  /**
   * Refresh access token
   */
  async refresh(refreshToken: string): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/refresh', { refreshToken });

    // Extraer permisos del JWT
    const tokenData = decodeToken(response.data.accessToken);
    const userWithPermissions: User = {
      ...response.data.user,
      permissions: tokenData.permissions || [],
    };

    // Update tokens and user in localStorage
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(userWithPermissions));

    return {
      ...response.data,
      user: userWithPermissions,
    };
  },

  /**
   * Cambia la contraseña del propio usuario y baja la bandera de cambio
   * obligatorio en el usuario guardado.
   */
  async cambiarPassword(passwordActual: string, passwordNueva: string): Promise<void> {
    await api.post('/auth/cambiar-password', { passwordActual, passwordNueva });
    const actual = this.getCurrentUser();
    if (actual) {
      const actualizado = { ...actual, debeCambiarPassword: false };
      localStorage.setItem('user', JSON.stringify(actualizado));
    }
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await api.get<User>('/auth/profile');
    return response.data;
  },

  /**
   * Impersonación (solo pruebas de admin): entra como otro usuario sin su
   * contraseña. Respalda la sesión del admin para poder volver. El backend
   * verifica que quien llama sea administrador.
   */
  async impersonar(userId: number): Promise<User> {
    const response = await api.post<LoginResponse & {
      impersonatedBy: { userId: number; email: string };
    }>(`/auth/impersonar/${userId}`);

    // Respalda la sesión del admin una sola vez (por si se encadenan saltos).
    if (!localStorage.getItem('impersonacion')) {
      localStorage.setItem(
        'impersonacion',
        JSON.stringify({
          adminAccessToken: localStorage.getItem('accessToken'),
          adminRefreshToken: localStorage.getItem('refreshToken'),
          adminUser: localStorage.getItem('user'),
          adminEmail: response.data.impersonatedBy?.email ?? null,
        }),
      );
    }

    const tokenData = decodeToken(response.data.accessToken);
    const userWithPermissions: User = {
      ...response.data.user,
      permissions: tokenData.permissions || [],
    };
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(userWithPermissions));
    return userWithPermissions;
  },

  /** Restaura la sesión del administrador tras impersonar. */
  salirImpersonacion(): User | null {
    const raw = localStorage.getItem('impersonacion');
    if (!raw) return null;
    try {
      const b = JSON.parse(raw) as {
        adminAccessToken: string | null;
        adminRefreshToken: string | null;
        adminUser: string | null;
      };
      if (b.adminAccessToken) localStorage.setItem('accessToken', b.adminAccessToken);
      if (b.adminRefreshToken) localStorage.setItem('refreshToken', b.adminRefreshToken);
      if (b.adminUser) localStorage.setItem('user', b.adminUser);
    } catch {
      // Respaldo corrupto: se descarta y el usuario tendrá que reingresar.
    }
    localStorage.removeItem('impersonacion');
    return this.getCurrentUser();
  },

  /** El correo del admin real mientras se impersona; null si no se impersona. */
  getImpersonadorEmail(): string | null {
    const raw = localStorage.getItem('impersonacion');
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { adminEmail: string | null }).adminEmail;
    } catch {
      return null;
    }
  },

  /**
   * Logout - Clear tokens and user data
   */
  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonacion');
  },

  /**
   * Get stored user from localStorage
   */
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;

    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('accessToken');
    return !!token;
  },
};
