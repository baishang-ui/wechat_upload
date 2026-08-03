import { View } from '@tarojs/components'

import './icon.scss'
import type { IconProps } from './types'

export function Icon({ name, size = 24, label = '' }: IconProps) {
  return (
    <View
      className={`app-icon app-icon--${name}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
    />
  )
}
