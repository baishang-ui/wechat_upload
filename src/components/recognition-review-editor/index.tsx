import { Image, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

import {
  MEASUREMENT_COUNT,
  PRODUCT_OPTIONS,
  updateMeasurement,
  updateRecordField,
  updateRowField,
  updateSampleJudgement,
  validateRecord,
  type InspectionRecord,
  type InspectionRowField,
  type Judgement,
  type ProductType,
} from '@legacy/domain/inspection-record'
import {
  hasUnreviewedDanger,
  markReviewHintReviewed,
  type FieldReviewHint,
  type RecognitionReviewHints,
} from '@legacy/domain/recognition-review'

import { UiButton } from '@/ui/button'
import { UiCard } from '@/ui/card'
import { UiField } from '@/ui/field'

import './index.scss'

type EditableRecordField =
  | 'customer'
  | 'supplier'
  | 'trademark'
  | 'orderNumber'
  | 'model'
  | 'arrivalQuantity'
  | 'inspectionDate'
  | 'reviewer'
  | 'inspector'

export interface RecognitionReviewEditorProps {
  imagePath: string
  rawContent: string
  initialRecord: InspectionRecord
  initialHints: RecognitionReviewHints
  saving: boolean
  exporting: boolean
  onBack: (record: InspectionRecord, hints: RecognitionReviewHints) => void
  onSave: (record: InspectionRecord, hints: RecognitionReviewHints) => void | Promise<void>
  onExport: (record: InspectionRecord) => void | Promise<void>
}

const recordFields: Array<{
  field: EditableRecordField
  label: string
  placeholder: string
}> = [
  { field: 'customer', label: '客户', placeholder: '请输入客户名称' },
  { field: 'supplier', label: '供应商', placeholder: '请输入供应商名称' },
  { field: 'trademark', label: '商标', placeholder: '请输入商标' },
  { field: 'orderNumber', label: '采购合同号', placeholder: '用于匹配采购待检任务' },
  { field: 'model', label: '型号/规格', placeholder: '请输入型号或规格' },
  { field: 'arrivalQuantity', label: '到货数量', placeholder: '请输入到货数量' },
  { field: 'inspectionDate', label: '检验日期', placeholder: 'YYYY-MM-DD' },
  { field: 'reviewer', label: '审核人', placeholder: '请输入审核人' },
  { field: 'inspector', label: '检验员', placeholder: '请输入检验员' },
]

function reviewClass(hint?: FieldReviewHint): string {
  return hint?.cssClass || ''
}

function hintCopy(hint?: FieldReviewHint): string {
  if (!hint || hint.reviewed || hint.level === 'normal') return ''
  return hint.reason || (hint.level === 'danger' ? '重点核对' : '建议核对')
}

export function RecognitionReviewEditor({
  imagePath,
  rawContent,
  initialRecord,
  initialHints,
  saving,
  exporting,
  onBack,
  onSave,
  onExport,
}: RecognitionReviewEditorProps) {
  const [record, setRecord] = useState(initialRecord)
  const [hints, setHints] = useState(initialHints)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    setRecord(initialRecord)
    setHints(initialHints)
    setShowRaw(false)
  }, [initialHints, initialRecord])

  const reviewPath = (path: string): void => {
    setHints((current) => markReviewHintReviewed(current, path))
  }

  const changeRecordField = (field: EditableRecordField, value: string): void => {
    setRecord((current) => updateRecordField(current, field, value))
    reviewPath(`record.${field}`)
  }

  const changeProductType = (value: ProductType): void => {
    setRecord((current) => updateRecordField(current, 'productType', value))
  }

  const changeRowField = (
    rowIndex: number,
    field: InspectionRowField,
    value: string,
  ): void => {
    setRecord((current) => updateRowField(current, rowIndex, field, value))
    reviewPath(`rows.${rowIndex}.${field}`)
  }

  const changeMeasurement = (
    rowIndex: number,
    measurementIndex: number,
    value: string,
  ): void => {
    setRecord((current) => updateMeasurement(current, rowIndex, measurementIndex, value))
    reviewPath(`rows.${rowIndex}.measurements.${measurementIndex}`)
  }

  const changeJudgement = (sampleIndex: number, value: Judgement): void => {
    setRecord((current) => updateSampleJudgement(current, sampleIndex, value))
    reviewPath(`sampleJudgements.${sampleIndex}`)
  }

  const submit = async (): Promise<void> => {
    const missing = validateRecord(record)
    if (missing.length > 0) {
      await Taro.showModal({
        title: '请完善检验信息',
        content: missing.join('、'),
        showCancel: false,
      })
      return
    }
    if (hasUnreviewedDanger(hints)) {
      const confirmation = await Taro.showModal({
        title: '仍有重点核对项',
        content: `还有 ${hints.dangerCount} 项未人工核对，确认仍要保存吗？`,
        confirmText: '继续保存',
        confirmColor: '#b93d49',
      })
      if (!confirmation.confirm) return
    }
    await onSave(record, hints)
  }

  const productIndex = Math.max(
    0,
    PRODUCT_OPTIONS.findIndex((option) => option.value === record.productType),
  )

  return (
    <View className='recognition-review'>
      <View className='review-toolbar'>
        <UiButton variant='ghost' onPress={() => onBack(record, hints)}>返回队列</UiButton>
        <View className='review-toolbar__actions'>
          <UiButton
            variant='secondary'
            loading={exporting}
            disabled={saving}
            onPress={() => void onExport(record)}
          >
            导出 JSON
          </UiButton>
          <UiButton loading={saving} disabled={exporting} onPress={() => void submit()}>
            保存并同步
          </UiButton>
        </View>
      </View>

      <UiCard className='review-overview'>
        <View className='review-overview__image-wrap' onClick={() => void Taro.previewImage({ current: imagePath, urls: [imagePath] })}>
          <Image className='review-overview__image' src={imagePath} mode='aspectFill' />
          <Text>查看原图</Text>
        </View>
        <View className='review-overview__main'>
          <Text className='review-title'>人工审核识别结果</Text>
          <Text className='review-description'>修改字段即视为已核对。保存前请优先处理红色项目。</Text>
          <View className='review-risk-summary'>
            <Text className='review-risk review-risk--danger'>重点核对 {hints.dangerCount}</Text>
            <Text className='review-risk review-risk--warning'>建议核对 {hints.warningCount}</Text>
          </View>
        </View>
      </UiCard>

      <UiCard>
        <Text className='review-section-title'>报告信息</Text>
        <View className='review-field-grid'>
          <View className='review-field'>
            <Text className='review-field__label'>产品类型</Text>
            <Picker
              mode='selector'
              range={PRODUCT_OPTIONS.map((option) => option.label)}
              value={productIndex}
              onChange={(event) => {
                const selected = PRODUCT_OPTIONS[Number(event.detail.value)]
                if (selected) changeProductType(selected.value)
              }}
            >
              <View className='review-picker'>{PRODUCT_OPTIONS[productIndex].label}</View>
            </Picker>
          </View>
          {recordFields.map(({ field, label, placeholder }) => {
            const hint = hints.fields[field]
            return (
              <View key={field} className={`review-field ${reviewClass(hint)}`}>
                <UiField
                  label={label}
                  value={String(record[field])}
                  placeholder={placeholder}
                  onValueChange={(value) => changeRecordField(field, value)}
                />
                {hintCopy(hint) ? <Text className='review-hint'>{hintCopy(hint)}</Text> : null}
              </View>
            )
          })}
          <View className={`review-field review-field--wide ${reviewClass(hints.fields.notes)}`}>
            <Text className='review-field__label'>备注</Text>
            <Textarea
              className='review-textarea'
              value={record.notes}
              placeholder='请输入备注'
              maxlength={1000}
              onInput={(event) => {
                setRecord((current) => updateRecordField(current, 'notes', event.detail.value))
                reviewPath('record.notes')
              }}
            />
            {hintCopy(hints.fields.notes) ? <Text className='review-hint'>{hintCopy(hints.fields.notes)}</Text> : null}
          </View>
        </View>
      </UiCard>

      <UiCard>
        <Text className='review-section-title'>十样本检验表</Text>
        <Text className='review-description'>横向滑动查看 1–{MEASUREMENT_COUNT} 号样本。</Text>
        {record.rows.map((row, rowIndex) => {
          const rowHints = hints.rows[rowIndex]
          return (
            <View key={row.id} className='review-row'>
              <View className='review-row__meta'>
                <View className={`review-cell-field ${reviewClass(rowHints?.item)}`}>
                  <Text className='review-cell-field__label'>检验项目</Text>
                  <Input
                    className='review-cell-input'
                    value={row.item}
                    onInput={(event) => changeRowField(rowIndex, 'item', event.detail.value)}
                  />
                  {hintCopy(rowHints?.item) ? <Text className='review-hint'>{hintCopy(rowHints?.item)}</Text> : null}
                </View>
                <View className={`review-cell-field ${reviewClass(rowHints?.requirement)}`}>
                  <Text className='review-cell-field__label'>检验要求</Text>
                  <Input
                    className='review-cell-input'
                    value={row.requirement}
                    onInput={(event) => changeRowField(rowIndex, 'requirement', event.detail.value)}
                  />
                </View>
                <View className={`review-cell-field ${reviewClass(rowHints?.specification)}`}>
                  <Text className='review-cell-field__label'>规格</Text>
                  <Input
                    className='review-cell-input'
                    value={row.specification}
                    onInput={(event) => changeRowField(rowIndex, 'specification', event.detail.value)}
                  />
                </View>
              </View>
              <ScrollView className='sample-scroll' scrollX enhanced showScrollbar={false}>
                <View className='sample-grid'>
                  {Array.from({ length: MEASUREMENT_COUNT }, (_, measurementIndex) => {
                    const hint = rowHints?.measurements[measurementIndex]
                    return (
                      <View key={`${row.id}-${measurementIndex}`} className={`sample-cell ${reviewClass(hint)}`}>
                        <Text className='sample-cell__number'>{measurementIndex + 1}</Text>
                        <Input
                          className='sample-cell__input'
                          value={row.measurements[measurementIndex] || ''}
                          onInput={(event) => changeMeasurement(rowIndex, measurementIndex, event.detail.value)}
                        />
                        {hintCopy(hint) ? <Text className='review-hint review-hint--sample'>{hintCopy(hint)}</Text> : null}
                      </View>
                    )
                  })}
                </View>
              </ScrollView>
            </View>
          )
        })}

        <View className='judgement-block'>
          <Text className='review-cell-field__label'>样本判定</Text>
          <ScrollView className='sample-scroll' scrollX enhanced showScrollbar={false}>
            <View className='sample-grid'>
              {Array.from({ length: MEASUREMENT_COUNT }, (_, sampleIndex) => {
                const hint = hints.sampleJudgements[sampleIndex]
                const value = record.sampleJudgements[sampleIndex] || ''
                return (
                  <View key={`judgement-${sampleIndex}`} className={`sample-cell judgement-cell ${reviewClass(hint)}`}>
                    <Text className='sample-cell__number'>{sampleIndex + 1}</Text>
                    <View className='judgement-options'>
                      {(['OK', 'NG', ''] as Judgement[]).map((option) => (
                        <View
                          key={option || 'empty'}
                          className={`judgement-option ${value === option ? 'is-selected' : ''}`}
                          onClick={() => changeJudgement(sampleIndex, option)}
                        >
                          {option || '—'}
                        </View>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          </ScrollView>
        </View>
      </UiCard>

      <UiCard>
        <View className='raw-heading' onClick={() => setShowRaw((visible) => !visible)}>
          <Text className='review-section-title'>识别原始返回</Text>
          <Text className='raw-heading__action'>{showRaw ? '收起' : '展开'}</Text>
        </View>
        {showRaw ? <ScrollView className='raw-content' scrollY><Text selectable>{rawContent}</Text></ScrollView> : null}
      </UiCard>
    </View>
  )
}
