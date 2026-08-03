import { View } from '@tarojs/components'

import type { UiCardProps } from './types'

export function UiCard({ className = '', children }: UiCardProps) {
  return (
    <View className={`ui-card ${className}`.trim()}>
      <View className='ui-card__body'>{children}</View>
    </View>
  )
}
