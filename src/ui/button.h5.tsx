import { Button } from '@heroui/react'

import type { ButtonVariant, UiButtonProps } from './types'

function heroVariant(variant: ButtonVariant): 'solid' | 'bordered' | 'light' {
  if (variant === 'secondary') return 'bordered'
  if (variant === 'ghost' || variant === 'danger') return 'light'
  return 'solid'
}

export function UiButton({
  variant = 'primary',
  block = false,
  loading = false,
  disabled = false,
  className = '',
  onPress,
  children,
}: UiButtonProps) {
  return (
    <Button
      color={variant === 'danger' ? 'danger' : 'primary'}
      variant={heroVariant(variant)}
      fullWidth={block}
      isLoading={loading}
      isDisabled={disabled || loading}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      onPress={onPress}
    >
      {children}
    </Button>
  )
}
