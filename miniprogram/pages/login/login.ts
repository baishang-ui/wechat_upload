import { getCurrentUser, login } from '../../services/auth-service'
import { ServerClientError } from '../../services/server-client'

interface LoginInputEvent {
  detail: { value: string }
}

Page({
  data: {
    username: '',
    password: '',
    submitting: false,
    errorMessage: '',
  },

  async onLoad() {
    try {
      await getCurrentUser()
      wx.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      if (error instanceof ServerClientError && error.statusCode !== 401) {
        this.setData({ errorMessage: error.message })
      }
    }
  },

  onUsernameInput(event: LoginInputEvent) {
    this.setData({
      username: String(event.detail.value || ''),
      errorMessage: '',
    })
  },

  onPasswordInput(event: LoginInputEvent) {
    this.setData({
      password: String(event.detail.value || ''),
      errorMessage: '',
    })
  },

  async submitLogin() {
    if (this.data.submitting) return
    const username = this.data.username.trim()
    if (!username || !this.data.password) {
      this.setData({ errorMessage: '请输入用户名和密码' })
      return
    }
    this.setData({ submitting: true, errorMessage: '' })
    try {
      await login(username, this.data.password)
      this.setData({ password: '' })
      wx.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : '登录失败，请重试',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
