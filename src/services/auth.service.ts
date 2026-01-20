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
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await api.get<User>('/auth/profile');
    return response.data;
  },

  /**
   * Logout - Clear tokens and user data
   */
  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
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
