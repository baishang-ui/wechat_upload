import {
  clearSessionCookie,
  serverRequest,
  ServerRequestOptions,
} from './server-client'
import { DATA_SERVER_BASE_URL } from '../config/server'

export interface AuthUser {
  id: number
  username: string
  real_name: string
  role: string
  permissions: string[]
  avatar_url: string
}

export type AuthRequest = <T>(options: ServerRequestOptions) => Promise<T>
export type ClearSession = () => void

function normalizeAvatarUrl(value: string): string {
  const avatarUrl = String(value || '').trim()
  if (!avatarUrl || /^(?:https?:|data:|wxfile:)/i.test(avatarUrl)) return avatarUrl
  if (avatarUrl.startsWith('//')) {
    const protocol = DATA_SERVER_BASE_URL.startsWith('http://') ? 'http:' : 'https:'
    return `${protocol}${avatarUrl}`
  }
  return `${DATA_SERVER_BASE_URL.replace(/\/$/, '')}/${avatarUrl.replace(/^\/+/, '')}`
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    avatar_url: normalizeAvatarUrl(user.avatar_url),
  }
}

export async function login(
  username: string,
  password: string,
  request: AuthRequest = serverRequest,
): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>({
    method: 'POST',
    path: '/api/miniprogram/auth/login',
    data: { username: username.trim(), password },
  })
  return normalizeAuthUser(data.user)
}

export async function getCurrentUser(
  request: AuthRequest = serverRequest,
): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>({
    method: 'GET',
    path: '/api/miniprogram/auth/me',
  })
  return normalizeAuthUser(data.user)
}

export async function logout(
  request: AuthRequest = serverRequest,
  clear: ClearSession = clearSessionCookie,
): Promise<void> {
  try {
    await request<Record<string, never>>({
      method: 'POST',
      path: '/api/miniprogram/auth/logout',
    })
  } finally {
    clear()
  }
}
