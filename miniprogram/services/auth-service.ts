import {
  clearSessionCookie,
  serverRequest,
  ServerRequestOptions,
} from './server-client'

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
  return data.user
}

export async function getCurrentUser(
  request: AuthRequest = serverRequest,
): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>({
    method: 'GET',
    path: '/api/miniprogram/auth/me',
  })
  return data.user
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
