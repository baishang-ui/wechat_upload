import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  getCurrentUser,
  login,
  logout,
  AuthRequest,
} from '../miniprogram/services/auth-service'

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
