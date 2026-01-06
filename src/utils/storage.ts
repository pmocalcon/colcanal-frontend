/**
 * Utilidades para manejo seguro de localStorage con tipado
 */

import type { User } from '@/types';

// Claves de almacenamiento
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
} as const;

type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Obtiene un valor del localStorage con manejo seguro de errores
 */
export function getStorageItem<T>(key: StorageKey, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch {
    console.warn(`Error parsing localStorage key: ${key}`);
    return defaultValue;
  }
}

/**
 * Guarda un valor en localStorage
 */
export function setStorageItem<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage key: ${key}`, error);
  }
}

/**
 * Elimina un valor del localStorage
 */
export function removeStorageItem(key: StorageKey): void {
  localStorage.removeItem(key);
}

/**
 * Obtiene el usuario actual del localStorage de forma segura
 */
export function getCurrentUserFromStorage(): User | null {
  try {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    if (!userStr) return null;
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
}

/**
 * Obtiene el token de acceso del localStorage
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Obtiene el token de refresh del localStorage
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Limpia todos los datos de autenticación del localStorage
 */
export function clearAuthStorage(): void {
  removeStorageItem(STORAGE_KEYS.ACCESS_TOKEN);
  removeStorageItem(STORAGE_KEYS.REFRESH_TOKEN);
  removeStorageItem(STORAGE_KEYS.USER);
}
