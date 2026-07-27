import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  getCurrentUser,
  login,
  logout,
  AuthRequest,
} from '../miniprogram/services/auth-service'
import { DATA_SERVER_BASE_URL } from '../miniprogram/config/server'

const user = {
  id: 7,
  username: 'inspector',
  real_name: '检验员',
  role: 'sales',
  permissions: ['procurement'],
  avatar_url: '',
}

test('login posts JSON credentials and returns the current user', async () => {
  const calls: Array<Record<string, unknown>> = []
  const request: AuthRequest = async <T>(options: Record<string, unknown>) => {
    calls.push(options)
    return { user } as T
  }
  assert.deepEqual(await login(' inspector ', 'secret', request), user)
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: '/api/miniprogram/auth/login',
    data: { username: 'inspector', password: 'secret' },
  })
})

test('getCurrentUser reads the server session', async () => {
  const request: AuthRequest = async <T>() => ({ user } as T)
  assert.deepEqual(await getCurrentUser(request), user)
})

test('auth responses resolve server-relative avatar paths for miniprogram images', async () => {
  const relativeAvatarUser = {
    ...user,
    avatar_url: '/static/avatars/avatar_42_female_young.png',
  }
  const request: AuthRequest = async <T>() => ({ user: relativeAvatarUser } as T)

  assert.equal(
    (await getCurrentUser(request)).avatar_url,
    `${DATA_SERVER_BASE_URL}/static/avatars/avatar_42_female_young.png`,
  )
  assert.equal(
    (await login('Nicole', 'secret', request)).avatar_url,
    `${DATA_SERVER_BASE_URL}/static/avatars/avatar_42_female_young.png`,
  )
})

test('auth responses preserve absolute avatar URLs', async () => {
  const absoluteAvatarUser = {
    ...user,
    avatar_url: 'https://cdn.example.com/users/inspector.png',
  }
  const request: AuthRequest = async <T>() => ({ user: absoluteAvatarUser } as T)

  assert.equal(
    (await getCurrentUser(request)).avatar_url,
    absoluteAvatarUser.avatar_url,
  )
})

test('logout clears local session even when the network request fails', async () => {
  let cleared = false
  await assert.rejects(
    () => logout(
      async () => { throw new Error('offline') },
      () => { cleared = true },
    ),
    /offline/,
  )
  assert.equal(cleared, true)
})
