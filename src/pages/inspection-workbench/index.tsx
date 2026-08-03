import { Image, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  addLocalPhotos,
  buildInspectionWorkbench,
  removeWorkbenchPhoto,
  updateWorkbenchMeasurement,
  updateWorkbenchPhoto,
  updateWorkbenchRowField,
  workbenchToDraft,
  type InspectionPhoto,
  type InspectionWorkbench,
  type UnmatchedRecognitionRow,
} from '@legacy/domain/inspection-workbench'
import { normalizeTenValues } from '@legacy/domain/inspection-record'
import { buildOnlineInspectionTemplate } from '@legacy/domain/online-inspection-template'
import {
  getInspectionItemDetail,
  saveInspectionDraft,
  type QualityInspectionItemDetailDto,
} from '@legacy/services/quality-inspection-service'

import { request } from '@/adapters/server'
import {
  uploadInspectionEvidence,
  uploadInspectionRowPhoto,
} from '@/services/inspection-workbench'
import { UiButton } from '@/ui/button'
import { UiCard } from '@/ui/card'
import { PageHeader } from '@/ui/page-header'

import './index.scss'

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function parseUnmatched(value: unknown): UnmatchedRecognitionRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const source = item as Record<string, unknown>
    return [{
      rowKey: text(source.rowKey),
      groupTitle: text(source.groupTitle),
      project: text(source.project),
      measurements: normalizeTenValues(Array.isArray(source.measurements) ? source.measurements : []),
      reason: text(source.reason),
    }]
  })
}

export default function InspectionWorkbenchPage() {
  const router = useRouter()
  const taskId = Number(router.params.taskId)
  const itemId = Number(router.params.itemId)
  const [detail, setDetail] = useState<QualityInspectionItemDetailDto | null>(null)
  const [workbench, setWorkbench] = useState<InspectionWorkbench | null>(null)
  const [unmatched, setUnmatched] = useState<UnmatchedRecognitionRow[]>([])
  const [rawContent, setRawContent] = useState('')
  const [reportImages, setReportImages] = useState<string[]>([])
  const [inspectionImages, setInspectionImages] = useState<string[]>([])
  const [deletedRecordImages, setDeletedRecordImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingEvidence, setUploadingEvidence] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  useLoad(() => {
    if (!taskId || !itemId) {
      setLoading(false)
      setError('缺少质检任务或产品编号')
      return
    }
    void getInspectionItemDetail(taskId, itemId, request)
      .then((data) => {
        const template = buildOnlineInspectionTemplate(data)
        const nextWorkbench = buildInspectionWorkbench({
          template,
          draft: data.item.inspection_draft,
        })
        const aiResult = data.item.inspection_draft?.ai_workbench_result || {}
        setDetail(data)
        setWorkbench(nextWorkbench)
        setUnmatched(parseUnmatched(aiResult.unmatched_recognition_rows))
        setRawContent(text(aiResult.recognition_raw_content))
        setReportImages((data.item.inspection_draft?.record_source_images || []).filter((image): image is string => typeof image === 'string'))
        setInspectionImages((data.item.inspection_draft?.ai_workbench_images || []).filter((image): image is string => typeof image === 'string'))
      })
      .catch((loadError: unknown) => {
        setError(errorMessage(loadError, '检验数据加载失败'))
      })
      .finally(() => setLoading(false))
  })

  const setRows = (update: (rows: InspectionWorkbench['rows']) => InspectionWorkbench['rows']): void => {
    setWorkbench((current) => current ? { ...current, rows: update(current.rows) } : current)
    setSavedMessage('')
  }

  const uploadRowPhoto = async (
    rowKey: string,
    photoId: string,
    filePath: string,
  ): Promise<void> => {
    setRows((rows) => updateWorkbenchPhoto(rows, rowKey, photoId, {
      status: 'uploading',
      error: '',
    }))
    try {
      const uploaded = await uploadInspectionRowPhoto(taskId, itemId, rowKey, filePath)
      setRows((rows) => updateWorkbenchPhoto(rows, rowKey, photoId, {
        status: 'uploaded',
        remoteUrl: uploaded.url,
        error: '',
      }))
    } catch (uploadError) {
      setRows((rows) => updateWorkbenchPhoto(rows, rowKey, photoId, {
        status: 'failed',
        error: errorMessage(uploadError, '照片上传失败'),
      }))
    }
  }

  const chooseRowPhotos = async (rowKey: string): Promise<void> => {
    if (!workbench) return
    try {
      const result = await Taro.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })
      const paths = result.tempFiles.map((file) => file.tempFilePath)
      const previousIds = new Set(
        workbench.rows.find((row) => row.rowKey === rowKey)?.images.map((photo) => photo.id) || [],
      )
      const nextRows = addLocalPhotos(workbench.rows, rowKey, paths)
      const additions = nextRows
        .find((row) => row.rowKey === rowKey)
        ?.images.filter((photo) => !previousIds.has(photo.id)) || []
      setWorkbench({ ...workbench, rows: nextRows })
      setSavedMessage('')
      await Promise.all(additions.map((photo) => (
        uploadRowPhoto(rowKey, photo.id, photo.localPath)
      )))
    } catch {
      // 用户取消选择时保留当前检验表。
    }
  }

  const retryPhoto = (rowKey: string, photo: InspectionPhoto): void => {
    if (!photo.localPath || photo.status === 'uploading') return
    void uploadRowPhoto(rowKey, photo.id, photo.localPath)
  }

  const deletePhoto = (rowKey: string, photo: InspectionPhoto): void => {
    if (photo.remoteUrl && photo.origin !== 'ai_assignment') {
      setDeletedRecordImages((images) => images.includes(photo.remoteUrl)
        ? images
        : [...images, photo.remoteUrl])
    }
    setRows((rows) => removeWorkbenchPhoto(rows, rowKey, photo.id))
  }

  const chooseInspectionImages = async (): Promise<void> => {
    if (uploadingEvidence) return
    try {
      const result = await Taro.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })
      setUploadingEvidence(true)
      let failed = 0
      for (const file of result.tempFiles) {
        try {
          const uploaded = await uploadInspectionEvidence(taskId, itemId, file.tempFilePath)
          setInspectionImages((images) => images.includes(uploaded.url)
            ? images
            : [...images, uploaded.url])
        } catch {
          failed += 1
        }
      }
      setSavedMessage('')
      if (failed > 0) {
        await Taro.showToast({ title: `${failed} 张现场照片上传失败`, icon: 'none' })
      }
    } catch {
      // 用户取消选择时保持已上传图片。
    } finally {
      setUploadingEvidence(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!detail || !workbench || saving) return
    const pendingPhotos = workbench.rows
      .flatMap((row) => row.images)
      .filter((photo) => photo.status !== 'uploaded')
    if (pendingPhotos.length > 0) {
      await Taro.showToast({ title: '请先重试或删除未完成上传的照片', icon: 'none' })
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = workbenchToDraft(workbench, {
        metadata: {
          customer: text(detail.task.customer_name),
          supplier: text(detail.task.supplier_name),
          orderNumber: text(detail.task.contract_no),
          model: text(detail.item.spec_desc || detail.item.material_name),
          arrivalQuantity: detail.item.quantity === null || detail.item.quantity === undefined
            ? ''
            : String(detail.item.quantity),
          inspectionDate: text(detail.task.signed_date),
        },
        rawContent,
        unmatched,
        qualitySheetImages: reportImages,
        inspectionImages,
        deletedRecordImages,
        aiResult: detail.item.inspection_draft?.ai_workbench_result || {},
      })
      await saveInspectionDraft(taskId, itemId, payload, request)
      setDeletedRecordImages([])
      setSavedMessage('草稿已保存')
      await Taro.showToast({ title: '草稿已保存', icon: 'success' })
    } catch (saveError) {
      setError(errorMessage(saveError, '草稿保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='page-layout workbench-page'>
      <PageHeader title='检验工作台' />
      <View className='page-content workbench-content'>
        {loading ? <Text className='workbench-message'>正在加载正式检验表…</Text> : null}
        {error ? <Text className='workbench-error'>{error}</Text> : null}
        {detail && workbench ? (
          <>
            <UiCard className='workbench-summary'>
              <Text className='workbench-eyebrow'>QUALITY INSPECTION WORKBENCH</Text>
              <Text className='workbench-title'>{detail.item.material_name || detail.item.material_code || '未命名产品'}</Text>
              <Text className='workbench-meta'>{detail.item.spec_desc || '无规格'} · {detail.task.task_no || '未编号质检订单'}</Text>
              <View className='workbench-summary__facts'>
                <View><Text>客户</Text><Text>{detail.task.customer_name || '—'}</Text></View>
                <View><Text>供应商</Text><Text>{detail.task.supplier_name || '—'}</Text></View>
                <View><Text>采购合同</Text><Text>{detail.task.contract_no || '—'}</Text></View>
                <View><Text>正式行数</Text><Text>{workbench.rows.length}</Text></View>
              </View>
            </UiCard>

            <UiCard>
              <View className='workbench-section-heading'>
                <View>
                  <Text className='workbench-title'>现场验货图片</Text>
                  <Text className='workbench-meta'>上传后进入线上验货识别区域，不在小程序本地推断分类。</Text>
                </View>
                <UiButton
                  variant='secondary'
                  loading={uploadingEvidence}
                  onPress={() => void chooseInspectionImages()}
                >
                  添加图片
                </UiButton>
              </View>
              {inspectionImages.length > 0 ? (
                <View className='workbench-image-grid'>
                  {inspectionImages.map((image, index) => (
                    <View key={image} className='workbench-image-card'>
                      <Image
                        className='workbench-image'
                        src={image}
                        mode='aspectFill'
                        onClick={() => void Taro.previewImage({ current: image, urls: inspectionImages })}
                      />
                      <Text onClick={() => setInspectionImages((images) => images.filter((_, imageIndex) => imageIndex !== index))}>移除</Text>
                    </View>
                  ))}
                </View>
              ) : <Text className='workbench-empty-copy'>暂无现场验货图片</Text>}
              {reportImages.length > 0 ? (
                <View className='report-source-block'>
                  <Text className='workbench-row__group'>质检单来源图片 · {reportImages.length}</Text>
                  <View className='workbench-image-grid'>
                    {reportImages.map((image) => (
                      <Image
                        key={image}
                        className='workbench-image'
                        src={image}
                        mode='aspectFill'
                        onClick={() => void Taro.previewImage({ current: image, urls: reportImages })}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </UiCard>

            {unmatched.length > 0 ? (
              <UiCard className='unmatched-card'>
                <View className='workbench-section-heading'>
                  <View>
                    <Text className='workbench-title'>待人工处理的识别条目</Text>
                    <Text className='workbench-meta'>{unmatched.length} 条内容没有安全匹配到正式行。</Text>
                  </View>
                  <UiButton variant='ghost' onPress={() => setUnmatched([])}>已处理</UiButton>
                </View>
                {unmatched.map((item) => (
                  <Text key={`${item.rowKey}-${item.project}`} className='unmatched-item'>{item.project || '未命名项目'} · {item.reason}</Text>
                ))}
              </UiCard>
            ) : null}

            {workbench.rows.map((row) => (
              <UiCard key={row.rowKey} className='workbench-row'>
                <View className='workbench-row__heading'>
                  <View className='workbench-row__identity'>
                    <Text className='workbench-row__group'>{row.groupTitle || '检验项目'}</Text>
                    <Text className='workbench-title'>{row.project || '未命名项目'}</Text>
                    <Text className='workbench-meta'>{row.standard || row.method || '未填写检验标准'}</Text>
                  </View>
                  <View className='decision-actions'>
                    <UiButton
                      variant={row.decision === 'OK' ? 'primary' : 'ghost'}
                      onPress={() => setRows((rows) => updateWorkbenchRowField(rows, row.rowKey, 'decision', 'OK'))}
                    >
                      OK
                    </UiButton>
                    <UiButton
                      variant={row.decision === 'NG' ? 'danger' : 'ghost'}
                      onPress={() => setRows((rows) => updateWorkbenchRowField(rows, row.rowKey, 'decision', 'NG'))}
                    >
                      NG
                    </UiButton>
                  </View>
                </View>
                <ScrollView className='measurement-scroll' scrollX enhanced showScrollbar={false}>
                  <View className='measurement-row'>
                    {Array.from({ length: 10 }, (_, measurementIndex) => (
                      <View key={measurementIndex} className='measurement-cell'>
                        <Text>{measurementIndex + 1}</Text>
                        <Input
                          className='measurement-input'
                          value={row.measurements[measurementIndex] || ''}
                          onInput={(event) => setRows((rows) => updateWorkbenchMeasurement(
                            rows,
                            row.rowKey,
                            measurementIndex,
                            event.detail.value,
                          ))}
                        />
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Textarea
                  className='workbench-note'
                  value={row.note}
                  placeholder='填写该检验项目备注'
                  maxlength={500}
                  onInput={(event) => setRows((rows) => updateWorkbenchRowField(
                    rows,
                    row.rowKey,
                    'note',
                    event.detail.value,
                  ))}
                />
                <View className='row-photo-heading'>
                  <Text className='workbench-row__group'>{row.photoRequired ? '检验图片（必需）' : '检验图片'}</Text>
                  <UiButton variant='ghost' onPress={() => void chooseRowPhotos(row.rowKey)}>添加</UiButton>
                </View>
                {row.images.length > 0 ? (
                  <View className='row-photo-grid'>
                    {row.images.map((photo) => {
                      const source = photo.localPath || photo.remoteUrl
                      return (
                        <View key={photo.id} className={`row-photo row-photo--${photo.status}`}>
                          <Image
                            className='row-photo__image'
                            src={source}
                            mode='aspectFill'
                            onClick={() => source ? void Taro.previewImage({ current: source, urls: [source] }) : undefined}
                          />
                          <Text className='row-photo__status'>{photo.status === 'uploaded' ? '已上传' : photo.status === 'failed' ? '上传失败' : '上传中'}</Text>
                          {photo.error ? <Text className='row-photo__error'>{photo.error}</Text> : null}
                          <View className='row-photo__actions'>
                            {photo.status === 'failed' ? <Text onClick={() => retryPhoto(row.rowKey, photo)}>重试</Text> : null}
                            <Text onClick={() => deletePhoto(row.rowKey, photo)}>删除</Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                ) : <Text className='workbench-empty-copy'>尚未添加该行的检验图片</Text>}
              </UiCard>
            ))}

            <View className='workbench-save-bar'>
              <Text className='workbench-save-state'>{savedMessage || `共 ${workbench.rows.length} 条正式检验项目`}</Text>
              <UiButton loading={saving} onPress={() => void save()}>保存检验草稿</UiButton>
            </View>
          </>
        ) : null}
      </View>
    </View>
  )
}
