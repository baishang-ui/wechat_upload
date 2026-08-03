import {
  clearSessionCookie,
  type ServerClientError,
} from '@legacy/services/server-client'
import {
  getCurrentUser as getLegacyCurrentUser,
  login as legacyLogin,
  logout as legacyLogout,
  type AuthUser,
} from '@legacy/services/auth-service'

import { request, serverAdapter } from '@/adapters/server'

export type { AuthUser, ServerClientError }

export function login(username: string, password: string): Promise<AuthUser> {
  return legacyLogin(username, password, request)
}

export function getCurrentUser(): Promise<AuthUser> {
  return getLegacyCurrentUser(request)
}

export function logout(): Promise<void> {
  return legacyLogout(request, () => clearSessionCookie(serverAdapter))
}
