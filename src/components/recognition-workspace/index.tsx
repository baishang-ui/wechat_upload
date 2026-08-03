import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  MAX_RECOGNITION_QUEUE_SIZE,
  appendRecognitionQueue,
  claimQueuedRecognitionItems,
  completeQueueItem,
  createRecognitionQueueItem,
  failQueueItem,
  getQueueStats,
  getTimedRecognitionProgress,
  markQueueItemRecognizing,
  removeQueueItem,
  requestQueueItemSkip,
  retryQueueItem,
  updateQueueItem,
  type RecognitionQueueItem,
} from '@legacy/domain/recognition-queue'
import { buildRecognitionReviewHints } from '@legacy/domain/recognition-review'

import { RecognitionReviewEditor } from '@/components/recognition-review-editor'
import {
  exportRecognizedInspection,
  saveRecognizedInspection,
} from '@/services/inspection-records'
import { recognizeReport } from '@/services/recognition'
import { UiButton } from '@/ui/button'
import { UiCard } from '@/ui/card'
import { Icon } from '@/ui/icon'

import './index.scss'

export interface RecognitionWorkspaceProps {
  pendingImagePath?: string
  onPendingImageConsumed?: () => void
  onHistoryChanged?: () => void
}

const statusLabels: Record<RecognitionQueueItem['status'], string> = {
  queued: '等待识别',
  preparing: '处理图片',
  recognizing: '识别中',
  ready: '待审核',
  failed: '失败',
  skipped: '已跳过',
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function RecognitionWorkspace({
  pendingImagePath = '',
  onPendingImageConsumed,
  onHistoryChanged,
}: RecognitionWorkspaceProps) {
  const [queue, setQueue] = useState<RecognitionQueueItem[]>([])
  const [reviewingId, setReviewingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const queueRef = useRef(queue)
  const activeStartedAt = useRef(new Map<string, number>())
  const sequence = useRef(0)
  const mounted = useRef(true)

  const commitQueue = useCallback((transform: (current: RecognitionQueueItem[]) => RecognitionQueueItem[]) => {
    if (!mounted.current) return
    setQueue((current) => {
      const next = transform(current)
      queueRef.current = next
      return next
    })
  }, [])

  const enqueueImages = useCallback((paths: string[]): void => {
    const uniquePaths = paths.filter(Boolean)
    if (uniquePaths.length === 0) return
    const now = Date.now()
    const additions = uniquePaths.map((imagePath, index) => {
      sequence.current += 1
      return createRecognitionQueueItem({
        id: `recognition-${now}-${sequence.current}-${index}`,
        imagePath,
        createdAt: now + index,
        sourceType: 'standalone',
        taskId: null,
        itemId: null,
        taskPrefill: null,
      })
    })
    commitQueue((current) => appendRecognitionQueue(current, additions))
  }, [commitQueue])

  useEffect(() => {
    if (!pendingImagePath) return
    enqueueImages([pendingImagePath])
    onPendingImageConsumed?.()
  }, [enqueueImages, onPendingImageConsumed, pendingImagePath])

  const runRecognition = useCallback(async (item: RecognitionQueueItem): Promise<void> => {
    activeStartedAt.current.set(item.id, Date.now())
    commitQueue((current) => markQueueItemRecognizing(current, item.id))
    try {
      const result = await recognizeReport(item.imagePath)
      const hints = buildRecognitionReviewHints(
        result.record,
        result.confidence,
        item.taskPrefill,
      )
      commitQueue((current) => completeQueueItem(current, item.id, result, hints))
    } catch (error) {
      commitQueue((current) => failQueueItem(
        current,
        item.id,
        errorMessage(error, '识别失败，请重试'),
      ))
    } finally {
      activeStartedAt.current.delete(item.id)
    }
  }, [commitQueue])

  useEffect(() => {
    const claimed = claimQueuedRecognitionItems(queue)
    if (claimed.claimed.length === 0) return
    queueRef.current = claimed.queue
    setQueue(claimed.queue)
    claimed.claimed.forEach((item) => void runRecognition(item))
  }, [queue, runRecognition])

  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => {
      commitQueue((current) => {
        if (!current.some((item) => item.status === 'preparing' || item.status === 'recognizing')) {
          return current
        }
        return current.map((item) => {
          if (item.status !== 'preparing' && item.status !== 'recognizing') return item
          const startedAt = activeStartedAt.current.get(item.id) || item.createdAt
          return updateQueueItem([item], item.id, {
            progress: getTimedRecognitionProgress(
              Date.now() - startedAt,
              undefined,
              item.progressProfile,
            ),
          })[0]
        })
      })
    }, 300)
    return () => {
      mounted.current = false
      clearInterval(timer)
      activeStartedAt.current.clear()
    }
  }, [commitQueue])

  const chooseImages = async (): Promise<void> => {
    const remaining = MAX_RECOGNITION_QUEUE_SIZE - getQueueStats(queueRef.current).total
    if (remaining <= 0) {
      await Taro.showToast({ title: '识别队列最多保留 10 张', icon: 'none' })
      return
    }
    try {
      const result = await Taro.chooseMedia({
        count: Math.min(9, remaining),
        mediaType: ['image'],
        sourceType: ['album'],
      })
      enqueueImages(result.tempFiles.map((file) => file.tempFilePath))
    } catch {
      // 用户主动取消选图时保持当前队列，不显示错误。
    }
  }

  const reviewingItem = queue.find((item) => item.id === reviewingId)
  if (reviewingItem?.status === 'ready' && reviewingItem.result && reviewingItem.reviewHints) {
    return (
      <RecognitionReviewEditor
        imagePath={reviewingItem.imagePath}
        rawContent={reviewingItem.result.rawContent}
        initialRecord={reviewingItem.result.record}
        initialHints={reviewingItem.reviewHints}
        saving={saving}
        exporting={exporting}
        onBack={(record, hints) => {
          commitQueue((current) => updateQueueItem(current, reviewingItem.id, {
            result: reviewingItem.result
              ? { ...reviewingItem.result, record }
              : null,
            reviewHints: hints,
          }))
          setReviewingId('')
        }}
        onSave={async (record) => {
          if (saving) return
          setSaving(true)
          try {
            const stored = await saveRecognizedInspection({
              imagePath: reviewingItem.imagePath,
              rawContent: reviewingItem.result?.rawContent || '',
              record,
              sourceType: reviewingItem.sourceType,
              taskId: reviewingItem.taskId,
              itemId: reviewingItem.itemId,
            })
            if (stored.syncStatus === 'synced') {
              await Taro.showToast({ title: '已保存并同步', icon: 'success' })
            } else {
              await Taro.showToast({
                title: stored.syncError || '已保存到本地，可稍后同步',
                icon: 'none',
                duration: 2500,
              })
            }
            setReviewingId('')
            commitQueue((current) => removeQueueItem(current, reviewingItem.id))
            onHistoryChanged?.()
          } catch (error) {
            await Taro.showToast({
              title: errorMessage(error, '保存失败，请重试'),
              icon: 'none',
            })
          } finally {
            setSaving(false)
          }
        }}
        onExport={async (record) => {
          if (exporting) return
          setExporting(true)
          try {
            await exportRecognizedInspection(record)
          } catch (error) {
            await Taro.showToast({
              title: errorMessage(error, '导出失败，请重试'),
              icon: 'none',
            })
          } finally {
            setExporting(false)
          }
        }}
      />
    )
  }

  const stats = getQueueStats(queue)

  return (
    <View className='recognition-workspace'>
      <UiCard className='scan-hero'>
        <Text className='section-eyebrow'>AI INSPECTION QUEUE</Text>
        <Text className='section-title'>识别检验报告</Text>
        <Text className='section-description'>识别过程中仍可继续添加报告，系统最多同时处理两张图片。</Text>
        <View className='scan-actions'>
          <UiButton block onPress={() => void Taro.navigateTo({ url: '/pages/document-camera/index' })}>
            <Icon name='camera' size={20} />
            拍摄报告
          </UiButton>
          <UiButton block variant='secondary' onPress={() => void chooseImages()}>
            从相册批量添加
          </UiButton>
        </View>
      </UiCard>

      <UiCard>
        <View className='queue-summary'>
          <View><Text className='queue-summary__value'>{stats.total}</Text><Text>队列总数</Text></View>
          <View><Text className='queue-summary__value'>{stats.active}</Text><Text>识别中</Text></View>
          <View><Text className='queue-summary__value'>{stats.ready}</Text><Text>待审核</Text></View>
          <View><Text className='queue-summary__value'>{stats.failed}</Text><Text>失败</Text></View>
        </View>
      </UiCard>

      {queue.filter((item) => item.status !== 'skipped').map((item) => (
        <UiCard key={item.id} className={`recognition-item recognition-item--${item.status}`}>
          <View className='recognition-item__body'>
            <Image
              className='recognition-item__image'
              src={item.imagePath}
              mode='aspectFill'
              onClick={() => void Taro.previewImage({ current: item.imagePath, urls: [item.imagePath] })}
            />
            <View className='recognition-item__main'>
              <View className='recognition-item__heading'>
                <Text className='recognition-item__status'>{statusLabels[item.status]}</Text>
                <Text className='recognition-item__progress'>{item.progress}%</Text>
              </View>
              <Text className='recognition-item__stage'>{item.stage}</Text>
              <View className='recognition-progress'>
                <View className='recognition-progress__value' style={{ width: `${item.progress}%` }} />
              </View>
              {item.error ? <Text className='recognition-item__error'>{item.error}</Text> : null}
              <View className='recognition-item__actions'>
                {item.status === 'ready' ? (
                  <UiButton onPress={() => setReviewingId(item.id)}>审核结果</UiButton>
                ) : null}
                {item.status === 'failed' ? (
                  <UiButton onPress={() => commitQueue((current) => retryQueueItem(current, item.id))}>重试</UiButton>
                ) : null}
                {item.status === 'preparing' || item.status === 'recognizing' ? (
                  <UiButton
                    variant='ghost'
                    disabled={item.skipRequested}
                    onPress={() => commitQueue((current) => requestQueueItemSkip(current, item.id))}
                  >
                    {item.skipRequested ? '等待跳过' : '跳过'}
                  </UiButton>
                ) : null}
                {item.status === 'queued' || item.status === 'failed' || item.status === 'ready' ? (
                  <UiButton
                    variant='ghost'
                    onPress={() => commitQueue((current) => removeQueueItem(current, item.id))}
                  >
                    删除
                  </UiButton>
                ) : null}
              </View>
            </View>
          </View>
        </UiCard>
      ))}

      {stats.total === 0 ? (
        <UiCard className='empty-state'>
          <Icon name='scan' size={42} />
          <Text className='empty-state__title'>识别队列为空</Text>
          <Text className='section-description'>完整拍入表格四角，并保持光线均匀。</Text>
        </UiCard>
      ) : null}
    </View>
  )
}
