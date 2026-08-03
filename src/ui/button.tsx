import { Button } from '@tarojs/components'

import type { UiButtonProps } from './types'

export function UiButton({
  variant = 'primary',
  block = false,
  loading = false,
  disabled = false,
  className = '',
  onPress,
  children,
}: UiButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    block ? 'ui-button--block' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Button
      className={classes}
      loading={loading}
      disabled={disabled || loading}
      onClick={onPress}
    >
      {children}
    </Button>
  )
}
