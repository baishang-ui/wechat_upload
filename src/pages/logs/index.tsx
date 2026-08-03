import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'

import { PageHeader } from '@/ui/page-header'
import { UiCard } from '@/ui/card'

import './index.scss'

interface LogItem {
  timestamp: string
  label: string
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([])

  useLoad(() => {
    const stored = Taro.getStorageSync<string[]>('logs') || []
    setLogs(stored.map((timestamp) => ({
      timestamp,
      label: new Date(timestamp).toLocaleString('zh-CN'),
    })))
  })

  return (
    <View className='page-layout'>
      <PageHeader title='查看启动日志' />
      <View className='page-content logs-list'>
        {logs.map((log, index) => (
          <UiCard key={log.timestamp}>
            <Text className='log-copy'>{index + 1}. {log.label}</Text>
          </UiCard>
        ))}
        {logs.length === 0 ? <Text className='logs-empty'>暂无启动日志</Text> : null}
      </View>
    </View>
  )
}
