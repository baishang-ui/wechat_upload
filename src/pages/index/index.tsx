import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { DEMO_MODE } from '@legacy/config/server'
import { loadInspectionHistory } from '@legacy/services/history-service'
import {
  listInspectionHistory,
  listInspectionTasks,
  mergeInspectionHistory,
  TASK_PAGE_SIZE,
  type HistoryViewItem,
  type QualityInspectionTaskDto,
} from '@legacy/services/quality-inspection-service'
import { ServerClientError } from '@legacy/services/server-client'
import type { WorkspaceTab } from '@legacy/domain/tab-swipe'

import { historyAdapter } from '@/adapters/history'
import { request } from '@/adapters/server'
import { RecognitionWorkspace } from '@/components/recognition-workspace'
import { WorkspaceTabs } from '@/components/workspace-tabs'
import { getCurrentUser, logout, type AuthUser } from '@/services/auth'
import { UiButton } from '@/ui/button'
import { UiCard } from '@/ui/card'
import { PageHeader } from '@/ui/page-header'

import './index.scss'

const titles: Record<WorkspaceTab, string> = {
  scan: '检验报告识别',
  tasks: '采购待检任务',
  history: '识别记录',
  account: '账户',
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function WorkspacePage() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('scan')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [accountLoading, setAccountLoading] = useState(!DEMO_MODE)
  const [accountError, setAccountError] = useState(DEMO_MODE ? '演示模式不包含登录账户' : '')
  const [loggingOut, setLoggingOut] = useState(false)
  const [taskItems, setTaskItems] = useState<QualityInspectionTaskDto[]>([])
  const [taskTotal, setTaskTotal] = useState(0)
  const [taskInitialized, setTaskInitialized] = useState(false)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskAppliedSearch, setTaskAppliedSearch] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState(0)
  const [historyItems, setHistoryItems] = useState<HistoryViewItem[]>([])
  const [historyInitialized, setHistoryInitialized] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [pendingImagePath, setPendingImagePath] = useState('')

  const loadAccount = useCallback(async (): Promise<void> => {
    if (DEMO_MODE) return
    setAccountLoading(true)
    setAccountError('')
    try {
      setCurrentUser(await getCurrentUser())
    } catch (error) {
      if (error instanceof ServerClientError && error.statusCode === 401) {
        await Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      setAccountError(errorMessage(error, '账户信息加载失败'))
    } finally {
      setAccountLoading(false)
    }
  }, [])

  const loadTasks = useCallback(async (): Promise<void> => {
    if (taskLoading) return
    setTaskInitialized(true)
    setTaskLoading(true)
    setTaskError('')
    try {
      const data = await listInspectionTasks({
        page: 1,
        pageSize: TASK_PAGE_SIZE,
        search: taskAppliedSearch || undefined,
        status: 'pending',
        sourceType: 'all',
        compact: true,
      }, request)
      setTaskItems(data.items)
      setTaskTotal(data.total)
    } catch (error) {
      setTaskError(errorMessage(error, '待检任务加载失败'))
    } finally {
      setTaskLoading(false)
    }
  }, [taskAppliedSearch, taskLoading])

  const loadHistory = useCallback(async (): Promise<void> => {
    if (historyLoading) return
    setHistoryInitialized(true)
    const local = loadInspectionHistory(historyAdapter)
    setHistoryItems((items) => items.length > 0 ? items : mergeInspectionHistory(local, []))
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const data = await listInspectionHistory(1, 100, request)
      setHistoryItems(mergeInspectionHistory(
        loadInspectionHistory(historyAdapter),
        data.items,
      ))
    } catch (error) {
      setHistoryError(errorMessage(error, '线上记录加载失败，已显示本地记录'))
    } finally {
      setHistoryLoading(false)
    }
  }, [historyLoading])

  useLoad(() => {
    void loadAccount()
  })

  useDidShow(() => {
    const cameraImage = String(Taro.getStorageSync('taroMigration:pendingCameraImage') || '')
    if (!cameraImage) return
    setPendingImagePath(cameraImage)
  })

  useEffect(() => {
    if (activeTab === 'tasks' && !taskInitialized) void loadTasks()
    if (activeTab === 'history' && !historyInitialized) void loadHistory()
  }, [activeTab, historyInitialized, loadHistory, loadTasks, taskInitialized])

  const applyTaskSearch = (): void => {
    setTaskAppliedSearch(taskSearch.trim())
    setTaskInitialized(false)
    setTaskItems([])
    setExpandedTaskId(0)
  }

  const consumePendingImage = useCallback((): void => {
    Taro.removeStorageSync('taroMigration:pendingCameraImage')
    setPendingImagePath('')
  }, [])

  const handleHistoryChanged = useCallback((): void => {
    setHistoryInitialized(false)
  }, [])

  const confirmLogout = async (): Promise<void> => {
    if (loggingOut) return
    const result = await Taro.showModal({
      title: '退出登录',
      content: '退出后需要重新登录，是否继续？',
      confirmText: '退出',
      confirmColor: '#b93d49',
    })
    if (!result.confirm) return
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 无论服务端会话是否可达，都清理本机受管 Session 并返回登录页。
    } finally {
      setLoggingOut(false)
      await Taro.reLaunch({ url: '/pages/login/index' })
    }
  }

  return (
    <View className='page-layout workspace-page'>
      <PageHeader title={titles[activeTab]} />
      <ScrollView className='workspace-scroll' scrollY enhanced showScrollbar={false}>
        <View className='page-content workspace-content'>
          {activeTab === 'scan' ? (
            <RecognitionWorkspace
              pendingImagePath={pendingImagePath}
              onPendingImageConsumed={consumePendingImage}
              onHistoryChanged={handleHistoryChanged}
            />
          ) : null}

          {activeTab === 'tasks' ? (
            <View className='workspace-stack'>
              <UiCard className='task-toolbar'>
                <View className='toolbar-heading'>
                  <View>
                    <Text className='section-eyebrow'>QUALITY INSPECTION ORDER</Text>
                    <Text className='section-title'>质检订单</Text>
                  </View>
                  <Text className='toolbar-count'>{taskTotal} 项</Text>
                </View>
                <View className='search-row'>
                  <Input
                    className='search-input'
                    value={taskSearch}
                    placeholder='搜索质检单号、采购合同、客户或供应商'
                    onInput={(event) => setTaskSearch(event.detail.value)}
                    onConfirm={applyTaskSearch}
                  />
                  <UiButton onPress={applyTaskSearch}>搜索</UiButton>
                </View>
              </UiCard>
              {taskError ? <Text className='inline-error'>{taskError}</Text> : null}
              {taskItems.map((task) => (
                <UiCard key={task.id} className='task-card'>
                  <View className='task-card__head' onClick={() => setExpandedTaskId(task.id === expandedTaskId ? 0 : task.id)}>
                    <View>
                      <Text className='task-card__kicker'>质检订单</Text>
                      <Text className='task-card__title'>{task.task_no || '未编号质检订单'}</Text>
                      <Text className='task-card__meta'>采购合同：{task.contract_no || '—'}</Text>
                      <Text className='task-card__meta'>{task.customer_name || '未填写客户'} · {task.supplier_name || '未填写供应商'}</Text>
                    </View>
                    <Text className='task-card__badge'>{task.items?.length || 0} 项</Text>
                  </View>
                  {expandedTaskId === task.id ? (
                    <View className='task-products'>
                      {(task.items || []).map((item) => (
                        <View
                          key={item.id}
                          className='task-product'
                          onClick={() => void Taro.navigateTo({
                            url: `/pages/inspection-workbench/index?taskId=${task.id}&itemId=${item.id}`,
                          })}
                        >
                          <View>
                            <Text className='task-product__name'>{item.material_name || item.material_code || '未命名产品'}</Text>
                            <Text className='task-card__meta'>{item.spec_desc || '无规格'}</Text>
                          </View>
                          <Text className='task-product__action'>进入检验</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </UiCard>
              ))}
              {taskLoading ? <Text className='loading-copy'>正在加载待检任务…</Text> : null}
              {!taskLoading && taskItems.length === 0 ? (
                <UiCard className='empty-state'><Text className='empty-state__title'>暂无待检任务</Text></UiCard>
              ) : null}
            </View>
          ) : null}

          {activeTab === 'history' ? (
            <View className='workspace-stack'>
              <View className='list-heading'>
                <View>
                  <Text className='section-eyebrow'>INSPECTION HISTORY</Text>
                  <Text className='section-title'>识别记录</Text>
                </View>
                <UiButton variant='ghost' loading={historyLoading} onPress={() => void loadHistory()}>刷新</UiButton>
              </View>
              {historyError ? <Text className='inline-error'>{historyError}</Text> : null}
              {historyItems.map((item) => (
                <UiCard key={item.id} className='history-card'>
                  <View className='history-card__row'>
                    {item.imagePath ? <Image className='history-card__image' src={item.imagePath} mode='aspectFill' /> : null}
                    <View className='history-card__main'>
                      <View className='history-card__heading'>
                        <Text className='task-card__title'>{item.productLabel}</Text>
                        <Text className={`sync-badge sync-badge--${item.syncStatus}`}>{item.syncStatus}</Text>
                      </View>
                      <Text className='task-card__meta'>{item.customer || '未填写客户'} · {item.supplier || '未填写供应商'}</Text>
                      <Text className='task-card__meta'>{item.inspectionDate || '无检验日期'} · {item.updatedLabel}</Text>
                    </View>
                  </View>
                </UiCard>
              ))}
              {!historyLoading && historyItems.length === 0 ? (
                <UiCard className='empty-state'><Text className='empty-state__title'>暂无识别记录</Text></UiCard>
              ) : null}
            </View>
          ) : null}

          {activeTab === 'account' ? (
            <View className='workspace-stack'>
              <UiCard className='account-card'>
                <View className='account-avatar'>{(currentUser?.real_name || currentUser?.username || '账').slice(0, 1)}</View>
                <Text className='account-name'>{currentUser?.real_name || currentUser?.username || '未登录账户'}</Text>
                <Text className='section-description'>{currentUser?.role || accountError || (accountLoading ? '正在读取账户…' : '')}</Text>
                <View className='account-details'>
                  <View><Text>用户名</Text><Text>{currentUser?.username || '—'}</Text></View>
                  <View><Text>权限数量</Text><Text>{currentUser?.permissions.length || 0}</Text></View>
                </View>
                <UiButton block variant='danger' loading={loggingOut} onPress={() => void confirmLogout()}>退出登录</UiButton>
              </UiCard>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <WorkspaceTabs activeTab={activeTab} onChange={setActiveTab} />
    </View>
  )
}
