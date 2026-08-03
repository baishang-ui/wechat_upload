import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'

import { DEMO_MODE } from '@legacy/config/server'
import { ServerClientError } from '@legacy/services/server-client'

import { getCurrentUser, login } from '@/services/auth'
import { UiButton } from '@/ui/button'
import { UiCard } from '@/ui/card'
import { UiField } from '@/ui/field'
import { PageHeader } from '@/ui/page-header'

import './index.scss'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useLoad(() => {
    if (DEMO_MODE) {
      void Taro.reLaunch({ url: '/pages/index/index' })
      return
    }
    void getCurrentUser()
      .then(() => Taro.reLaunch({ url: '/pages/index/index' }))
      .catch((error: unknown) => {
        if (error instanceof ServerClientError && error.statusCode !== 401) {
          setErrorMessage(error.message)
        }
      })
  })

  const submit = async (): Promise<void> => {
    if (submitting) return
    const normalizedUsername = username.trim()
    if (!normalizedUsername || !password) {
      setErrorMessage('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    setErrorMessage('')
    try {
      await login(normalizedUsername, password)
      setPassword('')
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='page-layout login-page'>
      <PageHeader title='账号登录' />
      <View className='login-content'>
        <View className='login-intro'>
          <Text className='brand-mark'>BINIC INSPECTION</Text>
          <Text className='login-title'>质量检验工作台</Text>
          <Text className='login-subtitle'>连接智能销售系统，处理采购待检任务与检验报告。</Text>
        </View>

        <UiCard className='login-card'>
          <Text className='login-form-heading'>账号登录</Text>
          <Text className='login-form-description'>使用智能销售系统账号继续</Text>
          <View className='login-fields'>
            <UiField
              label='用户名'
              value={username}
              placeholder='请输入用户名'
              disabled={submitting}
              onValueChange={(value) => {
                setUsername(value)
                setErrorMessage('')
              }}
            />
            <UiField
              label='密码'
              value={password}
              placeholder='请输入密码'
              password
              disabled={submitting}
              onValueChange={(value) => {
                setPassword(value)
                setErrorMessage('')
              }}
              onConfirm={() => void submit()}
            />
          </View>
          {errorMessage ? (
            <View className='login-error'>
              <View className='login-error__dot' />
              <Text>{errorMessage}</Text>
            </View>
          ) : null}
          <UiButton block loading={submitting} onPress={() => void submit()}>
            登录
          </UiButton>
        </UiCard>
      </View>
    </View>
  )
}
